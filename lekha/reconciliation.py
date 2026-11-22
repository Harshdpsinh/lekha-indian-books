"""Evidence-based bank/card statement reconciliation.

No accounting journal is posted by this module. Reconciliation allocations
are reversible metadata and never delete or silently edit source transactions.
"""
from __future__ import annotations
import sqlite3
from datetime import date
from decimal import Decimal
from lekha.accounting import _connect, _audit

DDL = """
CREATE TABLE IF NOT EXISTS reconciliation_allocations (
  line_id TEXT NOT NULL REFERENCES statement_lines(line_id),
  journal_id TEXT NOT NULL REFERENCES journal_headers(journal_id),
  allocated_paise INTEGER NOT NULL CHECK (allocated_paise>0),
  created_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (line_id,journal_id)
);
CREATE TABLE IF NOT EXISTS statement_balance_checks (
  check_id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id TEXT NOT NULL REFERENCES statement_imports(import_id),
  opening_paise INTEGER NOT NULL,
  closing_paise INTEGER NOT NULL,
  created_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

def _db(path=None):
    con=_connect(path)
    con.executescript(DDL)
    return con

def _line(con,line_id):
    return con.execute("""SELECT s.*,i.book_id,i.account_id
        FROM statement_lines s JOIN statement_imports i ON s.import_id=i.import_id
        WHERE s.line_id=?""",(line_id,)).fetchone()

def _journal_bank_leg(con,journal_id,account_id):
    row=con.execute("""SELECT h.book_id,h.posting_date,
       COALESCE(SUM(CASE WHEN l.account_id=? THEN l.debit_paise ELSE 0 END),0) AS debit,
       COALESCE(SUM(CASE WHEN l.account_id=? THEN l.credit_paise ELSE 0 END),0) AS credit
       FROM journal_headers h JOIN journal_lines l ON h.journal_id=l.journal_id
       WHERE h.journal_id=? GROUP BY h.journal_id""",
       (account_id,account_id,journal_id)).fetchone()
    return row

def allocate(line_id,journal_id,amount_paise=None,path=None):
    """Assign a positive amount of a statement line to a bank-account journal leg.

    For asset bank accounts: statement credits correspond to journal debits.
    For liability credit cards: statement credits correspond to journal credits.
    A journal can cover multiple statement lines and vice versa, subject to caps.
    """
    with _db(path) as con:
        line=_line(con,line_id)
        if line is None:
            raise ValueError("Unknown statement line")
        account=con.execute("SELECT type FROM accounts WHERE account_id=?",
                           (line["account_id"],)).fetchone()
        if account is None or account["type"] not in ("asset","liability"):
            raise ValueError("Statement must be assigned to bank/card asset or liability account")
        journal=_journal_bank_leg(con,journal_id,line["account_id"])
        if journal is None or journal["book_id"]!=line["book_id"]:
            raise ValueError("Journal missing or belongs to another accounting book")
        sign_positive=line["direction"]=="credit"
        allowed_side=("debit" if sign_positive else "credit") if account["type"]=="asset" else ("credit" if sign_positive else "debit")
        other_side="credit" if allowed_side=="debit" else "debit"
        if journal[other_side] > 0 or journal[allowed_side] <= 0:
            raise ValueError("Journal bank/card side conflicts with statement direction")
        allocated=int(amount_paise if amount_paise is not None else line["amount_paise"])
        if allocated<=0:
            raise ValueError("Allocation must be positive")
        line_used=con.execute("SELECT COALESCE(SUM(allocated_paise),0) FROM reconciliation_allocations WHERE line_id=?",
                             (line_id,)).fetchone()[0]
        journal_used=con.execute("""SELECT COALESCE(SUM(r.allocated_paise),0)
            FROM reconciliation_allocations r JOIN statement_lines s ON r.line_id=s.line_id
            JOIN statement_imports i ON s.import_id=i.import_id
            WHERE r.journal_id=? AND i.account_id=?""",(journal_id,line["account_id"])).fetchone()[0]
        if allocated>line["amount_paise"]-line_used:
            raise ValueError("Allocation exceeds unmatched statement amount")
        if allocated>journal[allowed_side]-journal_used:
            raise ValueError("Allocation exceeds unmatched journal bank/card amount")
        con.execute("INSERT INTO reconciliation_allocations(line_id,journal_id,allocated_paise) VALUES (?,?,?)",
                    (line_id,journal_id,allocated))
        _audit(con,"reconcile",{"line_id":line_id,"journal_id":journal_id,"paise":allocated})
    return allocated

def undo(line_id,journal_id,path=None):
    with _db(path) as con:
        cur=con.execute("DELETE FROM reconciliation_allocations WHERE line_id=? AND journal_id=?",
                        (line_id,journal_id))
        if cur.rowcount!=1:
            raise ValueError("No matching reconciliation allocation")
        _audit(con,"undo_reconcile",{"line_id":line_id,"journal_id":journal_id})

def statement_status(book_id,path=None,account_id=None):
    with _db(path) as con:
        query="""SELECT s.line_id,s.txn_date,s.description,s.reference,s.direction,
          s.amount_paise,i.account_id,i.filename,
          COALESCE(SUM(r.allocated_paise),0) AS allocated_paise
          FROM statement_lines s JOIN statement_imports i ON i.import_id=s.import_id
          LEFT JOIN reconciliation_allocations r ON r.line_id=s.line_id
          WHERE i.book_id=?"""
        params=[book_id]
        if account_id:
            query+=" AND i.account_id=?"
            params.append(account_id)
        query+=" GROUP BY s.line_id ORDER BY s.txn_date,s.source_row"
        records=[dict(row) for row in con.execute(query,params)]
    for row in records:
        row["remaining_paise"]=row["amount_paise"]-row["allocated_paise"]
        row["status"]="matched" if row["remaining_paise"]==0 else ("partial" if row["allocated_paise"] else "unmatched")
    return records

def candidates(book_id,account_id,line_id,max_days=3,path=None):
    """Potential exact-amount candidates; never auto-post or auto-reconcile."""
    with _db(path) as con:
        line=_line(con,line_id)
        if not line or line["book_id"]!=book_id or line["account_id"]!=account_id:
            raise ValueError("Unknown line for book/account")
        ac=con.execute("SELECT type FROM accounts WHERE account_id=?",(account_id,)).fetchone()
        side=("debit" if line["direction"]=="credit" else "credit") if ac["type"]=="asset" else ("credit" if line["direction"]=="credit" else "debit")
        rows=con.execute("""SELECT h.journal_id,h.posting_date,h.memo,
              SUM(l.debit_paise) AS debit,SUM(l.credit_paise) AS credit
              FROM journal_headers h JOIN journal_lines l ON h.journal_id=l.journal_id
              WHERE h.book_id=? AND l.account_id=?
              GROUP BY h.journal_id""",(book_id,account_id)).fetchall()
    out=[]
    for row in rows:
        delta=abs((date.fromisoformat(row["posting_date"])-date.fromisoformat(line["txn_date"])).days)
        if delta<=max_days and row[side]==line["amount_paise"]:
            out.append({"journal_id":row["journal_id"],"posting_date":row["posting_date"],
                        "memo":row["memo"],"date_gap_days":delta})
    return sorted(out,key=lambda v:(v["date_gap_days"],v["journal_id"]))

def balance_check(import_id,opening_paise,closing_paise,path=None):
    """Check bank-statement arithmetic; no accounting posting or reconciliation."""
    opening=int(opening_paise)
    closing=int(closing_paise)
    with _db(path) as con:
        rows=con.execute("""SELECT direction,amount_paise FROM statement_lines
                       WHERE import_id=?""",(import_id,)).fetchall()
        if not rows:
            raise ValueError("Import has no statement rows")
        movement=sum((r["amount_paise"] if r["direction"]=="credit" else -r["amount_paise"]) for r in rows)
        calculated=opening+movement
        con.execute("INSERT INTO statement_balance_checks(import_id,opening_paise,closing_paise) VALUES (?,?,?)",
                    (import_id,opening,closing))
        _audit(con,"statement_balance_check",{"import_id":import_id,"difference_paise":calculated-closing})
        return {"opening_paise":opening,"movement_paise":movement,
                "calculated_closing_paise":calculated,"reported_closing_paise":closing,
                "difference_paise":calculated-closing,
                "balanced":calculated==closing}

def journal_status(book_id,account_id,path=None):
    with _db(path) as con:
        rows=con.execute("""SELECT h.journal_id,h.posting_date,h.memo,
            SUM(l.debit_paise) AS debit_paise,SUM(l.credit_paise) AS credit_paise,
            COALESCE((SELECT SUM(r.allocated_paise) FROM reconciliation_allocations r
             JOIN statement_lines s ON r.line_id=s.line_id
             JOIN statement_imports i ON s.import_id=i.import_id
             WHERE r.journal_id=h.journal_id AND i.account_id=?),0) AS allocated_paise
            FROM journal_headers h JOIN journal_lines l ON l.journal_id=h.journal_id
            WHERE h.book_id=? AND l.account_id=?
            GROUP BY h.journal_id ORDER BY h.posting_date""",
            (account_id,book_id,account_id)).fetchall()
        out=[]
        for r in rows:
            rec=dict(r)
            rec["remaining_paise"]=abs(rec["debit_paise"]-rec["credit_paise"])-rec["allocated_paise"]
            out.append(rec)
        return out
