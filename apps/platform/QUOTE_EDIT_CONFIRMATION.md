# Quote edit save confirmation

## Decision and scope

Follow through on PR05 atomic quote editing and PR12 draft recovery. The database
already saves the header, ordered lines and required audit in one transaction.
Both web and mobile callers must confirm that transaction's response before
acknowledging an edit. No migration, permission, pricing or deployment change.

Staging reconciliation commit `277945b` was pushed atomically and without force to
main and `codex/staging-standalone-98`. This package is based on main `6393f85`,
including its independent website update. It is saved locally pending push.

## Reproduced problem

Controlled adapters around the actual previous web action and mobile data function
accepted valid-shaped responses for another quote or for the submitted revision.
The web action also archived its source lead. These tests demonstrate response
validation gaps; they do not demonstrate that the installed SQL generated such a
response. Both clients now reject all four reproductions without archiving.

## Change

- A shared server-only helper calls the existing `save_quote_details` command once,
  with a five-second abortable deadline. Exceptions, ambiguous envelopes and lost
  acknowledgements return an uncertainty error. There is no automatic replay.
- Success requires explicit `error: null`, the requested UUID, a safe revision
  greater than the submitted revision, complete distinct UUID line identities, and
  positional matches for retained lines. Revisions can advance by more than one:
  the installed line/header triggers determine the revision.
- Invalid or duplicate persisted identities, and duplicate/empty web client
  identities, stop before writing. New line identities must be unique. Removed
  lines remain governed by the existing database command.
- Valid conflict details remain separate from success. Web draft recovery and
  save-and-close navigation still depend on confirmed success; source-lead
  archiving remains after confirmation. Mobile rereads the requested proposal
  only after confirmation, with existing conflict/error API codes preserved.
- The shared shape parser now rejects malformed UUIDs, arrays, mixed conflict
  results and case-insensitive duplicate IDs. Existing create callers retain
  their workflows and are covered by the regression suite.
- Known authorization, stale-edit and linked-record rejections use safe guidance;
  backend transport diagnostics are not sent to the user.

Files: `src/lib/quotes/save-confirmation.ts`, `src/lib/quotes/edit-result.ts`,
`src/app/admin/quotes/actions.ts`, `src/lib/data/mobile-quotes.ts`, the new
`tests/quote-edit-confirmation*` fixture/suites and the existing PR12 session
test adapter. The quote form, SQL, RLS, production settings, employee UI, payment,
notification and scanner features remain unchanged.

## Verification

- **1,770 regular results passed**, including 91 new adversarial web/mobile
  confirmation checks. Cover malformed/foreign/stale/mixed responses, mapping,
  conflicts, navigation/context, source-lead archiving order, preflight failures,
  deadlines and exceptions.
- **15 installed SQL scenarios / 16 TAP results passed** in the existing disposable
  database. Actual commands execute as owner, admin, estimator and payroll admin;
  retained/new/removed lines, repeat saves, exact returned revisions and mandatory
  audit counts are checked. Stale versions, inactive/nonstaff users, anon/service
  callers, approved quotes and foreign lines remain denied. Synthetic loss after
  the actual SQL write retains uncertainty; explicit old-version retry produces
  a conflict and no second edit audit. Web and mobile use the shared confirmation.
- Each SQL scenario uses a savepoint within one rolled-back transaction. No
  synthetic business/Auth records remain. All 110 existing public table row sets,
  function definitions, constraints, policies, native ledger, buckets and scan
  switches exactly match the before-test baseline.
- Isolated Node 22.23.3 typecheck and optimized Next.js build passed with synthetic
  configuration. All eight source/test overlay hashes match the working files.
  Incoming main changed neither the app tree nor Supabase. Offline schema
  fingerprints remain at 98. Whitespace check passed; no lint script is configured.
- Existing local sign-in endpoint responds HTTP 200. No app deployment, hosted
  database query/write, provider call, email or collection was performed.

Repeat the regular suite with `npm run test:unit`. The opt-in installed SQL suite:

```sh
DOCKER_HOST=unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock \
QUOTE_EDIT_DISPOSABLE=1 \
QUOTE_EDIT_DOCKER_BIN=/Users/noelsierra/.local/opt/docker-pr02/docker/docker \
node --conditions=react-server --experimental-strip-types --test \
  tests/quote-edit-confirmation.integration.test.mjs
```

Private reproduction/build/SQL/preservation evidence is in
`/Users/noelsierra/Documents/Codex/2026-10-20/quote-edit-confirmation/`.

## Limits and next priority

The new suite uses controlled response adapters and actual installed SQL inside
rollback-only transactions. It is not a new browser/mobile-device acceptance run
or an independently committed concurrency test; existing PR05 transaction tests
remain part of the regular suite. Uncertainty cannot prove whether a remote
transaction committed. Users must compare the saved quote before retrying.

Continue PR05/PR12 follow-through by reviewing durable request identity for new
quote creation, where a lost acknowledgement can encourage a duplicate draft.
Keep it distinct from edit retries, which already have optimistic revision
protection. Scanner hosting and the remaining hosted rollout gates stay separate;
staging remains at 98 and hosting readiness is unchanged.
