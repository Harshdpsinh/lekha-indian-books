import re
from datetime import datetime

DATE = re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b")
AMT = re.compile(r"(\d{1,3}(?:,\d{2,3})+(?:\.\d{2})?|\d+\.\d{2})")

def _date(s: str) -> str | None:
    m = DATE.search(s)
    if not m:
        return None
    d, mo, y = int(m[1]), int(m[2]), int(m[3])
    if y < 100:
        y += 2000
    try:
        return datetime(y, mo, d).date().isoformat()
    except ValueError:
        return None

def _amt(s: str) -> float:
    return float(s.replace(",", ""))

def parse_bank(text: str, own_gstin: str = "") -> list[dict]:
    rows = []
    for line in text.splitlines():
        dt = _date(line)
        if not dt or "opening balance" in line.lower():
            continue
        amounts = [_amt(x) for x in AMT.findall(line)]
        if not amounts:
            continue
        credit = bool(re.search(r"\b(cr|deposit|salary|neft cr)\b", line, re.I))
        desc = DATE.sub("", line)
        desc = AMT.sub(" ", desc)
        desc = re.sub(r"\s+", " ", desc).strip()
        rows.append({
            "date": dt,
            "description": desc[:80],
            "amount": amounts[0],
            "direction": "credit" if credit else "debit",
            "source": "bank",
        })
    return rows
