# Guarded invoice voiding — PR03 first slice

This change implements the authorization and voiding slice of PR03. It does not
complete the broader financial command/revision work, PR06 webhook receipts,
PR07 ordered refunds/balances, or PR14 reminder delivery. Keep those roadmap items.

## Authority and transaction boundaries

Only an active owner/admin can initiate voiding or payment-checkout review.
The server action checks live roles first. The authenticated database command
checks the PR02 account predicate and the target invoice before server-only
payment clients are constructed. Provider requests recheck the owned lease;
finalization rechecks live authority. Anonymous/customer/field/estimator/payroll
callers cannot use these commands. Existing role and offboarding rules remain.

The database locks the invoice briefly, rejects money or unresolved collection,
and issues a two-minute owned token. Stripe retrieval/expiration runs outside
that transaction. New collection is blocked while the lease is active. Local
attestation compares status, provider IDs, submission time, channel, amount and
currency; it does not overwrite a changed reservation.

Finalization locks/rechecks the invoice, requires current attestation for **every**
historical reservation, rejects payment evidence, sets void, cancels pending
communications and records activity in one transaction. Audit failure rolls back
all three. Finalization/repeated voiding are idempotent. Stale tokens, different
actors, review-only tokens and old-JWT inactive accounts cannot finalize.

A late real payment remains recorded and creates an idempotent conflict activity.
No payment or invoice history is deleted and no automatic refund is requested.
Voiding does not retract a communication already processing/submitting; PR14 owns
the stronger customer-delivery protocol. No automation switch changes here.

## Collection and recovery

An ACH session must match invoice/client reference, expected test/live mode,
amount/currency and any recorded PaymentIntent/reservation binding. Completed,
paid, processing, missing, mismatched and unverified provider objects fail closed.
Already-expired unpaid sessions are accepted only after authoritative retrieval.
An expiration race is re-read. An unsubmitted card review with no intent is safe
to close locally. Active submitted cards require separate authoritative review; closed card intents
are verified again under the new void lease. Only a
verified unpaid, cancellable intent may be closed, never processing/received money.

Only a new reservation returned by INSERT may create an ACH session. Existing
`creating` reservations are not retried/released by age. Failed create responses
and failed local writes retain the blocker. Card confirmation retains uncertainty
and known provider references, with a checked status CAS so a webhook can win.

The expandable invoice action **Payment checkout needs review?** is owner/admin
only. Select an attempt and verify it. A saved provider reference is checked
without reentering it. An optional missing reference is accepted only when Stripe
metadata names this exact invoice **and reservation** and all binding checks pass.
Invoice/amount alone cannot identify an unknown legacy attempt. Saving that
reference cannot reopen collection or change amount/party/status. Closure and
`invoice_checkout_reviewed` activity commit together. Review never marks money
paid, rewrites ledger evidence, or changes the invoice status.

Legacy unknown attempts without a verified reference or exact reservation
metadata remain blocked for manual provider investigation. There is deliberately
no age-based or “force retry” release. PR06 supplies broader webhook recovery;
this control is a narrow verified closure path, not a general payment repair tool.

## Time budgets and locking

One void/review operation has a 60-second monotonic budget. Individual
provider/database awaits are bounded to at most eight seconds, with provider
network retries disabled for these reconciliation calls. Finalization must still
own the unexpired two-minute DB lease. Release is token/actor fenced and has its
own two-second limit; a failed release cannot reverse a confirmed void. Remote
requests may finish after a local timeout, so no timeout grants permission to
finalize or create another payment. Retry always retrieves current state.

INSERT triggers take the invoice lock before the new row. Existing child UPDATEs
already hold their tuple lock when a row trigger runs, so they obtain the parent
with NOWAIT. This avoids a child-to-parent wait cycle against existing
invoice-first manual corrections. Contention returns SQLSTATE 55P03; retry the
whole operation. Webhook status writes now check those failures and return 500
through the existing error path instead of acknowledging a failed write. PR06's
crash/receipt recovery remains necessary. This is not PR07 atomic reconciliation.

Paid/void invoice totals, billing/source bindings and line changes are blocked.
Lines cannot move between invoices. Voiding/restoration cannot be bypassed by a
direct status update; the existing restore calculation/audit is retained behind
a transaction-only private marker. Ordinary draft editing and manual payment
correction/restoration continue to work. This does not claim to close every
remaining direct financial-field/status/balance write; complete the remaining
PR03 command boundary before considering the whole milestone delivered.

## Verification and later rollout

Fast tests run in the normal unit gate (including minimal PGlite SQL fixtures).
`tests/pr03-supabase.integration.test.mjs` uses explicit opt-in, loopback Supabase
Auth/PostgREST, actual migrated schema, real old JWTs and separate PostgreSQL
sessions. See `tests/README.md`. Providers are controlled doubles; no live Stripe
objects, charges, refunds or customer messages are needed.

The additive migration must be paired with the updated callers. Older direct
void/restore code cannot bypass the new guard. All old financial workers/callers
must be considered during a later approved rollout. Preserve leases, payment
history and audits on rollback; pause/reconcile affected operations rather than
remove the safeguards or clear uncertain attempts. No production rollout is
part of this implementation.

Provider reference: [Stripe Checkout expiration](https://docs.stripe.com/api/checkout/sessions/expire).
Database privilege reference: [Supabase database functions](https://supabase.com/docs/guides/database/functions).
