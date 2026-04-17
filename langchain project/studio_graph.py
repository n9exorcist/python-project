import os
import asyncio
from typing import Annotated, Literal, TypedDict

from dotenv import load_dotenv, find_dotenv
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_mcp_adapters.client import MultiServerMCPClient

load_dotenv(find_dotenv())


class GraphState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    route: str
    validation_status: str
    retry_count: int
    final_answer: str


llm = ChatGroq(
    model_name="llama-3.3-70b-versatile",
    temperature=0,
    api_key=os.getenv("GROQ_API_KEY")
)


async def _build_graph():
    mcp_client = MultiServerMCPClient({
        "market_tools": {
            "transport": "sse",
            "url": "http://127.0.0.1:9001/sse"
        }
    })

    mcp_tools = await mcp_client.get_tools()

    if not mcp_tools:
        raise RuntimeError("No MCP tools loaded. Please start mcp_server first.")

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
Synthesize earthly corporate data of Market Cycles.

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

    return graph_builder.compile()


graph = asyncio.run(_build_graph())
