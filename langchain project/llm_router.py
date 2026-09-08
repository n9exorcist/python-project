"""
llm_router.py — one call site for every LLM request in the system.

Gemini-primary. Mistral is kept in the model list but is optional: if
MISTRAL_API_KEY is unset, those deployments are dropped at startup and the
fallback chains close over the gap.

Two guards, because the two providers fail differently:

  - Gemini free tier is REQUEST-capped with generous token allowances.
  - Groq free tier is TOKEN-capped.

So the ledger tracks both, and a call is refused if it would breach either.
Guarding only tokens would let a runaway loop burn a request quota while the
token counter still looked healthy.

Model IDs verified against Google's release notes. They move fast — the 2.0
line was shut down in June 2026 and the `-latest` aliases were repointed in
January. Pin explicit versions here rather than using aliases, so a Google
repoint cannot silently change which model your analyst runs on.

Env vars:
    GEMINI_API_KEY   (required)
    GROQ_API_KEY     (optional, for the latency-sensitive `fast` node)
    MISTRAL_API_KEY  (optional)
    CEREBRAS_API_KEY (optional)
"""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo
from typing import Any

import litellm
from dotenv import find_dotenv, load_dotenv
from litellm import Router

# Explicit, and before every os.getenv() below. litellm happens to call
# load_dotenv() itself on import, which made this module work by accident --
# depending on another package's import side effect is not a plan. The project
# .env sits one directory above the repo root, hence find_dotenv().
load_dotenv(find_dotenv())

# Imported after load_dotenv: models.py reads GROQ_MODEL from the environment.
from models import GROQ_MODEL_LITELLM  # noqa: E402

litellm.drop_params = True          # providers disagree on accepted kwargs
litellm.suppress_debug_info = True

DB_PATH = os.getenv("AGENT_DB", "memory.db")


def _key(*names: str) -> str | None:
    """First environment name that resolves wins.

    The SWING_ prefix is not decoration. This machine already carries a
    machine-level GEMINI_API_KEY, and python-dotenv does not override the real
    environment (override=False), so a fresh-project key written into .env is
    silently ignored and every call bills the old project instead. That is
    exactly the per-project quota isolation this system is built around, failing
    quietly. A name the machine does not already define cannot be shadowed.
    """
    for n in names:
        v = os.getenv(n)
        if v:
            return v
    return None


GEMINI_KEY = _key("SWING_GEMINI_API_KEY", "GEMINI_API_KEY")
GROQ_KEY = _key("SWING_GROQ_API_KEY", "GROQ_API_KEY")
MISTRAL_KEY = _key("MISTRAL_API_KEY")
CEREBRAS_KEY = _key("CEREBRAS_API_KEY")

# ---------------------------------------------------------------------------
# Daily budgets. Set below published free tiers so a mid-quarter quota cut
# degrades the system instead of breaking it silently. Verify against each
# provider's own rate-limit page before relying on these.
# ---------------------------------------------------------------------------
TOKEN_BUDGETS: dict[str, int] = {
    "gemini":   300_000,
    "groq":      40_000,     # reserves the rest of the 100K for the options job
    "mistral":  600_000,
    "cerebras": 500_000,
}

REQUEST_BUDGETS: dict[str, int] = {
    "gemini":   150,         # well under the free RPD; this system needs ~2
    "groq":     200,
    "mistral":   50,
    "cerebras": 100,
}

# ---------------------------------------------------------------------------
# Model list
# ---------------------------------------------------------------------------
_RAW_MODELS: list[dict[str, Any]] = [
    {
        # Analyst: one batched call per scan carrying all cache-misses.
        # 3.6 Flash is the token-efficient GA Flash model.
        "model_name": "analyst",
        "litellm_params": {
            "model": "gemini/gemini-3.6-flash",
            "api_key": GEMINI_KEY,
        },
        "model_info": {"provider": "gemini"},
        "_key": GEMINI_KEY,
    },
    {
        "model_name": "analyst-fallback",
        "litellm_params": {
            "model": "mistral/mistral-large-latest",
            "api_key": MISTRAL_KEY,
            "rpm": 2,
        },
        "model_info": {"provider": "mistral"},
        "_key": MISTRAL_KEY,
    },
    {
        # Reporter: weekly, low stakes. Flash-Lite is the cheap subagent tier.
        "model_name": "reporter",
        "litellm_params": {
            "model": "gemini/gemini-3.5-flash-lite",
            "api_key": GEMINI_KEY,
        },
        "model_info": {"provider": "gemini"},
        "_key": GEMINI_KEY,
    },
    {
        "model_name": "reporter-fallback",
        "litellm_params": {
            "model": "gemini/gemini-3.6-flash",
            "api_key": GEMINI_KEY,
        },
        "model_info": {"provider": "gemini"},
        "_key": GEMINI_KEY,
    },
    {
        # Short and latency-sensitive: where Groq's speed actually earns
        # something. Shares the 100K cap with the existing options job.
        "model_name": "fast",
        "litellm_params": {
            "model": GROQ_MODEL_LITELLM,
            "api_key": GROQ_KEY,
        },
        "model_info": {"provider": "groq"},
        "_key": GROQ_KEY,
    },
    {
        "model_name": "fast-fallback",
        "litellm_params": {
            "model": "cerebras/llama-3.3-70b",
            "api_key": CEREBRAS_KEY,
        },
        "model_info": {"provider": "cerebras"},
        "_key": CEREBRAS_KEY,
    },
]


def _available() -> list[dict[str, Any]]:
    """Drop deployments whose key is missing. A model list entry with
    api_key=None fails at call time with a confusing auth error; dropping it
    up front lets the fallback chain handle the gap cleanly.
    """
    out = []
    for m in _RAW_MODELS:
        if m["_key"]:
            out.append({k: v for k, v in m.items() if not k.startswith("_")})
    return out


MODEL_LIST = _available()
_NAMES = {m["model_name"] for m in MODEL_LIST}

_ALL_FALLBACKS = [
    {"analyst": ["analyst-fallback", "reporter", "fast"]},
    {"reporter": ["reporter-fallback", "analyst", "fast"]},
    {"fast": ["fast-fallback", "reporter"]},
]
FALLBACKS = [
    {k: [x for x in v if x in _NAMES]}
    for f in _ALL_FALLBACKS for k, v in f.items()
    if k in _NAMES and any(x in _NAMES for x in v)
]

PROVIDER_OF = {m["model_name"]: m["model_info"]["provider"] for m in _RAW_MODELS}

_router: Router | None = None


def router() -> Router:
    global _router
    if _router is None:
        if not MODEL_LIST:
            raise RuntimeError("No provider keys found. Set GEMINI_API_KEY at minimum.")
        _router = Router(
            model_list=MODEL_LIST,
            fallbacks=FALLBACKS,
            num_retries=2,
            cooldown_time=60,
            allowed_fails=2,
            routing_strategy="simple-shuffle",
            enable_pre_call_checks=True,
        )
    return _router


# ---------------------------------------------------------------------------
# Ledger
# ---------------------------------------------------------------------------
LEDGER_SCHEMA = """
-- One row per call. token_ledger below stays an aggregate by node, which is
-- what the budget guard reads; this is the per-call detail, and it is the only
-- place that records the model that ACTUALLY served. The two differ precisely
-- when a fallback fires, which is the moment you most want to see.
CREATE TABLE IF NOT EXISTS llm_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    day        TEXT NOT NULL,
    at         TEXT NOT NULL,
    node       TEXT NOT NULL,      -- the role that was asked for
    served_by  TEXT NOT NULL,      -- the deployment that answered
    provider   TEXT NOT NULL,
    model      TEXT,               -- the provider's own model id
    tokens_in  INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    fell_back  INTEGER NOT NULL DEFAULT 0,
    reason     TEXT                -- why, when it did
);
CREATE INDEX IF NOT EXISTS ix_events_day ON llm_events(day);

CREATE TABLE IF NOT EXISTS token_ledger (
    day        TEXT NOT NULL,
    provider   TEXT NOT NULL,
    node       TEXT NOT NULL,
    calls      INTEGER NOT NULL DEFAULT 0,
    tokens_in  INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, provider, node)
);
"""


class BudgetExceeded(RuntimeError):
    """Raised before a call that would breach a daily budget."""


@dataclass
class Usage:
    provider: str
    node: str
    tokens_in: int
    tokens_out: int
    served_by: str = ""      # the deployment that answered; node when no fallback
    model: str = ""          # the provider's own id, read off the response
    fell_back: int = 0
    reason: str = ""


def _con() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.executescript(LEDGER_SCHEMA)
    return con


def spent_today(provider: str, day: str | None = None) -> tuple[int, int]:
    """(tokens, requests) used today."""
    day = day or date.today().isoformat()
    con = _con()
    try:
        row = con.execute(
            "SELECT COALESCE(SUM(tokens_in + tokens_out), 0), COALESCE(SUM(calls), 0) "
            "FROM token_ledger WHERE day=? AND provider=?", (day, provider),
        ).fetchone()
        return int(row[0]), int(row[1])
    finally:
        con.close()


def record(u: Usage, day: str | None = None) -> None:
    day = day or date.today().isoformat()
    con = _con()
    try:
        con.execute(
            "INSERT INTO token_ledger (day, provider, node, calls, tokens_in, tokens_out) "
            "VALUES (?,?,?,1,?,?) "
            "ON CONFLICT(day, provider, node) DO UPDATE SET "
            "calls = calls + 1, "
            "tokens_in = tokens_in + excluded.tokens_in, "
            "tokens_out = tokens_out + excluded.tokens_out",
            (day, u.provider, u.node, u.tokens_in, u.tokens_out),
        )
        con.execute(
            "INSERT INTO llm_events (day, at, node, served_by, provider, model, "
            "tokens_in, tokens_out, fell_back, reason) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (day, datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds"),
             u.node, u.served_by or u.node, u.provider, u.model,
             u.tokens_in, u.tokens_out, u.fell_back, u.reason),
        )
        con.commit()
    finally:
        con.close()


def estimate_tokens(model: str, messages: list[dict]) -> int:
    try:
        return int(litellm.token_counter(model=model, messages=messages))
    except Exception:
        return sum(len(str(m.get("content", ""))) for m in messages) // 4


def headroom(provider: str) -> dict[str, int]:
    tok, req = spent_today(provider)
    tb = TOKEN_BUDGETS.get(provider, 0)
    rb = REQUEST_BUDGETS.get(provider, 0)
    return {
        "tokens_left": max(0, tb - tok), "token_budget": tb,
        "requests_left": max(0, rb - req), "request_budget": rb,
    }


# ---------------------------------------------------------------------------
# The single call site
# ---------------------------------------------------------------------------
# The declared chains, flattened once: {"analyst": ["reporter", "fast"], ...}
_CHAIN: dict[str, list[str]] = {k: v for d in FALLBACKS for k, v in d.items()}


def _affordable(node: str, need: int) -> tuple[str | None, str]:
    """The first deployment in this node's chain whose provider can still pay.

    THE BUG THIS FIXES. There are two independent failover mechanisms here, and
    the budget guard used to defeat the other one:

      * LiteLLM's own fallbacks handle a call that FAILS -- a 429, a 500, a
        timeout. Those fire inside router().completion().
      * This budget guard handles a provider that is SPENT, and it runs BEFORE
        the router is ever entered.

    The guard used to raise BudgetExceeded as soon as the intended provider was
    out of budget. Because it ran first, LiteLLM never got the chance to route
    to the chain -- so "analyst" would die with Gemini exhausted while "fast"
    sat idle on a completely separate Groq budget. The chain was declared,
    tested, and unreachable in the one situation it was written for.

    Now the chain is consulted for affordability too. A node is only refused
    when every deployment behind it is also spent, which is the honest answer.
    """
    live = {d["model_name"] for d in _available()}
    for candidate in [node] + _CHAIN.get(node, []):
        if candidate not in live:
            continue                      # no key for it; already dropped
        provider = PROVIDER_OF.get(candidate, "unknown")
        h = headroom(provider)
        if h["requests_left"] >= 1 and need <= h["tokens_left"]:
            return candidate, provider
    return None, ""


def complete(
    node: str,
    messages: list[dict],
    max_tokens: int = 700,
    json_mode: bool = True,
    **kwargs: Any,
):
    est_in = estimate_tokens(node, messages)
    need = est_in + max_tokens

    served, provider = _affordable(node, need)
    if served is None:
        spent = ", ".join(
            f"{PROVIDER_OF.get(c, '?')} {headroom(PROVIDER_OF.get(c, '?'))['tokens_left']:,} left"
            for c in [node] + _CHAIN.get(node, [])
        )
        raise BudgetExceeded(
            f"{node}: needs ~{need:,} tokens and every fallback is spent ({spent})"
        )

    fell_back = served != node
    reason = f"{PROVIDER_OF.get(node, '?')} budget spent" if fell_back else ""
    if fell_back:
        print(f"[router] {node} -> {served} ({reason})")

    if json_mode:
        kwargs.setdefault("response_format", {"type": "json_object"})

    resp = router().completion(
        model=served, messages=messages, max_tokens=max_tokens, **kwargs
    )

    # The model the provider says answered. When LiteLLM's own fallbacks fire
    # inside completion(), this is the only signal that they did -- the
    # deployment we asked for and the model that replied stop agreeing.
    actual = str(getattr(resp, "model", "") or "")

    usage = getattr(resp, "usage", None)
    record(Usage(
        provider=provider,
        node=node,
        tokens_in=int(getattr(usage, "prompt_tokens", est_in) or est_in),
        tokens_out=int(getattr(usage, "completion_tokens", 0) or 0),
        served_by=served,
        model=actual,
        fell_back=int(fell_back),
        reason=reason,
    ))
    return resp


def daily_summary(day: str | None = None) -> str:
    day = day or date.today().isoformat()
    con = _con()
    try:
        rows = con.execute(
            "SELECT provider, node, calls, tokens_in, tokens_out FROM token_ledger "
            "WHERE day=? ORDER BY provider, node", (day,),
        ).fetchall()
    finally:
        con.close()
    if not rows:
        return f"{day}: no LLM calls."

    lines = [f"LLM USAGE {day}", ""]
    for prov, node, calls, ti, to in rows:
        lines.append(f"  {prov:9s} {node:18s} {calls:3d} req  {ti + to:7,d} tok")
    lines.append("")
    for prov in TOKEN_BUDGETS:
        tok, req = spent_today(prov, day)
        if tok or req:
            h = headroom(prov)
            lines.append(
                f"  {prov:9s} {tok:7,d}/{h['token_budget']:,} tok   "
                f"{req}/{h['request_budget']} req"
            )
    return "\n".join(lines)


if __name__ == "__main__":
    print("deployments active:", sorted(_NAMES) or "(none — set GEMINI_API_KEY)")
    print("gemini key in use :",
          f"...{GEMINI_KEY[-6:]}" if GEMINI_KEY else "(none)",
          "via SWING_GEMINI_API_KEY" if os.getenv("SWING_GEMINI_API_KEY")
          else "via GEMINI_API_KEY — check this is the isolated project's key")
    print("fallback chains   :", FALLBACKS)
    print()
    for p in TOKEN_BUDGETS:
        h = headroom(p)
        print(f"  {p:9s} {h['tokens_left']:,} tok / "
              f"{h['requests_left']} req remaining today")
    print()
    print(daily_summary())