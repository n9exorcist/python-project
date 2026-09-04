"""
sectors.py — step 1 of the documented method: pick the sector, then its stocks.

    Moneycontrol sector board  ->  best sector  ->  that sector's stocks
                                                    ->  scanner.py screens them

Why this is scraped the way it is
---------------------------------
The sector-analysis pages are Next.js and server-render everything this module
needs inside <script id="__NEXT_DATA__">. Two payloads matter:

    /markets/sector-analysis/sector-performance/  ->  data.allSectors  (39 rows)
    /markets/sector-analysis/<slug>/              ->  data.allStocks

`allSectors` carries exactly the four things swing-setup.pdf weighs in Step 1 —
percentage change, breadth (advance/decline), sector PE, and earnings YoY — so
the ranking below is the document's judgement, not an invention.

The one-month problem
---------------------
The PDF ranks on the ONE-MONTH board (Electricals +11.51%). The page's 1D/1M/3M
tabs are anchor tags with no href: the period switch is a client-side call to an
endpoint that only exists inside a minified bundle. Scraping that would break
without warning the next time they rebuild.

So this module builds its own history instead. Every run snapshots the daily
board into `sector_board`, and `ranked()` averages the change over the last N
sessions. After a month of runs that IS a one-month ranking, sourced from data
we recorded ourselves. Until then it ranks on what history exists and says so —
`basis` on every row tells you how many sessions are behind the number, so a
one-day ranking can never be mistaken for a monthly one.

Tickers
-------
Moneycontrol has no NSE symbol: `scId` is its own id ("GN", "TW04"). The URL
slug carries a normalised company name ("grindwellnorton"), which is matched
against NSE's own listing files — main board plus SME, since sector pages do
include SME names. Matching is deliberately strict: a short key must not
swallow a longer name ("sonam" is Sonam Ltd, not Sona Machinery). Anything that
does not match is REPORTED, never silently dropped — a universe that quietly
shrinks is the failure this whole path keeps guarding against.
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
import sqlite3
import urllib.request
from datetime import date, timedelta
from typing import Any

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.getenv("AGENT_DB", "memory.db")

MC_BOARD = "https://www.moneycontrol.com/markets/sector-analysis/sector-performance/"
MC_SECTOR = "https://www.moneycontrol.com/markets/sector-analysis/{slug}/"

NSE_LISTS = {
    "EQUITY_L.csv": "https://archives.nseindia.com/content/equities/EQUITY_L.csv",
    "SME_EQUITY_L.csv":
        "https://archives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv",
}

_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

LOOKBACK_SESSIONS = 21          # ~1 trading month, the PDF's window
MIN_SESSIONS_FOR_TREND = 5      # below this, say the ranking is thin
TICKER_CACHE_DAYS = 14

BOARD_SCHEMA = """
CREATE TABLE IF NOT EXISTS sector_board (
    day        TEXT NOT NULL,
    sector     TEXT NOT NULL,
    slug       TEXT NOT NULL,
    chg_pct    REAL,
    advance    INTEGER,
    decline    INTEGER,
    sector_pe  REAL,
    np_yoy_pct REAL,
    stock_cnt  INTEGER,
    PRIMARY KEY (day, slug)
);
"""


# ---------------------------------------------------------------------------
# fetching
# ---------------------------------------------------------------------------
def _get(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": _UA,
                                               "Accept-Language": "en-US,en;q=0.9"})
    return urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "replace")


def _next_data(html: str) -> dict:
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise ValueError("__NEXT_DATA__ not found; Moneycontrol changed its markup")
    return json.loads(m.group(1))["props"]["pageProps"]["data"]


def _num(v: Any) -> float | None:
    """Moneycontrol mixes floats, comma-grouped strings, and empties."""
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return None


def fetch_board() -> list[dict]:
    """Today's sector board, best change first."""
    rows = _next_data(_get(MC_BOARD)).get("allSectors") or []
    out = []
    for r in rows:
        out.append({
            "sector": r.get("sector"),
            "slug": r.get("slug"),
            "chg_pct": _num(r.get("mCapPerChange")),
            "advance": int(r.get("advance") or 0),
            "decline": int(r.get("decline") or 0),
            "sector_pe": _num(r.get("sectorPe")),
            "np_yoy_pct": _num(r.get("sectorNpYoyChange")),
            "stock_cnt": int(r.get("stockCnt") or 0),
        })
    out.sort(key=lambda r: (r["chg_pct"] is None, -(r["chg_pct"] or 0)))
    return out


def sector_stocks(slug: str) -> list[dict]:
    """Every stock Moneycontrol lists under a sector."""
    rows = _next_data(_get(MC_SECTOR.format(slug=slug))).get("allStocks") or []
    return [{
        "mc_name": (r.get("stockName") or "").strip(),
        "slug_name": (r.get("slug") or "//").split("/")[1],
        "chg_pct": _num(r.get("perChange")),
        "tech_trend": r.get("techTrend"),
        "pe": _num(r.get("ttmPe")),
    } for r in rows]


# ---------------------------------------------------------------------------
# persistence — this is what makes a one-month ranking possible at all
# ---------------------------------------------------------------------------
def _con() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.executescript(BOARD_SCHEMA)
    return con


def save_board(rows: list[dict], day: str | None = None) -> int:
    day = day or date.today().isoformat()
    con = _con()
    try:
        for r in rows:
            con.execute(
                "INSERT OR REPLACE INTO sector_board "
                "(day,sector,slug,chg_pct,advance,decline,sector_pe,np_yoy_pct,stock_cnt) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (day, r["sector"], r["slug"], r["chg_pct"], r["advance"],
                 r["decline"], r["sector_pe"], r["np_yoy_pct"], r["stock_cnt"]),
            )
        con.commit()
        return len(rows)
    finally:
        con.close()


def ranked(lookback: int = LOOKBACK_SESSIONS) -> list[dict]:
    """Sectors ranked by mean daily change over the sessions on record.

    Every row carries `sessions`, so a ranking built on one day of data can
    never be read as a monthly one.
    """
    con = _con()
    try:
        days = [r[0] for r in con.execute(
            "SELECT DISTINCT day FROM sector_board ORDER BY day DESC LIMIT ?",
            (lookback,))]
        if not days:
            return []
        marks = ",".join("?" * len(days))
        rows = con.execute(
            f"SELECT slug, sector, AVG(chg_pct), COUNT(*), SUM(chg_pct) "
            f"FROM sector_board WHERE day IN ({marks}) "
            f"GROUP BY slug, sector", days).fetchall()
        latest = {r[0]: r for r in con.execute(
            "SELECT slug, advance, decline, sector_pe, np_yoy_pct, stock_cnt, chg_pct "
            "FROM sector_board WHERE day=?", (days[0],))}
    finally:
        con.close()

    out = []
    for slug, sector, avg, n, total in rows:
        cur = latest.get(slug)
        out.append({
            "slug": slug, "sector": sector,
            "mean_chg": round(avg or 0.0, 3),
            "total_chg": round(total or 0.0, 2),
            "sessions": n,
            "advance": cur[1] if cur else None,
            "decline": cur[2] if cur else None,
            "sector_pe": cur[3] if cur else None,
            "np_yoy_pct": cur[4] if cur else None,
            "stock_cnt": cur[5] if cur else None,
            "today_chg": cur[6] if cur else None,
            "basis": ("thin" if n < MIN_SESSIONS_FOR_TREND else "trend"),
        })
    out.sort(key=lambda r: -r["total_chg"])
    return out


# ---------------------------------------------------------------------------
# NSE ticker resolution
# ---------------------------------------------------------------------------
_STOP = ("limited", "ltd", "and", "the", "company", "corporation", "corp")
# A short listing name must not swallow a longer Moneycontrol slug: "sonam"
# (Sonam Ltd) matching "sonamachinery" (Sona Machinery) would silently screen
# the wrong company, which is worse than screening nothing.
_MIN_REV_KEY = 8


def _norm(s: str) -> str:
    s = re.sub(r"[^a-z0-9]", "", (s or "").lower())
    for w in _STOP:
        s = s.replace(w, "")
    return s


def _cached_csv(name: str, url: str) -> str:
    path = os.path.join(CACHE_DIR, name)
    fresh = (os.path.exists(path) and os.path.getsize(path) > 200 and
             date.today() - date.fromtimestamp(os.path.getmtime(path))
             <= timedelta(days=TICKER_CACHE_DAYS))
    if fresh:
        return io.open(path, encoding="utf-8-sig").read()
    try:
        text = _get(url, timeout=60)
        if len(text) > 200:
            os.makedirs(CACHE_DIR, exist_ok=True)
            io.open(path, "w", encoding="utf-8").write(text)
            return text
    except Exception as e:
        print(f"[sectors] {name} fetch failed ({e}); using cache")
    return io.open(path, encoding="utf-8-sig").read() if os.path.exists(path) else ""


_NSE_MAP: dict[str, str] | None = None


def nse_map() -> dict[str, str]:
    """normalised company name -> NSE symbol, main board plus SME."""
    global _NSE_MAP
    if _NSE_MAP is not None:
        return _NSE_MAP
    out: dict[str, str] = {}
    for name, url in NSE_LISTS.items():
        text = _cached_csv(name, url)
        if not text:
            continue
        for raw in csv.DictReader(io.StringIO(text)):
            row = {(k or "").strip().upper().replace(" ", "_"): (v or "").strip()
                   for k, v in raw.items()}
            sym, nm = row.get("SYMBOL"), row.get("NAME_OF_COMPANY")
            if sym and nm:
                out.setdefault(_norm(nm), sym)
    _NSE_MAP = out
    return out


def to_ticker(slug_name: str) -> str | None:
    m = nse_map()
    n = _norm(slug_name)
    if not n:
        return None
    if n in m:
        return m[n]
    fwd = sorted((k for k in m if k.startswith(n)), key=len)
    if fwd:
        return m[fwd[0]]
    rev = sorted((k for k in m if len(k) >= _MIN_REV_KEY and n.startswith(k)),
                 key=len, reverse=True)
    if rev and len(rev[0]) >= 0.75 * len(n):
        return m[rev[0]]
    return None


# ---------------------------------------------------------------------------
# the universe
# ---------------------------------------------------------------------------
def resolve_universe(top_n: int = 1, refresh: bool = True) -> tuple[list[str], dict]:
    """Tickers from the best-performing sector(s), plus a report of what happened.

    The report is not decoration. It names the sector chosen, how many sessions
    the ranking rests on, and every stock whose ticker could not be resolved —
    so a universe that came back small says why, instead of looking like a quiet
    market.
    """
    report: dict[str, Any] = {"chosen": [], "unmatched": [], "errors": []}

    if refresh:
        try:
            save_board(fetch_board())
        except Exception as e:
            report["errors"].append(f"sector board fetch failed: {e}")

    board = ranked()
    if not board:
        report["errors"].append("no sector history on record")
        return [], report

    symbols: list[str] = []
    seen: set[str] = set()
    for sec in board[:top_n]:
        try:
            stocks = sector_stocks(sec["slug"])
        except Exception as e:
            report["errors"].append(f"{sec['slug']}: {e}")
            continue
        picked = []
        for s in stocks:
            t = to_ticker(s["slug_name"])
            if not t:
                report["unmatched"].append(f"{sec['slug']}/{s['mc_name']}")
                continue
            if t not in seen:
                seen.add(t)
                symbols.append(t)
                picked.append(t)
        report["chosen"].append({
            "sector": sec["sector"], "slug": sec["slug"],
            "total_chg": sec["total_chg"], "sessions": sec["sessions"],
            "basis": sec["basis"], "advance": sec["advance"],
            "decline": sec["decline"], "sector_pe": sec["sector_pe"],
            "np_yoy_pct": sec["np_yoy_pct"],
            "listed": len(stocks), "resolved": len(picked),
        })
    return symbols, report


def summary_line(report: dict) -> str:
    """One line for Telegram naming the sector and how solid the pick is."""
    if not report.get("chosen"):
        return "Sector pick unavailable: " + "; ".join(report.get("errors") or ["unknown"])
    bits = []
    for c in report["chosen"]:
        basis = (f"{c['sessions']} session{'s' if c['sessions'] != 1 else ''}"
                 + (" — thin" if c["basis"] == "thin" else ""))
        bits.append(
            f"{c['sector']} {c['total_chg']:+.2f}% over {basis}, "
            f"breadth {c['advance']}/{c['decline']}, PE {c['sector_pe']}, "
            f"{c['resolved']}/{c['listed']} tickers resolved"
        )
    line = "Sector: " + " | ".join(bits)
    if report.get("unmatched"):
        line += f"\nUnmatched ({len(report['unmatched'])}): " + ", ".join(report["unmatched"][:6])
    return line


if __name__ == "__main__":
    board = fetch_board()
    save_board(board)
    print(f"{'SECTOR':26s}{'TODAY%':>8s}{'ADV':>5s}{'DEC':>5s}{'PE':>8s}{'NPYoY%':>9s}{'N':>4s}")
    for r in board[:10]:
        print(f"{(r['sector'] or '')[:25]:26s}{(r['chg_pct'] or 0):8.2f}"
              f"{r['advance']:5d}{r['decline']:5d}"
              f"{(r['sector_pe'] or 0):8.1f}{(r['np_yoy_pct'] or 0):9.1f}{r['stock_cnt']:4d}")
    print()
    syms, rep = resolve_universe(top_n=1, refresh=False)
    print(summary_line(rep))
    print(f"\n{len(syms)} symbols: {', '.join(syms)}")
