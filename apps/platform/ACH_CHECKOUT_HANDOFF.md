# Bank checkout handoff safety

October 20, 2026 · existing PR03/PR07 follow-up · local verification only

**Compatibility follow-up:** the initial caller guard required an individual
customer and incorrectly rejected organization-only invoices supported by the
existing schema. The historical checks below did not cover that case. The shared
party correction and new organization-only bank/card SQL tests are documented in
`CARD_REVIEW_PREPARATION.md`; that locally verified follow-up supersedes this
package's party assumption without changing database constraints.

## Decision and reproduced issue

Checkout closure package `02b0cb2` is pushed to main and its preserved feature
branch. This package continues the same collection-safety work on
`codex/ach-checkout-handoff`, based on that main. It requires no scanner, migration
or hosted service change.

The bank checkout helper previously accepted a truthy publication response such
as `{}` or a different row ID, then returned a payable URL. It also treated
incomplete lookup/insertion receipts as sufficient to attempt further work and
accepted a new provider URL without checking the returned session's invoice,
reservation, amount and mode bindings. Controlled tests reproduce these caller
gaps: the first 45 cases passed 15 and failed 30 against the previous source.
No production occurrence, loss or SQL/RLS bypass is asserted.

## Resulting behavior

- Active lookup requires an explicit successful response, either an explicit
  null row or a complete reservation for the requested invoice. Incomplete rows
  and missing response fields cannot authorize an insert or provider request.
- New insertion must acknowledge the requested party, invoice, amount, currency,
  bank channel and unsubmitted/unbound creating state before Stripe is called.
  Transport failures return the existing unavailable response without disclosing
  backend diagnostics or clearing the existing guard.
- New session responses must match the requested reservation/invoice, payment
  mode, live/test mode, unpaid open state, amount and currency. Provider reference
  and expiry shapes must be usable. Nullable, string and expanded intent
  references remain supported. This checks the returned session binding; it does
  not independently query a string intent or establish its current payment state.
- Publication requires an explicit no-error acknowledgement of the exact row.
  Its compare-and-set also binds invoice and requires provider/submission fields
  still empty, preserving intervening payment evidence. No payment link is
  returned after an unconfirmed publication.
- New/reused URLs must be absolute HTTPS URLs without embedded credentials.
  Custom checkout domains remain supported. A correctly identified new session
  without a usable URL retains its reference on the creating row where the
  existing write succeeds, so staff can review it.
- Existing current checkouts are verified and reused. An unpaid old checkout
  with changed amount, gross, party, organization, currency or channel must pass
  the existing safe closer before replacement. Extending those comparisons is
  the only additional interaction change: a stale checkout is no longer reused
  solely because its principal and channel match. No invoice is repriced or
  billing party changed by this helper.

Lost insertion acknowledgement leaves the single creating guard; retry does not
call Stripe. Lost publication acknowledgement can recover by looking up and
verifying the same open provider session. Unknown provider outcomes retain the
guard and require existing review. The provider idempotency key, database active
reservation uniqueness and bounded retry policy remain unchanged. No automatic
release or guessed payment replay is introduced.

## Verification

| Check | Result |
| --- | --- |
| Regular regression gate | 1,153 passed, zero failed/skipped: previous 1,094 plus 59 new cases |
| Focused handoff cases | 59, included above; actual portal route refuses a URL after unconfirmed publication |
| Installed PostgreSQL suite | Ten scenarios, eleven TAP results |
| Typecheck and optimized build | Node22, successful in an unlinked export using synthetic settings |
| Schema/generated integrity | Current 96-migration fingerprints match; no migration |
| Local preservation | All 110 public row sets, functions, ledger, constraints, policies, buckets and scan switches unchanged |
| Existing development app | Login available, HTTP200 after normal redirect |

The SQL suite interleaves the actual helper with installed service-role
reads/inserts/updates and collection triggers on one disposable connection. A
temporary invoker helper captures SQL errors without changing application grants
or functions. Synthetic provider responses exercise normal creation, reuse after
lost publication, lost insertion, provider uncertainty, missing URL, and an
intervening processing transition that wins the publication compare-and-set.
Actual SQL rejects stale principal, wrong billing party and collection against a
void invoice; that invoice is voided through the installed owner workflow. A
deterministically inserted winning reservation produces a real unique conflict;
the helper rereads and reuses it without another provider create.

All writes, including synthetic Auth/profile/role, invoice/checkout, lease and
audit records, roll back in one outer transaction with scenario savepoints.
These are controlled response-loss and transition/conflict interleavings, not
independently committed recovery, actual network loss, simultaneous connections,
hosted HTTP/Auth or live Stripe proof. There are zero real provider requests or
customer communications. Existing concurrency and hosted acceptance gates remain.

## Scope and preservation

Only `src/lib/stripe/invoice-checkout.ts` changes runtime behavior. The existing
staging-hostname test now supplies complete canonical row/provider responses and
still verifies both staging return URLs and the requested amount. New focused and
opt-in SQL tests, README instructions and an appended existing roadmap entry
accompany the change.

No SQL, RLS/grant, financial transaction, balance calculation, fee policy,
idempotency identity, offboarding, employee UI, webhook, dependency, configuration
or credential changes. Public portal authorization, origin and shared rate-limit
checks remain unchanged. Card preparation and payment-preference receipt adoption
remain separate follow-ups; this is not a claim that every payment caller is now
covered. No hosted query/write, deployment or production action occurred.

The new package is saved locally pending push. Scanner, paired restore/operator
and actual hosted staging acceptance remain separate prerequisites; no release
flag is enabled.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/ach-checkout-handoff/`.

Reviewed current primary references:
[Stripe session creation](https://docs.stripe.com/api/checkout/sessions/create),
[session object](https://docs.stripe.com/api/checkout/sessions/object), and
[Supabase select/returned rows](https://supabase.com/docs/reference/javascript/select).
Installed SQL remains authoritative for collection locks, grants and receipts.
