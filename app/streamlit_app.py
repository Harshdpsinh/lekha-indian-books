import io
import streamlit as st
import pandas as pd
from pathlib import Path
from lekha.extract import extract
from lekha.gaps import find_gaps
from lekha.config import Entity
from lekha.excel import write_ca_pack, write_csv
from lekha.memory import remember, tail
from lekha.db import upsert_rows, load_rows, load_rules, save_rule, recategorise
from lekha.pdf import read_upload, institution_of, NeedPassword
from lekha.vault import load as vault_load, save as vault_save
from lekha.spend import token_of, CATS

st.set_page_config(page_title="Lekha", layout="wide")
st.title("Lekha — Indian books")
st.caption("Local GST / ITR desk. Passwords stay in ~/.lekha/vault.bin. SQLite accumulates; duplicates are skipped.")

ent = Entity()
missing = ent.validate()
if missing:
    st.warning("Fill " + ", ".join(missing) + " in .env")

if "vault" not in st.session_state:
    st.session_state.vault = {}
if "pw_cache" not in st.session_state:
    st.session_state.pw_cache = {}

with st.sidebar:
    st.subheader("Range")
    fy = st.selectbox("FY", ["all", "2025-26", "2026-27", "2027-28"], index=2)
    month = st.text_input("Month YYYY-MM (or all)", "all")
    start = st.date_input("From", value=None)
    end = st.date_input("To", value=None)
    st.subheader("Vault")
    phrase = st.text_input("Passphrase", type="password")
    if st.button("Unlock vault") and phrase:
        try:
            st.session_state.vault = vault_load(phrase)
            st.success("Unlocked")
        except Exception:
            st.session_state.vault = {}
            st.info("New vault — passwords you save will create it.")
            st.session_state["phrase"] = phrase

rows = load_rows(
    fy=fy,
    month=month if month else "all",
    start=str(start) if start else "",
    end=str(end) if end else "",
)
df = pd.DataFrame(rows)
credits = df[df["direction"] == "credit"]["amount"].sum() if not df.empty else 0
debits = df[df["direction"] == "debit"]["amount"].sum() if not df.empty else 0
tds = df["tds"].fillna(0).sum() if not df.empty and "tds" in df else 0
uncat = int(((df["category"] == "Uncategorised") | (df.get("confidence", 1) < 0.5)).sum()) if not df.empty else 0

c1, c2, c3, c4 = st.columns(4)
c1.metric("Turnover (credits)", f"₹{credits:,.2f}")
c2.metric("Outflows", f"₹{debits:,.2f}")
c3.metric("Net", f"₹{(credits-debits):,.2f}")
c4.metric("Uncategorised", uncat)

tab_in, tab_led, tab_rev, tab_ex = st.tabs(["Inbox", "Ledgers", "Review", "Export"])

with tab_in:
    st.write("Drop PDFs / Excel / CSV — ingested immediately, no preview.")
    files = st.file_uploader("Statements", type=["pdf", "txt", "csv", "xlsx", "xls"], accept_multiple_files=True)
    typed_pw = st.text_input("PDF password (if prompted)", type="password")
    inst_label = st.text_input("Institution label (hdfc, axis, custom)", "")
    if files:
        for f in files:
            inst = (inst_label or institution_of(f.name)).lower()
            pw = typed_pw or st.session_state.pw_cache.get(inst) or st.session_state.vault.get(f"docpw:{inst}")
            try:
                text = read_upload(f.name, f.getvalue(), pw)
            except NeedPassword:
                st.error(f"{f.name} is encrypted — enter the password and re-drop. It will be mapped to '{inst}'.")
                continue
            except Exception as e:
                st.error(f"{f.name}: {e}")
                continue
            result = extract(text, f.name, ent.gstin, load_rules())
            added, skipped = upsert_rows(result["rows"])
            remember("ingest", f"{f.name}: {added} new, {skipped} skipped")
            if typed_pw:
                st.session_state.pw_cache[inst] = typed_pw
                if phrase or st.session_state.get("phrase"):
                    secrets = dict(st.session_state.vault)
                    secrets[f"docpw:{inst}"] = typed_pw
                    vault_save(phrase or st.session_state.get("phrase"), secrets)
                    st.session_state.vault = secrets
            st.success(f"{f.name}: {added} new · {skipped} duplicate skipped via {result['meta']['parser']}")
            gaps = find_gaps(result["rows"])
            if gaps:
                st.json(gaps)

with tab_led:
    if df.empty:
        st.info("No rows in this range yet.")
    else:
        st.dataframe(df, use_container_width=True)

with tab_rev:
    rules = load_rules()
    st.caption(f"{len(rules)} learned rules")
    if df.empty:
        st.info("Nothing to review.")
    else:
        unclear = df[(df["category"] == "Uncategorised") | (df["confidence"].fillna(1) < 0.5)]
        for _, r in unclear.head(20).iterrows():
            cols = st.columns([3, 2, 1])
            cols[0].write(f"{r['date']} · {r['description']} · ₹{r['amount']}")
            cat = cols[1].selectbox("Category", CATS, key=r["fingerprint"], index=CATS.index(r["category"]) if r["category"] in CATS else len(CATS)-1)
            if cols[2].button("Save", key="s"+r["fingerprint"]):
                recategorise(r["fingerprint"], cat)
                save_rule(token_of(r["description"]), cat)
                remember("gap", f"{r['description']} → {cat}")
                st.rerun()

with tab_ex:
    if st.button("Write CA xlsx"):
        out = write_ca_pack(rows, Path("out") / "lekha.xlsx", ent.__dict__)
        remember("export", str(out))
        st.success(out)
        st.download_button("Download Excel", data=open(out, "rb").read(), file_name="lekha.xlsx")
    if st.button("Write CSV"):
        out = write_csv(rows, Path("out") / "lekha.csv")
        remember("export", str(out))
        st.download_button("Download CSV", data=open(out, "rb").read(), file_name="lekha.csv")
    st.caption(f"SQLite: {Path.home() / '.lekha' / 'books.sqlite'}")

st.subheader("Memory")
st.json(tail(20))
