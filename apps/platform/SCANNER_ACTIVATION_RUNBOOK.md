# PR18 staged activation runbook

**Reconciliation update, October 17:** the exact 65/92 comparison and local CLI
upgrade are complete in [MIGRATION_RECONCILIATION_REPORT.md](MIGRATION_RECONCILIATION_REPORT.md).
All 27 versions are pending; no history repair was performed or recommended.
Use [STAGING_PREPARATION.md](STAGING_PREPARATION.md) for the isolated export,
unassigned targets and remaining canonical-origin/operations decisions. The
hosted schema, current deployment and production settings remain unchanged.

**Readiness update, October 17 UTC:** main includes verified upload/access
`aa5c1b2`, deployment skipped, and the release chain contains 92 migrations.
The versioned host package and synthetic seven-area/catalog recovery drills are
verified locally in [SCANNER_HOSTING_AND_RESTORE.md](SCANNER_HOSTING_AND_RESTORE.md).
Use its corrected scanner limits and secret-mount guidance. Earlier 65/91 counts
below describe the original review snapshot; repeat reconciliation against the
exact 92-file release chain. Gates 2/3 still need separate approval and evidence
on the actual host/provider. Local recovery does not create production backups.

Status: **reviewed plan; execution not authorized**. Baseline: published `df59d8a`.
Use with SCANNER_ACTIVATION_REVIEW.md and SUPABASE_MIGRATION_RECONCILIATION.md.
No step in this document grants permission to create a host, buy capacity,
change credentials, migrate hosted data, deploy a preview/production build,
scan business files or delete records.

## Responsibility and release record

Noel approves spend, record retention, accepted signed-link/cache behavior and
the release window. Assign an operating maintainer before provisioning. Record
approvals and evidence for each gate; do not infer approval from a prior Git push.

Record the exact application SHA, schema/migration comparison, environment IDs,
scanner engine/image/config digest, signature age, backup/restore evidence,
transport/cache measurements, bucket census, release time and maintainer.
Use IDs/counts/status only in shared records. Keep credentials and detailed
file inventories private; never attach business files to logs or this runbook.

## Gate 1 — reconcile and prepare locally

1. Fetch current main and compare the planned release with the actual live build.
   At review time main is `df59d8a`; live CRM is `49a0b82`. A later unmarked push
   can deploy every previously skipped commit. Keep `[skip netlify]` on any
   review/development commit that is pushed before deployment approval.
2. Compare production migration versions and actual objects, function bodies,
   privileges, triggers and RLS using the existing reconciliation procedure.
   The current 65/91 history difference is a release dependency, not a license
   to replay 26 files. No history repair or db push until reviewed.
3. Re-run the fresh local migration/contract check for the final release SHA.
   Do not reset the shared disposable review stack. Previous evidence replayed
   all 91 migrations separately; a changed chain needs its own verification.
4. Resolve the supported-size upload transport and private-file cache/access
   contract. Preserve existing features and guards; a smaller hidden upload
   limit is not a completed fix. Do not assume a 26 MB Next setting changes
   the provider's request limits.

**Stop** on drift, an unclassified migration, changed permission/financial behavior,
unverified large-file transport, or an unclear cache/revocation guarantee.

## Gate 2 — approved hosting and isolated staging

These are future provisioning/deployment steps requiring separate approval.

1. Confirm company billing, budget, region and dedicated hostname. Provision the
   reviewed owned host; keep the database and files on their existing services.
   Configure TLS ingress, private engine/bridge ports, restricted administration,
   supervised processes, bounded memory/tmpfs/logs and freshclam updates.
2. Configure separate staging and production scanner credentials in private runtime
   storage. Do not reuse a production service key or scanner token for previews.
   Verify actual target project IDs without logging credentials. Existing masked
   context values do not establish isolation.
3. Before enabling file checks, test the scanner directly with synthetic clean,
   EICAR, encrypted/limit-exceeded, empty, oversized, wrong-token and saturation
   fixtures. Confirm authentication, digest agreement, strict verdicts, current
   loaded signatures and bounded failures. Do not claim an encrypted/unreadable
   file passed merely because no signature was found.
4. Configure and verify the source-file backup/restore policy alongside database
   recovery. A restored object receives a new identity and a new scan. Never
   restore a clean verdict by copying metadata or overwrite an approved library
   path in place. Restore only synthetic fixtures in staging during this gate.
5. After explicit staging deployment approval, apply the reviewed schema chain
   with all seven scan gates OFF before releasing the matching app. Validate
   ordinary permissions/metadata workflows in this state. Missing mode RPCs block
   new uploads; schema and app must be ordered deliberately.
6. In isolated staging, prove supported sizes through the actual deployed adapter,
   rather than calling Supabase directly as a substitute for a browser upload.
   Test small files, just below/above the documented platform boundary, each
   existing area's 6/10/15/25 MiB cap, and one over each application limit. Record
   exact byte counts, response and latency. Direct Storage transfers, if adopted,
   must remain authenticated and held until validation/metadata/audit/scan complete.
7. Verify actual private-object response cache headers and CDN behavior, including
   an already issued URL after actor disablement and after token expiry. Local
   Storage has no hosted Smart CDN and cannot prove the hosted result. No-store
   on the redirect is not enough. Confirm the agreed access window or redesign
   delivery if per-request revocation is required. Previously downloaded bytes
   cannot be recalled.
8. Exercise all seven bucket workflows with ON gates: staff/self credentials,
   restricted/supervisor documents and profile images, training/safety, equipment
   problem photos, each materials attachment type, costs and all photo categories.
   Re-run permission, deactivation, replacement/race, audit, outage and financial
   preservation cases. Keep the existing role/RLS/transaction boundaries.

**Stop** on cross-environment access, request-size failures, expired/stale engine
state, lack of a restore proof, resource exhaustion or an unaccepted cache model.
No production switches are enabled by passing an isolated staging test alone.

## Gate 3 — approved production window

Do not execute until the owner approves the final concrete release evidence.

1. Confirm the unchanged source project, published app SHA, reviewed migration
   classification, source-file backup capability and operating maintainer.
2. Apply only the approved schema/reconciliation steps, preserving old migrations
   and history. Verify both scanner settings structures, service-only grants,
   original RLS and added restrictive gates. Keep switches OFF during schema/app
   cutover. Never edit old migrations or normalize permissions opportunistically.
3. Configure the production HTTPS scanner and runtime-only credential through the
   approved secret-management process. Run synthetic scanner-only health checks;
   do not send a business document as the first smoke test. Release the exact
   approved application only after the schema/configuration is ready.
4. Run `supabase/verification/attachment_activation_inventory.sql` in a read-only
   session with a short timeout. A missing bucket (`bucket_public` null), public
   bucket, unknown size, orphan candidate or missing reference requires review.
   Save aggregates and timestamp, not paths. The query's unarchived-reference
   label describes the direct file row, not employment status or effective access.
5. Enable **one approved empty area at a time**, recording before/after counts and
   verification. Proposed order: platform-documents, equipment-files,
   employee-program-files, material-files, job-cost-receipts, employee-files,
   job-photos. This puts higher-impact field/HR workflows after initial evidence.
   The library uses its own singleton switch; six remaining areas use per-bucket
   switches. Never assume one switch controls all seven.
6. If an area is no longer empty, follow the legacy branch below. Do not silently
   treat old objects as checked. For an empty area, verify a synthetic normal
   upload, held/unavailable behavior, clean opening, direct unauthorized denial,
   classification, private bucket status and expected audit events. Remove/archive
   release fixtures only through a separately approved retention path.
7. Require a healthy observation period and maintainer sign-off before progressing
   to another area. Proposal: 30 minutes with no unexplained error for each area;
   stop the sequence on any discrepancy. Observe the completed rollout for a
   business day before considering it operationally complete.

No recurring-generation, reminder, financial, offboarding or employee-layout
settings change as part of this process.

## Legacy branch — only if the fresh inventory changes

The reviewed hosted snapshot had zero objects/references in every area. No bulk
worker or grandfathering step is justified now.

If files appear before approval:

1. Preserve them and their audit/parent relationships. Privately classify current,
   archived, orphan, missing, oversized and unreadable objects. Counts do not
   authorize deletion, and a metadata row is not proof that its bytes exist.
2. Agree a bounded access window: current claim commands reject scans while OFF.
   Turning ON first holds those old files. If uninterrupted legacy access is
   required, stop and design a separately reviewed preparation mode; do not bypass
   the gate or pretend the current system already pre-scans while OFF.
3. Use an active authorized admin and existing service commands through an
   authenticated entry point. Do not impersonate a disabled uploader. Check one
   file at a time, with recorded outcomes/checkpoints and saturation backoff.
   A later worker must have a reviewed allowlisted manifest, limits and live actor
   checks; there is no arbitrary-path bulk worker in this release.
4. Respect lease expiry and immutable object/version/generation checks. A timeout
   remains held and can be explicitly retried. Quarantine, missing/oversized bytes
   and scanner-limit/format failures remain protected for review. Never set clean
   with SQL, copy another digest, or delete a problem file to make counts match.
5. An already issued signed URL may remain usable, and hosted cached copies may
   outlive token expiry. Stop new issuance and follow the approved cache/access
   policy; do not promise an immediate cutoff by switching ON. If strict cutoff
   is required, resolve the delivery design before activation.

## Incident and safe recovery

**Leave gates ON.** Switching OFF bypasses scan protection even for quarantined
objects. Do not change RLS, make a bucket public, extend privileges or replay a
financial action to compensate for a held file.

Pause the rollout and any proposed legacy worker. Check TLS, bridge/engine reachability,
loaded signature age, clock, resource saturation, service-only command permissions
and object/lease state. Refresh definitions or repair forward; rerun synthetic
clean/EICAR probes. Explicitly retry only unavailable/expired files. Quarantined
files require a safe new upload. No automatic retry that duplicates a cost,
credential, receipt metadata or customer message is part of recovery.

If app/schema compatibility fails, use an explicitly reviewed fix-forward release
that retains the protection, rather than restoring a pre-boundary application or
disabling the gate. Restoring a database alone does not restore missing file bytes.
Do not rotate Auth keys expecting Storage signed links to be revoked.

## Completion evidence

For each area, retain approved release SHA/schema/engine versions, private switch
receipt, aggregate counts, clean/held/quarantine permissions and audit results,
supported-size and cache behavior, a synthetic restore proof, health/signature
maintenance evidence and maintainer sign-off. No business files or credentials
belong in this packet.

Review-time evidence: 18 targeted tests and 7 local rehearsals passed; existing
switches were restored. Production stayed on its existing deployment, with scan
schema absent and no activation. Further staging/provisioning/production steps
remain unexecuted.

## Upload/access local follow-through

Read UPLOAD_ACCESS_READINESS.md before the next approved release rehearsal. The
local chain now has 92 migrations, including a private transport holding bucket.
Keep it permanently unreadable to ordinary clients. Successful transfers remove
only their temporary buffers; failed/uncertain buffers require preserve-first
review and expire for consumption after one hour. No scheduled purge is present.

Stage the web/server and updated native contract together in isolated targets.
Prove 6/10/15/25 MiB supported uploads, 25 MiB chunked downloads, object replacement
and actor revocation, all original scan gates/classifications, CDN no-store headers,
and exact byte reconstruction on the actual adapter. Existing old native multipart
uploads still have the hosting request limit. Previously issued signed links and
saved copies are not revoked by the new route. Never rotate production Auth keys
or delete business objects to manufacture a successful revocation test.
