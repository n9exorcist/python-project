import os
import json
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv, find_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from langchain_groq import ChatGroq
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langchain_mcp_adapters.client import MultiServerMCPClient

load_dotenv(find_dotenv())

app_graph = None
db_saver = None
mcp_client = None

DB_PATH = "memory.db"
THREAD_ID = "market_analyst_session"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global app_graph, db_saver, mcp_client

    print("--- STARTING UP FASTAPI ---")

    async with AsyncSqliteSaver.from_conn_string(DB_PATH) as saver:
        db_saver = saver
        await db_saver.setup()

        groq_key = os.getenv("GROQ_API_KEY")
        llm = ChatGroq(
            model_name="llama-3.3-70b-versatile",
            temperature=0,
            api_key=groq_key
        )

        mcp_tools = []

        try:
            mcp_client = MultiServerMCPClient({
                "market_tools": {
                    "transport": "sse",
                    "url": "http://127.0.0.1:8000/sse"
                }
            })

            mcp_tools = await mcp_client.get_tools()
            print(f"--- LOADED {len(mcp_tools)} MCP TOOLS ---")
        except Exception as e:
            print(f"--- MCP LOAD FAILED: {e} ---")
            mcp_tools = []

        if not mcp_tools:
            raise RuntimeError("No MCP tools loaded. Please start mcp_server.py first.")

        system_prompt = """You are a Market Analyst.
Synthesize earthly corporate data with the divine wisdom of Market Cycles.
Always use your MCP tools to gather facts before answering.
If the question is about Accenture Q2 2026, ensure you mention $18.0B revenue or $22.1B bookings."""

        app_graph = create_react_agent(
            llm,
            tools=mcp_tools,
            prompt=system_prompt,
            checkpointer=db_saver
        )

        yield

        print("--- SHUTTING DOWN ---")
        if mcp_client and hasattr(mcp_client, "close"):
            await mcp_client.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/chat/history")
async def get_history():
    global THREAD_ID

    config = {"configurable": {"thread_id": THREAD_ID}}
    state_snapshot = await app_graph.aget_state(config)

    if not state_snapshot or not state_snapshot.values:
        return {"history": []}

    raw_messages = state_snapshot.values.get("messages", [])
    formatted = []

    for msg in raw_messages:
        if hasattr(msg, "type") and msg.type in ["human", "ai"]:
            if msg.content:
                formatted.append({
                    "role": "user" if msg.type == "human" else "ai",
                    "text": msg.content if isinstance(msg.content, str) else str(msg.content)
                })

    return {"history": formatted}


@app.delete("/chat/history")
async def clear_history():
    global THREAD_ID
    THREAD_ID = f"market_analyst_session_{uuid.uuid4().hex[:8]}"
    return {"status": "ok", "message": "Started a new thread history"}


@app.post("/chat/stream")
async def chat_stream(request: Request):
    global THREAD_ID

    body = await request.json()
    user_message = (body.get("message") or "").strip()

    if not user_message:
        async def empty_gen():
            yield f"data: {json.dumps({'text': '[Empty message]'})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(empty_gen(), media_type="text/event-stream")

    config = {"configurable": {"thread_id": THREAD_ID}}

    async def event_generator():
        try:
            await app_graph.ainvoke(
                {"messages": [("user", user_message)]},
                config
            )

            state = await app_graph.aget_state(config)
            final_text = ""

            if state and state.values:
                messages = state.values.get("messages", [])
                for msg in reversed(messages):
                    if hasattr(msg, "type") and msg.type == "ai" and getattr(msg, "content", None):
                        final_text = msg.content if isinstance(msg.content, str) else str(msg.content)
                        break

            if final_text:
                yield f"data: {json.dumps({'text': final_text})}\n\n"
            else:
                yield f"data: {json.dumps({'text': '[No response generated]'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'text': f'[Server error: {str(e)}]'})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)