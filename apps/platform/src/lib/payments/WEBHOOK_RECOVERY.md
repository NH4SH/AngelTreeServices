# Recoverable Stripe webhooks (PR06)

This is the receipt/recovery slice of the existing CRM roadmap. It builds on
PR03's invoice commands and guarded void. PR07 extends its provider ordering and
manual-payment protocol; see `ORDERED_PAYMENT_RECONCILIATION.md`. PR14's broader
communications work remains separate.

## Contract

The route verifies Stripe's signature against the original request body before
creating a privileged database client. A missing secret, missing receipt command,
failed provider read, failed transaction, or unfinished receipt returns non-2xx.
There is no untracked fallback. Only a completed receipt is acknowledged with
200; a busy lease or exhausted attempt allowance returns 503 with Retry-After.
An authenticated but unsupported event is durably recorded as ignored/completed.
Connect-account events and test/live mismatches are rejected.

`stripe_webhook_events` retains its original event ID and completion marker.
Historical completed rows remain complete. Historical incomplete rows remain
recoverable; existence alone never proves completion. New metadata contains
provider identifiers, mode, timestamps and normalized support codes, not raw
event payloads or customer billing data. The existing notification table retains
the recipient address needed to identify its one reserved office-email attempt.
No credentials are stored in either table.

Each claim locks its receipt, validates immutable identity and grants a fresh
owner token for two minutes. Attempts are limited to 12. A live owner alone can
apply, checkpoint, fail or complete work. Failure retains progress; it never
deletes the receipt. Expired ownership can be reclaimed. Stale callers cannot
clear a newer lease or declare it complete. An owner/admin retry adds one attempt
when exhausted and records an audit event; it cannot steal a live lease.

The application uses a 60-second total work budget and at most eight seconds per
provider/database request, with Stripe SDK network retries disabled. Checkpoints
and failure recording have bounded timeouts. A timeout is not proof that an
external submission failed; uncertain submissions are handled separately below.

## Financial transaction

Provider reads happen outside the SQL transaction. Normalization retrieves the
current Session, PaymentIntent, Charge or Dispute rather than trusting an older
delivery's financial fields. It checks mode, reservation/invoice/provider
identity, amount and currency. The apply command rechecks local bindings after
locking the invoice. Conflicting local provider bindings fail closed.

The owned `apply_stripe_webhook` transaction locks receipt → invoice → checkout/
payment, rechecks lease authority after lock waits and before committing, then
commits the following together:

- Payment/check-out changes, including preservation of received money when an
  older pending/failure event arrives.
- PR03's locked net-principal invoice reconciliation, including surcharge,
  existing dispute and void-conflict behavior.
- Cancellation of pending communications when the invoice has no balance.
  Already processing submissions retain their existing boundary.
- Semantic activity, in-app office notifications and a private effect marker.
- The `effects_ready` financial checkpoint and invoice link.

A failed audit or later SQL statement rolls back the entire transaction. A crash
after this transaction resumes downstream work without reapplying money.
Semantic keys preserve the previous pipeline's keys. The private effect marker
freezes the recipient set after commit, preventing a different Stripe event from
notifying newly added staff about the same historical effect. Existing legacy
activity is repaired once. Previously pending legacy email without acceptance
evidence becomes a review exception, never an automatic resend.

Refund allocation preserves the existing principal/surcharge convention. PR06
alone held lower aggregate snapshots as unresolved conflicts. PR07 replaces that
temporary guard with fenced observations of every individual refund, successful-
only refund accounting and failed/canceled lifecycle corrections. It also extends
dispute ordering. Read `ORDERED_PAYMENT_RECONCILIATION.md` for the current contract
and coordinated release requirements; these changes remain local until approved.

## Downstream effects and email

Queue planning resumes only for the affected invoice's existing reminder and
payment-confirmation families, using their existing keys/settings. It sends no
customer messages, preserves the master switch, and does not revisit schedules
or activate automation. A failed planning step retains `effects_ready` for retry.
The PR14 reminder-family/recipient-version/submission races remain separate.

Office email has an explicit one-submission protocol. The database reserves the
notification and its immutable attempt token before HTTP; it checks current
recipient access and preferences at that point. A replay seeing `submitting`
records `review`, not another send. Acceptance requires a provider message ID.
Known failed/skipped results are recorded; uncertain acceptance is visible for
provider review. Late positive evidence from the sole reserved attempt may be
recorded after lease expiry, but cannot complete another owner's receipt or
authorize another submission. The existing provider idempotency key is retained
as extra protection, not treated as proof of indefinite deduplication.

This deliberately prefers a visible missed/uncertain office email over duplicate
mail. There is no automatic resend or new delivery worker. Payment processing
can complete with a recorded office-email exception; the in-app notification
remains. Completion requires all notifications to leave queued/submitting and
the communication-planning checkpoint to finish.

## Operator recovery

System Health → Payment processing exposes a collapsed, narrow history for live
owners/admins only. It shows up to 100 recent events, unfinished work first, ten
initially visible. Event IDs/support codes live under processing details; raw
provider payloads, addresses and secrets are not returned by the read RPC.

Retry requires confirmation and live database authorization **before** service
clients/provider reads. Offboarded users remain denied with previously issued
JWTs. Retrying retrieves evidence and finishes saved work; it does not create a
Stripe charge, issue a refund, or resend an uncertain notification.

An `effects_ready` receipt can finish from its durable metadata without Stripe
event retrieval or a configured Stripe API client. An older pending legacy row
may lack that metadata and require retrieving its original event. Stripe only
guarantees event retrieval for 30 days. If unavailable, retain the receipt and
investigate provider evidence; do not fabricate an event/completion or delete
the ledger to force a replay. Unknown office email requires checking provider
acceptance before a separately authorized manual follow-up.

## Future deployment and rollback (not performed)

The route and migration are a coordinated compatibility boundary. The original
route treats duplicate receipt insertion as completion, so do not run it against
new unfinished receipts during a mixed release. The migration also revokes its
old service-role receipt writes.

For a future authorized rollout, release the new route in its fail-closed mode,
drain all old handlers/in-flight invocations, then apply the additive migration
and verify the new runtime. The new route returns retryable failure while its
RPCs are absent. Plan the brief retry window and verify hosting invocation limits
against the work budget. Do not restore old direct receipt writes to mask a
mixed-version rollout. All earlier PR03 migration/caller staging requirements
still apply. No production migration or release has been performed here.

Rollback must preserve receipts, submission attempts, payment/audit/effect
history and least-privilege grants. Use a compatible fixed handler or pause
receiving while repairing; do not restore the unsafe duplicate-ACK handler,
reset phases, drop history, or release uncertain mail for resend.

## Verification and references

See `tests/README.md` for the opt-in local stack and permanent tests. Real local
Auth/JWT, PostgREST, SQL locks and the actual route/signature verifier are tested;
Stripe reads and mail submissions are controlled doubles. Production Stripe
delivery/redelivery and real provider acceptance are not proven by that suite.

- [Stripe webhooks: retries, duplicate events and ordering](https://docs.stripe.com/webhooks)
- [Stripe Event retrieval](https://docs.stripe.com/api/events/retrieve)
- [Stripe refunds: failures and lifecycle events](https://docs.stripe.com/refunds)
- [Supabase database functions and privileges](https://supabase.com/docs/guides/database/functions)
