"""
Multi-agent supervisor graph for the Market Analyst.

SUPERVISOR delegates to focused specialists, each with only its own tool(s):
  - researcher : internal corporate records (FAISS)  -> mcp_search_corporate_records
  - web        : live web / news                     -> mcp_search_the_web
  - trading    : signals + trade history             -> mcp_read_signals_csv,
                                                        mcp_get_trade_history

Flow:
  START -> input_guard -> supervisor -> {researcher | web | trading | writer}
  specialist -> {tools -> back to same specialist} -> supervisor
  supervisor -> (FINISH) -> writer -> reflect -> {revise -> writer | END}

Two controls keep it bounded and honest:
  - TOOL-ROUND CAP: each specialist visit gets MAX_TOOL_ROUNDS tool calls; after
    that it is handed the tool-less LLM so it MUST synthesize (stops runaway
    tool loops that burn tokens). Reset by the supervisor on each delegation.
  - REFLECTION (self-correction): after the writer drafts an answer, a reviewer
    critiques it and can send it back for one rewrite (MAX_REFLECT).

Guardrails (input guard + writer output sanitizer) are preserved.
"""

import uuid
from typing import Annotated, Literal, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from guardrails import make_input_guardrail_node, route_after_input_guard, scan_output

WORKERS = ("researcher", "web", "trading")
MAX_DELEGATIONS = 4    # supervisor loop guard
MAX_TOOL_ROUNDS = 2    # tool calls allowed per specialist visit
MAX_REFLECT = 1        # rewrite attempts after self-critique


class GraphState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    next_agent: str
    active_agent: str
    delegations: int
    used_agents: list      # specialists already run THIS turn
    tool_rounds: int          # tool calls used by the current specialist visit
    final_answer: str
    reflection: str           # reviewer critique fed back to the writer
    reflection_verdict: str   # "pass" | "revise"
    reflect_attempts: int
    draft_id: str            # stable id so a rewrite REPLACES the draft
    blocked: bool
    guardrail_reason: str


def _supervisor_digest(messages, limit: int = 300):
    """A compact view of the turn for the supervisor.

    The supervisor only needs to know what has been tried and roughly what came
    back -- not the full text of every tool result. Passing the entire message
    history (a Tavily dump can be thousands of tokens) made a ONE-WORD routing
    decision cost seconds of latency, twice per request.
    """
    lines = []
    for m in messages:
        t = getattr(m, "type", "")
        c = getattr(m, "content", "")
        c = c if isinstance(c, str) else str(c)
        if t == "human":
            lines.append(f"USER ASKED: {c}")
        elif t == "tool":
            snip = c[:limit].replace("\n", " ")
            more = f" ...[{len(c)} chars total]" if len(c) > limit else ""
            lines.append(f"TOOL {getattr(m, 'name', '?')} RETURNED: {snip}{more}")
        elif t == "ai" and c.strip():
            lines.append(f"SPECIALIST SAID: {c[:limit]}")
    return "\n".join(lines[-10:]) or "(nothing yet)"


def _latest_question(messages):
    """The CURRENT question -- the last human message, not the first. State is
    checkpointed per thread, so earlier turns are still in `messages`."""
    for m in reversed(messages):
        if getattr(m, "type", "") == "human":
            return m.content if isinstance(m.content, str) else str(m.content)
    return ""


def make_entry_node(llm, use_llm_guard):
    """Input guardrail + per-request counter reset.

    delegations / tool_rounds / reflect_attempts are per-REQUEST guards, but the
    graph state is checkpointed per THREAD. Without an explicit reset they carry
    over between turns: by the 3rd question in a thread, delegations >= the cap,
    the supervisor stops delegating, no tool ever runs, and every answer becomes
    "not available". This node runs first on every request, so it is where they
    get zeroed.
    """
    guard = make_input_guardrail_node(llm=llm, use_llm=use_llm_guard)

    def entry(state: GraphState):
        result = guard(state) or {}
        result.update({
            "delegations": 0,
            "tool_rounds": 0,
            "reflect_attempts": 0,
            "reflection": "",
            "reflection_verdict": "",
            "draft_id": "",
            "used_agents": [],
        })
        return result

    return entry


def build_supervisor_graph(llm, mcp_tools, checkpointer, use_llm_guard: bool = False,
                           enable_reflection: bool = True):
    tools_map = {t.name: t for t in mcp_tools}

    def subset(names):
        return [tools_map[n] for n in names if n in tools_map]

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
            print("--- [SUPERVISOR] delegation cap reached -> FINISH ---")
            return {"next_agent": "FINISH"}

        current_q = _latest_question(state.get("messages", []))
        sys = (
            "You are the SUPERVISOR of a market-analysis team.\n"
            f"The user's CURRENT question is: {current_q}\n"
            "Earlier questions in the conversation are ALREADY ANSWERED -- ignore them. "
            "Decide who should act NEXT to answer the CURRENT question:\n"
            "- researcher: internal corporate records, company financials, Accenture docs, "
            "safe-haven / sector notes from the knowledge base\n"
            "- web: live news, current market reaction, anything needing the internet\n"
            "- trading: today's Green/Red signal, or verifying executed trades in the database\n"
            "- FINISH: enough information has been gathered to answer, OR the question is "
            "general knowledge needing no lookup.\n\n"
            "Reply FINISH only if the CURRENT question has been answered in this turn, or "
            "needs no lookup. If no specialist has run for the CURRENT question yet, delegate.\n"
            "Reply with exactly ONE word: researcher, web, trading, or FINISH."
        )
        # Compact digest, NOT the full message list -- see _supervisor_digest.
        digest = _supervisor_digest(state.get("messages", []))
        resp = await llm.ainvoke([
            SystemMessage(content=sys),
            HumanMessage(content=f"Conversation so far:\n{digest}\n\nWho acts next?"),
        ])
        raw = (resp.content if isinstance(resp.content, str) else str(resp.content)).strip().lower()

        decision = "FINISH"
        if "finish" not in raw:
            for w in WORKERS:
                if w in raw:
                    decision = w
                    break

        # Deterministic guard: a specialist that has already run this turn does not
        # get re-asked. Without this the LLM re-delegates to the same specialist,
        # which then re-answers from the SAME tool result -- four passes over a full
        # Tavily dump cost 37k tokens and 184s for one question, with one tool call.
        # It already gets MAX_TOOL_ROUNDS attempts inside its own visit.
        used = list(state.get("used_agents", []))
        if decision in used:
            print(f"--- [SUPERVISOR] {decision} already ran this turn -> FINISH ---")
            return {"next_agent": "FINISH", "delegations": delegations + 1}

        if decision in WORKERS:
            used.append(decision)

        print(f"--- [SUPERVISOR] -> {decision} (delegation {delegations}) ---")
        # Reset the per-specialist tool budget on each delegation.
        return {"next_agent": decision, "delegations": delegations + 1,
                "tool_rounds": 0, "used_agents": used}

    def route_supervisor(state: GraphState) -> Literal["researcher", "web", "trading", "writer"]:
        nxt = state.get("next_agent", "FINISH")
        return nxt if nxt in WORKERS else "writer"

    # ------------------------- SPECIALISTS -------------------------
    def make_specialist(name, llm_spec, focus):
        async def specialist(state: GraphState):
            msgs = state.get("messages", [])
            tool_rounds = state.get("tool_rounds", 0)
            # If we just returned from a tool, that was a completed round.
            if msgs and getattr(msgs[-1], "type", "") == "tool":
                tool_rounds += 1

            # Once the budget is spent, drop tools so the model MUST synthesize.
            if tool_rounds >= MAX_TOOL_ROUNDS:
                active_llm = llm
                extra = " You have gathered enough; now give your final answer without calling tools."
            else:
                active_llm = llm_spec
                extra = " Use your tool(s) when a lookup is needed; otherwise answer directly."

            sys = (
                f"You are the {name} specialist on a market-analysis team. {focus}{extra} "
                "Format dates for tools as DD-MM-YYYY. The current year is 2026."
            )
            resp = await active_llm.ainvoke([SystemMessage(content=sys)] + msgs)
            return {"messages": [resp], "active_agent": name, "tool_rounds": tool_rounds}
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
        prompt = (
            "You are a senior market analyst. Write the final answer for the user using the "
            "gathered context in the conversation.\n"
            "RULES:\n"
            "- Do not mention internal tool mechanics or the team structure.\n"
            "- Be concise, direct, and professional.\n"
            "- If information was not found, say clearly what is missing rather than inventing it."
        )
        reflection = state.get("reflection")
        if reflection:
            prompt += (f"\n\nA reviewer flagged an issue with your previous draft: {reflection}\n"
                       "Rewrite the answer to fix it.")

        resp = await llm.ainvoke(
            [SystemMessage(content=prompt)] + state.get("messages", []) +
            [HumanMessage(content="Write the final user-facing answer now.")]
        )
        raw = resp.content if isinstance(resp.content, str) else str(resp.content)
        clean, modified, findings = scan_output(raw)
        if modified:
            print(f"--- [GUARDRAIL] output sanitized: {findings} ---")

        # Reuse the same message id across a reflection rewrite: add_messages updates
        # an existing message by id, so the rewrite REPLACES the draft instead of
        # leaving two answers in state (which /chat/history would then replay).
        # name="final_answer" marks this as the only message the UI should show --
        # specialists also append AI messages, and those are internal working notes.
        draft_id = state.get("draft_id") or f"answer-{uuid.uuid4().hex[:8]}"
        return {
            "messages": [AIMessage(content=clean, id=draft_id, name="final_answer")],
            "final_answer": clean,
            "draft_id": draft_id,
        }

    # ------------------------- REFLECT (self-correction) -------------------------
    async def reflect_node(state: GraphState):
        attempts = state.get("reflect_attempts", 0)
        if attempts >= MAX_REFLECT:
            return {"reflection_verdict": "pass", "reflect_attempts": attempts + 1}

        question = _latest_question(state.get("messages", []))
        answer = state.get("final_answer", "")
        sys = (
            "You are a strict reviewer. Given the user's QUESTION and the assistant's ANSWER, "
            "decide if the answer directly and accurately addresses the question. Correctly "
            "stating that information is unavailable counts as PASS. "
            "Reply 'PASS' if the answer is good, or 'REVISE: <one specific fix>' if it is vague, "
            "off-topic, or makes claims not supported by the conversation."
        )
        user = f"QUESTION: {question}\n\nANSWER: {answer}"
        resp = await llm.ainvoke([SystemMessage(content=sys), HumanMessage(content=user)])
        raw = (resp.content if isinstance(resp.content, str) else str(resp.content)).strip()

        if raw.upper().startswith("PASS"):
            print("--- [REFLECT] pass ---")
            return {"reflection_verdict": "pass", "reflect_attempts": attempts + 1}

        critique = raw.split(":", 1)[1].strip() if ":" in raw else raw
        print(f"--- [REFLECT] revise: {critique[:70]} ---")
        return {"reflection_verdict": "revise", "reflection": critique,
                "reflect_attempts": attempts + 1}

    def route_reflect(state: GraphState) -> Literal["writer", "end"]:
        return "writer" if state.get("reflection_verdict") == "revise" else "end"

    # ------------------------- BUILD -------------------------
    g = StateGraph(GraphState)

    g.add_node("input_guard", make_entry_node(llm, use_llm_guard))
    g.add_node("supervisor", supervisor_node)
    g.add_node("researcher", researcher_node)
    g.add_node("web", web_node)
    g.add_node("trading", trading_node)
    g.add_node("tools", ToolNode(mcp_tools))
    g.add_node("writer", writer_node)

    g.add_edge(START, "input_guard")
    g.add_conditional_edges("input_guard", route_after_input_guard,
                            {"blocked": END, "clean": "supervisor"})
    g.add_conditional_edges("supervisor", route_supervisor,
                            {"researcher": "researcher", "web": "web",
                             "trading": "trading", "writer": "writer"})
    for w in WORKERS:
        g.add_conditional_edges(w, route_specialist,
                                {"tools": "tools", "supervisor": "supervisor"})
    g.add_conditional_edges("tools", route_after_tools,
                            {"researcher": "researcher", "web": "web", "trading": "trading"})

    if enable_reflection:
        g.add_node("reflect", reflect_node)
        g.add_edge("writer", "reflect")
        g.add_conditional_edges("reflect", route_reflect, {"writer": "writer", "end": END})
    else:
        g.add_edge("writer", END)

    return g.compile(checkpointer=checkpointer)