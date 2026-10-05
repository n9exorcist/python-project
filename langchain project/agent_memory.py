"""
agent_memory.py — the four memory layers an agentic system actually needs,
with the one discipline that keeps them trustworthy: memory is a source of
CONTEXT, not a source of TRUTH, so every stored fact carries freshness metadata,
can be re-validated before use, and is eventually forgotten.

    WorkingMemory   short-term, in-process. The current task: objective, recent
                    tool outputs, intermediate reasoning. Dies with the turn.
    LongTermMemory  persistent (sqlite). User preferences, learned facts, past
                    decisions. Retrieved only when relevant, never all at once.
    SharedMemory    coordination layer between agents on one task. What the
                    researcher found, so the writer and validator can see it.
    EpisodicMemory  timestamped log of past execution episodes, to learn from.

Why the metadata. "The user prefers X" was true when it was stored and may not
be now. So LongTermMemory stamps source / confidence / last_updated / expiry on
every row, recall() hides what has gone stale, validate() re-checks a fact
before an important use, and forget() expires the old, the unused, and the
superseded. Without those three, memory quality only decays.

Backed by the same sqlite file as the rest of the agent (AGENT_DB, default
memory.db). No LLM and no network are needed for storage or recall — relevance
is lexical overlap by default, with an optional embedding hook — so this module
is fully testable offline.

    python agent_memory.py      # self-test
"""

from __future__ import annotations

import os
import re
import sqlite3
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable

DB_PATH = os.getenv("AGENT_DB", "memory.db")

# A fact not re-validated within this window is reported STALE by recall(): still
# returned (it may be fine) but flagged, so the caller can validate() or caveat.
STALE_AFTER_DAYS = int(os.getenv("MEM_STALE_AFTER_DAYS", "30"))
# forget() drops facts below this confidence that also haven't been used in
# MEM_UNUSED_DAYS — low-value AND cold, the safest thing to evict.
FORGET_CONFIDENCE_FLOOR = float(os.getenv("MEM_FORGET_CONFIDENCE", "0.35"))
UNUSED_DAYS = int(os.getenv("MEM_UNUSED_DAYS", "60"))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def _parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


_WORD = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> set[str]:
    return set(_WORD.findall(text.lower()))


def _overlap(query: str, content: str) -> float:
    """Jaccard overlap of word sets — a dependency-free relevance proxy.

    Deliberately crude: good enough to rank a handful of stored facts for the
    common 'preferences / learned facts' recall, and it needs no embedding call.
    Pass a real scorer to LongTermMemory(scorer=...) when the store grows.
    """
    q, c = _tokens(query), _tokens(content)
    if not q or not c:
        return 0.0
    return len(q & c) / len(q | c)


# ---------------------------------------------------------------------------
# Short-term / working memory — in process, not persisted
# ---------------------------------------------------------------------------
@dataclass
class WorkingMemory:
    """The current task's scratch space: objective, recent events, reasoning.

    Bounded on purpose. The context window is the real constraint, so the ring
    buffer keeps only the last `maxlen` events and trimmed_context() emits the
    most recent ones under a character budget — newest kept, oldest dropped.
    """

    objective: str = ""
    maxlen: int = 50
    _events: deque = field(default_factory=lambda: deque(maxlen=50))

    def __post_init__(self):
        if self.maxlen != 50:
            self._events = deque(self._events, maxlen=self.maxlen)

    def set_objective(self, objective: str) -> None:
        self.objective = objective

    def add(self, kind: str, content: str) -> None:
        """kind is free-form: 'tool_output', 'thought', 'observation', 'step'."""
        self._events.append((kind, content, time.monotonic()))

    def recent(self, n: int = 10) -> list[tuple[str, str]]:
        return [(k, c) for k, c, _ in list(self._events)[-n:]]

    def trimmed_context(self, max_chars: int = 2000) -> str:
        """Objective + as many recent events as fit, newest first."""
        head = f"OBJECTIVE: {self.objective}\n" if self.objective else ""
        out, used = [], len(head)
        for kind, content, _ in reversed(self._events):
            line = f"- [{kind}] {content}"
            if used + len(line) + 1 > max_chars:
                break
            out.append(line)
            used += len(line) + 1
        return head + "\n".join(reversed(out))

    def clear(self) -> None:
        self.objective = ""
        self._events.clear()


# ---------------------------------------------------------------------------
# Persistent store setup
# ---------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS mem_long (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    scope         TEXT NOT NULL DEFAULT 'global',  -- e.g. a user id or tenant
    key           TEXT,                            -- optional stable handle
    kind          TEXT NOT NULL DEFAULT 'fact',    -- fact | preference | decision
    content       TEXT NOT NULL,
    source        TEXT,
    confidence    REAL NOT NULL DEFAULT 0.7,
    created_at    TEXT NOT NULL,
    last_updated  TEXT NOT NULL,
    last_validated TEXT,
    expires_at    TEXT,                            -- hard TTL; NULL = no expiry
    hits          INTEGER NOT NULL DEFAULT 0,      -- times recall() returned it
    last_used     TEXT,
    superseded_by INTEGER                          -- id of the row that replaced it
);
CREATE INDEX IF NOT EXISTS ix_long_scope ON mem_long(scope, superseded_by);

CREATE TABLE IF NOT EXISTS mem_shared (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id  TEXT NOT NULL,
    agent    TEXT NOT NULL,
    key      TEXT NOT NULL,
    content  TEXT NOT NULL,
    at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_shared_task ON mem_shared(task_id, at);

CREATE TABLE IF NOT EXISTS mem_episodic (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id  TEXT,
    at       TEXT NOT NULL,
    event    TEXT NOT NULL,
    content  TEXT,
    outcome  TEXT                                  -- success | failure | partial
);
CREATE INDEX IF NOT EXISTS ix_epi_task ON mem_episodic(task_id, at);
"""


def _connect(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


@dataclass
class MemoryRecord:
    id: int
    content: str
    kind: str
    source: str
    confidence: float
    created_at: str
    last_updated: str
    last_validated: str | None
    age_days: int
    stale: bool
    score: float = 0.0

    @property
    def citation(self) -> str:
        v = f"mem#{self.id}"
        if self.source:
            v += f" · {self.source}"
        v += f" · conf {self.confidence:.2f}"
        v += " · STALE" if self.stale else f" · {self.age_days}d old"
        return v


# ---------------------------------------------------------------------------
# Long-term memory
# ---------------------------------------------------------------------------
class LongTermMemory:
    def __init__(self, db_path: str = DB_PATH,
                 scorer: Callable[[str, str], float] = _overlap):
        self.db_path = db_path
        self._score = scorer

    def _con(self) -> sqlite3.Connection:
        return _connect(self.db_path)

    def remember(self, content: str, *, scope: str = "global", key: str | None = None,
                 kind: str = "fact", source: str = "", confidence: float = 0.7,
                 ttl_days: int | None = None) -> int:
        """Store a fact. If `key` is reused, the old row is SUPERSEDED, not
        overwritten: the history survives, and recall() ignores superseded rows.

        This is how conflicting facts are resolved by recency. "User prefers
        dark mode" stored under key='theme' later becomes "prefers light mode"
        under the same key — recall returns only the latest, and the earlier
        decision is still auditable.
        """
        now = _iso(_now())
        expires = _iso(_now() + timedelta(days=ttl_days)) if ttl_days else None
        con = self._con()
        try:
            new_id = con.execute(
                "INSERT INTO mem_long (scope, key, kind, content, source, confidence, "
                "created_at, last_updated, last_validated, expires_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (scope, key, kind, content, source, confidence, now, now, now, expires),
            ).lastrowid
            if key is not None:
                con.execute(
                    "UPDATE mem_long SET superseded_by=? "
                    "WHERE scope=? AND key=? AND id<>? AND superseded_by IS NULL",
                    (new_id, scope, key, new_id),
                )
            con.commit()
            return int(new_id)
        finally:
            con.close()

    def recall(self, query: str, *, scope: str = "global", k: int = 5,
               min_confidence: float = 0.0, include_stale: bool = True
               ) -> list[MemoryRecord]:
        """Return the k most relevant live facts, most relevant first.

        Excludes superseded and hard-expired rows always; excludes stale rows
        when include_stale=False. Marks (does not hide) stale rows otherwise, so
        the caller can decide to validate() or caveat rather than assert.
        Bumps hits/last_used on what it returns — that is what forget() reads.
        """
        now = _now()
        con = self._con()
        try:
            rows = con.execute(
                "SELECT * FROM mem_long WHERE scope=? AND superseded_by IS NULL "
                "AND confidence>=?", (scope, min_confidence),
            ).fetchall()
            scored: list[MemoryRecord] = []
            for r in rows:
                exp = _parse(r["expires_at"])
                if exp and exp < now:
                    continue  # hard-expired: never returned
                validated = _parse(r["last_validated"]) or _parse(r["last_updated"])
                age_days = (now - (validated or now)).days
                stale = age_days > STALE_AFTER_DAYS
                if stale and not include_stale:
                    continue
                score = self._score(query, r["content"])
                if score <= 0:
                    continue
                scored.append(MemoryRecord(
                    id=r["id"], content=r["content"], kind=r["kind"],
                    source=r["source"] or "", confidence=r["confidence"],
                    created_at=r["created_at"], last_updated=r["last_updated"],
                    last_validated=r["last_validated"], age_days=age_days,
                    stale=stale, score=score,
                ))
            scored.sort(key=lambda m: (m.score, m.confidence), reverse=True)
            top = scored[:k]
            if top:
                con.executemany(
                    "UPDATE mem_long SET hits=hits+1, last_used=? WHERE id=?",
                    [(_iso(now), m.id) for m in top],
                )
                con.commit()
            return top
        finally:
            con.close()

    def validate(self, mem_id: int, validator: Callable[[str], bool | float]) -> float:
        """Re-check a stored fact before trusting it for an important action.

        validator(content) returns True/False or a 0..1 confidence. A positive
        result refreshes last_validated (so it stops being stale) and may raise
        confidence; a negative result drops confidence toward 0 and leaves the
        row for forget() to reap. Returns the new confidence.
        """
        con = self._con()
        try:
            row = con.execute("SELECT content, confidence FROM mem_long WHERE id=?",
                              (mem_id,)).fetchone()
            if not row:
                return 0.0
            verdict = validator(row["content"])
            conf = float(verdict) if not isinstance(verdict, bool) else (
                min(1.0, row["confidence"] + 0.2) if verdict else row["confidence"] * 0.4)
            con.execute(
                "UPDATE mem_long SET confidence=?, last_validated=? WHERE id=?",
                (round(conf, 3), _iso(_now()), mem_id),
            )
            con.commit()
            return round(conf, 3)
        finally:
            con.close()

    def forget(self, scope: str | None = None) -> dict[str, int]:
        """Evict what no longer earns its place. Three rules, safest first:

          expired    — past its hard TTL
          superseded — replaced by a newer row under the same key
          cold+weak  — confidence below the floor AND unused for UNUSED_DAYS

        Returns the count removed per rule. Run on a schedule; memory that is
        never forgotten only accumulates stale, contradictory noise.
        """
        now = _now()
        cutoff = _iso(now - timedelta(days=UNUSED_DAYS))
        where_scope = "AND scope=?" if scope else ""
        args = (scope,) if scope else ()
        con = self._con()
        try:
            counts = {}
            cur = con.execute(
                f"DELETE FROM mem_long WHERE expires_at IS NOT NULL "
                f"AND expires_at < ? {where_scope}", (_iso(now), *args))
            counts["expired"] = cur.rowcount
            cur = con.execute(
                f"DELETE FROM mem_long WHERE superseded_by IS NOT NULL {where_scope}", args)
            counts["superseded"] = cur.rowcount
            cur = con.execute(
                f"DELETE FROM mem_long WHERE confidence < ? "
                f"AND COALESCE(last_used, created_at) < ? {where_scope}",
                (FORGET_CONFIDENCE_FLOOR, cutoff, *args))
            counts["cold_weak"] = cur.rowcount
            con.commit()
            return counts
        finally:
            con.close()


# ---------------------------------------------------------------------------
# Shared memory — multi-agent coordination on a single task
# ---------------------------------------------------------------------------
class SharedMemory:
    """A blackboard for one task: the researcher posts findings, the writer and
    validator read them. Keyed by task_id so two concurrent tasks never bleed
    into each other — the coordination analogue of tenant isolation."""

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path

    def _con(self):
        return _connect(self.db_path)

    def post(self, task_id: str, agent: str, key: str, content: str) -> None:
        con = self._con()
        try:
            con.execute(
                "INSERT INTO mem_shared (task_id, agent, key, content, at) VALUES (?,?,?,?,?)",
                (task_id, agent, key, content, _iso(_now())))
            con.commit()
        finally:
            con.close()

    def read(self, task_id: str, key: str | None = None) -> list[dict]:
        con = self._con()
        try:
            if key:
                rows = con.execute(
                    "SELECT * FROM mem_shared WHERE task_id=? AND key=? ORDER BY at",
                    (task_id, key)).fetchall()
            else:
                rows = con.execute(
                    "SELECT * FROM mem_shared WHERE task_id=? ORDER BY at", (task_id,)).fetchall()
            return [dict(r) for r in rows]
        finally:
            con.close()

    def clear(self, task_id: str) -> int:
        con = self._con()
        try:
            n = con.execute("DELETE FROM mem_shared WHERE task_id=?", (task_id,)).rowcount
            con.commit()
            return n
        finally:
            con.close()


# ---------------------------------------------------------------------------
# Episodic memory — a log of what happened, to learn from
# ---------------------------------------------------------------------------
class EpisodicMemory:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path

    def _con(self):
        return _connect(self.db_path)

    def record(self, event: str, *, task_id: str | None = None,
               content: str = "", outcome: str = "") -> int:
        con = self._con()
        try:
            rid = con.execute(
                "INSERT INTO mem_episodic (task_id, at, event, content, outcome) "
                "VALUES (?,?,?,?,?)",
                (task_id, _iso(_now()), event, content, outcome)).lastrowid
            con.commit()
            return int(rid)
        finally:
            con.close()

    def replay(self, task_id: str) -> list[dict]:
        con = self._con()
        try:
            rows = con.execute(
                "SELECT * FROM mem_episodic WHERE task_id=? ORDER BY at", (task_id,)).fetchall()
            return [dict(r) for r in rows]
        finally:
            con.close()

    def recent_failures(self, limit: int = 10) -> list[dict]:
        """Past failures to steer away from — the point of keeping episodes."""
        con = self._con()
        try:
            rows = con.execute(
                "SELECT * FROM mem_episodic WHERE outcome='failure' ORDER BY at DESC LIMIT ?",
                (limit,)).fetchall()
            return [dict(r) for r in rows]
        finally:
            con.close()


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import tempfile

    db = os.path.join(tempfile.mkdtemp(), "mem_selftest.db")
    ltm = LongTermMemory(db)

    print("== working memory ==")
    wm = WorkingMemory(maxlen=3)
    wm.set_objective("find Q2 revenue")
    for i in range(5):
        wm.add("step", f"event {i}")
    print("  kept last 3:", wm.recent(10))
    print("  context:\n   ", wm.trimmed_context(200).replace("\n", "\n    "))

    print("\n== long-term: conflict by recency ==")
    ltm.remember("User prefers dark mode", key="theme", confidence=0.8)
    ltm.remember("User prefers light mode", key="theme", confidence=0.8)
    hits = ltm.recall("what theme does the user like", k=5)
    print("  recall theme:", [(h.content, h.citation) for h in hits])
    assert len(hits) == 1 and "light" in hits[0].content, "superseded row leaked"

    print("\n== staleness + validate ==")
    old_id = ltm.remember("Capital city budget is $5M", source="doc", confidence=0.6)
    con = sqlite3.connect(db)
    con.execute("UPDATE mem_long SET last_validated=? WHERE id=?",
                (_iso(_now() - timedelta(days=90)), old_id))
    con.commit(); con.close()
    before = ltm.recall("city budget", k=5)[0]
    print("  stale flagged:", before.stale, before.citation)
    assert before.stale
    newconf = ltm.validate(old_id, lambda c: True)
    after = ltm.recall("city budget", k=5)[0]
    print("  after validate: stale=", after.stale, " conf=", newconf)
    assert not after.stale

    print("\n== forgetting ==")
    ltm.remember("trivia nobody uses", confidence=0.1, source="noise")
    con = sqlite3.connect(db)
    con.execute("UPDATE mem_long SET created_at=?, last_used=NULL WHERE source='noise'",
                (_iso(_now() - timedelta(days=90)),))
    con.commit(); con.close()
    removed = ltm.forget()
    print("  forgot:", removed)
    assert removed["cold_weak"] >= 1

    print("\n== shared + episodic ==")
    sh = SharedMemory(db)
    sh.post("task1", "researcher", "finding", "revenue is $18B")
    sh.post("task1", "writer", "draft", "Revenue reached $18B.")
    print("  shared task1:", [(r["agent"], r["content"]) for r in sh.read("task1")])
    ep = EpisodicMemory(db)
    ep.record("tool_call", task_id="task1", content="search", outcome="success")
    ep.record("tool_call", task_id="task1", content="trade", outcome="failure")
    print("  failures:", [r["content"] for r in ep.recent_failures()])
    assert len(sh.read("task1")) == 2 and len(ep.recent_failures()) == 1

    print("\nAll agent_memory self-tests passed.")
