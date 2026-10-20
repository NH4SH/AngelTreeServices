# Staging source-event handoff reconciliation

October20, 2026. Verified handoff commit `ef9defd` is pushed to `main` and
`codex/durable-source-event-handoff`, deployment skipped. **ATS CRM Staging now
has exactly96 original migrations**, including unchanged
`20261020064543_durable_customer_source_events.sql`.

Only the assigned staging database `gbyhdsuiqeslgjdnbqng` was upgraded. No app,
scanner or Edge Function was deployed. Production data, configuration and
credentials were not changed; its ready CSS-only deploy remains
`6ad6ecfc6c03786554247e4a`, confirmed by read-only Netlify metadata after the push.
The reconciliation tools/report are local on `codex/staging-source-event-reconciliation`,
based on the pushed main. Existing employee, financial, portal and scanner work
is preserved. No application runtime or existing migration source was edited.

## Upgrade evidence

Fresh read-only checks confirmed the assigned healthy ATS project, recorded
physical database identity, exact95 history/catalog/grants/defaults, normal
non-superuser migration owner, no protected-role membership, active no-send Auth
guard and unchanged effective Auth/API configuration. Business/Auth/file/queue,
notification/preparation/outbox and quote retry counters were all0. Sending,
recurring generation and scanning were OFF; all eight storage buckets private.

A new empty local database replayed93 original files, then received the existing
local managed-default/object-grant fixtures, reviewed permission reconciliation
and guarded local Auth installer. Replaying94/95 reproduced hosted95 exactly,
including the complete4,782-entry catalog. No business rows or hosted project keys
were copied locally. The original96th file was rehearsed using the CLI, including
a deliberate last-statement fault: the full migration and ledger rolled back to95.
The unchanged original file then succeeded; a second local migration run was a no-op.

| Catalog evidence | Result |
| --- | --- |
| Full96 catalog | 4,843 entries; exact local/hosted match |
| Added entries | 61: two private tables, one private sequence,25 catalog columns including three sequence attributes,14 constraints,10 indexes, eight routines, one trigger |
| Existing definitions changed / removed | 0 /0 |
| Exact ledger | 96 original version/name pairs; no history repair or synthetic baseline |
| Public API ACL seal | `0d2c9a7046947cd1dfd7058e5cfefbfe` |
| Shape seal | `65b32375b979481067e9e11561a4f6ec` |
| Ledger seal | `3ccd0a688484650bfc31b4a3a6c809f5` |
| Migration-owner default API grants | 0; owned, managed and global defaults unchanged |
| New source intents / response receipts | 0 /0 |
| Notification/preparation/outbox/provider/history counters | All0 |
| Automation / scanning / buckets / Auth guard | Exact existing OFF/private/no-send state retained |

The new `supabase/staging/source-event-candidate-96.json` binds the previous95
candidate, unchanged source manifest/catalog query and exact96 migration bytes to
these reviewed seals and full delta. The earlier93/94/95 candidates, historical
source-review inventory and readiness flags are preserved. The historical deferred
inventory is not a current pending-hosted-migration list.

A private, unlinked CLI directory contained exactly96 checked original files,
seed-disabled configuration, no app env and no copied project credentials. The
staging dry run selected only migration96 with no seed/role changes. Immediately
before apply, the full95 catalog and evidence were checked again with fresh
configuration and project identity. The CLI applied that original file once with
`--skip-vault`; no reset, migration repair, role import, Auth push, configuration
patch or credential provisioning ran. Post-apply catalog and delta exactly match
local rehearsal. A second hosted dry run is up to date. The independent96
maintenance verifier passes with exact guards, effective privileges and empty/OFF
state. No reapplication or rollback was needed on staging.

## Verification and permission review

- **856 regular regression results pass**, no failures/skips. Seven new candidate
  cases cover pinned sources, exact ledger/catalog/grants/defaults, physical target,
  active guard/config/freshness, nonempty source/response/preparation/outbox state
  and production/write-flag arguments rejected before files or CLI access.
- **271 rolled-back local pgTAP assertions pass** under normal `postgres`, including
 35 new source handoff checks. Actual roles exercise private table/sequence/helper
  denial, exact command grants, end-user service-subject refusal, source capture
  with the required quote-change note, pending recovery, redacted owner-only listing,
  exact reviewed authority, complete replayed preparation with zero provider attempts,
  frozen facts and offboarded reviewer refusal. Existing workflow/security and
  no-send Auth tests remain in that gate. No managed-role membership was added.
- **23 actual read-only staging denial probes pass**: anonymous/signed-in invocation,
  service invocations carrying an end-user subject, unauthorised review calls and
  direct private-table reads. All five server commands are service-only; two review
  commands grant only `authenticated` and enforce live owner/admin access in their
  bodies. The trigger helper, both tables and the identity sequence have zero direct
  API privileges. Both tables have RLS; all eight new routines pin empty search paths.
  Staging positive fixtures/provider dispatch were deliberately not run.
- The unchanged Auth function retains its real Auth-service execution grant and exact
  definition/owner/ACL/effective access. Invoking its pure no-send body as the normal
  owner returns synthetic503, with no network/provider I/O. This is not a fresh
  hosted Auth HTTP delivery test.
- Node22 typecheck passes in an isolated source copy with synthetic configuration,
  no copied env/credentials or hosting link. Offline generated schema/migration
  fingerprints and JavaScript syntax checks pass. Application runtime and all96
  migration sources are unchanged, retaining the verified optimized `ef9defd` build.
- The shared local stack was not written by this reconciliation. All110 public-table
  row fingerprint sets, function/schema and constraint fingerprints, policies,
  buckets, scan settings and native68-entry ledger exactly match this package's
  separate pre-work baseline. Existing review material remains untracked/preserved.

### Hosted advisor findings

Hosted security WARNs rise **57→59**. Both additions are
`authenticated_security_definer_function_executable` for the intentional
`list_pending_customer_source_events` and `review_customer_source_event` RPCs.
The hosted advisor reports these broadly privileged execution surfaces even when
their bodies contain explicit owner/admin checks. The local CLI advisor used in
implementation verification did not surface these two checks; local and hosted
advisor counts must not be equated.

Both endpoints were reviewed against their unchanged source definitions and tested
with actual denied roles, missing identities, crew, disabled owner and lost review
authority. They use `auth.uid()` and the unchanged live `email_staff` predicate,
not user-editable metadata or client-supplied roles. Review authority is rechecked
after locks; preparation requires its exact fresh receipt and never sends email.
They need controlled access to private intent/review state. Their intentional
privilege boundary is retained rather than widening table access or replacing
live authorization to remove a warning. No finding was suppressed. The57 prior
WARNs remain; the two new warnings are reviewed intentional RPC surfaces, not a
claim of warning-free staging.

INFO count29→31 reflects the two deliberately private tables with RLS and no client
policy. Their grants are revoked. No permissive policy was added to silence those
informational findings. See [Supabase advisor0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
and [private deny-by-default RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Current maintenance and next step

From `apps/platform`, with the existing authenticated CLI and a fresh private
staging Management API configuration GET:

```sh
STAGING_SUPABASE_BIN=/path/to/supabase \
node scripts/release/verify-staging-source-event-candidate.mjs \
  --project-ref gbyhdsuiqeslgjdnbqng \
  --auth-config-file /private/fresh-managed-config.json
```

This entry point is read-only. It cannot apply migrations, alter configuration,
retrieve project keys or deploy. It demands the exact96 catalog/ledger/grants,
assigned physical identity, no-send guard, fresh unchanged Auth/API fingerprints,
empty source/response/notification/delivery state and inactive automation/scanning.
Earlier maintenance verifiers intentionally reject a96-entry target.

The staging app remains undeployed; shared hosting/activation readiness remains
false. No key was retrieved, created, exposed or rotated. No historical notices
were backfilled and no provider was contacted. Scanner work remains parked.
Next in the existing plan is protected-staging runtime/access/CDN acceptance;
home-scanner/restore/operator gates remain separate. This database reconciliation
does not authorize app deployment, production migration, real customer sends,
legacy bulk replay or scanner activation.

Safe results: `staging/SOURCE_EVENT_RECONCILIATION_VERIFICATION.json`.
Private reproduction/read-only metadata:
`/Users/noelsierra/Documents/Codex/2026-10-20/staging-96/`.
Reference: [Supabase migrations](https://supabase.com/docs/guides/local-development/database-migrations).
