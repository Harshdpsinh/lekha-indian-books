"""Review-only reconciliation and GST returns workpaper UI.

This is an additive page: original Lekha tabs, existing statements, and the
accounting workbench are not modified or removed.
"""
from pathlib import Path
import sys
from decimal import Decimal
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import pandas as pd
import streamlit as st
from lekha import accounting as ac
from lekha import reconciliation as rec
from lekha import gst_reports as gst

st.title("Bank reconciliation and GST workpapers")
st.warning("Local workbench. No GST filing or bank changes occur automatically. "
           "Use this with your existing local database; do not expose plaintext PDF-password storage online.")
books=ac.list_books()
if not books:
    st.info("Create a book and accounts in Accounting Workbench first.")
    st.stop()
book_labels={b["book_id"]:b["name"]+" ("+b["kind"]+")" for b in books}
book_id=st.selectbox("Book",list(book_labels),format_func=lambda x:book_labels[x])
accounts=ac.list_accounts(book_id)
bank_accounts=[a for a in accounts if a["type"] in ("asset","liability")]
a_labels={a["account_id"]:a["name"]+" ("+a["type"]+")" for a in bank_accounts}

tab_bank,tab_gst=st.tabs(["Bank / credit-card reconciliation","GST filing workpapers"])
with tab_bank:
    if not bank_accounts:
        st.info("Create a bank asset or credit-card liability account first.")
    else:
        account_id=st.selectbox("Select account",list(a_labels),
                                format_func=lambda x:a_labels[x])
        status=rec.statement_status(book_id,account_id=account_id)
        if status:
            frame=pd.DataFrame(status)
            for key in ("amount_paise","allocated_paise","remaining_paise"):
                frame[key.replace("_paise","_rupees")]=frame[key]/100
            st.dataframe(frame[["line_id","txn_date","description","direction",
                               "amount_rupees","allocated_rupees","remaining_rupees","status"]],
                         use_container_width=True)
            st.download_button("Download statement reconciliation CSV",
                               frame.to_csv(index=False).encode("utf-8-sig"),
                               file_name="statement_reconciliation.csv",mime="text/csv")
            unmatched=[x for x in status if x["remaining_paise"]>0]
            if unmatched:
                labels={r["line_id"]:f'{r["txn_date"]} {r["description"][:50]} ₹{r["remaining_paise"]/100:,.2f}' for r in unmatched}
                line_id=st.selectbox("Unmatched statement line",list(labels),
                                    format_func=lambda x:labels[x])
                suggestions=rec.candidates(book_id,account_id,line_id)
                if suggestions:
                    st.caption("Candidates are suggestions only. Check account, amount, date and source proof before linking.")
                    st.dataframe(pd.DataFrame(suggestions),use_container_width=True)
                journal_rows=rec.journal_status(book_id,account_id)
                possible=[x for x in journal_rows if x["remaining_paise"]>0]
                if possible:
                    jr={x["journal_id"]:f'{x["posting_date"]} {x["memo"][:50]} ₹{x["remaining_paise"]/100:,.2f}' for x in possible}
                    journal_id=st.selectbox("Journal bank/card leg to match",list(jr),
                                            format_func=lambda x:jr[x])
                    selected=next(x for x in unmatched if x["line_id"]==line_id)
                    chosen=next(x for x in possible if x["journal_id"]==journal_id)
                    max_amount=min(selected["remaining_paise"],chosen["remaining_paise"])/100
                    amount=st.number_input("Allocate ₹",min_value=0.01,max_value=float(max_amount),
                                           value=float(max_amount),step=0.01,format="%.2f")
                    if st.button("Confirm reconciliation allocation"):
                        try:
                            rec.allocate(line_id,journal_id,int(Decimal(str(amount))*100))
                            st.success("Allocation recorded; original journal and statement unchanged.")
                            st.rerun()
                        except Exception as e:
                            st.error(str(e))
                else:
                    st.info("No posted bank/card journal leg is available. Post the accounting journal first.")
            with st.expander("Undo an existing match"):
                from lekha.accounting import _connect
                with rec._db() as conn:
                    existing=[dict(x) for x in conn.execute("""SELECT r.line_id,r.journal_id,r.allocated_paise
                       FROM reconciliation_allocations r
                       JOIN statement_lines s ON s.line_id=r.line_id
                       JOIN statement_imports i ON i.import_id=s.import_id
                       WHERE i.book_id=? AND i.account_id=?""",(book_id,account_id))]
                if existing:
                    opts={f'{x["line_id"]}|{x["journal_id"]}':x for x in existing}
                    key=st.selectbox("Recorded allocation",list(opts))
                    if st.button("Undo selected allocation"):
                        try:
                            match=opts[key]
                            rec.undo(match["line_id"],match["journal_id"])
                            st.success("Allocation removed; source records preserved.")
                            st.rerun()
                        except Exception as e:
                            st.error(str(e))
        else:
            st.info("No statement lines staged for this account. Import CSV from Accounting Workbench first.")
        with st.expander("Statement opening/closing balance check"):
            st.caption("Checks the arithmetic of the imported statement rows. This is not proof of bank reconciliation.")
            from lekha.accounting import _connect
            with rec._db() as conn:
                imports=[dict(x) for x in conn.execute(
                    "SELECT import_id,filename FROM statement_imports WHERE book_id=? AND account_id=?",
                    (book_id,account_id))]
            if imports:
                imp=st.selectbox("Statement file",[x["import_id"] for x in imports],
                                 format_func=lambda k:next(x["filename"] for x in imports if x["import_id"]==k))
                opening=st.number_input("Opening balance ₹",value=0.0,step=0.01,format="%.2f")
                closing=st.number_input("Reported closing balance ₹",value=0.0,step=0.01,format="%.2f")
                if st.button("Check balance arithmetic"):
                    result=rec.balance_check(imp,int(Decimal(str(opening))*100),
                                              int(Decimal(str(closing))*100))
                    st.json({k:(v/100 if k.endswith("_paise") else v) for k,v in result.items()})
        journals=rec.journal_status(book_id,account_id)
        if journals:
            pending=[x for x in journals if x["remaining_paise"]>0]
            st.metric("Unreconciled journal bank/card entries",len(pending))
with tab_gst:
    book=next(b for b in books if b["book_id"]==book_id)
    if book["kind"]!="business":
        st.info("Select a business book to create GST working papers.")
    else:
        month=st.text_input("GST tax period YYYY-MM",value="2026-11")
        try:
            data=gst.draft_gst_workpapers(book_id,month)
            summary=data["summary"]
            c1,c2,c3,c4=st.columns(4)
            c1.metric("Sales invoices",summary["sales_invoices"])
            c2.metric("Purchase invoices",summary["purchase_invoices"])
            c3.metric("Review-required purchases",summary["review_required_purchase_invoices"])
            c4.metric("Unresolved 2B matches",summary["unresolved_2b_reconciliation"])
            st.subheader("Draft GSTR-1 invoice totals (₹)")
            st.json({key:Decimal(v)/100 for key,v in summary["sales_invoice_totals_paise"].items()})
            st.subheader("GSTR-3B input evidence (₹; not claimable ITC)")
            st.json({key:Decimal(v)/100 for key,v in summary["matched_and_marked_eligible_itc_paise"].items()})
            st.error("NOT READY TO FILE. GSTR-1 classification and GSTR-3B liability/ITC schedules are incomplete.")
            st.subheader("Filing checks still required")
            for gap in summary["gaps"]:
                st.write("- "+gap)
            for label,key in (("Sales register","sales_register"),("Purchase register","purchase_register"),
                              ("GSTR-2B records","gstr2b_register"),("Invoice-to-2B reconciliation","gstr2b_matches")):
                with st.expander(label):
                    st.dataframe(pd.DataFrame(data[key]),use_container_width=True)
            st.download_button("Download GST workpapers ZIP (not filing JSON)",
                               gst.export_workpapers_zip(book_id,month),
                               file_name=f"gst_workpapers_{month}.zip",mime="application/zip")
            st.caption("Official reference: https://tutorial.gst.gov.in/userguide/returns/Create_and_Submit_GSTR3B.htm")
        except Exception as e:
            st.error(str(e))
