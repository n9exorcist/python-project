"""models.py — the one place a provider's model id is written down.

Groq retired `llama-3.3-70b-versatile` without notice and the chat app returned
a raw 404 to the user's face:

    The model `llama-3.3-70b-versatile` does not exist or you do not have
    access to it.

Six files hardcoded that string. Providers retiring models is routine, not
exceptional, so the id belongs in configuration: set GROQ_MODEL in .env and
every call site follows, with no code change.

Check what a key can actually reach before changing the default — the list is
per-account, so a model another project uses may not exist for this one:

    curl -H "Authorization: Bearer $GROQ_API_KEY" \
         https://api.groq.com/openai/v1/models
"""

from __future__ import annotations

import os

# 131K context. Chat and tool-calling both verified against this account on
# 2026-09-07; the graph needs tool calling, so a model that only chats is not a
# valid substitute here. Alternatives live on the same key today:
#   openai/gpt-oss-20b   - smaller, faster, same 131K window
#   qwen/qwen3.8-27b     - 131K, also tool-calling
# groq/compound and compound-mini are agentic systems with their own built-in
# tools, not drop-in chat models. Do not swap one in without testing the graph.
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# LiteLLM addresses models as "<provider>/<id>"; langchain_groq wants the bare
# id. Keeping both here stops the prefix being bolted on at each call site,
# which is how one of them ends up with "groq/groq/...".
GROQ_MODEL_LITELLM = f"groq/{GROQ_MODEL}"
