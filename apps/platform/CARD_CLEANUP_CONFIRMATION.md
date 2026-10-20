# Card cleanup and unpaid proof

October 20, 2026 · existing PR03/PR07 follow-up · local verification only

## Decision and reproduction

Card confirmation `4c399fa` is pushed to main and its preserved feature branch.
This scanner-independent package continues the same collection-safety work on
`codex/card-cleanup-confirmation`, based on that main.

Controlled tests reproduce three gaps in stale-card cleanup: a missing lookup
could be treated as an empty successful cleanup; incomplete/wrong-row expiry
responses could report success; and same-status changes to submission, amount,
provider or expiry fields were not all fenced by the expiry update. Cleanup also
attempted cancellation before rejecting a positive received amount, and missing
received amounts could pass the final unpaid test. The shared checkout closer
had the same permissive unpaid comparison. The first 52 cases passed 14 and
failed 38 against the old implementation. These are controlled response and
interleaving tests; no production incident, financial loss or SQL/RLS bypass is
asserted.

## Resulting behavior

- Cleanup needs an explicit no-error lookup and an array of complete, distinct,
  invoice-bound active card reservations. Provider/submission/expiry fields must
  be usable; mixed checkout-session/card-intent bindings require review. The
  entire list is checked before a provider request.
- Only an unsubmitted open card review with no remote bindings can expire
  without a provider lookup. Unidentified creating/processing attempts remain
  held even after their deadline; elapsed time does not establish no charge.
- Existing provider identity, invoice/review/channel, amount/currency and mode
  checks remain. An intent eligible for cancellation must explicitly report
  numeric zero received before cancellation and again before local expiry.
  Missing/null/text/negative/non-numeric amounts do not prove unpaid status.
- The shared card closer and expanded bank-intent classifier require the same
  explicit zero. This prevents the corresponding gap from remaining in invoice
  void/review and bank replacement closure paths. No principal or fee formula
  changes.
- Expiry compares invoice, status, gross amount, currency, exact observed expiry,
  provider bindings and submission timestamp, as well as the elapsed deadline.
  New evidence cannot be overwritten solely because status is unchanged.
- Only explicit no-error acknowledgement of the exact expired row confirms
  cleanup. Lookup/update transport exceptions return an unconfirmed result.
  Reads and expiry writes use the existing checkout time budget; provider retry
  options and budget duration remain unchanged.

Processing, requires-capture and succeeded intents are still retained; cleanup
does not cancel or refund them. Known unpaid cancellation states and cancellation
followed by an authoritative re-read remain supported. An unsupported or
unconfirmed cancellation state blocks cleanup rather than silently confirming
it. Card-review preparation stops before retrieving a new confirmation token
when cleanup is unconfirmed. No new automatic financial replay is introduced.

## Verification

| Check | Result |
| --- | --- |
| Regular regression gate | 1,276 passed, zero failed/skipped: previous 1,212 plus 64 new cases |
| Focused cleanup/shared-proof cases | 64, included above |
| Installed PostgreSQL suite | Twelve scenarios, thirteen TAP results |
| Node22 typecheck and optimized build | Passed in a fresh unlinked copy with synthetic settings |
| Schema/generated integrity | Current 96-migration fingerprints match; no migration |
| Shared local preservation | All 110 public row sets, functions, ledger, constraints, policies, private buckets and scan switches unchanged |
| Existing development application | Login available, HTTP200 after normal redirect |

The SQL suite interleaves the actual cleanup helper with installed service-role
reads/writes and collection triggers on one disposable connection. A temporary
invoker helper captures errors without changing application functions/grants;
the scenarios require zero SQL errors, so a held-state expectation cannot pass
because its bridge query failed.

Actual SQL cases cover unsubmitted review expiry, verified unpaid cancellation,
already-cancelled expiry, retention of processing/successful provider states,
response loss after the actual expiry write, same-status submission/provider/
deadline changes before expiry, cancellation racing successful provider payment,
missing received amount, and an unidentified creating attempt. Lost expiry
acknowledgement recovers on re-read without another cancellation. Changed
submission/deadline snapshots require a new lookup; a changed binding remains
held when the old provider object cannot verify it. Every invoice remains sent
with its original balance and no new payments; this helper does not perform
webhook accounting.

Provider responses are synthetic. A successful provider status in these tests
does not represent an actual charge or independently verified ledger entry.
All customer/invoice/checkout and associated trigger writes roll back in one
outer transaction with per-scenario savepoints. There are zero real provider
requests or customer communications. These are deterministic same-connection
interleavings, not simultaneous transactions, independently committed recovery,
actual network loss, live Stripe or hosted HTTP/Auth proof. Existing concurrency
and hosted acceptance gates remain separate.

## Scope and remaining boundaries

Runtime edits are limited to stale cleanup/expiry in
`src/lib/stripe/card-payment.ts` and three unpaid comparisons in
`src/lib/payments/checkout-closure.ts`. Card confirmation, review creation,
payment-preference handling, webhook accounting and employee UI are preserved.
New focused and opt-in SQL tests, README instructions and an appended existing
roadmap entry accompany this package.

No SQL, RLS/grants, transaction/lock order, lease/retry
duration, principal/fee calculation, idempotency identity, offboarding,
dependency, configuration or credential changes. No automatic release of an
unidentified held attempt is added; supervised outcome reconciliation remains
necessary. Card-review creation and payment-preference receipt adoption remain
separate follow-ups. No hosted query/write, deployment or production action
occurred. The new package is saved locally pending push. Scanner, paired
restore/operator and actual hosted staging requirements remain open.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/card-cleanup-confirmation/`.

Primary references checked:
[Stripe intent cancellation](https://docs.stripe.com/api/payment_intents/cancel),
[intent object](https://docs.stripe.com/api/payment_intents/object), and
[Supabase update/returned rows](https://supabase.com/docs/reference/javascript/update).
Installed SQL remains authoritative for collection rules and permissions.
