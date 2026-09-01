# Lekha — local Indian books

CA-ready extraction for Indian bank PDFs, cards, UPI, GST invoices and utility bills.
Runs entirely on your machine. Secrets live in `.env` and `~/.lekha/vault.bin`.

## Double-click launch (desktop)

1. Install [Python 3.10+](https://www.python.org/downloads/) and tick **Add python.exe to PATH**.
2. Download this repo as ZIP (green **Code → Download ZIP**) or clone it.
3. Unzip. On **Windows** double-click `START-HERE.bat`. On **macOS/Linux** run `sh run_app.sh`.

The script creates a virtualenv, installs packages, copies `.env.example` → `.env`, and opens Streamlit in your browser.

## What it does

- Ingests PDF / Excel / CSV immediately. Password PDFs prompt once; the password is stored encrypted per institution (hdfc, axis, cams…).
- Extracts sales, expenses, GST splits, TDS, dividends, capital gains, investments.
- Accumulates into SQLite at `~/.lekha/books.sqlite`. Re-uploads skip duplicates.
- Dashboard: FY, month, custom date range. Turnover, deductible, P&L, GST output vs ITC, 80C/80D, TDS.
- Review queue for uncategorised lines; assignments become rules.
- Export Excel (CA pack) and CSV.

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
streamlit run app/streamlit_app.py
```

Never commit `.env`. Fill `OWN_GSTIN` / `OWN_PAN` before filing anything.
