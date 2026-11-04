# Lekha: Vercel + Google Drive only (no Supabase)

This is a **separate experimental website prototype** responding to the owner's decision to remove Supabase. The public-facing preview displays **synthetic accounting figures only**, with seven navigable views: Dashboard, Transactions, Sales, Purchases, GST Reconciliation, Commission & TDS and Month-End / CA. It does not change or delete the legacy Streamlit source or existing Supabase-backed website under `web/`.

## Architecture

- Vercel hosts the Next.js site. It is stateless and keeps no financial records on its local filesystem.
- Google OAuth identifies exactly one allowlisted user.
- Google Drive **appDataFolder** stores each append-only ledger record as its own AES-256-GCM encrypted file.
- The encryption key is a 32-byte **server-side secret**, never exposed to the browser. Each record uses a random IV and authentication tag.
- Every read/decrypt happens in an authenticated server route. There are no service-account keys or public ledger routes.
- App data is not visible as ordinary files in My Drive. Future visible monthly ZIP archive support must use a separately authorized scoped folder; do not promise that it works already.
- This model avoids an external SQL database but is significantly less scalable than PostgreSQL. It is suitable only for a small single-user prototype; it requires load testing, data integrity review, Drive quota monitoring, backup/restore verification, and accountant review before any real financial use.
- Because the encrypted records **live in Drive**, a separate backup copy/independent recovery strategy remains mandatory; using Drive as both primary storage and 'backup' is not real redundancy.

## Not yet implemented in this branch

Automated GSTR-2B file matching, bank-to-invoice reconciliation, full PDF parser migration/import, robust audit/change workflows, remote disaster recovery, and browser/end-to-end tests. A **GST/CA dashboard with sample data** and Excel/ZIP **register exports** are now implemented, but not a certified accounting system; source document PDFs are not included in ZIP. The code in `web/` contains earlier prototypes of some features but uses Supabase and is **not automatically compatible** with this design.

## Deployment prerequisites

1. Create Google Cloud OAuth credentials under a project you own. Enable Google Drive API; configure the OAuth consent screen and redirect URI `https://<your-vercel-domain>/api/auth/callback/google`. Request Drive appData scope and offline refresh tokens. The auth provider may require test-user registration or Google verification depending on publishing mode and scopes.
2. Set Vercel **encrypted** environment secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `LEKHA_ALLOWED_EMAIL`, `LEKHA_ENCRYPTION_KEY` (base64-encoded 32 bytes) for the private preview deployment.
3. Select project root **drive-web**.
4. Avoid a production deployment until access, cost/plan compliance, encryption recovery and testing are verified.
5. Never post OAuth keys, Drive refresh tokens or encryption secrets into chat or GitHub.

## Hosting cost limitation

**Vercel Hobby is for personal/non-commercial use only.** Since Lekha manages real business records, do not run it commercially on Hobby. If strict zero cost and commercial use are both nonnegotiable, Vercel's Hobby plan does not satisfy both requirements. A non-commercial technical preview may be eligible; verify your plan terms first.

## Build

`npm install && npm run typecheck && npm run build`

## Data recovery warning

Losing `LEKHA_ENCRYPTION_KEY` permanently makes all encrypted ledger entries unreadable. Rotate/change keys only with a tested migration. Do not claim that Drive alone is a full backup.

## Private financial documents (added)

- An authenticated **Documents** screen accepts multiple PDF, XLS, XLSX and CSV files with a category and accounting month. Files are checked for basic signatures and file size (2 MiB maximum each) and encrypted with **AES-256-GCM** on the Vercel server before upload to Google Drive `appDataFolder`. File contents and original filenames reside inside the encrypted blob; Drive only sees a generated file ID and month in the storage filename.
- Document upload/list/download is available through authenticated `/api/documents` and `/api/documents/[id]` routes. Download decrypts and SHA-256-verifies the file server-side, and sets no-store/nosniff headers. Month-end CA ZIP includes uploaded original documents and a document index **once the private Drive account is connected**. Downloaded ZIP is plaintext, not encrypted.
- Uploading a PDF or statement currently only stores a document for review. **It does not yet extract transactions or reconcile records automatically.** Password-protected PDFs are stored as encrypted files but their contents are not decrypted or imported. Real files have not yet been tested with an authorized Google account.
- **Operational limitations**: Vercel's request body constraints mean 2 MiB max per file for this initial server-side upload. A larger-file architecture needs an alternative direct encrypted client upload flow. Google Drive OAuth credentials and encryption key must be configured before live documents can be saved; the public demo deliberately disables uploads.
- In the Drive model, source files are encrypted, but Drive remains primary storage. A separate backup/restore procedure is still necessary.
