import os
import json
import uuid
import asyncio
from typing import Annotated, Literal, TypedDict
from contextlib import asynccontextmanager

from dotenv import load_dotenv, find_dotenv
from fastapi import FastAPI, Request
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from app.core.autopilot import send_telegram_msg, get_breeze_token

# Trading Services (Internal Modules)
from app.db.database import init_db, db_session
from app.brokers.icici_breeze import ICICIBreezeClient
from app.core.mock_broker import MockBroker
from app.core.signal_service import SignalService
from app.core.strategy_service import StrategyService

# AI / LangChain / LangGraph
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langchain_mcp_adapters.client import MultiServerMCPClient
from app.db.database import DB_PATH

# Load environment variables from .env
load_dotenv(find_dotenv())

# --- GLOBAL OBJECTS ---
app_graph = None
db_saver = None
mcp_client = None
llm = None
llm_with_tools = None
mcp_tools = []

# --- TRADING SERVICE INITIALIZATION ---
breeze_client = ICICIBreezeClient()
# MockBroker uses the global db_session
mock_broker = MockBroker(db_session, breeze_client) 
signal_svc = SignalService()
strategy_svc = StrategyService(mock_broker, breeze_client)


DEFAULT_THREAD_ID = "market_analyst_session"

# --- LANGGRAPH STATE DEFINITION ---
class GraphState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    route: str
    validation_status: str
    retry_count: int
    final_answer: str

# --- BACKGROUND TRADING TASK ---
from app.core.autopilot import get_breeze_token, send_telegram_msg

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
        # We wrap this in a try to catch invalid/expired tokens immediately
        try:
            breeze_client.breeze.generate_session(api_secret=os.getenv("ICICI_SECRET_KEY"), session_token=session_token)
            print("--- [AUTH] ICICI Breeze Session successfully initialized ---")
        except Exception as auth_err:
            send_telegram_msg(f"❌ ICICI Session Error: {str(auth_err)}")
            return
        
        # 3. Signal Check & Execution
        # Ensure signal_svc is correctly initialized in the global scope
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    global app_graph, db_saver, mcp_client, llm, llm_with_tools, mcp_tools

    print("--- STARTING UP FASTAPI & TRADING ENGINE ---")

    # Import the centralized DB_PATH from your database.py
    from app.db.database import DB_PATH, init_db
    
    # Initialize the Trading Tables in SQLite
    init_db()

    # Start the Trading Scheduler
    scheduler = AsyncIOScheduler()
    # Ensure timezone is specified if running on a remote server (e.g., timezone='Asia/Kolkata')
    scheduler.add_job(daily_trade_job, 'cron', day_of_week='mon-fri', hour=9, minute=15)  # 9:15 AM IST is 3:46 AM UTC, adjust as needed
    scheduler.start()

    # Temporary test trigger
    scheduler.add_job(daily_trade_job, 'date')

# 2. Setup AI Infrastructure (Groq + LangGraph + MCP)
    async with AsyncSqliteSaver.from_conn_string(DB_PATH) as saver:
        db_saver = saver
        await db_saver.setup()

        groq_key = os.getenv("GROQ_API_KEY")
        llm = ChatGroq(
            model_name="llama-3.3-70b-versatile",
            temperature=0,
            api_key=groq_key
        )

        try:
            mcp_client = MultiServerMCPClient({
                "market_tools": {
                    "transport": "sse",
                   "url": "http://127.0.0.1:8000/sse"  # <--- Change this from 9001 to 8000
                }
            })

            mcp_tools = await mcp_client.get_tools()
            print(f"--- LOADED {len(mcp_tools)} MCP TOOLS ---")
        except Exception as e:
            print(f"--- MCP LOAD FAILED: {e} ---")
            mcp_tools = []

        if not mcp_tools:
            print("--- WARNING: No MCP tools loaded. AI features will be limited, but trading will continue. ---")
        else:
            llm_with_tools = llm.bind_tools(mcp_tools)


        def router_node(state: GraphState):
            messages = state.get("messages", [])
            user_text = ""

            for msg in reversed(messages):
                if getattr(msg, "type", "") == "human":
                    user_text = msg.content if isinstance(msg.content, str) else str(msg.content)
                    break

            lowered = user_text.lower()

            if any(word in lowered for word in ["internal", "records", "document", "faiss", "local", "history", "database", "db", "verify", "logged", "trade log"]):
                route = "local"
            elif any(word in lowered for word in ["latest", "news", "today", "current", "market reaction", "web"]):
                route = "web"
            elif any(word in lowered for word in ["compare", "versus", "vs", "both", "internal and web"]):
                route = "hybrid"
            else:
                route = "general"

            return {
                "route": route,
                "retry_count": state.get("retry_count", 0),
                "validation_status": "pending"
            }

        async def agent_node(state: GraphState):
            route = state.get("route", "general")
            messages = state.get("messages", [])

            routing_instruction = {
                "local": "Prefer the MCP tool for local corporate records first.",
                "web": "Prefer the MCP web search tool first.",
                "hybrid": "Use both local corporate records and web search if needed.",
                "general": "Use MCP tools whenever factual lookup is needed."
            }.get(route, "Use MCP tools whenever factual lookup is needed.")

            system_prompt = f"""You are a Market Analyst.
The current year is 2026. 

When users ask about "today" or "April 17", use the year 2026.
Format dates for tools as DD-MM-YYYY (e.g., 17-04-2026).

ROUTING GUIDANCE:
{routing_instruction}

TOOLS AVAILABLE:
- mcp_read_signals_csv: Use this for Green/Red signal lookups.
- mcp_get_trade_history: Use this to check memory.db for executed trades.
- mcp_search_corporate_records: Use for internal Accenture/market docs.
- mcp_search_the_web: Use for live news.

RULES:
- When asked to "verify", "check history", or "check database", you MUST use the mcp_get_trade_history tool.
- Do not apologize for missing data until you have actually called the tool and received an empty result.
- Always use your MCP tools when factual lookup is needed.
- If the question is about Accenture Q2 2026, ensure you mention $18.0B revenue or $22.1B bookings if supported by retrieved context.
- Keep answers concise, factual, and useful.
"""
            # Check if tools loaded, otherwise fallback to base model
            active_llm = llm_with_tools if llm_with_tools is not None else llm

            if llm_with_tools is None:
                print("--- [AI] WARNING: MCP tools not loaded. Answering without tools. ---")

            response = await active_llm.ainvoke(
                [SystemMessage(content=system_prompt)] + messages
            )

            return {"messages": [response]}

        tool_node = ToolNode(mcp_tools)

        def validator_node(state: GraphState):
            messages = state.get("messages", [])
            retry_count = state.get("retry_count", 0)

            last_ai = None
            last_tool = None

            for msg in reversed(messages):
                if last_tool is None and getattr(msg, "type", "") == "tool":
                    last_tool = msg
                if last_ai is None and getattr(msg, "type", "") == "ai":
                    last_ai = msg
                if last_ai and last_tool:
                    break

            tool_text = ""
            if last_tool and getattr(last_tool, "content", None):
                tool_text = last_tool.content if isinstance(last_tool.content, str) else str(last_tool.content)

            ai_text = ""
            if last_ai and getattr(last_ai, "content", None):
                ai_text = last_ai.content if isinstance(last_ai.content, str) else str(last_ai.content)

            weak_markers = [
                "No local records found",
                "No web results returned",
                "Error searching local records",
                "Error searching the web",
                "[Server error"
            ]

            if any(marker.lower() in tool_text.lower() for marker in weak_markers):
                if retry_count < 1:
                    return {
                        "validation_status": "retry",
                        "retry_count": retry_count + 1
                    }
                return {
                    "validation_status": "fallback",
                    "retry_count": retry_count
                }

            if not tool_text and not ai_text:
                return {
                    "validation_status": "retry" if retry_count < 1 else "fallback",
                    "retry_count": retry_count + 1 if retry_count < 1 else retry_count
                }

            return {
                "validation_status": "ok",
                "retry_count": retry_count
            }

        async def writer_node(state: GraphState):
            messages = state.get("messages", [])

            writer_prompt = """You are a senior market analyst.
Write the final answer for the user using the available retrieved context.

RULES:
- Do not mention internal tool mechanics.
- Be concise, direct, and professional.
- If the question is about Accenture Q2 2026 and the context supports it, mention $18.0B revenue or $22.1B bookings.
- If retrieval was weak, answer carefully and say what is missing.
"""

            response = await llm.ainvoke(
                [SystemMessage(content=writer_prompt)] + messages + [
                    HumanMessage(content="Write the final user-facing answer now.")
                ]
            )

            return {
                "messages": [response],
                "final_answer": response.content if isinstance(response.content, str) else str(response.content)
            }

        def route_after_agent(state: GraphState) -> Literal["tools", "validator"]:
            result = tools_condition(state)
            if result == "tools":
                return "tools"
            return "validator"

        def route_after_validator(state: GraphState) -> Literal["agent", "writer"]:
            status = state.get("validation_status", "ok")
            if status in ["retry", "fallback"]:
                return "agent"
            return "writer"

        graph_builder = StateGraph(GraphState)

        graph_builder.add_node("router", router_node)
        graph_builder.add_node("agent", agent_node)
        graph_builder.add_node("tools", tool_node)
        graph_builder.add_node("validator", validator_node)
        graph_builder.add_node("writer", writer_node)

        graph_builder.add_edge(START, "router")
        graph_builder.add_edge("router", "agent")

        graph_builder.add_conditional_edges(
            "agent",
            route_after_agent,
            {
                "tools": "tools",
                "validator": "validator",
            },
        )

        graph_builder.add_edge("tools", "validator")

        graph_builder.add_conditional_edges(
            "validator",
            route_after_validator,
            {
                "agent": "agent",
                "writer": "writer",
            },
        )

        graph_builder.add_edge("writer", END)

        app_graph = graph_builder.compile(checkpointer=db_saver)

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


@app.get("/chat/history")
async def get_history(thread_id: str = DEFAULT_THREAD_ID):
    config = {"configurable": {"thread_id": thread_id}}
    state_snapshot = await app_graph.aget_state(config)

    if not state_snapshot or not state_snapshot.values:
        return {"history": [], "thread_id": thread_id}

    raw_messages = state_snapshot.values.get("messages", [])
    formatted = []

    for msg in raw_messages:
        if hasattr(msg, "type") and msg.type in ["human", "ai"]:
            if msg.content:
                formatted.append({
                    "role": "user" if msg.type == "human" else "ai",
                    "text": msg.content if isinstance(msg.content, str) else str(msg.content)
                })

    return {"history": formatted, "thread_id": thread_id}


@app.delete("/chat/history")
async def clear_history(thread_id: str = DEFAULT_THREAD_ID):
    # Optional: If you want to physically delete the records from memory.db
    # you would execute a SQL query here. 
    # But generating a new ID is safer for LangGraph logic:
    
    new_thread_id = f"market_analyst_session_{uuid.uuid4().hex[:8]}"
    
    # We return the NEW id. The frontend must switch to this immediately.
    return {
        "status": "ok", 
        "message": "New session started", 
        "thread_id": new_thread_id
    }


@app.post("/chat/stream")
async def chat_stream(request: Request):
    body = await request.json()
    user_message = (body.get("message") or "").strip()
    thread_id = body.get("thread_id") or DEFAULT_THREAD_ID

    if not user_message:
        async def empty_gen():
            yield f"data: {json.dumps({'text': '[Empty message]'})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(empty_gen(), media_type="text/event-stream")

    config = {"configurable": {"thread_id": thread_id}}

    async def event_generator():
        try:
            tool_progress_map = {
                "mcp_search_the_web": [
                    (10, "Initializing Tavily search engine..."),
                    (30, "Sending query to the web..."),
                    (70, "Analyzing search results..."),
                    (90, "Preparing response..."),
                ],
                "mcp_search_corporate_records": [
                    (10, "Opening FAISS index..."),
                    (50, "Searching internal records..."),
                    (90, "Retrieving documents..."),
                ],
                "mcp_read_signals_csv": [
                    (20, "Reading signals.csv..."),
                    (70, "Parsing candle data..."),
                ],
                "mcp_get_trade_history": [
                    (20, "Connecting to memory.db..."),
                    (70, "Querying trade history..."),
                ],
            }

            async for event in app_graph.astream_events(
                {"messages": [HumanMessage(content=user_message)]},
                config,
                version="v2",
            ):
                kind = event.get("event")
                name = event.get("name", "")

                # ── Tool starts → emit fake progress ticks ──────────────
                if kind == "on_tool_start":
                    steps = tool_progress_map.get(name, [(20, f"Running {name}...")])
                    for pct, msg in steps:
                        yield f"data: {json.dumps({'progress_percentage': pct, 'message': msg})}\n\n"
                        await asyncio.sleep(0.3)   # small delay so UI animates

                # ── Tool ends → 100 % on that tool ──────────────────────
                elif kind == "on_tool_end":
                    yield f"data: {json.dumps({'progress_percentage': 100, 'message': f'{name} complete.'})}\n\n"

                # ── LLM streams a text chunk ─────────────────────────────
                elif kind == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content"):
                        content = chunk.content
                        if isinstance(content, str) and content:
                            yield f"data: {json.dumps({'text': content})}\n\n"
                        elif isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    text = block.get("text", "")
                                    if text:
                                        yield f"data: {json.dumps({'text': text})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'text': f'[Server error: {str(e)}]'})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # critical for nginx proxies
        },
    )

# add to main.py — surfaces the ToolMessages /chat/history drops
@app.get("/chat/debug_state")
async def debug_state(thread_id: str):
    snap = await app_graph.aget_state({"configurable": {"thread_id": thread_id}})
    msgs = snap.values.get("messages", []) if snap and snap.values else []
    return {"messages": [
        {"type": m.type,
         "content": m.content,
         "tool_calls": getattr(m, "tool_calls", None)}  # args + names, in order
        for m in msgs
    ]}

    
if __name__ == "__main__":
    import uvicorn
    
    # Check if running in GitHub Cloud or Local
    is_cloud = os.getenv("GITHUB_ACTIONS") == "true"
    
    # Force Port 8001 to match your React API_BASE
    uvicorn.run(
        "main:app", 
        host="0.0.0.0" if is_cloud else "127.0.0.1", 
        port=8001, 
        reload=not is_cloud
    )