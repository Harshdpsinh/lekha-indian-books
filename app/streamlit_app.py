from pathlib import Path
import sys

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import streamlit as st
import pandas as pd
from lekha.extract import extract
from lekha.gaps import find_gaps
from lekha.config import Entity
from lekha.excel import write_ca_pack, write_csv
from lekha.memory import remember, tail
from lekha.db import upsert_rows, load_rows, load_rules, save_rule, recategorise
from lekha.pdf import read_upload, institution_of, NeedPassword
from lekha.vault import load as vault_load
from lekha.spend import token_of, CATS

st.set_page_config(page_title="Lekha", layout="wide")
st.title("Lekha — Indian books")
st.caption("Upload bank, cards, UPI, GST, purchases and bills on separate tabs. PDF passwords live in ~/.lekha/pdf_tries.txt")

ent = Entity()
missing = ent.validate()
if missing:
    st.warning("Fill " + ", ".join(missing) + " in .env")

if "vault" not in st.session_state:
    st.session_state.vault = {}
if "pw_cache" not in st.session_state:
    st.session_state.pw_cache = {}

TRIES = Path.home() / ".lekha" / "pdf_tries.txt"
SEED = ["gohi0708", "GOHI0708", "HARS0708", "hars0708", "070819941994", "HARS070894"]

def load_tries() -> list[str]:
    TRIES.parent.mkdir(parents=True, exist_ok=True)
    if not TRIES.exists():
        TRIES.write_text("\n".join(SEED) + "\n", encoding="utf-8")
    return [ln.strip() for ln in TRIES.read_text(encoding="utf-8").splitlines() if ln.strip()]

def save_tries(lines: list[str]) -> None:
    TRIES.parent.mkdir(parents=True, exist_ok=True)
    uniq = []
    for x in lines:
        x = x.strip()
        if x and x not in uniq:
            uniq.append(x)
    TRIES.write_text("\n".join(uniq) + ("\n" if uniq else ""), encoding="utf-8")

tries = load_tries()

LANES = [
    ("Bank", "bank", "HDFC / Axis / ICICI / SBI / Kotak e-statements"),
    ("Cards", "credit_card", "Credit card bills"),
    ("UPI", "upi", "PhonePe, GPay, Paytm"),
    ("Sales GST", "gst_invoice", "Outward tax invoices"),
    ("Purchases", "purchase", "Inward invoices for ITC"),
    ("Utilities", "utility", "BESCOM, Airtel, Jio"),
    ("Investments", "investment", "Groww, CAMS, PPF, LIC"),
    ("Salary", "salary", "Form 16 / payroll"),
]

with st.sidebar:
    st.subheader("Range")
    fy = st.selectbox("FY", ["all", "2025-26", "2026-27", "2027-28"], index=2)
    month = st.text_input("Month YYYY-MM (or all)", "all")
    start = st.date_input("From", value=None)
    end = st.date_input("To", value=None)
    st.subheader("PDF passwords")
    st.caption("Tried on every locked statement. Saved in ~/.lekha/pdf_tries.txt")
    edited = st.text_area("One per line", value="\n".join(tries), height=140)
    if st.button("Save passwords"):
        save_tries(edited.splitlines())
        st.success("Saved")
        st.rerun()
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
uncat = int(((df["category"] == "Uncategorised") | (df.get("confidence", 1) < 0.5)).sum()) if not df.empty else 0

c1, c2, c3, c4 = st.columns(4)
c1.metric("Turnover (credits)", f"\u20b9{credits:,.2f}")
c2.metric("Outflows", f"\u20b9{debits:,.2f}")
c3.metric("Net", f"\u20b9{(credits-debits):,.2f}")
c4.metric("Uncategorised", uncat)

names = [l[0] for l in LANES] + ["Ledgers", "Review", "Export"]
tabs = st.tabs(names)

def ingest_files(files, hint: str, key_pw: str):
    if not files:
        return
    extra = st.text_input("Extra password if a file still fails", type="password", key=key_pw)
    live = load_tries()
    for f in files:
        inst = institution_of(f.name).lower()
        mapped = st.session_state.pw_cache.get(inst) or st.session_state.vault.get(f"docpw:{inst}")
        passwords = [p for p in [extra, mapped] + live if p]
        try:
            text = read_upload(f.name, f.getvalue(), passwords)
        except NeedPassword:
            st.error(f"{f.name} still locked — add the password in the sidebar and re-drop.")
            continue
        except Exception as e:
            st.error(f"{f.name}: {e}")
            continue
        result = extract(text, f.name, ent.gstin, load_rules(), hint=hint)
        added, skipped = upsert_rows(result["rows"])
        remember("ingest", f"{f.name}: {added} new, {skipped} skipped")
        if extra:
            st.session_state.pw_cache[inst] = extra
            save_tries(live + [extra])
        st.success(f"{f.name}: {added} new · {skipped} duplicate skipped via {result['meta']['parser']}")
        gaps = find_gaps(result["rows"])
        if gaps:
            st.json(gaps)

for i, (label, hint, help) in enumerate(LANES):
    with tabs[i]:
        st.write(help)
        files = st.file_uploader("Drop files", type=["pdf", "txt", "csv", "xlsx", "xls"], accept_multiple_files=True, key="up_"+hint)
        ingest_files(files, hint, "pw_"+hint)

with tabs[len(LANES)]:
    if df.empty:
        st.info("No rows in this range yet.")
    else:
        st.dataframe(df, use_container_width=True)

with tabs[len(LANES)+1]:
    rules = load_rules()
    st.caption(f"{len(rules)} learned rules")
    if df.empty:
        st.info("Nothing to review.")
    else:
        unclear = df[(df["category"] == "Uncategorised") | (df["confidence"].fillna(1) < 0.5)]
        for _, r in unclear.head(20).iterrows():
            cols = st.columns([3, 2, 1])
            cols[0].write(f"{r['date']} · {r['description']} · \u20b9{r['amount']}")
            cat = cols[1].selectbox("Category", CATS, key=r["fingerprint"], index=CATS.index(r["category"]) if r["category"] in CATS else len(CATS)-1)
            if cols[2].button("Save", key="s"+r["fingerprint"]):
                recategorise(r["fingerprint"], cat)
                save_rule(token_of(r["description"]), cat)
                remember("gap", f"{r['description']} → {cat}")
                st.rerun()

with tabs[len(LANES)+2]:
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
