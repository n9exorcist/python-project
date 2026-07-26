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

# Provider daily token cap (Groq free tier = 100,000 TPD). Warn at 80%.
DAILY_TOKEN_LIMIT = int(os.getenv("DAILY_TOKEN_LIMIT", "100000"))
WARN_AT = 0.80

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
        self._add_daily_tokens(pt + ct)

    # ---------------- tools ----------------
    def on_tool_start(self, serialized, input_str, **kwargs):
        self.tool_calls += 1

    def on_tool_error(self, error, **kwargs):
        self.tool_errors += 1

    # ---------------- daily budget ----------------
    def _daily_file(self):
        return LOG_DIR / f"token_usage_{_today()}.json"

    def _read_daily(self):
        f = self._daily_file()
        if f.exists():
            try:
                return json.loads(f.read_text()).get("tokens", 0)
            except Exception:
                return 0
        return 0

    def _add_daily_tokens(self, n):
        if n <= 0:
            return
        with self._lock:
            total = self._read_daily() + n
            self._daily_file().write_text(json.dumps({"date": _today(), "tokens": total}))
            frac = total / DAILY_TOKEN_LIMIT if DAILY_TOKEN_LIMIT else 0
            if frac >= WARN_AT:
                print(f"!!! [OBS] TOKEN BUDGET WARNING: {total:,}/{DAILY_TOKEN_LIMIT:,} "
                      f"({frac:.0%}) used today -- approaching the daily cap.")

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
        pct = (daily / DAILY_TOKEN_LIMIT) if DAILY_TOKEN_LIMIT else 0
        print(f"[OBS] {label or 'request'} · {self.llm_calls} LLM · {self.tool_calls} tool "
              f"({self.tool_errors} err) · {total_tokens:,} tok · {elapsed:.1f}s{cost_str} "
              f"· today {daily:,}/{DAILY_TOKEN_LIMIT:,} ({pct:.0%})")
        return rec


# Single shared handler instance.
obs_handler = Observability()