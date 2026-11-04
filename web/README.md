# Lekha Web — Vercel-first development preview

This directory is a **new Next.js frontend** alongside the existing Windows/Streamlit accounting project. It is intentionally **not** deployed and is **not production ready**. Never upload sensitive real financial data until production security and accounting acceptance tests pass.

## What works in this preview (code added, not yet end-to-end tested)
- Email/password sign-in with Supabase Auth (no public registration form).
- Responsive monthly dashboard for personal/business transaction summaries and GST invoice totals.
- Private file upload to Supabase Storage and metadata in Postgres with per-owner RLS.
- Browser-side import of CSV/XLSX with recognized date/description/debit/credit headers; imports require manual accuracy checks.
- Manual sales/purchase invoice register, basic GST totals, manually updated receipts and manually recorded GSTR-2B status.
- Review queue and month-wise downloadable ZIP containing source documents and an Excel CA pack.

## Not done yet (do not describe as complete)
- Automatic parsing of bank/card PDF statements, including password-protected files.
- Institution-specific statement formats, historical opening/closing balance matching and end-to-end transfer/card settlement reconciliation.
- GST portal or GSTR-2B data ingestion, automated ITC matching and validated tax calculations.
- TDS/GST deduction recovery and insurer/commission-payer-wise expected/received settlement matching.
- Background worker, job queue/retries, large files, scale, document encryption at rest under user-controlled keys.
- Password vault cloud migration and unattended encrypted Google Drive backup of Postgres and uploaded documents.
- Accountant-grade financial accuracy, tax filing certification, robust duplicate detection of repeated identical same-day transactions.
- Automatic cloud deployment and live production verification. The old Windows watcher only protects local SQLite, **not** Supabase.

## Free-tier setup (manual account connection required)
1. Create a personal **Supabase Free** project. In SQL Editor run `supabase/schema.sql`.
2. In Supabase Authentication settings disable public signups and create/invite the single authorized user through the admin console. Verify this user can sign in before uploading test data.
3. Get **Project URL** and **publishable/anon** key from Supabase. The service-role key must never be placed in a NEXT_PUBLIC environment variable.
4. Create a Vercel Hobby project connected to this GitHub repository. Choose **Root Directory = web** and **Framework = Next.js**. Use a preview branch, not the production environment.
5. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the Vercel project's environment settings.
6. Deploy the branch and test with **synthetic/redacted** sample data. Check RLS isolation, import errors, duplicate handling and ZIP exports.
7. To work locally inside `web`: `npm install`, `npm run lint`, `npm run dev`.

Free plans have rate, storage, project-inactivity and execution limits. Never assume guaranteed ₹0 for unlimited usage. Never connect a paid subscription without user consent.

## Limitations requiring review
- The generic statement importer assumes CSV/XLSX tabular rows with a header row. Files lacking clear debit/credit columns may be misinterpreted. Treat imports as drafts.
- Transaction fingerprints may collapse identical purchases without a unique reference; a reconciled bank statement and source balance must be the source of truth.
- 5,000 transaction and 1,000 document display limits are provisional; pagination is required.
- Monthly ZIP is downloaded as **plaintext** after fetching private source files. Protect it locally.
- Store OAuth credentials/secrets in appropriate server-side secret storage. Never commit them.
- Browser does not retain PDFs to parse later automatically; background processing is a separate milestone.

The owner has authorized development across the full roadmap under Issue #2, but **deploying live financial data still requires external Supabase/Vercel account connections and completed safety/accuracy gates**.
