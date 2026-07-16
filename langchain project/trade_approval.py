"""
Human-in-the-loop trade approval over Telegram inline buttons.

Flow:
  1. send_approval_request(signal)  -> posts a Telegram message with Approve/Reject
     inline buttons; returns a unique token identifying this request.
  2. wait_for_approval(token)       -> long-polls Telegram for the button tap and
     returns True (approved) / False (rejected). With timeout_seconds=None it holds
     indefinitely until you respond ("hold until I respond").

Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in your .env (match whatever names
your app/core/autopilot.py already uses).

Constraints of the polling approach:
  - Telegram allows only ONE getUpdates consumer at a time, and getUpdates is
    incompatible with a webhook. If getUpdates returns HTTP 409, a webhook is set;
    remove it once with:  https://api.telegram.org/bot<TOKEN>/deleteWebhook
  - The pending approval is held in memory. If the server restarts while holding,
    the waiter is lost (the Telegram buttons remain but tapping them does nothing).
    For durability across restarts, persist pending approvals to the DB.
"""

import os
import uuid
import asyncio

import httpx

def _config():
    """Read Telegram config at CALL time, not import time.

    Reading os.getenv at module level silently yields None whenever the importer
    calls load_dotenv() *after* importing this module -- which main.py does. The
    result was a Telegram client with token None and no prompt ever sent.
    """
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        raise RuntimeError(
            "Telegram HITL not configured: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID."
        )
    return token, chat_id, f"https://api.telegram.org/bot{token}"


async def send_approval_request(signal: str) -> str:
    """Post an Approve/Reject prompt to Telegram. Returns a token to match the reply."""
    bot_token, chat_id, api = _config()
    token = uuid.uuid4().hex[:12]
    text = (
        "🛑 *Trade approval required*\n\n"
        f"Signal: *{signal}*\n"
        "Approve to place the order, or reject to skip."
    )
    keyboard = {
        "inline_keyboard": [[
            {"text": "✅ Approve", "callback_data": f"approve:{token}"},
            {"text": "❌ Reject",  "callback_data": f"reject:{token}"},
        ]]
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{api}/sendMessage", json={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "Markdown",
            "reply_markup": keyboard,
        })
        if resp.status_code != 200:
            # Surface Telegram's own error instead of failing silently.
            raise RuntimeError(f"Telegram sendMessage failed {resp.status_code}: {resp.text}")
    print(f"--- [HITL] Approval prompt sent to Telegram (token={token}) ---")
    return token


async def _answer_callback(client, api, callback_id, text):
    try:
        await client.post(f"{api}/answerCallbackQuery",
                          json={"callback_query_id": callback_id, "text": text})
    except Exception:
        pass


async def _edit_message(client, api, cq, new_text):
    """Rewrite the original prompt after a decision, removing the buttons."""
    try:
        msg = cq.get("message", {})
        await client.post(f"{api}/editMessageText", json={
            "chat_id": msg.get("chat", {}).get("id"),
            "message_id": msg.get("message_id"),
            "text": new_text,
            "parse_mode": "Markdown",
        })
    except Exception:
        pass


async def wait_for_approval(token: str, timeout_seconds=None, poll_seconds: int = 50) -> bool:
    """Long-poll Telegram for the Approve/Reject tap matching `token`.

    Returns True (approved) / False (rejected). If timeout_seconds is None, waits
    forever; otherwise raises asyncio.TimeoutError once exceeded.
    """
    _bot_token, _chat_id, api = _config()
    approve_data = f"approve:{token}"
    reject_data = f"reject:{token}"
    offset = None
    waited = 0.0

    async with httpx.AsyncClient(timeout=poll_seconds + 10) as client:
        while True:
            payload = {"timeout": poll_seconds, "allowed_updates": ["callback_query"]}
            if offset is not None:
                payload["offset"] = offset
            try:
                r = await client.post(f"{api}/getUpdates", json=payload)
                body = r.json()
                if not body.get("ok"):
                    # 409 = a webhook is set; getUpdates and webhooks are mutually
                    # exclusive. Clear it once: <api>/deleteWebhook
                    print(f"--- [HITL] getUpdates error: {body} ---")
                    await asyncio.sleep(3)
                    continue
                updates = body.get("result", [])
            except Exception as e:
                print(f"--- [HITL] poll error: {e} ---")
                await asyncio.sleep(3)
                continue

            for upd in updates:
                offset = upd["update_id"] + 1  # confirm so Telegram won't resend it
                cq = upd.get("callback_query")
                if not cq:
                    continue
                data = cq.get("data", "")
                if data == approve_data:
                    await _answer_callback(client, api, cq["id"], "Approved ✅")
                    await _edit_message(client, api, cq, f"✅ *Approved* — placing order for {token}.")
                    return True
                if data == reject_data:
                    await _answer_callback(client, api, cq["id"], "Rejected ❌")
                    await _edit_message(client, api, cq, f"🚫 *Rejected* — {token} skipped.")
                    return False

            if timeout_seconds is not None:
                waited += poll_seconds
                if waited >= timeout_seconds:
                    raise asyncio.TimeoutError("No approval received in time")