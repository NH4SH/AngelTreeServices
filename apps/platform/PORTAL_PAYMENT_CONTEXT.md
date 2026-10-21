# Portal payment context — local verification

October 20, 2026. Follow-up within the existing PR03/PR07 payment safety roadmap.
Payment-preference package `9d2d3f1` is now pushed to main and its preserved
branch, deployment skipped. This package is on `codex/portal-payment-context`.
The concurrent website-only main update `746c8f3` was also preserved by a fast-
forward before committing. Its committed CRM tree exactly matches the tested
base, and the final source/test overlay still matches the successful isolated
build. No scanner dependency or new deployment setup.

## Problem and decision

The shared portal context is used by bank checkout, card review and card
confirmation. Its successful-payment reader treated missing data as an empty
history and summed values without checking the complete response. A default
Data API row cap could silently omit satisfied principal. The context also
accepted malformed expiry dates, numeric strings for invoice totals, unconfirmed
processing absence and incomplete relation/identity responses. Several thrown
reads could escape instead of returning a safe unavailable result.

These are readiness/response safety gaps, not evidence that the installed SQL
collection guards can be bypassed. Those existing guards remain authoritative
for actual reservation, amount, party and payment transitions. Controlled tests
compare new expectations against the committed original reader/context; they
exercise unavailable/malformed/truncated responses as well as normal compatibility.
The original-source comparison has 118 non-timeout expectations: 58 pass and
60 fail; these are test expectations, not 60 distinct vulnerabilities. The five
deadline cases are final-only because the old reads were unbounded. They do not
demonstrate a real production overcharge or malicious Data API.

## Changes

- Successful-principal reads request an exact count in the same query as their
  rows. Explicit error:null, an array, and count equal to returned row length
  are required. Missing data is no longer silently converted into no payments.
  Capped or incomplete histories fail safely instead of overstating collection.
- Every row must have a distinct UUID, exact invoice identity, succeeded status,
  actual integer amounts and the installed refund/dispute constraints. The
  existing net-principal function and its combined-adjustment clamp remain.
  Surcharges are still excluded, active/won disputes retain paid principal, and
  lost disputes restore only disputed principal. The sum must remain a safe
  integer. Unknown reads return a fixed message without backend diagnostics.
- The invoice read must match the portal lookup, contain a valid exactly-one
  customer or organization, valid nonnegative integer total, known status and
  matching account relation. Selected contacts/jobs must be usable to-one
  relations; null/object/zero-or-one-item array forms remain supported, multiple
  possible identities are held. Selected missing fields are not invented.
- Token confirmation requires explicit error:null, matching invoice/party,
  explicit null revocation and null or a finite future expiry. Invalid/missing
  expiry dates no longer pass. The existing ownership predicate remains.
- Cleanup must positively return ok:true. Its financial rules/budget and actual
  closer are unchanged. The following processing check must return either
  explicit null or an identified invoice-bound creating/processing row. Unknown
  reads stay unavailable; known processing still blocks collection.
- Initial lookup and direct invoice/token/payment/processing reads have five-
  second response deadlines. Direct database queries receive an abort signal.
  Exceptions become the existing safe failure shape. No retry/write is added.

Success fields and the shared bank/card alias remain. To-one relations are
normalized internally to object/null; downstream route adapters accept both
forms already. Accounts-payable, billing-contact, customer and organization email
priority remains. Online limit, payable statuses, origin/body/rate checks,
preference confirmations, provider reservation/confirmation, locks, idempotency
and webhook reconciliation remain unchanged.

## Verification

| Check | Result |
| --- | --- |
| Regular regression gate | 1,541 passed, zero failed/skipped (previous 1,418 plus 123) |
| Installed PostgreSQL suite | 15 scenarios / 16 TAP results passed |
| Final Node22 typecheck / optimized build | Passed in an unlinked copy with synthetic settings |
| Schema contract | Current 96-migration fingerprints match; no migration |
| Local preservation | All 110 public row sets, functions, ledger, constraints, policies, buckets and scan switches unchanged |
| Existing local application | Login responds HTTP200 after normal redirect |
| Preserved website update | 158 public Node checks and nine stylesheet Python checks passed |

New regular checks cover exact/missing/foreign/duplicate/incomplete reads,
invalid or revoked expiry, coercible monetary values, missing adjustment fields,
refund/lost/won/active dispute math, combined clamps, unpaid/paid/overpaid/large
amounts, processing rows, deadlines/abort, contained exceptions and canonical
organization billing. Actual bank/review/confirm route handlers accept the
confirmed organization context and refuse capped history before their existing
next step. Those downstream provider operations are controlled adapters.

Installed-SQL scenarios run the actual context, principal reader and existing
card cleanup helper against selected-response adapters backed by service-role
queries on one disposable connection. Successful arithmetic is compared to the
installed private SQL principal function as a local oracle; its execution grants
are unchanged. Individual and organization-only fixtures work without inventing
an individual customer for organization billing. Revoked/expired links, draft/
fully paid invoices, creating/processing reservations and a controlled capped
history are held. Positive/negative scenarios all require zero SQL bridge errors,
so a broken query cannot count as a successful safety denial. Invoice totals,
fixture payment counts and payment-preference/source-event absence are checked.

All records and the temporary SQL helper roll back with per-scenario savepoints
and one outer transaction. No real provider requests, new collections, messages,
remote queries or hosted writes occur. This is not independent commits,
simultaneous transactions, actual PostgREST row-cap behavior, hosted HTTP/Auth,
network-loss recovery, real provider/3DS or webhook acceptance. Initial portal
lookup is controlled in the SQL suite; the subsequent token/account reads are
real SQL and remain service-only in the existing application.

## Scope and remaining boundaries

Runtime edits are confined to `src/lib/payments/portal-card-context.ts` and the
successful-payment reader in `src/lib/payments/reconciliation.ts`. The existing
reconciliation write command and follow-up planner are unchanged. Two older
reconciliation test fixtures include the new deadline import stub; they retain
their original write-command checks. New unit/route and opt-in SQL suites,
shared synthetic fixture and instructions accompany this package. The existing
implementation roadmap is appended. Untracked Impeccable material is preserved.

One complete read is intentional: independently paging mutable payment histories
would not establish a consistent balance. Histories exceeding the configured
Data API response cap now require review rather than using an incomplete sum.
A dedicated read-only aggregate/snapshot command is the appropriate follow-up
if those unusually large histories need online collection; no API cap or schema
setting is changed here. Separate reads still are not an atomic monetary
transaction; existing installed collection commands continue to recheck state.

No SQL/RLS/grants, pricing/fees, collection/void transaction, webhook, offboarding,
employee UI, dependency, credential, environment or service setting changed.
No deployment or production action occurred. This package is local pending push.
Scanner connection, paired restore/operator verification and real hosted staging
acceptance remain separate release prerequisites; local success authorizes no
rollout. Veterans discount decisions remain separate and no totals are changed.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/portal-payment-context/`.
Installed constraints and principal SQL define the compatible numeric/status
rules. [Supabase selection and exact-count documentation](https://supabase.com/docs/reference/javascript/select)
and the current changelog were checked; no SDK upgrade is required.
