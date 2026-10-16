# CRM Usability Regression Checks

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

After adding `20261016002812_guarded_invoice_void.sql` to the disposable stack's
68-migration PR02/F08 baseline, run from `apps/platform`:

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
