"""
Isolated HITL test. Sends ONE Telegram approval prompt and waits for your tap.

Bypasses the signal check, the scheduler, ICICI, and the DB entirely -- so if the
buttons appear, HITL works and any problem is upstream (signal / scheduler).

Run:  python test_approval.py
"""

import os
import asyncio

from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

# Import AFTER load_dotenv, or module-level os.getenv reads None.
from app.core.trade_approval import send_approval_request, wait_for_approval


async def main():
    tok = os.getenv("TELEGRAM_BOT_TOKEN")
    chat = os.getenv("TELEGRAM_CHAT_ID")
    print(f"TELEGRAM_BOT_TOKEN: {'SET (' + tok[:8] + '...)' if tok else 'MISSING'}")
    print(f"TELEGRAM_CHAT_ID  : {chat or 'MISSING'}")
    if not tok or not chat:
        print("\n-> Fix .env first. Both are required.")
        return

    print("\nSending approval request...")
    token = await send_approval_request("TEST-Green (not a real trade)")
    print(f"Sent. token={token}")
    print("Check Telegram now. Waiting up to 120s for your tap...\n")

    try:
        approved = await wait_for_approval(token, timeout_seconds=120)
    except asyncio.TimeoutError:
        print("TIMEOUT - no tap received. Did the message arrive at all?")
        return

    print("APPROVED" if approved else "REJECTED")
    print("\nHITL works. If the real job still sends nothing, the problem is upstream:")
    print("  - get_today_signal() returned None (no row for today in signals.csv), or")
    print("  - daily_trade_job never fired (scheduler / trigger).")


if __name__ == "__main__":
    asyncio.run(main())