"""crossover.py — the EMA(5/13) entry trigger, ported from the Pine indicator.

WHAT THIS IS, AND WHAT IT IS NOT
--------------------------------
scanner.py answers "is this name in a condition worth trading?" -- trend stacked,
momentum in band, volume participating, not overextended. It is a STATE filter,
and a name can sit in that state for weeks.

This answers a different question: "has the trigger just fired?" A 5/13 EMA
crossover is an EVENT, dated to a single bar. The two compose naturally -- the
screen says which names are worth watching, the crossover says when to act --
and neither substitutes for the other. A crossover in a downtrend is noise; a
perfect screen with no trigger is a watchlist entry, not a trade.

FIDELITY TO THE PINE
--------------------
    ta.ema(close, 5) / ta.ema(close, 13)   standard EMA, reused from scanner
    ta.atr(14)                             Wilder's RMA, reused from scanner
    ta.crossover(a, b)                     a[1] <= b[1] and a > b
    risk = atr * 1.5                       SL distance
    TP1/2/3 = entry +/- risk * 1/2/3       fixed R multiples

The levels are computed off the CLOSE of the crossover bar, exactly as the Pine
does. That matters for honesty: it is the price the indicator plots, not a price
you could necessarily have transacted at. paper_broker deliberately fills at the
NEXT session's open for that reason, and nothing here changes that.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

import pandas as pd

from scanner import atr_wilder, ema, _bar_date

FAST_LEN = 5
SLOW_LEN = 13
ATR_LEN = 14
SL_ATR_MULT = 1.5
RR = (1.0, 2.0, 3.0)


@dataclass
class Cross:
    symbol: str
    date: str
    side: str            # "buy" | "sell"
    entry: float
    stop: float
    tp1: float
    tp2: float
    tp3: float
    risk: float
    atr: float
    bars_ago: int        # 0 = fired on the latest bar

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _levels(symbol: str, day: str, side: str, close: float, atr: float,
            bars_ago: int) -> Cross:
    risk = atr * SL_ATR_MULT
    sign = 1.0 if side == "buy" else -1.0
    return Cross(
        symbol=symbol, date=day, side=side,
        entry=round(close, 2),
        stop=round(close - sign * risk, 2),
        tp1=round(close + sign * risk * RR[0], 2),
        tp2=round(close + sign * risk * RR[1], 2),
        tp3=round(close + sign * risk * RR[2], 2),
        risk=round(risk, 2), atr=round(atr, 2), bars_ago=bars_ago,
    )


def signals(symbol: str, df: pd.DataFrame, sides: tuple[str, ...] = ("buy", "sell"),
            limit: int | None = None) -> list[Cross]:
    """Every crossover in `df`, newest first.

    `limit` caps the count, not the lookback -- asking for the last 3 signals
    over two years of history is the normal request.
    """
    if df is None or len(df) < max(SLOW_LEN, ATR_LEN) + 2:
        return []

    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    fast = ema(df["close"], FAST_LEN)
    slow = ema(df["close"], SLOW_LEN)
    atr = atr_wilder(df)

    out: list[Cross] = []
    last = len(df) - 1
    for i in range(len(df) - 1, 0, -1):
        f, s = fast.iloc[i], slow.iloc[i]
        pf, ps = fast.iloc[i - 1], slow.iloc[i - 1]
        if pd.isna(f) or pd.isna(s) or pd.isna(pf) or pd.isna(ps):
            continue

        # ta.crossover / ta.crossunder, exactly: the previous bar must not
        # already be on the new side, so a series that stays above never
        # re-fires.
        if pf <= ps and f > s:
            side = "buy"
        elif pf >= ps and f < s:
            side = "sell"
        else:
            continue
        if side not in sides:
            continue

        a = atr.iloc[i]
        if pd.isna(a) or not a:
            continue
        day = _bar_date(df.iloc[: i + 1]).isoformat()
        out.append(_levels(symbol, day, side, float(df["close"].iloc[i]),
                           float(a), last - i))
        if limit and len(out) >= limit:
            break
    return out


def latest(symbol: str, df: pd.DataFrame, side: str = "buy",
           within_bars: int = 10) -> Cross | None:
    """The most recent `side` crossover, if it is recent enough to still matter.

    `within_bars` exists because a trigger is only a trigger while it is fresh.
    A buy cross from forty sessions ago is history, and treating it as a live
    entry is how a backtest quietly turns into hindsight.
    """
    for c in signals(symbol, df, sides=(side,), limit=1):
        return c if c.bars_ago <= within_bars else None
    return None


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS triggers (
    scan_date   TEXT NOT NULL,     -- the session the screen ran for
    symbol      TEXT NOT NULL,
    side        TEXT NOT NULL,
    trigger_date TEXT NOT NULL,    -- the bar the cross actually fired on
    bars_ago    INTEGER NOT NULL,
    entry       REAL, stop REAL,
    tp1 REAL, tp2 REAL, tp3 REAL,
    risk REAL, atr REAL,
    PRIMARY KEY (scan_date, symbol)
);
"""


def save(con, scan_date: str, crosses: list[Cross]) -> None:
    """Record the trigger behind each candidate, keyed to the scan that used it.

    trigger_date and scan_date are stored separately on purpose. They are equal
    on a clean setup and diverge when a name qualifies days after its cross --
    which is exactly the distinction that decides whether the levels are still
    usable, so collapsing them into one column would erase the thing worth
    knowing.
    """
    con.executescript(SCHEMA)
    con.execute("DELETE FROM triggers WHERE scan_date=?", (scan_date,))
    for c in crosses:
        con.execute(
            "INSERT OR REPLACE INTO triggers (scan_date, symbol, side, trigger_date, "
            "bars_ago, entry, stop, tp1, tp2, tp3, risk, atr) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (scan_date, c.symbol, c.side, c.date, c.bars_ago, c.entry, c.stop,
             c.tp1, c.tp2, c.tp3, c.risk, c.atr),
        )


if __name__ == "__main__":
    import sys
    from scanner import YFinanceSource, last_complete

    src = YFinanceSource()
    for sym in (sys.argv[1:] or ["JKPAPER", "TITAGARH"]):
        df = last_complete(src.daily_bars(sym, bars=260))
        print(f"\n{sym}")
        for c in signals(sym, df, sides=("buy",), limit=4):
            print(f"  {c.date}  BUY  entry {c.entry:>9.2f}  SL {c.stop:>9.2f}  "
                  f"TP1 {c.tp1:>9.2f}  TP2 {c.tp2:>9.2f}  TP3 {c.tp3:>9.2f}"
                  f"   ({c.bars_ago} bars ago)")
