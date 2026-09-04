"""
scanner.py — deterministic swing screener.

No LLM calls happen in this module. That is deliberate: with a 100K token/day
Groq cap, every candidate that reaches an agent must already have earned its
place. Python does the arithmetic on 500 symbols; the LLM sees 5.

Plugs into the existing MarketAnalystPro layout:
    - writes candidates to memory.db (table: signals)
    - the supervisor graph reads them via mcp_read_signals_csv / a new
      mcp_get_pending_signals tool
"""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass, asdict
from datetime import date, datetime
from typing import Iterable, Protocol

import numpy as np
import pandas as pd
from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv())

# ----------------------------------------------------------------------------
# Screen thresholds. Keep them here, in one place, versioned — the weekly
# report attributes hits and misses back to these numbers, so changing one
# mid-quarter invalidates the comparison. Bump SCREEN_VERSION when you edit.
# ----------------------------------------------------------------------------
DB_PATH = os.getenv("AGENT_DB", "memory.db")

SCREEN_VERSION = "v1.0"

RSI_MIN, RSI_MAX = 55.0, 72.0
VOL_MULTIPLE = 2.0            # vs 20-day average volume
MAX_EXT_FROM_EMA20 = 8.0      # percent; beyond this the stop is too far
MIN_TURNOVER_CR = 2.0         # daily traded value floor, in Rs crore
MIN_HISTORY_BARS = 220        # need a real 200 EMA, not a warm-up artefact
CIRCUIT_BAND = 19.5           # percent move that implies a circuit lock


class PriceSource(Protocol):
    """Swap yfinance for Angel One / Dhan / Kite without touching the screen."""

    def daily_bars(self, symbol: str, bars: int) -> pd.DataFrame:
        """Return columns: open, high, low, close, volume — oldest first."""
        ...


@dataclass
class Candidate:
    symbol: str
    scan_date: str
    close: float
    ema20: float
    ema50: float
    ema200: float
    rsi14: float
    vol_ratio: float
    ext_pct: float           # distance above the 20 EMA, percent
    turnover_cr: float
    atr14: float
    atr_pct: float
    screen_version: str = SCREEN_VERSION


# ----------------------------------------------------------------------------
# Indicators
# ----------------------------------------------------------------------------
def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def _wilder_smooth(values: np.ndarray, period: int, first_idx: int) -> np.ndarray:
    """Seed with the simple mean of the first `period` observations, then apply
    Wilder's recursive smoothing. The common `ewm(alpha=1/period)` shortcut
    converges to this eventually but is materially wrong for the first ~50
    bars — which matters the moment you backtest a short series.
    """
    out = np.full(len(values), np.nan)
    seed_end = first_idx + period
    if seed_end > len(values):
        return out
    out[seed_end - 1] = np.nanmean(values[first_idx:seed_end])
    for i in range(seed_end, len(values)):
        out[i] = (out[i - 1] * (period - 1) + values[i]) / period
    return out


def rsi_wilder(close: pd.Series, period: int = 14) -> pd.Series:
    """Wilder's RSI — the one TradingView draws."""
    delta = close.diff()
    gain = delta.clip(lower=0.0).to_numpy()
    loss = (-delta.clip(upper=0.0)).to_numpy()

    avg_gain = _wilder_smooth(gain, period, 1)
    avg_loss = _wilder_smooth(loss, period, 1)

    with np.errstate(divide="ignore", invalid="ignore"):
        rs = avg_gain / avg_loss
        rsi = 100.0 - (100.0 / (1.0 + rs))
    # all-gain windows have zero average loss: RSI is 100, not undefined
    rsi = np.where((avg_loss == 0) & ~np.isnan(avg_gain), 100.0, rsi)
    return pd.Series(rsi, index=close.index)


def atr_wilder(df: pd.DataFrame, period: int = 14) -> pd.Series:
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return pd.Series(_wilder_smooth(tr.to_numpy(), period, 1), index=df.index)


# ----------------------------------------------------------------------------
# The screen
# ----------------------------------------------------------------------------
def evaluate(symbol: str, df: pd.DataFrame) -> tuple[Candidate | None, str]:
    """Return (candidate, reason). Candidate is None when the symbol fails.

    The reason string is stored for every rejection. That is what makes the
    weekly report able to say *which filter* is doing the work — without it
    you only ever see the names that passed.
    """
    if df is None or len(df) < MIN_HISTORY_BARS:
        return None, "insufficient_history"

    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    close = df["close"]

    e20, e50, e200 = ema(close, 20), ema(close, 50), ema(close, 200)
    rsi = rsi_wilder(close)
    atr = atr_wilder(df)

    last = -1
    c = float(close.iloc[last])
    v20, v50, v200 = float(e20.iloc[last]), float(e50.iloc[last]), float(e200.iloc[last])
    r = float(rsi.iloc[last])
    a = float(atr.iloc[last])

    avg_vol20 = float(df["volume"].iloc[-21:-1].mean())
    vol_ratio = float(df["volume"].iloc[last]) / avg_vol20 if avg_vol20 > 0 else 0.0
    turnover_cr = c * float(df["volume"].iloc[last]) / 1e7
    ext_pct = (c - v20) / v20 * 100.0 if v20 else 0.0

    prev_close = float(close.iloc[last - 1])
    day_move = (c - prev_close) / prev_close * 100.0 if prev_close else 0.0
    high = float(df["high"].iloc[last])
    low = float(df["low"].iloc[last])

    # --- hard exclusions first, cheapest and most decisive -------------------
    if abs(day_move) >= CIRCUIT_BAND and (c == high or c == low):
        return None, "circuit_locked"
    if turnover_cr < MIN_TURNOVER_CR:
        return None, "illiquid"

    # --- trend structure ----------------------------------------------------
    if not (c > v20 and c > v50 and c > v200):
        return None, "below_ema"
    if not (v20 > v50 > v200):
        return None, "ema_not_stacked"
    if not (e20.iloc[last] > e20.iloc[last - 5] and e50.iloc[last] > e50.iloc[last - 5]):
        return None, "ema_not_rising"

    # --- momentum and participation -----------------------------------------
    if not (RSI_MIN <= r <= RSI_MAX):
        return None, "rsi_out_of_band"
    if vol_ratio < VOL_MULTIPLE:
        return None, "volume_thin"
    if ext_pct > MAX_EXT_FROM_EMA20:
        return None, "too_extended"

    return (
        Candidate(
            symbol=symbol,
            scan_date=date.today().isoformat(),
            close=round(c, 2),
            ema20=round(v20, 2),
            ema50=round(v50, 2),
            ema200=round(v200, 2),
            rsi14=round(r, 2),
            vol_ratio=round(vol_ratio, 2),
            ext_pct=round(ext_pct, 2),
            turnover_cr=round(turnover_cr, 2),
            atr14=round(a, 2),
            atr_pct=round(a / c * 100.0, 2),
        ),
        "pass",
    )


def scan(
    symbols: Iterable[str],
    source: PriceSource,
    db_path: str | None = None,
) -> list[Candidate]:
    passed: list[Candidate] = []
    rejects: dict[str, int] = {}

    for sym in symbols:
        try:
            df = source.daily_bars(sym, bars=260)
        except Exception:
            rejects["fetch_error"] = rejects.get("fetch_error", 0) + 1
            continue
        cand, reason = evaluate(sym, df)
        if cand:
            passed.append(cand)
        else:
            rejects[reason] = rejects.get(reason, 0) + 1

    _persist(passed, rejects, db_path or DB_PATH)
    return passed


# ----------------------------------------------------------------------------
# Persistence — extends the existing memory.db
# ----------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS signals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol        TEXT NOT NULL,
    scan_date     TEXT NOT NULL,
    close         REAL, ema20 REAL, ema50 REAL, ema200 REAL,
    rsi14         REAL, vol_ratio REAL, ext_pct REAL,
    turnover_cr   REAL, atr14 REAL, atr_pct REAL,
    screen_version TEXT,
    llm_verdict   TEXT,
    created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, scan_date)
);
CREATE TABLE IF NOT EXISTS scan_stats (
    scan_date TEXT, reason TEXT, n INTEGER,
    PRIMARY KEY (scan_date, reason)
);
"""


def _persist(cands: list[Candidate], rejects: dict[str, int], db_path: str) -> None:
    con = sqlite3.connect(db_path)
    try:
        con.executescript(SCHEMA)
        today = date.today().isoformat()

        # A re-scan supersedes the earlier one; it does not layer on top of it.
        # INSERT OR REPLACE alone only overwrites keys the new run happens to
        # produce, so a symbol that passed this morning and fails this afternoon
        # would keep its stale "passed" row, and rejection reasons from a run
        # over a different universe would survive underneath the new counts.
        # The day's picture has to be replaced whole.
        con.execute("DELETE FROM signals WHERE scan_date=?", (today,))
        con.execute("DELETE FROM scan_stats WHERE scan_date=?", (today,))

        for c in cands:
            d = asdict(c)
            cols = ",".join(d)
            marks = ",".join("?" * len(d))
            con.execute(
                f"INSERT OR REPLACE INTO signals ({cols}) VALUES ({marks})",
                list(d.values()),
            )
        for reason, n in rejects.items():
            con.execute(
                "INSERT OR REPLACE INTO scan_stats (scan_date, reason, n) VALUES (?,?,?)",
                (today, reason, n),
            )
        con.commit()
    finally:
        con.close()


# ----------------------------------------------------------------------------
# Reference adapter. Fine for development; replace for production.
# yfinance is rate-limited, occasionally revises bars, and has no intraday
# depth for NSE. Angel One SmartAPI and Dhan both offer free historical +
# WebSocket feeds and are the right production choice.
# ----------------------------------------------------------------------------
class YFinanceSource:
    def __init__(self, suffix: str = ".NS"):
        self.suffix = suffix

    def daily_bars(self, symbol: str, bars: int = 260) -> pd.DataFrame:
        import yfinance as yf

        period_days = int(bars * 1.6) + 40  # allow for holidays and weekends
        df = yf.Ticker(symbol + self.suffix).history(period=f"{period_days}d")
        if df.empty:
            raise ValueError(f"no data for {symbol}")
        df = df.rename(
            columns={
                "Open": "open", "High": "high", "Low": "low",
                "Close": "close", "Volume": "volume",
            }
        )
        return df[["open", "high", "low", "close", "volume"]].tail(bars)


if __name__ == "__main__":
    src = YFinanceSource()
    universe = ["DYCL", "PRECWIRE", "UNIVCABLES", "IKIOLIGHTING", "PARACABLES"]
    for c in scan(universe, src):
        print(
            f"{c.symbol:14s} {c.close:9.2f}  RSI {c.rsi14:5.1f}  "
            f"vol x{c.vol_ratio:4.1f}  ext {c.ext_pct:5.2f}%  ATR {c.atr_pct:4.1f}%"
        )
