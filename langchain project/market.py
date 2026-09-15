"""market.py — the regime gate. Is the index in a state worth trading at all?

The screen answers "which stock", and it answers it just as confidently on a day
the whole market is falling. Sector strength is relative: on 2026-09-15 the best
sector on the board was Paper at **+0.56%**, with breadth 14/29 — more of its
constituents fell than rose — while NIFTY closed −1.19% with EMA5 (23,401.76)
below EMA13 (23,685.66) and RSI at 22. "Best sector" there means least bad.

So the pipeline gets one question in front of the others: is the index long? If
it is not, nothing downstream runs. That ordering is deliberate —

    regime  ->  sector  ->  stock  ->  trigger

each step only meaningful if the one before it said yes.

The test is the SAME indicator the stock trigger uses, on the index instead of
the stock: EMA 5/13, the `5 13 14 1.5 1 2 3` in the chart header. Using one
definition of trend for both means the gate and the entry can never disagree
about what "bullish" is, which is the usual way a regime filter starts quietly
contradicting the signal it is supposed to be protecting.

One difference, and it matters. For a stock the trigger is an EVENT — it must
have fired within TRIGGER_MAX_BARS or it is stale. For the index this is a
STATE: the market has been in an uptrend since the last buy cross and remains in
one. Asking the index for a fresh cross would close the gate on every day except
the handful right after a turn, which is not a regime filter, it is a different
strategy.
"""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass, asdict
from datetime import date
from typing import Any

import pandas as pd

from scanner import ema, _bar_date
from crossover import FAST_LEN, SLOW_LEN, signals

# ^NSEI is NIFTY 50 on Yahoo. Override to screen against a different benchmark
# (^CNXSC for smallcap, say) without touching the code.
MARKET_SYMBOL = os.getenv("MARKET_SYMBOL", "^NSEI")

# The gate itself. Off means the old behaviour: screen regardless of the index.
# Left switchable because turning it on is a change of strategy, not a bug fix,
# and its effect has to be measurable against the runs made without it.
REQUIRE_MARKET_UPTREND = os.getenv("REQUIRE_MARKET_UPTREND", "1") != "0"


@dataclass
class Regime:
    symbol: str
    date: str
    close: float
    ema_fast: float
    ema_slow: float
    bullish: bool
    last_cross_date: str | None   # when the current state began
    last_cross_side: str | None
    bars_in_state: int | None

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)

    def line(self) -> str:
        """One line for Telegram. Always says the numbers, never just a verdict."""
        state = "BULLISH" if self.bullish else "BEARISH"
        gap = (self.ema_fast - self.ema_slow) / self.ema_slow * 100 if self.ema_slow else 0
        s = (f"{self.symbol} {state} — {self.close:,.2f} · "
             f"EMA{FAST_LEN} {self.ema_fast:,.2f} vs EMA{SLOW_LEN} "
             f"{self.ema_slow:,.2f} ({gap:+.2f}%)")
        if self.last_cross_date:
            s += (f" · {self.last_cross_side} cross {self.last_cross_date}"
                  f"{f', {self.bars_in_state} sessions ago' if self.bars_in_state else ''}")
        return s


def read(df: pd.DataFrame, symbol: str = MARKET_SYMBOL) -> Regime | None:
    """The index's trend state on the last complete bar in `df`."""
    if df is None or len(df) < SLOW_LEN + 2:
        return None

    d = df.copy()
    d.columns = [c.lower() for c in d.columns]
    fast = ema(d["close"], FAST_LEN)
    slow = ema(d["close"], SLOW_LEN)
    f, s = float(fast.iloc[-1]), float(slow.iloc[-1])
    if pd.isna(f) or pd.isna(s):
        return None

    last = signals(symbol, d, limit=1)
    c = last[0] if last else None
    return Regime(
        symbol=symbol,
        date=_bar_date(d).isoformat(),
        close=round(float(d["close"].iloc[-1]), 2),
        ema_fast=round(f, 2),
        ema_slow=round(s, 2),
        bullish=f > s,
        last_cross_date=c.date if c else None,
        last_cross_side=c.side if c else None,
        bars_in_state=c.bars_ago if c else None,
    )


def fetch(symbol: str = MARKET_SYMBOL, period_days: int = 260) -> pd.DataFrame | None:
    """Index bars, RAW.

    `auto_adjust=False` for the same reason the scanner uses it: adjusted series
    move EMAs around and stop agreeing with the chart. An index has no dividends
    to adjust for, so this changes nothing today — it is here so that the day
    someone points this at a total-return series, the numbers still match what
    TradingView draws.
    """
    import yfinance as yf

    try:
        df = yf.Ticker(symbol).history(period=f"{period_days}d", auto_adjust=False)
    except Exception as e:
        print(f"[market] {symbol} fetch failed: {str(e)[:80]}")
        return None
    return df if df is not None and not df.empty else None


SCHEMA = """
CREATE TABLE IF NOT EXISTS market_regime (
    session     TEXT PRIMARY KEY,   -- the session this reading gated
    symbol      TEXT NOT NULL,
    bar_date    TEXT NOT NULL,
    close       REAL,
    ema_fast    REAL,
    ema_slow    REAL,
    bullish     INTEGER NOT NULL,
    gated       INTEGER NOT NULL,   -- 1 = the screen was skipped because of this
    last_cross_date TEXT,
    last_cross_side TEXT,
    recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


def save(con: sqlite3.Connection, session: str, r: Regime | None, gated: bool) -> None:
    """Record every reading, including the ones that let the screen through.

    Only logging the blocks would make the gate impossible to evaluate: you
    cannot ask "what did this filter cost me" from a table that only contains
    the days it fired.
    """
    con.executescript(SCHEMA)
    if r is None:
        return
    con.execute(
        "INSERT OR REPLACE INTO market_regime "
        "(session, symbol, bar_date, close, ema_fast, ema_slow, bullish, gated, "
        " last_cross_date, last_cross_side) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (session, r.symbol, r.date, r.close, r.ema_fast, r.ema_slow,
         int(r.bullish), int(gated), r.last_cross_date, r.last_cross_side),
    )
    con.commit()


def previous_bullish(db_path: str, session: str) -> bool | None:
    """The last recorded state BEFORE this session. None if there is no history.

    This is what turns a state into an event. Reporting the state every day is
    what makes a filter that is doing its job indistinguishable from a broken
    one -- after a fortnight of identical messages nobody reads the fifteenth.
    """
    con = sqlite3.connect(db_path)
    try:
        con.executescript(SCHEMA)
        r = con.execute(
            "SELECT bullish FROM market_regime WHERE session < ? "
            "ORDER BY session DESC LIMIT 1", (session,)
        ).fetchone()
        return bool(r[0]) if r else None
    finally:
        con.close()


def check(session: str, db_path: str | None = None) -> tuple[bool, Regime | None, str, bool]:
    """(may_screen, regime, why, changed).

    A fetch failure opens the gate rather than closing it. The alternative is a
    Yahoo outage silently suspending the strategy, with 'no setups today' as the
    only symptom — and a gate that fails closed and says nothing is worse than
    no gate, because it looks identical to a calm market.
    """
    if not REQUIRE_MARKET_UPTREND:
        return True, None, "market gate off", False

    df = fetch()
    r = read(df) if df is not None else None
    if r is None:
        return True, None, (f"{MARKET_SYMBOL} unavailable — screening anyway "
                            f"rather than going quiet on a data failure"), False

    # Read the previous state BEFORE writing this one, or every day looks like
    # a change.
    prev = previous_bullish(db_path, session) if db_path else None
    changed = prev is None or prev != r.bullish

    if db_path:
        con = sqlite3.connect(db_path)
        try:
            save(con, session, r, gated=not r.bullish)
        finally:
            con.close()

    return r.bullish, r, r.line(), changed
