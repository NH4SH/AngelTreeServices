# Mobile proposal copy retry safety

## Result and scope

Verified mobile creation protection `f67980c` was pushed atomically, without
force, to main and `codex/mobile-quote-requests`. This next PR05/PR12 follow-through
is local on `codex/mobile-duplicate-requests`, aligned with main, pending push.
All previous CRM and separate website work is preserved. No app deployment,
hosted operation or production change was performed.

## Behavior

For proposals with scope lines, “Duplicate proposal” now prepares one immutable
copy request from the details shown on screen. The request preserves contracting
party, property, both organization contacts, notes, ordered scope, quantities,
integer prices and the original future expiration. Expired dates are omitted
once, when preparing the request. Original line IDs, revisions, approval/sending
state, portal tokens and job/invoice links are not copied, matching the existing
mobile duplicate semantics.

The authenticated `POST /api/mobile/quotes/copy` endpoint uses the existing
migration99 request transaction through `createMobileQuote`. It preserves the
existing live office authorization, ownership/contact checks, mandatory history,
request locks, actor/payload binding and all-or-nothing writes. There is no new
migration, RPC, RLS, grant, financial rule or dependency.

The ordinary mobile editor endpoint was deliberately not reused: its 50-line
limit and text normalization could truncate an existing proposal. The copy
validator retains stored text, including whitespace/newlines, and permits the
existing SQL capacity of1,000 lines and its quantity/price ranges. SQL remains
authoritative for decimal precision, line amounts, total overflow and current
party/contact validity. Caller-supplied totals, original IDs and edit revision
are not used. Normal mobile create/edit validation is unchanged.

After a lost response, “Retry copy” sends the exact same snapshot and request ID.
Source edits or expiration after that first request cannot change the retry.
The Swift API checks receipt identity/replay/UUID; the copy model additionally
rejects the original proposal ID and inconsistent confirmed-copy IDs.

A confirmed first creation opens its saved detail. A replay opens read-only
preview, including if the copy was subsequently edited/approved. “Review saved
copy” reopens the confirmed result without another write. A separate “Create
another copy” confirmation starts a fresh intentional copy; its existing copy
remains. Cached-only source details cannot start a new snapshot copy. Retries
never silently fall back to an older endpoint or mint another request ID.

## Empty historical drafts and compatibility

Migration99 intentionally requires at least one scope line. Historical empty
drafts keep their existing legacy copy endpoint so the capability is preserved.
The updated screen permits one such request, validates the returned UUID, and
blocks another attempt in that screen if its result is uncertain. It asks for
manual proposal review instead. This is **not durable/idempotent recovery for an
empty copy**; that needs a separately reviewed database boundary. Older installed
clients also retain their legacy duplicate contract and do not gain this patch's
snapshot/retry protection until updated.

No legacy call is used as a fallback after a failed snapshot request. An older
server returns404/405 on the new copy path, without an unprotected replacement
write. The copy endpoint and migration99 must exist before releasing the new iOS
app. Existing hosted runtime/provider/scanner/restore and release gates remain.

## Verification

- **2,054 regular results passed**: the prior2,027 plus27 copy endpoint/validation
  checks. These cover unchanged ordinary creation, office/session denials,
  required identity, original whitespace/long scope, 51/1,000 lines, SQL-compatible
  quantity/price ranges, malformed input and safe errors without diagnostics.
- **22 installed SQL scenarios /23 TAP results passed** in the existing local
  suite. The copy cases invoke the actual copy route with a controlled auth
  context and actual authenticated ownership/detail reads and commands through
  the local SQL bridge. Lost/exceptional acknowledgement plus later source edits/
  expiration recover one copy; another explicit identity creates one additional
  copy. A51-line long-scope case verifies exact text. Empty legacy creation and
  history still work. Previous role, party, receipt, audit rollback and recovery
  scenarios remain. Every savepoint and the enclosing transaction roll back.
- **25 Foundation-only Swift API/model/service checks passed**, including10 new
  checks. They exercise immutable copy data, contacts, expiration, source/foreign/
  missing acknowledgements, later-approved replay, exact-body lost-response
  recovery, long scope/51 lines, old-server refusal without fallback, live service
  dispatch with a current session token, and legacy endpoint compatibility.
  Synthetic URLProtocol responses prevent provider/production traffic.
- The actual Foundation source files are compiled with Swift6. A private runner
  reuses the repository test bodies with an assertion adapter, plus the actual
  Auth protocol declaration; it does not emulate Supabase SDK/session behavior.
  SwiftUI detail syntax parsing passed. Full native XCTest, Xcode/iOS build and
  device/Simulator interaction remain unavailable because Xcode is not installed.
- Isolated Node22 typecheck and optimized web build passed with synthetic
  settings and no linked site/credentials. Offline schema99 fingerprints and
  whitespace checks pass. Local admin is HTTP200; unsigned copy creation is401.
- All110 pre-existing local public row sets and function definitions, ledger,
  policies, constraints, buckets and scanning switches match the pre-test
  baseline exactly. Hosted staging/production were not queried or changed.

These are real route/model/service and installed SQL/RLS checks, with controlled
transport/auth adapters. No new issued-JWT browser/mobile-device acceptance run
or committed concurrency suite is claimed. Existing migration99 lock/transaction
semantics are unchanged.

## Files and remaining work

Runtime files: iOS `ProposalDetailView.swift`, `FieldModels.swift`,
`MobileAPIClient.swift`, `FieldDataService.swift`; platform mobile quote input
validation and the new copy route. Tests extend `MobileAPIClientTests.swift`, its
existing service support, the installed mobile request suite, and add
`tests/mobile-quote-copy.test.mjs`. Existing editor/revision logic is preserved.

Run platform unit/typecheck/build/offline schema checks with Node22. The installed
suite is still `tests/mobile-quote-request.integration.test.mjs` with the existing
`MOBILE_QUOTE_DISPOSABLE=1`, `MOBILE_QUOTE_DOCKER_BIN` and exact disposable socket
guards; `tests/README.md` records its invocation. Native tests remain in the
existing Xcode target. No Xcode project regeneration was needed.

Copy request state is **in-memory while the source detail stays open**. Leaving
it or terminating the app loses the local identity; review proposals before
starting another copy after uncertainty. Pending mobile creation/copy draft
recovery across restarts remains the next bounded non-scanner priority. It
requires deliberate account/environment isolation and protected on-device
storage, not an unreviewed plaintext dump of customer details. Empty-copy durable
recovery and full iOS screen acceptance also remain open. Very large request
bodies remain subject to the hosting platform's transport limits.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-21/mobile-duplicate-requests/`.
