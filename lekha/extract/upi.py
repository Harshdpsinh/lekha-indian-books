import re
from datetime import datetime

MONTH = {m: f"{i:02d}" for i, m in enumerate(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], 1)}

def parse_upi(text: str, own_gstin: str = "") -> list[dict]:
    rows = []
    for line in text.splitlines():
        m = re.search(r"(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})", line, re.I)
        am = re.search(r"₹\s*([\d,]+(?:\.\d{2})?)", line)
        if not m or not am:
            continue
        dt = f"{m[3]}-{MONTH[m[2][:3].title()]}-{int(m[1]):02d}"
        recv = bool(re.search(r"received from", line, re.I))
        rows.append({
            "date": dt,
            "description": re.sub(r"₹.*", "", line).strip()[:80],
            "amount": float(am[1].replace(",", "")),
            "direction": "credit" if recv else "debit",
            "source": "upi",
        })
    return rows
