"""
resilience.py — recover from failures the way the design question asks for:
classify first, then retry / resume / fall back / hand off, never retry blindly.

The mechanisms, in the order the interview answer gives them:

  1. Classify     A timeout or a 429 is TRANSIENT — retrying may work. A bad
                  input or an auth error is PERMANENT — retrying only wastes
                  quota and time, so the workflow must take a different path.
  2. Retry        Bounded retries with exponential backoff + jitter, TRANSIENT
                  errors only.
  3. Resume       A multi-step workflow checkpoints after each step. If it dies
                  at step 8, the next run resumes from step 8 with the saved
                  state — not from scratch. Resumability is the point.
  4. Fallback     If a step's primary action fails for good, try its declared
                  alternative before giving up.
  5. Hand off     When automation genuinely cannot finish, stop and escalate to
                  a human rather than loop or fake success.

The trade-off: all of this is extra state (checkpoints) and workflow
complexity, bought in exchange for not restarting a long job from zero and not
burning retries on errors that will never succeed.

Checkpoints live in AGENT_DB (default memory.db). Fully offline-testable: every
step and failure is an injected callable.

    python resilience.py        # self-test
"""

from __future__ import annotations

import json
import os
import random
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

DB_PATH = os.getenv("AGENT_DB", "memory.db")


# ---------------------------------------------------------------------------
# 1. Classify
# ---------------------------------------------------------------------------
class PermanentError(Exception):
    """A failure that retrying cannot fix (bad input, auth, 404, validation)."""


class TransientError(Exception):
    """A failure that may clear on its own (timeout, 429, 5xx, connection)."""


class HumanHandoff(Exception):
    """Automation has exhausted its options; a person must take over."""
    def __init__(self, reason: str, state: dict | None = None):
        super().__init__(reason)
        self.reason = reason
        self.state = state or {}


_TRANSIENT_HINTS = ("timeout", "timed out", "temporarily", "rate limit", "429",
                    "resource_exhausted", "connection", "reset by peer", "503",
                    "502", "500", "unavailable", "overloaded", "econnreset")
_PERMANENT_HINTS = ("invalid", "unauthorized", "forbidden", "not found", "404",
                   "401", "403", "400", "validation", "schema", "unsupported",
                   "no such", "permission denied")


def classify_error(exc: BaseException) -> str:
    """'transient' or 'permanent'. Explicit subclasses win; otherwise the error
    text is matched against known hints; an unknown error is treated as
    transient ONCE (retry is cheap) rather than assumed fatal."""
    if isinstance(exc, (PermanentError,)):
        return "permanent"
    if isinstance(exc, (TransientError, TimeoutError, ConnectionError)):
        return "transient"
    msg = str(exc).lower()
    if any(h in msg for h in _PERMANENT_HINTS):
        return "permanent"
    if any(h in msg for h in _TRANSIENT_HINTS):
        return "transient"
    return "transient"


# ---------------------------------------------------------------------------
# 2. Retry
# ---------------------------------------------------------------------------
@dataclass
class RetryPolicy:
    max_attempts: int = 4
    base_delay: float = 0.5     # seconds; doubles each attempt
    max_delay: float = 30.0
    jitter: float = 0.25        # +/- fraction, so a fleet doesn't retry in lockstep

    def delay(self, attempt: int) -> float:
        d = min(self.max_delay, self.base_delay * (2 ** attempt))
        return d * (1 + random.uniform(-self.jitter, self.jitter))


def retry(fn: Callable[[], Any], policy: RetryPolicy | None = None, *,
          on_retry: Callable[[int, BaseException, float], None] | None = None,
          sleep: Callable[[float], None] = time.sleep) -> Any:
    """Call fn with bounded backoff. Transient errors are retried; a permanent
    error is re-raised immediately — retrying it is pure waste."""
    policy = policy or RetryPolicy()
    last: BaseException | None = None
    for attempt in range(policy.max_attempts):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 — classification decides the fate
            last = exc
            if classify_error(exc) == "permanent" or attempt == policy.max_attempts - 1:
                raise
            wait = policy.delay(attempt)
            if on_retry:
                on_retry(attempt + 1, exc, wait)
            sleep(wait)
    assert last is not None
    raise last


# ---------------------------------------------------------------------------
# 3 + 4 + 5. Resumable workflow with per-step fallback and handoff
# ---------------------------------------------------------------------------
CHECKPOINT_SCHEMA = """
CREATE TABLE IF NOT EXISTS wf_checkpoints (
    run_id    TEXT NOT NULL,
    step      TEXT NOT NULL,
    idx       INTEGER NOT NULL,
    state     TEXT NOT NULL,        -- JSON blob of accumulated state
    at        TEXT NOT NULL,
    status    TEXT NOT NULL,        -- done | failed
    PRIMARY KEY (run_id, idx)
);
"""


@dataclass
class Step:
    """One unit of work. `run(state)` returns a dict merged into the workflow
    state. `fallback(state)` is tried if run() fails permanently (or exhausts
    retries); if it too fails, the workflow hands off to a human."""
    name: str
    run: Callable[[dict], dict]
    fallback: Callable[[dict], dict] | None = None
    retry_policy: RetryPolicy | None = None


@dataclass
class WorkflowResult:
    run_id: str
    state: dict
    completed: list[str] = field(default_factory=list)
    resumed_from: int = 0
    handed_off: bool = False
    handoff_reason: str = ""


class Workflow:
    """Runs a list of Steps, checkpointing after each. Re-running the same
    run_id resumes after the last checkpointed step with its saved state.

    This is deliberately small: it is the control-flow shell (classify, retry,
    checkpoint, fallback, hand off) the design question is really about, not a
    scheduler. For a full DAG, LangGraph's own checkpointer does the same job at
    graph scope — this covers the plain sequential case without that machinery.
    """

    def __init__(self, steps: list[Step], db_path: str = DB_PATH,
                 sleep: Callable[[float], None] = time.sleep,
                 on_event: Callable[[str, dict], None] | None = None):
        self.steps = steps
        self.db_path = db_path
        self._sleep = sleep
        self._on_event = on_event or (lambda ev, data: None)

    def _con(self):
        con = sqlite3.connect(self.db_path)
        con.executescript(CHECKPOINT_SCHEMA)
        return con

    def _save(self, run_id: str, idx: int, step: str, state: dict, status: str):
        con = self._con()
        try:
            con.execute(
                "INSERT OR REPLACE INTO wf_checkpoints (run_id, step, idx, state, at, status) "
                "VALUES (?,?,?,?,?,?)",
                (run_id, step, idx, json.dumps(state, default=str),
                 datetime.now(timezone.utc).isoformat(timespec="seconds"), status))
            con.commit()
        finally:
            con.close()

    def _last_done(self, run_id: str) -> tuple[int, dict]:
        con = self._con()
        try:
            row = con.execute(
                "SELECT idx, state FROM wf_checkpoints WHERE run_id=? AND status='done' "
                "ORDER BY idx DESC LIMIT 1", (run_id,)).fetchone()
            if not row:
                return -1, {}
            return int(row[0]), json.loads(row[1])
        finally:
            con.close()

    def run(self, run_id: str, initial_state: dict | None = None) -> WorkflowResult:
        last_idx, saved = self._last_done(run_id)
        state = {**(initial_state or {}), **saved}
        result = WorkflowResult(run_id, state, resumed_from=last_idx + 1)
        if last_idx >= 0:
            self._on_event("resume", {"run_id": run_id, "from_idx": last_idx + 1})

        for idx, step in enumerate(self.steps):
            if idx <= last_idx:
                result.completed.append(step.name + " (skipped: already done)")
                continue

            try:
                out = retry(
                    lambda: step.run(state),
                    step.retry_policy,
                    on_retry=lambda a, e, w: self._on_event(
                        "retry", {"step": step.name, "attempt": a, "err": str(e), "wait": round(w, 2)}),
                    sleep=self._sleep,
                )
            except Exception as primary:  # noqa: BLE001
                self._on_event("step_failed", {"step": step.name, "err": str(primary),
                                               "class": classify_error(primary)})
                if step.fallback is None:
                    self._save(run_id, idx, step.name, state, "failed")
                    raise HumanHandoff(
                        f"step '{step.name}' failed with no fallback: {primary}", state)
                try:
                    out = step.fallback(state)
                    self._on_event("fallback_ok", {"step": step.name})
                except Exception as fb:  # noqa: BLE001
                    self._save(run_id, idx, step.name, state, "failed")
                    result.handed_off = True
                    result.handoff_reason = f"step '{step.name}': primary+fallback failed ({fb})"
                    self._on_event("handoff", {"step": step.name, "reason": result.handoff_reason})
                    raise HumanHandoff(result.handoff_reason, state) from fb

            state.update(out or {})
            self._save(run_id, idx, step.name, state, "done")
            result.completed.append(step.name)
            self._on_event("step_done", {"step": step.name})

        result.state = state
        return result

    def clear(self, run_id: str) -> None:
        con = self._con()
        try:
            con.execute("DELETE FROM wf_checkpoints WHERE run_id=?", (run_id,))
            con.commit()
        finally:
            con.close()


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import tempfile

    db = os.path.join(tempfile.mkdtemp(), "wf_selftest.db")
    events: list = []
    log = lambda ev, data: events.append((ev, data))

    print("== classify ==")
    for exc, want in [(TimeoutError("timed out"), "transient"),
                      (ValueError("invalid schema"), "permanent"),
                      (RuntimeError("429 RESOURCE_EXHAUSTED"), "transient"),
                      (RuntimeError("401 unauthorized"), "permanent")]:
        got = classify_error(exc)
        print(f"  {'OK' if got == want else 'XX'} {got:9s} {exc}")
        assert got == want

    print("\n== retry: transient clears, permanent doesn't ==")
    calls = {"n": 0}
    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise TransientError("temporarily unavailable")
        return "ok"
    out = retry(flaky, RetryPolicy(base_delay=0), sleep=lambda s: None)
    print(f"  recovered after {calls['n']} attempts -> {out}")
    assert out == "ok" and calls["n"] == 3
    perm = {"n": 0}
    def bad():
        perm["n"] += 1
        raise PermanentError("invalid input")
    try:
        retry(bad, sleep=lambda s: None)
    except PermanentError:
        print(f"  permanent not retried (attempts={perm['n']})")
        assert perm["n"] == 1

    print("\n== resumable workflow ==")
    attempts = {"two": 0}
    def s1(state): return {"loaded": True}
    def s2(state):
        attempts["two"] += 1
        if attempts["two"] == 1:
            raise TransientError("network blip")  # dies on first whole run
        return {"processed": state["loaded"]}
    def s3(state): return {"saved": True}
    steps = [Step("load", s1), Step("process", s2), Step("save", s3)]

    wf = Workflow(steps, db, sleep=lambda s: None, on_event=log)
    # First run: retry inside process() recovers, so it completes in one go...
    # force a crash instead by making process raise a PERMANENT error first time:
    attempts["two"] = 0
    def s2_crash(state):
        attempts["two"] += 1
        if attempts["two"] == 1:
            raise PermanentError("bad record, cannot process")
        return {"processed": True}
    wf2 = Workflow([Step("load", s1), Step("process", s2_crash), Step("save", s3)],
                   db, sleep=lambda s: None, on_event=log)
    try:
        wf2.run("runA", {"input": 1})
    except HumanHandoff as h:
        print(f"  first run halted at a permanent error -> handoff: {h.reason[:50]}")

    # Second run of the SAME id: 'load' is skipped (checkpointed), 'process'
    # now succeeds, workflow finishes without redoing step 1.
    res = wf2.run("runA", {"input": 1})
    print(f"  resumed_from idx {res.resumed_from}, completed: {res.completed}")
    assert "load (skipped: already done)" in res.completed
    assert res.state.get("saved") and res.state.get("processed")

    print("\n== fallback then handoff ==")
    def always_fail(state): raise PermanentError("primary down")
    def fb_ok(state): return {"via_fallback": True}
    wf3 = Workflow([Step("act", always_fail, fallback=fb_ok)], db,
                   sleep=lambda s: None, on_event=log)
    r3 = wf3.run("runB")
    print(f"  fallback carried it: {r3.state}")
    assert r3.state.get("via_fallback")

    def fb_bad(state): raise PermanentError("fallback also down")
    wf4 = Workflow([Step("act", always_fail, fallback=fb_bad)], db,
                   sleep=lambda s: None, on_event=log)
    try:
        wf4.run("runC")
    except HumanHandoff as h:
        print(f"  both failed -> handoff: {h.reason[:55]}")

    print("\n  events seen:", [e for e, _ in events])
    print("\nAll resilience self-tests passed.")
