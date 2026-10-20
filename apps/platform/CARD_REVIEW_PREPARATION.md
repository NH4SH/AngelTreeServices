# Card review preparation and organization billing compatibility

October 20, 2026 · existing PR03/PR07 follow-up · local verification only

## Decision and findings

Verified stale cleanup `091bd25` is pushed to main and its preserved branch.
This scanner-independent package continues the same collection-safety work on
`codex/card-review-preparation`, based on that main.

Card review creation could report ready after an incomplete insertion receipt,
including a response with no usable review ID. Existing-review reuse coerced
monetary values and did not check all invoice/party/token bindings. Active-list
validation could occur after an earlier review had already been closed. The
first 49 controlled preparation cases passed 11 and failed 38 against the old
source. No production occurrence, actual charge, loss or SQL/RLS bypass is
asserted; later confirmation and SQL safeguards already remained in place.

**A compatibility regression in the earlier caller guards was also found and
corrected.** The bank helper introduced in `3b43338` and card reservation guard
introduced in `4c399fa` incorrectly required a non-null individual customer.
The installed July organization-contracting migrations explicitly allow an
organization with `customer_id = null`. Five targeted organization-only flow
tests failed against those guards. Those earlier packages were not deployed;
production was not changed. Their historical test counts did not establish
organization-only compatibility. This report supersedes that assumption.

## Resulting behavior

- A retrieved confirmation token must match the requested token and configured
  mode before active reviews are replaced or a new review inserted. Existing
  stale cleanup still runs first under its separately verified safeguards.
- Existing review lookup requires an explicit no-error response and explicit
  null to establish absence. A reusable review must have a canonical UUID, the
  selected invoice/party/token, card channel/currency, unsubmitted/unbound open
  state, matching card details and integer principal/fee/gross, and a usable
  timestamp within the existing review-age check. Reuse does not renew its age.
- Every active reservation is checked for a complete distinct identity and
  requested invoice before any is closed. Submitted/processing attempts remain
  blocked; eligible unpaid replacements use the existing shared closer.
- Insertion now returns the persisted review fields and must confirm the same
  promised context and amounts before reporting ready. Missing/partial receipts
  never invent a review ID. Lookup/insert/closure exceptions return a safe
  unconfirmed-review response.
- Bank and card guards share the installed exactly-one-contracting-party rule:
  one customer **or** one organization. Explicit nulls are required for the
  absent side; neither, both, missing and unusable party fields are rejected.
  Organization invoices keep `customer_id = null`; no customer is fabricated,
  no ownership is reassigned, and provider metadata keeps the organization.

The review step does not submit money. The existing separate confirmation step,
charge arithmetic, fee exclusions, review lifetime, permanent token uniqueness,
provider idempotency identity and webhook accounting remain. An insertion whose
acknowledgement was lost can be recovered by the customer's normal same-token
retry, which reuses the saved review rather than inserting another. A real
unique conflict still returns unconfirmed initially; a subsequent same-token
retry can recover the winning review. No automatic insertion/charge replay or
guard release is added.

## Verification

| Check | Result |
| --- | --- |
| Regular regression gate | 1,343 passed, zero failed/skipped: previous 1,276 plus 67 new cases |
| New preparation cases | 60, included above |
| Additional bank/card compatibility cases | Seven, included above; one older organization-replacement fixture also corrected to a valid organization-only party |
| Installed PostgreSQL suite | Thirteen scenarios, fourteen TAP results |
| Node22 typecheck and optimized build | Passed in a fresh unlinked copy using synthetic settings |
| Schema/generated integrity | Current 96-migration fingerprints match; no migration |
| Shared local preservation | All 110 public row sets, functions, ledger, constraints, policies, private buckets and scan switches unchanged |
| Existing development application | Login available, HTTP200 after normal redirect |

Actual helper calls interleave installed service-role SQL and collection triggers
on one disposable connection. Cases cover new/reused review preparation, lost
receipt and transport response after insertion, safe prior-review replacement,
an unconfirmed prior closure, processing holds, fee changes, stale principal,
an owner void lease and a real unique-token conflict. Expected SQL denials are
checked for their exact codes; other scenarios require zero SQL errors.

A prepared review ID is accepted by the existing confirmation helper using
synthetic provider responses. Separate organization-only cases prepare and
confirm a card review, and create/verify/reuse a bank checkout. These fixtures
create an organization-owned invoice **without creating a customer record**.
The saved reservation and provider metadata retain the organization and null
customer. The old individual-customer-only guards fail the new focused cases.
Ordinary customer billing, debit/prepaid/unknown/international fee exclusions,
live-mode consistency through synthetic adapters, closed-review blocking and
transport containment remain covered. The actual review route refuses an
incomplete saved review instead of returning success without a review ID.

All customer/organization/Auth/profile/role/invoice/checkout/lease/trigger writes
roll back in one outer transaction with scenario savepoints. Provider behavior
is synthetic; there are zero real requests, charges or customer communications.
The confirmation case checks request/response and SQL compatibility, not actual
browser 3DS or webhook accounting. Same-connection interleavings and a staged
unique conflict do not establish multi-connection concurrency, independently
committed recovery, actual network loss, live Stripe or hosted HTTP/Auth proof.

## Files and remaining boundaries

Runtime edits: review preparation and the card reservation party guard in
`src/lib/stripe/card-payment.ts`; the bank party guard in
`src/lib/stripe/invoice-checkout.ts`; and the shared party predicate in
`src/lib/payments/checkout-closure.ts`. Exact request-context checks and all
earlier confirmation/cleanup safeguards remain. New unit/opt-in SQL tests,
organization cases in the existing bank/card tests, test instructions and
historical compatibility notes accompany the package. The existing roadmap is
appended rather than replaced.

No SQL/RLS/grant, financial transaction/lock order, pricing/fee rule, retry or
lease lifetime, webhook, offboarding, employee UI, dependency, configuration or
credential changes. The party predicate follows existing constraints; it adds no
new permission or anonymous access. Ambiguous legacy billing still requires
review. Payment-preference receipt adoption remains separate, as do scanner,
paired restore/operator and real hosted staging prerequisites. No hosted query,
deployment or production action occurred. This package is committed locally
pending push; the organization correction is not yet on remote main.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/card-review-preparation/`.

Reviewed references:
[Stripe token retrieval](https://docs.stripe.com/api/confirmation_tokens/retrieve),
[token object](https://docs.stripe.com/api/confirmation_tokens/object), and
[Supabase insert/returned rows](https://supabase.com/docs/reference/javascript/insert).
The installed organization-contracting migrations define party validity.
