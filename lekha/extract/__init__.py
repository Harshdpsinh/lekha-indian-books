from .classify import classify
from .bank import parse_bank
from .cards import parse_card
from .upi import parse_upi
from .gst import parse_gst_invoice
from .utilities import parse_utility
from lekha.spend import categorise, apply_rules

PARSERS = {
    "bank": parse_bank,
    "card": parse_card,
    "upi": parse_upi,
    "gst_invoice": parse_gst_invoice,
    "utility": parse_utility,
    "salary": parse_bank,
    "investment": parse_bank,
}

def extract(text: str, filename: str, own_gstin: str, rules: list | None = None, hint: str | None = None) -> dict:
    kind = classify(text, filename, hint)
    fn = PARSERS.get(kind["parser"], parse_bank)
    rows = fn(text, own_gstin=own_gstin)
    for r in rows:
        if not r.get("category"):
            r["category"] = categorise(r.get("description") or "")
        r["confidence"] = 0.36 if r.get("category") == "Uncategorised" else 0.8
        if "tds" in (r.get("description") or "").lower():
            r["tds"] = r.get("amount")
            r["category"] = "Tax"
        if re_div(r.get("description") or ""):
            r["category"] = "Dividend"
    rows = apply_rules(rows, rules or [])
    return {"meta": kind, "rows": rows}

def re_div(desc: str) -> bool:
    d = desc.lower()
    return "dividend" in d or d.startswith("div ")
