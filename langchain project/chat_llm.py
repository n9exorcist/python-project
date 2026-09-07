"""chat_llm.py — the chat model handed to the graph, plus its fallback chain.

Why a fallback at all. Groq's on-demand tier caps EVERY chat model on this
account at the same 8,000 tokens per minute. Measured from the rate-limit
headers on 2026-09-07, not assumed:

    openai/gpt-oss-120b            8000 TPM   1000 RPM
    openai/gpt-oss-20b             8000 TPM   1000 RPM
    openai/gpt-oss-safeguard-20b   8000 TPM   1000 RPM
    qwen/qwen3.8-27b               8000 TPM   1000 RPM
    qwen/qwen3.6-27b               8000 TPM   1000 RPM
    groq/compound                 70000 TPM    250 RPM
    groq/compound-mini            70000 TPM    250 RPM

A web-search answer weighing 8,088 tokens returns 413 on every one of the top
five, so falling back from one Groq chat model to another is theatre — the
request is over the limit no matter which of them receives it. The two compound
models do have real headroom, and both reject tool calling outright:

    `tool calling` is not supported with this model

The graph binds MCP tools to every specialist, so they are not candidates. That
leaves a different provider, and Gemini is already a dependency, already keyed,
and already trusted by the swing agent.

Two shapes have to be reconciled.

1. build_supervisor_graph() calls llm.bind_tools() itself, and LangChain's
   with_fallbacks() returns a RunnableWithFallbacks, which has no bind_tools().
   So the fallback is applied per bound variant, after binding — not once at
   the top.

2. Gemini returns `content` as a list of blocks where Groq returns a plain str.
   Nothing crashes on that, because every call site already guards with
   `isinstance(c, str) else str(c)` — but the supervisor routes on
   `resp.content.strip().lower()`, and "[{'type': 'text', 'text': 'web'...}]"
   matches no agent name. The failure would be a graph that silently stops
   delegating, which is far worse than a visible 413. So Gemini's output is
   flattened back to text before it reaches the graph.
"""

from __future__ import annotations

import os

from langchain_core.runnables import RunnableLambda

from models import GROQ_MODEL

# Gemini's free tier is far above Groq's 8K TPM, which is the entire point of
# reaching for it. Same model the swing analyst uses.
GEMINI_CHAT_MODEL = os.getenv("GEMINI_CHAT_MODEL", "gemini-3.6-flash")


def _as_text(msg):
    """Flatten Gemini's content blocks to the plain string Groq would return.

    Preserves tool_calls, id and usage metadata — only `content` changes.
    """
    content = getattr(msg, "content", None)
    if not isinstance(content, list):
        return msg
    text = "".join(
        b.get("text", "")
        for b in content
        if isinstance(b, dict) and b.get("type") == "text"
    )
    return msg.model_copy(update={"content": text})


class _Normalised:
    """A chat model whose replies are coerced to string content."""

    def __init__(self, llm):
        self._llm = llm
        self._chain = llm | RunnableLambda(_as_text)

    def bind_tools(self, tools, **kwargs):
        return self._llm.bind_tools(tools, **kwargs) | RunnableLambda(_as_text)

    def __getattr__(self, name):
        return getattr(self._chain, name)


class FallbackChat:
    """Quacks like a chat model, but every call carries a fallback chain.

    bind_tools() binds the SAME tools to each provider and only then applies the
    fallback, because a RunnableWithFallbacks cannot bind anything.
    """

    def __init__(self, primary, fallbacks):
        self.primary = primary
        self.fallbacks = [f for f in fallbacks if f is not None]
        # with_fallbacks() validates that each entry IS a Runnable, and
        # _Normalised is a plain wrapper, not one. Its ._chain is the real
        # Runnable; bind_tools() below already returns real Runnables for both.
        runnables = [getattr(f, "_chain", f) for f in self.fallbacks]
        self._chain = primary.with_fallbacks(runnables) if runnables else primary

    def bind_tools(self, tools, **kwargs):
        bound = self.primary.bind_tools(tools, **kwargs)
        if not self.fallbacks:
            return bound
        return bound.with_fallbacks(
            [f.bind_tools(tools, **kwargs) for f in self.fallbacks]
        )

    def __getattr__(self, name):
        return getattr(self._chain, name)


def build_chat_llm(callbacks=None):
    """Groq first for latency, Gemini behind it for the requests Groq refuses."""
    from langchain_groq import ChatGroq

    primary = ChatGroq(
        model_name=GROQ_MODEL,
        temperature=0,
        api_key=os.getenv("GROQ_API_KEY"),
        # Attached to the LLM itself, not just the request config, so calls made
        # by any caller (including LangGraph Studio) count toward the daily
        # total. Only Groq calls belong on the Groq budget, which is why the
        # Gemini fallback below does not carry this handler.
        callbacks=callbacks or [],
    )

    fallbacks = []
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if gemini_key:
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI

            fallbacks.append(
                _Normalised(
                    ChatGoogleGenerativeAI(
                        model=GEMINI_CHAT_MODEL,
                        temperature=0,
                        google_api_key=gemini_key,
                    )
                )
            )
        except ImportError:
            pass

    names = [GROQ_MODEL] + ([GEMINI_CHAT_MODEL] if fallbacks else [])
    print(f"--- CHAT LLM: {' -> '.join(names)} ---")
    if not fallbacks:
        print("--- WARNING: no fallback. A request over Groq's 8K TPM will 413. ---")
    return FallbackChat(primary, fallbacks)
