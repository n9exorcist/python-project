"""
analyst.py — the only per-signal LLM node in the system.

Every token-reduction measure lives here, because this is where the tokens are.
The five, and where to find them:

  1. Cache by input hash        -> cache_key() + _cached() / _store()
  2. Top-3 RAG, not top-10      -> RAG_TOP_K
  3. JSON out, not prose        -> SCHEMA_HINT + json_mode
  4. Computed numbers, no OHLC  -> build_payload()
  5. Skip on thin days          -> should_run()

Measured on the reference prompt below, this comes to roughly 1,100 input
tokens per candidate against the ~4,000 a naive version sends. The cache
removes most repeat calls entirely: a name that survives the screen on
Tuesday and again on Thursday costs one call, not two.
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Callable

from llm_router import BudgetExceeded, complete

DB_PATH = os.getenv("AGENT_DB", "memory.db")

RAG_TOP_K = 3               # was 10; the tail chunks were ~60% of input tokens
CACHE_TTL_DAYS = 7
# Recalibrated for a sector-sized universe. At 2 this gate was written for a
# Nifty-500 sweep, where several names passing was normal and a lone survivor
# was noise worth skipping. Screening one sector, the universe is ~8-40 names
# and a single name clearing every filter is the expected *good* outcome — so
# the old value silenced the analyst exactly when it had something to say, and
# left the dashboard reporting "not analysed" on the only name that passed.
# One candidate costs ~1,500 tokens and one request against a 300,000/150 daily
# budget. Set to 2 again if you would rather batch.
MIN_CANDIDATES = 1
MAX_FINALISTS = 5           # hard ceiling on calls per scan
MAX_OUT_TOKENS = 400
# Gemini 3.x Flash "thinks" before answering, and those reasoning tokens are
# charged against max_tokens while contributing nothing to the content. Measured:
# 228 reasoning tokens to produce 34 tokens of JSON. At 400 x 1 candidate the
# answer was truncated mid-key and the whole batch was dropped — which became the
# common case the moment MIN_CANDIDATES dropped to 1.
#
# reasoning_effort="low" removes the overhead outright (reasoning_tokens -> none).
# The headroom below is belt and braces for a provider that ignores it; a few
# hundred unused tokens are free, a silently dropped verdict is not.
REASONING_HEADROOM = 700
REASONING_EFFORT = "low"
# Bumped: the context changed from FAISS document chunks to the NSE
# corporate calendar, so every cached verdict was formed on different
# evidence and must be re-asked.
PROMPT_VERSION = "analyst-v2.0-nse-events"

CACHE_SCHEMA = """
CREATE TABLE IF NOT EXISTS analyst_cache (
    key        TEXT PRIMARY KEY,
    symbol     TEXT NOT NULL,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ac_created ON analyst_cache(created_at);
"""

SYSTEM = (
    "You are a swing-trade analyst for NSE equities. You receive precomputed "
    "indicators and this company's actual NSE corporate calendar for the next "
    "21 days. You do not recompute anything. "
    "Your job is the veto: judge whether the listed corporate events, dilution, "
    "pledges, auditor or governance issues make this a bad swing entry over the "
    "next two to five weeks. "
    "Judge only what is shown. If the calendar says no events are on record, "
    "do not invent one; if it says the calendar could not be fetched, treat the "
    "event risk as unknown and prefer 'watch' over 'take'. "
    "Reply with a single JSON object and no other text."
)

SCHEMA_HINT = (
    '{"results":[{"sym":"<symbol>",'
    '"verdict":"take|watch|reject",'
    '"pattern":"<=4 words",'
    '"thesis":"<=45 words",'
    '"risks":["<=12 words each, max 3"],'
    '"event_within_21d":true|false}]}'
)

# All cache-misses go in ONE request rather than one per symbol. Two reasons:
# the system prompt and schema are sent once instead of five times, and on a
# 2 RPM free tier five sequential calls cost two and a half minutes of waiting.
BATCH = True


@dataclass
class Verdict:
    symbol: str
    verdict: str
    pattern: str
    thesis: str
    risks: list[str]
    event_within_21d: bool
    cached: bool = False

    def to_json(self) -> str:
        d = self.__dict__.copy()
        d.pop("cached", None)
        return json.dumps(d, separators=(",", ":"))


# ---------------------------------------------------------------------------
# 5. Gate — skip the node entirely on thin days
# ---------------------------------------------------------------------------
def should_run(candidates: list) -> tuple[bool, str]:
    n = len(candidates)
    if n == 0:
        return False, "no candidates"
    if n < MIN_CANDIDATES:
        return False, f"only {n} candidate; not worth an LLM call"
    return True, f"{min(n, MAX_FINALISTS)} of {n} candidates to analyst"


def rank_finalists(candidates: list) -> list:
    """Deterministic pre-ranking so the LLM only ever sees the best few.
    Closer to the 20 EMA is better (tighter stop); more volume is better.
    """
    return sorted(
        candidates,
        key=lambda c: (c.ext_pct / max(c.atr_pct, 0.1)) - min(c.vol_ratio, 6.0),
    )[:MAX_FINALISTS]


# ---------------------------------------------------------------------------
# 4. Compact payload — never raw OHLC
# ---------------------------------------------------------------------------
def build_payload(c) -> dict[str, Any]:
    """Eight numbers. A 260-bar OHLC array is ~11,000 tokens and tells the
    model nothing it can use that these do not.
    """
    return {
        "sym": c.symbol,
        "px": c.close,
        "e20": c.ema20,
        "e50": c.ema50,
        "e200": c.ema200,
        "rsi": c.rsi14,
        "volx": c.vol_ratio,
        "ext": c.ext_pct,
        "atr": c.atr_pct,
    }


# ---------------------------------------------------------------------------
# 1. Cache by input hash
# ---------------------------------------------------------------------------
# Per-field bucket widths. A single round(v, 1) across all fields does not
# work: RSI drifts by more than 0.1 every session, so the key changes daily and
# the cache never hits. These widths are set to the smallest move that could
# plausibly change the verdict.
CACHE_BUCKETS = {"rsi": 2.0, "volx": 0.5, "ext": 0.5, "atr": 0.5}

# Absolute price levels are deliberately excluded. This node's job is the
# corporate-event veto; that answer does not change because the stock moved
# 1%. Everything the verdict depends on is already in the ratios above.
CACHE_IGNORE = {"px", "e20", "e50", "e200"}


def cache_key(payload: dict, chunk_ids: list[str]) -> str:
    coarse: dict[str, Any] = {}
    for k, v in payload.items():
        if k in CACHE_IGNORE:
            continue
        step = CACHE_BUCKETS.get(k)
        coarse[k] = round(v / step) * step if (step and isinstance(v, (int, float))) else v
    blob = json.dumps(
        {"p": coarse, "c": sorted(chunk_ids), "v": PROMPT_VERSION},
        sort_keys=True, separators=(",", ":"),
    )
    return hashlib.sha256(blob.encode()).hexdigest()[:32]


def _con() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.executescript(CACHE_SCHEMA)
    return con


def _cached(key: str) -> dict | None:
    con = _con()
    try:
        row = con.execute(
            "SELECT payload, created_at FROM analyst_cache WHERE key=?", (key,)
        ).fetchone()
        if not row:
            return None
        age = datetime.now() - datetime.fromisoformat(row[1])
        if age > timedelta(days=CACHE_TTL_DAYS):
            con.execute("DELETE FROM analyst_cache WHERE key=?", (key,))
            con.commit()
            return None
        return json.loads(row[0])
    finally:
        con.close()


def _store(key: str, symbol: str, payload: dict) -> None:
    con = _con()
    try:
        con.execute(
            "INSERT OR REPLACE INTO analyst_cache (key,symbol,payload,created_at) "
            "VALUES (?,?,?,?)",
            (key, symbol, json.dumps(payload, separators=(",", ":")),
             datetime.now().isoformat()),
        )
        con.commit()
    finally:
        con.close()


def purge_cache(days: int = CACHE_TTL_DAYS) -> int:
    cutoff = (datetime.now() - timedelta(days=days)).isoformat()
    con = _con()
    try:
        cur = con.execute("DELETE FROM analyst_cache WHERE created_at < ?", (cutoff,))
        con.commit()
        return cur.rowcount
    finally:
        con.close()


# ---------------------------------------------------------------------------
# 2. Retrieval capped at top-3
# ---------------------------------------------------------------------------
_VECTOR_DB = None
_RETRIEVER_UNAVAILABLE = False


def _vector_db():
    """Load the same FAISS index mcp_server.py serves — once, lazily.

    Loaded directly rather than by importing mcp_server, which would drag in
    FastMCP, Tavily, and a live server just to read three chunks.
    """
    global _VECTOR_DB, _RETRIEVER_UNAVAILABLE
    if _VECTOR_DB is not None or _RETRIEVER_UNAVAILABLE:
        return _VECTOR_DB

    base = os.path.dirname(os.path.abspath(__file__))
    path = next(
        (p for p in (os.path.join(base, "faiss_index"),
                     os.path.join(base, "app", "faiss_index"))
         if os.path.exists(p)),
        None,
    )
    if not path:
        _RETRIEVER_UNAVAILABLE = True
        return None

    try:
        from langchain_community.vectorstores import FAISS
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        _VECTOR_DB = FAISS.load_local(
            path,
            GoogleGenerativeAIEmbeddings(
                model="models/gemini-embedding-001",
                google_api_key=os.getenv("GEMINI_API_KEY"),
            ),
            allow_dangerous_deserialization=True,
        )
    except Exception:
        # No index, no key, no network — the analyst degrades to indicators
        # only rather than taking the scan down with it.
        _RETRIEVER_UNAVAILABLE = True
        return None
    return _VECTOR_DB


def _chunk_id(doc) -> str:
    """Stable across runs; changes only when the chunk's content or version
    does — which is exactly what the cache key needs it to do.
    """
    meta = getattr(doc, "metadata", None) or {}
    body = hashlib.sha256(
        getattr(doc, "page_content", "").encode("utf-8")
    ).hexdigest()[:8]
    return (f"{meta.get('source', 'unknown')}:"
            f"{meta.get('doc_version', 'unversioned')}:{body}")


def default_retriever(symbol: str, k: int = RAG_TOP_K) -> list[dict]:
    """This company's NSE corporate calendar, as [{'id','text'}].

    Replaces the FAISS lookup this node used to do. That index holds the
    project's ingested documents — Accenture earnings PDFs — so querying it with
    an NSE smallcap symbol returned confidently irrelevant text, and the veto had
    nothing real to veto on.

    A calendar lookup is also the right shape for the question. "Is there a board
    meeting inside the hold period?" is a date-bounded query over structured
    records; similarity search can only approximate what SQL answers exactly.
    """
    try:
        import events

        events.refresh(symbol)
        return events.context_chunks(symbol, k)[:k]
    except Exception as e:
        # An unreachable exchange must read as unknown, never as all-clear.
        return [{"id": f"nse:{symbol}:error",
                 "text": f"NSE calendar unavailable ({str(e)[:80]}); "
                         f"event risk unknown"}]


def _trim(text: str, words: int = 90) -> str:
    parts = text.split()
    return " ".join(parts[:words]) + ("…" if len(parts) > words else "")



def _parse_results(raw: Any) -> list | None:
    """Tolerate the shapes the model actually returns, not just the documented one.

    Gemini honours response_format={"type": "json_object"} but not the schema
    described inside the prompt, so it returns a bare [...] array roughly as
    often as {"results": [...]}. A truncated or filtered response yields
    content=None. The previous json.loads(raw).get(...) raised TypeError on the
    first and AttributeError on the second -- neither caught, both taking the
    whole scan down instead of dropping one batch.

    Returns None when nothing usable came back.
    """
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("results", "data", "items", "symbols"):
            v = data.get(key)
            if isinstance(v, list):
                return v
        if "sym" in data:            # single symbol, unwrapped
            return [data]
    return None


# ---------------------------------------------------------------------------
# Main entry
# ---------------------------------------------------------------------------
def analyze(
    candidates: list,
    retriever: Callable[[str, int], list[dict]] = default_retriever,
    completer: Callable[..., Any] = complete,
) -> tuple[list[Verdict], list[str]]:
    run, reason = should_run(candidates)
    notes = [reason]
    if not run:
        return [], notes

    finalists = rank_finalists(candidates)
    out: list[Verdict] = []
    misses: list[tuple[Any, dict, str, list[dict]]] = []

    # Pass 1 — resolve from cache per symbol. Caching stays per-symbol even
    # though the call is batched, otherwise one new name would invalidate the
    # whole group.
    for c in finalists:
        payload = build_payload(c)
        chunks = retriever(c.symbol, RAG_TOP_K)[:RAG_TOP_K]
        key = cache_key(payload, [ch["id"] for ch in chunks])
        hit = _cached(key)
        if hit:
            out.append(Verdict(**hit, cached=True))
            notes.append(f"{c.symbol}: cache hit, 0 tokens")
        else:
            misses.append((c, payload, key, chunks))

    if not misses:
        notes.append("all finalists cached; no LLM call")
        return out, notes

    # Pass 2 — one request for everything the cache could not answer.
    blocks = []
    for c, payload, _key, chunks in misses:
        ctx = "\n".join(f"[{ch['id']}] {_trim(ch['text'])}" for ch in chunks)
        blocks.append(
            f"DATA {json.dumps(payload, separators=(',', ':'))}\n"
            f"FILINGS\n{ctx or '(none retrieved)'}"
        )
    user = (
        "\n---\n".join(blocks)
        + f"\n\nOne entry per symbol, in order. Return exactly: {SCHEMA_HINT}"
    )
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user},
    ]

    try:
        resp = completer(
            node="analyst", messages=messages,
            max_tokens=REASONING_HEADROOM + MAX_OUT_TOKENS * len(misses),
            json_mode=True, reasoning_effort=REASONING_EFFORT,
        )
    except BudgetExceeded as e:
        notes.append(f"batch of {len(misses)} skipped — {e}")
        return out, notes

    choice = resp.choices[0]
    raw = getattr(choice.message, "content", None)
    results = _parse_results(raw)
    if results is None:
        # Name the actual cause. "Unparseable" covers a refusal, a filter and a
        # truncation alike, and only one of those is fixed by a bigger budget —
        # so say which happened rather than making the next person guess.
        why = ("response hit the token ceiling mid-JSON"
               if getattr(choice, "finish_reason", None) == "length"
               else f"unparseable response ({type(raw).__name__})")
        notes.append(f"analyst batch dropped: {why}")
        return out, notes

    by_sym = {str(r.get("sym", "")).upper(): r for r in results if isinstance(r, dict)}
    notes.append(f"1 LLM call covered {len(misses)} symbols")

    for c, payload, key, _chunks in misses:
        data = by_sym.get(c.symbol.upper())
        if not data:
            notes.append(f"{c.symbol}: missing from response, dropped")
            continue
        # The event flag is COMPUTED, never taken from the model. It gates a
        # real entry (jobs.py drops any take with an event inside the window),
        # and a model that has been handed a calendar will still occasionally
        # answer false because the numbers look bullish. The calendar decides.
        try:
            import events as _ev

            has_event = bool(_ev.upcoming(c.symbol))
            unknown = not _ev.fetch_ok(c.symbol)
        except Exception:
            has_event, unknown = False, True

        v = Verdict(
            symbol=c.symbol,
            verdict=str(data.get("verdict", "watch")).lower(),
            pattern=str(data.get("pattern", ""))[:40],
            thesis=str(data.get("thesis", ""))[:400],
            risks=[str(r)[:80] for r in (data.get("risks") or [])][:3],
            event_within_21d=has_event,
        )
        # Could not reach the exchange: an unverified name must not be entered
        # on an all-clear we never actually got.
        if unknown and v.verdict == "take":
            v.verdict = "watch"
            v.risks = (v.risks + ["NSE calendar unavailable; event risk unchecked"])[:3]
        if v.verdict not in ("take", "watch", "reject"):
            v.verdict = "watch"
        _store(key, c.symbol, {k: getattr(v, k) for k in
                               ("symbol", "verdict", "pattern", "thesis",
                                "risks", "event_within_21d")})
        out.append(v)
        notes.append(f"{c.symbol}: {v.verdict}")

    return out, notes
