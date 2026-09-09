"""
Trading layer: service instances + the daily options-selling job.

This is the EXECUTION path (daily_trade_job -> execute_logic), separate from the
chat graph. The human-in-the-loop Telegram approval lives here, because this is
where a real order actually fires.

Two callers:
  - main.py  : APScheduler fires it locally (approval holds indefinitely)
  - run_trade.py : the GitHub Actions job (approval is time-bounded, see below)
"""

import os
import asyncio
from datetime import datetime, time as _time
from zoneinfo import ZoneInfo

from app.db.database import db_session
from app.brokers.icici_breeze import ICICIBreezeClient
from app.core.mock_broker import MockBroker
from app.core.signal_service import SignalService
from app.core.strategy_service import StrategyService
from app.core.autopilot import get_breeze_token, send_telegram_msg
from app.core.trade_approval import send_approval_request, wait_for_approval

# --- TRADING SERVICE INITIALIZATION ---
breeze_client = ICICIBreezeClient()
mock_broker = MockBroker(db_session, breeze_client)   # MockBroker uses the global db_session
signal_svc = SignalService()
strategy_svc = StrategyService(mock_broker, breeze_client)

# How long to wait for the Telegram tap.
#   Locally  : None = hold indefinitely (you're at the machine).
#   In CI    : bounded, so the job can't camp on a GitHub runner until the 6-hour
#              limit and burn the Actions quota. No tap -> no trade (safe default).
IS_CI = os.getenv("GITHUB_ACTIONS") == "true"
APPROVAL_TIMEOUT = int(os.getenv("APPROVAL_TIMEOUT_SECONDS", "900")) if IS_CI else None

# --- How late is too late --------------------------------------------------
# This job is scheduled for 09:15 IST because the strategy is an entry at the
# open. It runs on GitHub's `schedule` event, which is best-effort: on
# 2026-09-09 run #118 was cron'd for 03:45 UTC and started at 08:23 UTC, so the
# approval prompt reached Telegram at 13:53 IST -- four hours and thirty-eight
# minutes after the moment it was priced for. The prompt said only
# "Signal: Green", which is exactly what it says when it is on time.
#
# Nothing was placed (the 15-minute CI timeout expired and it skipped), but the
# failure mode was one tap wide: approving that prompt would have sold options
# sized on a signal computed for an open that was long gone.
#
# So the job now knows what time it was supposed to run, and refuses to ask a
# question it can no longer stand behind. Within the window it still asks, but
# it says how late it is -- a decision made with the delay visible is a
# different decision from one made without it.
TRADE_SLOT_IST = os.getenv("TRADE_SLOT_IST", "09:15")
TRADE_MAX_LATENESS_MIN = int(os.getenv("TRADE_MAX_LATENESS_MIN", "90"))
TZ_IST = "Asia/Kolkata"


def _lateness_minutes() -> int:
    """Minutes between the intended slot today and now, in IST. Never negative."""
    try:
        hh, mm = (int(x) for x in TRADE_SLOT_IST.split(":"))
    except ValueError:
        return 0
    now = datetime.now(ZoneInfo(TZ_IST))
    slot = datetime.combine(now.date(), _time(hh, mm), tzinfo=ZoneInfo(TZ_IST))
    return max(0, int((now - slot).total_seconds() // 60))


def _late_phrase(mins: int) -> str:
    return f"{mins // 60}h{mins % 60:02d}m" if mins >= 60 else f"{mins}m"


async def daily_trade_job():
    print("--- [TRADE] Running Options Selling Strategy ---")
    from app.db.database import db_session

    try:
        # 1. Signal check FIRST (cheap, local) - no point authenticating on a flat day.
        signal = signal_svc.get_today_signal()
        if not signal:
            idle_msg = "No Options Selling signal for today. System remains in standby."
            print(idle_msg)
            send_telegram_msg(idle_msg)
            return

        # 1b. Refuse to ask a stale question. A prompt that arrives hours after
        #     the open looks identical to one that arrives on time, and the tap
        #     that answers it is the tap that places the order.
        late = _lateness_minutes()
        if late > TRADE_MAX_LATENESS_MIN:
            msg = (
                f"Trade skipped — this run started {_late_phrase(late)} after its "
                f"{TRADE_SLOT_IST} IST slot, and the {signal} signal is priced for "
                f"the open. Not asking for approval on a stale entry. "
                f"Dispatch the workflow by hand if you still want it."
            )
            print(msg)
            send_telegram_msg(msg)
            return

        print(f"--- [SIGNAL] Today's Signal: {signal} - requesting approval "
              f"({_late_phrase(late)} after the slot) ---")

        # 2. HUMAN-IN-THE-LOOP: send Approve/Reject buttons and wait for the tap.
        #    The prompt carries the delay, so lateness is part of what you are
        #    approving rather than something you have to notice.
        detail = signal if late <= 5 else f"{signal} · {_late_phrase(late)} late"
        token = await send_approval_request(detail)
        try:
            approved = await wait_for_approval(token, timeout_seconds=APPROVAL_TIMEOUT)
        except asyncio.TimeoutError:
            mins = (APPROVAL_TIMEOUT or 0) // 60
            timeout_msg = f"No approval within {mins} min - trade skipped for safety."
            print(timeout_msg)
            send_telegram_msg(timeout_msg)
            return

        if not approved:
            msg = f"Trade rejected. Signal {signal} was skipped."
            print(msg)
            send_telegram_msg(msg)
            return

        print("--- [APPROVAL] Approved - proceeding to execute. ---")

        # 3. ICICI session, acquired AFTER approval so the token is fresh at execution.
        session_token = os.getenv("ICICI_SESSION_TOKEN")
        if session_token:
            print(f"--- [AUTH] Using manual session token: {session_token[:5]}*** ---")
        else:
            print("--- [AUTH] No manual token found. Attempting automated cloud login... ---")
            session_token = await get_breeze_token()

        if not session_token:
            error_msg = "ICICI Login Failed: No session token available (Cloud IP may be blocked)."
            print(error_msg)
            send_telegram_msg(error_msg)
            return

        try:
            breeze_client.breeze.generate_session(
                api_secret=os.getenv("ICICI_SECRET_KEY"), session_token=session_token
            )
            print("--- [AUTH] ICICI Breeze Session successfully initialized ---")
        except Exception as auth_err:
            send_telegram_msg(f"ICICI Session Error: {str(auth_err)}")
            return

        # 4. Execute the approved trade.
        status = strategy_svc.execute_logic(signal)
        db_session.commit()
        success_msg = f"Trade Executed (approved)!\nSignal: {signal}\nStatus: {status}"
        print(success_msg)
        send_telegram_msg(success_msg)

    except Exception as e:
        # Safety first: roll back any partial DB writes if execution fails.
        db_session.rollback()
        error_report = f"Trade Job Error: {str(e)}"
        print(error_report)
        send_telegram_msg(error_report)
    finally:
        # Clean up the scoped session to prevent memory leaks in the background thread.
        db_session.remove()
        print("--- [TRADE] Job Cycle Complete ---")