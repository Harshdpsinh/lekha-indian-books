# Lekha — local Indian books

**This is a new public repo, not inside your older projects.**

Open it here: https://github.com/Harshdpsinh/lekha-indian-books

It is **not** in `nifty-btst-bot`, `plan-one-pager`, `gohil-mf-studio`, or `gohil-investments`.

## Download the files (no git needed)

1. Open https://github.com/Harshdpsinh/lekha-indian-books
2. Click the green **Code** button → **Download ZIP**
3. Direct zip: https://github.com/Harshdpsinh/lekha-indian-books/archive/refs/heads/main.zip
4. Unzip. Folder will be named `lekha-indian-books-main`.

## Run on Windows desktop

1. Install [Python 3.10+](https://www.python.org/downloads/) and tick **Add python.exe to PATH**.
2. Double-click `START-HERE.bat`.
3. Streamlit opens in the browser. Drop bank / card / UPI / GST PDFs in Inbox.

Fill `.env` from `.env.example`. Never put passwords in source files.
Books accumulate in `%USERPROFILE%\.lekha\books.sqlite`. Re-uploads skip duplicates.

## macOS / Linux

Double-click `run_app.sh`, or:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
streamlit run app/streamlit_app.py
```

## What it does

- Ingests PDF / Excel / CSV immediately. Password PDFs prompt once; the password is stored encrypted, keyed by institution (hdfc, axis, cams…).
- Extracts sales, expenses, GST splits, TDS, dividends, capital gains, investments.
- Accumulates into SQLite. Re-uploads skip duplicates.
- Dashboard: FY, month, date range. Turnover, deductible, P&L, GST output vs ITC, 80C/80D, TDS.
- Review queue for uncategorised lines; assignments become rules.
- Export Excel (CA pack) and CSV.

Demo GSTIN is a fixture. Do not file GSTR-3B without matching GSTR-2B.
