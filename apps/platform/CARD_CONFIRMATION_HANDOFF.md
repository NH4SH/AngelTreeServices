# Card confirmation handoff safety

October 20, 2026 · existing PR03/PR07 follow-up · local verification only

## Decision and reproduction

Bank checkout package `3b43338` is pushed to main and its preserved feature branch.
This scanner-independent package continues collection safety on
`codex/card-confirmation-handoff`, based on that main.

The card confirmation helper accepted any truthy claim payload, including `{}` or
a different row ID, before making a `confirm: true` provider request. An incomplete
save could also release client confirmation data. The returned token and intent
were not checked against all requested identity/mode bindings. Controlled tests
reproduce the caller gaps: the first 49 cases passed 17 and failed 32 against the
old source. No production incident, actual duplicate charge, loss or SQL/RLS
bypass is asserted.

## Changed behavior

- Review lookup needs an explicit successful response and complete unsubmitted,
  unbound open card reservation for the selected review and invoice. Monetary
  fields must be canonical integers; an invalid review timestamp cannot bypass
  expiry checking. The existing review lifetime and stale-review behavior remain.
- The retrieved confirmation token must match the saved token ID and configured
  test/live mode. The portal confirmation route now supplies that existing mode
  to the helper. No token/provider mismatch can authorize a charge request.
- The claim compare-and-set checks invoice, card channel, saved token, review
  timestamp, reviewed principal/fee/gross, empty provider/submission fields and
  open state. Only explicit no-error acknowledgement of the exact review ID can
  authorize the provider create. A competing fee or binding change blocks it.
- Returned intents need the correct invoice/review/channel metadata, amount,
  currency and mode, a valid provider ID and known status, a safe received amount,
  and a canonical nullable client secret belonging to that intent. Unconfirmed
  responses cannot release confirmation data to the browser.
- The processing save is bound to invoice, exact claimed submission timestamp,
  token and creating/unbound state, and must acknowledge the exact row. A later
  completed reservation or provider binding cannot be overwritten by this save.
- A known, context-checked intent ID is retained for review if its final response
  or save is unconfirmed. Existing provider-error ID evidence remains supported,
  limited to an ID-shaped value and fenced to the same claimed attempt. Such an
  error reference is not independently verified provider state and cannot release
  the guard; existing authoritative review/webhook checks remain necessary. A
  client secret in an error's reference field is not stored as an intent ID.
- Lookup/claim/save/recovery transport exceptions return the existing safe
  unverified-confirmation result, without leaking backend messages or issuing
  another payment request.

The provider idempotency key, `confirm: true`, charge line arithmetic, surcharge
eligibility, supported Stripe statuses, nullable secret contract and authentication
flow remain. An immediately succeeded provider intent still leaves the reservation
processing until webhook accounting records and reconciles its payment. There is
no local invented payment, balance adjustment, automatic guard release or resend.

## Verification

| Check | Result |
| --- | --- |
| Regular regression gate | 1,212 passed, zero failed/skipped: previous 1,153 plus 59 new cases |
| Focused confirmation cases | 59, included above; actual route refuses an unconfirmed claim without a charge request |
| Installed PostgreSQL suite | Ten scenarios, eleven TAP results |
| Node22 typecheck/optimized build | Passed in a fresh unlinked copy using synthetic settings |
| Schema/generated integrity | Current 96-migration fingerprints match; no migration |
| Shared local preservation | All 110 public row sets, functions, ledger, constraints, policies, private buckets and scan switches unchanged |
| Existing local application | Login available, HTTP200 after normal redirect |

The SQL suite interleaves the actual helper with installed service-role reads and
writes, collection triggers and owner void-lease commands on one disposable
connection. A temporary invoker helper captures errors without changing
application functions or grants. Cases cover authentication handoff, immediate
synthetic success retained for webhook accounting, a lost claim acknowledgement
after the SQL write, a lost processing-save acknowledgement, provider uncertainty,
a competing completed-reservation transition, fee change before claim, an active
void lease blocking collection, debit without surcharge, and an expired review.

The lost claim makes zero provider creates; subsequent reads retain its creating
guard. Lost save/provider uncertainty and the competing completion never make a
second provider create. SQL denies collection under the active void lease. The
invoice stays sent with its original balance and zero new payments in every case;
the helper does not perform webhook accounting. Unit cases additionally retain
debit/prepaid/unknown/international fee exclusions, all known statuses, synthetic
live-mode consistency, nullable secrets and ID-only error evidence.

A lost claim acknowledgement can therefore leave a held attempt even when this
caller did not request a charge. This package does not add an automatic way to
clear an unidentified attempt: staff/operator reconciliation must establish the
outcome before collection is reopened. An unconfirmed result must not be treated
as evidence that a charge failed or as permission to submit another one.

All fixture/Auth/profile/role/customer/invoice/checkout/lease/audit writes roll
back in one outer transaction with per-scenario savepoints. Transition/conflict
cases are deterministic same-connection interleavings, not simultaneous
transactions. The completed-reservation case models only a competing reservation
write, not the full webhook/payment workflow. There are zero real provider calls
or customer communications. This does not prove independently committed recovery,
actual network loss, hosted HTTP/Auth, actual browser 3DS or live Stripe behavior.
Existing concurrency and hosted acceptance requirements remain separate.

## Scope and remaining work

Runtime changes are confined to `src/lib/stripe/card-payment.ts`'s confirmation
path and `src/app/api/portal/invoice/[token]/card/confirm/route.ts` passing the
configured mode. Card-review creation and stale-reservation cleanup are not
rewritten. New unit/opt-in integration tests and instructions accompany this
report; the existing implementation roadmap is appended with this decision.

No SQL, RLS/grants, transaction/lock order, lease or retry lifetime, calculation,
pricing/fee policy, idempotency identity, webhook, employee UI, offboarding,
dependency, configuration or credential changes. Portal authorization, origin,
configuration and shared rate limits remain in place. No hosted query/write,
deployment or production change occurred. The new package is saved locally
pending push. Review creation/cleanup and payment-preference receipt checks remain
separate follow-ups; this does not claim every payment caller is covered.
Scanner, paired restore/operator and real hosted staging prerequisites remain.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/card-confirmation-handoff/`.

Primary references checked:
[Stripe intent creation](https://docs.stripe.com/api/payment_intents/create),
[confirmation token object](https://docs.stripe.com/api/confirmation_tokens/object),
and [Supabase update/returned rows](https://supabase.com/docs/reference/javascript/update).
Installed SQL remains authoritative for collection rules and permissions.
