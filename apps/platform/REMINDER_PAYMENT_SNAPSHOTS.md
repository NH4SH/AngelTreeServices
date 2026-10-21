# Complete reminder payment snapshots

October21, 2026. The verified email package `005e27b` is pushed to main and its preserved branch with deployment skipped. This follow-up is on `codex/reminder-payment-snapshots`, retaining all preceding CRM/dashboard/customer changes.

## Change

The communication processor's shared current-invoice-balance read now calls the existing validated `getSuccessfulPaymentTotal` helper. It no longer downloads and sums a possibly capped payment list. Ordinary reminders, overdue reminders and payment receipts' remaining balances share that path. Individual payment/fee/total-collected amounts and the financial formula remain unchanged.

The installed migration97 RPC returns one complete successful-payment principal/count receipt, with refunds, lost disputes and the existing zero clamp. The helper checks the invoice identity, integer/count/amount bounds and acknowledgement, with its existing five-second abort deadline. An unavailable/malformed/denied/missing receipt stops preparation, creates no guessed-zero amount, sends nothing and does not automatically retry. Invalid source totals also stop before the read. A settled or overpaid invoice still cancels the reminder rather than prompting payment.

This is a read replacement, not a new invoice/payment transaction. Existing source snapshots, immutable delivery preparation and dispatch-time validation remain responsible for source changes and concurrent edits. Queue planning, recipients, authorization/RLS, claims, request/provider identities, retry policy, webhook recovery, history repair and the new email presentation are preserved. No SQL, grants, migrations, credentials, dependencies or environment settings changed.

## Verification

- **2,161 regular local results passed**, zero failures/skips, including 12 new actual-processor/helper tests for complete receipts, settled/overpaid histories, receipt balances, bad totals, malformed/missing/denied data, wrong invoice, transport errors and timeout/no retry.
- **10 installed-SQL scenarios / 11 TAP results passed**. Actual migration97 receipts from 1,005-row histories drive the actual processor/helper; refunds/lost/won/overlapping adjustments, stale settled reminders, pending principal, payment receipts, denied roles/end-user subjects and missing invoices are checked. Fixtures are rolled back; no provider call or schema change.
- **26 disposable delivery scenarios / 27 TAP results passed** after adapting the existing test dependency to the real snapshot helper, retaining real local Auth/RLS, concurrency, frozen payload, provider evidence and no-send recovery checks.
- Node22.23.3 isolated synthetic typecheck/build passed. Final source fingerprints match the built copy. No production variables, linked site or credentials were copied into verification.
- The broader legacy PR10 provider/photo suite passed its payment/delivery cases but **one photo cleanup scenario failed**: metadata/audit rolled back, while one private Storage object remained instead of the test's expected deletion. The parent reports failure too (12 passed / 2 failed TAP results for one failed scenario). The financial read change does not touch upload code. Do not suppress or relabel this as a passing full suite. It is an explicit production-release blocker pending a focused cleanup/retention and truthful-error review; no production object was involved or deleted.

Existing memory-only queue fixtures model the new helper contract while preserving their legacy synthetic IDs. Installed-database fixtures use the real existing helper and real UUIDs. No test changes the production receipt validation to accommodate synthetic IDs.

Files: communication processor; two memory-only and two installed-database test adapters; memory principal fixture; focused snapshot fixture/tests/integration. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-21/reminder-payment-snapshots/`.

## Release state

The owner subsequently authorized pushing/deploying the remaining CRM work. Read-only release checks confirm production still has65 migrations, lacks the principal RPC/outbox, has two open checkout records and one pending communication. Staging has100 migrations with the principal RPC, zero Auth/business/Storage records and automation/scanning OFF. The complete application cannot be deployed against production65. No production/staging schema or runtime was changed during this follow-up.

Full release remains pending the existing coordinated database/application cutover, backup/restore and hosted staging/scanner acceptance, plus the newly observed photo cleanup check. The owner requested step-by-step home Mac instructions; see HOME_MAC_SCANNER_FIRST_SESSION.md. These are concrete remaining prerequisites, not a request to repeat the deployment authorization. See CRM_PRODUCTION_RELEASE_PLAN_20261021.md for the sequence.
