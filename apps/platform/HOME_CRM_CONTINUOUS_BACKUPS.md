# Continuous backup and write-blocking rehearsal

October 27, 2026. **Production remains on its existing hosting.** The verified
recovery work was pushed to main and `codex/home-crm-hosting` as `30e6347`, with
`[skip ci] [skip netlify]`. The new continuous-backup work described here is local.

## Result

The isolated 102-migration CRM completed three consecutive paired captures at
approximately two-minute intervals, with live synthetic writes between them.
After an injected offsite transport failure, suspending both the JavaScript
watchdog and rootless Docker daemon did not prevent the independent deadline
from stopping the database. The measured last-capture-to-completed-fence window
was **278,440 ms (4 minutes 38.440 seconds)**, within the selected five-minute
lost-work limit for this experiment.

The deliberately long transaction evaluated deferred constraints early, inserted
a row and then slept. Its row was rolled back by the deadline fence. A subsequent
cold database restart refused another application-role write. This specifically
tests the deferred-trigger loophole found in the earlier rehearsal.

The last offsite-verified capture was then restored into a new internal DB-only
clone. All **177 table fingerprints**, RLS/table permissions and **266 effective
function definitions/owners/grants** matched. All **four private file digests**
were independently recovered from the encrypted archive. The recovered DB had
no nonoperator login roles, its cold guard was closed, and it was stopped after
verification. This run did not repeat the earlier managed database import or
launch another restored Next/Auth/Storage server; those earlier checks are in
[HOME_CRM_FAILOVER_VERIFICATION.md](HOME_CRM_FAILOVER_VERIFICATION.md).

## Measured cadence

One earlier bootstrap capture also passed. The three consecutive operational
samples below followed the corrected readiness check and were not compressed
time simulations. Times are UTC; this was approximately 6:13–6:22 p.m. EDT.

| Sequence | Capture start | Interval from previous operational capture | Capture pause | Offsite verification age | Private files |
| --- | --- | --- | --- | --- | --- |
| 3 | 2026-10-27 22:13:16.791 | Initial operational baseline | 1.260 s | 28.466 s | 3 |
| 4 | 2026-10-27 22:15:17.303 | 120.512 s | 1.250 s | 24.711 s | 4 |
| 5 | 2026-10-27 22:17:17.825 | 120.522 s | 1.300 s | 27.074 s | 4 |

The synthetic owner, invoice, manual payment, accepted/uncertain delivery outcomes
and fourth private document were created after the operational baseline. The
file's clean verdict was explicitly a synthetic fixture; the live scanner was
not invoked by these tests. A separate application-role workload committed 218
test rows in the source. The restored checkpoint contained its first 98 rows;
the later 120 test rows demonstrate the permitted lost-work window rather than
zero-loss recovery. Original synthetic source rows and all archives were retained
for comparison. No real customer work was moved or discarded.

## Control design exercised

- A short capture barrier disables API logins, pauses the app/Auth/REST/Storage
  processes and drains nonoperator DB sessions. Database/Auth/business history,
  private bytes, configuration and matched release sources are captured together.
  The barrier is released after the local paired capture; upload/verification
  continues while the prior verified deadline is still valid. An incomplete
  capture remains closed instead of reopening logins blindly.
- Capture and lease renewal share a transaction advisory lock and a persistent
  capture flag. The watchdog cannot race the backup worker and reopen API logins
  during the capture barrier. Successful capture pauses here were roughly one
  second; this is an observed small synthetic dataset, not a large-data promise.
- Restic encrypts the complete capture. The development relay uploads immutable
  ciphertext to private CRM Staging Storage, reads it back, performs a full
  Restic integrity check and restore, then compares the manifest, dump, release
  archive and individual private-file hashes. Anonymous/public access is denied.
- Only that independent verification can issue a signed receipt. Its signing
  private key stays on the development Mac. Receipts bind the run, generation,
  source/DB boot, schema topology, sequence, snapshot and manifest. Deadline
  freshness derives from **capture start**, not upload time. Local-only backups,
  partial uploads, changed sources, old sequences and expired receipts cannot
  extend it.
- Before admitting writes, an independent systemd deadline timer is armed. The
  watchdog renews short SQL leases only while the signed proof and timer remain
  valid. A failed verification leaves the previous deadline unchanged.
- The emergency timer uses the kernel's delegated `cgroup.kill` interface to stop
  the exact candidate DB cgroup first, then the other six candidate services. It
  does not require Docker's API. The helper can target only the pinned container
  IDs in this VM and latches the run closed. It cannot reopen the same run merely
  because connectivity returns. See [kernel cgroup documentation](https://www.kernel.org/doc/html/v6.8/admin-guide/cgroup-v2.html)
  and [systemd timer semantics](https://www.freedesktop.org/software/systemd/man/255/systemd.timer.html).

This is a bounded synthetic implementation, not a production scheduler,
public ingress, automatic failover system or permission to create a second
writable primary. Existing business authorization/RLS and financial/email
commands were reused; no application feature changes were made.

## Faults and verification

| Check | Evidence |
| --- | --- |
| Failed offsite upload | Sequence 6 completed locally, but an injected Storage transport failure issued no receipt; sequence 5 remained the last verified recovery point |
| Stalled JavaScript watchdog | Process deliberately suspended late in the loss window; independent timer remained armed |
| Unresponsive Docker daemon | `dockerd` deliberately suspended in the candidate VM; kernel fence still completed |
| In-flight early-constraint transaction | Real PostgreSQL transaction was admitted and sleeping before suspension; its inserted row did not survive |
| Cold database restart | Application-role insert refused after restart; the old lease did not reopen writes |
| Restore from actual offsite bytes | New isolated clone matched 177 captured tables and 266 effective functions; recovered workload checkpoint and four private files verified |
| Offline regression coverage | 32 policy/data-conversion/permission tests plus 11 existing PGlite guard tests passed: 43 total |
| Syntax | All 30 home-hosting JavaScript modules passed `node --check` |

Two setup errors were fixed without replaying business actions: the first
VM-to-host directory copy lacked recursive mode, and the readiness probe omitted
the gateway's required anonymous API-key header. Failed artifacts/logs were kept;
the operational cadence used new actual captures after those fixes. Repeated
rehearsals allocate the next unused synthetic workload range instead of resetting
or deleting existing fixture rows.

Application lint/typecheck/build were not repeated because application source,
dependencies and runtime images were unchanged. The verification exercised real
Linux PostgreSQL, containers and staging Storage in addition to offline tests.

## Preservation and final containment

- Production Netlify deploy remained `6adab6d33b9c3096a37ad0a1`; no production
  configuration, credentials, keys, migrations, routing, scheduled work or data
  were changed. No customer email or real payment was sent.
- CRM Staging retained 129 migrations, migration fingerprint
  `166e4aac5f22e788561f6acd61478441`, 49 Auth users, disabled automatic sending and
  its original Auth email guard fingerprint `c601aeb6c6c0ad4da79265034f84c1a6`.
  Only the new private synthetic archive bucket was added. The separate earlier
  recovery project stayed paused.
- Bucket `crm-continuous-8226bf4505f3` retains 26 ciphertext objects totaling
  **38,398,097 bytes**. Successful verification downloaded **151,229,403 bytes**
  across the bootstrap and operational captures. No paid service was provisioned.
- The source test account was retired. All candidate/clone containers and the
  rehearsal units were stopped; both CRM VMs were left stopped. Snapshots, volumes,
  audit history, failed attempts and private recovery credentials were preserved.
- The scanner stayed in its separate VM, with both bridges healthy and no
  restart/configuration change. Scanner driver PID remained 1192 and the Lima
  configuration SHA-256 remained
  `804d0864c4e16c8b653e9f837ea923038f28d901a6bbd6353886a1fecb60a709`.
  The scanner was running, but this was not a deliberate concurrent scan/load or
  definition-reload stress test.
- All 17 pending operational lookup files retained their recorded hashes. The
  hosting branch and remote main matched at `30e6347` after the authorized push.

## Files and reproduction

The local implementation is under `scripts/home-hosting/`:

- `continuous-policy.mjs` and its tests validate signed proof/freshness/clock rules.
- `continuous-candidate.mjs` implements the scoped capture, independent admission,
  watchdog, timer fence and synthetic failure commands.
- `continuous-offsite.mjs` performs encrypted staging upload/readback/restore and
  issues verification receipts.
- `rehearse-continuous.mjs` is the deliberately pinned, bounded development-Mac
  cadence/fault driver. It requires `ATS_CONTINUOUS_DRIVER=1`, the existing private
  SSH/key files, running candidate VM, installed project dependencies and a cold,
  fenced synthetic dataset. It is not a generic or production installer.
- `restore-continuous-capture.mjs` restores only a new internal DB-only target and
  compares its data and effective permissions.

The full operational evidence is private:
`/Users/noelsierra/Documents/Codex/2026-10-27/home-crm-continuous/8226bf4505f3`.
Never commit its signing key, service keys, environment files, plaintext restored
captures or raw logs. The runner intentionally retains failures and has explicit
run/byte limits; do not turn the test flags or credentials into production ones.

## Next production-readiness step

**Keep production where it is for now.** The next priority is an independent,
unattended verifier/lease authority using the existing Netlify/Supabase accounts,
with a measured incremental-verification and retention budget. This rehearsal's
development-Mac signer/relay must not become a requirement for daily operations.
Full 37–38 MB repository readback every two minutes would transfer roughly 27 GB
per day; this bounded test must not be enabled indefinitely under a free-budget
assumption. Review and test an integrity-preserving incremental protocol before
activation rather than silently weakening proof requirements to save traffic.

Then soak-test concurrent scans/definition updates, higher data volume, hardware
sleep/power recovery, clock/suspend behavior, monitoring and all external writers.
The running-VM timer test does not prove hard real-time behavior during host/VM
suspend, kernel stalls or a compromised operator. Complete cloud standby fencing,
matched runtime/public ingress, mobile/website/webhook cutover and provider
uncertainty reconciliation before promoting either side. Five minutes remains a
lost-work objective, not a five-minute recovery-time promise.
