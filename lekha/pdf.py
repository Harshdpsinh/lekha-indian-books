from __future__ import annotations
import io, re
from pypdf import PdfReader

class NeedPassword(Exception):
    pass

def institution_of(filename: str) -> str:
    n = filename.lower()
    for key in ("hdfc", "axis", "icici", "sbi", "phonepe", "cams", "lic", "airtel", "bescom", "zerodha", "groww"):
        if key in n:
            return key
    stem = filename.rsplit(".", 1)[0].split("_")[0].split("-")[0]
    return (stem or "file").lower()[:24]

def pdf_text(data: bytes, password: str | None = None) -> str:
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        ok = reader.decrypt(password or "")
        if not ok:
            raise NeedPassword("password required")
    pages = []
    for p in reader.pages:
        pages.append(p.extract_text() or "")
    text = "\n".join(pages).strip()
    if not text:
        raise ValueError("PDF had no extractable text (scanned image)")
    return text

def read_upload(filename: str, data: bytes, password: str | None = None) -> str:
    name = filename.lower()
    if name.endswith(".pdf") or data[:4] == b"%PDF":
        return pdf_text(data, password)
    if name.endswith((".xlsx", ".xls", ".ods")):
        import pandas as pd
        xl = pd.ExcelFile(io.BytesIO(data))
        chunks = []
        for sheet in xl.sheet_names:
            chunks.append("# " + sheet)
            chunks.append(xl.parse(sheet).to_csv(index=False))
        return "\n".join(chunks)
    return data.decode("utf-8", errors="ignore")
