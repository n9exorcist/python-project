"""
LangGraph definition for the Market Analyst agent.

The graph is built by build_graph(), which takes its runtime dependencies (llm,
tools, checkpointer) as arguments. This lets main.py build it at startup with the
async resources, and lets studio_graph.py build the same graph for LangGraph
Studio — one definition, no drift.

Guardrails:
  - input_guard node runs first and short-circuits injection/exfil attempts.
  - writer_node sanitizes its output via scan_output before storing.
"""

from typing import Annotated, Literal, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from guardrails import make_input_guardrail_node, route_after_input_guard, scan_output


# --- LANGGRAPH STATE DEFINITION ---
class GraphState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    route: str
    validation_status: str
    retry_count: int
    final_answer: str
    blocked: bool            # set by the input guardrail
    guardrail_reason: str    # why the input was blocked


def build_graph(llm, llm_with_tools, mcp_tools, checkpointer, use_llm_guard: bool = False):
    """Build and compile the agent graph.

    llm            : base ChatGroq (used by writer + guardrail classifier)
    llm_with_tools : llm.bind_tools(mcp_tools), or None if tools failed to load
    mcp_tools      : list of loaded MCP tools (for the ToolNode)
    checkpointer   : AsyncSqliteSaver instance
    use_llm_guard  : enable the optional LLM injection classifier layer
    """

    # ------------------------- NODES -------------------------
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
            "validation_status": "pending",
        }

    async def agent_node(state: GraphState):
        route = state.get("route", "general")
        messages = state.get("messages", [])

        routing_instruction = {
            "local": "Prefer the MCP tool for local corporate records first.",
            "web": "Prefer the MCP web search tool first.",
            "hybrid": "Use both local corporate records and web search if needed.",
            "general": "Use MCP tools whenever factual lookup is needed.",
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
        active_llm = llm_with_tools if llm_with_tools is not None else llm

        if llm_with_tools is None:
            print("--- [AI] WARNING: MCP tools not loaded. Answering without tools. ---")

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
            "[Server error",
        ]

        if any(marker.lower() in tool_text.lower() for marker in weak_markers):
            if retry_count < 1:
                return {"validation_status": "retry", "retry_count": retry_count + 1}
            return {"validation_status": "fallback", "retry_count": retry_count}

        if not tool_text and not ai_text:
            return {
                "validation_status": "retry" if retry_count < 1 else "fallback",
                "retry_count": retry_count + 1 if retry_count < 1 else retry_count,
            }

        return {"validation_status": "ok", "retry_count": retry_count}

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

        # --- OUTPUT GUARDRAIL: sanitize before storing ---
        raw = response.content if isinstance(response.content, str) else str(response.content)
        clean, modified, findings = scan_output(raw)
        if modified:
            print(f"--- [GUARDRAIL] output sanitized: {findings} ---")

        return {
            "messages": [AIMessage(content=clean)],   # store the sanitized version
            "final_answer": clean,
        }

    # ------------------------- EDGES -------------------------
    def route_after_agent(state: GraphState) -> Literal["tools", "validator"]:
        result = tools_condition(state)
        return "tools" if result == "tools" else "validator"

    def route_after_validator(state: GraphState) -> Literal["agent", "writer"]:
        status = state.get("validation_status", "ok")
        return "agent" if status in ["retry", "fallback"] else "writer"

    # ------------------------- BUILD -------------------------
    graph_builder = StateGraph(GraphState)

    graph_builder.add_node("input_guard", make_input_guardrail_node(llm=llm, use_llm=use_llm_guard))
    graph_builder.add_node("router", router_node)
    graph_builder.add_node("agent", agent_node)
    graph_builder.add_node("tools", ToolNode(mcp_tools))
    graph_builder.add_node("validator", validator_node)
    graph_builder.add_node("writer", writer_node)

    # INPUT GUARD is the entry point; blocked -> straight to END.
    graph_builder.add_edge(START, "input_guard")
    graph_builder.add_conditional_edges(
        "input_guard",
        route_after_input_guard,
        {"blocked": END, "clean": "router"},
    )

    graph_builder.add_edge("router", "agent")
    graph_builder.add_conditional_edges(
        "agent",
        route_after_agent,
        {"tools": "tools", "validator": "validator"},
    )
    graph_builder.add_edge("tools", "validator")
    graph_builder.add_conditional_edges(
        "validator",
        route_after_validator,
        {"agent": "agent", "writer": "writer"},
    )
    graph_builder.add_edge("writer", END)

    return graph_builder.compile(checkpointer=checkpointer)