# Manual-payment recovery confirmation — October 20, 2026

The verified invoice-confirmation fix `668f869` is pushed to main and its preserved
feature branch, deployment skipped. This PR07/F12 follow-up is local on
`codex/manual-payment-recovery-confirmation`, based on that main. It continues the
existing roadmap and preserves all previous CRM and website work.

## Decision and reproduced issue

The payment form deliberately freezes a saved request before sending it. It should
unlock edited details/new requests only after the server confirms an abandoned
attempt, or identify an already recorded payment without creating another.

Both web and mobile previously trusted an `abandoned` state without requiring an
explicit null payment ID. Missing or contradictory IDs therefore unlocked web
editing or produced a successful mobile abandonment response. Payment recording
also trusted an ID alone, even when status/replay/balance confirmation was absent.

Six before/after reproductions cover three payloads in both surfaces: an abandoned
receipt without an ID, an abandoned receipt containing a recorded ID, and a record
receipt containing only an ID. The old code releases/confirms them; the new code
keeps them unconfirmed. This is a defensive application boundary fix. No production
occurrence, SQL miscalculation or financial loss is asserted.

## Changes

* One pure shared guard checks installed SQL receipt shapes for both callers.
  Abandonment requires an explicit null payment ID and no conflicting payment
  status. Both first-time and replayed tombstones remain supported.
* Recorded recovery requires a valid string payment ID and `succeeded` or
  `cancelled` status. A corrected payment remains identified; it is never released
  as an unrecorded request or resurrected by replay.
* Original/replayed record confirmation requires ID, supported payment status,
  boolean replay flag and safe nonnegative SQL-integer balance. A new confirmation
  cannot claim it is already cancelled; a corrected replay can. The replay SQL
  intentionally omits some original-receipt totals, which are not required here.
* RPC exceptions and malformed/error acknowledgements retain the saved attempt.
  Web returns the existing recovery guidance; mobile retains the existing
  `manual_payment_unknown`/503 response. No automatic second write, new request ID,
  amount/date deduplication or speculative follow-up is introduced.
* Unexpected follow-up planning exceptions cannot replace a valid committed
  payment confirmation with an error. Diagnostics omit thrown text. Mobile retains
  its unconfirmed-payment log with a fixed safe code and invoice reference.

Valid responses, successful mobile API shape/version, existing messages and role
boundaries remain. Database commands still own identity/payload binding, current
authorization, parent locks, tombstones, balances and audit history. Receipt shape
checks do not replace those guarantees or prove commit on their own.

## Verification

| Check | Result |
| --- | --- |
| Regular local gate | 974 passed, zero failed/skipped: prior 914 plus 60 added results |
| Focused action/mobile results | 77 passed, including the original 17 manual-attempt results |
| Installed PostgreSQL commands | 11 scenarios in both web/mobile adapters, 22 rolled-back command paths, 12 TAP results |
| Financial cases | New owner/admin payment, same-request replay, corrected replay, recorded/corrected recovery, first/replayed abandonment |
| Live SQL access | Crew, disabled owner and separated owner denied despite stale application authority |
| Schema contract | Current 96-migration/generated fingerprints match; no regeneration or migration needed |
| Isolated Node22 typecheck/build | Passed with synthetic-only configuration and an unlinked source export |
| Existing local preservation | All 110 public row sets, ledger, functions, constraints, policies, buckets and scan settings exactly match the starting snapshot |

Every integration fixture/write rolls back, including synthetic Auth users and
their profile/role rows. No provider is configured or called. SQL receipts are
checked through the real action/mobile route code with controlled application
adapters; there is no real HTTP/Auth session, payment provider or hosted request.
The separated employee state is seeded using operator privileges, not the actual
offboarding workflow. Existing PR02/07 regression checks still run in the normal gate; the separate
real Auth/concurrency acceptance suites remain necessary for a later rollout. Controlled exceptions model lost acknowledgements; they are not
an actual network interruption after a committed transaction.

## Modified files and remaining boundaries

Runtime changes: `src/lib/payments/manual-payment-receipts.ts`,
`src/lib/actions/payments.ts` and the mobile invoice `manual-payment/route.ts`.
Tests: expanded manual-attempt tests, new mobile/recovery integration tests, and
the earlier reconciliation test's shared-guard dependency wiring. Test instructions
and this report complete the package.

No SQL, RLS/grants, transaction, pricing calculation, provider/webhook flow,
dependency, credential, production configuration, employee UI or page layout
changed. Existing signed-in local development remains available. No migration,
hosted write or deployment ran. The new package is local pending push.

The scanner, paired restore/operator and actual hosted staging acceptance gates
remain separate. No readiness flag is promoted and no rollout is implied. Review
and push this bounded package before further work; avoid replacing existing
database authority with application receipt assumptions.

Private reproduction, logs, SQL results and preservation evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/manual-payment-recovery-confirmation/`.
