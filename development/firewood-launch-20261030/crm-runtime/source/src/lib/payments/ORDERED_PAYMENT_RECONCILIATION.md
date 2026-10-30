# Ordered money and safe manual attempts (PR07)

Builds directly on PR03's invoice boundary and PR06's recoverable receipts.
No production configuration, provider event subscriptions, payment activation,
historical balances or credentials are changed by this local implementation.

## Provider observation ordering

An event's creation time orders events, not the current state of a mutable
Charge, Refund or Dispute. A maximum refund amount is also insufficient: a
refund can subsequently fail, be canceled or require customer action again.

The processor first resolves bindings, then calls the service-only
`prepare_stripe_webhook_snapshot` under receipt → invoice locks. This issues a
new private invoice observation token/revision. It then **discards preliminary
financial evidence and reads Stripe again**, outside any SQL transaction.
`apply_stripe_webhook` must hold the invoice lock and match both the receipt
lease and the latest invoice observation token. A newer observation invalidates
every older one, even if its receipt lease is still live. The stale caller
returns retryable failure and must fetch again. It cannot ACK unfinished money.

This does not hold a database transaction across HTTP or depend on sorting
deliveries by arrival/event timestamp. It is deliberately possible for two
concurrent events to require a retry before both complete. Already committed
financial work resumes at PR06's effects checkpoint without being applied again.
The existing 60-second work/eight-second request budgets and two-minute receipt
lease remain. Unsupported events still complete durably without provider work;
a known invoice binding cannot turn into an ignored ACK between reads.

External Stripe state can change after any API read. Subsequent subscribed
events/recovery must bring that new state into the CRM; this is not a claim of a
transaction spanning Stripe and PostgreSQL. Failed/partial/paginated reads leave
the receipt recoverable. No provider write, refund issuance or charge is added.

## Refund accounting

Success and refund handlers consume every page of the charge's current Refund
objects, up to 1,000 rows within the existing budget. Empty `has_more` pages,
duplicate IDs, unknown status, wrong charge/intent/currency, invalid amount or
omission of the event's refund fail closed. The SQL command also rejects missing
previously observed refund IDs, changed immutable identity/amount/creation facts,
duplicate IDs and successful refunds exceeding the original collected gross.
It does not silently erase a known refund because of a truncated list.

The private refund table stores only normalized provider identifiers, amount,
currency, status and observation timestamps/receipt. It stores no raw provider
payload, addresses or credentials. IDs cannot migrate to another payment.

Only `succeeded` refunds reduce successful principal. `pending`,
`requires_action`, `failed` and `canceled` remain tracked but are not completed
returned money. Principal/surcharge allocation uses the existing proportional
integer-cent convention. Full success yields payment status `refunded`; an
authoritative later failed/canceled refund can restore status `succeeded` and
the correct net credit. No extra payment is created. Fresh evidence can repair
PR06/legacy provisional aggregate refund values, with retained activity/history.

This replaces PR06's temporary lower-aggregate conflict guard. There is no
irreversible `greatest(old_refund, new_refund)` rule and no reliance on the
charge aggregate for successful refund amounts. Success first observed after a
refund applies that refund and the payment in the same transaction.

Supported refund notifications: `charge.refunded`, `refund.created`,
`refund.updated`, `refund.failed`, plus the legacy `charge.refund.updated`.
The endpoint must actually subscribe to these events in a future authorized
rollout; no Stripe Dashboard setting was changed locally.

## Disputes, balances and history

Current dispute reads use the same observation fence. Created/updated/closed and
funds-withdrawn/reinstated deliveries cannot overwrite newer locally committed
observations with earlier reads. A permanently sticky won/lost status or an
older event timestamp no longer overrides a newly fetched current provider
status. Amount, currency, charge and existing dispute-ID bindings remain checked.
The unsafe direct dispute RPC is withdrawn from service callers; the private
helper runs only inside owned invoice-first apply.

Existing financial conventions remain: only a lost dispute reduces paid
principal; pending disputes do not. Combined refunded/disputed principal cannot
make net successful principal negative. Surcharge is never invoice principal.
Void conflicts preserve actual received provider money and their audit history.
Irrevocable Stripe money is retained even if a simultaneous manual receipt makes
the invoice overpaid; the balance floors at zero, not by discarding a payment.

Manual record/correction/restore, provider apply and reconciliation all derive
balance under the invoice row lock in their SQL transaction. Reconciliation also
cancels pending messages atomically when paid. Already processing communications
retain their existing submission boundary. Existing invoice edit/version/void
guards continue to serialize against those writes.

Office refund effects use a normalized snapshot fingerprint. Dispute effects use
one key per dispute/status, regardless of the delivering event type; committed
PR06 legacy effect keys remain respected. Recipient sets stay frozen. A missing
notification caused by recipient/Auth deletion after loading is skipped; a real
notification belonging to another receipt remains an error. Unknown provider
email acceptance is still never automatically resent. These are office notices,
not completion of the broader PR14 customer/reminder delivery contract.

## Manual request identity and uncertainty

`record_manual_invoice_payment_request` requires a caller-generated UUID and
binds it to the live owner/admin, invoice and normalized amount/date/method/
reference/notes. Request, payment, invoice balance and audit commit together.
Replay returns the original payment ID even if the invoice is now paid or that
payment was later corrected. It does not create or restore money. Reusing an ID
with different details/actor/invoice is rejected. Equal $100 installments with
different IDs remain valid. The old unkeyed record RPC is no longer callable by
authenticated/service roles; owner/admin authority and direct-write restrictions
are preserved.

The web form persists the original attempt and frozen payload **before HTTP**,
partitioned by account/invoice. It retains them on errors and reload; no second
request is generated on retry. Confirmed payment references persist until the
user explicitly selects another payment. It remains available for recovery when
the invoice becomes paid. Immediate duplicate clicks share one attempt.

“Check before changing details” uses
`resolve_manual_invoice_payment_request`, under the same invoice lock. If money
committed, it returns the original reference. Otherwise it records an abandoned
request tombstone before allowing edited details/new identity. A delayed original
request then cannot arrive and create money after that reset. An unrecognized
response, failed resolution or storage failure never releases the old identity.

The mobile API follows the same protocol. Updated iOS freezes/persists the
account/invoice attempt in its separate PaymentAttempts store, surviving ordinary
cache/logout clearing. Persistence failure prevents submission. It only clears
after confirmed recording or server-side abandonment. Its new
`manual-payment/attempt` URL deliberately does not exist on older servers, so an
old API cannot silently ignore the UUID and record an unsafe retry. Invoice
responses advertise request version 1. Legacy clients missing an ID receive a
clear update-required error; do not invent an ID on their behalf.

Durability assumes browser/app storage is not manually erased or the app removed.
If an attempt identity is lost, check the invoice's payment/audit history before
starting another. Do not infer identity from equal amounts/references. No browser
or native store receives server credentials or provider secrets.

## Rollout and verification

This is local and not deployed. Migration
`20261016032012_ordered_payment_reconciliation.sql` is additive; all previous
migrations remain byte-for-byte unchanged. It does not rewrite historical money
at installation. See `tests/README.md` for disposable SQL/Auth/HTTP checks.

Future release must coordinate the new processor, keyed web/mobile callers,
withdrawal of old unkeyed RPC access, prior PR03/PR06 migration staging and hosted
function time limits. New processor without the new commands fails closed; old
PR06 apply callers without a snapshot token fail closed after the new command is
installed. Drain old financial invocations rather than mixing both runtimes.
Update/verify Stripe event subscriptions only with rollout authorization. Publish
the updated mobile app before expecting its recording flow to work against the
new required-identity contract. Keep request tombstones, observations, receipts,
audit and payment history during rollback; do not restore unsafe unkeyed writes.

No real Stripe/Resend network exercise is claimed by local doubles. Full native
simulator build/tests require Xcode; Swift syntax and compiled persistence checks
are useful supplemental evidence, not a substitute for that release gate.

PR04 generation and remaining PR05 quote/edit work stay on the original roadmap.
Reminder recipient-version/timing/submission races remain PR14; no automation or
payment feature switches were enabled here.

Provider contracts: [Stripe refunds](https://docs.stripe.com/refunds),
[refund listing](https://docs.stripe.com/api/refunds/list),
[webhook event ordering/retries](https://docs.stripe.com/webhooks).
