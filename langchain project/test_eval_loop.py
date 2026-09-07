"""test_eval_loop.py — proof that the agent loop acts, and proof that it refuses.

The loop's normal output today is "waiting on every gate", which is correct with
three sessions on record and indistinguishable from a stub that always says so.
These tests build a database where the evidence DOES exist and check that the
machinery fires, then check that the constitution stops the things it must stop.

Run:  venv/Scripts/python.exe test_eval_loop.py
"""

from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
from datetime import date, timedelta

os.environ.setdefault("AGENT_DB", ":memory:")

import eval as E
import rules as R
import scanner

PASS_COUNT, FAIL_COUNT = 0, 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global PASS_COUNT, FAIL_COUNT
    if condition:
        PASS_COUNT += 1
        print(f"  PASS  {label}")
    else:
        FAIL_COUNT += 1
        print(f"  FAIL  {label}" + (f"\n        {detail}" if detail else ""))


def build_db(path: str, *, days: int = 20, edge: bool = True,
             volume_too_loose: bool = True) -> None:
    """A synthetic record with a known answer already in it.

    Passers outperform rejects, so the screen has an edge. Names rejected just
    below the volume line UNDERPERFORM the passers, which is the shape that
    should make the loop tighten VOL_MULTIPLE.
    """
    con = sqlite3.connect(path)
    con.executescript(scanner.SCHEMA)
    con.executescript(E.SCHEMA)

    d = date(2026, 6, 1)
    for day_i in range(days):
        while d.weekday() >= 5:
            d += timedelta(days=1)
        day = d.isoformat()

        # 4 passers a day, returning +6% (or +1% with no edge)
        for k in range(4):
            sym = f"PASS{day_i}_{k}"
            con.execute(
                "INSERT OR REPLACE INTO signals (symbol, scan_date, close, rsi14, "
                "vol_ratio, ext_pct, turnover_cr, atr14, atr_pct, screen_version) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (sym, day, 100.0, 62.0, 3.1, 3.0, 12.0, 3.0, 3.0, "v1.0"))
            con.execute(
                "INSERT OR REPLACE INTO forward_returns VALUES (?,?,?,?,?)",
                # 0.4% with no edge: the rejects' median is 0.0, so the gap is
                # 0.4pp, genuinely under MIN_EDGE_PP rather than sitting on it.
                (day, sym, E.HORIZON, 6.0 if edge else 0.4, "t"))

        # 3 near-miss volume rejects a day: vol_ratio just under 2.0.
        # They return -3% when the threshold is too loose (names near the line
        # are bad), or +9% when it is too strict (they are being wrongly cut).
        for k in range(3):
            sym = f"NEARVOL{day_i}_{k}"
            con.execute(
                "INSERT OR REPLACE INTO scan_rejects (scan_date, symbol, reason, close, "
                "rsi14, vol_ratio, ext_pct, turnover_cr, atr_pct, screen_version) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (day, sym, "volume_thin", 100.0, 61.0, 1.85, 3.0, 11.0, 3.0, "v1.0"))
            con.execute(
                "INSERT OR REPLACE INTO forward_returns VALUES (?,?,?,?,?)",
                (day, sym, E.HORIZON, -3.0 if volume_too_loose else 9.0, "t"))

        # 5 ordinary rejects a day, far from any line, returning 0%
        for k in range(5):
            sym = f"REJ{day_i}_{k}"
            con.execute(
                "INSERT OR REPLACE INTO scan_rejects (scan_date, symbol, reason, close, "
                "rsi14, vol_ratio, ext_pct, turnover_cr, atr_pct, screen_version) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (day, sym, "below_ema", 100.0, 40.0, 0.5, 20.0, 8.0, 3.0, "v1.0"))
            con.execute(
                "INSERT OR REPLACE INTO forward_returns VALUES (?,?,?,?,?)",
                (day, sym, E.HORIZON, 0.0, "t"))

        con.execute("INSERT OR REPLACE INTO scan_stats VALUES (?,?,?)",
                    (day, "volume_thin", 3))
        con.execute("INSERT OR REPLACE INTO scan_stats VALUES (?,?,?)",
                    (day, "below_ema", 5))
        d += timedelta(days=1)

    con.commit()
    con.close()


def scenario(name: str, **kwargs):
    path = os.path.join(tempfile.mkdtemp(), f"{name}.db")
    build_db(path, **kwargs)
    return path


print("\n=== 1. Evidence present: the loop tightens =================================")
db = scenario("acts")
obs = E.observe(db)
findings = E.evaluate(obs)
f1 = next(f for f in findings if f.code == "F1")
check("F1 finds an edge", f1.ok, f1.blocked or "")
check("edge is the +6.0pp planted", f1.evidence.get("edge_pp") == 6.0,
      f"got {f1.evidence.get('edge_pp')}")

f2 = next(f for f in findings if f.code == "F2:volume_thin")
check("F2 clears its gate for volume", f2.ok, f2.blocked or "")

props = E.plan(obs, findings, db)
check("one proposal generated", len(props) == 1, f"got {len(props)}")
if props:
    p = props[0]
    check("it targets VOL_MULTIPLE", p.key == "VOL_MULTIPLE", p.key)
    check("it TIGHTENS (2.0 -> 2.2)", p.new_value > p.current and p.allowed,
          f"{p.current} -> {p.new_value}, allowed={p.allowed} ({p.why})")
    actions = E.act(props, db)
    check("applied", any(a.startswith("APPLIED") for a in actions), str(actions))
    check("effective rules reflect it", R.effective(db)["VOL_MULTIPLE"] == p.new_value,
          str(R.effective(db)))
    check("the change is versioned", R.version(R.effective(db)) != R.BASE_VERSION,
          R.version(R.effective(db)))

print("\n=== 2. No edge: nothing is tuned ==========================================")
db2 = scenario("noedge", edge=False)
obs2 = E.observe(db2)
f2s = E.evaluate(obs2)
f1b = next(f for f in f2s if f.code == "F1")
check("F1 blocks when the screen has no edge", not f1b.ok, f1b.headline)
check("no proposals follow a blocked F1", E.plan(obs2, f2s, db2) == [],
      "a screen with no edge must not have its thresholds tuned")

print("\n=== 3. The threshold is too STRICT: report, never loosen ==================")
db3 = scenario("strict", volume_too_loose=False)
obs3 = E.observe(db3)
f3s = E.evaluate(obs3)
fv = next(f for f in f3s if f.code == "F2:volume_thin")
check("the finding is raised", "too strict" in fv.headline, fv.headline)
check("but it is blocked from acting", not fv.ok, str(fv.blocked))
check("and yields no proposal", E.plan(obs3, f3s, db3) == [])

print("\n=== 4. The constitution ===================================================")
db4 = scenario("constitution")
ok, why = R.check("VOL_MULTIPLE", 1.5, db4)
check("loosening below the floor is refused", not ok, why)
check("  and says why", "baseline" in why, why)

ok, why = R.check("VOL_MULTIPLE", 3.0, db4)
check("a tightening beyond the drift cap is refused", not ok, why)
check("  and says why", "drift cap" in why, why)

ok, why = R.check("VOL_MULTIPLE", 2.2, db4)
check("a tightening inside the cap is allowed", ok and why == "tighten", why)

R.apply(db4, "VOL_MULTIPLE", 2.2, "test")
check("override is live", R.effective(db4)["VOL_MULTIPLE"] == 2.2)
ok, why = R.check("VOL_MULTIPLE", 2.0, db4)
check("reverting its own tightening is allowed", ok and why == "revert", why)
R.apply(db4, "VOL_MULTIPLE", 2.0, "revert test")
check("revert removes the override entirely",
      not any(r["overridden"] for r in R.describe(db4)))
ok, why = R.check("VOL_MULTIPLE", 1.9, db4)
check("it still cannot go under the floor after reverting", not ok, why)

print("\n=== 5. MAX_EXT_FROM_EMA20 tightens DOWNWARD ===============================")
db5 = scenario("direction")
ok, why = R.check("MAX_EXT_FROM_EMA20", 7.0, db5)
check("lowering the extension ceiling is a tightening", ok and why == "tighten", why)
ok, why = R.check("MAX_EXT_FROM_EMA20", 9.0, db5)
check("raising it is a loosening, and refused", not ok, why)

print(f"\n{'-' * 74}\n  {PASS_COUNT} passed, {FAIL_COUNT} failed\n")
sys.exit(1 if FAIL_COUNT else 0)
