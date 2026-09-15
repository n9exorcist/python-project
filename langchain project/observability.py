"""
Lightweight observability for the agent.

Captures per-request metrics (the four the course names: step efficiency, latency,
tokens/cost, success) via a LangChain callback handler, and adds a DAILY TOKEN
BUDGET GUARD that warns before you hit your provider's cap -- the thing that just
429'd you at 99,817/100,000.

Wire it into your graph's config callbacks (see routes.py):
    from observability import obs_handler
    config = {"configurable": {"thread_id": tid}, "recursion_limit": 40,
              "callbacks": [obs_handler]}
    obs_handler.begin_request()
    async for event in app_graph.astream_events(inp, config, version="v2"):
        ...
    obs_handler.end_request(label=user_message[:40])

Outputs:
  - a one-line summary per request in the server log
  - a structured record appended to logs/metrics.jsonl
  - a running daily total in logs/token_usage_<date>.json (survives restarts)

Note: aggregates one active request at a time (fine for sequential eval runs and
typical single-user chat). For concurrent load, track per run_id from callback kwargs.

IMPORTANT -- what the daily counter can and cannot see:
  It counts every call made through a ChatGroq object this handler is attached to,
  across processes (the daily total lives in logs/token_usage_<date>.json). Attach it
  in BOTH main.py and studio_graph.py, or `langgraph dev` traffic burns your quota
  invisibly. It still cannot see:
    - requests that FAIL (a 429 costs quota at Groq; on_llm_end never fires here)
    - any process that builds its own LLM without this handler (e.g. evals/run_evals.py)
  So Groq's own number is always the authoritative one; this is an early-warning gauge.
"""

import os
import json
import time
import threading
from pathlib import Path
from datetime import datetime, timezone

from langchain_core.callbacks import BaseCallbackHandler

LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)
METRICS_FILE = LOG_DIR / "metrics.jsonl"

# Daily caps, PER PROVIDER, in the unit each provider actually meters.
#
# One counter measured against one provider's cap is how you get "190,483 /
# 100,000 (190%)" -- a gauge reading 190% of a limit nothing enforced. The
# 100,000 is Groq's free-tier TPD; the total included every Gemini call the
# fallback made, and the fallback runs *precisely* when Groq has run out. So the
# gauge was guaranteed to break 100% on any day the failover worked.
#
# Groq meters tokens per day. Gemini's free tier meters REQUESTS per day, per
# model -- its token count is informational, not a budget. Showing each against
# its own denominator is what makes a percentage mean something again.
DAILY_TOKEN_LIMIT = int(os.getenv("DAILY_TOKEN_LIMIT", "100000"))
GEMINI_DAILY_REQUESTS = int(os.getenv("GEMINI_DAILY_REQUESTS", "20"))
WARN_AT = 0.80

# Token-capped providers: name -> daily token allowance.
TOKEN_CAPS = {"groq": DAILY_TOKEN_LIMIT}
# Request-capped providers: name -> daily request allowance.
REQUEST_CAPS = {"gemini": GEMINI_DAILY_REQUESTS}


def _provider_of(model: str) -> str:
    """Which budget a model's usage belongs to.

    Substring matching on the model id, because that is all `llm_output` gives
    us and it is stable enough: Groq serves gpt-oss / llama / qwen / kimi, and
    Google's are all named gemini-*. Anything unrecognised gets its own bucket
    rather than being silently charged to Groq -- an unknown model landing on
    someone else's budget is the bug this function exists to prevent.
    """
    m = (model or "").lower()
    if "gemini" in m:
        return "gemini"
    if any(k in m for k in ("gpt-oss", "llama", "qwen", "kimi", "moonshot", "groq")):
        return "groq"
    return m.split("/")[0] or "unknown"

# Optional cost estimate: USD per 1M tokens (set to your plan's rate; 0 = skip).
COST_PER_1M_TOKENS = float(os.getenv("COST_PER_1M_TOKENS", "0"))


def _today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class Observability(BaseCallbackHandler):
    def __init__(self):
        self._lock = threading.Lock()
        self._seen_runs = set()
        self._reset_run()

    def _reset_run(self):
        self.t0 = time.time()
        self.llm_calls = 0
        self.tool_calls = 0
        self.tool_errors = 0
        self.prompt_tokens = 0
        self.completion_tokens = 0

    # ---------------- LLM ----------------
    def on_llm_end(self, response, **kwargs):
        # This handler is attached BOTH to the ChatGroq object (so Studio / eval
        # traffic counts toward the daily total) and to the graph config (so tool
        # calls count). Both paths fire on_llm_end for the same call -- dedupe by
        # run_id or every token gets counted twice.
        run_id = kwargs.get("run_id")
        if run_id is not None:
            with self._lock:
                if run_id in self._seen_runs:
                    return
                self._seen_runs.add(run_id)
                if len(self._seen_runs) > 1000:
                    self._seen_runs.clear()

        self.llm_calls += 1
        out = getattr(response, "llm_output", None) or {}
        model = out.get("model_name") or out.get("model") or ""
        if not model:
            # Newer LangChain puts it on the message instead of llm_output.
            try:
                for gen_list in response.generations:
                    for gen in gen_list:
                        meta = getattr(getattr(gen, "message", None),
                                       "response_metadata", None) or {}
                        model = meta.get("model_name") or meta.get("model") or ""
                        if model:
                            break
                    if model:
                        break
            except Exception:
                pass
        usage = out.get("token_usage") or out.get("usage") or {}
        pt = usage.get("prompt_tokens", 0) or 0
        ct = usage.get("completion_tokens", 0) or 0
        # Fallback: usage_metadata on the generations (newer LangChain).
        if not pt and not ct:
            try:
                for gen_list in response.generations:
                    for gen in gen_list:
                        msg = getattr(gen, "message", None)
                        um = getattr(msg, "usage_metadata", None) if msg else None
                        if um:
                            pt += um.get("input_tokens", 0) or 0
                            ct += um.get("output_tokens", 0) or 0
            except Exception:
                pass
        self.prompt_tokens += pt
        self.completion_tokens += ct
        self._add_daily_tokens(pt + ct, _provider_of(model))

    # ---------------- tools ----------------
    def on_tool_start(self, serialized, input_str, **kwargs):
        self.tool_calls += 1

    def on_tool_error(self, error, **kwargs):
        self.tool_errors += 1

    # ---------------- daily budget ----------------
    def _daily_file(self):
        return LOG_DIR / f"token_usage_{_today()}.json"

    def _read_state(self):
        """{"date", "tokens", "providers": {name: {"tokens", "requests"}}}.

        Files written before this was per-provider carry only `tokens`; they load
        with an empty providers map rather than being discarded, so a day already
        in progress keeps its total.
        """
        f = self._daily_file()
        if f.exists():
            try:
                d = json.loads(f.read_text())
                return {"tokens": d.get("tokens", 0),
                        "providers": d.get("providers", {})}
            except Exception:
                pass
        return {"tokens": 0, "providers": {}}

    def _read_daily(self):
        return self._read_state()["tokens"]

    def _add_daily_tokens(self, n, provider="unknown"):
        if n <= 0:
            return
        with self._lock:
            st = self._read_state()
            st["tokens"] += n
            p = st["providers"].setdefault(provider, {"tokens": 0, "requests": 0})
            p["tokens"] += n
            p["requests"] += 1
            self._daily_file().write_text(json.dumps(
                {"date": _today(), "tokens": st["tokens"], "providers": st["providers"]}))

            # Warn against the cap that actually applies to THIS provider, in the
            # unit it meters. A warning fired off the mixed total told you nothing
            # about which provider was nearly out.
            if provider in TOKEN_CAPS and TOKEN_CAPS[provider]:
                cap = TOKEN_CAPS[provider]
                frac = p["tokens"] / cap
                if frac >= WARN_AT:
                    print(f"!!! [OBS] {provider.upper()} TOKEN BUDGET: "
                          f"{p['tokens']:,}/{cap:,} ({frac:.0%}) today.")
            elif provider in REQUEST_CAPS and REQUEST_CAPS[provider]:
                cap = REQUEST_CAPS[provider]
                if p["requests"] / cap >= WARN_AT:
                    print(f"!!! [OBS] {provider.upper()} REQUEST BUDGET: "
                          f"{p['requests']}/{cap} calls today.")

    def _budget_line(self):
        """One clause per provider, each against its own denominator."""
        st = self._read_state()
        parts = []
        # Token-capped first: that is the budget that actually runs out and
        # sends traffic to the others, so it belongs at the front of the line.
        def _rank(kv):
            n = kv[0]
            return (0 if n in TOKEN_CAPS else 1 if n in REQUEST_CAPS else 2, n)

        for name, p in sorted(st["providers"].items(), key=_rank):
            if name in TOKEN_CAPS and TOKEN_CAPS[name]:
                cap = TOKEN_CAPS[name]
                parts.append(f"{name} {p['tokens']:,}/{cap:,} ({p['tokens']/cap:.0%})")
            elif name in REQUEST_CAPS and REQUEST_CAPS[name]:
                parts.append(f"{name} {p['requests']}/{REQUEST_CAPS[name]} req "
                             f"({p['tokens']:,} tok)")
            else:
                parts.append(f"{name} {p['tokens']:,} tok")
        if not parts:
            # Nothing attributed yet (or a pre-upgrade file): report the raw
            # total without a denominator rather than inventing one.
            return f"{st['tokens']:,} tok"
        return " · ".join(parts)

    # ---------------- request lifecycle ----------------
    def begin_request(self):
        self._reset_run()

    def end_request(self, label=""):
        total_tokens = self.prompt_tokens + self.completion_tokens
        elapsed = time.time() - self.t0
        daily = self._read_daily()
        cost = (total_tokens / 1_000_000 * COST_PER_1M_TOKENS) if COST_PER_1M_TOKENS else None
        success = self.tool_errors == 0

        rec = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "label": label,
            "llm_calls": self.llm_calls,
            "tool_calls": self.tool_calls,
            "tool_errors": self.tool_errors,
            "success": success,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": total_tokens,
            "latency_s": round(elapsed, 2),
            "daily_tokens": daily,
        }
        if cost is not None:
            rec["est_cost_usd"] = round(cost, 5)

        with self._lock:
            with METRICS_FILE.open("a") as fh:
                fh.write(json.dumps(rec) + "\n")

        cost_str = f" · ${cost:.4f}" if cost is not None else ""
        print(f"[OBS] {label or 'request'} · {self.llm_calls} LLM · {self.tool_calls} tool "
              f"({self.tool_errors} err) · {total_tokens:,} tok · {elapsed:.1f}s{cost_str} "
              f"· today {self._budget_line()}")
        return rec


# Single shared handler instance.
obs_handler = Observability()