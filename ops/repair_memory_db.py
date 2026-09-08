"""repair_memory_db.py — rebuild memory.db after btree corruption.

WHAT BROKE AND WHY IT IS SURVIVABLE
-----------------------------------
PRAGMA integrity_check on app/db/memory.db reports extensive btree damage, and
exactly two tables refuse to read:

    checkpoints   LangGraph's conversation state
    writes        LangGraph's pending-write log

Everything else opens fine. Those two hold chat history, which is replayable
context rather than a record of anything -- the paper book lives in swing.db,
which passes integrity_check untouched. So this is an annoyance, not a loss.

The likely cause is a process killed mid-write. This machine has been running
at ~1.4 GB free and the OS has killed background tasks twice today; SQLite is
durable against power loss but not against a writer being terminated while it
holds a partially-written page, especially with several processes attached to
one file.

WHAT THIS DOES
--------------
Copies the readable tables into a fresh database and leaves the corrupt one
beside it as a .corrupt backup. LangGraph recreates checkpoints and writes on
next startup via AsyncSqliteSaver.setup(), so nothing needs to import them.

It refuses to run while the file is open, because rebuilding a database another
process is writing to is how a recoverable problem becomes an unrecoverable one.

    Stop uvicorn and the MCP server first, then:
        venv/Scripts/python.exe ops/repair_memory_db.py
"""

from __future__ import annotations

import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "langchain project" / "app" / "db" / "memory.db"

# Rebuilt by LangGraph on startup; no attempt is made to salvage them.
SKIP = {"checkpoints", "writes", "sqlite_sequence"}


def main() -> int:
    if not DB.exists():
        print(f"no database at {DB}")
        return 1

    # A writer still attached will happily let us read a torn page and copy the
    # damage forward. Fail loudly instead.
    try:
        probe = sqlite3.connect(f"file:{DB}?mode=rw", uri=True, timeout=1)
        probe.execute("BEGIN IMMEDIATE")
        probe.rollback()
        probe.close()
    except sqlite3.OperationalError as e:
        print(f"REFUSING: {DB.name} is locked ({e}).")
        print("Stop uvicorn (port 8001) and mcp_server.py (8000), then re-run.")
        return 1

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = DB.with_suffix(f".db.corrupt-{stamp}")
    shutil.copy2(DB, backup)
    # The -wal holds committed pages not yet folded into the main file, and here
    # it is larger than the database itself. Copying the .db alone would produce
    # a "backup" missing everything since the last checkpoint -- worse than no
    # backup, because it looks like one.
    for suffix in ("-wal", "-shm"):
        side = DB.with_name(DB.name + suffix)
        if side.exists():
            shutil.copy2(side, backup.with_name(backup.name + suffix))
    print(f"backed up  {backup.name}  ({backup.stat().st_size / 1e6:.1f} MB, plus -wal/-shm)")

    src = sqlite3.connect(DB)
    tables = [r[0] for r in src.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]

    new = DB.with_suffix(".db.rebuilt")
    if new.exists():
        new.unlink()
    dst = sqlite3.connect(new)

    copied, skipped = [], []
    for t in tables:
        if t in SKIP:
            skipped.append((t, "rebuilt by LangGraph"))
            continue
        try:
            ddl = src.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (t,)
            ).fetchone()[0]
            rows = src.execute(f'SELECT * FROM "{t}"').fetchall()
        except sqlite3.DatabaseError as e:
            skipped.append((t, str(e)[:40]))
            continue

        dst.execute(ddl)
        if rows:
            marks = ",".join("?" * len(rows[0]))
            dst.executemany(f'INSERT INTO "{t}" VALUES ({marks})', rows)
        copied.append((t, len(rows)))

    # Indexes and triggers for the tables that made it across.
    kept = {t for t, _ in copied}
    for kind in ("index", "trigger"):
        for (name, tbl, sql) in src.execute(
            "SELECT name, tbl_name, sql FROM sqlite_master WHERE type=? AND sql IS NOT NULL",
            (kind,),
        ):
            if tbl in kept:
                try:
                    dst.execute(sql)
                except sqlite3.DatabaseError:
                    pass

    dst.commit()
    ok = dst.execute("PRAGMA integrity_check").fetchone()[0]
    dst.close()
    src.close()

    print()
    for t, n in copied:
        print(f"  copied   {t:<22} {n} rows")
    for t, why in skipped:
        print(f"  skipped  {t:<22} {why}")
    print()
    print(f"new file integrity_check: {ok}")

    if ok != "ok":
        print("REBUILD IS ALSO CORRUPT -- leaving both files in place, nothing swapped.")
        return 1

    # The swap, not the rebuild, is what needs the file free. A BEGIN IMMEDIATE
    # probe is not enough on Windows: another process can hold an open handle
    # without holding a write lock, which blocks unlink while still permitting
    # writes. So the check that matters is simply attempting it.
    try:
        DB.unlink()
        # The -wal and -shm belong to the file just deleted, NOT to the rebuild.
        # Leaving them means SQLite opens the clean database, finds a
        # write-ahead log beside it, and replays 16 MB of a different and
        # corrupt database over the top -- which is how a successful repair
        # still reports "database disk image is malformed" the moment anything
        # opens it. They are already inside the backup taken above.
        for suffix in ("-wal", "-shm"):
            side = DB.with_name(DB.name + suffix)
            if side.exists():
                side.unlink()
        new.rename(DB)
    except PermissionError:
        print()
        print(f"The rebuild is clean, but {DB.name} is still open by another")
        print("process and cannot be replaced. Stop uvicorn (port 8001) and")
        print("mcp_server.py (port 8000), then run this again.")
        print(f"The rebuilt database is already at {new.name}.")
        return 1

    print(f"\nreplaced {DB.name}. The corrupt original is kept as {backup.name};")
    print("delete it once the app has started cleanly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
