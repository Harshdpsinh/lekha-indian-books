"""Generate separate monthly personal/business and GST/CA Excel workbooks."""
from pathlib import Path
import pandas as pd
from .ledger_v2 import connect

def _money(df, cols):
    for c in cols:
        if c in df:
            df[c]=pd.to_numeric(df[c],errors='coerce').fillna(0)/100
    return df

def export_month(month: str, folder: str | Path = 'out'):
    if len(month)!=7 or month[4]!='-' or not month[:4].isdigit() or not month[5:].isdigit() or not 1<=int(month[5:])<=12:
        raise ValueError('Use YYYY-MM')
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    with connect() as con:
        tx=pd.read_sql_query("SELECT * FROM transactions_v2 WHERE substr(date,1,7)=? ORDER BY date,account_id",(con,),params=(month,))
        invoices=pd.read_sql_query("SELECT * FROM invoice_v2 WHERE substr(date,1,7)=? ORDER BY date,register",(con,),params=(month,))
        accounts=pd.read_sql_query("SELECT * FROM accounts_v2",con)
    tx=_money(tx,['amount_paise'])
    invoices=_money(invoices,['taxable_paise','cgst_paise','sgst_paise','igst_paise','total_paise'])
    outputs={}
    for entity in ('personal','business'):
        part=tx[tx['entity']==entity].copy() if not tx.empty else tx.copy()
        path=folder/f'{month}_{entity}_expenses.xlsx'
        with pd.ExcelWriter(path,engine='openpyxl') as writer:
            part.to_excel(writer,'Transactions',index=False)
            if not part.empty:
                part.groupby(['category','direction'],dropna=False)['amount_paise'].sum().reset_index().to_excel(writer,'Categories',index=False)
        outputs[entity]=path
    gstpath=folder/f'{month}_GST.xlsx'
    with pd.ExcelWriter(gstpath,engine='openpyxl') as writer:
        for register in ('sales','purchase'):
            part=invoices[invoices['register']==register].copy() if not invoices.empty else invoices.copy()
            part.to_excel(writer,register.title(),index=False)
    outputs['gst']=gstpath
    capath=folder/f'{month}_CA.xlsx'
    with pd.ExcelWriter(capath,engine='openpyxl') as writer:
        tx.to_excel(writer,'All Transactions',index=False)
        accounts.to_excel(writer,'Accounts',index=False)
        invoices.to_excel(writer,'GST Invoices',index=False)
        if not tx.empty:
            tx.groupby(['entity','category','direction'],dropna=False)['amount_paise'].sum().reset_index().to_excel(writer,'Category Summary',index=False)
        pd.DataFrame([{'warning':'Draft working papers only. Verify GST ITC with GSTR-2B and reconcile banks/cards before filing.'}]).to_excel(writer,'Review Notes',index=False)
    outputs['ca']=capath
    return outputs
