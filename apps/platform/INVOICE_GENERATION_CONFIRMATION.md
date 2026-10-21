# Work-order invoice and completion confirmation

## Result and scope

Staging99 reconciliation `b996850` is pushed atomically/nonforce to main and its
preserved branch. This PR04/PR09 follow-through is local on
`codex/invoice-generation-confirmation`, includes main `ec84d94` and its separate
website update, and is saved pending push. No migration, hosted operation or app
deployment is required or performed.

The existing invoice-generation and explicit-completion transactions already
provide durable request identities and permission/transaction boundaries. This
change verifies their responses and source relationships before acknowledging,
refreshing or navigating. Their SQL and financial behavior are unchanged.

## Reproductions and change

Controlled adapters around the actual previous actions demonstrated that job,
quote and manual work-order invoice entry paths could navigate to an unverified
invoice UUID. Combined completion refreshed nine paths before rejecting a
malformed invoice result. These reproduce caller-side validation gaps, not a
claim that installed SQL returned an unrelated invoice in normal operation.

`generation-confirmation.ts` now owns the single command call and confirmation:

- Require an explicit successful envelope and a complete typed result. Arrays,
  coerced status values, malformed identities and contradictory new-paperwork
  completion/status flags cannot acknowledge generation.
- Use the signed-in caller's existing Supabase client to read the returned invoice
  and confirm its work-order ID. Job requests bind directly to the requested job.
  Quote requests also confirm the requested quote's job link; the existing legacy
  reverse `jobs.source_quote_id` link remains supported. No service client or new
  permissions are used.
- Explicit completion binds both the top-level job and completion context to the
  requested job, checks completed metadata/review revision/counts and validates
  the invoice before any refresh or redirect. Completion-only remains unbilled.
  Existing advanced billing/job statuses and saved-receipt semantics are retained.
- One abortable five-second deadline covers the command and confirmation reads.
  Missing/denied/failed reads, malformed results, exceptions or timeouts retain
  uncertainty and the saved request. No automatic replay, compensating delete,
  email, collection or audit outside the existing transaction is added.
- Existing/new/replayed invoice routing, status guidance, return context, party
  validation, future-visit confirmation and office-role restrictions remain.

Historical pre-PR09 request receipts can contain `job_completed: true`, because
invoice preparation used to complete jobs. These are still accepted for
**review-only replay** after source verification. A new paperwork response with
that flag is rejected. Retrying an old receipt neither re-completes the job nor
creates a replacement invoice.

## Verification

- **1,988 regular results passed**, including140 new action-level confirmation
  checks. Cover malformed/foreign receipts, RLS-scoped lookup failure, job/quote
  links, legacy reverse links, existing invoices in all six billing states,
  completion context/source consistency, historical receipts, deadlines,
  exceptions, role/session failures and success-only navigation/refresh.
- **22 installed SQL scenarios /23 TAP results passed** in one rolled-back local
  transaction, with per-case savepoints. Actual generation plus actual
  authenticated invoice/source reads work for owner, admin, estimator and payroll
  admin. Quote-to-existing/new work order, reverse-linked existing invoice, manual
  existing-party lines, lost/exceptional acknowledgement, denied post-save read,
  explicit completion, future-visit confirmation, stale review, inactive/revoked
  office access and anon/service-role denials are covered.
- Exact retry after a successful SQL write but lost acknowledgement returns the
  same invoice without another creation audit. A historical stored receipt flag
  is tested inside a savepoint. Invoice/audit/payment counts and completed-job/
  visit footprints are checked: preparing paperwork leaves scheduled work open,
  completion-only creates no invoice, and combined completion closes only after
  the existing confirmation rules pass. No provider calls or synthetic rows remain.
- Isolated Node22 typecheck and optimized build passed with synthetic settings;
  all final source/test overlays match the built bytes. Offline schema99 and
  whitespace checks pass. Incoming main changes neither app nor Supabase source.
- All110 existing shared-local public row sets, function definitions, policies,
  constraints, native ledger, buckets and scanning switches exactly match the
  pre-test baseline. The local sign-in endpoint remains HTTP200.

The tests use actual action functions with controlled response adapters, and
actual installed SQL/RLS reads with local synthetic subjects. This is not a new
issued-JWT/browser/mobile-device lost-network acceptance run or a new independent
committed transaction race suite. Existing transaction tests remain in the full
regression suite; no SQL concurrency boundary changed.

## Files and remaining work

Runtime files: `src/lib/invoices/generation-confirmation.ts`,
`generation-request.ts`, `src/lib/actions/workflow.ts`, `job-completion.ts` and
`src/app/admin/invoices/actions.ts`. New tests/fixture:
`tests/invoice-generation-confirmation*`; existing invoice-edit, standalone and
void test adapters receive the new dependency. No UI component, migration,
generated schema, production configuration or prior feature was changed.

Run `npm run test:unit`, `npm run typecheck`, `npm run build` and
`npm run schema:check:offline`. The installed SQL suite requires
`GENERATION_CONFIRMATION_DISPOSABLE=1`, the established disposable Docker socket
and `GENERATION_CONFIRMATION_DOCKER_BIN`; it rejects an alternate socket. Run it
with Node22, `--conditions=react-server --experimental-strip-types --test` and
`tests/invoice-generation-confirmation.integration.test.mjs`.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-20/invoice-generation-confirmation/`.

An additional read can fail after the transaction commits; that is deliberately
reported as uncertainty, with the same saved request available for safe recovery.
The result does not echo the request ID; existing SQL remains responsible for
actor/payload binding. Invoice status can advance concurrently after the receipt,
so source identity is verified without requiring the current status to equal an
older receipt. Frozen completion snapshots retain their existing replay meaning.

This does not move the separate new-customer-plus-work-order preamble into the
invoice transaction. Next bounded PR05/PR12 follow-through: bring mobile quote
creation onto migration99's durable request boundary while preserving older API
clients. Staging remains last verified99; existing hosted advisor decisions,
scanner and other rollout gates are unchanged. Production is untouched.
