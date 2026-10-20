# Stripe webhook checkpoint confirmation — October 20, 2026

The verified manual-payment fix `a9a762b` is pushed to main and its preserved
branch, deployment skipped. This scanner-independent PR06/10/14 follow-up is local
on `codex/webhook-checkpoint-confirmation`, based on that main. It preserves the
existing roadmap and all prior CRM, employee UI and public website work.

## Concrete decision

An uncertain email is not a definite failure. The durable email sender can return
`outcome: unknown` with automatic retries disabled, but the webhook previously
ignored that outcome and classified it as failed. The receipt could then complete
with misleading failed-email history. A configured legacy sender lacking an
explicit outcome could be misclassified in the same way.

Before/after reproduction also confirms that a reminder callback returning an
empty object advanced its sync checkpoint, and a malformed sender result was
classified as failed. These are application acknowledgement gaps, not evidence
that the SQL money/ownership transactions calculate incorrectly. No production
occurrence or financial loss is asserted.

## Changes and recovery behavior

* Claimed receipts require a valid token, known phase, explicit nullable invoice
  ID and boolean sync flag. Unconfirmed claims do not authorize use of a token;
  their lease remains reclaimable. Minimal completed/busy/review SQL responses
  remain supported.
* Snapshot replies must be UUIDs before a second provider observation or apply.
  Financial apply must positively identify the expected invoice where the source
  provides one. Initial and replayed ignored acknowledgements remain supported;
  truthy flags and empty objects cannot skip work.
* Reminder planning must explicitly return `error: null` before marking sync.
  Notification reads require a confirmed array of distinct valid IDs. Notification
  preparation must report a known outcome, or a complete send payload bound to
  this checkpoint's invoice. Missing acknowledgements never authorize sending.
* A malformed sender result follows the existing uncertainty path: reserve once,
  store review when possible, fail the receipt, and let replay preserve the
  uncertain submission rather than send another email.
* A well-formed declared unknown outcome is recorded as review even with retries
  disabled. A configured legacy negative result without an explicit outcome also
  stays in review. Positive provider acceptance remains accepted; explicit
  non-retryable rejection/not-attempted and unconfigured outcomes retain their
  failed classification. Existing review handling and operator recovery are reused.

A fully confirmed review checkpoint may complete the overall Stripe receipt,
leaving the notification visibly in review. This is the existing protocol: it does
not authorize another send. Missing or malformed checkpoints instead fail without
HTTP acknowledgement, so the retained receipt can be reclaimed. The actual HTTP
route is tested to return an error when planning is unconfirmed.

The sender's SQL response permits null body/destination fields. The adapter now
handles a null destination without fabricating a link or throwing; body omission
still uses its existing filtering. This small adapter change supports the reviewed
nullable contract and adds no recipient, template, routing or provider service.

## Verification

| Check | Result |
| --- | --- |
| Regular regression gate | 1,035 passed, zero failed/skipped: previous 974 plus 61 new results |
| Focused checkpoint/HTTP tests | 61 results, covering positive paths and malformed/ambiguous boundaries |
| Installed local SQL and collected response compatibility | Eight scenarios, nine TAP results |
| Actual SQL financial retention | One payment and zero balance survive failure/reclaim in the transaction |
| Actual SQL notification replay | Reserved uncertain submission becomes review; completion records notification-review status |
| Terminal and ignored SQL replies | Completed/busy/exhausted and both ignored-apply shapes remain accepted |
| Typecheck and optimized build | Node22, synthetic-only unlinked export; existing development build preserved |
| Schema integrity | Current 96-migration/generated fingerprints match; no migration needed |
| Preservation | All 110 public row sets, ledger, functions, constraints, policies, buckets and scan switches exactly match the starting snapshot |

The SQL suite runs installed functions inside one outer rollback and then passes
collected synthetic response shapes through controlled runner adapters. It proves
the SQL transitions and receipt compatibility separately, not real interleaved
HTTP transactions or independently committed recovery. All synthetic Auth,
profile/role, invoice/payment, receipt and notification writes roll back. There
are no real provider requests or credentials. The separate PR06/07 real Auth,
concurrency and deployment gates remain necessary.

The existing contested-webhook tests now supply a complete canonical claim and
snapshot and assert that the contested apply was actually reached. Their original
retryable-failure/no-ACK expectation is retained, rather than passing early on a
new validation guard.

## Preservation and remaining boundaries

Runtime changes are limited to `src/lib/payments/webhook-recovery.ts` and its
existing email adapter. New focused/opt-in tests, adjusted complete test fixtures
and README instructions accompany this report. No SQL, grants/RLS, financial
calculation, transaction/lock order, lease/retry budget, provider key, request
identity, offboarding rule, employee UI or page layout changed.

Receipt shapes cannot establish runtime key binding, current provider truth or
commit by themselves; database ownership/source checks and runtime validation
remain authoritative. No automatic resend, new repair queue or guessed financial
replay is introduced. Scanner, paired restore/operator and actual hosted staging
acceptance gates remain separate. No readiness flag, production configuration or
credential changed; no app or worker deployed. This package is local pending push.

Private reproduction, logs, synthetic SQL results and preservation evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/webhook-checkpoint-confirmation/`.
