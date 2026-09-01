"""SQLite accumulation. Fingerprint unique — re-uploads never duplicate rows."""
from __future__ import annotations
import sqlite3
from pathlib import Path

DB = Path.home() / ".lekha" / "books.sqlite"

DDL = """
CREATE TABLE IF NOT EXISTS txns (
  fingerprint TEXT PRIMARY KEY,
  date TEXT, description TEXT, amount REAL, direction TEXT,
  category TEXT, register TEXT, gstin TEXT, source TEXT,
  tds REAL, confidence REAL
);
CREATE TABLE IF NOT EXISTS rules (pattern TEXT PRIMARY KEY, category TEXT, hits INTEGER);
CREATE TABLE IF NOT EXISTS documents (filename TEXT PRIMARY KEY, parser TEXT, rows INTEGER, ingested_at TEXT);
"""

def connect() -> sqlite3.Connection:
    DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.executescript(DDL)
    return con

def fingerprint(r: dict) -> str:
    desc = (r.get("description") or "")[:48].lower()
    amt = float(r.get("amount") or 0)
    return f"{r.get('date')}|{r.get('direction')}|{amt:.2f}|{desc}"

def upsert_rows(rows: list[dict]) -> tuple[int, int]:
    con = connect()
    added = skipped = 0
    for r in rows:
        fp = fingerprint(r)
        try:
            con.execute(
                "INSERT INTO txns VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (fp, r.get("date"), r.get("description"), r.get("amount"), r.get("direction"),
                 r.get("category"), r.get("register"), r.get("gstin"), r.get("source"),
                 r.get("tds"), r.get("confidence")),
            )
            added += 1
        except sqlite3.IntegrityError:
            skipped += 1
    con.commit()
    con.close()
    return added, skipped

def load_rows(fy: str = "all", month: str = "all", start: str = "", end: str = "") -> list[dict]:
    con = connect()
    rows = [dict(r) for r in con.execute("SELECT * FROM txns ORDER BY date")]
    con.close()
    out = []
    for r in rows:
        d = r.get("date") or ""
        if start and d < start:
            continue
        if end and d > end:
            continue
        if month != "all" and not d.startswith(month):
            continue
        if fy != "all":
            y = int(d[:4]) if d else 0
            m = int(d[5:7]) if len(d) >= 7 else 0
            this = f"{y}-{str(y+1)[2:]}" if m >= 4 else f"{y-1}-{str(y)[2:]}"
            if this != fy:
                continue
        out.append(r)
    return out

def load_rules() -> list[dict]:
    con = connect()
    rows = [dict(r) for r in con.execute("SELECT * FROM rules")]
    con.close()
    return rows

def save_rule(pattern: str, category: str) -> None:
    con = connect()
    con.execute(
        "INSERT INTO rules(pattern, category, hits) VALUES (?,?,1) ON CONFLICT(pattern) DO UPDATE SET category=excluded.category, hits=hits+1",
        (pattern, category),
    )
    con.commit()
    con.close()

def recategorise(fp: str, category: str) -> None:
    con = connect()
    con.execute("UPDATE txns SET category=? WHERE fingerprint=?", (category, fp))
    con.commit()
    con.close()
