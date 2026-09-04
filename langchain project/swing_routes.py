"""
swing_routes.py — read-only HTTP view over the swing agent's tables.

A separate router from routes.py because the swing path is a separate process.
Everything here only *reads* `memory.db`: no endpoint triggers a scan, calls an
LLM, or writes a row. Refreshing the dashboard therefore costs zero tokens and
cannot race the scheduler in jobs.py.

The one exception is `/swing/marks`, which fetches live closes to compute
unrealised R. That hits yfinance, so it is deliberately NOT part of the
dashboard payload — the page loads instantly from SQLite, and the user asks for
marks explicitly. Putting it in the main payload would mean a rate-limited
network call on every poll.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import date
from typing import Any

from fastapi import APIRouter

import paper_broker as pb

router = APIRouter(prefix="/swing", tags=["swing"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Same resolution order as the rest of the swing path. Anchored to this file so
# the API behaves identically no matter what directory uvicorn was launched from.
DB_PATH = os.getenv("AGENT_DB") or os.path.join(BASE_DIR, "app", "db", "swing.db")


def _con() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _table_exists(con: sqlite3.Connection, name: str) -> bool:
    """The swing tables are created lazily on first use — analyst_cache does not
    exist until the analyst runs, paper_positions until the first fill. Querying
    a missing table raises, so every section checks first and returns empty
    rather than 500-ing a dashboard because one feature hasn't run yet.
    """
    return con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------
def _last_scan_date(con: sqlite3.Connection) -> str | None:
    """Max across both tables. A scan that rejected every symbol writes rows to
    scan_stats and none to signals, so reading only signals would report "no
    scan has run yet" on a day the screen ran perfectly well and found nothing.
    Those two states look identical on the page but mean opposite things.
    """
    dates = []
    for table in ("signals", "scan_stats"):
        if _table_exists(con, table):
            row = con.execute(f"SELECT MAX(scan_date) AS d FROM {table}").fetchone()
            if row and row["d"]:
                dates.append(row["d"])
    return max(dates) if dates else None


def _latest_scan(con: sqlite3.Connection) -> dict[str, Any]:
    latest = _last_scan_date(con)
    if not latest:
        return {"scan_date": None, "candidates": [], "note": "no scan has run yet"}
    if not _table_exists(con, "signals"):
        return {"scan_date": latest, "candidates": [],
                "note": "screen ran; nothing passed"}

    rows = con.execute(
        "SELECT symbol, close, ema20, ema50, ema200, rsi14, vol_ratio, ext_pct, "
        "turnover_cr, atr14, atr_pct, screen_version, llm_verdict "
        "FROM signals WHERE scan_date=? ORDER BY symbol",
        (latest,),
    ).fetchall()
    return {
        "scan_date": latest,
        "stale": latest != date.today().isoformat(),
        "candidates": [dict(r) for r in rows],
        "note": None if rows else "screen ran; nothing passed",
    }


def _funnel(con: sqlite3.Connection) -> dict[str, Any]:
    """Which filter did the work. Without the rejection counts you only ever see
    the names that passed, and cannot tell a strict screen from a broken one.
    """
    latest = _last_scan_date(con)
    if not latest or not _table_exists(con, "scan_stats"):
        return {"scan_date": latest, "rejections": [], "passed": 0, "screened": 0}

    rejects = [
        {"reason": r["reason"], "n": r["n"]}
        for r in con.execute(
            "SELECT reason, n FROM scan_stats WHERE scan_date=? ORDER BY n DESC",
            (latest,),
        ).fetchall()
    ]
    passed = 0
    if _table_exists(con, "signals"):
        passed = con.execute(
            "SELECT COUNT(*) FROM signals WHERE scan_date=?", (latest,)
        ).fetchone()[0]

    return {
        "scan_date": latest,
        "rejections": rejects,
        "passed": passed,
        "screened": passed + sum(r["n"] for r in rejects),
    }


def _positions(con: sqlite3.Connection) -> list[dict[str, Any]]:
    if not _table_exists(con, "paper_positions"):
        return []
    rows = con.execute(
        "SELECT id, book, symbol, signal_date, entry_date, entry, stop, target, "
        "qty, status, exit_date, exit_price, exit_reason, r_multiple, pnl "
        "FROM paper_positions WHERE status='open' ORDER BY book, symbol"
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        risk = d["entry"] - d["stop"]
        d["risk_per_share"] = round(risk, 2)
        d["rr_planned"] = round((d["target"] - d["entry"]) / risk, 2) if risk else 0.0
        try:
            d["days_held"] = (date.today() - date.fromisoformat(d["entry_date"])).days
        except Exception:
            d["days_held"] = None
        d["time_stop_days"] = pb.TIME_STOP_DAYS
        out.append(d)
    return out


def _recent_closed(con: sqlite3.Connection, limit: int = 20) -> list[dict[str, Any]]:
    if not _table_exists(con, "paper_positions"):
        return []
    rows = con.execute(
        "SELECT book, symbol, entry_date, exit_date, entry, exit_price, "
        "exit_reason, r_multiple, pnl FROM paper_positions "
        "WHERE status='closed' ORDER BY exit_date DESC, id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def _books(con: sqlite3.Connection) -> dict[str, Any]:
    if not _table_exists(con, "paper_positions"):
        empty = {"closed": 0}
        return {"FIXED": {"book": "FIXED", **empty},
                "STRUCTURAL": {"book": "STRUCTURAL", **empty},
                "verdict": None}

    fixed = pb.weekly_stats(con, "FIXED")
    structural = pb.weekly_stats(con, "STRUCTURAL")

    # The two-book design exists to answer one question, and it is not
    # answerable early. Say so rather than showing a lead that is noise.
    verdict = None
    if fixed.get("closed", 0) >= 10 and structural.get("closed", 0) >= 10:
        gap = fixed["expectancy_R"] - structural["expectancy_R"]
        verdict = {
            "leader": "FIXED" if gap > 0 else "STRUCTURAL",
            "gap_R": round(abs(gap), 3),
            "n": min(fixed["closed"], structural["closed"]),
        }
    return {"FIXED": fixed, "STRUCTURAL": structural, "verdict": verdict}


def _tokens(con: sqlite3.Connection, day: str, pinned: bool = False) -> dict[str, Any]:
    """Spend for `day`. When the caller did not pin a date and today has no rows
    yet, fall back to the most recent day that does — an empty card on a quiet
    morning reads as "the ledger is broken" rather than "nothing has run". The
    day being shown is always returned so the page can label it.
    """
    if not _table_exists(con, "token_ledger"):
        return {"day": day, "rows": [], "providers": [], "fallback": False}

    fallback = False
    if not pinned:
        has_today = con.execute(
            "SELECT 1 FROM token_ledger WHERE day=? LIMIT 1", (day,)
        ).fetchone()
        if not has_today:
            row = con.execute("SELECT MAX(day) FROM token_ledger").fetchone()
            if row and row[0]:
                day, fallback = row[0], True

    rows = [
        dict(r) for r in con.execute(
            "SELECT provider, node, calls, tokens_in, tokens_out FROM token_ledger "
            "WHERE day=? ORDER BY provider, node", (day,),
        ).fetchall()
    ]

    # Imported lazily: llm_router pulls in litellm, which is a slow import and
    # has no business loading just because someone opened the dashboard.
    try:
        from llm_router import REQUEST_BUDGETS, TOKEN_BUDGETS
    except Exception:
        return {"day": day, "rows": rows, "providers": [], "fallback": fallback}

    providers = []
    for prov, tb in TOKEN_BUDGETS.items():
        agg = con.execute(
            "SELECT COALESCE(SUM(tokens_in + tokens_out), 0), COALESCE(SUM(calls), 0) "
            "FROM token_ledger WHERE day=? AND provider=?", (day, prov),
        ).fetchone()
        tok, req = int(agg[0]), int(agg[1])
        rb = REQUEST_BUDGETS.get(prov, 0)
        providers.append({
            "provider": prov,
            "tokens_used": tok, "token_budget": tb,
            "requests_used": req, "request_budget": rb,
            "token_pct": round(tok / tb * 100, 1) if tb else 0.0,
            "request_pct": round(req / rb * 100, 1) if rb else 0.0,
        })
    return {"day": day, "rows": rows, "providers": providers, "fallback": fallback}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("/dashboard")
def dashboard(day: str | None = None) -> dict[str, Any]:
    """Everything the page needs, in one round trip, straight from SQLite."""
    pinned = day is not None
    day = day or date.today().isoformat()
    con = _con()
    try:
        return {
            "db_path": DB_PATH,
            "today": date.today().isoformat(),
            "scan": _latest_scan(con),
            "funnel": _funnel(con),
            "positions": _positions(con),
            "closed": _recent_closed(con),
            "books": _books(con),
            "tokens": _tokens(con, day, pinned),
        }
    finally:
        con.close()


@router.get("/marks")
def marks() -> dict[str, Any]:
    """Live unrealised R for open positions. Explicitly on demand — this is the
    only endpoint that touches the network, and yfinance is rate-limited.

    Read-only: it reports what a mark *would* be. It never closes a position.
    Only job_mark in jobs.py is allowed to do that, so the dashboard cannot
    accidentally book a trade the scheduler has not seen.
    """
    con = _con()
    try:
        open_rows = _positions(con)
    finally:
        con.close()

    if not open_rows:
        return {"marks": [], "note": "no open positions"}

    from scanner import YFinanceSource

    src = YFinanceSource()
    prices: dict[str, float] = {}
    errors: dict[str, str] = {}
    for sym in {r["symbol"] for r in open_rows}:
        try:
            prices[sym] = float(src.daily_bars(sym, bars=2)["close"].iloc[-1])
        except Exception as e:
            errors[sym] = str(e)[:120]

    out = []
    for r in open_rows:
        px = prices.get(r["symbol"])
        if px is None:
            out.append({**r, "last": None, "unrealised_R": None,
                        "error": errors.get(r["symbol"], "no price")})
            continue
        risk = r["entry"] - r["stop"]
        out.append({
            **r,
            "last": round(px, 2),
            "unrealised_R": round((px - r["entry"]) / risk, 2) if risk else 0.0,
            "unrealised_pnl": round((px - r["entry"]) * r["qty"], 2),
        })
    return {"marks": out, "errors": errors, "as_of": date.today().isoformat()}
