# Home CRM cloud verification and transfer controls

Verified October 27, 2026 EDT (evidence timestamps October 28 UTC).

**Decision: keep production on its existing Netlify/Supabase hosting.** Independent
cloud verification now works in an isolated Netlify draft deployment. Transfer
limits and retention previews pass. The measured transfer volume does not fit the
candidate's conservative free-budget limits at a two-minute cadence. Automatic
activation and a CRM cutover remain blocked by that capacity problem and the
previously documented hardware/failover gates.

## Git and isolation

The previously verified continuous-backup work was committed and pushed atomically
to main and codex/home-crm-hosting as
`92c2b5a2cb996aca3752cc29fd3b8819de7e264a`, with CI/deploy skip markers. Origin/main
and the branch matched that commit at verification. The owner subsequently
authorized this verified cloud phase to be committed and pushed with deployment
skipped, before starting incremental verification.

- New test site: `ats-recovery-verifier-lab`, site
  `097f9348-2fae-42f0-99aa-bb211cbb3cc5`, existing ATS free account. No paid settings or new provider account.
- Final draft deployment: `6ae1641fc6652bd4b6608353`, [isolated endpoint](https://6ae1641fc6652bd4b6608353--ats-recovery-verifier-lab.netlify.app).
  Its static page contains no CRM. The worker requires a private test token.
- Supabase: CRM Staging `gbyhdsuiqeslgjdnbqng`; final synthetic namespace
  `ats-rehearsal-continuous-fe7d6fb1b819`, private bucket `crm-cloud-lab-fe7d6fb1b819`.
- Production app remains deploy `6adab6d33b9c3096a37ad0a1`; CRM Staging app
  remains `6adb68aaafaed79557bf7051`. Neither was deployed by this phase.
- Scanner VM remains running with driver PID 1192 and its original configuration
  SHA256 `804d0864c4e16c8b653e9f837ea923038f28d901a6bbd6353886a1fecb60a709`.
  Both ATS bridges are healthy with uninterrupted 13-hour uptimes. The benchmark
  and CRM candidate VMs are stopped. No source API, sender or scheduler was started.
- All 17 separately pending materials/operational lookup files still match their
  preserved hashes. No CRM feature, customer record, production secret, router,
  DNS, VPN, scanner or production configuration was changed.

## What the cloud worker proves

The worker independently downloads encrypted Restic objects from private staging
Storage, checks fresh object IDs/versions before and after verification, runs
native Restic `check --read-data`, restores the selected snapshot with
`--verify`, then verifies the paired manifest and database/private-file/source
archive digests. Auth, invoice/payment and email request/attempt/history tables
must be present in that manifest. The four synthetic private files are streamed
through a pinned tar parser and checked against their size and SHA256 inventory;
paths are never extracted. Links, special files, traversal, duplicates, missing
files, wrong digests and oversized corpora are rejected.

Native binary execution was probed without credentials first: actual cloud Node
`24.21.0`, Linux x64, Restic `0.19.1`. The Linux AMD64 binary SHA256 is
`20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639`;
the downloaded official compressed asset matched the official SHA256SUMS.
Restic stays outside Git and is included only in the isolated function artifact.
The tar dependency is `tar-stream@3.2.2`, pinned in this tooling directory's own
package/lock files; installation scripts were disabled and npm audit found zero
vulnerabilities. The CRM package manifests and lockfiles were not changed.

This cloud test restores and checks the backup files. The earlier native and
managed PostgreSQL restoration, 177-table and 266-function comparisons remain in
[HOME_CRM_FAILOVER_VERIFICATION.md](HOME_CRM_FAILOVER_VERIFICATION.md) and
[HOME_CRM_CONTINUOUS_BACKUPS.md](HOME_CRM_CONTINUOUS_BACKUPS.md). This phase does not
claim another managed PostgreSQL import or a production promotion.

## Measured cloud verification

All byte counts below are measured object payload bytes. Reservations also
include a conservative 262,144-byte metadata allowance for every new job.

| Check | Repository bytes | Downloaded bytes | Reused verified bytes | Seconds | Write-admission receipt |
| --- | ---: | ---: | ---: | ---: | --- |
| Fresh admission proof | 36,907,263 | 36,907,263 | 0 | 13.015 | Yes; original deadline |
| Warm archive audit | 36,907,263 | 0 | 36,907,263 | 9.585 | No |
| Checkpoint 2 archive audit | 37,301,293 | 394,030 | 36,907,263 | 10.086 | No |
| Checkpoint 3 archive audit | 37,695,266 | 393,973 | 37,301,293 | 10.154 | No |
| Same bytes, new object version | 37,695,266 | 155 | 37,695,111 | 9.739 | No |
| Forced full audit | 37,695,266 | 37,695,266 | 0 | 11.029 | No |

The first fresh receipt was verified against the existing continuous admission
policy. Its expiry remains capture-start plus 280 seconds. The home candidate
never admitted it or started writers; this tested the independent authority only.
An exact request retry returned the identical signed envelope and original
deadline. The client rejected it at a simulated time beyond that deadline.

Archive audits can reuse an instance's encrypted cache only when its local SHA256
still matches independently verified bytes and current Storage ID/version/size
match. Restic still reads the whole assembled repository and restores it each
run. Cache-based archive receipts have a different kind and
`remoteBytesReadBack=false`; they cannot admit writes. Continuous admission
always forces a fresh full remote read. A forced archive scrub does the same.
No cache or sampled check is silently promoted into an admission proof.

Cold instances have no trusted cache. The final new draft deployment tried the
same archive with an empty cache and was refused at the transfer reservation,
before downloading it. The budget survived the redeploy. A same-size replacement
of encrypted config with identical bytes but a new version triggered another
155-byte readback. Public bucket access and anonymous RPC access were denied.

## Transfer and resource controls

| Bound | Candidate setting |
| --- | ---: |
| Repository payload | 128 MiB |
| Individual encrypted object | 32 MiB |
| Objects per repository | 256 |
| Restored scratch payload | 192 MiB |
| Private files | 512 |
| Reserved read/metadata bytes per UTC day | 96 MiB |
| Reserved read/metadata bytes per UTC month | 512 MiB |
| Metadata reservation per new request | 256 KiB |
| Database job lease | 90 seconds |
| Worker operation deadline | 50 seconds, within the function deadline |

A private PostgreSQL ledger serializes each bound namespace. Metadata is reserved
before inventory I/O; additional bytes are reserved before downloads. Daily and
monthly counters change in one transaction. Failures, timeouts and lost responses
are not refunded. Overlapping jobs, changed request bodies, stale workers,
changed object inventories and old admission sequences cannot complete a new
receipt. Replays return the original claims rather than a new time window.

The successful test namespace reserved
`77,487,839` bytes,
including denied attempts. Another full read would exceed its daily cap and was
withheld; the failed jobs retain only their metadata reservations and no claims.

These caps govern this bound verifier namespace, not every service in the ATS
accounts. Operator-created namespaces have separate counters. Provider overhead,
other CRM traffic, uploads outside the bounded rehearsal uploader and aggregate
account billing are not metered by this ledger. The test uploader used append-only
uploads and the source's bounded repository; no unattended uploader holding broad
Storage credentials has been installed. Production upload admission and a shared
account/generation budget remain required before activation. No account-wide
free-usage guarantee is made.

At the latest repository size, full readback every two minutes would transfer
about 27.14 GB per day before metadata. Even the optimistic
warm archive model, using the observed incremental payload, one cold read daily
and the conservative metadata reservation, projects
510.1 MB/day or
15.81 GB over 31 days. Both exceed these
limits. The hard stop is intentional: exhaustion must close the tested write
admission path rather than extend the five-minute loss window.

## Retention controls

The preview protects the newest two independently verified checkpoints, explicit
pins, recent daily representatives, and every unverified root for investigation.
For the three verified synthetic checkpoints it protected two and identified one
older retirement candidate. Native Restic `forget --dry-run` confirmed the preview;
all local repository object digests remained identical afterward. **Zero cloud
objects or backup snapshots were deleted.** Prior rehearsal archives remain.

There is no cloud delete/prune path in the worker. Restic packs can be shared
between snapshots, so object age cannot determine safe deletion. Before any
retirement: copy retained roots into a new repository generation, fully verify
that replacement, review a grace period and explicitly approve retirement. The
storage cap can withhold receipts; it never frees capacity by deleting the newest
recovery point. Actual rotation and deletion remain inactive.

## Netlify integration findings

The free account rejected saved functions-only variable scopes with HTTP 403.
No upgrade or broader saved-secret scope was used. The final isolated artifact
uses Netlify CLI's function-only `--secret-env` deploy overlays, with new synthetic
Restic/signing/request secrets and the existing staging-only service key. Values
were read privately from mode-0600 files, never embedded in code/static output,
printed, or committed. No production recovery password or signing key was used.

Identical worker code deployed with changed overlays did not reliably authenticate
the new test binding during preflight. Each packaged artifact now has distinct
executable provenance and a hard namespace check. Actual authenticated requests
are tested after deployment. Node's function environment is used for those
per-deploy overlays. This is a candidate-specific integration finding, not a claim
about the cause of an unrelated production issue. A production service lifecycle
and credential-scope review is still needed. Temporary public diagnostics were
removed from the final draft. Errors expose only a safe phase, not raw provider,
Restic, database, manifest or credential output.

## Staging reconciliation

The original 129 application migration versions remain unchanged:
`166e4aac5f22e788561f6acd61478441`, latest `20261026212535`.
The Supabase migration ledger additionally records two staging-only infrastructure
operations: `20261028022311_recovery_verifier_lab_controls` and
`20261028022719_recovery_verifier_lab_bounded_metadata`. Total ledger entries:
131. These are not application release migrations and must not be copied into the
production migration stream or hidden by repairing/deleting ledger history.

`cloud-stage-profile.json` pins both maintenance statement hashes, the complete
application ledger fingerprint, the installed control function and its access
boundaries. `verify-cloud-stage.mjs` re-queried staging and passed. Historical
application candidate verifiers keep their strict original expectations; use this
profile to account for the lab state explicitly. The 49 Auth users, 303 business
policies and Auth email guard fingerprint are unchanged. Four new private ledger
tables have RLS and no direct app-client grants. The only public wrapper is owned
by postgres, has a fixed search path, and is executable only by service_role.
Anonymous RPC was actually denied with HTTP 401. Security
advisors identified the four new deny-all RLS tables as informational no-policy
entries; the wrapper did not introduce an authenticated-executable definer warning.

## Verification and files

64 local tests cover the existing recovery/fencing guarantees, atomic quotas,
leases, retry identity, version invalidation, unsafe archives, retention, target
binding and unexpected staging changes. Additional checks: npm clean install with
scripts disabled, zero audit findings, syntax checks, standalone Netlify function
bundling, real cloud/Supabase acceptance, private-file restore, native retention
dry-run, cold redeploy budget denial and preservation checks. No CRM build was
needed because application source/dependencies were not changed.

Implementation is under `scripts/home-hosting/`: cloud policy/ledger/verifier,
streaming archive verification, isolated Netlify handler/packager, read-only
retention preview, exact staging profile/snapshot/verifier, and their tests.
Existing continuous/fencing code is preserved. Private evidence, encrypted and
restored synthetic artifacts, keys and raw logs are retained outside Git at
`/Users/noelsierra/Documents/Codex/2026-10-27/home-crm-cloud-verifier/fe7d6fb1b819`. Earlier rejected preflights and their private evidence are retained
as well; their partial work was never accepted as a write receipt.

## Next step

Prepare and verify an incremental backup/admission protocol whose new checkpoint
proof does not reread the full base repository every two minutes. It must retain
the same complete database/private-file recovery coverage, source/boot binding,
immutable-object integrity, retry safety and hard deadline. Measure producer
upload volume, verifier bytes, cold-start/scrub allowances, shared account budgets
and safe generation rotation before installing an unattended schedule. Then
continue the existing power/suspend, monitoring, ingress, external-writer and
manual-failover gates. Five minutes remains a lost-work limit, not a recovery-time
promise. Production stays on its current hosting until those gates pass.

References: [Netlify Functions](https://docs.netlify.com/build/functions/overview/),
[Restic retention and dry runs](https://restic.readthedocs.io/en/stable/060_forget.html),
[tar-stream's streaming interface](https://github.com/mafintosh/tar-stream).
