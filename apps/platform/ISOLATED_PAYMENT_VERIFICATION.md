# Isolated payment verification — October 21, 2026

All six payment suites pass in a separate local Supabase project: **111 checks, zero failures**. The earlier shared-fixture limitation is resolved. Existing bounded webhook recovery already handles notification batches safely; no application change, new migration or weaker completion guard is needed.

The verified conflict/private-download batch was pushed atomically to main and the working branch as 1aafe8a212a56cdea29e6250fed740cf8ba04354. The commit contains both deployment-skip markers. CRM production, website production and staging published deployment IDs are unchanged. New test-harness/coverage/report changes remain local for review.

## Actual test environment

- Separate project: ats_payment_4b0eceb5daaa; API 127.0.0.1:57421, database 127.0.0.1:57422, separate Next app 127.0.0.1:3127.
- Replayed all 101 committed migrations using Supabase CLI 2.121.0, PostgreSQL 17.11, PostgREST 16.4, GoTrue 2.197.0 and Node 22.23.3. No seed or business-data import. Initial Auth users, customers, invoices, payments and notifications were all zero.
- Docker inspection confirms actual published API/database bindings are 127.0.0.1; Auth/REST/Storage have no separately published ports. This independently checks the CLI’s generic bind-address warning.
- The original development database, app and services were preserved. Read-only full-row fingerprints for invoices, payments, checkouts, webhook receipts, notifications, quotes and jobs match before/after final verification.
- Only synthetic accounts, invoices, bank/card observations, refunds, disputes and email acceptance acknowledgements were used. Real payment/email providers were never called. API tests enforce a fetch boundary allowing only this isolated API/app; SQL/action tests use synthetic provider dependencies and rollback fixtures.
- Communication and recurring automation remain OFF. No hosted database, service configuration, scanner or application deployment changed during these tests.

## Results

| Suite | Passing checks |
| --- | ---: |
| Ordered payments, refunds, disputes, stale snapshots and mobile manual-payment requests |25|
| Webhook recovery, ownership, acknowledgement and uncertain notification handling |29|
| Manual-payment request recovery |12|
| Payment-reconciliation acknowledgement |9|
| Payment-preference confirmation |17|
| Portal payment context |19|
| Total |111|

The full CRM unit/regression suite also passes **2,186 checks**. Two new boundary tests reject hosted/shared/wrong-port fixture targets and provider requests. No app TypeScript or native source changed in this testing batch; the previously verified application build remains the same source. A new application build or deployment was unnecessary.

The isolated Next app served the real mobile invoice/manual-payment endpoints. Repeated requests returned the same payment identity; read-only resolution, missing request IDs and abandoned request handling retained their existing behavior. The app was confirmed available before the final run; the initial app-start timing failure was test preparation, not a payment failure.

## Notification batch recovery

The new regression adds 101 synthetic office recipients to the controlled fixture, giving 110 eligible recipients for its event. All acknowledgements are simulated.

1. First invocation applies the payment once and resolves 100 notifications. Receipt completion refuses the unfinished batch and retains the financial checkpoint.
2. Second invocation resumes the same receipt, resolves the remaining 10, and completes successfully.
3. A completed replay sends nothing further. There is exactly one payment and one payment-success audit event. Every accepted notification identity is submitted once. No new recipient set or financial application is created during recovery.

This reproduces the meaningful condition behind the prior 123-recipient shared-fixture failure. That failure did not justify weakening completion or raising batch/timeout limits. The existing bounded recovery is verified directly instead.

## Test support and cleanup

The six existing integration suites now accept an explicitly guarded fresh target. The original opt-in disposable target remains supported. The additional batch regression runs only in the separate fresh environment. No production runtime module, schema, RLS rule, financial calculation or transaction was changed.

All 230 synthetic accounts accumulated while preparing and running this private test project are disabled/separated, and its Auth sessions are revoked. Only that temporary app and stack were stopped; their data and logs are retained for diagnosis. No existing development records were removed or reset.

Credential-free machine evidence: [ISOLATED_PAYMENT_VERIFICATION_20261021.json](staging/ISOLATED_PAYMENT_VERIFICATION_20261021.json). Private orchestration scripts, manifests, local credentials and logs: /Users/noelsierra/Documents/Codex/2026-10-21/isolated-payment-tests/. Keep credential/status files outside Git. Test source fingerprints are recorded in the machine evidence.

For another isolated run, create a new local project with these dedicated ports, no seed, and the exact committed migration chain; start a separate app with only that project’s local values. Supply PAYMENT_FRESH_DISPOSABLE=1, PAYMENT_FRESH_MANIFEST and PAYMENT_FRESH_STATUS_FILE, along with the suites’ existing opt-in flags. The manifest binds the owned ats_payment_ identifier, matching database container, API/database/app ports and local Docker socket before any requests or SQL. Do not point the fresh harness at shared, staging or production services. The tested private scripts record the complete configuration and invocation.

## Release decision

The payment-test blocker is closed. Keep production unchanged until the coordinated database/application cutover, paired production recovery, and scanner availability/capacity/monitoring requirements in CRM_PRODUCTION_RELEASE_PLAN_20261021.md are complete. These tests simulate provider responses; they do not claim real Stripe/Resend delivery or a production rehearsal passed.
