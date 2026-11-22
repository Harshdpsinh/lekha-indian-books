"""Local-first, additive double-entry accounting engine for Lekha.

No existing txns table is altered. Amounts are stored as integer paise.
Imported bank statements are staging records, never automatically posted journals.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from lekha.db import DB

SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS books (
  book_id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL
    CHECK(kind IN ('personal','business')), gstin TEXT
);
CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(book_id),
  name TEXT NOT NULL, type TEXT NOT NULL
    CHECK(type IN ('asset','liability','equity','income','expense')),
  UNIQUE(book_id,name)
);
CREATE TABLE IF NOT EXISTS journal_headers (
  journal_id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(book_id),
  posting_date TEXT NOT NULL, memo TEXT NOT NULL, reference TEXT,
  created_utc TEXT NOT NULL, reversal_of TEXT REFERENCES journal_headers(journal_id),
  UNIQUE(book_id,reference)
);
CREATE TABLE IF NOT EXISTS journal_lines (
  journal_id TEXT NOT NULL REFERENCES journal_headers(journal_id),
  line_no INTEGER NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(account_id),
  debit_paise INTEGER NOT NULL DEFAULT 0 CHECK(debit_paise>=0),
  credit_paise INTEGER NOT NULL DEFAULT 0 CHECK(credit_paise>=0),
  PRIMARY KEY(journal_id,line_no),
  CHECK ((debit_paise>0 AND credit_paise=0) OR (credit_paise>0 AND debit_paise=0))
);
CREATE TABLE IF NOT EXISTS statement_imports (
  import_id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(book_id),
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  filename TEXT NOT NULL, sha256 TEXT NOT NULL, imported_utc TEXT NOT NULL,
  UNIQUE(book_id,account_id,sha256)
);
CREATE TABLE IF NOT EXISTS statement_lines (
  line_id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES statement_imports(import_id),
  source_row INTEGER NOT NULL, txn_date TEXT NOT NULL, description TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK(amount_paise>0),
  direction TEXT NOT NULL CHECK(direction IN ('debit','credit')),
  reference TEXT, linked_journal_id TEXT REFERENCES journal_headers(journal_id),
  UNIQUE(import_id,source_row)
);
CREATE TABLE IF NOT EXISTS invoice_records (
  invoice_id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(book_id),
  role TEXT NOT NULL CHECK(role IN ('purchase','sale','gstr2b')),
  supplier_gstin TEXT NOT NULL, invoice_number TEXT NOT NULL, invoice_date TEXT NOT NULL,
  taxable_paise INTEGER NOT NULL CHECK(taxable_paise>=0),
  cgst_paise INTEGER NOT NULL CHECK(cgst_paise>=0),
  sgst_paise INTEGER NOT NULL CHECK(sgst_paise>=0),
  igst_paise INTEGER NOT NULL CHECK(igst_paise>=0),
  cess_paise INTEGER NOT NULL CHECK(cess_paise>=0),
  eligible_itc TEXT NOT NULL DEFAULT 'review'
    CHECK(eligible_itc IN ('review','eligible','ineligible')),
  source TEXT NOT NULL DEFAULT '',
  UNIQUE(book_id,role,supplier_gstin,invoice_number,invoice_date)
);
CREATE TABLE IF NOT EXISTS bookkeeping_audit (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT, at_utc TEXT NOT NULL,
  action TEXT NOT NULL, details_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS closed_periods (
  book_id TEXT NOT NULL REFERENCES books(book_id), month TEXT NOT NULL,
  closed_utc TEXT NOT NULL, PRIMARY KEY(book_id,month)
);
"""

def _connect(path=None):
    target = Path(path) if path is not None else DB
    target.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(target), timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA busy_timeout=30000")
    con.executescript(SCHEMA)
    return con

def paise(value):
    try:
        d = Decimal(str(value))
        if not d.is_finite() or d <= 0 or d.as_tuple().exponent < -2:
            raise ValueError("Amount must be positive and have at most two decimals")
        return int((d * 100).to_integral_exact())
    except (InvalidOperation, TypeError) as exc:
        raise ValueError("Invalid currency amount") from exc

def _date(value):
    return date.fromisoformat(str(value)).isoformat()

def _now():
    return datetime.now(timezone.utc).isoformat()

def _audit(con, action, details):
    con.execute("INSERT INTO bookkeeping_audit(at_utc,action,details_json) VALUES (?,?,?)",
                (_now(), action, json.dumps(details, sort_keys=True)))

def create_book(book_id, name, kind, gstin="", path=None):
    if kind not in ("personal", "business") or not book_id.strip() or not name.strip():
        raise ValueError("Book needs a name, ID and personal/business kind")
    with _connect(path) as con:
        con.execute("INSERT INTO books VALUES (?,?,?,?)", (book_id.strip(), name.strip(), kind, gstin.strip()))
        _audit(con, "create_book", {"book_id":book_id})
    return book_id

def create_account(account_id, book_id, name, type_, path=None):
    with _connect(path) as con:
        con.execute("INSERT INTO accounts VALUES (?,?,?,?)",
                    (account_id, book_id, name.strip(), type_))
        _audit(con, "create_account", {"account_id":account_id, "book_id":book_id})
    return account_id

def list_books(path=None):
    with _connect(path) as con:
        return [dict(x) for x in con.execute("SELECT * FROM books ORDER BY name")]

def list_accounts(book_id, path=None):
    with _connect(path) as con:
        return [dict(x) for x in con.execute(
            "SELECT * FROM accounts WHERE book_id=? ORDER BY type,name", (book_id,))]

def is_open(con, book_id, posting_date):
    if con.execute("SELECT 1 FROM closed_periods WHERE book_id=? AND month=?",
                   (book_id,posting_date[:7])).fetchone():
        raise ValueError("Accounting period is closed")

def post_journal(journal_id, book_id, posting_date, memo, lines, reference=None,
                 reversal_of=None, path=None):
    """lines: [(account_id, debit_rupees, credit_rupees), ...].
    One nonzero side per line; sum(debit) == sum(credit) in paise.
    """
    posting_date = _date(posting_date)
    if not memo.strip() or len(lines)<2:
        raise ValueError("A memo and two or more lines are required")
    cleaned=[]
    for account_id, debit, credit in lines:
        d=paise(debit) if Decimal(str(debit))>0 else 0
        c=paise(credit) if Decimal(str(credit))>0 else 0
        if (d>0)==(c>0):
            raise ValueError("Each line needs exactly one debit or credit")
        cleaned.append((account_id,d,c))
    if sum(x[1] for x in cleaned)!=sum(x[2] for x in cleaned):
        raise ValueError("Journal debits and credits are not equal")
    with _connect(path) as con:
        is_open(con,book_id,posting_date)
        for account_id,_,_ in cleaned:
            account=con.execute("SELECT book_id FROM accounts WHERE account_id=?",
                                (account_id,)).fetchone()
            if account is None or account["book_id"]!=book_id:
                raise ValueError("Journal cannot post to another book's account")
        con.execute("INSERT INTO journal_headers VALUES (?,?,?,?,?,?,?)",
                    (journal_id,book_id,posting_date,memo,reference,_now(),reversal_of))
        con.executemany("INSERT INTO journal_lines VALUES (?,?,?,?,?)",
                        [(journal_id,i+1,a,d,c) for i,(a,d,c) in enumerate(cleaned)])
        _audit(con,"post_journal",{"journal_id":journal_id,"book_id":book_id})
    return journal_id

def reverse_journal(original_id,new_id,posting_date,reason,path=None):
    with _connect(path) as con:
        old=con.execute("SELECT * FROM journal_headers WHERE journal_id=?",
                        (original_id,)).fetchone()
        if old is None:
            raise ValueError("Original journal not found")
        original_lines=[dict(x) for x in con.execute(
            "SELECT * FROM journal_lines WHERE journal_id=? ORDER BY line_no",(original_id,))]
    return post_journal(new_id,old["book_id"],posting_date,
                        "Reversal: "+reason,
                        [(x["account_id"],Decimal(x["credit_paise"])/100,
                          Decimal(x["debit_paise"])/100) for x in original_lines],
                        reversal_of=original_id,path=path)

def trial_balance(book_id,path=None,through=None):
    with _connect(path) as con:
        # Filter journals inside the left join to retain accounts with only future entries.
        params = [_date(through), book_id] if through else [book_id]
        joined = ("SELECT l.* FROM journal_lines l JOIN journal_headers h "
                  "ON h.journal_id=l.journal_id WHERE h.posting_date<=?") if through else "SELECT * FROM journal_lines"
        query=f"""SELECT a.account_id,a.name,a.type,
        COALESCE(SUM(l.debit_paise),0) AS debit_paise,
        COALESCE(SUM(l.credit_paise),0) AS credit_paise
        FROM accounts a LEFT JOIN ({joined}) l ON a.account_id=l.account_id
        WHERE a.book_id=?
        GROUP BY a.account_id ORDER BY a.type,a.name"""
        return [dict(x) for x in con.execute(query,params)]

def close_period(book_id,month,path=None):
    if len(month)!=7 or month[4]!="-":
        raise ValueError("Expected YYYY-MM")
    date.fromisoformat(month+"-01")
    with _connect(path) as con:
        con.execute("INSERT INTO closed_periods VALUES (?,?,?)",(book_id,month,_now()))
        _audit(con,"close_period",{"book_id":book_id,"month":month})

def add_invoice(invoice_id,book_id,role,gstin,number,invoice_date,
                taxable,cgst="0",sgst="0",igst="0",cess="0",eligible_itc="review",
                source="",path=None):
    with _connect(path) as con:
        vals=[]
        for x in (taxable,cgst,sgst,igst,cess):
            val=Decimal(str(x))
            if not val.is_finite() or val<0 or val.as_tuple().exponent < -2:
                raise ValueError("Invoice amounts must be nonnegative with at most two decimals")
            vals.append(int(val*100))
        con.execute("INSERT INTO invoice_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (invoice_id,book_id,role,gstin.strip().upper(),number.strip(),
                     _date(invoice_date),*vals,eligible_itc,source))
        _audit(con,"add_invoice",{"invoice_id":invoice_id,"book_id":book_id,"role":role})

def reconcile_gstr2b(book_id,path=None):
    """Strict exact GSTIN + normalized invoice number + date + tax amounts.
    No legal ITC eligibility is inferred from a match.
    """
    with _connect(path) as con:
        rows=[dict(x) for x in con.execute(
            "SELECT * FROM invoice_records WHERE book_id=? AND role IN ('purchase','gstr2b')",
            (book_id,))]
    def key(r):
        return (r["supplier_gstin"],r["invoice_number"].upper().replace(" ","").replace("/",""),
                r["invoice_date"])
    purchases={key(r):r for r in rows if r["role"]=="purchase"}
    gst={key(r):r for r in rows if r["role"]=="gstr2b"}
    results=[]
    for k in sorted(set(purchases)|set(gst)):
        p,g=purchases.get(k),gst.get(k)
        status="purchase_only" if not g else "gstr2b_only" if not p else "matched"
        if p and g:
            fields=("taxable_paise","cgst_paise","sgst_paise","igst_paise","cess_paise")
            if any(p[f]!=g[f] for f in fields):
                status="amount_mismatch"
        results.append({"key":" | ".join(k),"status":status,
                        "purchase_id":p["invoice_id"] if p else None,
                        "gstr2b_id":g["invoice_id"] if g else None,
                        "eligibility":"review_required" if p and p["eligible_itc"]=="review" else
                        (p["eligible_itc"] if p else "not_assessed")})
    return results

def stage_statement(book_id,account_id,filename,document_bytes,records,path=None):
    """Import records [{date,description,amount,direction,reference?}].
    File hash prevents identical upload. Rows retain source location.
    """
    digest=hashlib.sha256(document_bytes).hexdigest()
    import_id=hashlib.sha256(f"{book_id}|{account_id}|{digest}".encode()).hexdigest()
    with _connect(path) as con:
        account=con.execute("SELECT book_id FROM accounts WHERE account_id=?",
                            (account_id,)).fetchone()
        if account is None or account["book_id"]!=book_id:
            raise ValueError("Statement account belongs to another book")
        try:
            con.execute("INSERT INTO statement_imports VALUES (?,?,?,?,?,?)",
                        (import_id,book_id,account_id,filename,digest,_now()))
        except sqlite3.IntegrityError:
            return 0,len(records)
        for i,r in enumerate(records,1):
            direction=r["direction"]
            if direction not in ("debit","credit"):
                raise ValueError("Statement direction must be debit or credit")
            line_id=hashlib.sha256(f"{import_id}|{i}".encode()).hexdigest()
            con.execute("INSERT INTO statement_lines(line_id,import_id,source_row,txn_date,description,amount_paise,direction,reference) VALUES (?,?,?,?,?,?,?,?)",
                        (line_id,import_id,i,_date(r["date"]),r["description"],
                         paise(r["amount"]),direction,r.get("reference")))
        _audit(con,"stage_statement",{"book_id":book_id,"import_id":import_id,
                                       "rows":len(records)})
    return len(records),0

def list_staged(book_id,path=None):
    with _connect(path) as con:
        return [dict(x) for x in con.execute("""SELECT s.*, i.account_id,i.filename
        FROM statement_lines s JOIN statement_imports i ON s.import_id=i.import_id
        WHERE i.book_id=? ORDER BY s.txn_date,s.source_row""",(book_id,))]

def link_statement(line_id,journal_id,path=None):
    with _connect(path) as con:
        line=con.execute("""SELECT i.book_id FROM statement_lines s
        JOIN statement_imports i ON i.import_id=s.import_id WHERE s.line_id=?""",
                         (line_id,)).fetchone()
        journal=con.execute("SELECT book_id FROM journal_headers WHERE journal_id=?",
                            (journal_id,)).fetchone()
        if not line or not journal or line["book_id"]!=journal["book_id"]:
            raise ValueError("Statement and journal must exist in same book")
        con.execute("UPDATE statement_lines SET linked_journal_id=? WHERE line_id=?",
                    (journal_id,line_id))
        _audit(con,"link_statement",{"line_id":line_id,"journal_id":journal_id})
