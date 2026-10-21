# Staging permission reconciliation

**Current candidate (October20):** ATS staging now has94 migrations, including
`20261020051222_atomic_customer_quote_changes.sql`. Its exact metadata, ledger,
permissions and active no-send Auth guard match the separately reviewed local
rehearsal. Run the current read-only verifier from `apps/platform`:

```sh
node scripts/release/verify-staging-quote-change-candidate.mjs --project-ref gbyhdsuiqeslgjdnbqng --auth-config-file /private/fresh-managed-config.json
```

The configuration input must be a fresh mode0600 effective Management API GET for
this exact staging project. The verifier never retrieves keys, applies SQL,
changes configuration, repairs history or deploys. `STAGING_SUPABASE_BIN` can select
the existing pinned CLI. It requires the physical database identity, exact94-entry
version/name ledger, complete reviewed schema/ACL/defaults, empty business/retry
state, OFF switches and unchanged active email guard. See
`apps/platform/STAGING_QUOTE_CHANGE_RECONCILIATION.md` for evidence and limits.

The original92 repair and93 appointment/installation verifiers stay historical.
They intentionally reject a94-entry hosted target. `quote-change-candidate-94.json`
binds the unchanged93 candidate and the one additional migration.
`deferred-migrations.json` still pins the migration deferred **from the historical
93 source candidate**; it is not a current hosted installation/status manifest.
Earlier dated verification/target JSON files retain their historical observations.
The new reconciliation report records the94 state without changing readiness.

## Previous 93-migration candidate (historical)

`appointment-candidate-93.json` binds the frozen92 profile, original92-file
manifest and unchanged appointment addition. Its read-only verifier is
`verify-staging-appointment-candidate.mjs`. Do not rerun old repair SQL or treat a
historical approval as permission for a later inventory. See
`apps/platform/STAGING_APPOINTMENT_RECONCILIATION.md` for its original evidence.

## Original 92-migration repair (historical)

This is a versioned **staging-only operational package**, not a production
migration. Nothing here is selected by `supabase db push`. The original 92
migrations and their pinned manifest remain unchanged.

Run from `apps/platform` using Node 22 and authenticated Supabase CLI 2.121.0:

```sh
node scripts/release/staging-permissions.mjs --project-ref gbyhdsuiqeslgjdnbqng
node scripts/release/staging-permissions.mjs --project-ref gbyhdsuiqeslgjdnbqng --apply
```

The first command is read-only. The second applies only when needed. If the CLI
is not on PATH, `STAGING_SUPABASE_BIN` selects its installed executable. Neither
command requests or installs API keys. Private evidence goes into a new temporary
directory; no checkout is linked and no app is built or deployed.

The runner verifies the assigned project, ATS organization and healthy state,
original file hashes and complete migration inventory, 92-entry ledger, schema
and grants fingerprints, normal non-superuser migration role, empty application
state and disabled automation/scanning. Unknown grants or objects stop it. The
transaction rechecks its complete preimage and verifies the resulting ACL
contract, shape, ledger, protected defaults and empty/OFF state before commit.
It never widens a grant, rewrites a routine or RLS policy, resets a database,
changes role memberships, repairs history or touches production.

`reconcile-permissions.sql` contains 279 explicit REVOKE statements on the 108
affected application objects, plus three default-privilege statements for
`postgres` in `public`. Its SHA-256 and the metadata-query SHA-256 are pinned by
`permission-profile.json`. Apply it through the runner, not by pasting the bare
SQL into an unrelated editor. The reviewed profile is deliberately limited to
this release and target; a new migration/object requires a new review.

## Boundaries that remain

- Redundant managed `USAGE` grants on the public schema remain; browser CREATE
  remains forbidden. Owner administration and explicit service privileges remain.
- Three `supabase_admin` defaults remain unchanged. The normal `postgres` account
  is neither superuser nor a member of this protected managed role. Do not grant
  yourself that role, change managed ownership or bypass its permission boundary.
  Any change to those defaults needs a supported provider path; only `postgres`
  may create application objects in the current reviewed staging process. The
  completed review accepts preserving them for this pinned candidate, with exact
  creator/catalog checks; it does not claim they are restricted or always safe.
- Schema-scoped default REVOKE cannot remove PostgreSQL's global implicit PUBLIC
  EXECUTE. New functions must explicitly revoke PUBLIC before granting their
  intended callers, in the same migration transaction. Global managed defaults
  were not changed. The local defaults test proves this distinction.
- Current application object grants and named migration-owner defaults are
  verified. Full provider/default reconciliation and hosting readiness are
  separate facts; neither is inferred from those successes.

## Local verification

Use a **new disposable database**, not the active review database. Replay the
original chain using the existing guarded `rehearse-local-upgrade.mjs` workflow.
The recorded rehearsal uses normal `postgres`, existing local Auth/Storage schema
only, no data/seed import, and a real CLI ledger. Reproduce the observed provider
defaults/object grants only in that database; administrative fixture setup uses
the already-existing local admin connection without changing any cluster role.

After reconciliation, run the existing `supabase/tests/*.sql` and
`supabase/staging/tests/*.sql` with pgTAP in `extensions`, under normal `postgres`.
Every test file begins a transaction and rolls its synthetic rows/probes back.
Use a TAP-aware runner or check both process exit and `not ok`/plan counts; psql
exit 0 alone does not prove a pgTAP suite passed.

The recorded run passes 160 assertions. A deliberately wrong postcondition
rolls the entire repair back; a second valid application is idempotent. The
permission runner's unit tests include wrong-target, changed schema/ledger,
unexpected rights/defaults, live data/gates and modified SQL rejection.

See `apps/platform/STAGING_PERMISSION_RECONCILIATION.md` for actual results,
preserved behavior and remaining release gates. No production cleanup is implied.

## Completed managed-default review

`review-managed-defaults.sql` is a read-only metadata query. Run it against the
assigned staging ref using the already-reviewed explicit CLI targeting process;
do not paste local fixture SQL into hosted tools. The permission runner also
requires that normal `postgres` is not a member of the protected managed role.

`review-tests/managed-defaults.local.sql` is intentionally outside the ordinary
test directory. It requires a new `ats_defaults_review_*` local clone (created
with `OWNER postgres`) and the already-existing local `supabase_admin` fixture
connection. It switches to the normal role for application assertions and
returns to the fixture connection for simulated provider-created objects. Never
grant a role to make this test work or run it against hosted Supabase.

The 25 assertions exercise creator-specific defaults, protected-role denial,
implicit PUBLIC versus direct named grants, and actual TRUNCATE despite RLS.
Everything rolls back. The full local run passes 185 database assertions, and a
real provider-created object is rejected by the frozen-catalog runner. See
`apps/platform/SUPABASE_MANAGED_DEFAULTS_REVIEW.md` for the disposition and scope.

Migration97 (`20261021012859_invoice_payment_principal_snapshot.sql`) is pinned in
`deferred-migrations.json` for separate staging review. It adds one server-only,
invoker read of complete successful invoice principal; it changes no money,
existing grants or rows. It has been tested only in fresh/local disposable
PostgreSQL. Historical candidates93–96 remain byte-pinned and do not include it;
no hosted readiness flag or staging target is advanced by this implementation.
A later reconciliation must verify its exact SQL, service-only execution, current
Auth guard, owned/managed defaults and unchanged empty/off state before any
staging-only installation. The portal reader requires this function before an
application release; absence fails closed, without falling back to row downloads.
