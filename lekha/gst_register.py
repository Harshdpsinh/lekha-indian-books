"""Structured GST register import. Tax eligibility remains review-only."""
import hashlib
from datetime import datetime
from decimal import Decimal
from .ledger_v2 import connect, _paise

HEADERS={'date':'DATE','gstin':'GST NO','invoice_no':'INVOICE NO','party':'NAME','hsn':'HSN','taxable':'TAXABLE','cgst':'CGST','sgst':'SGST','igst':'IGST','total':'TOTAL GRAND','payment_mode':'PAYMENT MODE'}
def _date(v):
    if isinstance(v,datetime):return v.date().isoformat()
    for fmt in ('%d/%m/%Y','%Y-%m-%d','%d-%m-%Y'):
        try:return datetime.strptime(str(v).strip(),fmt).date().isoformat()
        except ValueError:pass
    return None

def import_register(path,register):
    if register not in ('sales','purchase'):raise ValueError('Invalid register')
    from openpyxl import load_workbook
    wb=load_workbook(path,read_only=True,data_only=True)
    added=skipped=flagged=0
    with connect() as con:
        for sheet in wb:
            rows=sheet.iter_rows(values_only=True)
            header=None
            for values in rows:
                values=list(values)
                if header is None:
                    candidate={str(v).strip().upper():i for i,v in enumerate(values) if v is not None}
                    if all(h in candidate for h in ('DATE','NAME','TAXABLE','TOTAL GRAND')):
                        header=candidate
                    continue
                def get(name):
                    idx=header.get(HEADERS[name]);return values[idx] if idx is not None and idx<len(values) else None
                date=_date(get('date'))
                if not date:continue
                monetary={k:_paise(get(k) or 0) for k in ('taxable','cgst','sgst','igst','total')}
                if abs(sum(monetary[k] for k in ('taxable','cgst','sgst','igst'))-monetary['total'])>1:flagged+=1
                invoice=str(get('invoice_no') or '').strip()
                party=str(get('party') or '').strip()
                gstin=str(get('gstin') or '').strip()
                identity='|'.join((register,date,invoice,party,gstin,str(monetary['total'])))
                key=hashlib.sha256(identity.encode()).hexdigest()
                cur=con.execute("""INSERT OR IGNORE INTO invoice_v2
                (id,register,date,gstin,invoice_no,party,hsn,taxable_paise,cgst_paise,sgst_paise,igst_paise,total_paise,payment_mode,source_file)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (key,register,date,gstin,invoice,party,str(get('hsn') or ''),monetary['taxable'],monetary['cgst'],monetary['sgst'],monetary['igst'],monetary['total'],str(get('payment_mode') or ''),str(path)))
                added+=int(cur.rowcount>0);skipped+=int(cur.rowcount==0)
    wb.close()
    return {'added':added,'duplicates':skipped,'tax_mismatch_rows':flagged}
