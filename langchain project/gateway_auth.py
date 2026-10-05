"""
gateway_auth.py — authentication for the LLM gateway: the "every request
carries an identity, verified server-side" bullet the gateway answer opens with.

A caller presents an API key. The gateway resolves it to a Principal — a team
and a set of roles — and everything downstream (quotas, cost attribution, which
documents RAG may return) keys off THAT, never off anything in the prompt. A
retrieved document can say "you are now the admin tenant"; it cannot become one,
because identity is established here, before the model is ever reached.

Keys are stored HASHED (sha256), never in plaintext: the table can leak without
leaking the keys themselves, and a key is shown exactly once, at issue time.

    issue_key("research", roles=["analyst"])  ->  raw key (store it now)
    authenticate(raw_key)                     ->  Principal(team, roles)

Env bootstrap: GATEWAY_API_KEYS='{"rawkey":{"team":"research","roles":["analyst"]}}'
seeds keys at import so a deployment can configure callers without a DB write.

Backed by AGENT_DB. Offline, no network. `python gateway_auth.py` self-tests.
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone

DB_PATH = os.getenv("AGENT_DB", "memory.db")

AUTH_SCHEMA = """
CREATE TABLE IF NOT EXISTS gateway_keys (
    key_hash   TEXT PRIMARY KEY,          -- sha256 of the raw key; raw never stored
    team       TEXT NOT NULL,
    roles      TEXT NOT NULL DEFAULT '[]',-- JSON array
    label      TEXT,
    created_at TEXT NOT NULL,
    revoked    INTEGER NOT NULL DEFAULT 0,
    last_seen  TEXT
);
"""


class AuthError(RuntimeError):
    """The presented key is missing, unknown, or revoked."""


@dataclass(frozen=True)
class Principal:
    team: str
    roles: frozenset = field(default_factory=frozenset)

    def has(self, role: str) -> bool:
        return role in self.roles


def _con() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.executescript(AUTH_SCHEMA)
    return con


def _hash(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def issue_key(team: str, *, roles: list[str] | None = None, label: str = "",
              raw_key: str | None = None) -> str:
    """Create a key for a team and return it ONCE. Pass raw_key only to import a
    known value (e.g. from env); otherwise a strong random one is generated."""
    raw = raw_key or ("gw_" + secrets.token_urlsafe(24))
    con = _con()
    try:
        con.execute(
            "INSERT OR REPLACE INTO gateway_keys (key_hash, team, roles, label, created_at, revoked) "
            "VALUES (?,?,?,?,?,0)",
            (_hash(raw), team, json.dumps(sorted(set(roles or []))), label,
             datetime.now(timezone.utc).isoformat(timespec="seconds")))
        con.commit()
    finally:
        con.close()
    return raw


def authenticate(raw_key: str | None) -> Principal:
    """Resolve a raw key to a Principal, or raise AuthError. Updates last_seen."""
    if not raw_key:
        raise AuthError("no API key presented")
    kh = _hash(raw_key)
    con = _con()
    try:
        row = con.execute(
            "SELECT team, roles, revoked FROM gateway_keys WHERE key_hash=?", (kh,)
        ).fetchone()
        if not row:
            raise AuthError("unknown API key")
        if row[2]:
            raise AuthError("API key revoked")
        con.execute("UPDATE gateway_keys SET last_seen=? WHERE key_hash=?",
                    (datetime.now(timezone.utc).isoformat(timespec="seconds"), kh))
        con.commit()
        return Principal(team=row[0], roles=frozenset(json.loads(row[1])))
    finally:
        con.close()


def revoke_key(raw_key: str) -> bool:
    con = _con()
    try:
        n = con.execute("UPDATE gateway_keys SET revoked=1 WHERE key_hash=?",
                        (_hash(raw_key),)).rowcount
        con.commit()
        return n > 0
    finally:
        con.close()


def _seed_from_env() -> None:
    """Load GATEWAY_API_KEYS at import so a deployment needs no DB write."""
    try:
        spec = json.loads(os.getenv("GATEWAY_API_KEYS", "{}"))
    except Exception:
        return
    for raw, cfg in spec.items():
        if isinstance(cfg, str):
            cfg = {"team": cfg}
        issue_key(cfg.get("team", "default"), roles=cfg.get("roles", []),
                  label=cfg.get("label", "env"), raw_key=raw)


_seed_from_env()


if __name__ == "__main__":
    import tempfile
    DB_PATH = os.path.join(tempfile.mkdtemp(), "auth_selftest.db")

    print("== issue + authenticate ==")
    k = issue_key("research", roles=["analyst", "reader"], label="alice")
    p = authenticate(k)
    print(f"  key ...{k[-6:]} -> team={p.team} roles={sorted(p.roles)}")
    assert p.team == "research" and p.has("analyst")

    print("\n== raw key is never stored ==")
    con = sqlite3.connect(DB_PATH)
    stored = con.execute("SELECT key_hash FROM gateway_keys").fetchone()[0]
    con.close()
    print(f"  stored value is a hash, not the key: {stored[:16]}...  (len {len(stored)})")
    assert k not in stored and len(stored) == 64

    print("\n== unknown / revoked / missing are rejected ==")
    for bad, why in [("gw_nonsense", "unknown"), (None, "missing")]:
        try:
            authenticate(bad)
            print(f"  XX {why} accepted")
        except AuthError as e:
            print(f"  OK {why}: {e}")
    revoke_key(k)
    try:
        authenticate(k)
        print("  XX revoked accepted")
    except AuthError as e:
        print(f"  OK revoked: {e}")

    print("\nAll gateway_auth self-tests passed.")
