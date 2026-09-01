from __future__ import annotations

def find_gaps(rows: list[dict]) -> list[dict]:
    gaps = []
    for r in rows:
        if r.get("register") == "purchase" and not r.get("gstin") and (r.get("amount") or 0) >= 2000:
            gaps.append({
                "severity": "high" if r.get("amount", 0) >= 10000 else "medium",
                "title": f"GSTIN missing — {r.get('description')}",
                "field": "gstin",
            })
        tax = (r.get("taxable") or 0) + (r.get("cgst") or 0) + (r.get("sgst") or 0) + (r.get("igst") or 0)
        if r.get("total") and r.get("taxable") is not None and abs(tax - r["total"]) > 0.05:
            gaps.append({"severity": "critical", "title": "GST identity break", "field": "money"})
    return gaps

def ask(gaps: list[dict]) -> list[dict]:
    """Interactive terminal loop. Answers persist via lekha.memory."""
    from lekha.memory import remember
    answered = []
    for g in gaps:
        print(f"\n[{g['severity']}] {g['title']}")
        val = input("Answer (or skip): ").strip()
        if not val or val.lower() == "skip":
            remember("gap", f"skipped {g['title']}")
            continue
        g["answer"] = val
        remember("gap", f"answered {g['title']}", {"answer": val})
        answered.append(g)
    return answered
