"""
FastAPI routes for chat + debugging.

The compiled graph is created at startup (main.py) and stored on app.state, so
routes read it via request.app.state.app_graph rather than a module global.
"""

import json
import re
import uuid
import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage

from observability import obs_handler
import observability as obs

DEFAULT_THREAD_ID = "market_analyst_session"

# Overall-pipeline progress. Nodes REVISIT (the supervisor runs 2-3x per request),
# so these are targets, not absolutes -- bump() below keeps the bar monotonic and
# only lets the message change on a revisit.
NODE_PROGRESS = {
    "supervisor": (15, "Routing the question..."),
    "researcher": (35, "Researcher reading internal records..."),
    "web": (35, "Web agent searching..."),
    "trading": (35, "Trading agent reading signals..."),
    "writer": (80, "Composing the answer..."),
    "reflect": (92, "Reviewing the answer..."),
}

# A tool reports its OWN 0-100. That is not overall progress -- emitting the tool's
# 100 would pin the bar at 100 for the rest of the pipeline. Map it into a band.
TOOL_BAND = (40, 72)


def _tool_pct(inner: int) -> int:
    lo, hi = TOOL_BAND
    return int(lo + (max(0, min(100, inner)) / 100) * (hi - lo))

router = APIRouter()


@router.get("/chat/history")
async def get_history(request: Request, thread_id: str = DEFAULT_THREAD_ID):
    app_graph = request.app.state.app_graph
    config = {"configurable": {"thread_id": thread_id}}
    state_snapshot = await app_graph.aget_state(config)

    if not state_snapshot or not state_snapshot.values:
        return {"history": [], "thread_id": thread_id}

    raw_messages = state_snapshot.values.get("messages", [])
    formatted = []

    # Only the writer's tagged output is a user-facing answer. Specialists also
    # append AI messages (their working notes), and replaying those showed the same
    # answer two or three times on reload.
    tagged = any(getattr(m, "name", None) == "final_answer" for m in raw_messages)

    for msg in raw_messages:
        if not getattr(msg, "content", None):
            continue
        if msg.type == "human":
            formatted.append({
                "role": "user",
                "text": msg.content if isinstance(msg.content, str) else str(msg.content),
            })
        elif msg.type == "ai":
            # Legacy threads predate the tag; fall back to old behaviour for those.
            if tagged and getattr(msg, "name", None) != "final_answer":
                continue
            formatted.append({
                "role": "ai",
                "text": msg.content if isinstance(msg.content, str) else str(msg.content),
            })

    return {"history": formatted, "thread_id": thread_id}


@router.delete("/chat/history")
async def clear_history(thread_id: str = DEFAULT_THREAD_ID):
    # Generating a fresh thread id is safer than deleting rows for LangGraph logic.
    new_thread_id = f"market_analyst_session_{uuid.uuid4().hex[:8]}"
    return {"status": "ok", "message": "New session started", "thread_id": new_thread_id}



# ---------------------------------------------------------------------------
# Provider errors are for the log, not for the chat window
# ---------------------------------------------------------------------------
# The stream's exception handler used to yield `str(e)` verbatim. When Groq's
# daily token cap ran out on 2026-09-15 the assistant's reply ended with the
# provider's raw JSON -- the model id, the exact token counts, a billing upsell
# link, and the account's organisation id:
#
#     [Server error: Error code: 429 - {'error': {'message': 'Rate limit reached
#     for model `openai/gpt-oss-120b` in organization `org_01kjw...`
#
# That path bypasses the graph, so the output guardrail that scans every answer
# for secrets never saw it. An identifier the user cannot act on does not belong
# in an answer; what they can act on is what happened and when to try again.
_ORG_RE = re.compile(r"\borg_[A-Za-z0-9]+\b")
_RETRY_RE = re.compile(r"try again in ([0-9]+m[0-9.]+s|[0-9.]+s|[0-9]+m)", re.I)
_LIMIT_RE = re.compile(r"\(TPD\):\s*Limit\s*([0-9]+)", re.I)


def _user_facing_error(e: Exception) -> str:
    """One sentence the user can act on. Everything else goes to the log."""
    detail = str(e)
    print(f"[ERROR] chat stream failed: {detail}")

    low = detail.lower()
    if "rate_limit" in low or "429" in detail:
        # The provider states its own cap here, which is the only reliable
        # source for it -- teach the budget gauge rather than guessing again.
        m = _LIMIT_RE.search(detail)
        if m:
            try:
                obs.note_cap("groq", int(m.group(1)))
            except Exception:
                pass

        r = _RETRY_RE.search(detail)
        when = f" Try again in about {r.group(1)}." if r else ""
        if "per day" in low or "tpd" in low:
            msg = ("Out of quota for today: the primary model hit its daily token "
                   "limit and the fallback is exhausted too." + when)
        else:
            msg = "The models are rate-limited right now." + when
    else:
        msg = ("Something went wrong handling that request. The details are in "
               "the server log.")

    # Belt and braces: nothing that looks like an account identifier ships,
    # whatever future branches above decide to include.
    return f"[{_ORG_RE.sub('org_[redacted]', msg)}]"

@router.post("/chat/stream")
async def chat_stream(request: Request):
    app_graph = request.app.state.app_graph
    body = await request.json()
    user_message = (body.get("message") or "").strip()
    thread_id = body.get("thread_id") or DEFAULT_THREAD_ID

    if not user_message:
        async def empty_gen():
            yield f"data: {json.dumps({'text': '[Empty message]'})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(empty_gen(), media_type="text/event-stream")

    # recursion_limit is the loop guard (supervisor needs headroom);
    # callbacks wires in observability (per-request tokens/latency/steps + budget guard).
    config = {"configurable": {"thread_id": thread_id},
              "recursion_limit": 40,
              "callbacks": [obs_handler]}

    async def event_generator():
        streamed_any = False
        pending_reset = False
        progress_floor = 0      # progress must never move backwards
        node_visits = {}
        # The graph is CYCLIC -- the supervisor and writer can each run several times --
        # so a fixed pct per node makes the bar jump backwards (15 -> 40 -> 15). Clamp
        # progress so it never decreases; the message still updates, which is the part
        # that actually tells the user what's happening.
        floor = 0
        obs_handler.begin_request()
        try:
            # ONE scale for the whole request. Tool progress is mapped INTO the
            # specialist band below rather than being its own 0-100 -- two scales in
            # one bar is what made the number jump (tool "complete" = 100, then the
            # next node = 40).
            node_progress_map = {
                "supervisor": (12, "Routing the question..."),
                "researcher": (25, "Researcher reading internal records..."),
                "web": (25, "Web agent searching..."),
                "trading": (25, "Trading agent reading signals..."),
                "writer": (80, "Composing the answer..."),
                "reflect": (92, "Reviewing the answer..."),
            }
            TOOL_BAND = (30, 70)   # a tool's own 0-100 maps into this slice of the request

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
                node = (event.get("metadata") or {}).get("langgraph_node")

                # Reflection can send the draft back for a rewrite, so the
                # writer may run more than once. The UI must discard the previous
                # draft rather than append to it.
                #
                # The reset is ARMED here and sent with the first replacement
                # token, never on its own. `node` comes from metadata, which tags
                # every nested runnable INSIDE the writer node, not just the node
                # itself -- a fallback chain, a tools-bound model and the model
                # each raise on_chain_start with node == "writer". Firing eagerly
                # emitted several resets for one answer, and one of them landed
                # after the text: resetLastMessage() wiped a finished answer off
                # the screen and nothing refilled it.
                #
                # Deferring makes a stray chain start harmless by construction.
                # If no replacement text ever arrives, nothing is discarded.
                if kind == "on_chain_start" and node == "writer" and streamed_any:
                    pending_reset = True

                if kind == "on_chain_start" and name in node_progress_map:
                    pct, msg = node_progress_map[name]
                    pct = min(95, max(pct, floor))
                    floor = pct
                    yield f"data: {json.dumps({'progress_percentage': pct, 'message': msg})}\n\n"

                if kind == "on_tool_start":
                    steps = tool_progress_map.get(name, [(20, f"Running {name}...")])
                    for pct, msg in steps:
                        lo, hi = TOOL_BAND
                        mapped = int(lo + (pct / 100) * (hi - lo))
                        mapped = min(95, max(mapped, floor))
                        floor = mapped
                        yield f"data: {json.dumps({'progress_percentage': mapped, 'message': msg})}\n\n"
                        await asyncio.sleep(0.3)

                elif kind == "on_tool_end":
                    # Top of the TOOL band -- not 100. The tool is done; the request is not.
                    floor = min(95, max(TOOL_BAND[1], floor))
                    yield f"data: {json.dumps({'progress_percentage': floor, 'message': f'{name} complete.'})}\n\n"

                elif kind == "on_chat_model_stream":
                    # Only stream the WRITER's tokens. The supervisor emits its
                    # routing decision ("researcher") and reflect emits its verdict
                    # ("PASS") through the same event -- streaming those leaks
                    # internal reasoning into the user's answer.
                    if node != "writer":
                        continue
                    chunk = event.get("data", {}).get("chunk")
                    if not (chunk and hasattr(chunk, "content")):
                        continue
                    content = chunk.content
                    if isinstance(content, str):
                        pieces = [content]
                    elif isinstance(content, list):
                        # Gemini streams content blocks where Groq streams a str.
                        pieces = [
                            b.get("text", "")
                            for b in content
                            if isinstance(b, dict) and b.get("type") == "text"
                        ]
                    else:
                        pieces = []
                    for text in pieces:
                        if not text:
                            continue
                        if pending_reset:
                            # Sent only now, immediately before the text that
                            # replaces the draft being discarded.
                            yield f"data: {json.dumps({'reset': True})}\n\n"
                            pending_reset = False
                        streamed_any = True
                        yield f"data: {json.dumps({'text': text})}\n\n"

            # If nothing streamed (e.g. the input guardrail blocked and short-circuited),
            # emit the stored final_answer so the user still sees the refusal.
            if not streamed_any:
                snap = await app_graph.aget_state(config)
                final_answer = (snap.values or {}).get("final_answer") if snap else None
                if final_answer:
                    yield f"data: {json.dumps({'text': final_answer})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'text': _user_facing_error(e)})}\n\n"

        # Runs whether the request succeeded or errored, so a failed run still logs
        # its metrics and counts its tokens toward the daily total.
        obs_handler.end_request(label=user_message[:40])
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # critical for nginx proxies
        },
    )


@router.get("/chat/debug_state")
async def debug_state(request: Request, thread_id: str):
    """Full saved state, including ToolMessages and tool_calls that /chat/history
    drops. The `name` field attributes each tool result to the tool that produced
    it -- required by the RAGAS runner to isolate FAISS contexts."""
    app_graph = request.app.state.app_graph
    snap = await app_graph.aget_state({"configurable": {"thread_id": thread_id}})
    msgs = snap.values.get("messages", []) if snap and snap.values else []
    return {"messages": [
        {"type": m.type,
         "name": getattr(m, "name", None),
         "content": m.content,
         "tool_calls": getattr(m, "tool_calls", None)}
        for m in msgs
    ]}