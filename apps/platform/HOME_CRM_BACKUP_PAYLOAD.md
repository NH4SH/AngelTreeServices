# Backup payload reduction and capacity decision

Verified October 28, 2026 (America/New_York).

**Decision:** keep the payload improvements as a locally verified, opt-in archive
prototype. Do not activate unattended backups or move production. The payload is
substantially smaller, but the complete verification path still fails the current
transfer budgets. No quota, full-scrub interval or five-minute write fence was relaxed.

The previous incremental-verification work was pushed atomically to main and
`codex/home-crm-hosting` as `feba3e4`, after all 80 existing tests passed. The new
payload changes described here remain local, ready for review and a later push.

## What changed

Two sources of artificial churn were measured on the existing synthetic,
production-feature candidate (102 migrations):

- Each native PostgreSQL custom archive includes a fresh creation timestamp.
  An unchanged database therefore generated new Restic data. Turning off dump
  compression alone was insufficient: the preliminary changed-row trial still
  added about 370 KB.
- The recovery manifest query created a temporary table. PostgreSQL's temporary
  namespaces shifted internal dump IDs, spreading small differences across the
  archive even when the captured business rows were unchanged. A comparison
  observed 12,256 changed bytes spread across every one of 39 pieces.

The manifest query now holds its intermediate JSON in connection-local memory,
without creating temporary catalog objects. It retains the original row counts,
digests, ACL/RLS fingerprints and function metadata. No persistent database
function, schema, role or application policy was changed.

The explicitly selected `ATS_BACKUP_PAYLOAD=parts-v1` rehearsal layout uses native
`pg_dump --format=custom --compress=none`, then stores its **unaltered bytes** as
ordered 64 KiB files under `database.parts/`. Each piece has an authenticated
name, position, length and SHA256. The manifest binds that list and the original
whole-archive SHA256. The complete dump remains on the source for diagnosis but
is excluded from that Restic snapshot to avoid storing it twice.

Recovery concatenates the pieces and checks the exact original whole-archive hash
before `pg_restore`. No PostgreSQL headers/timestamps were rewritten, no records,
permissions, source assets or secrets were omitted, and no custom encryption was
introduced. Native Restic still encrypts/authenticates the backup. Legacy captures
and the default capture layout remain supported.

The incremental worker verifies new pieces against the ordered manifest and
reuses only previously certified exact piece fingerprints. It reports
`ordered-part-sha256`; it does not claim to freshly rehash an assembled database
on every incremental call. Full verification reconstructs and hashes the entire
archive. Both incremental layouts remain archive-only, with no CRM write permit.

Changed files are restored together in one native Restic invocation. This avoids
repeating native key derivation once per small piece. The read-only adapter,
complete new-pack coverage, source/version bindings, 24-hour full-read expiry,
quota reservations and durable retry rules are unchanged.

## Measured cloud results

| Capture | New encrypted bytes uploaded | Verifier payload downloaded | Worker seconds |
| --- | ---: | ---: | ---: |
| Stable, unchanged business records (4) | 40,321 | 65,086 | 22.250 |
| One synthetic row added, fresh deployment (5) | 68,775 | 99,453 | 24.943 |

The previous incremental path downloaded 402,685–406,704 bytes per checkpoint.
The new samples reduce that by approximately 84% and 76%, respectively. The
second sample includes a real synthetic row change; it is not just an idle dump.
It is still a small workload, not a monthly production-volume test.

The stable full baseline read 37,945,094 bytes in 17.022 seconds. That repository
also retains earlier attempts; nothing was pruned or hidden to improve the result.

Test target: existing `ats-recovery-verifier-lab`
(`097f9348-2fae-42f0-99aa-bb211cbb3cc5`), final isolated draft
`6ae17d8ba08a379e1183ee0a`. Supabase: CRM Staging
`gbyhdsuiqeslgjdnbqng`, new private synthetic bucket
`crm-cloud-lab-c2d7a2976001`. No CRM app deploy was published.

## Recovery and failure evidence

- All **83 tests passed, no skips**, including the real native piece-layout chain,
  full-restore agreement, corruption/missing/link/reordering rejection, unchanged
  namespace catalog, mid-job expiry, replaced objects, quota-before-I/O and existing
  fencing tests. The legacy native chain was also checked separately.
- Every encrypted file in the local recovery copy matched the independent cloud
  catalog. Native Restic completed a full data check and verified restore. All
  artifact hashes and the private-file inventory matched the incremental result.
- The 39 pieces reconstructed the exact PostgreSQL archive. A separate, internal,
  DB-only recovery container matched **177 table fingerprints and 266 effective
  function definitions/owners/grants**, along with table permissions and RLS.
  It remained closed to CRM logins/writes and was stopped afterward. Four private
  synthetic source objects remained bound by their verified archive inventory.
- This phase did not perform another import into a managed Supabase recovery
  project. The restored bytes retain the native PostgreSQL format used in the
  earlier managed recovery rehearsal; no new managed-import result is claimed.
- An exact retry returned the original signed result without extending its expiry.
  A bad catalog signature and a same-byte config object with a new provider version
  were rejected. No sends, payments or business actions occur in these checks.

The first piece-layout cloud attempt failed before completion while materializing
too many changed pieces. Its reservation remains charged. An earlier cold call
returned an HTTP gateway error, but the durable ledger later showed that its
archive job **had completed** in 29.792 seconds. This was a lost response, not
proof that work had stopped. The subsequent batched worker completed the same
captured data in 24.943 seconds as a separate measured run. Clients must preserve
the original request ID/body after an uncertain response and retrieve that result.
Neither job could authorize writes or send a customer message.

All failed/incomplete attempts, successful jobs and replies remain accounted for:
the namespace reserved **77,263,782 bytes**. No cap was raised or failure refunded.

## Does it fit the free limits?

**Not yet under the existing safety budgets.** At a two-minute cadence, 31 days,
and one mandatory full read per day, the short samples project:

| Sample | Payload only / month | Conservative reservations / month |
| --- | ---: | ---: |
| Unchanged records | 2.63 GB | 8.28 GB |
| Small row change each capture | 3.40 GB | 10.31 GB |

Successful jobs reserved 317,949 and 408,797 bytes respectively. Reservations
include inventories, signed results and conservative per-request overhead; they
are not provider billing meters. The current guards remain **96 MiB/day and
512 MiB/month**. Even the 36,598,680-byte source archive alone, read once daily,
uses about 1.13 GB in 31 days, above that monthly guard before any changing data.

Supabase's documented Free uncached-egress quota is **5 GB shared across services**,
which is different from our 512 MiB test guard. Payload-only projections sit below
5 GB, but they exclude growing indexes, headers, retries, pack collisions, safe
rotation, restore drills and the rest of ATS's account traffic. The conservative
reservations exceed 5 GB. Neither figure establishes account-wide free operation.
Netlify verification compute also needs to be included in an activation budget.
See [Supabase's egress rules](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

The prototype adds four immutable repository objects per checkpoint. Its existing
96-object bound cannot support 720 captures/day without a reviewed rotation plan;
all base objects remain pinned by the catalog. No automatic deletion or silent
rotation was added to conceal that limit. These are lower-bound projections,
not a tested month of steady-state retention.

**Next engineering step:** reduce and measure verifier metadata/compute overhead,
then rehearse bounded generation rotation and its complete full-scrub/restore cost.
Use the original recovery roadmap and keep one writer and the five-minute fence.
Do not treat a quota increase, skipped scrub, changed expiry or source-only receipt
as a payload optimization. Re-evaluate actual shared free capacity before activation.

## Preservation and evidence

Production remains Netlify/Supabase; no cutover, deployment, DNS/router/VPN change,
production SQL, provider activation, secret rotation or application feature change
was performed. Production deploy `6adab6d33b9c3096a37ad0a1` and CRM Staging app
deploy `6adb68aaafaed79557bf7051` remain the expected published releases.

Staging's read-only reconciliation passed: the original 129 application entries
and three existing lab maintenance entries are preserved, with closed lab client
permissions. No additional migration or maintenance SQL was installed this phase.

Scanner VM driver PID 1192, configuration SHA256
`804d0864c4e16c8b653e9f837ea923038f28d901a6bbd6353886a1fecb60a709`
and container IDs are unchanged; both ATS bridges are healthy. The benchmark and
candidate VMs, including the new recovery target, were left stopped. All 17
unrelated pending operational/material lookup files are preserved separately.

Implementation: `scripts/home-hosting/database-parts.mjs` and tests; the metadata
query and regression test; opt-in capture layout; full/incremental verifier and
recovery compatibility; batching and isolated packaging/tool-copy updates.
No new package dependency or CRM application build was needed.

Private captures, catalog certificates, failed attempts, native SQL recovery and
capacity projection are retained outside Git at
`/Users/noelsierra/Documents/Codex/2026-10-28/home-crm-payload/c2d7a2976001`.
Credentials and raw logs must remain private.

References: [native PostgreSQL archive/compression options](https://www.postgresql.org/docs/17/app-pgdump.html),
[native selective Restic restore](https://restic.readthedocs.io/en/stable/050_restore.html),
[prior incremental verification](HOME_CRM_INCREMENTAL_VERIFICATION.md),
[existing migration roadmap](HOME_CRM_MIGRATION.md).
