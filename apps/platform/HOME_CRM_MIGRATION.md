# Home Mac CRM migration

Prepared October 27, 2026; live handoff October 29. **The CRM application and
database now run on the home Mac.** Netlify retains the unchanged public hostname
and the existing scheduler; Supabase holds independently verified encrypted
recovery checkpoints. The owner confirmed live dashboard sign-in. Hosting work
is isolated on `codex/home-crm-hosting`; unreleased materials/CRM feature changes
remain preserved in their original worktrees. Existing scanner routes are intact.

**Latest verification:** [HOME_CRM_CUTOVER_VERIFICATION.md](HOME_CRM_CUTOVER_VERIFICATION.md)
records the isolated production-feature runtime, managed-standby fencing and
permission restoration, online backup with a 278.39-second independent kernel
fence, and separate-machine native WAL recovery of all 177 table fingerprints.
The recovered online package also passed a clean managed-Supabase restore:
158 selected tables, 90,563 rows, 102 original application migration entries and
eight core API check groups, including payment replay, no resend and six private
files. The managed Auth email probe was rate-limited before hook execution and
is not claimed as an end-to-end pass. The latest suite passed **185 operations
tests**, including the final single-writer handoff guard.

The final managed-source copy matched 172 imported tables. New, explicitly
approved CRM Stripe/email credentials passed private provider checks; original
encryption keys, sender identity and webhook signing secret were preserved.
The old managed writer was fenced/drained before the Mac was admitted with a
real independent checkpoint and a new writer generation. The original managed
project is retained paused; the private recovery project stays active. CRM Staging
is restored and its exact profile verified after the approved free-slot swap,
preserving 129 application entries plus 15 reviewed maintenance entries. The five-minute limit still closes
writes when verification fails. Failover remains controlled and manual.

[HOME_CRM_VERIFIER_ROTATION.md](HOME_CRM_VERIFIER_ROTATION.md)
records the controlled overhead reduction, new-repository copy/readback/recovery,
and held retirement gates. All original generations are preserved. The payload
phase is pushed as `f79f875`; shared-object generations and integrity/admission
review remain prerequisites for unattended operation within free capacity.
[HOME_CRM_BACKUP_PAYLOAD.md](HOME_CRM_BACKUP_PAYLOAD.md)
records opt-in native archive pieces, reduced churn, a 177-table/266-function
recovery and the remaining verifier/retention budget blockers. No budget or write
admission rule was relaxed. The prior incremental phase is pushed as `feba3e4`.
[HOME_CRM_INCREMENTAL_VERIFICATION.md](HOME_CRM_INCREMENTAL_VERIFICATION.md)
records cold incremental archive verification, full-restore agreement and the
remaining producer-bandwidth blocker. Write admission remains unchanged. Staging
retains 129 application entries plus three reviewed lab maintenance operations.
[HOME_CRM_CLOUD_VERIFICATION.md](HOME_CRM_CLOUD_VERIFICATION.md)
records the isolated cloud authority, transfer caps, retention dry run and measured
free-budget blocker. At that full-read checkpoint, staging had its original 129 application ledger entries
plus two explicitly recorded lab maintenance entries; the historical starting
state below predates that installation.
[HOME_CRM_CONTINUOUS_BACKUPS.md](HOME_CRM_CONTINUOUS_BACKUPS.md)
records the bounded continuous capture, offsite verification and independent
deadline tests. [HOME_CRM_FAILOVER_VERIFICATION.md](HOME_CRM_FAILOVER_VERIFICATION.md)
records the earlier native/managed restore and approved temporary staging pause.
These findings and the live handoff report supersede the historical untested
recovery gates below. No automatic cloud promotion or unrelated feature release
was introduced.

## Decision

The owner selected a home Mac primary, Supabase recovery copy, **controlled manual
failover**, and **up to five minutes of lost saved work** after a failure. Recovery
time is not yet measured or promised. A periodic backup is not a running replica,
and DNS changes alone cannot prevent two writable copies.

Prepare the CRM application and a production self-hosted Supabase stack together
on the Mac, in a VM separate from the scanner. Keep the existing managed Supabase
project as the offsite backup/recovery destination and retain a matched Netlify
recovery build. Use the existing accounts. Do not turn the CLI benchmark stack,
its demo API keys, or its retired synthetic accounts into production.

Use Restic for encrypted incremental backup storage, rather than inventing an
encryption format or introducing another hosting service. An encrypted repository
was successfully published and read back using the existing Supabase Storage REST
API in staging. Pack/index/key files were copied before the snapshot publication;
an independently downloaded repository passed full verification and file restore.
This is a tested **archive transport**, not an activated production backup agent.
Native S3 access remains untested and is not required by this rehearsal.
Existing storage/egress allowances must be checked before activation; no paid
service or new provider account was created. Backup capacity and retention must
be measured, not assumed free indefinitely.

## Actual starting state

| Component | Verified state |
| --- | --- |
| Live CRM | `https://admin.angeltreeservices.org`, Netlify site `6fe7a9ca-878e-4b7b-bb4a-966efdc4d1a0` |
| Published release | Deploy `6adab6d33b9c3096a37ad0a1`, isolated dashboard hotfix from `8fa9df32c95a2e6d6a72c77422391ae7b9ca7528` |
| Production DB | `ddvlnixdugcbnrewktes`, us-west-2, Postgres `17.6.1.127`, 102 migrations through `20261021233829` |
| Data inventory | 61,426,835 database bytes; 3 Auth users/identities; no Vault secrets; all 8 private buckets have zero objects at the time checked |
| Staging DB | `gbyhdsuiqeslgjdnbqng`, 129 migrations through `20261026212535`; unchanged |
| Development baseline | Main `36d90bbeb003643cd24acf4318aa73d676568dbe`; pending material/equipment/job lookup work remains separate |
| Home hardware | Apple silicon, 16 GiB physical RAM, 10 CPUs, approximately 253 GiB free disk; FileVault on |
| Scanner | Existing 4 CPU / 8 GiB VM; bridges healthy; existing Greenpro bridge also running; no restarts/configuration changes by this work |
| Synthetic benchmark | Separate 2 CPU / 4 GiB VM, 126 migrations; stopped and retained |
| Production-feature candidate | New `ats-crm-candidate-20261027`, 2 CPU / 4 GiB, 102 migrations, fresh synthetic credentials, internal services only; stopped and retained after verification |

Production currently uses `pg_stat_statements`, `pgcrypto`, `plpgsql`,
`supabase_vault`, and `uuid-ossp`. No deployed Supabase Edge Functions were found.
No platform source use of Realtime channels or Functions invocation was found in
the scoped search. This does not replace checking the published artifact and
external clients before removing services.

The live release and main differ by **27 staged migrations**. Do not combine the
hosting move with those upgrades implicitly. First prepare a production-feature
parity source/schema candidate, carrying the separately verified framework/runtime
security fixes. Keep the full main/staging release available for a subsequent,
separately verified upgrade. Neither source pair has been promoted by this work.

## Backup and recovery contract

1. Target a complete offsite capture every two minutes, with the worst permitted
   recoverable write window of five minutes. Measure freshness from the coherent
   capture's **start**, not the upload time. A successful local dump is not an
   offsite backup. A partial Restic exit (including exit 3) is a failed capture.
2. Capture database/Auth rows, roles/grants/RLS/functions/triggers, migration
   history, immutable payment/checkout/webhook records, email requests/attempts/
   provider keys/outcomes/suppressions, and matching private file bytes. Include a
   source/image/config manifest and object digests. Keep secrets encrypted and
   outside Git. Store the recovery password on a second owner-controlled device;
   it cannot exist only on the failed Mac or inside its own encrypted backup.
3. A live database dump and an independently copied live file directory are not
   automatically coherent. Rehearse a bounded write barrier across app, Auth,
   Storage, intake, mobile and workers for each paired capture, or prove an
   equivalent versioned/object-retention protocol. Do not copy live PGDATA.
4. If offsite capture freshness exceeds five minutes, the eventual live write
   gate must refuse new writes until backup health recovers. This is necessary to
   keep the selected loss limit during an internet/backup outage. A candidate-only database guard has now been tested, including its known
   transaction limitation. Complete HTTP/provider admission, external authority
   and transaction draining are **not active or proven**; the prototype is not
   sufficient for promotion.
5. Recovery time is separate from lost-write time. After the old primary is
   conclusively fenced, compare the chosen capture with its proven write cutoff;
   an hour spent restoring does not itself mean an hour of lost transactions.
6. Restored email/payment state must retain original IDs, idempotency keys,
   claims, receipts and accepted outcomes. Keep all workers disabled initially.
   Review the possible five-minute gap against provider records. Hold uncertain
   deliveries and payments for reconciliation; never change them to “unsent” or
   reset counters to make retries proceed.

The offline checks in `scripts/home-hosting/recovery-policy.mjs` model these
acceptance conditions. They are **not production fencing or authorization code**.

## Writers that must move together

| Path | Required treatment before cutover/failover |
| --- | --- |
| CRM browser/server actions and customer documents | Same canonical links, complete Next runtime, tested cookies/Auth redirects/private downloads/upload limits |
| Supabase Auth, REST and Storage clients | New self-hosted endpoint/keys; preserve user IDs and password hashes; test reauthentication and RLS |
| iOS app | It has separately configured `SUPABASE_URL` and API base; an old app must not continue writing to the cloud standby |
| Public website intake | Inventory its actual runtime endpoint/credential and move the handoff without duplicating submissions |
| Stripe / Resend webhooks | Preserve canonical routes, signing validation, receipt IDs and recovery states; reject duplicate effects |
| Scheduled work | Five source functions cover customer communications, manager alerts, job advancement, health and Google Calendar; one scheduler/dispatcher authority only |
| Scanner/private files | Preserve the existing scanner hostnames, credentials, 25 MiB limits, fail-closed verdicts and file access checks; no shared payload/log directory |
| Operators | Keep management credentials private and audit deliberate promotion; returning Mac stays fenced until resynchronized |

Keeping Netlify as the scheduler is possible if its existing canonical internal
routes reach the active app. Do not also enable Mac timers for those same jobs.
Changing app hosting does not make Netlify-only Functions run automatically in
plain `next start`.

## Controlled cutover and failover

Build the single-writer protocol in the isolated candidate before routing users:

1. Use an externally recorded primary generation with a short-lived lease. Fence
   **every** home HTTP/API/provider dispatcher entry point after lease expiry;
   include Auth/Storage and alternate direct clients. An unreachable Mac, stopped
   browser, changed DNS record or a switch in an environment file is insufficient.
2. Rehearse how the managed cloud copy rejects old browser/mobile/API credentials
   while it is a standby. Merely disabling the old Netlify UI leaves direct
   Supabase access. Review any necessary cloud key/service changes as part of the
   concrete cutover; none were performed here. Never place both copies in a
   writable mode during testing or real operation.
3. During the scheduled move, drain/fence writes, take and remotely verify the final
   paired capture, then restore into the isolated destination. Confirm Auth/RLS,
   row/ledger/queue hashes and file digests before exposing it.
4. Switch canonical routing only after the new app/API/TLS boundary has passed
   checks. Preserve the currently working scanner TCP 443 ingress until a tested
   multi-host ingress replacement has an exact rollback. Do not expose Postgres,
   Docker sockets or Studio to the internet.
5. For failure recovery, fence the old generation first, restore the chosen paired
   capture into the managed destination using its supported import procedure,
   verify data/permissions/files, and reconcile the provider uncertainty window.
   Promote one new generation. Release customer-facing writes only after these
   checks; release automatic sending separately after duplicate-prevention checks.
6. A rollback after the Mac accepted new work requires moving that new state back.
   Switching DNS to the old pre-cutover database would lose all intervening work.
   Never let a recovered Mac start writing from its stale local database.

Managed Supabase's Postgres role membership supports subscription-related
operations, but that is not proof that it is a usable full-stack standby. The
official logical replication example is platform-to-external; it does not prove
the reverse design, replicate DDL, transfer file bytes, or provide one-writer
control. No subscription, replication slot, public database port or dual-write
implementation was created.

## Host and release gates still open

- Normal full reboot/FileVault recovery passed after the owner unlocked the Mac.
  Scanner autostart was delayed, then succeeded without manual intervention.
  A cold boot still requires owner unlock; unattended recovery and an outage-time
  commitment are not established. FileVault and automatic-login settings were
  preserved.
- Verify AC power, sustained thermal/memory/disk capacity and intended sleep/lid
  behavior. The read-only screen found sleep set to 1 minute and no caffeinate
  process. Prior scanner uptime does not prove unattended CRM availability.
- The dedicated 102-migration candidate now exists and passed native HTTP tests.
  Its services use pinned ARM64 images, fresh synthetic credentials, private
  volumes and bounded resources. Public HTTPS ingress and the source-address
  trust contract remain unprepared; no database port is exposed.
- The production-feature baseline passed real Auth HTTP login, cookie/Bearer
  authorization, private download and financial/email retry checks. The existing
  native recovery test remains a 126-migration test. A complete restore and
  managed-Supabase import of the matched 102-migration stack still need testing.
- Test managed-Supabase database import/promotion, actual private-file API serving,
  and the two-minute schedule under scanner load. Prove worst capture age remains
  within five minutes, including failure behavior. The staging archive transport
  passed; no production backup destination or schedule was activated.
- Complete external writer control and transaction/provider draining. Native
  guard and cold-database-restart experiments passed their scoped checks but
  also reproduced a bypass of deferred timing checks through early constraint
  evaluation. This is an explicit release blocker. Then verify outside-home
  HTTPS and a timed manual cloud recovery. Cellular performance is unmeasured.
- Confirm a fresh inventory immediately before a real export; the private file
  buckets may no longer be empty by then. Export customer data only into the
  approved encrypted/private migration path.

## Evidence and current checks

Private evidence is under
`/Users/noelsierra/Documents/Codex/2026-10-27/home-crm-migration` (0700).
Pending material lookup file hashes were recorded before creating this worktree.
The scanner Lima configuration remained
`804d0864c4e16c8b653e9f837ea923038f28d901a6bbd6353886a1fecb60a709`.

- Recovery policy tests: passed, including stale captures, incomplete uploads,
  mismatched files/releases, missing Auth/payment history, unfenced writers and
  provider uncertainty.
- Local Restic file-recovery rehearsal passed: two snapshot versions / five files
  each restored; wrong password rejected; deliberate pack corruption detected.
- Native home VM PostgreSQL recovery passed on the synthetic **126-migration**
  dataset: all 187 public/private/Auth/Storage table fingerprints, normalized RLS
  definitions, object grants/owners and public/private function fingerprints
  matched. All five retained synthetic private objects were recovered as bytes.
  The original test password verified against its restored hash; payment replay
  retained one payment and zero balance; accepted/unknown email rows could not be
  claimed. No providers were contacted. This was **not** an Auth HTTP login,
  restored Storage API download, production-102 test, or managed-Supabase import.
- The restore exposed ordinary owner privilege differences on two generated
  identity sequences. The snapshot now carries exact source sequence-owner
  privileges and reapplies those to the isolated clone; the full comparison still
  rejects additional/missing grants. RLS deparsing is compared under the same
  search path so schema qualification differences do not obscure real changes.
- The actual encrypted native backup passed a private staging Storage round trip:
  six ciphertext objects / 1,980,751 bytes, full Restic read-data verification,
  database digest match and all five object digests matched on this development
  Mac. Anonymous and public URL downloads were denied. The retained private
  synthetic bucket is `crm-recovery-rehearsal-455134b2038e`; staging schema history
  was not changed. The recovery password was transferred privately to the second
  Mac, outside the repository; no keys or plaintext dumps were uploaded.
- Official self-hosting reference pinned to Supabase commit
  `f9e0376951a1fdcc488c335ca2de4e4dc4da12e6`; PostgreSQL ARM64 image pulled in the
  disposable guest at `supabase/postgres@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`.
  No candidate database/service was started from this image. The successful
  recovery instead used the already installed official Supabase Postgres
  `17.11.0.004` ARM64 image `sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706`,
  with zero published ports on an internal network and a 768 MiB container cap.
- Host work checkpointed and its synthetic VM stopped at 08:58 EDT for the
  owner-authorized Website reboot drill. That chat released the hold at 09:13 EDT
  because physical unlock/administrator availability was still pending; **no
  reboot occurred during that first hold**. The later completed reboot is
  documented below.

## October 27 candidate verification

The later coordinated host reboot **did occur**: kernel boot at 10:17:30 EDT,
normal owner FileVault unlock, scanner autostart after a delay (driver PID 1192).
The earlier 09:13 release above describes the first, cancelled attempt. The
Website coordinator explicitly released the final maintenance hold before CRM
candidate work resumed. Both CRM VMs were stopped during that drill. No scanner,
VPN, production, power or login settings were changed by this work.

The new candidate uses published feature source
`8fa9df32c95a2e6d6a72c77422391ae7b9ca7528`, the separate Node-runtime security
overlay from `06580f6c922fa6ab0ebaf229d27b1d30097f1b78`, Next 16.4.3,
React/ReactDOM 19.2.9 and Node 22.23.4. Only this private candidate carries the
standalone-output/same-origin gateway and Node-only instrumentation import.
No unreleased main features were silently included. The checkout is still based
on main `36d90bbeb003643cd24acf4318aa73d676568dbe`, verified equal to remote main.
The 17 pending materials lookup files retained their recorded hashes.

### Compatibility and permission findings

- All 102 source migrations applied successfully in the fresh official stack.
  Versions MD5: `46394436fcbf2f2d7d516b69c84a45af`.
- The 138 original business tables retained the same owners/RLS flags; the 294
  original policies matched under the same deparsing search path. Exclude the
  expressly named `candidate_fence_*` experiment objects from that comparison.
- A fresh image had **427 additional table grants, nine additional function
  grants and six additional sequence grants** compared with the live catalog.
  Candidate-only reconciliation revokes those 442 grants; it adds no new client
  grants and does not weaken RLS. The three public-schema default-privilege rules
  are also reconciled so a later migration does not silently restore broad CRUD,
  function or sequence access. Existing maintenance privileges are preserved to
  match the reviewed source; this is not a new production privilege cleanup.
- Managed `app_private.rls_auto_enable`/`ensure_rls` was absent from the fresh
  image. Its reviewed behavior was restored in the candidate. This Postgres build
  requires its event-trigger function to remain owned by the local platform
  superuser (`supabase_admin`); ordinary business functions retain their original
  owners and the helper has no public/client execution grant. This is a documented
  platform-owner difference, not a grant to application users.
- All 265 original business/helper function definitions and security settings
  match after normalizing only CRLF line endings. `set_updated_at` had that
  line-ending difference; its behavior was unchanged. Normalized source MD5:
  `563dfb25952aaf15d0d4996c7806ab62`.
- Initial setup corrections were limited to candidate assembly: quote optional
  Envoy key matchers so unset values remain valid strings, preserve the historical
  four-digit migration versions, and dynamically import the Node runtime logger
  only in the Node instrumentation path.
- Docker's internal network does not publish the attempted host port. HTTP checks
  therefore ran inside the isolated app container against its real Next/API
  listener. This verifies HTTP behavior, **not public ingress or browser TLS**.
  The same-origin `/backend` route retains the existing browser CSP without
  allowing arbitrary external connections. There is no provider egress.

### Tests and their limits

The candidate passed 2,212 native unit checks before final assembly. The changed
instrumentation path then passed 12 focused runtime/framework tests, typecheck and
standalone build. Nine end-to-end HTTP acceptance groups passed, and all nine
passed again after exact permission reconciliation and installation of the
candidate guard with an explicitly synthetic short-lived rehearsal lease:

1. Anonymous mobile requests denied.
2. Real GoTrue password sign-in with fresh synthetic owner/crew identities.
3. Actual Next Bearer bootstrap returns the correct live roles.
4. SSR cookies open the real CRM page without a login redirect.
5. Concurrent standalone-invoice and manual-payment retries preserve one invoice,
   one payment and zero remaining balance; crew payment access stays denied.
6. Accepted and uncertain synthetic email histories cannot be claimed again.
7. Private bytes remain blocked until a matching synthetic scan-verdict fixture;
   crew, anonymous and public-URL access stay denied.
8. Actual Next file metadata/ranged bytes work; stale versions and invalid ranges
   are refused, with no-store responses.
9. Offboarding blocks retained JWTs; reactivation retains roles and leaves the
   time clock disabled. A disabled owner loses existing-token private-file access.

No actual scanner request, Stripe call or email send occurred. The scan verdict
was an explicitly labeled fixture; this is not new evidence about malware
classification. All five synthetic Auth identities from the failed fixture setup
and successful runs were disabled/banned; history and private fixtures remain.

Nine offline recovery-policy tests and 11 PGlite guard tests pass. Eight native
PostgreSQL experiment groups reproduced cold denial, valid lease admission,
SECURITY DEFINER fencing, deferred rollback, stale capture/restart identity,
TRUNCATE refusal and actual GoTrue/PostgREST service denials. The eighth
intentionally demonstrates a **known limitation**, rather than certifying safety:
a SQL client can request immediate constraint evaluation and commit after the
lease expires. An actual restart of the candidate DB also rejected a still-valid
lease from the prior DB boot (HTTP 503, zero new customer rows).

The SQL prototype is consequently **insufficient for failover**. Its lease facts
are supplied by the local operator, no independently verified offsite capture
is being renewed, file bytes/provider calls have no complete drain barrier, and
open transactions require explicit handling. It is left expired/fenced. It is
not a production migration and has not been applied to either hosted database.

### Next implementation gate

Finish and rehearse the single-writer/drain protocol before routing users. For
initial controlled failover, require positive evidence that the old writer is
stopped/fenced; if that cannot be established, do not promote solely because the
Mac is unreachable or DNS changed. Pair this with the real two-minute coherent
capture/offsite verification loop and its five-minute write cutoff.

Then perform a complete managed-Supabase restore/promotion on a clean authorized
target, including Auth and private file bytes, and measure recovery time. The ATS
organization's new-project quote was $0/month, but no third project was created
and quota/capacity remains unverified. Do not repurpose the unrelated inactive
project or overwrite CRM Staging. Public ingress, provider reconciliation and
canonical client/website/mobile routing remain separate cutover gates.

Private evidence and the source/bootstrap packet are at
`/Users/noelsierra/Documents/Codex/2026-10-27/home-crm-candidate` (0700).
`candidate-verification-report.json`, `http-acceptance-final.json`,
`native-fence-report.json` and `cold-restart-report.json` record the scoped results.
The candidate and benchmark VMs are stopped and retained; the scanner stays live.
No commit, push, deployment, production change, provider/key rotation or new
paid account was performed in this phase.

## References

- [Official Docker self-hosting](https://supabase.com/docs/guides/self-hosting/docker)
- [Platform-to-self-hosted restore](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- [Storage S3 compatibility and limits](https://supabase.com/docs/guides/storage/s3/compatibility)
- [Storage S3 credentials](https://supabase.com/docs/guides/storage/s3/authentication)
- [Managed database backup scope](https://supabase.com/docs/guides/platform/backups)
- [Restic repositories and S3 backends](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)
- [Restic recovery and integrity checks](https://restic.readthedocs.io/en/stable/045_working_with_repos.html)
- [Postgres standby and durability tradeoffs](https://www.postgresql.org/docs/17/warm-standby.html)
