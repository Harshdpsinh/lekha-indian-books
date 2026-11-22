# Lekha accounting and security audit — 2026-11-22

Scope: `Harshdpsinh/lekha-indian-books`, initial source-only inspection. Production and existing data are unchanged. No accounting balances have been reconciled or certified.

## Requirements to preserve (from previous project discussion)
- Single-user local Windows and hosted online operation, without deleting current features
- Import monthly bank / credit card statements and invoices in PDF, CSV, XLS/XLSX, including password-locked PDFs
- Support 6–15 accounts, bank/card reconciliation, manual reviews, duplicate and version handling
- Master-password encrypted per-institution document passwords, no recoverable passwords in public code
- Separate personal and GST business entities/books, with a clearly labelled combined dashboard
- GST sales and purchase register, GSTR-1/3B preparation support and GSTR-2B reconciliation; no filing without external validation
- Transparent categorisation, audit logs, undo/reversal, CA exports, reliable historic data and backups

## Source evidence and findings
1. CRITICAL — `app/streamlit_app.py` contains hardcoded example/real-looking password candidates (`SEED`) and `~/.lekha/pdf_tries.txt` plaintext password persistence. Branch change removes hardcoded seeds and warns about legacy plaintext. **Still unresolved:** encrypted password save/migration and deletion of legacy plaintext only after explicit backup/consent. Existing local files are not changed.
2. CRITICAL — `lekha/vault.py` original writes `salt` and `vault.bin` separately; crash between writes makes legacy secrets inaccessible. Branch change adds v2 single-file, atomic encrypted vault with backwards-compatible legacy reader and tests. Preserve backups and verify on Windows.
3. HIGH — `lekha/db.py:fingerprint` uses date, direction, amount and the first 48 characters of description, but no account, source transaction reference, or document line. Valid same-day duplicate-looking transactions across accounts may be dropped; true repeated lines may also collide. Fix with account-scoped stable transaction IDs and a reversible migration for old keys.
4. HIGH — `app/streamlit_app.py` labels all credits turnover and credits minus debits net, including transfers, card settlement, loans, tax payments and investments. Never present those as accounting turnover or P&L until exclusion and double-entry accounting are implemented.
5. HIGH — `lekha/db.py` transaction schema lacks legal entity, account ledger, journal lines and posting status; business/personal separation cannot be enforced.
6. HIGH — `lekha/excel.py` exports one flat register and groups amounts by category; category total is not reliably deductible expenditure or a balanced trial balance.
7. HIGH — `lekha/spend.py` matches `neft cr`, `rtgs cr` and `received from` as Revenue, regardless of whether receipts are loans, transfers, refunds, personal receipts or genuine sales. Require review/evidence before recognition.
8. HIGH — GSTIN in `lekha/config.py` is validated only by length; GST registration, state code, taxable value, rates, eligible ITC, reversals, RCM and GSTR-2B reconciliation require additional source-backed validation.
9. MEDIUM — `lekha/pdf.py` rejects scanned PDFs, and spreadsheet handling turns worksheets into text with potential loss of account/source context.
10. MEDIUM — Online deployment requires authentication, database persistence, encryption key lifecycle, backups, HTTPS, upload limits and multi-book isolation; none should be assumed from local Streamlit operation.

## Phased non-destructive plan
**P0 Security and data integrity:** secure vault migration, redacted logging, permission checks, stable backups, account-aware import fingerprint, provenance metadata and migration tests.
**P1 Accounting core:** multi-entity chart of accounts, journal posting with debit=credit, transfers, card settlements, cash/bank reconciliation, locked periods, corrections and audit logs.
**P2 Import quality:** adapters per bank/card layout, encrypted PDFs, source row provenance, statement totals, duplicates, refunds, partial payments and confidence-based review.
**P3 GST and tax:** invoice-level GST tables with document references, GSTR-2B matching, ineligible ITC/RCM handling, GST rate and return versioning with review-only filing outputs.
**P4 Reports:** entity-specific and combined views (clearly non-consolidated if just aggregated), trial balance, bank reconciliation, P&L, balance sheet, tax summaries, and CA evidence exports.
**P5 Deployment:** local-first private encrypted storage, authenticated hosted alternative, backup/restore, CI static checks, unit/integration/Playwright tests.

## Verification / completion status
- [x] Accessible repo located and core modules reviewed
- [x] No change to `main` or existing accounting database
- [x] Atomic v2 vault code and backward-compatibility regression test added on audit branch
- [x] Hardcoded password candidates removed from new installs on audit branch
- [ ] Tests executed in CI or on real Windows installation
- [ ] Existing encrypted vault migration tested against user's actual backup
- [ ] Accounting journal and reconciliation implemented and verified
- [ ] GST reconciliation and tax rules implemented and checked against official source records
- [ ] Hosted deployment and Playwright tests
- [ ] User review and merge to `main`

## Assumptions and open questions
- Treat all imports and classifications as provisional until account/entity and source transaction are identified.
- Never automatically drop, migrate, alter or overwrite an existing books.sqlite file or passwords.
- A combined dashboard is a view across personal and business ledgers, not necessarily an accounting consolidation.
- No actual statement sample or GST purchase/sales invoice has been validated in this audit.
- The current data model cannot confirm P&L, turnover, deductible expense, GSTR-3B or GST liability accurately.
