import os
import asyncio
from typing import Annotated, Literal, TypedDict

from dotenv import load_dotenv, find_dotenv
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage, BaseMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_mcp_adapters.client import MultiServerMCPClient

# Load environment variables
load_dotenv(find_dotenv())

# --- CONFIGURATION ---
# Port 8000 matches your recent successful mcp_server.py logs
MCP_SERVER_URL = "http://127.0.0.1:8000/sse"

class GraphState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    route: str
    validation_status: str
    retry_count: int
    final_answer: str

# Initialize the Base LLM
llm = ChatGroq(
    model_name="llama-3.3-70b-versatile",
    temperature=0,
    api_key=os.getenv("GROQ_API_KEY")
)

# Global placeholder for the bound LLM
llm_with_tools = None

# --- NODES ---

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
Synthesize earthly corporate data of Market Cycles.

ROUTING GUIDANCE:
{routing_instruction}

RULES:
- Always use your MCP tools when factual lookup is needed.
- If the question is about Accenture Q2 2026, ensure you mention $18.0B revenue or $22.1B bookings if supported by retrieved context.
- Keep answers concise, factual, and useful.
"""
    
    # Use the globally bound LLM
    active_llm = llm_with_tools if llm_with_tools else llm
    response = await active_llm.ainvoke(
        [SystemMessage(content=system_prompt)] + messages
    )
    return {"messages": [response]}

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

    tool_text = str(last_tool.content) if last_tool else ""
    ai_text = str(last_ai.content) if last_ai else ""

    weak_markers = ["no local records found", "no web results returned", "error searching"]

    if any(marker in tool_text.lower() for marker in weak_markers):
        if retry_count < 1:
            return {"validation_status": "retry", "retry_count": retry_count + 1}
        return {"validation_status": "fallback", "retry_count": retry_count}

    return {"validation_status": "ok", "retry_count": retry_count}

async def writer_node(state: GraphState):
    messages = state.get("messages", [])
    writer_prompt = """You are a senior market analyst.
Write the final answer for the user using the available retrieved context.
Do not mention internal tool mechanics."""

    response = await llm.ainvoke(
        [SystemMessage(content=writer_prompt)] + messages + [
            HumanMessage(content="Write the final user-facing answer now.")
        ]
    )

    return {
        "messages": [response],
        "final_answer": response.content
    }

# --- CONDITIONAL EDGES ---

def route_after_agent(state: GraphState) -> Literal["tools", "validator"]:
    result = tools_condition(state)
    return "tools" if result == "tools" else "validator"

def route_after_validator(state: GraphState) -> Literal["agent", "writer"]:
    status = state.get("validation_status", "ok")
    return "agent" if status in ["retry", "fallback"] else "writer"

# --- COMPILATION LOGIC ---

def initialize_graph():
    global llm_with_tools
    
    # Initialize MCP Client
    mcp_client = MultiServerMCPClient({
        "market_tools": {
            "transport": "sse",
            "url": MCP_SERVER_URL
        }
    })

    # Tool loading with Studio fallback
    try:
        # Use existing loop or create one for initialization
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
        mcp_tools = loop.run_until_complete(mcp_client.get_tools())
        print(f"✅ LOADED {len(mcp_tools)} MCP TOOLS")
    except Exception as e:
        print(f"⚠️ MCP TOOLS FAILED TO LOAD: {e}. Graph will run in general mode.")
        mcp_tools = []

    # Bind LLM
    llm_with_tools = llm.bind_tools(mcp_tools) if mcp_tools else llm

    # Build Graph
    graph_builder = StateGraph(GraphState)

    graph_builder.add_node("router", router_node)
    graph_builder.add_node("agent", agent_node)
    graph_builder.add_node("tools", ToolNode(mcp_tools))
    graph_builder.add_node("validator", validator_node)
    graph_builder.add_node("writer", writer_node)

    graph_builder.add_edge(START, "router")
    graph_builder.add_edge("router", "agent")

    graph_builder.add_conditional_edges(
        "agent",
        route_after_agent,
        {"tools": "tools", "validator": "validator"}
    )

    graph_builder.add_edge("tools", "validator")

    graph_builder.add_conditional_edges(
        "validator",
        route_after_validator,
        {"agent": "agent", "writer": "writer"}
    )

    graph_builder.add_edge("writer", END)

    return graph_builder.compile()

# This variable 'graph' is what LangGraph Studio looks for
graph = initialize_graph()