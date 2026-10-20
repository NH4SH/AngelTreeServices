# Payment preference confirmation — local verification

October 20, 2026. Follow-up within the existing PR03/PR07 payment safety and
PR14 durable communications work; no competing roadmap or scanner dependency.
The preceding card-review/organization-billing package `87f007f` is now pushed to
main and its preserved branch, with deployment skipped. This package starts
from that main on `codex/payment-preference-confirmation`.

## Problem and decision

The bank checkout and card-review routes checked only a truthy RPC error when
saving a payment preference. Null, empty, foreign or partial successful-looking
responses could therefore authorize checkout creation or card review preparation.
The explicit preference form checked some result fields but did not require an
explicit successful error envelope or contain a thrown storage response. A
notification exception could also escape after an already successful save.

Controlled tests against the committed original routes reproduce 36 failures
among 73 non-timeout cases (37 pass). Two hanging-storage cases were excluded
from the old-route comparison because those routes had no preference deadline;
the final 75-case suite includes them. The installed command returns a one-row
TABLE array; the explicit form's existing wrapper returns a JSON object. These
are different contracts and remain distinct.

## Changes

- A small shared server helper runs each existing command with its existing
  arguments, a five-second abortable response deadline, and no internal replay.
  It requires explicit `error: null`, the correct response container, exact
  invoice identity and an explicit boolean `preference_changed`. The TABLE
  command must return exactly one row. Invalid invoice/token inputs fail closed.
- Bank/card routes require that confirmation before calling the existing bank
  checkout or card-review helpers. They retain the raw preference command and
  do not gain a notification dispatch. Source intents created by those older
  command paths retain their existing legacy hold.
- The explicit preference form keeps `record_invoice_preference_with_event`.
  A changed preference requires a UUID source event. A no-op may recover its
  saved UUID, or return explicit null for a legacy no-event selection. Missing,
  malformed and foreign receipts do not authorize notification handoff.
- A confirmed form save returns the existing successful response even if the
  notification helper throws or does not positively acknowledge preparation.
  Its `notificationFailed` field becomes true. The existing durable event and
  supervised delivery recovery remain the authority; no new event/key/send is
  invented. Only literal `prepared: true` confirms the handoff.

Preference storage uncertainty returns a safe 503 requiring refresh/review, with
no exception diagnostics or false rollback claim. This includes SQL rejections
on the form (previously 409), as well as malformed or unavailable responses.
Successful response fields, routes, four methods, origin/body checks, shared
rate limiting and initial portal validation remain. This is a confirmation
boundary, not a new transaction spanning preference selection and provider work;
existing payment/checkout locks and collection guards still own monetary safety.
Initial portal reconciliation may still inspect existing provider state before
the preference save; the new gate precedes new checkout/review preparation.

## Verification

| Check | Result |
| --- | --- |
| Regular regression gate | 1,418 passed, zero failed/skipped (previous 1,343 plus 75) |
| Installed PostgreSQL route scenarios | 16 scenarios / 17 TAP results passed |
| Final Node22 typecheck and optimized build | Passed in an unlinked copy with synthetic settings |
| Schema contract | Current 96-migration fingerprints match; no migration |
| Shared local preservation | Exact 110 public row sets, functions, ledger, constraints, policies, private buckets and scan switches unchanged |
| Existing local application | Login responds HTTP200 after normal redirect |

Installed-SQL scenarios run the real preference RPCs through actual route
handlers on one disposable connection. Downstream checkout/review preparation
and notification handoff are controlled adapters; they never call providers.
Tests simulate response loss and thrown transport after the SQL write, then
retry explicitly. The saved preference has one transition audit and one source
rather than duplicates; the explicit form reuses the exact original event ID.
Organization-only fixtures create an organization invoice/token without any
customer record. Expired/revoked tokens and unpayable invoices are rejected by
the installed command after a stubbed initial lookup; anonymous/authenticated
roles retain their real SQL execution denials. Positive paths require zero SQL
errors and negative paths assert exact expected SQL codes. Principal/balance
remain 1000 cents; there are no payment or checkout records from this suite.

Unit tests cover full response contracts, timeouts/abort, safe errors, all four
methods, malformed notification receipts, legacy no-ops, organization forwarding,
and existing origin/body/rate/portal denials. Earlier bank/card route fixtures
now supply real preference receipt shapes and assert they still reach the
intended downstream insertion/publication failure rather than passing early.
The full regular gate includes previous financial, offboarding, employee and
delivery safeguards. The existing local development build/session is preserved.

All SQL fixtures and temporary helper roll back in one outer transaction with
scenario savepoints. Sequence counters may advance on PostgreSQL rollbacks;
no business/event rows or configuration persists. These tests do not establish
simultaneous transactions, independent commits, actual HTTP/Auth sessions,
network-loss recovery, Stripe/3DS behavior or email transport acceptance.

## Scope and remaining work

Runtime changes: `src/lib/payments/payment-preference.ts` and the three portal
routes for payment preference, bank checkout and card review. New route/helper
and opt-in SQL suites, shared synthetic fixture, existing test fixture updates
and these instructions accompany them. No SQL/RLS/grants, pricing/fees, checkout
transaction, webhook, idempotency key, notification transport, employee UI,
offboarding, dependencies, environment variables or service settings changed.
No hosted query/write, real provider request, customer communication, deploy or
production action occurred. Existing untracked Impeccable material is preserved.

This package is local pending push. Scanner connection, paired restore/operator
acceptance and actual hosted staging gates remain separate release prerequisites.
The next review should assess a concrete remaining portal payment-context or
reconciliation gap, rather than repeat this receipt audit or treat local checks
as production acceptance. The pending veterans discount still requires its
separate business/tax decisions; this package changes no totals.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/payment-preference-confirmation/`.
The existing installed migrations define transaction and response contracts;
[Supabase RPC documentation](https://supabase.com/docs/reference/javascript/rpc)
was checked along with the current changelog. No SDK or schema upgrade is needed.
