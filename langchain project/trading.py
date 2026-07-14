"""
Trading layer: service instances + the scheduled daily options-selling job.

This is the SCHEDULER path (APScheduler -> daily_trade_job -> execute_logic),
which is separate from the chat graph. HITL/approval work (item C) attaches here,
not in the graph, because this is where a real order actually fires.
"""

import os

from app.db.database import db_session
from app.brokers.icici_breeze import ICICIBreezeClient
from app.core.mock_broker import MockBroker
from app.core.signal_service import SignalService
from app.core.strategy_service import StrategyService
from app.core.autopilot import get_breeze_token, send_telegram_msg

# --- TRADING SERVICE INITIALIZATION ---
breeze_client = ICICIBreezeClient()
mock_broker = MockBroker(db_session, breeze_client)   # MockBroker uses the global db_session
signal_svc = SignalService()
strategy_svc = StrategyService(mock_broker, breeze_client)

async def daily_trade_job():
    print("--- [SCHEDULER] 9:15 AM: Running Options Selling Strategy ---")
    from app.db.database import db_session

    try:
        # 1. Signal check FIRST (cheap, local) — no point authenticating on a flat day.
        signal = signal_svc.get_today_signal()
        if not signal:
            idle_msg = "🌙 No Options Selling signal for today. System remains in standby."
            print(idle_msg)
            send_telegram_msg(idle_msg)
            return

        print(f"--- [SIGNAL] Today's Signal: {signal} — requesting approval ---")

        # 2. HUMAN-IN-THE-LOOP: send Approve/Reject buttons and HOLD until you respond.
        token = await send_approval_request(signal)
        approved = await wait_for_approval(token, timeout_seconds=None)  # None = hold forever

        if not approved:
            msg = f"🚫 Trade rejected. Signal {signal} was skipped."
            print(msg)
            send_telegram_msg(msg)
            return

        print("--- [APPROVAL] Approved — proceeding to execute. ---")

        # 3. ICICI session, acquired AFTER approval so the token is fresh at execution.
        session_token = os.getenv("ICICI_SESSION_TOKEN")
        if session_token:
            print(f"--- [AUTH] Using manual session token: {session_token[:5]}*** ---")
        else:
            print("--- [AUTH] No manual token found. Attempting automated cloud login... ---")
            session_token = await get_breeze_token()

        if not session_token:
            error_msg = "❌ ICICI Login Failed: No session token available (Cloud IP may be blocked)."
            print(error_msg)
            send_telegram_msg(error_msg)
            return

        try:
            breeze_client.breeze.generate_session(
                api_secret=os.getenv("ICICI_SECRET_KEY"), session_token=session_token
            )
            print("--- [AUTH] ICICI Breeze Session successfully initialized ---")
        except Exception as auth_err:
            send_telegram_msg(f"❌ ICICI Session Error: {str(auth_err)}")
            return

        # 4. Execute the approved trade.
        status = strategy_svc.execute_logic(signal)
        db_session.commit()
        success_msg = f"🚀 Trade Executed (approved)!\nSignal: {signal}\nStatus: {status}"
        print(success_msg)
        send_telegram_msg(success_msg)

    except Exception as e:
        db_session.rollback()
        error_report = f"⚠️ Scheduler Error: {str(e)}"
        print(error_report)
        send_telegram_msg(error_report)
    finally:
        db_session.remove()
        print("--- [SCHEDULER] Job Cycle Complete ---")
