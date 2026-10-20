# CRM Usability Regression Checks

## Customer portal local acceptance

`portal-view-input.test.mjs` and the portal header regression run in the ordinary
unit gate. The opt-in suite uses real local Auth, PostgreSQL commands and anonymous
HTTP quote/invoice HTML plus view-tracking requests:

```sh
CUSTOMER_PORTAL_DISPOSABLE=1 \
CUSTOMER_PORTAL_LOCAL_STATUS_FILE="$CUSTOMER_PORTAL_STATUS_FILE" \
CUSTOMER_PORTAL_WEB_URL=http://127.0.0.1:3102 \
CUSTOMER_PORTAL_RESULTS_FILE="$CUSTOMER_PORTAL_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/customer-portal.integration.test.mjs
```

Only the existing loopback API port 54321 and app port 3102 are accepted. Tokens
are generated in memory and never logged. The suite revokes its own tokens and
signs out/disables only its own actor; its synthetic financial/audit history stays.
It never sends email, invokes Stripe, resets counters or changes scan switches.
Approval/replay and manual bookkeeping run their real database commands; browser
form submission and provider notification delivery are separate verification.
Next dev HTML uses `no-cache, must-revalidate`; the compiled source-copy check
separately requires private/no-store. Do not infer hosted CDN behavior from local
checks. See `../CUSTOMER_PORTAL_ACCEPTANCE.md` for exact evidence and scope.

## Dashboard employee query bounds

`employee-directory-reads.test.mjs` runs in the normal unit gate. It exercises
actual Supabase query encoding with 2,251 fixture employees, accountless/shared
accounts, later-batch results and visible errors without granting unknown clock
access. No network is used by that unit fixture.

`dashboard-employee-reads.integration.test.mjs` runs actual local Auth, RLS and
dashboard data functions. It expects the existing retained scale-test directory
with more than 1,000 rows; do not reset or truncate that stack to run this test.

```sh
DASHBOARD_READS_DISPOSABLE=1 \
DASHBOARD_READS_LOCAL_STATUS_FILE="$DASHBOARD_READS_STATUS_FILE" \
DASHBOARD_READS_RESULTS_FILE="$DASHBOARD_READS_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/dashboard-employee-reads.integration.test.mjs
```

Only loopback API port 54321 is accepted. The suite creates six marked actors,
globally signs out only those actors and disables/separates them afterward.
Existing employees, role rows, history, scan settings, schemas and the review
owner stay intact. One read failure is injected at the transport boundary; the
remaining requests use the real local services. No provider or hosted key is used.
See `../DASHBOARD_URI_READINESS.md` for actual request lengths and preservation.

## Local permissions and private files (October 20 acceptance)

The opt-in `permissions-private-files.integration.test.mjs` checks real local
Auth, Data API/RLS, Storage and HTTP delivery with fixed issued tokens and SSR
cookies. It covers seven roles, restricted documents, an assigned crew photo,
assignment removal, deactivation/reactivation, clock permission, actual signed
URL expiry, stale manifests and privacy headers on successes and errors.
The existing local ClamAV bridge must have fresh definitions. Do not weaken its
48-hour freshness check to make a fixture pass.

```sh
PRIVATE_FILES_DISPOSABLE=1 \
PRIVATE_FILES_LOCAL_STATUS_FILE="$PRIVATE_FILES_STATUS_FILE" \
PRIVATE_FILES_DOCKER_BIN="$PRIVATE_FILES_DOCKER_BIN" \
PRIVATE_FILES_WEB_URL=http://127.0.0.1:3102 \
PRIVATE_FILES_RESULTS_FILE="$PRIVATE_FILES_RESULTS_FILE" \
DOCKER_HOST=unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock \
DOCUMENT_SCANNER_URL=http://127.0.0.1:3311/scan \
DOCUMENT_SCANNER_TOKEN="$LOCAL_SCANNER_TOKEN" \
node --conditions=react-server --experimental-strip-types --test tests/permissions-private-files.integration.test.mjs
```

Use only the existing named disposable stack and private status file. Read the
scanner token privately from the existing local setup; never paste it into logs
or tracked files. Run sequentially with the document/attachment/upload suites:
they temporarily enable local scan gates and restore their original settings.
This suite signs out and disables only its own synthetic actors, archives its
own document fixtures and retains business/audit history. It makes no schema,
grant or RLS changes and does not reset the stack. The effective later definitions
are present in the iterative stack; its preserved native ledger is not a fresh
full-chain replay. See `../LOCAL_PERMISSIONS_PRIVATE_FILES.md` for evidence,
the initial legacy-test timestamp exception and hosted verification limits.

## PR17 complete reports and consistent exports

The normal unit runner includes reporting date, aggregate presentation, completeness, exact-filter and CSV tests. The integration suite is opt-in and refuses non-loopback Supabase / web targets. It creates uniquely marked synthetic records, retains their history, archives its own bulk quotes and retires only its own users. The existing review owner is preserved. No provider call or hosted migration is required.

Set the following variables privately to the existing disposable stack; never paste the status JSON or its keys into a report:

```bash
PR17_DISPOSABLE_STACK=1 \
PR17_LOCAL_STATUS_FILE="$PR17_STATUS_FILE" \
PR17_DOCKER_BIN="$PR17_DOCKER_BIN" \
PR17_WEB_URL=http://127.0.0.1:3102 \
PR17_RESULTS_FILE="$PR17_RESULTS_FILE" \
DOCKER_HOST=unix:///path/to/disposable/docker.sock \
node --conditions=react-server --experimental-strip-types --test tests/reporting.integration.test.mjs
```

The named local database container must be `supabase_db_ats_pr02_disposable`. Apply the new unpublished PR17 definitions only to that stack for iterative verification; use a separate empty database for full migration replay. Do not reset the shared review stack, disable triggers/RLS, raise statement timeouts, apply hosted migrations or enable automations. The suite validates complete 5,006-row exports, explicit 10,000-row combined refusal, stable-snapshot concurrent updates and issued-token authorization.

## PR16 supervised recurring and Calendar operations

The normal unit gate includes `supervised-operations.test.mjs`: exact positive
renewal acknowledgments and boolean-only, isolated worker readiness. Integration
coverage uses real local Auth, RLS, PostgreSQL locks, PostgREST and server actions.
Use the existing named disposable loopback stack with all **85 migrations**, through
`20261016192144_supervised_operations.sql`, and the local app on port 3102. Keep
the private CLI status JSON outside Git, mode 0600. From `apps/platform`:

```sh
PR16_DISPOSABLE_STACK=1 \
PR16_LOCAL_STATUS_FILE="$PR16_STATUS_FILE" \
PR16_DOCKER_BIN="$PR16_DOCKER_BIN" \
PR16_WEB_URL=http://127.0.0.1:3102 \
PR16_RESULTS_FILE="$PR16_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/supervised-operations.integration.test.mjs
```

Set `DOCKER_HOST` to the dedicated disposable Unix socket. The suite requires
`http://127.0.0.1:54321` and `supabase_db_ats_pr02_disposable`; it rejects hosted
API/web origins. It creates synthetic accounts/plans, retires only its own actors,
pauses only its own non-review plans and disables only its own fake Calendar
connections. Historical fixtures remain. One clearly labeled local review plan
is retained for browser verification; its ID is in the local result file.

Cases cover no-write preview/paging, every office role and denied audiences,
concurrent approvals, same-request replay/content collision, stale scope/price/
date/archive, audit rollback, null/duplicate/oversized inputs, real confirmation,
end-of-month/leap/DST/manual-season cadence and a disabled automatic-generation
flag. Calendar cases cover owner/admin-only projection, redaction, versioned
reasoned retry, reconnect/processing/stale denial, audit rollback, offboarding
during independent locks, stale reclaimed leases and deterministic event recovery.
The real service and database mappings run against a controlled Google gateway:
no real OAuth tokens, provider requests or customer messages are used. Required
failure constraints are removed in `finally`; RLS and triggers remain enabled.

Cycle-close tests keep the date helper private, check post-wait staff access and
protect PR15 automatic scheduling history against forged recurring links. Run
earlier integration suites sequentially to avoid shared fixture-recipient races;
never disable accounts owned by another active suite. Replay the complete chain
in a separate empty scratch database, not by resetting the live review stack.
See `src/lib/SUPERVISED_OPERATIONS.md` for guarantees and rollout limits.

## PR11 field loading and private photo signing

The normal unit gate includes `field-loading.test.mjs`: bounded/deduplicated batch
signing, exact path mapping, partial/missing/failed signatures, caller isolation,
metadata paging, cursor precision and view/date validation. F08's existing real
PostgreSQL-policy tests now adapt their Storage transport to the batch API; their
permission/category assertions remain intact.

Use the existing named loopback stack with **81 migrations**, through
`20261016144647_crew_field_job_pages.sql`. Keep the private local CLI status JSON
outside Git and mode 0600. From `apps/platform`, with the local app on port 3102:

```sh
PR11_DISPOSABLE_STACK=1 \
PR11_LOCAL_STATUS_FILE="$PR11_STATUS_FILE" \
PR11_WEB_URL=http://127.0.0.1:3102 \
PR11_RESULTS_FILE="$PR11_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/field-loading.integration.test.mjs
```

The suite accepts only the loopback API and web app, uses real Auth/JWTs, RLS,
PostgREST, private Storage and authenticated HTTP routes, and retires only its own
synthetic users. It retains historical records. Cases include work-visit vs header
dates, legacy/durable assignment, multi-day and overnight visits, cancelled/finished
visits, unscheduled and overdue work, DST boundaries, 205 equal-time history rows,
new inserts during paging, scope-bound cursors, owner/crew/disabled/anonymous
visibility, no detail expansion, partial private signatures with 900-second expiry,
all photo counts, native completed keysets and legacy cursor compatibility.

The benchmark compares the previous committed full read and current dashboard RPC
on the same caller/workload over three alternating samples. It records response
byte counts and timings without bodies, JWTs or signed URLs. Timing samples are
local evidence, not a production SLA. Run the existing PR03–10 and issued-JWT
regressions too; shared office-notification suites remain sequential. Replay the
complete migration chain in a separate empty database, never reset the review DB.
See `src/lib/data/FIELD_READS.md` for pagination and signed-link boundaries.

## PR10 provider outcomes and required photo history

The normal unit gate includes provider deadlines, checked reminder acknowledgments,
bounded notification pools, saved manual request identities, honest accepted/unknown
feedback, photo transport ambiguity and all five scheduled-wrapper guards. Providers
and request dependencies are controlled doubles; existing authorization regressions
remain enabled.

Use the existing named loopback disposable stack with all **80 migrations**, through
`20261016134622_checked_photo_upload_and_communication_outcomes.sql`. Keep the CLI
status JSON outside Git, mode 0600, and use the dedicated Docker Unix socket. From
`apps/platform`:

```sh
PR10_DISPOSABLE_STACK=1 \
PR10_LOCAL_STATUS_FILE="$PR10_STATUS_FILE" \
PR10_DOCKER_BIN="$PR10_DOCKER_BIN" \
PR10_RESULTS_FILE="$PR10_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/provider-outcomes.integration.test.mjs
```

The suite accepts only `http://127.0.0.1:54321` and the existing
`supabase_db_ats_pr02_disposable` container. It creates synthetic local identities,
retires only its own accounts, keeps RLS/triggers enabled and removes its targeted
failure constraints. Claim/stale-row transactions roll back to preserve unrelated
fixtures. Real Auth/JWTs, Storage, PostgREST and PostgreSQL verify all six categories,
mandatory audit rollback, forged/disabled/unassigned denial, independent skip-locked
claims, concurrent staff sends, accepted-but-unrecorded outcomes and unknown holds.
Only the Resend boundary is mocked; all other external network destinations are
blocked. No project `.env`, production worker, real email or payment is used.

Run the existing financial/scheduling/completion/offboarding suites sequentially as
documented below. A separate empty database replay must include all 80 migrations;
do not reset the active review stack. See `src/lib/email/PROVIDER_OUTCOMES.md` for
remaining PR14 delivery-race/durable-attempt boundaries.

## Atomic quote approval follow-up

The normal unit gate includes `quote-approval.test.mjs` (actual new migration,
PR05 commands and incumbent inactive-lead trigger in embedded PostgreSQL) and
`quote-approval-workflow.test.mjs` (actual staff/portal workflow module with a
controlled transport, verifying one command, displayed versions and uncertain
acknowledgments). Live authorization and transaction waits are separate below.

Use the existing disposable stack with all **77 migrations**, through
`20261016064442_atomic_quote_approval.sql`. Keep the local status JSON outside Git,
mode 0600, and the dedicated Docker Unix socket. With the local app on port 3102:

```sh
QUOTE_APPROVAL_DISPOSABLE_STACK=1 \
QUOTE_APPROVAL_LOCAL_STATUS_FILE="$QUOTE_APPROVAL_STATUS_FILE" \
QUOTE_APPROVAL_DOCKER_BIN="$QUOTE_APPROVAL_DOCKER_BIN" \
QUOTE_APPROVAL_WEB_URL=http://127.0.0.1:3102 \
QUOTE_APPROVAL_RESULTS_FILE="$QUOTE_APPROVAL_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/quote-approval.integration.test.mjs
```

Only the named disposable container and loopback API/web origins are accepted.
The suite creates synthetic identities/records, retires its own identities and
retains history. Narrow failure constraints are removed in `finally`; RLS and
application triggers stay enabled. It does not use project `.env` files, contact
production or send real money/mail. Cases include concurrent approval/editing,
one job across retries, competing quotes, post-wait deactivation, token expiry/
revocation, history rollback, archived-lead restoration, recurrence/material
planning, direct-write denial, staff-only legacy repair and PR04 compatibility.

Run previous financial/offboarding/quote suites too. Shared-recipient PR03/06/07
suites must run sequentially; cleanup must only retire their completed runs'
accounts. PR04 and PR05 retire their own accounts: a broad concurrent fixture
cleanup can deactivate another suite's active test actor and invalidate results.
Never reset the active review DB or disable authorization to fix such a harness
collision. See `src/lib/quotes/ATOMIC_APPROVAL.md` for the release contract.

## PR05 atomic quote editing

The regular unit gate includes `quote-editing.test.mjs`: both actual additive
migrations in embedded PostgreSQL, rollback/concurrency-token/grant checks, and
complete acknowledgment parsing. Its identity helpers are controlled fixtures;
live authorization and real row locking are checked separately below.

Use the existing loopback disposable stack with all **76 migrations**, through
`20261016060503_enforce_quote_edit_boundary.sql`. Never reset the active review
database just to run this suite. Keep the CLI status JSON outside Git, mode 0600.
From `apps/platform`, with the disposable web app on port 3102:

```sh
PR05_DISPOSABLE_STACK=1 \
PR05_LOCAL_STATUS_FILE="$PR05_STATUS_FILE" \
PR05_DOCKER_BIN="$PR05_DOCKER_BIN" \
PR05_WEB_URL=http://127.0.0.1:3102 \
PR05_RESULTS_FILE="$PR05_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/quote-editing.integration.test.mjs
```

The suite requires API `http://127.0.0.1:54321`, the dedicated Docker Unix socket
and container `supabase_db_ats_pr02_disposable`. It creates synthetic local Auth
accounts and draft records, disables only its own fixture identities afterward,
and retains their history. It temporarily adds narrowly targeted failure
constraints and removes them in `finally`; it never disables RLS or triggers.
No project `.env`, real provider keys, money or outgoing mail are used.

Cases include late line/audit rollback, recurring review rollback, line ownership,
stable IDs, meaningful revisions, real simultaneous saves and lock waits, live
role/offboarding denial, direct-write withdrawal, closed/source scope protection,
party/contact/property checks, material references, existing portal-token and
delivery preservation, draft deletion, and actual mobile create/duplicate/edit
HTTP compatibility. Also rerun PR03/04/06/07 and offboarding suites. Run shared
office-notification integration suites sequentially: fixture recipients accumulate
in the retained local DB, and receipt delivery intentionally processes 100 per
invocation. Retire only accounts owned by the completed test run between suites.

Browser verification must include uncontrolled notes/contacts as well as line
inputs: React resets uncontrolled fields after a resolved action unless the
editor prevents reset. Exercise conflict, explicit reload, keyboard save, a new
line followed by a second save, and desktop/mobile overflow. Native Foundation
DTO checks and syntax parsing do not replace a full Xcode simulator build.

See `src/lib/quotes/ATOMIC_EDITING.md` for transaction, rollout and residual
approval/communications boundaries.

## PR07 ordered payments and manual attempts

The regular unit gate includes `ordered-payments.test.mjs` (actual new migration
and incumbent commands in embedded PostgreSQL) and `manual-payment-attempt.test.mjs`
(actual server actions, validation and uncertainty outcomes). The shared receipt
SQL fixture is only an untouched-schema stand-in; live authorization and real
row-lock concurrency are verified separately below. No provider keys are needed.

Provision the existing loopback disposable stack with all **73 migrations**
through `20261016032012_ordered_payment_reconciliation.sql`. Do not reset the
active review fixtures merely to rerun tests. Configure the private local status
file outside Git, mode 0600, and the dedicated Docker Unix socket as in PR06.
Run from `apps/platform` with the local review Next app already on port 3102:

```sh
PR07_DISPOSABLE_STACK=1 \
PR07_LOCAL_STATUS_FILE="$PR07_STATUS_FILE" \
PR07_DOCKER_BIN="$PR07_DOCKER_BIN" \
PR07_WEB_URL=http://127.0.0.1:3102 \
PR07_RESULTS_FILE="$PR07_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/ordered-payments.integration.test.mjs
```

The suite refuses every API origin except `http://127.0.0.1:54321` and the web
origin except `http://127.0.0.1:3102`. It targets only the named disposable DB
container. It creates synthetic confirmed Auth identities and unsendable payment/
receipt fixtures, preserving history. It never reads a project `.env`, sends real
money/mail, changes automation settings, or disables RLS/application triggers.
Run PR06 and prior invoice/offboarding suites too: their counterexamples remain,
with keyed manual fixture calls and current observation-fence expectations.

Cases cover equal installments vs same-key replay, simultaneous record/resolve,
tombstones defeating delayed requests, correction/restore, audit rollback,
old-JWT/role denial, pending/succeeded/failed/canceled/requires-action refunds,
full-refund failure, paginated/omitted/invalid refund objects, live older snapshots
superseded by newer observations, a genuinely delayed provider response, manual/
Stripe/refund contention, current disputes, pre-payment refund delivery and the
actual authenticated local mobile HTTP route. Provider reads and office mail are
controlled doubles; real local Auth, PostgREST, SQL and mobile HTTP are used.

The iOS request/store tests are in the existing `InvoiceDirectoryTests.swift`
target. Run the documented Xcode simulator suite when Xcode is installed. The
local verification report separately distinguishes syntax/compiled Foundation
storage checks from the unavailable full simulator build. The updated app uses
the distinct `/manual-payment/attempt` endpoint; old servers cannot silently
ignore its request identity. See `ORDERED_PAYMENT_RECONCILIATION.md` for semantics,
storage limits, event subscription and future rollout/rollback requirements.

## PR06 webhook recovery

The normal `npm run test:unit` gate includes `webhook-receipt.test.mjs` (the real
PR06 migration executed in embedded PostgreSQL) and `webhook-retry.test.mjs`
(the actual retry server action behind controlled request/provider boundaries).
Existing contested-webhook cases in `invoice-void.test.mjs` still verify failure
instead of acknowledgment. No provider secrets are needed.

The real integration suite requires the existing disposable stack and **all 72
migrations** through `20261016020444_recoverable_stripe_webhook_receipts.sql`.
It does not migrate or reset the active review database. Use only its private
local status JSON, outside Git with mode 0600. Never print that file, use a
hosted project, or source production environment variables. From `apps/platform`:

```sh
PR06_DISPOSABLE_STACK=1 \
PR06_LOCAL_STATUS_FILE="$PR06_STATUS_FILE" \
PR06_DOCKER_BIN="$PR06_DOCKER_BIN" \
PR06_RESULTS_FILE="$PR06_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/webhook-recovery.integration.test.mjs
```

Set `DOCKER_HOST` to the existing dedicated local Unix socket. The suite refuses
every API origin except `http://127.0.0.1:54321` and targets only the named
`supabase_db_ats_pr02_disposable` container. Explicit opt-out produces SKIP, not
an integration pass. It creates synthetic confirmed Auth accounts and financial/
receipt fixtures; history remains locally for inspection. RLS and application
triggers remain enabled. No real Stripe/Resend/Calendar credentials are read.

Coverage includes simultaneous claims and different event IDs for one payment,
expired ownership, stale failure/completion, lock-wait expiry, atomic rollback,
failure after financial commit, queue-planning resume, duplicate activity and
frozen recipients, legacy receipt/effect repair, current provider bindings/mode,
late payment transitions, decreased refund evidence held unfinished, refunds
including surcharge, disputes, attempt limits, live role/old-JWT denial,
uncertain office-email acceptance with no replay resend, and late acceptance.
The actual POST route is exercised using the real Stripe HMAC verifier and real
local database, with provider HTTP reads/email replaced by controlled doubles.
The scoped queue case uses real local payment queries/unique inserts and a
settings-read projection; it never enables the actual automation master switch
or runs a sender. Its temporary communications are canceled before completion.

`PR06_PREPARE_REVIEW_FILE` optionally saves a non-secret fixture-ID JSON for
interactive review of an effects-ready failed receipt; omit it in routine runs.
Do not run any customer-email worker against disposable fixtures. The app's
System Health retry was also verified interactively against that local fixture.
Read `src/lib/payments/WEBHOOK_RECOVERY.md` for protocol, exceptions, deployment
compatibility, rollback and remaining PR07/PR14 limits.

## Required local and CI baseline

Run `npm ci`, `npm run test:unit`, `npm run typecheck`, and `npm run build` from
`apps/platform`. The PR workflow tests Node 22.23.3 and 24.4.0 with no production
secrets. `test:unit` includes every local `*.test.mjs` under `src/lib/` and
`tests/`, including the manager-notification SQL and photo-storage SQL suites.
`@electric-sql/pglite` is a pinned development dependency; the SQL tests do not
silently skip when it is missing. `npm run test:photos` runs the photo suite alone.

The photo fixture executes the actual repository authorization helpers and
policies in isolated PostgreSQL, with minimal Supabase-owned auth/storage schema
fixtures. It exercises the real server upload validator and database RLS but
does not emulate Storage HTTP, image delivery or Auth sessions. It checks all
six categories, metadata persistence, scoped retrieval and denied paths/users.
The public bucket flag, MIME/size configuration and SELECT policy remain checked.

## Separate infrastructure-dependent checks

`npm run test:auth:integration` is the existing local Supabase Auth/Mailpit recovery
test, excluded explicitly from ordinary CI. Provision an isolated local stack
and set `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`,
`SUPABASE_TEST_SERVICE_ROLE_KEY`, and `SUPABASE_TEST_MAILPIT_URL` before invoking
it. The test creates temporary users and sends recovery messages to Mailpit;
**never point it at a production project or real mail service**. Without those
values the existing test reports SKIP, which is not an integration-test pass.
Browser fixtures below additionally require their documented tools/browsers.

See `../DEVELOPMENT.md` for runtime and pending migration review notes.

## Browser and detail-loading checks

Run from `apps/platform`:

```sh
node --test tests/detail-loading.test.mjs
npm run test:notifications
npm run test:schedule
npm run test:address
npm run typecheck
npm run build
```

`detail-loading.test.mjs` exercises the actual page-loading blocks with deferred
readers, checking concurrency, missing-record behavior and existing role gates.
It does not connect to Supabase or measure live latency.

`crm-usability.browser.mjs` bundles the real navigation, modal, address and
notification components into an isolated fixture. All requests are mocked;
it does not authenticate, read CRM data or perform business actions.

It requires optional `esbuild` and `playwright` testing tools plus their Chromium
and Firefox browsers. These are not production dependencies. If they are supplied
by an external toolchain, set `ESBUILD_MODULE` and `PLAYWRIGHT_MODULE` to their
absolute module entry paths. Then run:

```sh
node tests/crm-usability.browser.mjs
```

`UI_BROWSERS` optionally selects engines, for example `firefox`. Screenshots go to
the ignored `output/playwright/crm-usability` directory. The matrix covers widths
320, 390, 768 and 1440, keyboard navigation, Escape/focus return, nested modals,
scroll containment, address suggestions and notification failure/retry.

These checks supplement, not replace, an authenticated Safari/Firefox smoke test
of scheduling, employee review and quote/invoice/customer details.

## Shared UI Conventions

- Use `PlatformModal` for the existing full-viewport overlay patterns. Provide a
  label or heading ID, and either `onDismiss` or a protected `closeHref`.
- Mark the preferred initial target with `data-modal-initial-focus`. Native
  dialogs handle background inertness and keyboard containment; the component
  coordinates nested scroll locks and focus restoration.
- Popovers belonging to a modal must portal into that dialog, not outside its
  inert boundary. Address suggestions follow this rule.
- Use `review-field` for labeled compact review controls and `--control-touch-size`
  for touch targets. Navigation colors use the shared semantic navigation tokens.

## PR02 offboarding verification

`node --conditions=react-server --experimental-strip-types --test tests/offboarding.test.mjs`
runs the PR02 suite, also automatically included by `test:unit`. It applies the
complete new migration in PGlite, executes real RLS and commands, and exercises
actual application roles, page context, bearer API context and server actions
through SQL-backed adapters. Minimal schemas stand in for untouched tables.
The signed tokens use a **synthetic issuer**, and Auth/Next request boundaries
are adapters: this is not Supabase Auth or a PostgREST/Storage HTTP server.
It checks retained roles/assignments, individual active-state predicates,
legacy/employee/work-session assignments, active photo categories, disabled
RPC/storage reads/writes, owner rules, reactivation and transactional rollback.

The separate **real Auth/Data API** test requires an already provisioned,
disposable local Supabase stack with the repository migrations, PR01/F08 and
PR02 applied **locally only**. It does not apply migrations itself. Configure
`SUPABASE_TEST_URL=http://127.0.0.1:54321`, `SUPABASE_TEST_ANON_KEY` and
`SUPABASE_TEST_SERVICE_ROLE_KEY` using only local stack keys, then run:

```sh
PR02_DISPOSABLE_STACK=1 node --test tests/offboarding.integration.test.mjs
```

This test refuses every other origin. It creates confirmed disposable accounts
without sending email, signs in, reuses the same Auth-issued JWT after
separation, checks direct Data API/RPC denial, fresh login/refresh and
reactivation. It removes only its temporary Auth identities; remaining fixture
rows/history belong to the disposable database and its next local reset.
No opt-in produces **SKIP**, never evidence of a successful integration test.
This supplemental test does not prove Storage HTTP, live Next cookies/native
clients, signed-URL invalidation, or simultaneous multi-connection owner races.

Offboarding retains provider sessions and roles. The live database predicate
rejects inactive/separated/archived accounts regardless of JWT validity.
Authorized reactivation restores existing roles and assignment visibility;
unexpired sessions can regain access. Time-clock permission stays disabled
until explicit payroll/administrator review. Existing signed file URLs remain
bearer capabilities until their original expiry; offboarding prevents new
caller-authorized reads/signing/uploads, without rotating production keys.

## Full PR02 disposable-stack verification

`pr02-supabase.integration.test.mjs` supplements the smaller Auth test above. It
requires explicit opt-in and refuses an API origin other than
`http://127.0.0.1:54321`. It uses a local Unix Docker socket and the explicitly
named container `supabase_db_ats_pr02_disposable` for separate PostgreSQL
connections. It never links a hosted project or reads a project `.env` file.

Provision the stack from a scratch copy of `supabase/config.toml` and all
migration files, with `project_id = "ats_pr02_disposable"`. Keep the repository
configuration unchanged. Use a dedicated Docker network with
`com.docker.network.bridge.host_binding_ipv4=127.0.0.1`. Pass the same
`--network-id pr02-loopback` to **both** CLI `start` and `db reset --local
--no-seed`; otherwise a reset can put the database on a different network.
The repository has no `seed.sql`; the tests create only synthetic fixture roles
and confirmed disposable Auth identities. No external provider keys are needed.

After a successful 68-migration local replay (including the separate
recommendation guard), obtain local status without printing keys:

```sh
umask 077
supabase status --workdir "$PR02_SCRATCH" --output json > "$PR02_STATUS_FILE"
```

With `DOCKER_HOST` set to the dedicated local socket, run from `apps/platform`:

```sh
PR02_DISPOSABLE_STACK=1 \
PR02_EXPECT_RECOMMENDATION_FIX=1 \
PR02_LOCAL_STATUS_FILE="$PR02_STATUS_FILE" \
PR02_DOCKER_BIN="$PR02_DOCKER_BIN" \
PR02_WEB_LOG="$PR02_WEB_LOG" \
PR02_VERIFICATION_RESULTS="$PR02_RESULTS_FILE" \
node --test tests/pr02-supabase.integration.test.mjs
```

Keep status outside Git with mode 0600; it contains **local-only** credentials.
The suite signs in normally, preserves real old JWTs/cookies, checks PostgREST,
RPC, all six private Storage categories, anonymous/cross-job/invalid paths,
refresh/fresh login, restored sessions and disabled time-clock permission. It
starts a temporary Next dev process on loopback port 3102 with only local public
Supabase configuration and stops it afterward. It exercises crew web details,
admin reports where permitted, and the actual native/bearer API boundary.

The recommendation case confirms assigned crew/staff paths and rejects different
crew, genuinely unassigned jobs and inactive accounts. Employee-only and both
work-session identity forms remain valid. The unit suite independently reproduces
the original NULL bypass before applying the new migration.

The concurrency case eagerly starts both HTTP request builders, waits until a
third database connection holds the shared advisory lock, verifies two real
waiting database locks, then checks owner, repeated-offboarding and role-edit
outcomes. Active-role row counts across 15 surfaces are compared with the new
restrictive gates temporarily removed **inside a rolled-back local transaction**.
Only fixture identity-normalization triggers are briefly paused to construct
legacy assignment rows; RLS is never disabled, and triggers are restored before
caller requests.

Fixtures/history remain in the disposable stack for inspection. Teardown is a
local reset or stopping its dedicated VM. No email/Stripe/Calendar worker runs;
notification fixtures are marked `skipped`. Existing signed URLs retain their
original expiry. This is representative HTTP integration, not an iOS-device or
full interactive-browser suite. See the separately delivered
`PR02_VERIFICATION_REPORT.md` for actual results and limitations.

## PR03 guarded invoice void and checkout review

The normal `npm run test:unit` gate discovers the new action/provider/embedded SQL
regressions. Existing dependency pins and test runner are unchanged. No provider
keys are needed. `checkout-void.sql-fixture.mjs` is a minimal PostgreSQL fixture;
the real Auth/RLS/concurrency checks are deliberately separate.

For the current checkout, install the guarded-void, invoice-command and separate
invoice-enforcement migrations after the original 68-migration PR02/F08 baseline
(71 total). Run from `apps/platform`:

```sh
PR03_DISPOSABLE_STACK=1 \
PR03_LOCAL_STATUS_FILE="$PR03_STATUS_FILE" \
PR03_DOCKER_BIN="$PR03_DOCKER_BIN" \
PR03_RESULTS_FILE="$PR03_RESULTS_FILE" \
node --experimental-strip-types --test tests/pr03-supabase.integration.test.mjs
```

Set `DOCKER_HOST` to the dedicated local Unix socket. This suite refuses any
Supabase API origin other than `http://127.0.0.1:54321` and uses the explicitly
named `supabase_db_ats_pr02_disposable` container. Status must be outside Git,
mode 0600; never print or commit it. It contains only this local stack's keys.
Do not use a hosted project or project `.env` file. No Stripe/Resend credentials
are read; a controlled provider double is used for the full recovery command.

The suite creates synthetic confirmed Auth accounts, roles, invoices, checkout
attempts, payments and unsendable communication fixtures. It tests role denial,
old-JWT offboarding, direct Data API bypass, all reservation attestations, audit
rollback, pending-vs-processing communication cancellation, late money, stale
leases, safe restore/manual corrections, paid/void line/header guards, verified
recovery plus audit, and independent-session parent/child contention. It does
not disable RLS or application triggers. A temporary audit constraint targets
one synthetic invoice and is removed in `finally`. Fixture history remains
local for inspection. Never run a customer-email/automation worker against these
fixtures; pending communication fixtures are cancelled/skipped before completion.

Preserve existing local review fixtures when iterating. Fresh migration replay
can use a separate database with local Auth/Storage bootstrap definitions, then
all original 68 migrations plus this additive migration. Do not reset the active
local review database merely to rerun this suite. A later deployment must pair
all new guards with the updated financial callers; see
`src/lib/payments/INVOICE_VOID_SAFETY.md` for bounds and remaining roadmap work.

## PR03 invoice financial commands

The regular unit gate includes `invoice-boundary.test.mjs`: embedded PostgreSQL
executes both actual command/enforcement migrations against a minimal fixture.
It verifies staged privileges, denied direct financial writes, computed draft
state, rollback after line/audit failure, line ownership, stale edits, principal
accounting, checkout/void fences and arithmetic. Fixture identity predicates are
test doubles; real authorization is covered below. No provider keys are needed.

After installing all 71 migrations in the existing disposable stack, use the
same local-only environment described above:

```sh
PR03_DISPOSABLE_STACK=1 \
PR03_LOCAL_STATUS_FILE="$PR03_STATUS_FILE" \
PR03_DOCKER_BIN="$PR03_DOCKER_BIN" \
PR03_BOUNDARY_RESULTS_FILE="$PR03_BOUNDARY_RESULTS_FILE" \
node --experimental-strip-types --test tests/invoice-boundary.integration.test.mjs
```

`DOCKER_HOST` must reference the dedicated local Unix socket. This suite refuses
non-loopback Supabase and uses only `supabase_db_ats_pr02_disposable`. It creates
synthetic Auth accounts and keeps their issued JWTs for deactivation tests; it
checks direct PostgREST bypass attempts, all retained staff roles, command rollback,
foreign/duplicate line IDs, repeated/concurrent saves, stale conflicts, prepayment
correction/restore, refund/dispute/surcharge arithmetic, draft/paid/delivery state,
active checkout/void fences, separate-session payment/collection contention,
metadata/archive/delete behavior, organization billing, and approved additions
with material/source references. Fixtures stay local for inspection. No Stripe,
email, Calendar, reminder worker or production service is called.

The current guarded-void integration suite's ordinary-draft edit case now uses
`save_invoice_details`, because direct line editing has intentionally been
withdrawn. All void/restore/recovery checks remain. Do not remove the enforcement
migration or restore broad grants to make an older test caller pass.

## PR04 atomic job/quote invoice generation

The unit gate includes `invoice-generation.test.mjs` for durable browser request
identity, fail-closed storage/result handling and existing/void result messages.
Install all 74 repository migrations in the disposable stack, then run:

```sh
PR04_DISPOSABLE_STACK=1 \
PR04_LOCAL_STATUS_FILE="$PR04_STATUS_FILE" \
PR04_DOCKER_BIN="$PR04_DOCKER_BIN" \
PR04_RESULTS_FILE="$PR04_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/invoice-generation.integration.test.mjs
```

`DOCKER_HOST` must point to the dedicated local Unix socket; the suite refuses
non-loopback APIs and uses `supabase_db_ats_pr02_disposable`. It exercises actual
issued JWTs/live roles, same/different request contention, source parent locks,
line/addition/note/audit/final-result rollback, void/deleted-result replay,
organization contacts, recurring/material copy and change-order approval. No
provider key, sender, automation worker or production service is used. Its own
synthetic accounts are disabled after the suite; historical fixture rows remain.

The payment suites share the global office notification population. Retire only
owned synthetic accounts between repeated disposable runs, and run those suites
sequentially when accumulating accounts could exceed their one-invocation email
batch (100). Do not alter financial/notification assertions or broad production
privileges to accommodate a crowded test environment. See
`src/lib/invoices/ATOMIC_GENERATION.md` for compatibility and rollout limits.

## PR08 scheduling atomicity

After all 78 migrations are installed in the existing disposable local stack:

```sh
PR08_DISPOSABLE_STACK=1 \
PR08_LOCAL_STATUS_FILE="$PR08_STATUS_FILE" \
PR08_DOCKER_BIN="$PR08_DOCKER_BIN" \
PR08_WEB_URL=http://127.0.0.1:3102 \
PR08_RESULTS_FILE="$PR08_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/atomic-scheduling.integration.test.mjs
```

The private status file is the existing local CLI JSON containing local-only API
credentials. Do not print, commit or transfer it into reports. `DOCKER_HOST` must
point to the dedicated local Unix socket. The suite refuses non-loopback API/web
URLs and uses only `supabase_db_ats_pr02_disposable`. It retains historical fixture
rows and retires its own synthetic accounts/employee records after the run.

Checks cover assignment/audit/Calendar failure rollback, two editors and two
different jobs sharing crew, issued-JWT revocation during lock waits, direct/API
bypasses, durable/no-login employees, qualification and overlap overrides,
whole-schedule snapshots, cancelled history, daylight saving/all-day ranges,
source estimates, create-response retries, office-completion compatibility, and
pending versus processing/sent reminders. The Calendar test claims real outbox
work and verifies the existing old-revision acknowledgement/failure fence.
No provider worker, email delivery, Stripe or production service runs. See
`src/lib/schedule/ATOMIC_SCHEDULING.md` for the exact contract and scope limits.

## PR09 explicit job completion

After all 79 migrations are installed in the disposable stack:

```sh
PR09_DISPOSABLE_STACK=1 \
PR09_LOCAL_STATUS_FILE="$PR09_STATUS_FILE" \
PR09_DOCKER_BIN="$PR09_DOCKER_BIN" \
node --conditions=react-server --experimental-strip-types --test tests/explicit-job-completion.integration.test.mjs
```

DOCKER_HOST must be the dedicated local Unix socket. The suite refuses a
non-loopback API and uses supabase_db_ats_pr02_disposable only. It creates and
retires only owned synthetic actors, retaining fixture history. Never print the
private status file. No hosted project, provider worker or sender runs.

The existing PR04 tests now intentionally assert draft-only field behavior;
financial/copy/rollback/replay coverage is preserved. The PR08 compatibility case
now uses explicit completion and verifies the unchecked entry point is revoked.
Dedicated PR09 coverage includes both office modes, financial/audit/receipt/Calendar
rollback, exact replay, races, stale job/visit/closeout/child context, future dates,
issued-JWT revocation during independent lock waits, crew all-or-nothing submission,
required evidence, immutable revisions, corrections and retained time/actor, timer
independence, operations visibility and remaining reminder scope. Browser review
uses 3102 with unchanged flags and an isolated 3103 local flags-on preview.

## PR12 draft recovery, saved wording, and return context

`npm run test:unit` includes the bounded recovery parser, expiry and identity
isolation, stale-version/line identity rules, safe navigation destinations,
price-free wording projection, and deterministic persistence lifecycle tests.
The lifecycle cases cover typing before identity verification, recovery choices,
logout fencing, other-tab conflicts, pending fieldsets, and immediate submission
before the input debounce.

For the additional real-session checks, run only against the existing disposable
stack and local development server, after its 81 migrations:

```sh
PR12_DISPOSABLE_STACK=1 \
PR12_LOCAL_STATUS_FILE="$PR12_STATUS_FILE" \
PR12_WEB_URL=http://127.0.0.1:3102 \
node --conditions=react-server --experimental-strip-types --test tests/draft-session.integration.test.mjs
```

The suite rejects non-loopback targets, creates and retires its own synthetic
actor, and verifies anonymous denial, a minimal non-cacheable session response,
offboarding with an already-issued cookie, and logout. It also exercises the real
new-quote server action against the disposable database, including acknowledged
navigation, hostile return destinations and legacy redirects. Never print the private
status file. No hosted database or provider sender is used.

Browser review: reopen both editors after unsaved work and failed validation;
restore/discard; verify newer saved content cannot be overwritten by recovery;
save and save-and-close; confirm search/status/page return links; insert/edit
personal scopes with blank prices and explicit wood/chips wording; use another
account after logout; inspect mobile and keyboard behavior. Before-unload warnings
can cancel an automated reload: verify a fresh editor document, or close/reopen
only the disposable review tab, before claiming a recovery test passed.

Recovery is local browser storage, not a financial command or cross-device backup.
It lasts up to 24 hours, is cleared on logout/account change, and never automatically
submits. Existing invoice generation request IDs survive uncertain responses.
Recovered new-record attempts require checking existing records; standalone quote
and invoice creation do not gain new database idempotency in this UI change.
Personal wording survives logout under its own user key and contains no prices or
record/material identifiers. New walk-in contact/address entries must be re-entered.

### PR13 — transactional website requests

`tests/website-lead.test.mjs` runs in the regular unit suite. It exercises the actual parser, transaction acknowledgement, notice aggregation, claim/finish adapters, public-route gates, replay behavior and safe public responses, with provider calls stubbed.

`tests/website-lead.integration.test.mjs` is opt-in. Use **only** the existing disposable local stack (`http://127.0.0.1:54321`) after applying repository migrations locally:

```sh
PR13_DISPOSABLE_STACK=1 \
PR13_LOCAL_STATUS_FILE=/absolute/path/to/local-status.private.json \
PR13_DOCKER_BIN=/absolute/path/to/docker \
DOCKER_HOST=unix:///absolute/path/to/disposable/docker.sock \
node --test tests/website-lead.integration.test.mjs
```

The private status file must come from the disposable stack and contain `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` and `JWT_SECRET`. Never commit it. Optional `PR13_RESULTS_FILE` writes a credential-free result summary. The suite refuses a non-local API URL. It tests real Auth/RLS grants, concurrent submissions and claims, process death, late failures at every creation boundary, protected state and fenced notice completion. It also runs the actual route/intake/notice adapters with the local database and an explicitly stubbed email sender. No provider requests are made. It retains marked test business history and retires only its own Auth profile IDs. Scoped failure triggers are removed in `finally`.

A pending or interrupted office notice is **not automatically retried**. PR14 owns provider reconciliation, frozen per-recipient deliveries and safe operator repair. Replaying a public request cannot resend an office notice or reset an archived/converted lead.

## PR14 — durable delivery and safe repair

`npm run test:unit` includes frozen request/acknowledgement handling, actual Svix
signature vectors, rotation/tamper/time-window checks, streamed-body limits,
GET-only evidence validation, retryable webhook storage failures, legacy receipt
verification and reminder-preparation failure handling.

After all **83 repository migrations** have been applied to the existing disposable
stack, run the opt-in real Auth/RLS/concurrency suite:

```sh
PR14_DISPOSABLE_STACK=1 \
PR14_LOCAL_STATUS_FILE=/absolute/path/to/local-status.private.json \
PR14_DOCKER_BIN=/absolute/path/to/docker \
DOCKER_HOST=unix:///absolute/path/to/disposable/docker.sock \
node --test tests/delivery-reconciliation.integration.test.mjs
```

The suite refuses APIs other than `http://127.0.0.1:54321`, uses only
`supabase_db_ats_pr02_disposable`, and requires its local status JSON (`API_URL`,
`ANON_KEY`, `SERVICE_ROLE_KEY`, `JWT_SECRET`). Never print/commit that file.
`PR14_RESULTS_FILE` optionally writes a credential-free result summary. Tests
exercise concurrent preparation/claim, stable keys across actors/reloads, source
and invoice-void races, audit rollback/recovery, early/duplicate/out-of-order
provider events, suppression/quarantine, retry limits, explicit copies, legacy
holds, recipient-isolated office repair, queue claim fencing, live offboarding,
private grants and disabled automation. The actual sender/processor adapters use
stub transports only. No real provider request, email, payment or hosted migration
runs. Failure triggers are scoped and removed; only the suite's own synthetic
actors are retired. Historical fixture records remain for review.

Run financial/notification integration suites sequentially and retire only their
exact synthetic actor IDs; accumulated test recipients must not change assertions
or permissions. Preserve the separate local review account. Browser QA should
include a history-only repair with an unchanged dispatch count, mobile wrapping,
keyboard focus and an empty review state. Do not click a sends-email action to
verify a no-email repair. See
`src/lib/email/DELIVERY_RECONCILIATION.md` for the contract and future provider setup.

## PR15 — record lookup and owned office handoffs

`npm run test:unit` includes the actual normalization/escaping, result and internal
link validation, debounced cancellation/late-response fencing, allowlisted saved
views, scheduling links, private HTTP gates and safe fail-closed data projections.

After all **84 repository migrations** are installed in the existing disposable
stack and the local development server is running:

```sh
PR15_DISPOSABLE_STACK=1 \
PR15_LOCAL_STATUS_FILE=/absolute/path/to/local-status.private.json \
PR15_DOCKER_BIN=/absolute/path/to/docker \
PR15_WEB_URL=http://127.0.0.1:3102 \
DOCKER_HOST=unix:///absolute/path/to/disposable/docker.sock \
node --conditions=react-server --experimental-strip-types --test tests/record-search-handoffs.integration.test.mjs
```

The suite refuses other API/web targets and uses only
`supabase_db_ats_pr02_disposable`. The private status JSON contains `API_URL`,
`ANON_KEY`, `SERVICE_ROLE_KEY` and `JWT_SECRET`; never print or commit it.
Optional `PR15_RESULTS_FILE` writes only a credential-free summary/timings.
Marked business fixtures remain; only exact suite-owned synthetic Auth/employee
IDs are retired. The separate local review account is preserved. Failure triggers
and independent lock holders are scoped and released in cleanup.

Checks use real sessions, RLS, HTTP cookies and the actual server preview action.
They cover shared-phone households, mixed addresses and document numbers, all
office roles and field/customer denial, no monetary search snippets, concurrent
approval/repair, audit rollback, owner/version validation, snooze ordering,
booking/partial/final cancellation, direct-write guards, archive/restore, explicit
older-gap repair, legacy booking checks, removed employee access with an otherwise
active profile, offboarding during a lock wait, manual tasks and queue pagination.
No provider sender, hosted migration, email, payment or production service runs.

Browser QA uses the disposable reviewer at 3102: open a result by keyboard and
mouse, close with Escape and check focus, inspect mobile wrapping and empty
results, save/open a filter, save one owner/return time, and preview selected rows
without applying changes. Keep native navigation/before-unload draft protection.
Search and saved filters must not persist record data. See
`src/lib/RECORD_SEARCH_AND_HANDOFFS.md` for the contract and legacy-write limits.
## Reversible website sender blocking (local integration)

`tests/sender-blocks.test.mjs` is included in `npm run test:unit`.
`tests/sender-blocks.integration.test.mjs` is opt-in and requires the existing
disposable Supabase stack and local application. It refuses a non-loopback API.
Never point it at a hosted database or use production credentials.

From `apps/platform`, using the local Node runtime:

```sh
SPAM_DISPOSABLE_STACK=1 \
SPAM_LOCAL_STATUS_FILE="/absolute/path/to/local-status.private.json" \
SPAM_DOCKER_BIN="/absolute/path/to/docker" \
DOCKER_HOST="unix:///absolute/path/to/disposable/docker.sock" \
SPAM_WEB_URL="http://127.0.0.1:3102" \
node --conditions=react-server --experimental-strip-types --test tests/sender-blocks.integration.test.mjs
```

The private status file is generated by the disposable setup and is never
committed. An optional `SPAM_RESULTS_FILE` receives non-secret scenario results.
The suite creates uniquely marked synthetic contacts, stubs outbound providers,
tests an actually blocked request against the running local endpoint, retains
history, unblocks its own test identities, and retires only its own test actors.
It leaves a labeled synthetic spam lead for local UI review. A local PostgreSQL
session injects and removes a narrowly scoped audit-failure constraint; no hosted
migration or existing review-owner cleanup is performed.


## Remaining attachment scanning — disposable integration

`tests/remaining-attachment-scanning.integration.test.mjs` requires the full local
migration chain and the authenticated private scanner bridge/ClamAV daemon from
[ATTACHMENT_SCANNING.md](../ATTACHMENT_SCANNING.md). The default unit runner does
not enable this suite. Supply existing local credentials privately; do not print,
paste or commit the local status file, scanner token or credential-bearing logs.

```bash
ATTACHMENT_DISPOSABLE_STACK=1 \
ATTACHMENT_LOCAL_STATUS_FILE=/absolute/path/to/local-status.private.json \
ATTACHMENT_DOCKER_BIN=/absolute/path/to/docker \
DOCKER_HOST=unix:///absolute/path/to/disposable/docker.sock \
DOCUMENT_SCANNER_URL=http://127.0.0.1:3311/scan \
ATTACHMENT_APP_URL=http://127.0.0.1:3102 \
node --test --experimental-strip-types tests/remaining-attachment-scanning.integration.test.mjs
```

`DOCUMENT_SCANNER_TOKEN` must already be loaded into the private process environment.
The status file must contain local `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY`;
the suite refuses an API other than `http://127.0.0.1:54321`. It creates only marked
synthetic actors/records and temporarily enables six local scan switches. Cleanup
restores their prior values, archives its own employee documents and disables
only its created accounts. It retains test audit/business history. An optional
`ATTACHMENT_RESULTS_FILE` writes a credential-free summary. The optional app URL
runs actual authorized/denied Next route downloads, rather than a mocked handler.

Tests use real clean images and the harmless EICAR antivirus test string. Coverage
includes direct forged-MIME uploads, stored digest checks, ownership and employee
classification, unrelated crew denial, service-only scan claims/results, concurrent
claims, expired/replayed tokens, object replacement and delete/reinsert, scanner
outages preserving receipt amounts/review state, disposal receipt bucket routing,
all six shared web/mobile photo categories and mandatory audit history. Disablement
during scanning must prevent finalization with an already issued access token.

Also run the original `document-scanning.integration.test.mjs` library suite,
`npm run test:unit`, `npm run typecheck`, `npm run build`, and the existing fresh
schema contract check. These commands authorize no hosted migration or deployment.

## Scanner hosting and synthetic recovery — local only

The staging host/protection handoff is in
`../STAGING_VISITOR_AND_SCANNER_PREPARATION.md`. The credential-free
`scanner-host-preparation.test.mjs` verifies preliminary host screening and local
socket targeting. `scripts/private-scanner/hosting/inspect-host.mjs` is run on a
future approved Linux host, never as a deploy/provisioning command. Its suitable
result does not prove activation readiness or modify any staging manifest.

`scanner-hosting.test.mjs` joins the ordinary credential-free unit runner. The
two integration suites below are opt-in and require the isolated hosting package
in `scripts/private-scanner/hosting/README.md`, an explicitly trusted localhost
certificate and a private fixture file. Never supply hosted credentials or
disable TLS verification. The host suite also needs the local `zip` utility for
synthetic encrypted/expanded-size archive fixtures.

The fixture JSON contains paths and owned container IDs, **no token value**:

```json
{
  "url": "https://127.0.0.1:33443/scan",
  "tokenFile": "/private/local-test/token",
  "caFile": "/private/local-test/localhost-cert.pem",
  "docker": "/absolute/path/to/docker",
  "project": "ats_host_local_unique",
  "ids": {"engine": "owned-id", "bridge": "owned-id", "proxy": "owned-id", "signature-updater": "owned-id"}
}
```

The tests require `DOCKER_HOST` to name the existing `pr02-disposable` Unix socket
and verify Compose project/service labels before stopping their own engine.
Use a separate project/port/token from the existing local CRM scanner.
From `apps/platform`, set these non-secret paths in the process environment:

```sh
SCANNER_HOSTING_DISPOSABLE=1 \
SCANNER_HOSTING_FIXTURE_FILE=/private/local-test/fixture.json \
NODE_EXTRA_CA_CERTS=/private/local-test/localhost-cert.pem \
DOCKER_HOST=unix:///absolute/path/to/pr02-disposable/sock/docker.sock \
node --experimental-strip-types --test tests/scanner-hosting.integration.test.mjs
```

Run recovery after the host suite finishes; both intentionally interrupt the
same owned engine. Keep `SCANNER_HOSTING_FIXTURE_FILE`, `NODE_EXTRA_CA_CERTS` and
`DOCKER_HOST` set, then run:

```sh
ATTACHMENT_DISPOSABLE_STACK=1 \
ATTACHMENT_LOCAL_STATUS_FILE=/private/local-test/local-status.private.json \
node --experimental-strip-types --test tests/attachment-restore.integration.test.mjs
```

Recovery refuses an API other than `http://127.0.0.1:54321`. Only uniquely marked
new test objects are deleted to simulate byte loss; existing files are never
read or restored. New synthetic actors are disabled, their document records
archived, original scan switches restored and all business/audit fixtures
retained. An AES-GCM fixture archive/key is written privately outside Git; this
is a test fixture, not a new production backup system. The local review owner and
recurring-generation switch are checked unchanged. Optional non-secret summary
paths: `SCANNER_HOSTING_RESULTS_FILE` and `ATTACHMENT_RESTORE_RESULTS_FILE`.

For the separate empty-catalog restore drill:

```sh
SCANNER_RESTORE_DISPOSABLE=1 \
ATTACHMENT_DOCKER_BIN=/absolute/path/to/docker \
DOCKER_HOST=unix:///absolute/path/to/pr02-disposable/sock/docker.sock \
node scripts/private-scanner/test-local-db-restore.mjs
```

This fixed source is the previously created independent
`ats_upload_access_v1_20261017` replay, verified empty of Auth/Storage/financial/
customer data. A random new target is created; the shared review DB is never
reset or overwritten. The existing local `supabase_admin` preserves schema
ownership; no role grants/passwords change. An optional
`SCANNER_RESTORE_RESULTS_FILE` saves a credential-free result. This proves
catalog/ACL/RLS restoration within the disposable cluster, not hosted PITR or
production source-file backup coverage.

## Shared password sign-in abuse protection

`sign-in-rate-limit.test.mjs` is part of the normal credential-free suite. It
checks source/header trust, IPv6 canonicalization, IP/account budget scope,
generic failures, one three-second limiter deadline, malformed RPC replies,
cookie-action ordering, redirects and unthrottled sign-out.

The separate opt-in `sign-in-rate-limit.integration.test.mjs` requires
`SIGNIN_DISPOSABLE_STACK=1` and `SIGNIN_LOCAL_STATUS_FILE` selecting exactly
`http://127.0.0.1:54321`. It creates only new synthetic local accounts/counters,
checks real service-only permissions and concurrency, and disables new accounts
afterward. With `SIGNIN_BUILD_DIRECTORY` pointing to a separate completed
source-only build, it also starts/stops one new loopback server and exercises
the compiled Next sign-in action over HTTP. It does not sign out the review
user, mutate roles, reset the DB, read customer records or call hosted providers.
See `SIGN_IN_ABUSE_PROTECTION.md` for commands, boundaries and release gates.

## Legacy appointment transaction follow-through

`staging-runtime-review.test.mjs` exercises the offline review of site/shared
variable precedence separately across contexts and Build/Functions/Runtime
scopes, without network access or value output. Masked secrets, named overrides,
missing evidence and good-looking mail settings never become hosted proof.
See `STAGING_RUNTIME_KEY_EMAIL_REVIEW.md` for actual configuration review,
compiled isolated-runtime checks and the existing local Mailpit recovery test.
No SMTP, email hook, hosted account, key or environment setting is changed by
these tests or by the offline reviewer.

Staging reconciliation extends verification with
`staging-appointment-candidate.test.mjs` and the local-only
`supabase/staging/tests/legacy-appointments.sql`. The former checks source,
target, exact old-numbered/timestamp ledger identities, permission/default
fingerprints and empty/OFF guards without network access. The latter rolls back
16 real command/permission assertions under normal `postgres` in the new
reconciled disposable database. All existing database/staging suites plus that
file pass 176 assertions. The full CLI local upgrade, forced rollback and
read-only hosted comparison are documented in `STAGING_APPOINTMENT_RECONCILIATION.md`.

`legacy-appointments.test.mjs` runs with the ordinary credential-free suite. It
checks request/revision validation, strict acknowledgment parsing, safe failures,
the shared action adapter and post-commit reminder warnings.

The opt-in native suite requires the existing disposable local stack:

```sh
LEGACY_APPOINTMENTS_DISPOSABLE=1 \
LEGACY_APPOINTMENTS_LOCAL_STATUS_FILE=/private/local-test/local-status.private.json \
LEGACY_APPOINTMENTS_DOCKER_BIN=/absolute/path/to/docker \
DOCKER_HOST=unix:///absolute/path/to/disposable/docker.sock \
node --experimental-strip-types --test tests/legacy-appointments.integration.test.mjs
```

It rejects targets other than `http://127.0.0.1:54321`, creates only synthetic
local fixtures, and tests actual permissions, revisions, retries, concurrent
writes, qualification checks and transactional rollback. It uses temporary
test-only audit constraints and removes them in cleanup. It does not reset the
database, inspect existing customer records, send communications, or contact
hosted providers. See `LEGACY_APPOINTMENT_ATOMICITY.md` for results and the
93-local-vs-92-frozen-staging release boundary.

## Migration reconciliation and staging preparation

Home-Mac scanner preparation is separate from host installation. The ordinary
credential-free suite includes `scanner-home-mac.test.mjs`: Mac screening,
exclusive allowlisted packet export, integrity/tamper/missing-file checks,
symlink/traversal refusal and permanently false activation flags. No VM,
network, credential or service is created. `limactl validate` and effective
template inspection check the prepared Ubuntu 24.04 ARM profile offline;
actual home hardware/runtime/network remain untested. See
`MACBOOK_SCANNER_SETUP.md` for the deferred operator handoff.

`migration-review.test.mjs` and `staging-preflight.test.mjs` run in the ordinary
credential-free unit suite. They reject non-prefix/duplicate migration history,
preserve catalog differences and prevent automatic history repair. Staging tests
reject production targets, borrowed legacy project-bound keys, provider/worker
credentials, public privileged values, unverified isolation/protection and
unsafe endpoints. Test keys are unsigned synthetic fixtures; no API call runs.

See `STAGING_PREPARATION.md` for the intentionally unassigned target manifest,
source-only export and guarded CLI upgrade drill. Run the preflight against the
unassigned manifest and require a failure. Export only after committing reviewed
tools locally; verify the export has the recorded source commit, no copied env
or linkage files and an empty selected functions directory. The real production
Netlify configuration and worker sources remain unchanged.

The local-only rehearsal requires explicit private local status/history/bootstrap
paths and binaries. It rejects non-loopback DB/API targets and creates a new
randomly named database, never a shared reset. It applies a genuine CLI ledger
65→92, checks migration SHA-256 preservation and OFF scan/recurring/communication
gates, and retains evidence outside Git. A hosted-like schema overlay is a local
fixture, not a reconciliation migration or a production backup. No hosted link,
repair, db push, provider call or deployment is part of this test command.


## Local staging Auth email guard

The ordinary suite includes four offline package/target/rollback checks. The
native test is deliberately opt-in and excluded from ordinary unit execution:

```sh
AUTH_EMAIL_GUARD_DISPOSABLE=1 \
AUTH_EMAIL_GUARD_LOCAL_STATUS_FILE=/private/local-test/local-status.private.json \
AUTH_EMAIL_GUARD_DOCKER_BIN=/absolute/path/to/docker \
AUTH_EMAIL_GUARD_SUPABASE_BIN=/absolute/path/to/supabase \
AUTH_EMAIL_GUARD_BOOTSTRAP=/private/local-test/trusted-schema-only-bootstrap.sql \
DOCKER_HOST=unix:///absolute/path/to/pr02-disposable/sock/docker.sock \
node --test tests/staging-auth-email-guard.integration.test.mjs
```

Requires the existing disposable DB/Auth/Mailpit image installation and a trusted
schema-only bootstrap matching that managed Auth image. API/DB URLs must be
127.0.0.1:54321/54322; the socket must be the pr02-disposable socket. This is not a
generic hosted runner. It verifies93 original migrations, creates a new random
local database, replays migrations through the CLI and runs new Auth/Mailpit
containers on an internal network with no published ports. It creates fresh
synthetic test credentials internally; it never retrieves hosted keys.

The genuine managed Auth version ledger is copied to match the schema-only
bootstrap, never existing users/sessions/business rows. No shared DB reset or
service restart occurs. All live requests target owned test services. The native
suite proves real hook error propagation, SMTP positive control/no fallback,
password sign-in/refresh, least privilege, failed installation and safe rollback.
Synthetic users and owned services are cleaned up, and original service start
times/network membership are checked. Retained private evidence/database are
outside Git; do not publish their generated test credentials. See
`STAGING_AUTH_EMAIL_GUARD.md` for results and bounded hosted readiness.


## Targeted staging Auth installation and activation review

`staging-auth-activation.test.mjs` adds nine offline cases to the normal suite:
physical/project identity,93-candidate/state drift, private API schema exposure,
expiry, minimal Auth patch, value-free diagnostics and rejection of write flags.
No credentials or network are required for these cases.

The read-only target reviewer uses the existing authenticated CLI and a fresh
mode0600 effective Management API config GET for this exact project:

```sh
STAGING_SUPABASE_BIN=/absolute/path/to/supabase \
node scripts/release/review-staging-auth-activation.mjs \
  --project-ref gbyhdsuiqeslgjdnbqng \
  --auth-config-file /private/local-test/fresh-managed-config.json
```

It writes a private15-minute review packet, never applies SQL or changes Auth.
Config must include the effective full Auth/API sections and matching data.id;
a CLI config pull with missing fields is insufficient. Do not copy keys/config
values into a report or repository. Capture Auth health/version separately with
an existing staging publishable key; never use a production key or send test mail
from the hosted default provider.

For the opt-in native rehearsal, use the same `AUTH_EMAIL_GUARD_*` paths and
pr02-disposable socket as the preceding suite, and run:

```sh
node --test tests/staging-auth-activation.integration.test.mjs
```

Run these native suites sequentially: both temporarily attach owned internal
networks to the preserved local DB container and verify its original membership.
The new suite uses a new owned database with93 replayed migrations, applies the
same transaction template bound to its own identity/preimage, rejects the actual
hosted binding on that clone, and verifies real lock contention, failed-postcheck
rollback, exact permissions and local Auth activation. The hosted profile is
never substituted into the shared DB. SQL/Auth settings are separate boundaries;
metadata reconciliation never claims real hosted mail isolation. See
`STAGING_AUTH_ACTIVATION_REVIEW.md` for the exact activation and keep-blocked
failure plan. No deployment, hosted mutation or shared reset is part of either
native command.


After authorized hosted activation, add `--verify-active` to the preceding
read-only reviewer command. It checks the committed safe active fingerprints,
exact invoker/effective permissions, exposed schemas and unchanged empty93
candidate; it never applies, repairs or sends mail. Three additional ordinary
unit cases reject active/config/identity/access drift and production/write flags.
A passing metadata check does not rerun historical synthetic tests. The actual
hosted activation and two-user cleanup are recorded in
`STAGING_AUTH_EMAIL_ACTIVATION.md`; the hosted email limit blocked the remaining
per-route hook-message matrix. Keep those limits and the hook enabled.

## Connected CRM workflow acceptance

`crm-workflow.integration.test.mjs` carries one uniquely marked synthetic customer
through existing lead intake, quote editing/approval, crew scheduling, explicit
completion, invoice generation, manual delivery and a manual payment. It uses real
local Auth/commands and the mobile quote detail HTTP route, then deactivates and
reactivates only its own synthetic admin to test the original issued JWT.

```sh
CRM_WORKFLOW_DISPOSABLE=1 \
CRM_WORKFLOW_LOCAL_STATUS_FILE=/private/local-test/local-status.private.json \
CRM_WORKFLOW_WEB_URL=http://127.0.0.1:3102 \
CRM_WORKFLOW_RESULTS_FILE=/private/local-test/workflow-results.private.json \
node --conditions=react-server --experimental-strip-types --test tests/crm-workflow.integration.test.mjs
```

Use the existing disposable loopback stack with the current reviewed definitions;
the test refuses any API except127.0.0.1:54321 or web app except127.0.0.1:3102.
Its API clients use an explicit loopback-only fetch transport. No Stripe/email
transport, key retrieval, hosted request, migration, trigger/RLS change or reset
is part of this test. Opt-in integration files remain excluded from unit checks.

It checks stale-version rejection, stable customer/job/quote/invoice relationships,
approval/generation/payment replay, retained visit/crew/completion history, exact
money totals and required audit counts. Anonymous and crew money commands fail;
the same admin JWT loses both original/replay access after deactivation. Roles
return after reactivation while clock permission stays disabled. Cleanup signs
out all new actors globally, verifies their profile/employee retirement, and
retains their synthetic records/history. Existing review users stay untouched.
Run shared-stack financial/notification suites sequentially. See
`LOCAL_WORKFLOW_ACCEPTANCE.md` for results and the remaining hosted acceptance
matrix; local success never marks staging hosting/activation ready.

### Customer quote change-request safety

`quote-change-request.test.mjs` runs with the normal unit suite. The real local
suite is deliberately opt-in and excluded from that suite:

```sh
QUOTE_CHANGE_DISPOSABLE=1 \
QUOTE_CHANGE_LOCAL_STATUS_FILE=/private/local-test/local-status.private.json \
QUOTE_CHANGE_WEB_URL=http://127.0.0.1:3102 \
QUOTE_CHANGE_DOCKER_BIN=/path/to/docker \
DOCKER_HOST=unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock \
QUOTE_CHANGE_RESULTS_FILE=/private/local-test/quote-change-results.private.json \
node --test tests/quote-change-request.integration.test.mjs
```

Use only the existing disposable stack after iterating the reviewed migration94.
The suite refuses other API/web origins and Docker sockets. It creates its own
synthetic owner and records, retains history, signs out and disables only that
actor, and revokes only its own links. Concurrency uses independent PostgreSQL
sessions and observed locks. The audit fault adds/removes a temporary constraint
scoped to one synthetic quote. The link-delete compatibility check rolls back.
No dispatcher or provider is invoked. The loaded server action substitutes only
rate/notification/revalidation boundaries; its RPC uses the actual database.
Do not run shared-stack transactional suites concurrently. See
`QUOTE_CHANGE_REQUEST_SAFETY.md` for evidence and limits.

### Staging quote change-request candidate94

`staging-quote-change-candidate.test.mjs` runs with regular unit checks and never
contacts hosted services. `supabase/staging/tests/quote-change-requests.sql` is a
local-only pgTAP suite for a new fully replayed/reconciled94-migration database
with the existing no-send Auth guard installed by its guarded local workflow.
Run it with the other existing database suites as normal `postgres`, with pgTAP
in `extensions`; verify both plan count and failures, not only the process exit.
All fixtures/probes roll back. Do not grant protected Auth-role membership.
See `STAGING_QUOTE_CHANGE_RECONCILIATION.md` for the read-only hosted verifier and
actual201-assertion local result. Historical93 verifiers intentionally reject94.

### Customer-activity alert recipient reads

`customer-activity-recipient-reads.test.mjs` runs in the normal unit suite and
models capped responses, large directories, role overlap, opt-outs and failures.
For the existing disposable stack only:

```sh
ALERT_RECIPIENTS_DISPOSABLE=1 \
ALERT_RECIPIENTS_LOCAL_STATUS_FILE=/private/local-test/local-status.private.json \
ALERT_RECIPIENTS_DOCKER_BIN=/path/to/docker \
DOCKER_HOST=unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock \
ALERT_RECIPIENTS_RESULTS_FILE=/private/local-test/alert-reads.private.json \
node --test tests/customer-activity-recipients.integration.test.mjs
```

The opt-in helper suite is excluded from unit checks and now runs read-only.
It refuses nonlocal HTTP/API and other Docker sockets and compares existing
recipients/preferences with independent SQL. Atomic write, opt-out, replay,
RLS and fault coverage now lives in the following fresh-database suite.
Historical fix evidence remains in `ADMIN_ALERT_RECIPIENT_READS.md`.

### Atomic customer-activity preparation and recovery

After replaying all95 migrations into a NEW empty database on the existing local
container (bootstrap + all sorted migration files), use Node22:

```sh
ATOMIC_ACTIVITY_DISPOSABLE=1 \
ATOMIC_ACTIVITY_DATABASE=ats_activity_fresh_<32_hex_characters> \
ATOMIC_ACTIVITY_DOCKER_BIN=/path/to/docker \
DOCKER_HOST=unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock \
ATOMIC_ACTIVITY_RESULTS_FILE=/private/local-test/atomic-activity.json \
node --conditions=react-server --experimental-strip-types --test tests/atomic-customer-activity.integration.test.mjs
```

The suite refuses the shared `postgres` database and other database names/sockets.
Use the existing guarded fresh replay workflow; do not reset or copy business rows
or change the shared native migration ledger. It creates only synthetic
example.invalid profiles/notices in that scratch database, retires its own
profiles, and retains its synthetic history. Its PostgreSQL adapter executes
actual service/authenticated/anonymous commands in independent sessions. The
provider transport is replaced with a controlled callback; no email leaves the
machine. A temporary trigger/constraint deliberately interrupts preparation and
history writes, with cleanup in `finally`. Actual database lock waits verify
contention, not just sequential replays. Regular unit tests separately exercise
redaction, incomplete acknowledgements, disabled configuration and bounded fan-out.
See `ATOMIC_CUSTOMER_ACTIVITY_NOTIFICATIONS.md` for the precise recovery boundary.

### Staging notification candidate95

`staging-notification-candidate.test.mjs` is included in regular unit checks and
never contacts a hosted service. It pins the unchanged94 candidate and exact95th
migration, accepts only the two reviewed existing-helper extensions, and requires
the exact95 catalog/ACL/defaults/ledger, empty private notification/outbox state,
active Auth guard, assigned physical target and fresh effective configuration.
Earlier93/94 verifiers remain historical and reject a95-entry target.

`supabase/staging/tests/atomic-notifications.sql` adds35 local-only pgTAP assertions
to the existing database suites, for236 in total. Run only in a NEW empty95-entry
rehearsal database with the existing guarded Auth installer and reviewed local
provider-default/object-grant overlay workflow. Use normal `postgres`; install
pgTAP in `extensions` using the existing local harness. Check the plan, each
assertion and process exit. All new Auth/profile/role/notification/outbox fixtures,
temporary grants and synthetic provider acceptance roll back. No provider
transport or network send is invoked. Never run positive fixtures on hosted
staging or production. See `STAGING_NOTIFICATION_RECONCILIATION.md`.

## Durable customer source handoff

`customer-source-events.test.mjs` and `change-order-response-attempt.test.mjs` run
in the regular unit gate. The opt-in SQL suite requires a NEW empty local database
replayed through migration96 using the existing disposable bootstrap. It accepts
only the named local Docker socket/container and a scratch database named
`ats_source_event_fresh_` followed by32 lowercase hex characters; it rejects the
shared `postgres` database. Never point it at staging/production or copy business
rows into the scratch DB.

```sh
SOURCE_HANDOFF_DISPOSABLE=1 \
SOURCE_HANDOFF_DOCKER_BIN=/path/to/local/docker \
DOCKER_HOST=unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock \
SOURCE_HANDOFF_DATABASE="$SOURCE_HANDOFF_FRESH_DATABASE" \
SOURCE_HANDOFF_RESULTS_FILE="$SOURCE_HANDOFF_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/source-event-handoff.integration.test.mjs
```

The17 scenarios exercise actual SQL/RLS/row locks and the response server action;
provider transport is always a stub. They temporarily inject constraints in their
own scratch database, remove only those constraints, revoke only their own tokens
and disable only their own synthetic actors. Financial/audit history remains.
No migration reset, hosted write, real email or scanner activation runs.
See `../DURABLE_SOURCE_EVENT_HANDOFF.md` for scope, mixed-client holds, reproducible
local evidence, limitations and the separate staging96 reconciliation boundary.

## Staging source-event candidate96

`staging-source-event-candidate.test.mjs` runs in the regular gate and rejects
source/metadata drift, missing or nonempty private state, wrong physical target,
guard/config/default changes and any production/write flags before I/O.
`supabase/staging/tests/source-event-handoff.sql` contributes35 rolled-back pgTAP
assertions to the existing NEW EMPTY LOCAL staging rehearsal. It exercises actual
SQL roles, private source capture, exact owner review, no-send preparation and
live offboarding checks; do not run positive fixtures on hosted staging.

Current assigned-target read-only maintenance is
`scripts/release/verify-staging-source-event-candidate.mjs`; see
`../STAGING_SOURCE_EVENT_RECONCILIATION.md` for fresh private configuration input,
exact96 seals and the two reviewed hosted privileged-RPC advisor warnings.
The prior93/94/95 verifiers and profiles retain their historical meaning.

## Staging runtime and perimeter acceptance

`staging-edge-adapter.test.mjs` runs six cases in the regular unit gate. The helper
executes the actual Edge entry source with synthetic Web API/platform bindings;
it does not emulate Netlify's Deno runtime or CDN.

The compiled acceptance suite requires Node22 and a NEW isolated source export
created by `scripts/release/prepare-staging-copy.mjs`, built using only the exact
`stagingFixture()` manifest/environment. Never assign the shared target manifest
or copy app `.env`/Netlify/project credentials into that copy. Preserve `TMPDIR`
from the export/build invocation, especially on macOS with canonical `/private`
temporary paths. The harness rejects ordinary checkouts, missing/mismatched source
receipts, linked env files, changed export configuration and non-fixture targets.

```sh
STAGING_RUNTIME_DISPOSABLE=1 \
STAGING_RUNTIME_EXPORTED_APP="$STAGING_SYNTHETIC_EXPORTED_APP" \
STAGING_RUNTIME_SOURCE_COMMIT="$STAGING_EXPORTED_SOURCE_COMMIT" \
STAGING_RUNTIME_RESULTS_FILE="$STAGING_RUNTIME_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/staging-runtime-access.integration.test.mjs
```

It starts only owned loopback processes, rejects production/provider startup
bindings, blocks/records child outbound networking, forwards permitted Web API
requests to the actual compiled app, then stops its processes. All keys/code and
recipients are synthetic. No deployment, live provider, actual hosted credential,
database mutation or scanner activation runs. The results explicitly leave hosted
runtime/CDN/key verification and hosting readiness false. See
`../STAGING_RUNTIME_ACCESS_ACCEPTANCE.md` for scope and remaining hosted checks.

### Invoice reconciliation acknowledgements

`payment-reconciliation-acknowledgement.test.mjs` runs in the ordinary unit gate.
It exercises the real reconciliation helper with malformed/lost acknowledgements,
valid SQL-shaped receipts and the existing manual correction/restore actions.

The opt-in database companion is restricted to the existing local disposable
container/database. It executes the installed financial command for six synthetic
invoice/payment cases and checks anonymous/unauthorised denial. Every fixture and
write rolls back; no Auth user, migration, network provider, hosted database or
communication worker is involved. Set `DOCKER_HOST` to the existing disposable
stack's Unix socket and `RECONCILIATION_ACK_DOCKER_BIN` to your local Docker binary.

```sh
RECONCILIATION_ACK_DISPOSABLE=1 \
RECONCILIATION_ACK_DOCKER_BIN="$LOCAL_DOCKER_BIN" \
RECONCILIATION_ACK_RESULTS_FILE="$LOCAL_RECONCILIATION_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/payment-reconciliation-acknowledgement.integration.test.mjs
```

This proves receipt compatibility and retained denials on local PostgreSQL. It
does not simulate an actual committed response loss or establish hosted acceptance.

### Manual-payment recovery confirmations

`manual-payment-attempt.test.mjs` and `mobile-manual-payment-recovery.test.mjs`
run in the ordinary regression gate. They exercise actual action/route code with
malformed, contradictory and lost acknowledgements, confirmed/corrected replays,
role denial and follow-up planning failures. Web and mobile share the pure
`manual-payment-receipts.ts` checks; successful API shapes/version stay unchanged.

The opt-in companion is fixed to the existing disposable PostgreSQL container and
Unix socket. It inserts synthetic Auth/profile/role/invoice/payment fixtures in
transactions, calls installed commands, and rolls everything back. It uses no
API keys, real sign-in, outbound email, payment provider or hosted connection.
Eleven scenarios each exercise web and mobile callers, including live crew,
disabled-profile and separated-employee denial despite stale application authority.
The separated state is operator-seeded for this predicate test; it does not test
the offboarding transaction itself, which retains its existing separate suite.

```sh
MANUAL_PAYMENT_RECOVERY_DISPOSABLE=1 \
MANUAL_PAYMENT_RECOVERY_DOCKER_BIN="$LOCAL_DOCKER_BIN" \
MANUAL_PAYMENT_RECOVERY_RESULTS_FILE="$LOCAL_MANUAL_PAYMENT_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/manual-payment-recovery.integration.test.mjs
```

Set `DOCKER_HOST` to the same existing disposable Unix socket used above. Every
fixture and write rolls back, including failed connections. This verifies installed
SQL receipt compatibility and access checks through controlled caller adapters;
it does not prove hosted PostgREST HTTP/Auth behavior or an actual committed
network-response loss. No migration, ledger repair or activation runs.

### Invoice checkout closure confirmation

The ordinary regression gate includes `checkout-closure-confirmation.test.mjs`.
It injects incomplete/mismatched begin, lookup, binding, closure, lease and final
receipts into the real helpers and verifies that unconfirmed results cannot
authorize provider work, replacement success or invoice finalization.

The separate installed-SQL suite requires the existing disposable local stack:

```sh
DOCKER_HOST=unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock \
CHECKOUT_CLOSURE_DISPOSABLE=1 \
CHECKOUT_CLOSURE_DOCKER_BIN="$LOCAL_DOCKER_BIN" \
CHECKOUT_CLOSURE_RESULTS_FILE="$LOCAL_CHECKOUT_CLOSURE_RESULTS_FILE" \
node --experimental-strip-types --test tests/checkout-closure-confirmation.integration.test.mjs
```

`LOCAL_DOCKER_BIN` is the installed Docker executable;
`LOCAL_CHECKOUT_CLOSURE_RESULTS_FILE` is a private output path. Nine scenarios
interleave actual helpers with installed PostgreSQL functions and checkout
updates, including acknowledgements lost after the SQL side effect, replay,
review, live lease expiry and account denials. The connection uses one outer
rollback and per-scenario savepoints. No real provider is called; no fixture or
temporary helper persists. This does not prove independent commits, concurrent
connections, hosted HTTP/Auth behavior or actual Stripe state. See
`../CHECKOUT_CLOSURE_CONFIRMATION.md` for scope and verification limits.

### Stripe webhook checkpoint confirmation

`webhook-checkpoint.test.mjs` runs in the regular gate. It exercises the actual
runner and HTTP route with incomplete claims, snapshots, apply results, reminder
planning, notification reads/claims and sender outcomes. It preserves terminal
claim/ignored-event replays and checks that unknown outcomes with retries disabled
remain review cases. Nullable notification content is checked against the adapter.

The opt-in companion calls the installed local SQL protocol inside one outer
rollback: financial apply, failure/reclaim, reminder checkpoint, reserved email
submission, review on replay, completion and attempt exhaustion. It collects only
synthetic-recipient response shapes and exercises them through controlled runner
adapters. No email/payment provider, API keys or hosted database is involved.
Other recipients' newly generated fixture-event inbox rows are skipped using the
existing protocol inside that same rollback; existing inbox rows are untouched.

```sh
WEBHOOK_CHECKPOINT_DISPOSABLE=1 \
WEBHOOK_CHECKPOINT_DOCKER_BIN="$LOCAL_DOCKER_BIN" \
WEBHOOK_CHECKPOINT_RESULTS_FILE="$LOCAL_WEBHOOK_CHECKPOINT_RESULTS_FILE" \
node --conditions=react-server --experimental-strip-types --test tests/webhook-checkpoint.integration.test.mjs
```

Use the existing disposable Unix `DOCKER_HOST` above. This test verifies installed
SQL state transitions and compatibility of collected responses, rather than live
interleaving between the runner and database. It does not prove independent
commits, actual HTTP/Auth, network-loss recovery, lease races or hosted acceptance.
The separate PR06/07 Auth/concurrency suites retain their existing role.
