# Mobile proposal creation request safety

## Result

The verified invoice-generation/completion fix `cda3361` was pushed atomically,
without force, to main and its preserved branch. This PR05/PR12 follow-through
is local on `codex/mobile-quote-requests`, based on main `e6bb075`. The independent
website update on main is preserved. New work is saved pending push; no app
deployment or hosted database/configuration/production operation was performed.

Updated mobile proposal creation uses the same installed migration99 request
transaction as web creation. No migration, SQL, RLS, grant, pricing, audit or
production setting changes are included.

## Behavior and compatibility

- The new `POST /api/mobile/quotes/draft` path requires a valid request UUID and
  the existing office authorization. A distinct path matters: an older server
  could otherwise ignore a new field on its old create endpoint and write an
  unprotected duplicate. New clients never fall back to the legacy path.
- Existing mobile clients without a request ID retain their current create
  endpoint. Deliberate proposal duplication remains on its existing endpoint;
  this patch does not claim to make that separate workflow idempotent.
- One editor retains the same ID through errors, retries and validation
  corrections. It never silently substitutes another ID. SQL atomically binds
  the identity to the actor and payload: if a proposal was already saved,
  changing the submitted details is rejected instead of creating another draft.
  A correction after a validation rejection can still succeed with that ID if
  nothing was saved. There are no automatic retries.
- The shared request helper verifies the transaction acknowledgement, including
  request ID, party, property, revision, line identities and replay status. The
  mobile response adds `creationRequestId` and `creationReplayed` only after a
  fresh detail read through the signed-in user's RLS client. Uncertain writes
  and post-save read failures retain the editor and request.
- Swift validates the echoed ID, replay flag and proposal UUID before accepting
  creation. A confirmed first save keeps the existing callback. A replay opens
  the existing read-only proposal preview and retains entered work, without
  acknowledging those entries as a new save or dismissing the editor. This is
  safe even if another user has subsequently edited or approved the proposal.
- Older cached details decode without the optional creation fields. Existing
  atomic editing, revision conflicts, scope/line ordering, cents, contacts,
  parties, service locations and permission checks remain intact.

## Verification

- **2,027 regular results passed** (1,988 prior +39 new endpoint/adapter checks).
  These include all previous invoice, completion, quote editing and web draft
  recovery checks. New cases cover malformed IDs/receipts, legacy creation,
  office roles, unauthorized callers, organization contacts, timeout/exception,
  failed detail reads and safe error responses without diagnostics.
- **17 installed database scenarios /18 TAP results passed**, using actual staff
  SQL commands and ownership/detail reads through authenticated RLS. Owner,
  admin, estimator and payroll admin work; organization contacts/property are
  retained. Lost/exceptional acknowledgement recovers one proposal. Replays
  return later edits/approval for review. Changed payload/actor, inactive staff,
  revoked office roles, anon and service-role execution are denied. Audit or
  receipt insertion failure rolls back the quote, lines, history and receipt.
  Each case and the enclosing transaction roll back; no synthetic rows remain.
- **15 Foundation-only Swift API/model checks passed**, including five new
  checks. The repository test bodies were compiled with the actual model/API
  sources and a private assertion adapter because Command Line Tools has no
  XCTest framework. URLProtocol supplies synthetic responses: no provider or
  production request is sent. These checks cover stable IDs, validation
  corrections, receipt echoes, replay, missing/foreign acknowledgements, old
  server 404/405, server/network failure, malformed local IDs and old clients.
- Native Swift model/API typechecking and SwiftUI editor syntax parsing passed.
  **A full Xcode/iOS build, native XCTest run and device/Simulator interaction
  remain unverified:** this Mac has Command Line Tools, without Xcode/XCTest.
- Isolated Node22 typecheck and optimized build passed with synthetic settings.
  Offline schema99 fingerprints and whitespace checks passed. Shared local
  admin remains HTTP200; unsigned new mobile creation returns HTTP401.
- All110 pre-existing local public row sets and database functions, policies,
  constraints, native ledger, buckets and scanner switches exactly match the
  pre-test baseline. Hosted staging stays last verified99 and unchanged.

The application/SQL integration uses a local transaction bridge and synthetic
principals; this is not a new issued-JWT mobile-device acceptance test or a new
committed concurrency suite. Migration99's existing lock/transaction boundary
is reused unchanged.

## Files, commands and remaining work

Runtime: `src/lib/api/mobile-quotes.ts`, `src/lib/data/mobile-quotes.ts`, the new
mobile draft route, plus iOS `FieldModels.swift`, `MobileAPIClient.swift` and
`ProposalEditorView.swift`. Tests: `mobile-quote-request.test.mjs`,
`mobile-quote-request.integration.test.mjs`, the shared quote fixture, and iOS
`MobileAPIClientTests.swift`. Test instructions are in `tests/README.md`.

Run the platform unit suite, typecheck, build and offline schema check with
Node22. The integration suite requires `MOBILE_QUOTE_DISPOSABLE=1`,
`MOBILE_QUOTE_DOCKER_BIN` and the established disposable Docker socket; see its
explicit guards. Native Swift tests remain in the existing Xcode test target.

The request identity is **in-memory for the open editor**, not durable across
closing it, process termination or device restart. The editor explains that
proposals must be reviewed before starting another draft after closing an
uncertain save. Persistent, user-scoped mobile draft/attempt recovery and retry
protection for deliberate mobile duplication are the next bounded follow-ups;
this patch does not introduce an unreviewed on-device store of customer data.

The new endpoint and migration99 must be present before releasing the updated
iOS app. An older server refuses safely, but cannot support this new operation.
Full iOS acceptance and existing hosted runtime/provider/scanner/restore gates
remain outstanding. No release-readiness claim is made.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-21/mobile-quote-requests/`.
