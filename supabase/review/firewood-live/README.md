# Live Firewood SQL review candidate

## Current verified review state — October 30, 2026

The complete local candidate now consists of four review units: `boundary.sql`,
`office-workflows.sql`, `accounting.sql`, and `reporting-accounting.sql`. It adds
**ten private live tables** and **19 restricted public commands**. It includes
an office UI, immutable invoice issuance separate from delivery, and an audited
full-principal cancellation credit after eligible refund/checkout review.
Credits do not count as paid money or refunds. Reports retain original invoice
issuance and post a separate negative credit on the credit creation date.

The customer/office wire is `firewood-office-live-v2` at
`/api/integrations/firewood/live/v2/office/{price-request,price-status,order-status}`.
The separate frozen live financial-v1 and staging/sandbox-v2 contracts are not
renamed or silently upgraded. Old office-v1 proofs do not certify office-v2.

The focused native102 rehearsal, narrow original reconciliation dispatches,
source-derived permission/catalog comparison, accounting races and ten-table
write-fence tests passed. The implementation and remaining release gates are in
`apps/platform/FIREWOOD_ISSUANCE_AND_BILLING_IMPLEMENTATION.md` and
`apps/platform/FIREWOOD_ACCOUNTING_SECURITY_REVIEW.md`.

All review SQL is still outside migration ledgers. These files are **not an
installer** and must not be applied to a hosted target from this directory.
Installation requires the exact approved102 preimage, reviewed terms/receipt
prerequisites, no existing live handoffs for the new issuance unit, explicit
inactive bindings, actual ten-table guard/paired-recovery enrollment and fresh
five-minute recovery evidence. There is no automatic backfill, source seed,
credential installation, runtime admission, provider request, refund or send.

The earlier base/office notes below are retained as design history. Their phase
counts, missing-UI and pending-native-test statements describe those earlier
phases; the current state above and linked implementation report supersede them.

## Earlier base and office-phase design notes

The separate inactive office extension is now in `office-workflows.sql`, with its
office page/actions, signed draft bridge, lifecycle-aware status, delivery-window
records and cancellation review. See
`apps/platform/FIREWOOD_OFFICE_WORKFLOWS_REVIEW.md` for verified behavior. Apply
neither file to a hosted target from this review package.

The extension preserves `boundary.sql` and the original financial commands. Its
narrow clean cancellation path calls the existing guarded invoice-void commands
inside the office transaction only with zero payment/checkout history. Positive
balances with historical money remain held for billing closure; no credit,
refund or zero balance is invented. Both phases together add nine private live
tables requiring fresh actual guard/backup enrollment and recovery verification.

This directory is a local implementation and review package. It is outside both
the global application migrations and the separately approved staging ledger.
`boundary.sql` is deliberately **not a production installer**. Nothing has been
applied to staging or production. No source row, credential, payment, message,
activation flag, runtime authority or release certificate is installed.

The SQL requires the explicit `ats.firewood_live_review` session value
`isolated-synthetic-only`. That opt-in supports owned rehearsal databases; it is
not evidence that a production target or release is safe. There is no generated
migration version. A later actual migration must be created through the CLI and
bound to an independently verified target, approved preimage and maintenance
window.

## Independent live boundary

The fixed identities are:

- Contract: `firewood-invoice-handoff-live-v1`.
- Source: `website_firewood_invoice_live_v1`.
- Logical environment: `ats_firewood_live_v1`.
- Merchant: `acct_1Tv92EI7tY6VHUvU`, with live mode required.
- Document terms: `firewood-household-live-2026-10-29-v1`.
- Payment policy: `firewood-payment-options-live-2026-10-29-v1`.

Actual database identity, app/source release, generation, schema seal, signing
identity, key custody and recovery authority remain unassigned. The logical
environment name does not substitute for these checks.

The five new private tables hold sources, immutable accepted handoffs, append-only
payment snapshots, append-only financial observations and trusted office price
approvals. Their names begin with `firewood_live_`. RLS is enabled and direct API
table rights, including service-role rights, are revoked. Only six fixed public
handoff/collector commands permit service-role execution; they require both the
service database role and a null end-user identity. Public/private function ACLs
are narrowed explicitly, with empty search paths. Frozen sandbox/staging v2
tables, constraints, functions, ACLs and source rows are preserved.

Source, collection, dedicated surcharge and sender flags start false. The SQL
does not insert a source at all. Live routes also have no installed runtime
dependencies. Source `enabled` is the installed integration boundary: a future
pause of **new** orders must close the preparation/runtime gate and collector,
while retaining authenticated status/receiver/reconciliation when the write
guard permits. Turning the entire source off also closes its status/renewal API.

## Office-approved prices

An arbitrary Website approval UUID cannot reduce a price. The separate
`approve_firewood_live_price(text,jsonb,text,uuid)` command requires an authenticated
effective CRM owner/admin, using the existing role/access predicate. It takes the
same `platform-role-management` transaction lock as employee access changes
**before** checking that predicate. Service-role callers cannot issue or revoke
approvals.

The command validates the exact live catalog, terms, payment policy and household
order. It stores a generated approval identity/time, approving CRM actor, reason,
24-hour expiry, source and order identity, and the complete proposed order apart
from `accepted_at_ms` and `office_approval`. Thus the authority binds prices,
quantity, stacking, customer contact, delivery address, notes, terms and policy
without a circular accepted-order hash. A second request key cannot silently
replace the same order's approval. Changed pricing/contact/terms needs a new
reviewed order identity.

The response contains the four accepted approval fields plus `expires_at`; the
Website must omit `expires_at` from its exact four-field acceptance assertion.
Preparation checks the trusted row under lock, consumes it on the newly created
invoice in the same transaction, and permits exact same-invoice replay. Revocation
is available before consumption and is audit logged. Expired/revoked assertions,
cross-order use and changed accepted fields fail closed. Accepted prices and
historical approvals cannot be edited, deleted or reset.

There is no new office UI in this SQL package. A separately reviewed existing CRM
office action can call the authenticated command; it must preserve the actual
user identity and cannot substitute an integration credential.

## Invoice and money behavior

Preparation serializes by the same source/order advisory key used by approval
issuance, then locks any approval. It resolves only an exact unambiguous active,
unarchived residential contact and unarchived delivery location, and never
overwrites customer/address records. Ambiguous or commercial matches go to office
review. It creates one invoice, lines, encrypted short-lived capability, handoff
mapping and audit record in one transaction. Any later audit/constraint error
rolls the transaction back.

The dedicated business invoice number is deterministic and unique:
`INV-FW-<complete uppercase order UUID>`. It is not a synthetic prefix or a new
sequence. Full accepted payload/contact/address/terms remain immutable. Invoice
amounts, customer/location associations, terms, reference, number and lines cannot
be edited through generic commands. Moving a line out of a protected invoice is
also blocked. Generic void is denied for accepted live orders until a coordinated
Firewood cancellation/refund command exists; legacy and sandbox invoice behavior
is unchanged.

Renewal rotates a capability on the same invoice and makes versioned retries
idempotent; a revoked capability requires review. Capability validation requires
exact fields, bounded encrypted content and a nonnull valid UTC expiry in the
one-to-31-minute issuance window. No replacement debt is created.

Financial reads include all payments, checkout attempts, private refund
observations and immutable original-paid proof. Financial observation uses a
compare-and-set over that entire ledger, so a newly pending refund invalidates an
older paid observation. Pending bank payments, refunds, disputes and returned
money cannot authorize fulfillment or repayment. Payment history captures actual
shared-ledger success; original-paid proof survives later refunds. The existing
Stripe receiver, invoice-first apply transactions, receipt delivery ownership and
payment reconciliation routines are not rewritten here. The reviewed earlier
bank/refund handling fixes remain prerequisites in the focused source closure.

## Focused 102-base release dependency

The actual current production baseline is 102 migrations. This candidate must not
be installed by running the repository's 129-file global migration chain. The
sealed earlier focused packet rehearsed only three separately reviewed units
over that 102 baseline, including the immutable-terms prerequisite and the
102-adapted payment-ID receipt repair. This live package adds its own independent
objects; it does not alter or relabel that packet or its schema observer proof.

The preserved named invoice-terms constraint must exist before this candidate
adds its live family. The original effective-access helper, shared financial
tables/refund ledger, invoice schema and relevant financial security triggers
must match the reviewed preimage. A future focused installer must explicitly
reconcile all prerequisites and preserve existing owners/ACLs, then derive a new
actual postimage and enroll **all** new private tables in the existing write and
backup guards. The old 142-table seal and old recovery certificate cannot be
reused for this new topology. Fresh schema/source/permissions readback, measured
joint Website/CRM five-minute off-device recovery, and expired prior writer
permits remain release gates.

## Verification and remaining release gates

`apps/platform/tests/firewood-live-sql.test.mjs` uses in-memory PGlite only. It
starts no listeners, reads no credentials and calls no provider. It executes the
SQL to check service/user authorization, private ACL/RLS, all catalog totals,
terms/policy/contact guards, trusted price approval, revocation/expiry, atomic
rollback, same-invoice replay/renewal, original-paid retention and refund-aware
CAS. A coexistence check compares all 13 frozen v2 function definitions/ACLs and
old table constraints/source rows before and after the candidate. A signed
handler-to-native-adapter-to-real-SQL test exercises preparation, replay, renewal
and unpaid/paid/pending-refund outcomes with one invoice and one local synthetic
payment. Sender and provider gates remain closed.

These tests do not claim simultaneous-session concurrency, real live merchant
surcharge capability, actual production schema compatibility, provider key
custody, continuous recovery freshness or delivery of real messages. Native
concurrent offboarding-versus-price-approval, prepare/revoke/renew and
refund-observation races remain required during the owned final release
rehearsal. A coordinated cancellation workflow, runtime admission loader, office
action/UI, actual inactive installation and activation each need their concrete
implementation/review and separate rollout authorization. No automatic refund,
automatic cancellation, email replay, new Stripe collector or source activation
has been introduced.
