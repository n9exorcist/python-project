"""
FastAPI app entry point.

Startup orchestration only: initialize the DB, start the trading scheduler, set
up the LLM + MCP tools, build the supervisor agent graph, and store it on
app.state for the routes. The graph lives in agents.py, the trading job in
trading.py, and the endpoints in routes.py.
"""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv, find_dotenv

# MUST run before the local imports below: trade_approval (via trading) reads
# TELEGRAM_* at import time, so loading .env afterwards leaves them None.
load_dotenv(find_dotenv())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from langchain_groq import ChatGroq
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langchain_mcp_adapters.client import MultiServerMCPClient

from app.db.database import DB_PATH, init_db
from agents import build_supervisor_graph
from observability import obs_handler
from trading import daily_trade_job
from routes import router
from swing_routes import router as swing_router

MCP_SSE_URL = "http://127.0.0.1:8000/sse"


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("--- STARTING UP FASTAPI & TRADING ENGINE ---")

    # 1. Trading tables
    init_db()

    # 2. Trading scheduler (9:15 AM IST weekdays)
    scheduler = AsyncIOScheduler()
    scheduler.add_job(daily_trade_job, "cron", day_of_week="mon-fri", hour=9, minute=15)
    # Temporary test trigger - fires daily_trade_job once on every startup.
    # With HITL enabled it sends a Telegram approval prompt and HOLDS until you
    # respond, so comment this out during eval runs / normal restarts.
    scheduler.add_job(daily_trade_job, "date")
    scheduler.start()

    # 3. AI infrastructure (Groq + LangGraph + MCP), then build the supervisor graph
    mcp_client = None
    async with AsyncSqliteSaver.from_conn_string(DB_PATH) as saver:
        await saver.setup()

        llm = ChatGroq(
            model_name="llama-3.3-70b-versatile",
            temperature=0,
            api_key=os.getenv("GROQ_API_KEY"),
            # Attached to the LLM itself, not just the request config, so calls made
            # by any caller (including LangGraph Studio) count toward the daily total.
            callbacks=[obs_handler],
        )

        mcp_tools = []
        try:
            mcp_client = MultiServerMCPClient({
                "market_tools": {"transport": "sse", "url": MCP_SSE_URL}
            })
            mcp_tools = await mcp_client.get_tools()
            print(f"--- LOADED {len(mcp_tools)} MCP TOOLS ---")
        except Exception as e:
            print(f"--- MCP LOAD FAILED: {e} ---")

        if not mcp_tools:
            print("--- WARNING: No MCP tools loaded. AI features limited, but trading continues. ---")

        # The supervisor binds tool subsets internally, so it takes mcp_tools directly
        # (no llm_with_tools needed). Handed to the routes via app.state.
        app.state.app_graph = build_supervisor_graph(llm, mcp_tools, saver, use_llm_guard=False)
        print("--- SUPERVISOR GRAPH READY ---")

        yield

        print("--- SHUTTING DOWN ---")
        scheduler.shutdown()
        if mcp_client and hasattr(mcp_client, "close"):
            await mcp_client.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
# Read-only view over the swing agent's tables. Its scheduler runs as a separate
# process (jobs.py); these endpoints only read what that process has written.
app.include_router(swing_router)


if __name__ == "__main__":
    import uvicorn

    is_cloud = os.getenv("GITHUB_ACTIONS") == "true"
    uvicorn.run(
        "main:app",
        host="0.0.0.0" if is_cloud else "127.0.0.1",
        port=8001,
        reload=not is_cloud,
    )