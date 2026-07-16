"""
FastAPI routes for chat + debugging.

The compiled graph is created at startup (main.py) and stored on app.state, so
routes read it via request.app.state.app_graph rather than a module global.
"""

import json
import uuid
import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage

from observability import obs_handler

DEFAULT_THREAD_ID = "market_analyst_session"

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
        writer_pass = 0
        obs_handler.begin_request()
        try:
            # The tool map only covers tool calls. Between a tool finishing and the
            # writer's first token there are several LLM calls whose tokens are
            # filtered out of the stream -- without these, the bar freezes at 100/100
            # for the whole thinking phase.
            node_progress_map = {
                "supervisor": (15, "Routing the question..."),
                "researcher": (40, "Researcher reading internal records..."),
                "web": (40, "Web agent analysing results..."),
                "trading": (40, "Trading agent reading signals..."),
                "writer": (85, "Composing the answer..."),
                "reflect": (95, "Reviewing the answer..."),
            }

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

                # Reflection can send the draft back for a rewrite, so the writer
                # may run more than once. Tell the UI to discard the previous draft
                # instead of appending the new one to it.
                if kind == "on_chain_start" and node == "writer":
                    writer_pass += 1
                    if writer_pass > 1:
                        yield f"data: {json.dumps({'reset': True})}\n\n"

                if kind == "on_chain_start" and name in node_progress_map:
                    pct, msg = node_progress_map[name]
                    yield f"data: {json.dumps({'progress_percentage': pct, 'message': msg})}\n\n"

                if kind == "on_tool_start":
                    steps = tool_progress_map.get(name, [(20, f"Running {name}...")])
                    for pct, msg in steps:
                        yield f"data: {json.dumps({'progress_percentage': pct, 'message': msg})}\n\n"
                        await asyncio.sleep(0.3)

                elif kind == "on_tool_end":
                    yield f"data: {json.dumps({'progress_percentage': 100, 'message': f'{name} complete.'})}\n\n"

                elif kind == "on_chat_model_stream":
                    # Only stream the WRITER's tokens. The supervisor emits its
                    # routing decision ("researcher") and reflect emits its verdict
                    # ("PASS") through the same event -- streaming those leaks
                    # internal reasoning into the user's answer.
                    if node != "writer":
                        continue
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content"):
                        content = chunk.content
                        if isinstance(content, str) and content:
                            streamed_any = True
                            yield f"data: {json.dumps({'text': content})}\n\n"
                        elif isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    text = block.get("text", "")
                                    if text:
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
            yield f"data: {json.dumps({'text': f'[Server error: {str(e)}]'})}\n\n"

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