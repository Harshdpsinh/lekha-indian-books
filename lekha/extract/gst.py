import re

GSTIN = re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b")

def _money(text: str, label: str) -> float | None:
    m = re.search(label + r"[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)", text, re.I)
    return float(m[1].replace(",", "")) if m else None

def parse_gst_invoice(text: str, own_gstin: str = "") -> list[dict]:
    gstins = GSTIN.findall(text.upper())
    party = next((g for g in gstins if g != own_gstin.upper()), gstins[0] if gstins else None)
    outward = bool(re.search(r"outward|sales invoice|billed to", text, re.I))
    taxable = _money(text, "taxable")
    total = _money(text, "grand total") or _money(text, "total")
    inv = re.search(r"invoice\s*(?:no|number)[:\s]*([A-Z0-9/-]+)", text, re.I)
    return [{
        "date": None,
        "gstin": party,
        "invoice_no": inv.group(1) if inv else None,
        "taxable": taxable,
        "cgst": _money(text, "cgst") or 0,
        "sgst": _money(text, "sgst") or 0,
        "igst": _money(text, "igst") or 0,
        "total": total,
        "register": "sales" if outward else "purchase",
        "source": "gst_invoice",
    }]
