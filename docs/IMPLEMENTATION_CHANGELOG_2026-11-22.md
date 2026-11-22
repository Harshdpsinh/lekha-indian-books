# Lekha implementation log — 2026-11-22

Repository: https://github.com/Harshdpsinh/lekha-indian-books
Branch: feature/accounting-ledger-gst-recon-2026-11
PR: https://github.com/Harshdpsinh/lekha-indian-books/pull/6
State: draft; main and historical local books.sqlite untouched.

## Requested decision
Do accounting upgrades **without new password encryption**. Existing vault code is untouched in this branch. Existing local plaintext password file is not deleted. Hardcoded password guesses were removed from source, and the app now warns that its plaintext password storage is unsafe for a publicly hosted site. If any prior source credentials were genuine, rotate them.

## Change log
| Timestamp | Reference | Action | Before | After / result |
|---|---|---|---|---|
| 2026-11-22 | lekha/accounting.py | Add isolated bookkeeping data model | Legacy txns with no entity/account journals | New books, chart of accounts, balanced immutable journal entries, optional reversals, closing months, audit table; additive tables only |
| 2026-11-22 | lekha/accounting.py | Add source-preserving statement staging | Legacy row fingerprint could collide across accounts | File-hash duplicate checking scoped to book/account, individual lines retained pending review; old importer unchanged |
| 2026-11-22 | lekha/accounting.py | Add GST invoice matching | No independent 2B comparison table | Local supplier/invoice/amount comparison and review status; does NOT certify tax credits |
| 2026-11-22 | app/pages/1_Accounting_Workbench.py | Add optional UI page | Existing bank/GST upload tabs | Separate workbench without removing the existing pages |
| 2026-11-22 | app/streamlit_app.py | Remove published sample password candidates and correct labels | Source-defined candidates; total credits labelled turnover | No seeded candidates for new installations; credits correctly labelled as bank movements |
| 2026-11-22 | tests/test_accounting.py | Add regression cases | No new-model test suite | Tests for balance, reversals, entity isolation, file duplicates, GST reconciliation, date cutoffs, fractional paise |
| 2026-11-22 | .github/workflows/accounting-tests.yml | Configure CI | No accounting-specific CI | Python compile + unittest workflow configured, execution not yet confirmed |

## Accounting assumptions and judgment calls
- A book denotes an isolated personal or business ledger; combined dashboards are informational only until inter-book eliminations are designed.
- Imported bank/credit-card transactions are source records, not income, expenses or journal postings until reviewed.
- Matching GSTR-2B establishes document correlation, not legal eligibility or the amount claimable as ITC.
- Monetary journal amounts use integer paise, not floating point.
- Existing imported records are never rewritten by the additive engine.
- No tax or GST filing, password encryption or automatic password migration was performed.

## Outstanding verification and work
- GitHub Actions test execution and real Windows Streamlit browser tests not yet confirmed
- Vercel deployment statuses are not verified as ready; hosted Streamlit with persistent SQLite is not assumed suitable
- Bank-specific PDF formats (including password-protected and scans), statement total reconciliation and Excel account mapping
- Link imported lines to journal postings from UI; implement richer many-to-many bank/invoice reconciliation
- Invoice file ingestion, GSTR-2B official file import and tax-rule/ITC validation including reversals, RCM and ineligible ITC
- P&L, balance sheet, cash flow and CA pack rebuilt from posted balanced journal entries
- Backup/restore tools and tested migration of old local transaction rows to book-specific staging records
- Authentication and isolated persistent database for online hosting
- Tests against actual sample statements, invoices and financial periods

## User attention
When real-world testing begins, use **redacted or test** statement examples first. Never upload plaintext statement passwords to a public deployment. Review the PR before merging.
