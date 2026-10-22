# Customer invoice balance consistency — verified 2026-10-22

The verified document-email safety commit `2f31094` is pushed to `origin/main`. This follow-up implements the customer experience review's financial-facts consistency priority. It is saved locally, aligned with main's public-site update `7c22b44`. No app deployment or production change occurred.

## Result

The customer invoice payment summary already used the complete verified payment-principal receipt, while the full invoice below it received the original stored `balance_due_cents`. If that cache was stale, one page could show two different balances and an incorrect amount paid. A failing regression demonstrated a verified $300 balance alongside a $0 document input. A rendered browser fixture also exercises a $1,000 invoice with $400 received and an intentionally stale $1,000 stored balance.

The full customer invoice now receives a read-only copy with the same verified $600 balance used by payment review. Its paid line and repeated balance note therefore agree with the current summary. The lookup result and persisted invoice are not mutated. No additional read, financial command, reconciliation write, notification planning or provider call was introduced.

This is deliberately a narrow projection fix. Token lookup/rate limits still precede the privileged read. Missing or invalid principal receipts still show recovery help without a guessed balance, document or chooser. Pending, settled, void and inconsistent-paid states retain their existing collection restrictions. Refund/dispute calculations, overpayment clamping, invoice statuses, line items, fees, terms, staff documents and email snapshots are unchanged. Existing quote/change-order, employee, dashboard, scanner and delivery work is preserved.

## Verification

- **2,315 CRM checks passed**, zero failures/skips. Typecheck and isolated optimized build passed. There is no lint script. Final application source matches the preview and build, including after main's unrelated landscaping update was fast-forwarded without conflict.
- **13 installed-SQL cases locally and the same 13 in staging**, followed by actual React DOM rendering of the customer page and invoice components using those exported receipts. Cases include unpaid/partial/settled balances, refunded principal, lost/won disputes, overpayment, pending/failed Stripe records, inconsistent paid status, a legitimately voided invoice, organization billing and 1,005 successful payment rows with an embedded list capped at one. The void fixture uses the existing owner-authorized begin/finalize commands; no guard is bypassed.
- SQL fixtures run in one transaction and roll back. Before/after fingerprints of invoices, payments, tokens, checkout records, parties, Auth/accounts/roles, audit/notification/delivery records and settings match. Staging remains at **116 migrations**, with automatic sending and appointment-change notices OFF. No migration or persistent schema/grant/RLS change was needed.
- Staging receipt rendering runs locally against the exported synthetic results; the hosted staging app was not redeployed.
- Browser checks at **1280, 768 and 390px** showed $600 consistently in the partial-payment summary, full document and footer; the full document showed $400 paid. Settled and bank-processing mobile fixtures offered no second-payment chooser. Keyboard Tab reached Print or save invoice. No horizontal overflow or captured console warnings/errors occurred. No customer request/payment was submitted.
- Impeccable's design hook found no deterministic issues in the changed page. The incumbent design and print styles were preserved. Native PDF pagination, paper output, physical devices and real Stripe/mailbox behavior were not retested by this batch; the verified scope is rendered financial content and existing payment-state safeguards.

Staging security advisors match the baseline: 33 [no-policy informational findings](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), 79 [authenticated security-definer warnings](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and one existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#strengthening-your-users-passwords). No new privileged API was added.

## Preservation and follow-up

CRM production/staging published deploy IDs and hosting settings match the starting snapshots. There were no real provider calls, customer emails, production writes or credential changes. Only the task-owned test stack/preview were resumed and stopped; synthetic actors were disabled, volumes retained and the user's main development app/database left intact.

This follows the existing customer-experience roadmap rather than changing financial or contractual rules. A separate next customer acceptance step is print/save reliability across proposals, invoices and change orders, including real PDF pagination. Contract/payment/debris wording still requires the previously recorded owner decision before alteration.

Files: `src/app/portal/invoice/[token]/page.tsx`, `tests/customer-invoice-page.test.mjs`, its extracted `customer-invoice-fixture.mjs`, `tests/invoice-document-balance.integration.test.mjs`, and rollback verification `supabase/verification/invoice_display_principal.sql`. Machine-readable evidence: `staging/INVOICE_DOCUMENT_BALANCE_VERIFICATION_20261022.json`. Synthetic screenshots and private logs remain outside Git in `/Users/noelsierra/Documents/Codex/2026-10-22/invoice-document-balance/`.
