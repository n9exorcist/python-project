import os
import json
from typing import Optional, Literal

import pandas as pd
import yfinance as yf
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

try:
    import pandas_ta_classic as ta
except ImportError:
    ta = None

load_dotenv()

mcp = FastMCP("MarketScannerMCP")


def _normalize_interval(interval: str) -> str:
    mapping = {
        "1m": "1m",
        "5m": "5m",
        "15m": "15m",
        "30m": "30m",
        "1h": "60m",
        "60m": "60m",
        "1d": "1d",
        "1wk": "1wk",
    }
    return mapping.get(interval, "1d")


def _normalize_period(interval: str, period: Optional[str]) -> str:
    if period:
        return period

    defaults = {
        "1m": "7d",
        "5m": "30d",
        "15m": "30d",
        "30m": "60d",
        "60m": "60d",
        "1d": "6mo",
        "1wk": "2y",
    }
    return defaults.get(interval, "6mo")


def _symbol_to_yahoo(symbol: str, exchange: str) -> str:
    symbol = symbol.strip().upper()
    exchange = exchange.strip().upper()

    if exchange in ["NSE", "NSE_EQ", "NS"]:
        return f"{symbol}.NS"
    if exchange in ["BSE", "BO"]:
        return f"{symbol}.BO"
    return symbol


def _fetch_ohlcv(symbol: str, exchange: str, interval: str, period: Optional[str] = None) -> pd.DataFrame:
    yf_symbol = _symbol_to_yahoo(symbol, exchange)
    interval = _normalize_interval(interval)
    period = _normalize_period(interval, period)

    df = yf.download(
        tickers=yf_symbol,
        period=period,
        interval=interval,
        auto_adjust=False,
        progress=False,
        threads=False,
        multi_level_index=False,
    )

    if df is None or df.empty:
        raise ValueError(f"No OHLCV data returned for {symbol} ({yf_symbol})")

    df = df.reset_index()
    df.columns = [str(col) for col in df.columns]

    required = {"Date", "Open", "High", "Low", "Close", "Volume"}
    if not required.issubset(df.columns):
        raise ValueError(f"Missing required OHLCV columns for {symbol}")

    df = df[["Date", "Open", "High", "Low", "Close", "Volume"]].copy()
    df["Date"] = pd.to_datetime(df["Date"])
    for col in ["Open", "High", "Low", "Close", "Volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna().reset_index(drop=True)

    if df.empty:
        raise ValueError(f"No valid OHLCV rows after cleaning for {symbol}")

    return df


def _compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    if ta is None:
        raise ImportError(
            "pandas_ta_classic is not installed. Run: pip install pandas-ta-classic"
        )

    out = df.copy()

    out.ta.ema(length=20, append=True)
    out.ta.ema(length=50, append=True)
    out.ta.ema(length=200, append=True)
    out.ta.rsi(length=14, append=True)
    out.ta.macd(append=True)
    out.ta.bbands(length=20, std=2, append=True)

    out["AVG_VOL_20"] = out["Volume"].rolling(20).mean()
    out["REL_VOL"] = out["Volume"] / out["AVG_VOL_20"]
    out["HIGH_20"] = out["High"].rolling(20).max()
    out["LOW_20"] = out["Low"].rolling(20).min()

    return out


def _latest_snapshot(df: pd.DataFrame) -> dict:
    last = df.iloc[-1]

    def val(name: str):
        return None if name not in df.columns or pd.isna(last[name]) else float(last[name])

    high_20 = val("HIGH_20")
    close = val("Close")

    breakout_distance_pct = None
    if high_20 not in [None, 0] and close is not None:
        breakout_distance_pct = round(((close - high_20) / high_20) * 100, 2)

    snapshot = {
        "date": str(last["Date"]),
        "open": val("Open"),
        "high": val("High"),
        "low": val("Low"),
        "close": close,
        "volume": None if pd.isna(last["Volume"]) else int(last["Volume"]),
        "ema20": val("EMA_20"),
        "ema50": val("EMA_50"),
        "ema200": val("EMA_200"),
        "rsi14": val("RSI_14"),
        "macd": val("MACD_12_26_9"),
        "macd_signal": val("MACDs_12_26_9"),
        "macd_hist": val("MACDh_12_26_9"),
        "bb_lower": val("BBL_20_2.0"),
        "bb_middle": val("BBM_20_2.0"),
        "bb_upper": val("BBU_20_2.0"),
        "avg_vol_20": None if "AVG_VOL_20" not in df.columns or pd.isna(last["AVG_VOL_20"]) else float(last["AVG_VOL_20"]),
        "rel_volume": None if "REL_VOL" not in df.columns or pd.isna(last["REL_VOL"]) else float(last["REL_VOL"]),
        "high_20": high_20,
        "low_20": val("LOW_20"),
        "breakout_distance_pct": breakout_distance_pct,
        "bars_available": int(len(df)),
    }

    return snapshot


def _evaluate_scan(snapshot: dict, scan_type: str) -> dict:
    close = snapshot.get("close")
    ema20 = snapshot.get("ema20")
    ema50 = snapshot.get("ema50")
    ema200 = snapshot.get("ema200")
    rsi14 = snapshot.get("rsi14")
    rel_volume = snapshot.get("rel_volume")
    breakout_distance_pct = snapshot.get("breakout_distance_pct")
    macd = snapshot.get("macd")
    macd_signal = snapshot.get("macd_signal")
    bb_upper = snapshot.get("bb_upper")
    bb_lower = snapshot.get("bb_lower")

    result = {
        "scan_type": scan_type,
        "passed": False,
        "reason": "Conditions not met"
    }

    if scan_type == "breakout":
        if None not in [close, ema20, ema50, rsi14, rel_volume, breakout_distance_pct]:
            passed = (
                close > ema20 > ema50 and
                rsi14 >= 55 and
                rel_volume >= 1.0 and
                breakout_distance_pct >= -2.0
            )
            result["passed"] = passed
            result["reason"] = (
                "Breakout setup with EMA alignment, RSI strength, and relative volume"
                if passed else
                "Failed breakout conditions"
            )

    elif scan_type == "momentum":
        if None not in [close, ema20, ema50, rsi14, rel_volume, macd, macd_signal]:
            passed = (
                close > ema20 > ema50 and
                rsi14 >= 55 and
                rel_volume >= 0.9 and
                macd > macd_signal
            )
            result["passed"] = passed
            result["reason"] = (
                "Momentum setup with bullish trend stack and MACD confirmation"
                if passed else
                "Failed momentum conditions"
            )

    elif scan_type == "pullback":
        if None not in [close, ema50, ema200, rsi14]:
            passed = (
                close > ema50 > ema200 and
                45 <= rsi14 <= 60
            )
            result["passed"] = passed
            result["reason"] = (
                "Pullback setup in established uptrend"
                if passed else
                "Failed pullback conditions"
            )

    elif scan_type == "bollinger_reversal":
        if None not in [close, bb_lower, bb_upper, rsi14]:
            passed = close <= bb_lower and rsi14 <= 35
            result["passed"] = passed
            result["reason"] = (
                "Possible Bollinger lower-band reversal setup"
                if passed else
                "Failed Bollinger reversal conditions"
            )

    return result


@mcp.tool()
def fetch_ohlcv(
    symbol: str,
    exchange: str = "NSE",
    interval: str = "1d",
    period: Optional[str] = None
) -> str:
    """
    Fetch raw OHLCV data for a symbol.
    Example: fetch_ohlcv(symbol='INFY', exchange='NSE', interval='1d', period='6mo')
    """
    try:
        df = _fetch_ohlcv(symbol=symbol, exchange=exchange, interval=interval, period=period)
        return df.tail(100).to_json(orient="records", date_format="iso")
    except Exception as e:
        return json.dumps({
            "error": str(e),
            "symbol": symbol,
            "exchange": exchange,
            "interval": interval
        })


@mcp.tool()
def compute_indicators(
    symbol: str,
    exchange: str = "NSE",
    interval: str = "1d",
    period: Optional[str] = None
) -> str:
    """
    Fetch OHLCV and compute indicators like RSI, MACD, Bollinger Bands, and EMAs.
    """
    try:
        df = _fetch_ohlcv(symbol=symbol, exchange=exchange, interval=interval, period=period)
        df = _compute_indicators(df)
        snapshot = _latest_snapshot(df)

        return json.dumps({
            "symbol": symbol,
            "exchange": exchange,
            "interval": interval,
            "snapshot": snapshot
        }, default=str, indent=2)
    except Exception as e:
        return json.dumps({
            "error": str(e),
            "symbol": symbol,
            "exchange": exchange,
            "interval": interval
        }, indent=2)


@mcp.tool()
def scan_symbol(
    symbol: str,
    scan_type: Literal["breakout", "momentum", "pullback", "bollinger_reversal"] = "breakout",
    exchange: str = "NSE",
    interval: str = "1d",
    period: Optional[str] = None
) -> str:
    """
    Run a basic scanner evaluation on one symbol using computed indicators.
    """
    try:
        df = _fetch_ohlcv(symbol=symbol, exchange=exchange, interval=interval, period=period)
        df = _compute_indicators(df)
        snapshot = _latest_snapshot(df)
        scan_result = _evaluate_scan(snapshot, scan_type)

        return json.dumps({
            "symbol": symbol,
            "exchange": exchange,
            "interval": interval,
            "scan_result": scan_result,
            "snapshot": snapshot
        }, default=str, indent=2)
    except Exception as e:
        return json.dumps({
            "error": str(e),
            "symbol": symbol,
            "scan_type": scan_type,
            "exchange": exchange,
            "interval": interval
        }, indent=2)


@mcp.tool()
def scan_watchlist(
    symbols_csv: str,
    scan_type: Literal["breakout", "momentum", "pullback", "bollinger_reversal"] = "breakout",
    exchange: str = "NSE",
    interval: str = "1d",
    period: Optional[str] = None
) -> str:
    """
    Scan a comma-separated watchlist.
    Example: scan_watchlist("INFY,RELIANCE,HDFCBANK", scan_type="momentum")
    """
    symbols = [s.strip().upper() for s in symbols_csv.split(",") if s.strip()]
    results = []
    failed = []

    for symbol in symbols:
        try:
            df = _fetch_ohlcv(symbol=symbol, exchange=exchange, interval=interval, period=period)
            df = _compute_indicators(df)
            snapshot = _latest_snapshot(df)
            scan_result = _evaluate_scan(snapshot, scan_type)

            results.append({
                "symbol": symbol,
                "passed": scan_result["passed"],
                "reason": scan_result["reason"],
                "close": snapshot.get("close"),
                "rsi14": snapshot.get("rsi14"),
                "rel_volume": snapshot.get("rel_volume"),
                "ema20": snapshot.get("ema20"),
                "ema50": snapshot.get("ema50"),
                "ema200": snapshot.get("ema200"),
                "macd": snapshot.get("macd"),
                "macd_signal": snapshot.get("macd_signal"),
                "breakout_distance_pct": snapshot.get("breakout_distance_pct"),
            })
        except Exception as e:
            failed.append({
                "symbol": symbol,
                "error": str(e)
            })

    passed_results = [r for r in results if r["passed"]]
    passed_results = sorted(
        passed_results,
        key=lambda x: (
            x["rel_volume"] if x["rel_volume"] is not None else 0,
            x["rsi14"] if x["rsi14"] is not None else 0
        ),
        reverse=True
    )

    return json.dumps({
        "scan_type": scan_type,
        "exchange": exchange,
        "interval": interval,
        "total_symbols": len(symbols),
        "passed_count": len(passed_results),
        "passed_symbols": passed_results,
        "all_results": results,
        "failed_symbols": failed
    }, indent=2)


@mcp.resource("scanner://supported-indicators")
def supported_indicators() -> str:
    return json.dumps({
        "indicators": [
            "EMA 20",
            "EMA 50",
            "EMA 200",
            "RSI 14",
            "MACD",
            "MACD Signal",
            "MACD Histogram",
            "Bollinger Bands",
            "Relative Volume",
            "20-bar High",
            "20-bar Low"
        ],
        "scan_types": [
            "breakout",
            "momentum",
            "pullback",
            "bollinger_reversal"
        ]
    }, indent=2)


if __name__ == "__main__":
    mcp.run()