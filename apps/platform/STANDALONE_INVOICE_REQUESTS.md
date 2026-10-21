# Retry-safe standalone invoices

October 20, 2026. Invoice edit confirmation `6c3287d` is pushed to main and its
preserved branch with deployment skipped. This PR04 follow-through is local on
`codex/standalone-invoice-requests`, based on that main. No app deployment or
hosted database operation occurred.

## Problem and behavior

The new-invoice form already retains a submission UUID through draft recovery.
The standalone server path ignored it and called the low-level draft command
again on each submission. It created a new customer/address before the invoice
and appended notes/history afterward. Losing a successful response could lead
to another invoice, and later failures could leave partial work. This is an
implementation gap, not a claim of a production incident. A rollback-only control
confirms that the low-level command intentionally creates different drafts on
repeated calls; explicit duplication keeps using that existing command.

Standalone creation now sends the existing request ID to one authenticated
transaction. Optional new customer/address, invoice/lines, attachable internal
note, creation history and a private request receipt commit together. Repeating
identical details by the same active staff member returns the original invoice.
Changed details or another actor cannot reuse it. Distinct request IDs still
permit intentional separate invoices.

The transaction locks the request identity, rechecks live office access after
waiting, and checks replay before creating a customer or checking contacts.
Sorted transaction locks serialize this command's duplicate email/phone checks
across different new-customer requests. They do not introduce global contact
uniqueness or coordinate unrelated customer-creation commands.

The existing financial command still validates party/location ownership and line
arithmetic and computes draft totals. Standalone headers cannot import work-order,
source or recurring links, or override financial state, tax or numbering. An
organization without a customer/location retains the existing unattached-note
warning. Attachable note or required history failure now rolls back the whole
submission instead of reporting partial success. Notes share the existing
work-order command's 20,000-character transaction budget.

The private ledger stores a SHA-256 input fingerprint, actor, invoice and result;
it does not duplicate contact details or note text. RLS, a restrictive deny policy
and revoked direct table privileges protect it. The public command has a fixed
empty search path, five-second lock timeout and authenticated execute only, with
the existing live staff predicate. No blanket privileged client is introduced.

The server confirms the envelope, request ID, invoice UUID, party/location, replay
and note flags and supported status before success; a first result must be draft.
A five-second abortable deadline never triggers automatic retries or compensating
deletes. Uncertainty keeps the form request and recovery copy. Explicit retry
checks that saved request. Replay uses the existing invoice-review state without
clearing recovery. Voided invoices are returned for review; deleted invoices are
never silently recreated.

## Verification

| Check | Final result |
| --- | --- |
| Regular regression gate | 1,670 passed, zero failed/skipped; 40 new action/protocol checks |
| New installed-SQL suite | 24 scenarios / 25 TAP results passed in a fresh local database |
| Existing invoice edit suite | 16 scenarios / 17 TAP results passed on the shared disposable app stack |
| Full original migration chain | 98 files replay successfully; public types add only the new RPC |
| Isolated Node 22 typecheck / optimized build | Passed with synthetic settings, no copied keys or linked state |
| SQL lint / security comparison | No SQL errors; unchanged 42 WARN / 541 INFO; zero new findings |
| Fresh 97 → 98 catalog | 12 additive entries; zero existing changes/removals |
| Shared disposable upgrade | Same additive delta; native 68-entry legacy ledger preserved |
| Existing local data/configuration | All 110 public row sets match; buckets and scan switches unchanged |
| Loopback Data API | Anonymous and service-role execution actually denied with `42501`; no fixture created |
| Existing app | Login HTTP 200 after the normal redirect |

Installed SQL covers owner/admin/estimator/payroll access, no-role/inactive/anon/
service denial, party/source and duplicate-contact validation, new-customer replay,
individual/organization billing, line failure and mandatory note/audit/request
receipt failures. A lost action response discards a real successful SQL result,
then recovers the original invoice through explicit retry with identical input.

Five two-session tests observe an actual advisory-lock wait before releasing the
first transaction. They cover committed identical replay, first-attempt rollback,
changed concurrent payload, separate requests sharing new-customer contacts, and
access revoked while waiting. Each verifies one complete invoice/request and one
pair of creation audit events, or the expected denial with no invoice. These are
independently committed PostgreSQL transactions, not browser/issued-JWT, real
network loss, provider or hosted runtime acceptance evidence. Application Auth and
lookup/response adapters remain controlled in the action tests.

Synthetic commits occur only in an owned database named `ats_standalone_fresh_*`.
The shared app stack received the reviewed additive DDL, schema-cache reload,
rollback-only old invoice tests and read-only denial probes. No new invoice
request/business fixture was committed there. Existing definitions/ACLs were
compared by catalog keys; expected function/policy/constraint hash changes are
fully explained by the additions. No shared reset, history repair or old migration
edit occurred. Sequence counters may advance during rollback-only tests.

## Scope and release boundary

Runtime changes are the standalone branch in `src/app/admin/invoices/actions.ts`
and server-only `src/lib/invoices/standalone-request.ts`. Migration
`20261021022314_standalone_invoice_requests.sql` adds its private ledger, deny
policy and command. Public types/manifest were regenerated from a fresh replay.
New tests/fixture, this report, staging source inventory and test instructions
complete the package. The prior invoice-edit fixture gains only an unused
creation-helper dependency stub.

Work-order/quote generation, explicit duplication, invoice editing, payment/void
transactions, financial formulas, Stripe, notifications, employee UI/offboarding,
old RLS/grants, dependencies and credentials remain unchanged. The unusual
new-customer-with-work-order preamble is outside this standalone command and was
not refactored here. No provider request, collection, email, hosted database
query/write, configuration change or deployment occurred.

Migration 98 is local only and explicitly deferred for separate staging review.
ATS staging remains at 97; historical candidate hashes/readiness flags are
unchanged. New app code requires the command and fails closed on an unmigrated
target. Next is focused staging-98 reconciliation after this package is reviewed
and pushed. Scanner connection, paired source-file restore/operator evidence and
protected hosted runtime acceptance remain separate release prerequisites.

This package is saved locally pending push. Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/standalone-invoice-requests/`.
