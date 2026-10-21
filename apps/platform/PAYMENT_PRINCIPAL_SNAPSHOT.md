# Complete invoice principal snapshot — local verification

October 20, 2026. Portal-payment package `907c551` is pushed to main and its
preserved branch, deployment skipped. This follow-up is local on
`codex/payment-principal-snapshot`, based on that main, within the existing
PR03/PR07 financial-read safety work. No scanner dependency.

## Decision and changes

The preceding package correctly refused incomplete payment histories. It also
left a practical limitation: an invoice with more successful payments than the
configured Data API row cap could not be paid online safely through that reader.
Independent page reads could mix changing balances. This package removes that
row-download dependency with one narrow read-only aggregate.

Migration97 (`20261021012859_invoice_payment_principal_snapshot.sql`) adds only
`public.get_invoice_payment_principal(uuid)`. The invoker/stable function requires
service_role with no end-user subject, uses an empty search path, and grants
execute only to service_role among application roles. Browser/anonymous execution
is denied. It does not gain execution of the existing private balance helper,
change RLS, alter existing grants, create indexes or write any business row.

A single statement joins the requested invoice to its successful payments and
returns invoice identity, successful payment count and net paid principal.
Refund, lost-dispute and combined-adjustment clamp arithmetic matches the
existing private SQL function exactly. Surcharges remain excluded, active/won
and warning disputes retain paid principal. Missing invoices return null rather
than an invented empty balance; existing invoices without payments return the
identified zero aggregate. The existing invoice-id payments index supports the
query. Response size stays constant; database work still scales with matching
payment rows and the existing response deadline remains.

The server reader keeps its existing name and error/result shape, but calls this
RPC once with its typed invoice argument and abort signal. It requires explicit
error:null, one object for the exact invoice, nonnegative safe integer count and
principal, and a principal no larger than the count times the installed maximum
per-row integer amount. Unknown, missing, coerced or unsafe receipts fail closed.
No raw-payment fallback, guessed zero, paging, retry, balance mutation, charge or
notification is added. Portal ownership/expiry/account checks, processing holds,
cleanup, monetary commands and their locks/rechecks remain unchanged.

The generated public contract and migration hash manifest come from a fresh
empty97-migration replay. The historical staging candidates93–96 retain their
original bytes and trust boundaries. The new migration is explicitly hash-pinned
in `supabase/staging/deferred-migrations.json`, with hosting readiness still false.

## Verification

| Check | Result |
| --- | --- |
| Regular regression gate | 1,557 passed, zero failed/skipped |
| Focused suite evolution | Previous context123 becomes116 for the aggregate protocol; 23 new snapshot checks are added |
| Fresh97 PostgreSQL and upgraded shared local stack | 18 cases / 19 TAP results passed on each |
| Loopback Data API smoke | Server call200/null for an absent synthetic UUID; anonymous call denied42501 |
| Fresh schema generation / offline fingerprints | 97 migrations; generated diff adds only the new RPC |
| Node22 typecheck / optimized build | Passed in an unlinked copy with synthetic settings |
| Security/performance advisors | Identical fresh96 before/after findings: 42 WARN / 541 INFO, zero new findings |
| SQL lint | No error results |
| Existing local application | Login responds HTTP200 after normal redirect |

The shared suite now exercises the actual aggregate and cleanup helper using
service-role SQL response adapters. It sums 1,005 one-cent successful payments
on a 5,000-cent invoice and confirms 3,995 cents collectible, without downloading
payment rows. Smaller partial/refunded/lost/won/overlapping payment cases match
`app_private.invoice_paid_principal`; fully paid/draft/expired/revoked and active
creating/processing cases remain held. Organization-only fixtures need no
individual customer. The aggregate's actual anonymous/authenticated grants and
privileged-client-with-subject rejection return42501; a null argument returns
22023. Invoker, stable, search-path and private-helper non-grant properties are
checked. A read-only transaction accepts the query for an absent synthetic UUID.
No fixture read is allowed to pass merely because the SQL bridge had an error.

Regular tests keep the context's invoice/token/processing/route safety checks and
existing math cases. Obsolete individual-row response-shape negatives were
replaced by aggregate identity/count/amount/envelope checks; they are not claimed
as additional new coverage. The new dedicated cases assert that no payments
list is read or internally retried, including unavailable RPC/deadline cases.
Actual bank/review/confirm route adapters still stop on an unconfirmed snapshot.

All SQL fixture records and temporary helper roll back with per-case savepoints
and one outer transaction. The local API smoke uses only an absent synthetic
UUID and existing loopback credentials without printing them; it creates no
records and reads no customer invoice. These tests are not proof of independently
committed/concurrent transactions, a populated invoice through actual PostgREST,
network loss, live Stripe/3DS, webhook or hosted Auth acceptance. One aggregate
snapshot is not a transaction across the separate context reads or a collection
authority. The existing initial invoice-display lookup can still load a bounded
embedded payment list; that list is not used for the new principal calculation.
This package does not optimize that display payload. Existing installed monetary commands still recheck real state.

## Preservation and installation boundaries

The reviewed migration was applied only to the shared disposable local database
by a targeted transaction. Its legacy native68-entry ledger was retained, as in
prior local reconciliations; a blanket migration-up/reset was not run. A separate
fresh database replayed all97 repository migrations to generate the contract.
All110 public row sets, existing function definitions and execution grants,
constraints/triggers, policies, private buckets, scan switches and native ledger
remain unchanged. Exactly one new function/grant entry was added. The aggregate
schema hash changes for that reviewed addition; no existing function was replaced.
The local Data API schema cache was refreshed only on this disposable stack.

No hosted query/write, staging installation, deployment or production action
occurred. No financial formula, fee, checkout/void transaction, webhook,
offboarding/employee UI, environment variable, dependency or credential changed.
Existing untracked Impeccable work is preserved. New package is local pending
push; the previous portal-payment package is already on main.

The next step is staging reconciliation/review for migration97, preserving the
active Auth email guard, exact current target identity/ledger, default grants and
empty/off state before any explicitly authorized staging-only installation.
The new reader fails closed on a target that lacks the RPC; application release
must wait for that reconciliation. Historical candidate96 must not be treated
as approval of97. Scanner connection, paired restore/operator checks and hosted
runtime acceptance remain separate release prerequisites. No release flag is
advanced here; veterans pricing decisions remain separate.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/payment-principal-snapshot/`.
[Supabase database functions and execution security](https://supabase.com/docs/guides/database/functions)
were checked alongside the current changelog and the installed principal SQL.
