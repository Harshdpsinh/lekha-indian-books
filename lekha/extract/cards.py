from .bank import DATE, AMT
import re
from datetime import datetime

def parse_card(text: str, own_gstin: str = "") -> list[dict]:
    rows = []
    for line in text.splitlines():
        m = DATE.search(line)
        if not m:
            continue
        d, mo, y = int(m[1]), int(m[2]), int(m[3])
        if y < 100:
            y += 2000
        try:
            dt = datetime(y, mo, d).date().isoformat()
        except ValueError:
            continue
        am = AMT.findall(line)
        if not am:
            continue
        cr = bool(re.search(r"\bCR\b|payment thank you", line, re.I))
        desc = re.sub(r"\s+", " ", DATE.sub("", AMT.sub(" ", line))).strip()
        rows.append({
            "date": dt,
            "description": desc[:80],
            "amount": float(am[-1].replace(",", "")),
            "direction": "credit" if cr else "debit",
            "source": "credit_card",
            "category": "Card settlement" if cr else None,
        })
    return rows
