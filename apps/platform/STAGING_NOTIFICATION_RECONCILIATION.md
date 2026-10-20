# Staging atomic-notification migration reconciliation

October20, 2026. Verified atomic notification commit `ce1ca85` is pushed to `main`
and `codex/atomic-admin-notifications`, with deployment skipped. **CRM Staging in
ATS now has exactly95 migrations**, including the original unchanged
`20261020060328_atomic_customer_activity_notifications.sql`.

Only the assigned staging database was upgraded. No app, Edge Function or scanner
was deployed; production database, configuration, credentials and records were not
changed. The reconciliation profile, read-only maintenance verifier and tests are
local on `codex/staging-notification-reconciliation`, based on the pushed main.

## Reconciliation evidence

Fresh reads verified the assigned healthy staging project and ATS organization,
its previously recorded physical database identity, normal non-superuser
`postgres` migration owner, absence of protected-role membership, exact94-entry
ledger, prior catalog/ACL/default seals, empty application state, inactive
sending/recurring/scanning and active no-send Auth hook. Effective Auth/API config
fingerprints matched the existing activation profile.

A NEW empty local database replayed the original93 files using CLI2.121.0, then
received the existing local provider-default/object-grant fixtures, reviewed
permission reconciliation and guarded Auth installer. Applying the original94th
migration produced an exact match to the current hosted94 preimage. No business
rows, provider credentials or hosted project keys were copied into that database.

The original95th migration then produced this reviewed result:

| Evidence | Result |
| --- | --- |
| Complete application catalog | 4,782 entries; exact local/hosted match |
| Added catalog entries | 26: two private tables, six columns, nine constraints, four indexes, four routines, one trigger |
| Existing entries changed | Only the two reviewed `email_source_snapshot` / `email_source_eligible` notification extensions |
| Removed entries | 0 |
| Exact ledger | 95 original version/name pairs; no history repair or synthetic baseline |
| Public relation/routine ACL seal | `45e9f3474364dd26b69e029d82ca4e69` |
| Shape seal | `11d743ad1d17d02c8dcff348ea97547a` |
| Ledger seal | `130b0d88c0c6ebe44f1a229fd187b4b4` |
| Migration-owner default API grants | 0; owned/managed/global defaults unchanged |
| Business/Auth/file/queue and quote-retry receipts | 0 |
| Activities, notices, preparation/link receipts, outbox requests/attempts/provider events/suppressions/email history | All0 |
| Sending, recurring generation and scanning | OFF |
| Buckets | All eight remain private |
| Auth hook definition/owner/ACL/effective access | Exact existing definition retained |
| Effective Auth/API configuration | Unchanged |

`supabase/staging/notification-candidate-95.json` binds the immutable94 candidate,
original manifest/catalog query and exact migration bytes to the new catalog and
privilege seals. No earlier migration, candidate92/93/94 profile, guard package,
managed default or source business function was edited. The public RPC grant
change is the expected narrow addition of service-only preparation; it is not a
blanket grant or normalization of existing privileges.

## Upgrade and recovery checks

A private, unlinked CLI work directory held exactly95 checked migration files,
a minimal seed-disabled configuration and no app env or copied credentials. All
hosted operations explicitly named only `gbyhdsuiqeslgjdnbqng`. The dry run selected
only migration95, with no seeds or roles. `--skip-vault` prevented config-derived
Vault updates. No reset, Auth push, migration repair or role import ran.

Before the hosted operation, local CLI rehearsal deliberately failed at the last
statement of a temporary copy. Its complete schema/ledger change rolled back to94.
Restoring the unchanged source bytes succeeded; a second local migration run was
a no-op. Immediately before hosted apply, physical/project identity, full94
preimage/ledger, active guard, empty notification/delivery state and fresh effective
configuration were checked again. The original95th file ran once.

Post-apply catalog and delta match the local rehearsal exactly. The independent95
read-only verifier passed; a second hosted dry run reports up to date with no
pending migration, seed or role changes. No automatic rollback or reapplication
was needed. The earlier93/94 verifiers intentionally reject a95-entry target.

## Tests, permissions and preservation

- **836 regular regression results pass**, without failures/skips. Seven new
  candidate cases cover immutable sources/inventory, exact ledger/catalog/ACL/
  defaults, only the reviewed helper extensions, physical target, guard/config/
  freshness, nonempty application/private notice state and forbidden targets/
  write flags rejected before I/O. Existing CRM workflow coverage remains.
- **236 rolled-back local pgTAP assertions pass**, under normal `postgres`.
  This includes35 new notification assertions covering actual service/anonymous/
  signed-in invocation, private table/helper denial, own-recipient RLS, role
  overlap/disabled/crew exclusions, preference opt-out, frozen replay, payload
  collision, a service token with an end-user subject refused, normal PR14 claim,
  synthetic provider acceptance/history synchronization, no audience expansion
  and unchanged Auth no-send behavior. No protected-role membership was added.
- Node22 typecheck passes in an isolated current-source copy with synthetic
  configuration and no copied env/credentials/link. Offline schema contract and
  JavaScript syntax checks pass. App runtime source and all95 migration files are
  unchanged, so the optimized build verified for `ce1ca85` remains applicable.
- Read-only hosted probes confirm only service execution of preparation, zero
  API-role execution grants on the new private helpers, zero direct API grants
  on either private table, RLS enabled on both and the existing signed-in delivery
  review grant. No hosted positive notification fixture or dispatcher ran.
- The unchanged pure Auth hook returns synthetic503 when invoked by its normal
  owner; its real Auth-service grant and exact definition/effective permission
  seal are preserved. This makes no network/provider call and does not claim a
  fresh hosted Auth HTTP delivery test.
- Hosted security advisors remain at57 existing WARNs. No WARNs/errors were
  added. INFO count rises27→29 for the two deliberately private tables with
  [RLS enabled and no client policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
  Their API grants are revoked; no permissive policy was introduced to silence
  the informational notices.
- All110 shared-local public-table row sets exactly match the retained verified
  baseline. Original constraints/function definitions and the exact migration95
  extensions are verified; all28 new/extended shared-local catalog objects match
  the rehearsal. Policies, buckets, scanner settings and native68-entry ledger
  remain unchanged. This package writes no business fixtures to that shared DB.

Local evidence note: the first temporary preservation snapshot filename was reused
by the hosted metadata capture. The final check independently uses the retained
previous-package baseline plus exact migration95 definitions/catalog, and records
that provenance in the safe results. No CRM record was affected by the evidence
filename collision. Positive/new tests run in a separate fresh local database;
all their fixtures and temporary grants roll back.

The previous package's15 real notification/concurrency/recovery scenarios remain
documented in `ATOMIC_CUSTOMER_ACTIVITY_NOTIFICATIONS.md`. This reconciliation
verifies staging compatibility, schema and permissions; it does not claim hosted
provider delivery or exactly-once inbox behavior.

## Current maintenance and next work

From `apps/platform`, using the existing authenticated CLI and a fresh private
Management API configuration GET:

```sh
STAGING_SUPABASE_BIN=/path/to/supabase \
node scripts/release/verify-staging-notification-candidate.mjs \
  --project-ref gbyhdsuiqeslgjdnbqng \
  --auth-config-file /private/fresh-managed-config.json
```

The entry point is read-only; it cannot apply migrations, patch configuration,
retrieve project keys or deploy. It requires exact95 ledger/catalog/grants/defaults,
empty private preparation/delivery state, the assigned physical database, existing
active guard and fresh unchanged Auth/API fingerprints. Historical verifiers and
the93 deferred-source inventory keep their earlier source-review meaning; that
inventory is not a current pending-hosted-migration list.

The staging app remains undeployed and shared readiness/activation flags remain
unchanged. Production still publishes ready CSS-only deploy
`6ad6ecfc6c03786554247e4a`. No project key was retrieved, created, rotated or exposed.
The original local app/session, employee design and completed CRM changes remain
intact; scanner work remains parked.

Next within PR14: durable source-event handoff for older changed-only/timestamp
callers, because the business mutation → emitter invocation boundary remains
separate from the now-atomic preparation. Continue protected-staging runtime/
access/CDN acceptance and home-scanner/restore/operator gates separately. This
staging database success does not authorize app deployment, production migration,
customer sends or scanner activation.

Safe results: `staging/NOTIFICATION_RECONCILIATION_VERIFICATION.json`.
Private reproduction and read-only metadata:
`/Users/noelsierra/Documents/Codex/2026-10-20/staging-95/`.
References: [Supabase migrations](https://supabase.com/docs/guides/local-development/database-migrations),
[current changelog](https://supabase.com/changelog).

### Follow-up status

Reconciliation commit `ca30809` is now pushed to `main` and its branch, deployment
skipped. The subsequent local PR14 handoff package is described in
`DURABLE_SOURCE_EVENT_HANDOFF.md`. It adds checksum-pinned local migration96;
assigned hosted staging remains95 and the maintenance verifier still requires
that exact95 target. No hosted change or deployment is part of that follow-up.
