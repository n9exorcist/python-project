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
        # 1. Session Token Acquisition (Hybrid Logic)
        # First, try to grab the manual token from GitHub Secrets/Env
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

        # 2. Initialize ICICI Breeze Session
        try:
            breeze_client.breeze.generate_session(
                api_secret=os.getenv("ICICI_SECRET_KEY"), session_token=session_token
            )
            print("--- [AUTH] ICICI Breeze Session successfully initialized ---")
        except Exception as auth_err:
            send_telegram_msg(f"❌ ICICI Session Error: {str(auth_err)}")
            return

        # 3. Signal Check & Execution
        signal = signal_svc.get_today_signal()

        if signal:
            print(f"--- [SIGNAL] Today's Signal: {signal} ---")
            status = strategy_svc.execute_logic(signal)

            # Commit the trade to your SQLite memory.db
            db_session.commit()

            success_msg = f"🚀 Trade Executed!\nSignal: {signal}\nStatus: {status}"
            print(success_msg)
            send_telegram_msg(success_msg)
        else:
            idle_msg = "🌙 No Options Selling signal for today. System remains in standby."
            print(idle_msg)
            send_telegram_msg(idle_msg)

    except Exception as e:
        # Safety first: Rollback any partial DB writes if execution fails
        db_session.rollback()
        error_report = f"⚠️ Scheduler Error: {str(e)}"
        print(error_report)
        send_telegram_msg(error_report)
    finally:
        # Clean up the scoped session to prevent memory leaks in the background thread
        db_session.remove()
        print("--- [SCHEDULER] Job Cycle Complete ---")