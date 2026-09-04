"""
jobs.py — APScheduler wiring. This is the only file that knows about time.

Notification-only: no approve/reject gate anywhere in this path. The existing
Telegram HITL gate stays where it belongs, in front of live execution.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import date

import requests
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv())

import analyst
import paper_broker as pb
from llm_router import daily_summary
import universe
from scanner import YFinanceSource, scan

DB_PATH = os.getenv("AGENT_DB", "memory.db")
TZ = "Asia/Kolkata"
TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
# Prefer a dedicated chat so swing notifications never interleave with the
# options job's live approval prompts. Falls back to the shared chat if unset.
TG_CHAT = os.getenv("SWING_TELEGRAM_CHAT_ID") or os.getenv("TELEGRAM_CHAT_ID")

_UNIVERSE: list[str] | None = None
_UNIVERSE_REPORT: dict = {}


def get_universe(refresh: bool = False) -> list[str]:
    """Resolved once per process, and never at import time.

    The default mode picks the best-performing sector off the Moneycontrol board
    and screens that sector's stocks — the documented method. Resolving it costs
    two HTTP requests, which must not happen merely because something imported
    this module: the dashboard, the analyst and the tests all do that and none
    of them need a sector board.
    """
    global _UNIVERSE, _UNIVERSE_REPORT
    if _UNIVERSE is None or refresh:
        _UNIVERSE, _UNIVERSE_REPORT = universe.resolve_detailed()
    return _UNIVERSE


def notify(text: str) -> bool:
    """Fire and forget, but not blind. A failed send must still never take down
    a scheduled job, so everything is swallowed — but the outcome is reported
    rather than discarded.

    The original swallowed HTTP errors as well as exceptions, and that half is
    the dangerous one: a wrong chat_id (400) or a bot the user has blocked (403)
    comes back as a perfectly ordinary response object, so every notification
    would vanish and the system would look merely quiet. On a path whose whole
    job is telling you things, silence must not be indistinguishable from
    success.

    Returns True when Telegram accepted the message.
    """
    # Always echo to stdout, not only when Telegram is unconfigured. On a CI
    # runner the job log is the only record anyone can read afterwards, and a
    # successful send prints nothing — so a working scan and a scan that never
    # ran produced an identical, empty log.
    print(text)
    if not (TG_TOKEN and TG_CHAT):
        return False
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
            json={"chat_id": TG_CHAT, "text": text[:4000],
                  "disable_web_page_preview": True},
            timeout=15,
        )
        if r.status_code != 200:
            print(f"[telegram rejected {r.status_code}] {r.text[:300]}")
            return False
        return True
    except Exception as e:
        print(f"[telegram failed] {e}\n{text}")
        return False


def _source():
    return YFinanceSource()


# Above this share of the universe failing to fetch, the day's screen is not
# trustworthy. It matters most on a cloud runner: Yahoo rate-limits datacentre
# IPs, and scan() records each failure as a rejection — so a totally blind run
# produces zero candidates and would otherwise report "screen ran clean", which
# is the most dangerous sentence this system can send. Silence and an all-clear
# must never be the same message.
FETCH_FAIL_ALERT = 0.34


def _funnel_line(day: str, passed: int = 0) -> str:
    """One line naming how many symbols were screened and what rejected them.

    This is what makes a quiet day legible. Without it every blank result reads
    identically, so a genuinely calm market and a universe that silently shrank
    to a handful of names produce the same message.

    The count comes from the rejections actually recorded, not from
    len(get_universe()) — those two can disagree (a symbol that raised before being
    classified, or a run made under a different universe), and when they do the
    discrepancy is itself worth seeing rather than papering over.
    """
    rejects = _scan_rejects(day)
    screened = sum(rejects.values()) + passed
    head = f"Screened {screened} symbols"
    n_universe = len(get_universe())
    if screened != n_universe:
        head += f" (universe holds {n_universe})"
    if not rejects:
        return head + "."
    top = sorted(rejects.items(), key=lambda kv: -kv[1])[:4]
    detail = ", ".join(f"{r.replace('_', ' ')} {n}" for r, n in top)
    return f"{head}. Rejected by: {detail}."


def _sector_line() -> str:
    """Which sector this scan looked at, and how solid that pick is.

    Step 1 of the method is the sector choice, so a scan report that omits it
    hides the half of the decision that determined everything downstream.
    Empty when the universe came from an index or an explicit list instead.
    """
    rep = _UNIVERSE_REPORT
    if not rep or not rep.get("chosen"):
        return ""
    import sectors
    return sectors.summary_line(rep)


def _scan_rejects(day: str) -> dict[str, int]:
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute(
            "CREATE TABLE IF NOT EXISTS scan_stats ("
            "scan_date TEXT, reason TEXT, n INTEGER, "
            "PRIMARY KEY (scan_date, reason))"
        )
        return {
            r[0]: r[1] for r in con.execute(
                "SELECT reason, n FROM scan_stats WHERE scan_date=?", (day,)
            )
        }
    finally:
        con.close()


# ---------------------------------------------------------------------------
# 15:45 IST — the scan
# ---------------------------------------------------------------------------
def job_scan() -> None:
    today = date.today().isoformat()
    syms = get_universe(refresh=True)
    cands = scan(syms, _source(), db_path=DB_PATH)

    failed = _scan_rejects(today).get("fetch_error", 0)
    degraded = failed >= max(1, int(len(syms) * FETCH_FAIL_ALERT))
    if degraded:
        notify(
            f"{today}: DATA PROBLEM — {failed} of {len(syms)} symbols would "
            f"not fetch. Today's screen is incomplete; do not read it as "
            f"'no setups'. On a cloud runner this is usually the price source "
            f"rate-limiting the runner's IP."
        )

    if not cands:
        if not degraded:
            # Always say how many symbols were examined, and which filter did the
            # work. "No setups today" on its own is unreadable: it looks the same
            # whether the screen swept 200 names or quietly shrank to 13 because
            # the universe list failed to load. The size is the tell.
            sec = _sector_line()
            notify(f"{today}: no setups today.\n{_funnel_line(today)}"
                   + (f"\n{sec}" if sec else ""))
        return

    verdicts, notes = analyst.analyze(cands)
    takes = [v for v in verdicts if v.verdict == "take" and not v.event_within_21d]

    # Every candidate is listed with its screen numbers, verdict or not. The
    # analyst legitimately declines on thin days (MIN_CANDIDATES), and the
    # earlier version printed only verdicts — so a day where exactly one name
    # passed announced "1 of 8 passed the screen" and then named nothing at all.
    # The screen's own numbers are the point; the analyst is commentary on top.
    lines = [f"SCAN {date.today()} — {len(cands)} of {len(syms)} passed the screen"]
    sec = _sector_line()
    if sec:
        lines.append(sec)
    lines.append("")

    verdict_by = {v.symbol: v for v in verdicts}
    for c in cands:
        v = verdict_by.get(c.symbol)
        flag = " [EVENT<21d]" if (v and v.event_within_21d) else ""
        head = f"{(v.verdict.upper() if v else 'SCREENED'):8s} {c.symbol}"
        if v:
            head += f" — {v.pattern}{flag}"
        lines.append(head)
        lines.append(
            f"       {c.close} · RSI {c.rsi14} · vol x{c.vol_ratio} · "
            f"{c.ext_pct:+.1f}% vs 20EMA · ATR {c.atr_pct}%"
        )
        if v:
            lines.append(f"       {v.thesis}")
            for r in v.risks:
                lines.append(f"       risk: {r}")

    # Say why the analyst is absent, so a screened-only list never reads as the
    # analyst having silently failed.
    if not verdicts and notes:
        lines += ["", f"analyst skipped: {notes[0]}"]
    lines += ["", f"queued for tomorrow's open: {len(takes)}"]
    notify("\n".join(lines))

    con = sqlite3.connect(DB_PATH)
    try:
        con.execute("CREATE TABLE IF NOT EXISTS entry_queue ("
                    "symbol TEXT, signal_date TEXT, atr REAL, "
                    "PRIMARY KEY (symbol, signal_date))")
        by_sym = {c.symbol: c for c in cands}

        # Write every verdict back onto its signals row. Without this the column
        # stays NULL forever and the dashboard reports "not analysed" for names
        # the analyst has in fact just judged — and the reasoning is lost the
        # moment the Telegram message scrolls away.
        for v in verdicts:
            c = by_sym.get(v.symbol)
            if not c:
                continue
            con.execute(
                "UPDATE signals SET llm_verdict=? WHERE symbol=? AND scan_date=?",
                (v.verdict, v.symbol, c.scan_date),
            )

        for v in takes:
            c = by_sym.get(v.symbol)
            if c:
                con.execute("INSERT OR REPLACE INTO entry_queue VALUES (?,?,?)",
                            (c.symbol, c.scan_date, c.atr14))
        con.commit()
    finally:
        con.close()


# ---------------------------------------------------------------------------
# 09:16 IST — fill queued entries at the open
# ---------------------------------------------------------------------------
def job_fill() -> None:
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute("CREATE TABLE IF NOT EXISTS entry_queue ("
                    "symbol TEXT, signal_date TEXT, atr REAL, "
                    "PRIMARY KEY (symbol, signal_date))")
        rows = con.execute("SELECT symbol, signal_date, atr FROM entry_queue").fetchall()
        if not rows:
            return
        src = _source()
        msgs: list[str] = []
        for sym, sig_date, atr in rows:
            try:
                bar = src.daily_bars(sym, bars=2)
                open_px = float(bar["open"].iloc[-1])
            except Exception as e:
                msgs.append(f"{sym}: no open price ({e})")
                continue
            msgs += pb.enter(con, sym, sig_date, open_px, atr or open_px * 0.03)
        con.execute("DELETE FROM entry_queue")
        con.commit()
        if msgs:
            notify("ENTRIES AT OPEN\n" + "\n".join(msgs))
    finally:
        con.close()


# ---------------------------------------------------------------------------
# every 15 min during the session — stop / target / time stop
# ---------------------------------------------------------------------------
def job_mark() -> None:
    con = sqlite3.connect(DB_PATH)
    try:
        syms = [r[0] for r in con.execute(
            "SELECT DISTINCT symbol FROM paper_positions WHERE status='open'"
        ).fetchall()]
        if not syms:
            return
        src, bars = _source(), {}
        for s in syms:
            try:
                df = src.daily_bars(s, bars=2)
                bars[s] = {"high": float(df["high"].iloc[-1]),
                           "low": float(df["low"].iloc[-1]),
                           "close": float(df["close"].iloc[-1]),
                           "date": date.today().isoformat()}
            except Exception:
                continue
        events = pb.mark_to_market(con, bars)
        if events:
            notify("POSITION EVENTS\n" + "\n".join(events))
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Saturday 09:00 IST — weekly report
# ---------------------------------------------------------------------------
def job_report() -> None:
    analyst.purge_cache()
    notify(pb.weekly_report(DB_PATH) + "\n\n" + daily_summary())


def build() -> BlockingScheduler:
    s = BlockingScheduler(timezone=TZ)
    wk = "mon-fri"
    s.add_job(job_fill,   CronTrigger(day_of_week=wk, hour=9,  minute=16, timezone=TZ))
    s.add_job(job_mark,   CronTrigger(day_of_week=wk, hour="9-15", minute="*/15", timezone=TZ))
    s.add_job(job_scan,   CronTrigger(day_of_week=wk, hour=15, minute=45, timezone=TZ))
    s.add_job(job_report, CronTrigger(day_of_week="sat", hour=9, minute=0, timezone=TZ))
    return s


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        {"scan": job_scan, "fill": job_fill,
         "mark": job_mark, "report": job_report}[sys.argv[1]]()
    else:
        print(f"scheduler up ({TZ}); universe = {len(get_universe())} symbols")
        build().start()
