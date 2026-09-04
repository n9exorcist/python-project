"""
paper_broker.py — deterministic paper trading with two rule sets in parallel.

Why two. You asked for a fixed 15-20% target and a 7-8% stop. That is a sound,
measurable rule and it is the right thing for a learning system: it is
consistent, so results attribute to the *screen* rather than to discretionary
stop placement.

But a flat 7-8% stop on an Indian smallcap is inside one day's normal range for
a lot of names. When a stop sits inside the noise, you get stopped out of trades
that later work, and the log tells you the screen is bad when actually the stop
was. You cannot detect that from one portfolio's results.

So every signal opens a position in both books:
    FIXED       - your spec: entry, -7.5% stop, +17.5% target
    STRUCTURAL  - 2.5 x ATR(14) stop, target at 2.5R

Same signals, same entry price, same timing. After ~30 closed trades the
comparison answers a question no single book can: is the edge in the screen,
or in how the risk is framed? Extends memory.db alongside the existing
MockBroker rather than replacing it.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date
from typing import Literal

Book = Literal["FIXED", "STRUCTURAL"]

# --- FIXED book -------------------------------------------------------------
FIXED_STOP_PCT = 7.5
FIXED_TARGET_PCT = 17.5

# --- STRUCTURAL book --------------------------------------------------------
ATR_STOP_MULT = 2.5
STRUCTURAL_RR = 2.5

# --- shared -----------------------------------------------------------------
MAX_OPEN_PER_BOOK = 8          # concentration cap
TIME_STOP_DAYS = 30            # a swing that hasn't worked in 30 sessions is dead money
NOTIONAL_PER_TRADE = 100_000.0  # fixed notional keeps R comparable across books

SCHEMA = """
CREATE TABLE IF NOT EXISTS paper_positions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book        TEXT NOT NULL,
    symbol      TEXT NOT NULL,
    signal_date TEXT NOT NULL,
    entry_date  TEXT NOT NULL,
    entry       REAL NOT NULL,
    stop        REAL NOT NULL,
    target      REAL NOT NULL,
    qty         INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open',
    exit_date   TEXT,
    exit_price  REAL,
    exit_reason TEXT,
    r_multiple  REAL,
    pnl         REAL,
    UNIQUE(book, symbol, signal_date)
);
CREATE INDEX IF NOT EXISTS ix_pp_open ON paper_positions(status, book);
"""


@dataclass
class Levels:
    entry: float
    stop: float
    target: float

    @property
    def risk(self) -> float:
        return self.entry - self.stop

    @property
    def rr(self) -> float:
        return (self.target - self.entry) / self.risk if self.risk else 0.0


def levels_for(book: Book, entry: float, atr: float) -> Levels:
    if book == "FIXED":
        return Levels(
            entry=entry,
            stop=round(entry * (1 - FIXED_STOP_PCT / 100), 2),
            target=round(entry * (1 + FIXED_TARGET_PCT / 100), 2),
        )
    stop = round(entry - ATR_STOP_MULT * atr, 2)
    risk = entry - stop
    return Levels(entry=entry, stop=stop, target=round(entry + STRUCTURAL_RR * risk, 2))


def open_positions(con: sqlite3.Connection, book: Book) -> int:
    return con.execute(
        "SELECT COUNT(*) FROM paper_positions WHERE status='open' AND book=?", (book,)
    ).fetchone()[0]


def enter(
    con: sqlite3.Connection,
    symbol: str,
    signal_date: str,
    fill_price: float,
    atr: float,
    entry_date: str | None = None,
) -> list[str]:
    """Open the same signal in both books. Fill at next session's open —
    never at the signal bar's close. Filling at the close of the bar that
    generated the signal is the single most common way a paper log flatters
    itself, because that price was not available when the signal appeared.
    """
    con.executescript(SCHEMA)
    entry_date = entry_date or date.today().isoformat()
    notes: list[str] = []

    for book in ("FIXED", "STRUCTURAL"):
        if open_positions(con, book) >= MAX_OPEN_PER_BOOK:
            notes.append(f"{book}: skipped {symbol}, book full")
            continue
        lv = levels_for(book, fill_price, atr)
        if lv.risk <= 0:
            notes.append(f"{book}: skipped {symbol}, non-positive risk")
            continue
        qty = max(1, int(NOTIONAL_PER_TRADE // fill_price))
        try:
            con.execute(
                "INSERT INTO paper_positions "
                "(book,symbol,signal_date,entry_date,entry,stop,target,qty) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (book, symbol, signal_date, entry_date,
                 lv.entry, lv.stop, lv.target, qty),
            )
            notes.append(
                f"{book}: {symbol} x{qty} @ {lv.entry} "
                f"SL {lv.stop} TGT {lv.target} ({lv.rr:.2f}R)"
            )
        except sqlite3.IntegrityError:
            notes.append(f"{book}: {symbol} already open for {signal_date}")
    con.commit()
    return notes


def mark_to_market(con: sqlite3.Connection, bars: dict[str, dict]) -> list[str]:
    """bars: {symbol: {'high':..,'low':..,'close':..,'date':..}}

    Ambiguity rule: if a bar's low breaches the stop AND its high reaches the
    target, we book the stop. Daily bars cannot tell us which came first, and
    assuming the win is how a backtest lies to you.
    """
    con.executescript(SCHEMA)
    events: list[str] = []
    rows = con.execute(
        "SELECT id,book,symbol,entry,stop,target,qty,entry_date "
        "FROM paper_positions WHERE status='open'"
    ).fetchall()

    for pid, book, sym, entry, stop, target, qty, entry_date in rows:
        bar = bars.get(sym)
        if not bar:
            continue
        risk = entry - stop
        hit_stop = bar["low"] <= stop
        hit_tgt = bar["high"] >= target

        if hit_stop:
            px, reason = stop, "stop"
        elif hit_tgt:
            px, reason = target, "target"
        else:
            held = (date.fromisoformat(bar["date"]) - date.fromisoformat(entry_date)).days
            if held >= TIME_STOP_DAYS:
                px, reason = bar["close"], "time_stop"
            else:
                continue

        r = (px - entry) / risk if risk else 0.0
        con.execute(
            "UPDATE paper_positions SET status='closed', exit_date=?, exit_price=?, "
            "exit_reason=?, r_multiple=?, pnl=? WHERE id=?",
            (bar["date"], px, reason, round(r, 3), round((px - entry) * qty, 2), pid),
        )
        events.append(f"{book}: {sym} closed {reason} @ {px} ({r:+.2f}R)")
    con.commit()
    return events


def weekly_stats(con: sqlite3.Connection, book: Book) -> dict:
    con.executescript(SCHEMA)
    rows = con.execute(
        "SELECT r_multiple, pnl, exit_reason FROM paper_positions "
        "WHERE status='closed' AND book=? AND r_multiple IS NOT NULL", (book,)
    ).fetchall()
    if not rows:
        return {"book": book, "closed": 0}

    rs = [r[0] for r in rows]
    wins = [r for r in rs if r > 0]
    losses = [r for r in rs if r <= 0]
    reasons: dict[str, int] = {}
    for _, _, why in rows:
        reasons[why] = reasons.get(why, 0) + 1

    return {
        "book": book,
        "closed": len(rs),
        "hits": len(wins),
        "misses": len(losses),
        "win_rate": round(len(wins) / len(rs) * 100, 1),
        "total_R": round(sum(rs), 2),
        "expectancy_R": round(sum(rs) / len(rs), 3),
        "avg_win_R": round(sum(wins) / len(wins), 2) if wins else 0.0,
        "avg_loss_R": round(sum(losses) / len(losses), 2) if losses else 0.0,
        "pnl": round(sum(r[1] for r in rows), 2),
        "open": open_positions(con, book),
        "exit_reasons": reasons,
    }


def weekly_report(db_path: str = "memory.db") -> str:
    """Plain text, sized for a Telegram message."""
    con = sqlite3.connect(db_path)
    try:
        a, b = weekly_stats(con, "FIXED"), weekly_stats(con, "STRUCTURAL")
    finally:
        con.close()

    if not a.get("closed") and not b.get("closed"):
        return "Weekly report: no closed paper trades yet."

    lines = [f"WEEKLY PAPER REPORT — {date.today().isoformat()}", ""]
    for s in (a, b):
        if not s.get("closed"):
            lines += [f"{s['book']}: no closed trades", ""]
            continue
        lines += [
            f"{s['book']}",
            f"  closed {s['closed']}   hits {s['hits']}   misses {s['misses']}"
            f"   win {s['win_rate']}%",
            f"  total {s['total_R']:+}R   expectancy {s['expectancy_R']:+}R/trade",
            f"  avg win {s['avg_win_R']:+}R   avg loss {s['avg_loss_R']:+}R",
            f"  exits: " + ", ".join(f"{k} {v}" for k, v in s["exit_reasons"].items()),
            f"  open {s['open']}",
            "",
        ]

    if a.get("closed", 0) >= 10 and b.get("closed", 0) >= 10:
        gap = a["expectancy_R"] - b["expectancy_R"]
        better = "fixed-percent" if gap > 0 else "volatility-based"
        lines.append(
            f"After {a['closed']} trades each, the {better} rules lead by "
            f"{abs(gap):.3f}R per trade."
        )
    else:
        lines.append("Fewer than 10 closed trades per book — too early to compare.")
    return "\n".join(lines)


if __name__ == "__main__":
    # A throwaway file in the OS temp dir, never the real book. "/tmp/..."
    # would resolve to the current drive root on Windows and fail if that
    # folder is absent.
    import os
    import tempfile

    demo_db = os.path.join(tempfile.gettempdir(), "paper_demo.db")
    if os.path.exists(demo_db):
        os.remove(demo_db)          # a rerun must not trip the UNIQUE constraint
    con = sqlite3.connect(demo_db)
    print("\n".join(enter(con, "DYCL", "2026-08-28", 472.0, atr=18.0)))
    print("\n".join(mark_to_market(
        con, {"DYCL": {"high": 560.0, "low": 468.0, "close": 555.0, "date": "2026-09-15"}}
    )))
    con.close()
    print()
    print(weekly_report(demo_db))
