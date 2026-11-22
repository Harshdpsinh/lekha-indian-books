# Lekha Web — Vercel-first development preview

This directory is a **new Next.js frontend** alongside the existing Windows/Streamlit accounting project. It is intentionally **not** deployed and is **not production ready**. Never upload sensitive real financial data until production security and accounting acceptance tests pass.

## What works in this preview (code added, not yet end-to-end tested)
- Email/password sign-in with Supabase Auth (no public registration form).
- Responsive monthly dashboard for personal/business transaction summaries and GST invoice totals.
- Private file upload to Supabase Storage and metadata in Postgres with per-owner RLS.
- Browser-side CSV/XLSX and text-based PDF statement parsing (PDF.js); password-protected PDFs can be opened using an ephemeral document password. Unknown layouts/scanned PDFs are flagged for review. These are preliminary parsers, not bank-specific certified imports.
- Manual sales/purchase invoice register, basic GST totals, manually updated receipts, **CSV/XLSX GSTR-2B matching by GSTIN + invoice number + tax amount**, and commission/GST/TDS payout difference tracking (requires 002_commission_settlements.sql).
- Review queue and month-wise downloadable ZIP containing source documents and an Excel CA pack.

## Not done yet (do not describe as complete)
- Robust bank/card-specific PDF parsing across real institution layouts, scanned PDF OCR and full source-balance reconciliation. The browser-side **generic text PDF** parser currently supports only recognized column patterns.
- Institution-specific statement formats, historical opening/closing balance matching and end-to-end transfer/card settlement reconciliation.
- Direct GST portal integration and validated tax calculations. Basic invoice matching to **user-uploaded** GSTR-2B CSV/XLSX exists, but must be independently verified and cannot detect all statement formats.
- TDS/GST deduction recovery and insurer/commission-payer-wise expected/received settlement matching.
- Background worker, job queue/retries, large files, scale, document encryption at rest under user-controlled keys.
- Password vault cloud migration and production-verified unattended encrypted Google Drive backup. A scheduled backup script and workflow have been added in `../cloud_backup/`, but require separate secure cloud credentials and a successful restore drill before activation can be claimed.
- Accountant-grade financial accuracy, tax filing certification, robust duplicate detection of repeated identical same-day transactions.
- Automatic cloud deployment and live production verification. The old Windows watcher only protects local SQLite, **not** Supabase.

## Free-tier setup (manual account connection required)
1. Create a personal **Supabase Free** project. In SQL Editor run `supabase/schema.sql`, then `supabase/002_commission_settlements.sql`.
2. In Supabase Authentication settings disable public signups and create/invite the single authorized user through the admin console. Verify this user can sign in before uploading test data.
3. Get **Project URL** and **publishable/anon** key from Supabase. The service-role key must never be placed in a NEXT_PUBLIC environment variable.
4. Create a Vercel Hobby project connected to this GitHub repository. Choose **Root Directory = web** and **Framework = Next.js**. Use a preview branch, not the production environment.
5. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the Vercel project's environment settings.
6. Deploy the branch and test with **synthetic/redacted** sample data. Check RLS isolation, import errors, duplicate handling and ZIP exports.
7. To work locally inside `web`: `npm install`, `npm run lint`, `npm run dev`.

Free plans have rate, storage, project-inactivity and execution limits. **Vercel Hobby usage terms restrict it to personal, non-commercial projects; the business/GST product may require a different compliant hosting plan/provider.** Never assume guaranteed ₹0 or use a business production workload on an ineligible plan. Never connect a paid subscription without user consent.

## Limitations requiring review
- The generic statement importer assumes CSV/XLSX tabular rows with a header row. Files lacking clear debit/credit columns may be misinterpreted. Treat imports as drafts.
- Transaction fingerprints may collapse identical purchases without a unique reference; a reconciled bank statement and source balance must be the source of truth.
- 5,000 transaction and 1,000 document display limits are provisional; pagination is required.
- Monthly ZIP is downloaded as **plaintext** after fetching private source files. Protect it locally.
- Store OAuth credentials/secrets in appropriate server-side secret storage. Never commit them.
- Browser parses supported PDFs at upload time only; errors are marked needs-review, with no automatic queued retry. PDF statement password is not stored or sent to a service. Background processing and secure vault are separate milestones.
- Synthetic test coverage includes PDF text layout parsing and encrypted cloud backup round-trip; **real bank PDFs, real cloud credentials, full browser/E2E workflows and production recovery are not yet verified**.

The owner has authorized development across the full roadmap under Issue #2, but **deploying live financial data still requires external Supabase/Vercel account connections and completed safety/accuracy gates**.

## Yearly PDF/Excel and Indian FY reporting (November 2026)
- The private Upload Center accepts multiple PDF, CSV, and XLSX statements. Supported **text-based** bank PDF rows are parsed in the browser with optional per-upload PDF password, never stored. Unknown layouts, scanned PDFs and ambiguous entries are placed in review; bank-specific production acceptance remains outstanding.
- A multi-month/annual source is indexed to all transaction months; apply `supabase/003_document_periods.sql` before using this feature. Source statement PDF/XLSX remains in private Supabase Storage (not on Vercel filesystem).
- The Yearly Overview shows **Indian financial year (April–March)** or calendar year (January–December), month-wise and category-wise income/expenses. You can edit imported transaction categories and persist them to the cloud ledger.
- Download annual PDF and Excel reports directly from that screen; month-end ZIP includes source files and the monthly CA workbook.
- Accounts, transactions, documents and document-period indexes require Supabase credentials and migrations. **Vercel deployment without these env values only displays a setup screen, and cannot save data yet.** Do not treat deployment as proof of durable data persistence.
- Free Vercel Hobby currently restricts use to personal/non-commercial projects; business or commercial deployment eligibility must be checked independently. No automatic paid upgrade.
