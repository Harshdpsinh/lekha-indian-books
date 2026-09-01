from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path

LOG = Path.home() / ".lekha" / "memory.jsonl"

def remember(kind: str, message: str, extra: dict | None = None) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    row = {
        "at": datetime.now(timezone.utc).isoformat(),
        "kind": kind,
        "message": message,
        "extra": extra or {},
    }
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")

def tail(n: int = 50) -> list[dict]:
    if not LOG.exists():
        return []
    lines = LOG.read_text(encoding="utf-8").splitlines()[-n:]
    return [json.loads(x) for x in lines]
