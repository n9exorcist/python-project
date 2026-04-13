import os
import json
import uuid
from typing import Annotated, Literal, TypedDict
from contextlib import asynccontextmanager

from dotenv import load_dotenv, find_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langchain_mcp_adapters.client import MultiServerMCPClient

load_dotenv(find_dotenv())

app_graph = None
db_saver = None
mcp_client = None
llm = None
llm_with_tools = None
mcp_tools = []

DB_PATH = "memory.db"
THREAD_ID = "market_analyst_session"


class GraphState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    route: str
    validation_status: str
    retry_count: int
    final_answer: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    global app_graph, db_saver, mcp_client, llm, llm_with_tools, mcp_tools

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

        try:
            mcp_client = MultiServerMCPClient({
                "market_tools": {
                    "transport": "sse",
                    "url": "http://127.0.0.1:9001/sse"
                }
            })

            mcp_tools = await mcp_client.get_tools()
            print(f"--- LOADED {len(mcp_tools)} MCP TOOLS ---")
        except Exception as e:
            print(f"--- MCP LOAD FAILED: {e} ---")
            mcp_tools = []

        if not mcp_tools:
            raise RuntimeError("No MCP tools loaded. Please start mcp_server.py first.")

        llm_with_tools = llm.bind_tools(mcp_tools)

        def router_node(state: GraphState):
            messages = state.get("messages", [])
            user_text = ""

            for msg in reversed(messages):
                if getattr(msg, "type", "") == "human":
                    user_text = msg.content if isinstance(msg.content, str) else str(msg.content)
                    break

            lowered = user_text.lower()

            if any(word in lowered for word in ["internal", "records", "document", "faiss", "local"]):
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
Synthesize earthly corporate data with the divine wisdom of Market Cycles.

ROUTING GUIDANCE:
{routing_instruction}

RULES:
- Always use your MCP tools when factual lookup is needed.
- If the question is about Accenture Q2 2026, ensure you mention $18.0B revenue or $22.1B bookings if supported by retrieved context.
- Keep answers concise, factual, and useful.
"""

            response = await llm_with_tools.ainvoke(
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
                {"messages": [HumanMessage(content=user_message)]},
                config
            )

            state = await app_graph.aget_state(config)
            final_text = ""

            if state and state.values:
                final_text = state.values.get("final_answer", "")

                if not final_text:
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
