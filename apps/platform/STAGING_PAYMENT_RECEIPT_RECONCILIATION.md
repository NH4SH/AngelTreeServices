# Staging migration 120 — individual payment receipts

October 23, 2026. Complete on ATS CRM Staging only (`gbyhdsuiqeslgjdnbqng`): **120 migrations**, latest `20261023213240`. The verified payment-receipt fix is pushed to main as `ee15928`. No application deployment, production query/change, key rotation, customer email or provider request occurred.

## Installed result and preservation

The original `20261023213240_scope_payment_receipts_to_payment.sql` is installed through the native Supabase CLI. Only the intended matching expression inside `public.claim_outbound_delivery` changed. Its body hashes match the fresh local native rehearsal; owners, arguments, security mode, search path, execution rights and other metadata are unchanged.

The catalog remains **5,110 objects**. All unrelated definitions, RLS/policies, grants/defaults, source/recipient checks, source locks, family locks, claim fences, delivery keys, payloads, retry authority, financial commands, proposal-expiry checkpoints and immutable document terms are preserved. All 119 complete prior native ledger entries, including statement history, are byte-identical. The new native entry matches the local installation exactly. Before/after fingerprints match for all **49 protected business/Auth/history sets**, settings, recurring settings and the no-send Auth guard. Automatic sending, appointment notices and recurring generation remain OFF.

Different known payments on one invoice can each retain a receipt. Same-payment receipt suppression retains its existing configured acceptance interval, and dispatching/unknown requests retain their holds. Unidentified saved invoice requests retain the conservative invoice hold. Existing accepted/uncertain delivery history remains unchanged. No historical failed, skipped or cancelled message is reset, retried or resent. This migration changes admission matching, not payment amounts, balances, statuses, recipients, receipt wording or financial behavior.

## Verification

| Check | Result |
| --- | --- |
| New seed-free native local project | Original 119 migrations replayed; no shared database reset |
| Candidate transaction | **32 assertions**; candidate DDL and synthetic fixtures rolled back |
| Deliberately failed native 120 upgrade | Schema, records and native migration history rolled back together |
| Native local upgrade and repeat | 120 entries; all prior 119 complete rows/statements and original records preserved; repeat changed nothing |
| Installed local and staging command checks | **32 assertions in each**, with fixtures fully rolled back |
| Independent concurrent native admission | Two scenarios / three TAP results; both sessions observed waiting: separate payments get two attempts, competing same-payment receipts get one |
| Staging preflight and prospective catalog | Exact reviewed 119 baseline; **32 candidate assertions** and only the reviewed local claim-body hashes changed, then full rollback |
| Native staging installation/final dry run | Only original 120 installed; up to date, zero pending migrations/seeds/roles; Vault import explicitly skipped |
| Read-only 120 maintenance verifier | Fresh hosted observation passed; ten acceptance/rejection tests passed |
| Full CRM regression suite | **2,495 passed**, no failures/skips |
| Fresh independent schema contract, offline fingerprints, route types and TypeScript | Passed; no public-type or migration-source drift |
| Concurrent main website compatibility | 239 interaction and nine style checks; build/validation of 18 approved pages passed |

Native command tests cover accepted, dispatching and unknown same-payment suppression; separate payments on one invoice; same-key repeat; legacy acceptance; unidentified in-flight history; unchanged invoice/payment facts; exact first-delivery/history preservation; one attempt per genuine payment; automatic-sending OFF; and anonymous/authenticated denial. SQL acceptance is synthetic test evidence, not provider contact. The independent concurrency run uses the approved integration test logic, adapted privately only to this new disposable project's prefix and source path.

All staging candidate/fixture transactions are rolled back. Existing hosted defaults and permissions are compared to staging's own reviewed baseline, while only the one intended routine body is compared to the local native result. Local concurrency fixtures remain isolated in the new owned disposable project, whose data is retained when stopped. Raw responses, credentials, generated records and logs remain outside Git. Clean regression/type checking copied no ignored environment files/provider credentials and recorded zero external application requests during contract/type checks.

Security-advisor findings are exactly equal before/after at WARN level: 79 existing `authenticated_security_definer_function_executable` notices and one existing `auth_leaked_password_protection` warning. No new finding was introduced and no protection setting changed. This reconciliation does not resolve that pre-existing baseline or the separate managed-runtime issue.

## Maintenance and release boundaries

`supabase/staging/payment-receipt-candidate-120.json` pins all 120 original migration sources, physical staging identity, previous full ledger seal, exact native installation entry, complete catalog seal, approval/document-term definitions and protected state. `scripts/release/verify-staging-payment-receipt-candidate.mjs` is read-only and rejects production refs, write/deploy flags, unknown sources, history/body/privilege drift, changed protected records/guard and enabled automation. `--print-sql` returns its pinned read-only snapshot. Historical 119 and earlier receipts/candidates remain intact; use the new 120 verifier for current staging maintenance.

Main is included through `609abe5`, preserving the independent public-site pruning update and all prior CRM work. The separate runtime-security branch remains at `06580f6`. This reconciliation is saved locally on `codex/staging-payment-receipt`, pending a separate push request. No application/UI source, migration, generated public type or dependency changed in this batch, so no new optimized-build/browser/mailbox acceptance is claimed; the payment-receipt implementation's previous build and native-worker verification remain preserved.

Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/staging-payment-receipt-120/`. Sanitized receipt: `staging/PAYMENT_RECEIPT_RECONCILIATION_VERIFICATION_20261023.json`. Only the task-owned database is stopped after acceptance, retaining its data; unrelated development services and Impeccable files are preserved. No app deployment, production readiness, automatic-sending activation or historical-message retry is authorized or implied. Existing owner terms-policy decisions, mailbox/device/assistive-technology acceptance and managed-runtime follow-up remain in the current roadmap.

### Push follow-through — October 23, 2026

The verified reconciliation is pushed normally to `origin/main` as `d14d504a6c82201f5bc3efea55d53d7ec9110a98`, with CI/Netlify skip markers. The next existing communications/scalable-read follow-through is documented in `PAYMENT_CONFIRMATION_PLANNING.md`. Migration 120 and its historical evidence remain unchanged; no application deployment, production change, automatic activation or historical-message retry occurred.
