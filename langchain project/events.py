"""
events.py — real corporate events for the veto, from NSE itself.

Why this exists
---------------
The analyst's stated job is "flag corporate events, dilution, pledges, auditor
or governance issues that indicators cannot see". It was wired to the project's
FAISS index, which holds Accenture earnings PDFs — nothing about NSE smallcaps.
So the veto had nothing to veto on, and `event_within_21d` was the model
guessing from eight indicator numbers. It answered `false` every time, which is
the most dangerous possible default for a field whose whole purpose is to stop
a trade.

Semantic search was the wrong tool anyway. "Is there a board meeting for this
symbol in the next 21 days?" is a date-bounded lookup over structured records,
not a similarity question. Vector search can only ever approximate an answer
SQL can give exactly.

Sources (both public, both JSON):
    /api/corporate-board-meetings   -> results, dividends, fund raising, EGMs
    /api/corporates-corporateActions -> ex-dates for dividends, splits, bonuses

NSE returns 403 to a bare client, so a session is warmed on the homepage first
to pick up cookies. Results are cached in SQLite: the calendar changes daily at
most, and a scan should not hammer the exchange once per symbol per run.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import date, datetime, timedelta
from typing import Any

import requests

DB_PATH = os.getenv("AGENT_DB", "memory.db")

BOARD_URL = ("https://www.nseindia.com/api/corporate-board-meetings"
             "?index=equities&symbol={sym}")
ACTION_URL = ("https://www.nseindia.com/api/corporates-corporateActions"
              "?index=equities&symbol={sym}")

_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-board-meetings",
}

EVENT_WINDOW_DAYS = 21      # the swing hold; matches analyst.event_within_21d
CACHE_HOURS = 12

SCHEMA = """
CREATE TABLE IF NOT EXISTS corporate_events (
    symbol      TEXT NOT NULL,
    event_date  TEXT NOT NULL,          -- ISO, the date the event happens
    kind        TEXT NOT NULL,          -- board_meeting | corporate_action
    purpose     TEXT,
    detail      TEXT,
    fetched_at  TEXT NOT NULL,
    PRIMARY KEY (symbol, event_date, kind, purpose)
);
CREATE INDEX IF NOT EXISTS ix_ce_sym_date ON corporate_events(symbol, event_date);
CREATE TABLE IF NOT EXISTS corporate_events_fetch (
    symbol     TEXT PRIMARY KEY,
    fetched_at TEXT NOT NULL,
    ok         INTEGER NOT NULL DEFAULT 1
);
"""

_session: requests.Session | None = None


def _sess() -> requests.Session:
    global _session
    if _session is None:
        s = requests.Session()
        s.headers.update(_HEADERS)
        try:
            # NSE hands out the cookies its API requires only from a page view.
            s.get("https://www.nseindia.com/", timeout=20)
        except Exception:
            pass
        _session = s
    return _session


def _con() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)
    return con


def _iso(d: str | None) -> str | None:
    """NSE dates are '12-Aug-2026'. Anything unparseable is dropped rather than
    guessed — a wrong date here silently un-vetoes a trade.
    """
    if not d or d in ("-", "NA"):
        return None
    for fmt in ("%d-%b-%Y", "%d-%b-%Y %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(d.strip()[:11 if fmt == "%d-%b-%Y" else None],
                                     fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _fresh(con: sqlite3.Connection, symbol: str) -> bool:
    row = con.execute("SELECT fetched_at FROM corporate_events_fetch WHERE symbol=?",
                      (symbol,)).fetchone()
    if not row:
        return False
    try:
        return datetime.now() - datetime.fromisoformat(row[0]) < timedelta(hours=CACHE_HOURS)
    except Exception:
        return False


def refresh(symbol: str, force: bool = False) -> int:
    """Pull this symbol's calendar into the DB. Returns rows stored."""
    symbol = symbol.upper()
    con = _con()
    try:
        if not force and _fresh(con, symbol):
            return con.execute("SELECT COUNT(*) FROM corporate_events WHERE symbol=?",
                               (symbol,)).fetchone()[0]

        s = _sess()
        now = datetime.now().isoformat(timespec="seconds")
        rows: list[tuple] = []
        ok = True

        try:
            for r in s.get(BOARD_URL.format(sym=symbol), timeout=25).json():
                d = _iso(r.get("bm_date"))
                if d:
                    rows.append((symbol, d, "board_meeting",
                                 (r.get("bm_purpose") or "").strip(),
                                 (r.get("bm_desc") or "").strip()[:400], now))
        except Exception as e:
            ok = False
            print(f"[events] {symbol} board meetings failed: {str(e)[:120]}")

        try:
            for r in s.get(ACTION_URL.format(sym=symbol), timeout=25).json():
                d = _iso(r.get("exDate"))
                if d:
                    rows.append((symbol, d, "corporate_action",
                                 (r.get("subject") or "").strip(),
                                 f"ex-date {r.get('exDate')}, record {r.get('recDate')}", now))
        except Exception as e:
            ok = False
            print(f"[events] {symbol} corporate actions failed: {str(e)[:120]}")

        for row in rows:
            con.execute("INSERT OR REPLACE INTO corporate_events "
                        "(symbol,event_date,kind,purpose,detail,fetched_at) "
                        "VALUES (?,?,?,?,?,?)", row)
        con.execute("INSERT OR REPLACE INTO corporate_events_fetch (symbol,fetched_at,ok) "
                    "VALUES (?,?,?)", (symbol, now, 1 if ok else 0))
        con.commit()
        return len(rows)
    finally:
        con.close()


def upcoming(symbol: str, days: int = EVENT_WINDOW_DAYS,
             as_of: str | None = None) -> list[dict[str, Any]]:
    """Events dated from today through `days` ahead. This is the veto's answer —
    computed, not inferred.
    """
    symbol = symbol.upper()
    start = date.fromisoformat(as_of) if as_of else date.today()
    end = start + timedelta(days=days)
    con = _con()
    try:
        return [
            {"date": r[0], "kind": r[1], "purpose": r[2], "detail": r[3]}
            for r in con.execute(
                "SELECT event_date, kind, purpose, detail FROM corporate_events "
                "WHERE symbol=? AND event_date>=? AND event_date<=? "
                "ORDER BY event_date", (symbol, start.isoformat(), end.isoformat()))
        ]
    finally:
        con.close()


def fetch_ok(symbol: str) -> bool:
    """Whether the last fetch for this symbol actually succeeded.

    Matters because "no events found" and "we could not ask" must not look the
    same: the first clears a trade, the second is an unknown.
    """
    con = _con()
    try:
        row = con.execute("SELECT ok FROM corporate_events_fetch WHERE symbol=?",
                          (symbol.upper(),)).fetchone()
        return bool(row and row[0])
    finally:
        con.close()


def context_chunks(symbol: str, k: int = 3) -> list[dict[str, str]]:
    """Events shaped for the analyst's retriever interface: [{'id','text'}].

    Nearest events first — a board meeting next week matters more than a
    dividend ex-date in three weeks. Ids are content-stable, so the analyst's
    cache invalidates exactly when a company's calendar changes and not
    otherwise.
    """
    out = []
    for e in upcoming(symbol)[:k]:
        out.append({
            "id": f"nse:{symbol}:{e['date']}:{e['kind']}",
            "text": (f"{e['date']} · {e['kind'].replace('_', ' ')} · "
                     f"{e['purpose']}. {e['detail']}").strip(),
        })
    if not out:
        note = ("no corporate events on record in the next "
                f"{EVENT_WINDOW_DAYS} days"
                if fetch_ok(symbol) else
                "NSE calendar could not be fetched — event status unknown")
        out.append({"id": f"nse:{symbol}:none", "text": note})
    return out


if __name__ == "__main__":
    import sys
    syms = [s.upper() for s in sys.argv[1:]] or ["TITAGARH"]
    for sym in syms:
        n = refresh(sym)
        ev = upcoming(sym)
        print(f"{sym}: {n} events on record, {len(ev)} in the next "
              f"{EVENT_WINDOW_DAYS} days (fetch ok: {fetch_ok(sym)})")
        for e in ev:
            print(f"   {e['date']}  {e['kind']:17s} {e['purpose']}")
