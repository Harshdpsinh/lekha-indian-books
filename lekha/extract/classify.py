import re

def classify(text: str, filename: str = "") -> dict:
    blob = f"{filename}\n{text}".lower()
    if "form 16" in blob and "gross salary" in blob:
        return {"kind": "salary", "parser": "salary", "provider": "Employer"}
    if "tax invoice" in blob and ("gstin" in blob or "hsn" in blob):
        return {"kind": "gst_invoice", "parser": "gst_invoice", "provider": "GST"}
    if "credit card" in blob or "payment thank you" in blob:
        return {"kind": "credit_card", "parser": "card", "provider": "Card"}
    if "phonepe" in blob or "google pay" in blob or "upi id" in blob:
        return {"kind": "upi", "parser": "upi", "provider": "UPI"}
    if "bescom" in blob or "units consumed" in blob:
        return {"kind": "utility", "parser": "utility", "provider": "Power"}
    if "cams" in blob or ("folio" in blob and "nav" in blob):
        return {"kind": "investment", "parser": "investment", "provider": "CAMS"}
    if "ppf" in blob or "public provident" in blob:
        return {"kind": "investment", "parser": "investment", "provider": "PPF"}
    if re.search(r"period:|statement of|account no|ifsc|opening balance|closing balance", blob):
        return {"kind": "bank", "parser": "bank", "provider": "Bank"}
    return {"kind": "manual", "parser": "bank", "provider": "Unknown"}
