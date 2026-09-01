import re

CATS = [
    "Revenue", "Software", "Professional fees", "Rent", "Utilities", "Telecom",
    "Fuel", "Food", "Travel", "Insurance", "Medical", "Salary", "Investment",
    "Tax", "Dividend", "Capital gains", "Bank charges", "Personal",
    "Internal transfer", "Card settlement", "Uncategorised",
]

def token_of(description: str) -> str:
    words = re.sub(r"[^a-z0-9 ]+", " ", description.lower()).split()
    words = [w for w in words if len(w) >= 4 and w not in {"paid", "from", "neft", "imps", "rtgs", "upi", "xxxx", "india"}]
    return words[0] if words else description.lower()[:12]

def categorise(desc: str) -> str:
    t = desc.lower()
    if re.search(r"payment thank you|cc payment|card payment", t):
        return "Card settlement"
    if re.search(r"self transfer|own a/c|own account", t):
        return "Internal transfer"
    if re.search(r"swiggy|zomato|dominos", t):
        return "Food"
    if re.search(r"hpcl|iocl|bpcl|petrol", t):
        return "Fuel"
    if re.search(r"netflix|hotstar|spotify", t):
        return "Personal"
    if re.search(r"bescom|electricity|power", t):
        return "Utilities"
    if re.search(r"airtel|jio|vi india|bsnl", t):
        return "Telecom"
    if re.search(r"tally|zoho|github|software", t):
        return "Software"
    if "dividend" in t:
        return "Dividend"
    if re.search(r"capital gain|zerodha sell", t):
        return "Capital gains"
    if re.search(r"tds|tax deducted|challan 281", t):
        return "Tax"
    if re.search(r"groww|zerodha|mutual fund|ppf|nps", t):
        return "Investment"
    if "salary" in t:
        return "Salary"
    if re.search(r"neft cr|rtgs cr|received from", t):
        return "Revenue"
    if "rent" in t:
        return "Rent"
    return "Uncategorised"

def apply_rules(rows: list[dict], rules: list[dict]) -> list[dict]:
    if not rules:
        return rows
    ordered = sorted(rules, key=lambda r: r.get("hits") or 0, reverse=True)
    out = []
    for row in rows:
        hay = (row.get("description") or "").lower()
        hit = next((r for r in ordered if r.get("pattern") and r["pattern"] in hay), None)
        if hit:
            row = {**row, "category": hit["category"]}
        out.append(row)
    return out
