"""rules.py — the screen's thresholds, and the constitution governing changes.

The screen used to be module-level constants in scanner.py. That is the right
shape for a rule set a human edits and a wrong one for a rule set an agent
adjusts: an edit leaves no record of what changed, when, on what evidence, or
what the numbers were when a given trade was taken.

Thresholds now live in the database as an overlay on a hand-authored BASELINE,
and every signals row records the version that produced it, so an outcome can
always be attributed to the rules in force at the time.

THE CONSTITUTION
----------------
Two rules govern every automated change. Both exist because the risks are not
symmetric.

1. A proposal may only TIGHTEN, or REVERT a tightening the loop itself made.
   It may never go looser than BASELINE.

   Tightening costs opportunity: fewer trades, and you can see the ones you
   skipped. Loosening on a thin sample costs months of worse trades and is
   invisible while it happens, because the losses look like ordinary variance.
   A screen dies by loosening, never by tightening. So the hand-authored
   baseline is a floor the agent cannot go below, and the agent can always undo
   its own work.

2. Nothing changes without clearing an evidence gate (see eval.py).

Pure tightening would ratchet toward zero trades, which is why REVERT exists and
why eval.py monitors the take rate: a rule set that has stopped producing
candidates is a finding in its own right, and the remedy is reverting a
tightening rather than loosening past the floor.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from typing import Any

# The hand-authored floor. Changing a value here is a human decision and resets
# what "looser than baseline" means; the agent cannot reach it.
BASELINE: dict[str, float] = {
    "RSI_MIN": 55.0,
    "RSI_MAX": 72.0,
    "VOL_MULTIPLE": 2.0,
    "MAX_EXT_FROM_EMA20": 8.0,
    "MIN_TURNOVER_CR": 2.0,
}

# Which direction is TIGHTER for each threshold: +1 when a larger number admits
# fewer names, -1 when a smaller one does. This is the whole of what the
# constitution needs to know about the semantics of a filter.
TIGHTER: dict[str, int] = {
    "RSI_MIN": +1,            # a higher floor demands more momentum
    "RSI_MAX": -1,            # a lower ceiling excludes more overbought names
    "VOL_MULTIPLE": +1,       # more volume required
    "MAX_EXT_FROM_EMA20": -1, # less extension tolerated
    "MIN_TURNOVER_CR": +1,    # more liquidity required
}

# A cap on how far the agent may drift from the floor, per threshold, as a
# fraction of the baseline value. Without it a long run of marginal evidence
# could walk a threshold somewhere no single proposal would have been allowed to
# put it.
MAX_DRIFT = 0.40

BASE_VERSION = "v1.0"

SCHEMA = """
CREATE TABLE IF NOT EXISTS rule_overrides (
    key        TEXT PRIMARY KEY,
    value      REAL NOT NULL,
    baseline   REAL NOT NULL,
    reason     TEXT,
    evidence   TEXT,
    set_at     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rule_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    key       TEXT NOT NULL,
    old_value REAL,
    new_value REAL,
    action    TEXT NOT NULL,        -- tighten | revert
    reason    TEXT,
    evidence  TEXT,
    at        TEXT NOT NULL
);
"""


def _con(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)
    return con


def effective(db_path: str) -> dict[str, float]:
    """BASELINE with any active overrides applied."""
    rules = dict(BASELINE)
    con = _con(db_path)
    try:
        for key, value in con.execute("SELECT key, value FROM rule_overrides"):
            if key in rules:
                rules[key] = float(value)
    finally:
        con.close()
    return rules


def version(rules: dict[str, float]) -> str:
    """A stable id for a rule set, recorded on every signals row.

    Baseline keeps the plain version string so existing rows stay comparable;
    anything else carries a short digest of the actual numbers. Two runs with
    the same thresholds always produce the same id, which is what makes
    "did results change when the rules changed" answerable at all.
    """
    if rules == BASELINE:
        return BASE_VERSION
    blob = json.dumps({k: rules[k] for k in sorted(rules)}, sort_keys=True)
    return f"{BASE_VERSION}+{hashlib.sha1(blob.encode()).hexdigest()[:6]}"


def is_tightening(key: str, new_value: float, current: float) -> bool:
    d = TIGHTER.get(key, 0)
    if not d:
        return False
    return (new_value - current) * d > 0


def check(key: str, new_value: float, db_path: str) -> tuple[bool, str]:
    """Would this change be permitted? Returns (allowed, why-not).

    The single place the constitution is enforced. Both eval.py's planner and
    any manual call go through it, so there is no path that quietly bypasses the
    floor.
    """
    if key not in BASELINE:
        return False, f"{key} is not a governed threshold"

    base = BASELINE[key]
    current = effective(db_path)[key]
    d = TIGHTER[key]

    if new_value == current:
        return False, "no change"

    # Rule 1: never looser than the hand-authored floor.
    if (new_value - base) * d < 0:
        looser = "below" if d > 0 else "above"
        return False, (f"{new_value:g} is {looser} the baseline {base:g}; the agent "
                       f"may tighten or revert its own tightening, never loosen "
                       f"past a value a human wrote")

    # Drift cap, measured from the floor.
    limit = abs(base) * MAX_DRIFT
    if abs(new_value - base) > limit:
        return False, (f"{new_value:g} is {abs(new_value - base):g} from the baseline "
                       f"{base:g}, beyond the {MAX_DRIFT:.0%} drift cap of {limit:g}")

    return True, "tighten" if is_tightening(key, new_value, current) else "revert"


def apply(db_path: str, key: str, new_value: float, reason: str,
          evidence: str = "") -> tuple[bool, str]:
    """Change a threshold, if the constitution permits it. Always logged."""
    ok, why = check(key, new_value, db_path)
    if not ok:
        return False, why

    from datetime import datetime
    from zoneinfo import ZoneInfo
    now = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds")

    current = effective(db_path)[key]
    con = _con(db_path)
    try:
        if new_value == BASELINE[key]:
            # Back at the floor: drop the override rather than storing a
            # no-op row, so `effective` stays the shortest true description.
            con.execute("DELETE FROM rule_overrides WHERE key=?", (key,))
        else:
            con.execute(
                "INSERT OR REPLACE INTO rule_overrides "
                "(key, value, baseline, reason, evidence, set_at) VALUES (?,?,?,?,?,?)",
                (key, new_value, BASELINE[key], reason, evidence, now),
            )
        con.execute(
            "INSERT INTO rule_history (key, old_value, new_value, action, reason, evidence, at) "
            "VALUES (?,?,?,?,?,?,?)",
            (key, current, new_value, why, reason, evidence, now),
        )
        con.commit()
    finally:
        con.close()
    return True, why


def describe(db_path: str) -> list[dict[str, Any]]:
    """Current thresholds with their distance from the floor, for reporting."""
    rules = effective(db_path)
    con = _con(db_path)
    try:
        meta = {k: (r, e, t) for k, r, e, t in con.execute(
            "SELECT key, reason, evidence, set_at FROM rule_overrides")}
    finally:
        con.close()

    out = []
    for key in sorted(BASELINE):
        base, cur = BASELINE[key], rules[key]
        row = {"key": key, "baseline": base, "value": cur, "overridden": key in meta}
        if key in meta:
            row["reason"], row["evidence"], row["set_at"] = meta[key]
        out.append(row)
    return out
