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
from scanner import YFinanceSource, scan

DB_PATH = os.getenv("AGENT_DB", "memory.db")
TZ = "Asia/Kolkata"
TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
# Prefer a dedicated chat so swing notifications never interleave with the
# options job's live approval prompts. Falls back to the shared chat if unset.
TG_CHAT = os.getenv("SWING_TELEGRAM_CHAT_ID") or os.getenv("TELEGRAM_CHAT_ID")

# Start small and verify by hand before expanding to Nifty 500.
UNIVERSE = [s.strip() for s in os.getenv(
    "UNIVERSE",
    "DYCL,PRECWIRE,UNIVCABLES,POLYCAB,KEI,RRKABEL,APARINDS,FINCABLES,"
    "VGUARD,HAVELLS,CROMPTON,BAJAJELEC,VOLTAMP,TRIL,SHILCTECH"
).split(",") if s.strip()]


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
    if not (TG_TOKEN and TG_CHAT):
        print(text)
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


# ---------------------------------------------------------------------------
# 15:45 IST — the scan
# ---------------------------------------------------------------------------
def job_scan() -> None:
    cands = scan(UNIVERSE, _source(), db_path=DB_PATH)
    if not cands:
        notify(f"{date.today()}: no setups today. Screen ran clean.")
        return

    verdicts, notes = analyst.analyze(cands)
    takes = [v for v in verdicts if v.verdict == "take" and not v.event_within_21d]

    lines = [f"SCAN {date.today()} — {len(cands)} passed the screen", ""]
    for v in verdicts:
        flag = " [EVENT<21d]" if v.event_within_21d else ""
        lines.append(f"{v.verdict.upper():6s} {v.symbol} — {v.pattern}{flag}")
        lines.append(f"       {v.thesis}")
        for r in v.risks:
            lines.append(f"       risk: {r}")
    lines += ["", f"queued for tomorrow's open: {len(takes)}"]
    notify("\n".join(lines))

    con = sqlite3.connect(DB_PATH)
    try:
        con.execute("CREATE TABLE IF NOT EXISTS entry_queue ("
                    "symbol TEXT, signal_date TEXT, atr REAL, "
                    "PRIMARY KEY (symbol, signal_date))")
        by_sym = {c.symbol: c for c in cands}
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
        print(f"scheduler up ({TZ}); universe = {len(UNIVERSE)} symbols")
        build().start()
