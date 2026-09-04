"""
universe.py — what the screen is allowed to look at.

The original 15-name list was a starter set: all cables/wires/electricals, so
the whole universe moved as one position. When that sector pulled back, every
name failed `below_ema` on the same day and the screen went dark — which reads
as "the system is broken" when it is really "you gave it one thing to look at".

Resolution order:
  1. $UNIVERSE                 — explicit comma-separated override, wins always
  2. a cached NSE index CSV    — refreshed from NSE, falls back to the cache
  3. STARTER                   — the original 15, so this never returns empty

The index list is cached on disk because NSE occasionally refuses automated
requests, and a scan that silently shrinks to a handful of names is exactly the
failure this module exists to prevent.
"""

from __future__ import annotations

import csv
import io
import os
import urllib.request
from datetime import date, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(BASE_DIR, "data")
CACHE_MAX_AGE_DAYS = 30

INDEX_URLS = {
    "nifty50": "https://archives.nseindia.com/content/indices/ind_nifty50list.csv",
    "nifty100": "https://archives.nseindia.com/content/indices/ind_nifty100list.csv",
    "nifty200": "https://archives.nseindia.com/content/indices/ind_nifty200list.csv",
    "nifty500": "https://archives.nseindia.com/content/indices/ind_nifty500list.csv",
}

# NSE returns 403 to a bare urllib user-agent.
_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

STARTER = [
    "DYCL", "PRECWIRE", "UNIVCABLES", "POLYCAB", "KEI", "RRKABEL", "APARINDS",
    "FINCABLES", "VGUARD", "HAVELLS", "CROMPTON", "BAJAJELEC", "VOLTAMP",
]

# Known-dead tickers, skipped before they burn a fetch and a rejection slot.
# TRIL no longer resolves on Yahoo (the NSE listing was renamed); SHILCTECH has
# under 220 bars of history and cannot clear MIN_HISTORY_BARS until roughly
# November 2026. Both were showing up as permanent noise in every funnel.
EXCLUDE = {"TRIL", "SHILCTECH"}


def _cache_path(index: str) -> str:
    return os.path.join(CACHE_DIR, f"universe_{index}.csv")


def _fresh(path: str) -> bool:
    if not os.path.exists(path):
        return False
    age = date.today() - date.fromtimestamp(os.path.getmtime(path))
    return age <= timedelta(days=CACHE_MAX_AGE_DAYS)


def _parse(text: str) -> list[str]:
    rows = csv.DictReader(io.StringIO(text))
    return [r["Symbol"].strip() for r in rows if r.get("Symbol", "").strip()]


def from_index(index: str = "nifty200", refresh: bool = False) -> list[str]:
    """Constituents of an NSE index, cached on disk."""
    index = index.lower()
    if index not in INDEX_URLS:
        raise ValueError(f"unknown index {index!r}; try {sorted(INDEX_URLS)}")

    path = _cache_path(index)
    if not refresh and _fresh(path):
        return _parse(io.open(path, encoding="utf-8-sig").read())

    try:
        req = urllib.request.Request(INDEX_URLS[index], headers={"User-Agent": _UA})
        text = urllib.request.urlopen(req, timeout=45).read().decode("utf-8-sig")
        syms = _parse(text)
        if syms:
            os.makedirs(CACHE_DIR, exist_ok=True)
            io.open(path, "w", encoding="utf-8").write(text)
            return syms
    except Exception as e:
        print(f"[universe] NSE fetch failed ({e}); falling back to cache")

    if os.path.exists(path):
        return _parse(io.open(path, encoding="utf-8-sig").read())
    return []


def resolve() -> list[str]:
    """The universe this run should screen."""
    raw = os.getenv("UNIVERSE", "").strip()

    if raw and raw.lower() in INDEX_URLS:
        syms = from_index(raw.lower())
    elif raw:
        syms = [s.strip() for s in raw.split(",") if s.strip()]
    else:
        syms = from_index("nifty200")

    if not syms:
        print("[universe] no list resolved; using the starter set")
        syms = list(STARTER)

    # dedupe, drop the known-dead, preserve order
    seen, out = set(), []
    for s in syms:
        u = s.upper()
        if u in EXCLUDE or u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out


if __name__ == "__main__":
    syms = resolve()
    print(f"{len(syms)} symbols")
    print(", ".join(syms[:25]) + (" ..." if len(syms) > 25 else ""))
