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

TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
API = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"


def _require_config():
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        raise RuntimeError(
            "Telegram HITL not configured: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID."
        )


async def send_approval_request(signal: str) -> str:
    """Post an Approve/Reject prompt to Telegram. Returns a token to match the reply."""
    _require_config()
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
        await client.post(f"{API}/sendMessage", json={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text,
            "parse_mode": "Markdown",
            "reply_markup": keyboard,
        })
    return token


async def _answer_callback(client, callback_id, text):
    try:
        await client.post(f"{API}/answerCallbackQuery",
                          json={"callback_query_id": callback_id, "text": text})
    except Exception:
        pass


async def _edit_message(client, cq, new_text):
    """Rewrite the original prompt after a decision, removing the buttons."""
    try:
        msg = cq.get("message", {})
        await client.post(f"{API}/editMessageText", json={
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
    _require_config()
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
                r = await client.post(f"{API}/getUpdates", json=payload)
                updates = r.json().get("result", [])
            except Exception:
                await asyncio.sleep(3)
                continue

            for upd in updates:
                offset = upd["update_id"] + 1  # confirm so Telegram won't resend it
                cq = upd.get("callback_query")
                if not cq:
                    continue
                data = cq.get("data", "")
                if data == approve_data:
                    await _answer_callback(client, cq["id"], "Approved ✅")
                    await _edit_message(client, cq, f"✅ *Approved* — placing order for {token}.")
                    return True
                if data == reject_data:
                    await _answer_callback(client, cq["id"], "Rejected ❌")
                    await _edit_message(client, cq, f"🚫 *Rejected* — {token} skipped.")
                    return False

            if timeout_seconds is not None:
                waited += poll_seconds
                if waited >= timeout_seconds:
                    raise asyncio.TimeoutError("No approval received in time")