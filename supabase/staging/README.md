# Staging permission reconciliation

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
  Changes to those defaults need a supported provider review; only `postgres`
  may create application objects in the current reviewed staging process.
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
