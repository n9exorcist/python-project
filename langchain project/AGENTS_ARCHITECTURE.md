# Agents Architecture (`agents.py`)

## Overview

A **multi-agent supervisor graph** built with LangGraph. A supervisor LLM delegates to focused specialists, each holding only its own tools. After all specialists have run, a writer composes the final answer and a reviewer critiques it.

```
START → input_guard → supervisor → researcher ──┐
                           ↑         web        ├──→ tools → (back to specialist)
                           └─────── trading ────┘
                      supervisor → writer → reflect → END
```

---

## Constants

| Name | Value | Purpose |
|---|---|---|
| `MAX_DELEGATIONS` | 4 | Supervisor loop hard cap |
| `MAX_TOOL_ROUNDS` | 2 | Tool calls allowed per specialist visit |
| `MAX_REFLECT` | 1 | Rewrite attempts after self-critique |
| `MAX_CONTEXT_TOKENS` | 5000 (env) | Token budget per LLM call (Groq TPM limit) |
| `MAX_TOOL_CHARS` | 4000 (env) | Tool result truncation limit |
| `MIN_EVIDENCE_CHARS` | 800 (env) | Floor per result inside the reviewer's evidence window |

---

## Graph State (`GraphState`)

```python
class GraphState(TypedDict, total=False):
    messages: Annotated[list, add_messages]  # full conversation + tool results
    next_agent: str                           # supervisor's routing decision
    active_agent: str                         # which specialist just ran
    delegations: int                          # supervisor delegation counter
    used_agents: list                         # specialists already run this turn
    tool_rounds: int                          # tool calls used this specialist visit
    final_answer: str                         # writer's output
    reflection: str                           # reviewer critique → fed back to writer
    reflection_verdict: str                   # "pass" | "revise"
    reflect_attempts: int
    draft_id: str                             # stable id so a rewrite replaces the draft
    blocked: bool                             # input guardrail tripped
    guardrail_reason: str
```

All counters (`delegations`, `tool_rounds`, `reflect_attempts`) are **per-request**, but LangGraph checkpoints state per thread. The `input_guard` node resets them to zero on every new request — without this, by the 3rd question in a thread the caps are already hit and no tool ever runs.

---

## Nodes

### `input_guard`
- Runs the input guardrail (PII / injection check)
- Resets all per-request counters: `delegations=0`, `tool_rounds=0`, `reflect_attempts=0`, `used_agents=[]`
- Routes to `END` if blocked, `supervisor` if clean

### `supervisor`
Decides who acts next using a **compact digest** of the conversation (last 10 events, 300 chars each) — not the full message list, which would waste tokens on a one-word routing decision.

```python
digest = _supervisor_digest(state["messages"])
resp = await llm.ainvoke([SystemMessage(routing_prompt), HumanMessage(digest)])
# returns exactly one word: researcher | web | trading | FINISH
```

**Guards inside the supervisor:**
- `delegations >= MAX_DELEGATIONS` → force FINISH
- `decision in used_agents` → that specialist already ran this turn → force FINISH (prevents re-delegating to the same specialist, which re-answers from the same tool result)
- Resets `tool_rounds=0` on each delegation (fresh budget per visit)

### Specialists (`researcher`, `web`, `trading`)

Each is created by `make_specialist()` — same pattern, different LLM binding and tool subset:

| Specialist | Tools bound |
|---|---|
| `researcher` | `mcp_search_corporate_records`, `mcp_read_market_cycles` |
| `web` | `mcp_search_the_web` |
| `trading` | `mcp_read_signals_csv`, `mcp_get_trade_history` |

**Per-visit loop:**
1. Check `tool_rounds` — if `>= MAX_TOOL_ROUNDS`, return a handoff message immediately (no LLM call). This avoids a Groq error where the model calls a tool even when instructed not to.
2. Otherwise invoke the bound LLM with a trimmed context window (`_fit()`)
3. If the LLM emits a `tool_call` → `ToolNode` executes it → result comes back as `ToolMessage` → specialist is re-entered → `tool_rounds` incremented
4. After `MAX_TOOL_ROUNDS` tool calls, control returns to the supervisor

The system prompt for each specialist explicitly names the tools it holds — prevents it from calling a sibling's tool, which would fail at the provider.

### `tools`
LangGraph's built-in `ToolNode`. Receives an `AIMessage` with a `tool_call`, executes the corresponding MCP tool (via HTTP POST to the MCP server), and appends the `ToolMessage` to state. Routes back to whichever specialist is in `active_agent`.

### `writer`
Composes the final user-facing answer from all `ToolMessage` results already in state. **Never calls tools itself.**

- Uses `scan_output()` guardrail to strip PII from the response
- Stable `draft_id` — if the reviewer sends it back for a rewrite, `add_messages` replaces the draft in state rather than appending a second answer

If a reviewer critique is in `state["reflection"]`, it's appended to the prompt so the rewrite targets the specific issue.

### `reflect`
A strict reviewer that checks the writer's answer against what the tools actually returned.

**Key design:** the reviewer is shown **two evidence budgets** — tool results from this turn and results from earlier turns (for follow-up questions). This prevents two failure modes:
1. Showing only this turn's results → reviewer judges a follow-up answer blind when the writer legitimately used an earlier turn's retrieval
2. Joining all turns → oldest results crowd out the newest, and the reviewer is shown stale evidence

```
evidence = "RETRIEVED THIS TURN:\n..." + "RETRIEVED EARLIER:\n..."
```

**Verdict:**
- `PASS` → end
- `REVISE: <specific fix>` → critique stored in `state["reflection"]` → writer re-runs (up to `MAX_REFLECT=1`)

The reviewer is explicitly instructed: if the context contains an answer and the writer said "I don't have access", that is the worst failure and must not pass.

---

## Context Management

### `_fit(msgs)`
Trims the message list to `MAX_CONTEXT_TOKENS` before every LLM call.
- Uses `trim_messages()` with `strategy="last"`, `start_on="human"` — never starts on a `ToolMessage` (providers reject orphaned tool results)
- Falls back to uncapped list on any trimming error

### `_cap_tool_output(msgs)`
Truncates any single `ToolMessage` over `MAX_TOOL_CHARS` to keep one large Tavily dump from dominating the context. Keeps the top of the result (which is the ranked, most relevant part).

### `_supervisor_digest(messages)`
Compact summary of the last 10 events for the supervisor's routing call — avoids paying full-context cost for a one-word decision.

---

## Routing Summary

| From | Condition | To |
|---|---|---|
| `input_guard` | blocked | `END` |
| `input_guard` | clean | `supervisor` |
| `supervisor` | decision in workers | that specialist |
| `supervisor` | FINISH / cap / already used | `writer` |
| specialist | LLM emitted tool_call | `tools` |
| specialist | no tool_call | `supervisor` |
| `tools` | always | `active_agent` (same specialist) |
| `writer` | reflection enabled | `reflect` |
| `writer` | reflection disabled | `END` |
| `reflect` | verdict = revise | `writer` |
| `reflect` | verdict = pass | `END` |

---

## Full Request Lifecycle

```
User: "What were Accenture Q2 FY26 revenues?"

input_guard  → resets counters, passes clean
supervisor   → digest shows no specialist has run → picks "researcher"
researcher   → LLM emits tool_call: mcp_search_corporate_records(query)
tools        → HTTP POST to MCP server → HybridRetriever → cited chunks → ToolMessage
researcher   → tool_rounds=1, under cap → LLM synthesises from ToolMessage
supervisor   → researcher already in used_agents → FINISH
writer       → composes answer with citations from ToolMessage in state
reflect      → sees tool results + answer → PASS
END
```
