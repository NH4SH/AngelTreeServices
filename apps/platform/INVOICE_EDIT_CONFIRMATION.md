# Invoice edit confirmation

October 20, 2026. Staging reconciliation `06db0ed` is pushed to main and its
preserved branch with deployment skipped. This follow-up is local on
`codex/invoice-edit-confirmation`, based on that main. It continues the existing
PR03/PR05 financial editing and PR12 draft recovery work.

## Problem and result

The previous invoice action treated any truthy `save_invoice_details` data as a
confirmed save. Its success state lets the existing form acknowledge its recovery
copy, clear dirty state, update persisted line identities or navigate away.
A controlled comparison with the previous committed action reproduced:

- Missing revision: success with no next revision.
- Empty line mapping: success with no confirmed persisted line identities.
- A different invoice identity: success and navigation on Save and close.
- Missing error status: success and navigation on Save and close.
- Missing line mapping: an exception while processing the response.

These are application response handling defects, not proof of a database
authorization bypass, production incident or incorrect committed amount.

The editor now confirms an explicitly successful response, the exact invoice ID,
a finite full timestamp, and a complete ordered list of distinct UUID line IDs.
Retained line IDs must match the submitted positions. Duplicate client identities
or invalid revision/line identities stop before a write. The database timestamp
is preserved as text, including its microseconds and timezone; conversion to
JavaScript Date would lose the revision precision needed by the existing SQL.

The existing staff client calls the existing atomic command once, with unchanged
pricing, due-date and line payloads. Generated arguments check the request shape;
the narrowly documented null due-date override follows the installed SQL.
A five-second deadline passes an abort signal to the request. Missing, malformed,
errored, thrown or timed-out responses return an error state before cache
invalidation, draft acknowledgement or navigation. Known stale/access/constraint
errors retain plain-language guidance. Transport diagnostics are not exposed.

An unconfirmed write may already have committed. There is no automatic retry,
claim of rollback, guessed revision, extra money command or secondary repair
write. The user keeps their unsaved copy and is directed to reload and review
before saving again. Existing optimistic concurrency remains authoritative.

## Verification

| Check | Result |
| --- | --- |
| Full regular regression gate | 1,630 results passed, zero failed/skipped; includes 65 new action/protocol checks |
| Installed local SQL integration | 16 scenarios / 17 TAP results passed |
| Isolated Node 22 typecheck / optimized build | Passed with synthetic configuration and no copied credentials or linked state |
| Offline generated schema / migration fingerprints | Match the unchanged 97-migration contract |
| Existing local data | All 110 public row sets exactly match the before snapshot |
| Existing local schema/configuration | Functions, ledger, constraints, policies, buckets and scanning switches unchanged |
| Git alignment | Based on fetched main `06db0ed`; unrelated Impeccable work preserved |

The real disposable database suite invokes installed SQL as authenticated staff,
anonymous and service roles. It covers an individual invoice, organization-only
billing, retained/new/removed lines, a second save using returned identities,
partial successful payment balance, stale revision, paid/void locks, pending
payment and creating/open/processing checkout fences, inactive account and foreign
line denial. It verifies invoice totals, party, line counts, update audit counts,
payment counts and absent source events. Void fixtures use the actual existing
begin/finalize workflow rather than bypassing its trigger.

Lost-response and thrown-response scenarios discard a real successful SQL result:
the action returns an error, the actual save remains visible within the fixture,
and an explicit retry with the old revision is rejected with `40001`. Only one
update audit exists. This is controlled response loss inside one rollback
transaction, not a network interruption or independently committed concurrency
test. Application auth/initial lookup are test adapters; SQL rechecks actual role
and account state. These tests are not issued-JWT/browser or populated public
PostgREST acceptance evidence. Existing UI success gating was inspected; no UI
layout or component was changed.

All fixture records and the temporary SQL helper roll back. Sequence counters
may advance on rolled-back inserts. No shared database function, trigger or grant
was changed. No hosted database query/write, provider request, collection, email,
deployment, production change or service configuration operation occurred.

## Files and boundaries

- `src/app/admin/invoices/actions.ts`: only the edit action delegates confirmation
  and consumes confirmed revision/identity mappings.
- `src/lib/invoices/save-confirmation.ts`: server-only bounded save and response
  validation using the existing command.
- `tests/invoice-edit-fixture.mjs`: reusable action adapter, including real SQL bridge support.
- `tests/invoice-edit-confirmation.test.mjs`: positive/negative response, navigation,
  exact request, auth, revision, mapping, exception and timeout checks.
- `tests/invoice-edit-confirmation.integration.test.mjs`: rollback-only installed
  command scenarios; explicitly opted into the existing disposable stack.
- This report and the integration command in `tests/README.md`.

Standalone creation, job generation, SQL financial math/locks, RLS/grants, Stripe,
notifications, employee/offboarding UI, dependency files and credentials are
unchanged. Creation acknowledgements/idempotency remain separate from this edit
boundary. No new migration or staging reconciliation is required for this work.
Scanner connection, paired restore/operator proof and protected hosted runtime
acceptance remain separate release prerequisites; readiness is not advanced.

This package is saved locally pending push. Private verification evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/invoice-edit-confirmation/`.
