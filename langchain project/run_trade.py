"""
Cloud entry point for the daily options-selling trade.

Runs ONLY the trade job, then exits. Deliberately does NOT start FastAPI, the MCP
client, or the agent graph -- the trade path needs none of them, and starting a
web server in CI means the runner blocks until GitHub's 6-hour timeout.

Used by .github/workflows/trade.yml. Locally, main.py still owns the scheduler.
"""

import asyncio

from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

from app.db.database import init_db
from trading import daily_trade_job


async def main():
    init_db()          # ensure trade tables exist on a fresh runner
    await daily_trade_job()


if __name__ == "__main__":
    asyncio.run(main())