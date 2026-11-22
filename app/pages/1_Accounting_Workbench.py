"""Standalone Streamlit page for the additive accounting workbench.

Existing upload and review tabs in streamlit_app.py remain unchanged.
"""
import sys
from pathlib import Path
from uuid import uuid4
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))

import pandas as pd
import streamlit as st
from lekha import accounting as ac

st.title("Accounting workbench")
st.warning("Local-only accounting workbench. Imported transactions are provisional; GST matching does not establish ITC eligibility. Do not use this as a filed return.")
st.caption("Personal and business books stay separate. Original imported rows in txns are not changed.")

with st.expander("Create book",expanded=not bool(ac.list_books())):
    with st.form("new_book"):
        new_book_id=st.text_input("Book ID",placeholder="personal or business")
        new_name=st.text_input("Book name")
        new_kind=st.selectbox("Book type",["personal","business"])
        new_gstin=st.text_input("GSTIN (if applicable)")
        if st.form_submit_button("Create book"):
            try:
                ac.create_book(new_book_id,new_name,new_kind,new_gstin)
                st.success("Book created")
                st.rerun()
            except Exception as e:
                st.error(str(e))

books=ac.list_books()
if not books:
    st.info("Create a personal or business book to start. Existing imported data is not automatically assigned.")
    st.stop()
labels={r["book_id"]:r["name"]+" ("+r["kind"]+")" for r in books}
book_id=st.selectbox("Accounting book",list(labels),format_func=lambda k:labels[k])
accounts=ac.list_accounts(book_id)
acct_labels={x["account_id"]:x["name"]+" ["+x["type"]+"]" for x in accounts}
with st.expander("Add chart-of-accounts entry"):
    with st.form("account"):
        name=st.text_input("Account name",placeholder="Current account / Sales / Rent")
        account_type=st.selectbox("Account type",["asset","liability","equity","income","expense"])
        if st.form_submit_button("Create account"):
            try:
                ac.create_account(str(uuid4()),book_id,name,account_type)
                st.success("Account created")
                st.rerun()
            except Exception as e:
                st.error(str(e))

tab1,tab2,tab3,tab4=st.tabs(["Journal","Trial balance","Statement staging","GST matching"])
with tab1:
    st.caption("Enter two legs of a balanced journal. Use a new journal to reverse errors; do not edit posted history.")
    if len(accounts)<2:
        st.info("Create at least two accounts in this book.")
    else:
        with st.form("post"):
            posting_date=st.date_input("Posting date")
            memo=st.text_input("Narration")
            ref=st.text_input("Unique reference (optional)")
            col1,col2=st.columns(2)
            with col1:
                debit_ac=st.selectbox("Debit account",list(acct_labels),format_func=lambda k:acct_labels[k],key="debit")
                debit_amt=st.number_input("Debit ₹",min_value=0.01,value=100.00,step=0.01)
            with col2:
                credit_ac=st.selectbox("Credit account",list(acct_labels),format_func=lambda k:acct_labels[k],key="credit")
                credit_amt=st.number_input("Credit ₹",min_value=0.01,value=100.00,step=0.01)
            if st.form_submit_button("Post balanced journal"):
                try:
                    ac.post_journal(str(uuid4()),book_id,posting_date,memo,
                                    [(debit_ac,debit_amt,0),(credit_ac,0,credit_amt)],
                                    reference=ref or None)
                    st.success("Journal posted")
                except Exception as e:
                    st.error(str(e))
with tab2:
    report=ac.trial_balance(book_id)
    if report:
        table=pd.DataFrame(report)
        for col in ("debit_paise","credit_paise"):
            table[col.replace("_paise","_rupees")]=table[col]/100
        st.dataframe(table[["name","type","debit_rupees","credit_rupees"]],use_container_width=True)
        if sum(x["debit_paise"]-x["credit_paise"] for x in report)!=0:
            st.error("Trial balance mismatch; do not rely on reports.")
        else:
            st.success("Debit and credit totals match.")
    else:
        st.info("No accounts yet.")
with tab3:
    st.caption("Structured CSV statement staging. Requires date, description, amount, direction; optional reference. Duplicate files are skipped for the same book and account. Rows are not automatically posted.")
    bank_accounts=[a for a in accounts if a["type"] in ("asset","liability")]
    if not bank_accounts:
        st.info("Create a bank or card account as asset/liability first.")
    else:
        statement_account=st.selectbox("Statement account",[a["account_id"] for a in bank_accounts],
                                     format_func=lambda k:acct_labels[k])
        upload=st.file_uploader("Structured statement CSV",type="csv",key="staging_upload")
        if upload is not None:
            try:
                raw=upload.getvalue()
                import io
                frame=pd.read_csv(io.BytesIO(raw),dtype={"reference":"string"})
                required={"date","description","amount","direction"}
                if not required.issubset(frame.columns):
                    raise ValueError("Missing CSV columns: "+", ".join(sorted(required-set(frame.columns))))
                st.dataframe(frame.head(20))
                if st.button("Stage transactions (not journals)"):
                    fields=["date","description","amount","direction"]
                    if "reference" in frame: fields.append("reference")
                    records=frame[fields].fillna("").to_dict("records")
                    inserted,skipped=ac.stage_statement(book_id,statement_account,upload.name,raw,records)
                    st.success(f"Staged: {inserted}, duplicate file rows skipped: {skipped}")
            except Exception as e:
                st.error(str(e))
    staged=ac.list_staged(book_id)
    if staged:
        st.dataframe(pd.DataFrame(staged),use_container_width=True)
with tab4:
    st.caption("Manual invoice and GSTR-2B record capture; matches by supplier GSTIN, invoice number/date and exact amounts. All tax credit decisions require review.")
    with st.form("invoice"):
        role=st.selectbox("Record source",["purchase","sale","gstr2b"])
        gstin=st.text_input("Supplier GSTIN")
        number=st.text_input("Invoice number")
        inv_date=st.date_input("Invoice date",key="invdate")
        taxable=st.number_input("Taxable ₹",min_value=0.00,step=0.01)
        c1,c2,c3,c4=st.columns(4)
        cgst=c1.number_input("CGST ₹",min_value=0.00,step=0.01)
        sgst=c2.number_input("SGST ₹",min_value=0.00,step=0.01)
        igst=c3.number_input("IGST ₹",min_value=0.00,step=0.01)
        cess=c4.number_input("Cess ₹",min_value=0.00,step=0.01)
        eligibility=st.selectbox("ITC review",["review","eligible","ineligible"])
        if st.form_submit_button("Save invoice record"):
            try:
                ac.add_invoice(str(uuid4()),book_id,role,gstin,number,inv_date,
                               taxable,cgst,sgst,igst,cess,eligibility)
                st.success("Invoice record saved; no GST return filed.")
            except Exception as e:
                st.error(str(e))
    matches=ac.reconcile_gstr2b(book_id)
    if matches:
        st.dataframe(pd.DataFrame(matches),use_container_width=True)
        st.download_button("Download reconciliation CSV",
                           pd.DataFrame(matches).to_csv(index=False).encode(),
                           "gstr2b_review.csv",mime="text/csv")
