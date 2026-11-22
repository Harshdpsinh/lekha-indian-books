"""GST working-paper reports for CA review — NOT GST portal filing payloads.

Current invoice schema lacks recipient GSTIN, place of supply, HSN/SAC,
reverse-charge markers, amendments, and credit/debit-note links. Therefore
GSTR-1 tables and GSTR-3B tax positions CANNOT be automatically finalized.
This module exports invoice-backed draft registers and clearly identified gaps.
"""
from __future__ import annotations
import csv
import io
import json
import zipfile
from datetime import date
from decimal import Decimal
from lekha.accounting import _connect, reconcile_gstr2b

MONEY_FIELDS=("taxable_paise","cgst_paise","sgst_paise","igst_paise","cess_paise")
TAX_FIELDS=("cgst_paise","sgst_paise","igst_paise","cess_paise")
LEGAL_GAPS=[
    "GSTR-1 classification (B2B/B2C/exports/nil/exempt) and recipient GSTIN unavailable",
    "Place of supply and intra/inter-state consistency unavailable",
    "HSN/SAC, quantity/UQC and Table 12 HSN-wise reporting unavailable",
    "Credit/debit notes, amendments, advances and e-invoice/IRN reconciliation unavailable",
    "GSTR-3B reverse charge, import/ISD, exemptions and section 17(5) restrictions unavailable",
    "ITC reversals, reclaim, Rule 42/43 apportionment and opening ITC balances unavailable",
    "GST portal GSTR-1, GSTR-2B, IMS and 3B auto-populated totals not verified",
    "Electronic cash/credit ledgers and interest/late-fee calculations unavailable",
]

def _period(month):
    if len(month)!=7 or month[4]!="-":
        raise ValueError("Period must be YYYY-MM")
    start=date.fromisoformat(month+"-01")
    end=f"{start.year+1:04d}-01-01" if start.month==12 else f"{start.year:04d}-{start.month+1:02d}-01"
    return start.isoformat(),end

def _totals(rows):
    return {k:sum(int(x[k]) for x in rows) for k in MONEY_FIELDS}

def draft_gst_workpapers(book_id,month,path=None):
    """Return evidence-backed review tables and conservative provisional totals."""
    start,end=_period(month)
    with _connect(path) as con:
        book=con.execute("SELECT * FROM books WHERE book_id=?",(book_id,)).fetchone()
        if book is None:
            raise ValueError("Unknown accounting book")
        if book["kind"]!="business":
            raise ValueError("GST workpapers require a business book")
        rows=[dict(r) for r in con.execute("""SELECT * FROM invoice_records
             WHERE book_id=? AND invoice_date>=? AND invoice_date<? ORDER BY role,invoice_date,invoice_number""",
             (book_id,start,end))]
    sales=[x for x in rows if x["role"]=="sale"]
    purchases=[x for x in rows if x["role"]=="purchase"]
    two_b=[x for x in rows if x["role"]=="gstr2b"]
    matches=reconcile_gstr2b(book_id,path=path)
    matched_ids={r["purchase_id"] for r in matches if r["status"]=="matched"}
    reviewed_itc=[r for r in purchases if r["invoice_id"] in matched_ids and r["eligible_itc"]=="eligible"]
    provisional_itc=[r for r in purchases if r["eligible_itc"]=="eligible" and r["invoice_id"] not in matched_ids]
    unreviewed=[r for r in purchases if r["eligible_itc"]=="review"]
    sales_total=_totals(sales)
    inputs_total=_totals(purchases)
    eligible_total=_totals(reviewed_itc)
    # Never automatically net or present tax as payable: ITC eligibility and other
    # liabilities cannot be substantiated from the available invoice data.
    summary={
        "book_id":book_id,"period":month,"gstin":book["gstin"],
        "status":"DRAFT_NOT_FOR_FILING","sales_invoices":len(sales),
        "purchase_invoices":len(purchases),"gstr2b_invoices":len(two_b),
        "sales_invoice_totals_paise":sales_total,
        "purchase_invoice_totals_paise":inputs_total,
        "matched_and_marked_eligible_itc_paise":{k:eligible_total[k] for k in TAX_FIELDS},
        "review_required_purchase_invoices":len(unreviewed),
        "eligible_but_not_matched_in_2b":len(provisional_itc),
        "missing_gstr1_classification":len(sales),
        "unresolved_2b_reconciliation":sum(x["status"]!="matched" for x in matches),
        "tax_payable_paise":None,
        "gst_return_ready":False,
        "gaps":LEGAL_GAPS,
    }
    return {"summary":summary,"sales_register":sales,
            "purchase_register":purchases,"gstr2b_register":two_b,
            "gstr2b_matches":matches}

def _csv_bytes(rows,fields):
    buff=io.StringIO()
    wr=csv.DictWriter(buff,fieldnames=fields,extrasaction="ignore")
    wr.writeheader()
    wr.writerows(rows)
    return buff.getvalue().encode("utf-8-sig")

def export_workpapers_zip(book_id,month,path=None):
    report=draft_gst_workpapers(book_id,month,path)
    invoice_fields=["invoice_id","role","supplier_gstin","invoice_number","invoice_date",
                    *MONEY_FIELDS,"eligible_itc","source"]
    matching_fields=["key","status","purchase_id","gstr2b_id","eligibility"]
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,"w",compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("READ_FIRST_NOT_FOR_FILING.txt",
                   "DRAFT GST WORKPAPERS ONLY. Not a GST portal JSON or statutory return.\n"
                   "All figures require review against GSTR-1, GSTR-2B/IMS, portal auto-population,\n"
                   "RCM, ITC reversals, amendments, exemption, HSN, ledger balances and CA advice.\n"
                   "This export does not transmit or file any GST return.\n")
        z.writestr("summary.json",json.dumps(report["summary"],indent=2))
        for name in ("sales_register","purchase_register","gstr2b_register"):
            z.writestr(name+".csv",_csv_bytes(report[name],invoice_fields))
        z.writestr("gstr2b_matches.csv",_csv_bytes(report["gstr2b_matches"],matching_fields))
    return buf.getvalue()
