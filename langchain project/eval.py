"""eval.py — the agent loop: Observe, Eval, Plan, Act.

WHERE THE INTELLIGENCE LIVES
----------------------------
Plan is deterministic. The whole system's credibility rests on the screen being
versioned and reproducible, so that an outcome attributes to a RULE. An LLM
choosing thresholds each week would reintroduce exactly the discretion the
two-book design exists to measure against: you could never separate a rule
change from a mood, and every backtest of your own history would be worthless.

So the statistics decide, the constitution in rules.py permits or refuses, and
an LLM — if used at all — only writes the prose around a decision already made.
Nothing in this file asks a model what to do.

WHAT IT LEARNS FROM
-------------------
Not closed trades. A paper book closes roughly one position a week, so waiting
for 30 closed trades per book is waiting most of a year before the first
finding, and by then the sector, the regime and the universe have all moved.

It learns from FORWARD RETURNS on everything the screen saw. Every scan day
produces ~40 observations — the names that passed and the names that did not —
and 10 sessions later the tape says what each of them did. That is a direct
measurement of the only thing the screen claims to do: separate names that go
up from names that do not. It accumulates about two hundred times faster than
closed trades, and it is the same question.

Closed-trade statistics still gate anything about POSITION MANAGEMENT — stops,
targets, time stops — because forward return says nothing about whether an exit
rule was right.

THE ORDER OF THE GATES
----------------------
Edge before calibration. If the names the screen passes do not outperform the
names it rejects, the screen has no edge, and tuning a threshold inside a
screen with no edge is fitting noise with extra steps. So F1 must pass before
any proposal is generated at all.
"""

from __future__ import annotations

import json
import sqlite3
import statistics
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv())

import rules as _rules
import scanner

TZ = ZoneInfo("Asia/Kolkata")

# --- the gates --------------------------------------------------------------
# Each is a claim about how much evidence makes a conclusion safe, and each is
# deliberately conservative: the cost of a premature rule change is paid slowly
# and invisibly, while the cost of waiting is only that the loop says "not yet".
HORIZON = 10                # sessions of forward return per observation
MIN_SCAN_DAYS = 12          # distinct sessions before any finding is offered
MIN_OBS_EDGE = 120          # observations before the edge test means anything
MIN_OBS_FILTER = 25         # near-misses on ONE filter before judging it
MIN_EDGE_PP = 1.0           # passers must beat rejects by this many points
MIN_EFFECT_PP = 2.0         # a filter verdict needs an effect at least this big
MIN_CLOSED_PER_BOOK = 30    # before anything about exits may change
NEAR_MISS_FRAC = 0.25       # "near" = within 25% of the threshold's own value

SCHEMA = """
CREATE TABLE IF NOT EXISTS forward_returns (
    scan_date TEXT NOT NULL,
    symbol    TEXT NOT NULL,
    horizon   INTEGER NOT NULL,
    ret_pct   REAL,
    computed  TEXT,
    PRIMARY KEY (scan_date, symbol, horizon)
);
CREATE TABLE IF NOT EXISTS eval_findings (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at   TEXT NOT NULL,
    code     TEXT NOT NULL,
    headline TEXT NOT NULL,
    detail   TEXT,
    evidence TEXT,
    blocked  TEXT
);
"""


@dataclass
class Finding:
    code: str
    headline: str
    detail: str = ""
    evidence: dict[str, Any] = field(default_factory=dict)
    blocked: str | None = None      # None means the evidence gate is cleared

    @property
    def ok(self) -> bool:
        return self.blocked is None


@dataclass
class Proposal:
    key: str
    current: float
    new_value: float
    rationale: str
    evidence: dict[str, Any] = field(default_factory=dict)
    allowed: bool = False
    why: str = ""


def _con(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    # scanner's schema too: scan_rejects is created by the first scan under the
    # new code, and the loop must be readable before that has happened rather
    # than dying on a table that simply does not exist yet.
    con.executescript(scanner.SCHEMA)
    con.executescript(SCHEMA)
    con.row_factory = sqlite3.Row
    return con


# ---------------------------------------------------------------------------
# OBSERVE
# ---------------------------------------------------------------------------
def collect_forward_returns(db_path: str, source=None, horizon: int = HORIZON,
                            cap: int = 400) -> int:
    """Fill in what each screened name did over the next `horizon` sessions.

    Only for scan days old enough that the horizon has actually elapsed —
    measuring a 10-session return 3 sessions later is not a smaller version of
    the same number, it is a different and misleading one.

    Cached, because the answer for a past day never changes.
    """
    source = source or scanner.YFinanceSource()
    con = _con(db_path)
    written = 0
    try:
        # Every symbol the screen has ever judged, passed or rejected.
        rows = con.execute(
            "SELECT scan_date, symbol, close FROM signals "
            "UNION ALL "
            "SELECT scan_date, symbol, close FROM scan_rejects WHERE close IS NOT NULL "
            "ORDER BY scan_date"
        ).fetchall()
        if not rows:
            return 0

        have = {(r["scan_date"], r["symbol"]) for r in con.execute(
            "SELECT scan_date, symbol FROM forward_returns WHERE horizon=?", (horizon,))}

        todo = [r for r in rows if (r["scan_date"], r["symbol"]) not in have][:cap]
        if not todo:
            return 0

        now = datetime.now(TZ).isoformat(timespec="seconds")
        by_symbol: dict[str, list] = {}
        for r in todo:
            by_symbol.setdefault(r["symbol"], []).append(r)

        for symbol, entries in by_symbol.items():
            try:
                df = scanner.last_complete(source.daily_bars(symbol, bars=120))
            except Exception:
                continue
            if df is None or not len(df):
                continue
            index = [scanner._bar_date(df.iloc[: i + 1]) for i in range(len(df))]
            pos = {d.isoformat(): i for i, d in enumerate(index)}
            closes = df["close"].tolist()

            for e in entries:
                i = pos.get(e["scan_date"])
                if i is None or i + horizon >= len(closes):
                    continue          # horizon has not elapsed, or day not on tape
                base = e["close"] or closes[i]
                if not base:
                    continue
                ret = (closes[i + horizon] - base) / base * 100.0
                con.execute(
                    "INSERT OR REPLACE INTO forward_returns "
                    "(scan_date, symbol, horizon, ret_pct, computed) VALUES (?,?,?,?,?)",
                    (e["scan_date"], e["symbol"], horizon, round(ret, 3), now),
                )
                written += 1
        con.commit()
    finally:
        con.close()
    return written


def observe(db_path: str, horizon: int = HORIZON) -> dict[str, Any]:
    """Everything the loop reasons over, read in one pass."""
    con = _con(db_path)
    try:
        scan_days = [r[0] for r in con.execute(
            "SELECT DISTINCT scan_date FROM scan_stats ORDER BY scan_date")]

        passers = con.execute(
            "SELECT s.scan_date, s.symbol, s.rsi14, s.vol_ratio, s.ext_pct, "
            "       s.turnover_cr, f.ret_pct "
            "FROM signals s JOIN forward_returns f "
            "  ON f.scan_date = s.scan_date AND f.symbol = s.symbol AND f.horizon = ?",
            (horizon,)).fetchall()

        rejects = con.execute(
            "SELECT r.scan_date, r.symbol, r.reason, r.rsi14, r.vol_ratio, r.ext_pct, "
            "       r.turnover_cr, f.ret_pct "
            "FROM scan_rejects r JOIN forward_returns f "
            "  ON f.scan_date = r.scan_date AND f.symbol = r.symbol AND f.horizon = ?",
            (horizon,)).fetchall()

        load = {r["reason"]: r["n"] for r in con.execute(
            "SELECT reason, SUM(n) AS n FROM scan_stats GROUP BY reason")}

        try:
            books = {r["book"]: dict(r) for r in con.execute(
                "SELECT book, COUNT(*) AS closed, AVG(r_multiple) AS expectancy "
                "FROM paper_positions WHERE status='closed' GROUP BY book")}
        except sqlite3.OperationalError:
            books = {}

        screened = sum(load.values())
        passed = con.execute("SELECT COUNT(*) FROM signals").fetchone()[0]

        return {
            "scan_days": scan_days,
            "passers": [dict(r) for r in passers],
            "rejects": [dict(r) for r in rejects],
            "filter_load": load,
            "books": books,
            "screened": screened + passed,
            "passed": passed,
            "rules": _rules.effective(db_path),
            "db_path": db_path,
        }
    finally:
        con.close()


# ---------------------------------------------------------------------------
# EVAL
# ---------------------------------------------------------------------------
def _median(values: list[float]) -> float | None:
    vals = [v for v in values if v is not None]
    return round(statistics.median(vals), 2) if vals else None


# Which measured column each filter is about, and whether a REJECT sits above
# or below the threshold. Only filters with a continuous, tunable threshold
# appear here: below_ema and ema_not_stacked are structural facts, not dials.
FILTER_COLUMN = {
    "volume_thin":     ("vol_ratio",   "VOL_MULTIPLE",       "below"),
    "too_extended":    ("ext_pct",     "MAX_EXT_FROM_EMA20", "above"),
    "illiquid":        ("turnover_cr", "MIN_TURNOVER_CR",    "below"),
    "rsi_out_of_band": ("rsi14",       None,                 "either"),
}


def evaluate(obs: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    days = len(obs["scan_days"])
    passers, rejects = obs["passers"], obs["rejects"]
    n_obs = len(passers) + len(rejects)

    # --- F0: is there enough history to say anything at all? ----------------
    if days < MIN_SCAN_DAYS:
        findings.append(Finding(
            "F0", "Not enough sessions on record",
            f"{days} of {MIN_SCAN_DAYS} sessions screened. Every finding below "
            f"needs a history to measure against.",
            {"scan_days": days, "need": MIN_SCAN_DAYS},
            blocked=f"needs {MIN_SCAN_DAYS} scan days, has {days}"))

    # --- F1: does the screen have an edge? ----------------------------------
    # This runs first and everything else depends on it. Tuning a threshold
    # inside a screen that does not separate winners from losers is fitting
    # noise with extra steps.
    p_ret = _median([p["ret_pct"] for p in passers])
    r_ret = _median([r["ret_pct"] for r in rejects])
    edge = None if (p_ret is None or r_ret is None) else round(p_ret - r_ret, 2)

    ev = {"passers": len(passers), "rejects": len(rejects),
          "median_passer_pct": p_ret, "median_reject_pct": r_ret,
          "edge_pp": edge, "horizon": HORIZON}

    if n_obs < MIN_OBS_EDGE:
        findings.append(Finding(
            "F1", "Edge unproven — not enough forward returns yet",
            f"{n_obs} of {MIN_OBS_EDGE} observations have a {HORIZON}-session "
            f"return on record.",
            ev, blocked=f"needs {MIN_OBS_EDGE} observations, has {n_obs}"))
    elif edge is None:
        findings.append(Finding("F1", "Edge unproven — no forward returns", "", ev,
                                blocked="no forward returns computed"))
    elif edge < MIN_EDGE_PP:
        findings.append(Finding(
            "F1", f"The screen shows no edge ({edge:+.2f}pp)",
            f"Over {HORIZON} sessions the names it passed returned a median "
            f"{p_ret:+.2f}% against {r_ret:+.2f}% for the names it rejected. "
            f"Until that gap exceeds {MIN_EDGE_PP}pp, no threshold should move: "
            f"tuning a screen with no edge fits noise.",
            ev, blocked="screen has no measurable edge; calibration is premature"))
    else:
        findings.append(Finding(
            "F1", f"The screen has an edge of {edge:+.2f}pp",
            f"Passed names returned a median {p_ret:+.2f}% over {HORIZON} "
            f"sessions against {r_ret:+.2f}% for rejected names, across "
            f"{n_obs} observations.", ev))

    # --- F2: is each filter's threshold in the right place? -----------------
    # A near-miss is a name the filter rejected while sitting close to the line.
    # If near-misses outperform the names that passed, the line is in the wrong
    # place; if they underperform, the filter is earning its keep.
    for reason, (col, key, side) in FILTER_COLUMN.items():
        if key is None:
            continue
        threshold = obs["rules"].get(key)
        if threshold is None:
            continue

        margin = abs(threshold) * NEAR_MISS_FRAC
        near = [r for r in rejects
                if r["reason"] == reason and r.get(col) is not None
                and abs(r[col] - threshold) <= margin]

        if len(near) < MIN_OBS_FILTER:
            findings.append(Finding(
                f"F2:{reason}", f"{key} — not enough near-misses to judge",
                f"{len(near)} of {MIN_OBS_FILTER} rejects sat within "
                f"{margin:g} of the {threshold:g} threshold.",
                {"filter": reason, "near_misses": len(near), "threshold": threshold},
                blocked=f"needs {MIN_OBS_FILTER} near-misses, has {len(near)}"))
            continue

        near_ret = _median([r["ret_pct"] for r in near])
        gap = None if (near_ret is None or p_ret is None) else round(near_ret - p_ret, 2)
        ev2 = {"filter": reason, "threshold": threshold, "near_misses": len(near),
               "median_near_pct": near_ret, "median_passer_pct": p_ret,
               "gap_pp": gap}

        if gap is None:
            continue
        if gap >= MIN_EFFECT_PP:
            findings.append(Finding(
                f"F2:{reason}", f"{key} may be too strict",
                f"Names rejected just outside the line returned a median "
                f"{near_ret:+.2f}% against {p_ret:+.2f}% for names that passed — "
                f"the filter is excluding names that went on to do better. "
                f"Loosening is outside what the agent may do, so this is "
                f"reported, not acted on.",
                ev2, blocked="loosening past baseline is not permitted; human decision"))
        elif gap <= -MIN_EFFECT_PP:
            findings.append(Finding(
                f"F2:{reason}", f"{key} is earning its keep, and may be too loose",
                f"Near-miss rejects returned a median {near_ret:+.2f}% against "
                f"{p_ret:+.2f}% for passers. Names close to this line "
                f"underperform, which is grounds for moving the line toward the "
                f"names that work.", ev2))
        else:
            findings.append(Finding(
                f"F2:{reason}", f"{key} sits about right",
                f"Near-miss rejects and passers are within {abs(gap):.2f}pp of "
                f"each other; nothing here justifies moving the threshold.", ev2))

    # --- F3: exits, which forward return cannot speak to --------------------
    for book in ("FIXED", "STRUCTURAL"):
        stats = obs["books"].get(book, {})
        closed = stats.get("closed", 0) or 0
        if closed < MIN_CLOSED_PER_BOOK:
            findings.append(Finding(
                f"F3:{book}", f"{book} exits — not enough closed trades",
                f"{closed} of {MIN_CLOSED_PER_BOOK} closed. Forward return says "
                f"nothing about whether an exit rule was right, so this one "
                f"genuinely has to wait for the book.",
                {"book": book, "closed": closed}, blocked=
                f"needs {MIN_CLOSED_PER_BOOK} closed trades, has {closed}"))
        else:
            findings.append(Finding(
                f"F3:{book}", f"{book}: expectancy {stats.get('expectancy'):+.2f}R "
                f"over {closed} closed trades",
                "", {"book": book, **stats}))

    # --- F4: has tightening starved the screen? -----------------------------
    # The constitution only lets the agent tighten, so the loop has to watch for
    # its own ratchet. A screen that has stopped producing candidates is a
    # finding, and the remedy is reverting a tightening, never loosening.
    if obs["screened"]:
        rate = obs["passed"] / obs["screened"] * 100
        overridden = [r for r in _rules.describe(obs["db_path"]) if r["overridden"]]
        if rate < 0.5 and overridden:
            findings.append(Finding(
                "F4", f"Take rate has fallen to {rate:.2f}%",
                "The agent has tightened thresholds and the screen has nearly "
                "stopped passing names. The remedy is reverting a tightening, "
                "which the constitution permits.",
                {"take_rate_pct": round(rate, 2),
                 "overridden": [r["key"] for r in overridden]}))
    return findings


# ---------------------------------------------------------------------------
# PLAN
# ---------------------------------------------------------------------------
def plan(obs: dict[str, Any], findings: list[Finding], db_path: str) -> list[Proposal]:
    """Turn cleared findings into threshold changes. Deterministic throughout.

    Nothing is proposed unless F1 shows a measurable edge: a threshold moved
    inside a screen that does not separate winners from losers is noise given
    authority.
    """
    f1 = next((f for f in findings if f.code == "F1"), None)
    if not f1 or not f1.ok:
        return []
    if any(f.code == "F0" and not f.ok for f in findings):
        return []

    proposals: list[Proposal] = []
    for f in findings:
        if not f.code.startswith("F2:") or not f.ok:
            continue
        gap = f.evidence.get("gap_pp")
        if gap is None or gap > -MIN_EFFECT_PP:
            continue        # only the "too loose" verdict yields an action

        reason = f.evidence["filter"]
        _, key, _ = FILTER_COLUMN[reason]
        current = obs["rules"][key]

        # One conservative step, not a jump to wherever the data points. The
        # step is 10% of the BASELINE, so repeated proposals walk the threshold
        # slowly and the drift cap in rules.py can still catch the walk.
        step = abs(_rules.BASELINE[key]) * 0.10 * _rules.TIGHTER[key]
        new_value = round(current + step, 3)

        allowed, why = _rules.check(key, new_value, db_path)
        proposals.append(Proposal(
            key=key, current=current, new_value=new_value,
            rationale=(f"names near the {key} line returned "
                       f"{f.evidence['median_near_pct']:+.2f}% against "
                       f"{f.evidence['median_passer_pct']:+.2f}% for passers "
                       f"over {HORIZON} sessions ({f.evidence['near_misses']} obs)"),
            evidence=f.evidence, allowed=allowed, why=why))
    return proposals


# ---------------------------------------------------------------------------
# ACT
# ---------------------------------------------------------------------------
def act(proposals: list[Proposal], db_path: str, dry_run: bool = False) -> list[str]:
    applied = []
    for p in proposals:
        if not p.allowed:
            applied.append(f"REFUSED {p.key} -> {p.new_value:g}: {p.why}")
            continue
        if dry_run:
            applied.append(f"WOULD {p.why} {p.key} {p.current:g} -> {p.new_value:g}")
            continue
        ok, why = _rules.apply(db_path, p.key, p.new_value, p.rationale,
                               json.dumps(p.evidence, default=str))
        applied.append(
            f"{'APPLIED' if ok else 'REFUSED'} {p.key} {p.current:g} -> "
            f"{p.new_value:g} ({why})")
    return applied


# ---------------------------------------------------------------------------
# REPORT
# ---------------------------------------------------------------------------
def report(obs, findings, proposals, actions, db_path) -> str:
    lines = [f"AGENT LOOP — {datetime.now(TZ):%Y-%m-%d}", ""]
    lines.append(f"OBSERVED  {len(obs['scan_days'])} sessions · "
                 f"{len(obs['passers'])} passers and {len(obs['rejects'])} rejects "
                 f"with {HORIZON}-session returns")

    active = [r for r in _rules.describe(db_path) if r["overridden"]]
    if active:
        lines.append("RULES     " + ", ".join(
            f"{r['key']} {r['value']:g} (floor {r['baseline']:g})" for r in active))
    else:
        lines.append("RULES     all at baseline")

    lines += ["", "FINDINGS"]
    for f in findings:
        mark = "ok  " if f.ok else "wait"
        lines.append(f"  [{mark}] {f.headline}")
        if f.blocked:
            lines.append(f"         {f.blocked}")

    lines += ["", "PROPOSALS"]
    lines += [f"  {a}" for a in actions] if actions else ["  none — no finding cleared its gate."]

    blocked = [f for f in findings if not f.ok]
    if blocked:
        lines += ["", "The loop is deliberately idle. It changes nothing until the",
                  "evidence clears a gate, and says which gate it is waiting on."]
    return "\n".join(lines)


def run(db_path: str | None = None, apply_changes: bool = True,
        fetch: bool = True) -> str:
    db_path = db_path or scanner.DB_PATH

    if fetch:
        try:
            n = collect_forward_returns(db_path)
            print(f"[eval] {n} forward returns computed")
        except Exception as e:
            print(f"[eval] forward returns unavailable ({str(e)[:80]})")

    obs = observe(db_path)
    findings = evaluate(obs)
    proposals = plan(obs, findings, db_path)
    actions = act(proposals, db_path, dry_run=not apply_changes)

    con = _con(db_path)
    try:
        now = datetime.now(TZ).isoformat(timespec="seconds")
        for f in findings:
            con.execute(
                "INSERT INTO eval_findings (run_at, code, headline, detail, evidence, blocked) "
                "VALUES (?,?,?,?,?,?)",
                (now, f.code, f.headline, f.detail,
                 json.dumps(f.evidence, default=str), f.blocked))
        con.commit()
    finally:
        con.close()

    return report(obs, findings, proposals, actions, db_path)


if __name__ == "__main__":
    import sys
    print(run(apply_changes="--dry-run" not in sys.argv))
