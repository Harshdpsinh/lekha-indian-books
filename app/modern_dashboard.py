"""Streamlit dashboard for the account-aware ledger and monthly GST workflow.

Run via: streamlit run app/modern_dashboard.py
This page reads ledger_v2 only. The legacy interface remains unchanged.
"""
from pathlib import Path
import sys
import tempfile
import io
import zipfile
from datetime import date

ROOT=Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path: sys.path.insert(0,str(ROOT))

import pandas as pd
import streamlit as st
from lekha.ledger_v2 import connect, add_account, import_transactions, summary
from lekha.gst_register import import_register
from lekha.reports_v2 import export_month

st.set_page_config(page_title="Lekha | Financial Overview",page_icon="📊",layout="wide")
st.title("Lekha")
st.caption("Personal and business books • monthly GST • working papers")
st.warning("Local development only. Do not expose this app on the public internet without authentication and secure storage.")
today=date.today()
month=st.sidebar.text_input("Report month (YYYY-MM)",today.strftime("%Y-%m"))
entity=st.sidebar.selectbox("Books",["Combined","Personal","Business"])
start=f"{month}-01";end=f"{month}-31"
if len(month)!=7 or month[4]!='-' or not month[:4].isdigit() or not month[5:].isdigit() or not 1<=int(month[5:])<=12:
    st.error("Enter a valid report month YYYY-MM")
    st.stop()
selected=None if entity=="Combined" else entity.lower()
metrics=summary(start,end,selected)
with connect() as con:
    tx=pd.read_sql_query("SELECT date,account_id,description,amount_paise,direction,category,entity,reviewed FROM transactions_v2 WHERE date BETWEEN ? AND ? ORDER BY date DESC",con,params=(start,end))
    inv=pd.read_sql_query("SELECT date,register,party,invoice_no,taxable_paise,cgst_paise,sgst_paise,igst_paise,total_paise,itc_status FROM invoice_v2 WHERE date BETWEEN ? AND ? ORDER BY date DESC",con,params=(start,end))
    accounts=pd.read_sql_query("SELECT id,label,kind,entity FROM accounts_v2 ORDER BY label",con)
if selected and not tx.empty: tx=tx[tx.entity==selected]
c1,c2,c3,c4=st.columns(4)
c1.metric("Classified inflows",f"₹{metrics['income']:,.2f}")
c2.metric("Classified outflows",f"₹{metrics['expense']:,.2f}")
c3.metric("Net",f"₹{metrics['net']:,.2f}")
c4.metric("Transactions",f"{metrics['transactions']:,}")
st.caption("Metrics exclude tagged transfers, investment movements, card settlement and loan principal; remaining categories require review.")
tab_overview,tab_accounts,tab_gst,tab_exports=st.tabs(["Overview","Accounts & imports","Monthly GST","Reports"])
with tab_overview:
    if tx.empty:st.info("No imported v2 transactions for this month yet.")
    else:
        chart=tx.copy()
        chart["amount"]=chart.amount_paise/100
        chart["signed_amount"]=chart.amount.where(chart.direction=="credit",-chart.amount)
        st.subheader("Cash movements by date")
        st.line_chart(chart.groupby("date")["signed_amount"].sum())
        st.subheader("Category breakdown")
        st.bar_chart(chart.groupby("category")["amount"].sum())
        st.dataframe(chart.drop(columns=["amount_paise"]),hide_index=True,use_container_width=True)
with tab_accounts:
    st.subheader("Create an account")
    with st.form("account"):
        aid=st.text_input("Unique account nickname (not full number)")
        label=st.text_input("Display name")
        kind=st.selectbox("Type",["bank","credit_card","upi","investment","cash"])
        book=st.selectbox("Book",["personal","business"])
        if st.form_submit_button("Save account"):
            if not aid.strip() or not label.strip():st.error("Nickname and name required.")
            else:
                add_account(aid.strip(),label.strip(),kind,book)
                st.success("Account created. Refresh to see it in selection.")
    st.dataframe(accounts,hide_index=True,use_container_width=True)
    st.subheader("Import verified CSV")
    st.caption("Required CSV columns: date (YYYY-MM-DD), description, amount, direction (credit/debit). Use a reviewed export rather than raw bank PDF.")
    if not accounts.empty:
        account=st.selectbox("Import to account",accounts.id.tolist())
        csv=st.file_uploader("Choose CSV",type=["csv"],key="csv")
        if csv and st.button("Import transactions"):
            try:
                df=pd.read_csv(csv,dtype=str,keep_default_na=False)
                required={"date","description","amount","direction"}
                if not required.issubset(df.columns):raise ValueError("Missing "+", ".join(sorted(required-set(df.columns))))
                result=import_transactions(account,df.to_dict("records"),source_file=csv.name)
                st.success(f"{result[0]} added; {result[1]} duplicate rows skipped")
            except Exception as exc:st.error(f"Import failed: {exc}")
with tab_gst:
    st.subheader("GST sales and purchases")
    st.caption("Import your existing Excel register format; GST input-credit eligibility remains unverified until GSTR-2B reconciliation.")
    register=st.selectbox("Register",["sales","purchase"])
    upload=st.file_uploader("Excel register",type=["xlsx"],key="gst")
    if upload and st.button("Import GST register"):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"register.xlsx"
            path.write_bytes(upload.getvalue())
            try:
                result=import_register(path,register)
                st.success(f"{result['added']} invoices added; {result['duplicates']} duplicates")
                if result["tax_mismatch_rows"]:st.warning(f"{result['tax_mismatch_rows']} invoices need tax-total review")
            except Exception as exc:st.error(f"GST import failed: {exc}")
    if inv.empty:st.info("No GST invoices in this month yet.")
    else:
        gst=inv.copy()
        for col in ["taxable_paise","cgst_paise","sgst_paise","igst_paise","total_paise"]:
            gst[col]=gst[col]/100
        st.dataframe(gst,hide_index=True,use_container_width=True)
        st.bar_chart(gst.groupby("register")[["taxable_paise","igst_paise","cgst_paise","sgst_paise"]].sum())
with tab_exports:
    st.subheader("Monthly GST and CA working papers")
    st.caption("Exports are drafts for review, not GST filing-ready or reconciled financial statements.")
    if st.button("Generate Excel reporting pack"):
        try:
            with tempfile.TemporaryDirectory() as tmp:
                paths=export_month(month,tmp)
                stream=io.BytesIO()
                with zipfile.ZipFile(stream,"w",compression=zipfile.ZIP_DEFLATED) as archive:
                    for path in paths.values():archive.write(path,arcname=path.name)
                st.download_button("Download monthly Excel pack (.zip)",data=stream.getvalue(),file_name=f"Lekha_{month}_reports.zip",mime="application/zip")
        except Exception as exc:st.error(f"Export failed: {exc}")
