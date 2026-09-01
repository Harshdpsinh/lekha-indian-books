from .gst import parse_gst_invoice

def parse_utility(text: str, own_gstin: str = "") -> list[dict]:
    rows = parse_gst_invoice(text, own_gstin)
    for r in rows:
        r["source"] = "utility"
        r["register"] = "purchase"
    return rows
