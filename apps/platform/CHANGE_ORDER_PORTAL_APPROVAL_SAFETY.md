# Customer approval of additional work

The next customer-communications priority after appointment notices is safe approval of change orders. This extends the existing customer-experience roadmap's closed-document states and secure-link recovery work. It does not introduce an account hub, new payment behavior or a separate delivery system.

Appointment notices were pushed to `main` as `896f0a898a4ff9498eb7e461f44d7ad385621bf4`, with skip-build markers. The independent About-page update on `main`, `9b5c127`, is also preserved. This new batch is saved locally pending a separate push request. Neither hosted application was deployed and production was not changed.

## Problem and resulting behavior

Previously, the server looked up a customer link and then called the general approval command with a change-order ID. Revocation or an office edit between those calls could invalidate what the customer had reviewed. Token usage was recorded in a separate request. Line-only edits also did not reliably invalidate a previously reviewed version.

Approval now submits the capability hash, a request identity, the reviewed timestamp and a digest of the customer-visible document to one service-only database command. It locks the job, change order and token in that order, then rechecks validity and the reviewed content after waiting. A changed, revoked, expired, closed or partially priced addition is rejected before scope is applied.

The original `approve_change_order` command still owns scope copies, projected job value and approval audit history. Its financial formulas and the existing invoice-attachment command are unchanged. Approval, token usage, the existing durable source event and the private request receipt commit together.

An identical retry returns the saved receipt without adding scope or changing the recorded authorizer. Unknown acknowledgement outcomes retain the browser's pending request identity; they never claim that approval failed to save. Definite rejections offer a refresh-and-review action. Browser session storage contains only request IDs, timestamps and digests, not the raw secure link or the authorizing name. Blocked storage falls back to page-local recovery.

The customer read uses a single, explicit projection and matching digest. Internal notes, cost estimates, employee identifiers, contact email addresses and encrypted capabilities are excluded. Intended organization approvers must still be active and match the contracting party.

## Customer experience

- Only sent, unexpired additions present decision controls.
- Approved, declined, cancelled and expired additions have accurate outcomes. Cancelled work no longer claims a customer response was received.
- Requested changes show that the office is reviewing them. Approval stays closed until the office reviews and sends an updated addition through the existing workflow.
- Invalid, expired or replaced links provide an office call action and instructions for obtaining a current link, without revealing record details.
- Existing customer colors, document content, original-quote separation, pricing and contact details are retained. Action messages announce their status, and the redundant form method causing a React hydration warning was removed.

The database also serializes application line edits against approval and blocks normal edits to approved scope. Existing invoice linking and idempotent application of approved work remain available. Trusted database maintenance retains its prior restore privileges; this is not a new app bypass.

## Files

| Area | Files |
| --- | --- |
| Transaction and access boundary | `supabase/migrations/20261022030436_bound_change_order_portal_approval.sql` |
| Customer read and approval action | `src/lib/data/change-orders.ts`, `src/lib/actions/change-orders.ts` |
| Pending request recovery | `src/lib/portal/change-order-response-attempt.ts` |
| Customer states and screen | `src/lib/portal/customer-states.ts`, `src/components/portal-change-order-actions.tsx`, `src/app/portal/change-order/[token]/page.tsx` |
| Tests | `tests/change-order-approval.test.mjs`, `tests/change-order-approval.integration.test.mjs`, `supabase/verification/change_order_portal_approval.sql` |
| Contract and inventory | Generated database types, schema manifest, staging deferred inventory and historic candidate inventory assertion |
| Existing test loader | Added the approval action's command dependency to `tests/source-event-handoff.integration.test.mjs`; existing assertions were retained |

## Verification

See `staging/CHANGE_ORDER_APPROVAL_VERIFICATION_20261021.json` for the safe result record.

The dedicated loopback-only database was replayed natively from all 106 migrations with seeds disabled. The primary local CRM/database were not reset. Its schema matches the generated contract.

- **2,209 CRM regression checks passed**, with no failures or skips; final typecheck and isolated optimized build passed.
- **34 rollback-only SQL assertions passed locally and in staging.** These cover scoped/private reads, service-only grants, exact replay, authorizer collision, closed and expired states, revoked/mismatched links, line-only edits, partial header/line pricing, organization approvers, audit/source-event counts, and the existing invoice-attachment behavior and amount.
- **Five native concurrency scenarios passed locally** using actual PostgREST/database transactions: simultaneous identical approvals, revocation while waiting for the job lock, a line edit winning during that wait, approval racing decline, and expired offers. The request-outcome/notification handoff unit tests independently verify that only confirmed receipts reach the existing durable sender.
- Rendered local screens were inspected at 1280px desktop and 390px mobile: open review, changes under review and unavailable-link recovery. No horizontal overflow was measured. Keyboard Tab reached the approval button from the name field. No browser approval was submitted; mutation verification used the action tests and native database/API scenarios.

Staging's exact native dry run contained only migration 106, no seeds or role scripts. Before/after fingerprints verify that existing payments, invoices, quotes, jobs, appointments, schedule events, communications, delivery history, Auth users, change orders, lines, applied scope and portal tokens are unchanged. Existing routines and their grants are unchanged. Synthetic fixtures were rolled back. Automated sending and appointment-change notices remain off in staging. No real provider call or customer email occurred.

The security advisor's existing 62 authenticated-command warnings and one Auth password-protection warning are unchanged. The only added informational finding is the intentionally private receipt table with RLS and no client policies or grants. References: [private-table RLS advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [authenticated command advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password-protection advisory](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Private local evidence is under `/Users/noelsierra/Documents/Codex/2026-10-21/crm-next-priority/`: `open-review.png`, `open-mobile.png`, `waiting-mobile.png`, `unavailable-mobile.png`, build/typecheck/regression logs and native transaction proofs. Screenshots use synthetic records. Token-bearing fixture indexes, local credentials and private staging fingerprints remain outside Git.

## Release boundary and next priority

Staging verification covers the new database behavior; its hosted app remains at the previous release, so this batch does not claim hosted UI acceptance. Production remains on migration 102 and the same published deploy. Existing production scanning and automatic email settings were not changed. Migrations 103–106 and the new application code still require a separately authorized release; installing this migration alone does not switch the old hosted approval action to the new command.

The office change-order editor still saves headers and lines in multiple requests. The new approval boundary rejects mismatched line/header prices and any document that changed since review, but it does not make the editor itself atomic. **The recommended next implementation is atomic change-order draft editing with revision checks and retry recovery**, reusing the established quote/invoice command patterns. Keep it in the existing transaction-safety roadmap. Authoritative contract/payment/debris wording, PDF/mail-client acceptance and other previously recorded customer-experience follow-ups remain separate; no business terms or fees were changed here.
