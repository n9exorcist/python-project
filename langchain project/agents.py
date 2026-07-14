"""
Multi-agent supervisor graph for the Market Analyst.

Replaces the single agent_node with a SUPERVISOR that delegates to focused
specialists, each holding only its own tool(s) and a short prompt:

  - researcher : internal corporate records (FAISS)  -> mcp_search_corporate_records
  - web        : live web / news                     -> mcp_search_the_web
  - trading    : signals + executed-trade history    -> mcp_read_signals_csv,
                                                        mcp_get_trade_history

Flow:
  START -> input_guard -> supervisor -> {researcher | web | trading | writer}
  specialist -> {tools -> back to same specialist} -> supervisor
  supervisor -> (FINISH) -> writer -> END

The keyword router and the validator are subsumed by the supervisor (it routes,
and it can re-delegate when a specialist finds nothing). Guardrails are preserved.

Build with build_supervisor_graph(llm, mcp_tools, checkpointer).
"""

from typing import Annotated, Literal, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from guardrails import make_input_guardrail_node, route_after_input_guard, scan_output

WORKERS = ("researcher", "web", "trading")
MAX_DELEGATIONS = 4   # supervisor loop guard: force FINISH after this many hops


class GraphState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    next_agent: str          # supervisor's decision
    active_agent: str        # which specialist is currently working
    delegations: int         # supervisor step counter
    final_answer: str
    blocked: bool
    guardrail_reason: str


def build_supervisor_graph(llm, mcp_tools, checkpointer, use_llm_guard: bool = False):
    tools_map = {t.name: t for t in mcp_tools}

    def subset(names):
        return [tools_map[n] for n in names if n in tools_map]

    # Per-specialist tool subsets (gracefully empty if a tool didn't load).
    researcher_tools = subset(["mcp_search_corporate_records"])
    web_tools = subset(["mcp_search_the_web"])
    trading_tools = subset(["mcp_read_signals_csv", "mcp_get_trade_history"])

    llm_researcher = llm.bind_tools(researcher_tools) if researcher_tools else llm
    llm_web = llm.bind_tools(web_tools) if web_tools else llm
    llm_trading = llm.bind_tools(trading_tools) if trading_tools else llm

    # ------------------------- SUPERVISOR -------------------------
    async def supervisor_node(state: GraphState):
        delegations = state.get("delegations", 0)
        if delegations >= MAX_DELEGATIONS:
            print(f"--- [SUPERVISOR] delegation cap reached -> FINISH ---")
            return {"next_agent": "FINISH"}

        sys = (
            "You are the SUPERVISOR of a market-analysis team. Based on the "
            "conversation so far, decide who should act NEXT:\n"
            "- researcher: internal corporate records, company financials, Accenture docs, "
            "safe-haven / sector notes from the knowledge base\n"
            "- web: live news, current market reaction, anything needing the internet\n"
            "- trading: today's Green/Red signal, or verifying executed trades in the database\n"
            "- FINISH: enough information has been gathered to answer, OR the question is "
            "general knowledge needing no lookup.\n\n"
            "If a specialist reported no data or an error, you may delegate to a different "
            "specialist, or FINISH if the answer genuinely is not available.\n"
            "Reply with exactly ONE word: researcher, web, trading, or FINISH."
        )
        resp = await llm.ainvoke([SystemMessage(content=sys)] + state.get("messages", []))
        raw = (resp.content if isinstance(resp.content, str) else str(resp.content)).strip().lower()

        decision = "FINISH"
        if "finish" not in raw:
            for w in WORKERS:
                if w in raw:
                    decision = w
                    break

        print(f"--- [SUPERVISOR] -> {decision} (delegation {delegations}) ---")
        return {"next_agent": decision, "delegations": delegations + 1}

    def route_supervisor(state: GraphState) -> Literal["researcher", "web", "trading", "writer"]:
        nxt = state.get("next_agent", "FINISH")
        return nxt if nxt in WORKERS else "writer"

    # ------------------------- SPECIALISTS -------------------------
    def make_specialist(name, llm_spec, focus):
        async def specialist(state: GraphState):
            sys = (
                f"You are the {name} specialist on a market-analysis team. {focus} "
                "Use your tool(s) when a lookup is needed; otherwise answer directly and briefly. "
                "Format dates for tools as DD-MM-YYYY. The current year is 2026."
            )
            resp = await llm_spec.ainvoke([SystemMessage(content=sys)] + state.get("messages", []))
            return {"messages": [resp], "active_agent": name}
        return specialist

    researcher_node = make_specialist(
        "researcher", llm_researcher,
        "You look up internal corporate records, company financials, and knowledge-base notes.")
    web_node = make_specialist(
        "web", llm_web,
        "You search the live web for current news and market reaction.")
    trading_node = make_specialist(
        "trading", llm_trading,
        "You read today's trading signal and verify executed trades in the local database.")

    def route_specialist(state: GraphState) -> Literal["tools", "supervisor"]:
        return "tools" if tools_condition(state) == "tools" else "supervisor"

    def route_after_tools(state: GraphState) -> Literal["researcher", "web", "trading"]:
        return state.get("active_agent", "researcher")

    # ------------------------- WRITER (with output guardrail) -------------------------
    async def writer_node(state: GraphState):
        writer_prompt = (
            "You are a senior market analyst. Write the final answer for the user using the "
            "gathered context in the conversation.\n"
            "RULES:\n"
            "- Do not mention internal tool mechanics or the team structure.\n"
            "- Be concise, direct, and professional.\n"
            "- If information was not found, say clearly what is missing rather than inventing it."
        )
        resp = await llm.ainvoke(
            [SystemMessage(content=writer_prompt)] + state.get("messages", []) +
            [HumanMessage(content="Write the final user-facing answer now.")]
        )
        raw = resp.content if isinstance(resp.content, str) else str(resp.content)
        clean, modified, findings = scan_output(raw)
        if modified:
            print(f"--- [GUARDRAIL] output sanitized: {findings} ---")
        return {"messages": [AIMessage(content=clean)], "final_answer": clean}

    # ------------------------- BUILD -------------------------
    g = StateGraph(GraphState)

    g.add_node("input_guard", make_input_guardrail_node(llm=llm, use_llm=use_llm_guard))
    g.add_node("supervisor", supervisor_node)
    g.add_node("researcher", researcher_node)
    g.add_node("web", web_node)
    g.add_node("trading", trading_node)
    g.add_node("tools", ToolNode(mcp_tools))
    g.add_node("writer", writer_node)

    g.add_edge(START, "input_guard")
    g.add_conditional_edges(
        "input_guard", route_after_input_guard,
        {"blocked": END, "clean": "supervisor"},
    )

    g.add_conditional_edges(
        "supervisor", route_supervisor,
        {"researcher": "researcher", "web": "web", "trading": "trading", "writer": "writer"},
    )

    for w in WORKERS:
        g.add_conditional_edges(
            w, route_specialist,
            {"tools": "tools", "supervisor": "supervisor"},
        )

    g.add_conditional_edges(
        "tools", route_after_tools,
        {"researcher": "researcher", "web": "web", "trading": "trading"},
    )

    g.add_edge("writer", END)

    return g.compile(checkpointer=checkpointer)