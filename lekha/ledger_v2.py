"""Account-aware accounting ledger; isolated from legacy txns for safe migration."""
import hashlib
import json
import sqlite3
from datetime import datetime
from pathlib import Path

DB = Path.home() / ".lekha" / "books.sqlite"

def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.executescript("""
    CREATE TABLE IF NOT EXISTS accounts_v2 (
        id TEXT PRIMARY KEY, label TEXT NOT NULL, kind TEXT NOT NULL,
        entity TEXT NOT NULL CHECK(entity IN ('personal','business'))
    );
    CREATE TABLE IF NOT EXISTS transactions_v2 (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts_v2(id),
        date TEXT NOT NULL, description TEXT NOT NULL, amount_paise INTEGER NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('credit','debit')),
        category TEXT NOT NULL DEFAULT 'Uncategorised',
        entity TEXT NOT NULL CHECK(entity IN ('personal','business')),
        source_file TEXT, source_row INTEGER, reference TEXT,
        reviewed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_txn_v2_period ON transactions_v2(date,entity);
    CREATE TABLE IF NOT EXISTS invoice_v2 (
        id TEXT PRIMARY KEY, entity TEXT NOT NULL DEFAULT 'business',
        register TEXT NOT NULL CHECK(register IN ('sales','purchase')),
        date TEXT, gstin TEXT, invoice_no TEXT, party TEXT, hsn TEXT,
        taxable_paise INTEGER, cgst_paise INTEGER, sgst_paise INTEGER,
        igst_paise INTEGER, total_paise INTEGER, payment_mode TEXT,
        itc_status TEXT NOT NULL DEFAULT 'review', source_file TEXT
    );
    """)
    return con

def _paise(value):
    from decimal import Decimal, ROUND_HALF_UP
    return int((Decimal(str(value)) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))

def add_account(account_id, label, kind, entity):
    if entity not in ('personal','business'):
        raise ValueError('Invalid entity')
    with connect() as con:
        con.execute('INSERT INTO accounts_v2 VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label', (account_id,label,kind,entity))

def import_transactions(account_id, rows, source_file=''):
    with connect() as con:
        account = con.execute('SELECT entity FROM accounts_v2 WHERE id=?',(account_id,)).fetchone()
        if not account: raise ValueError('Create the account before importing')
        added=skipped=0
        for index,r in enumerate(rows,1):
            if not r.get('date') or r.get('amount') is None: continue
            direction=r.get('direction','debit')
            if direction not in ('debit','credit'): raise ValueError('Invalid direction')
            reference=str(r.get('reference') or '')
            # Row index distinguishes legitimate same-day repeated purchases.
            identity=[account_id,source_file,index,r['date'],str(r.get('description','')),str(_paise(r['amount'])),direction,reference]
            txid=hashlib.sha256(json.dumps(identity).encode()).hexdigest()
            cur=con.execute("""INSERT OR IGNORE INTO transactions_v2
            (id,account_id,date,description,amount_paise,direction,category,entity,source_file,source_row,reference,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (txid,account_id,r['date'],str(r.get('description','')),_paise(r['amount']),direction,
             r.get('category','Uncategorised'),account['entity'],source_file,index,reference,datetime.utcnow().isoformat()))
            added+=int(cur.rowcount>0); skipped+=int(cur.rowcount==0)
        return added,skipped

def summary(start,end,entity=None):
    with connect() as con:
        sql="SELECT * FROM transactions_v2 WHERE date>=? AND date<=?"
        args=[start,end]
        if entity:
            sql+=" AND entity=?";args.append(entity)
        rows=[dict(r) for r in con.execute(sql,args)]
    noncash={'Internal transfer','Card settlement','Investment','Loan principal'}
    income=sum(r['amount_paise'] for r in rows if r['direction']=='credit' and r['category'] not in noncash)
    expense=sum(r['amount_paise'] for r in rows if r['direction']=='debit' and r['category'] not in noncash)
    return {'income':income/100,'expense':expense/100,'net':(income-expense)/100,'transactions':len(rows)}
