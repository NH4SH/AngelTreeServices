# Verifier overhead and safe repository rotation

Verified October 28, 2026 (America/New_York).

**Result:** verifier overhead is lower, and a new encrypted staging repository
passed full remote readback, protected-root restoration and a native database
recovery. Original repositories remain intact. No routing switch, old-object
deletion, unattended schedule or CRM write admission was activated.

The verified payload phase was pushed atomically to main and
`codex/home-crm-hosting` as `f79f875`, after its 83 tests passed again. The new
overhead/rotation implementation remains local for review and a subsequent push.

## Controlled overhead comparison

These are two fresh Netlify deployments checking the **same ticket, same parent
catalog, same repository and same synthetic row change**:

| Measurement | Previous path | Optimized path |
| --- | ---: | ---: |
| Worker duration | 20.795 s | 16.265 s |
| Storage GETs | 38 | 30 |
| Native indexes decoded separately | 3 | 1 |
| Retained objects physically observed | 14 | 14 |
| New packs fully verified | 2 | 2 |
| Payload downloaded | 83,990 bytes | 83,982 bytes |
| Durable reserved bytes | 285,366 | 264,040 |

That is approximately **22% less worker time**, 21% fewer storage GETs and 7.5%
less reserved transfer. This is a controlled short trial, not a latency percentile
study or proof about a production-sized workload. The earlier bootstrap checkpoint
used 20 reads, decoded both existing indexes once, and completed in 17.573 seconds.

### Integrity is preserved

Previously, every old object received a one-byte probe before metadata and needed
pack ranges were read again. In the optimized mode, those required physical reads
satisfy the same strong-ETag observation. At the end, only untouched objects get
one-byte probes, with bounded parallelism. Every retained object must have a fresh
physical observation before completion. Inventory/version checks still run before
and after work and again in the durable completion transaction.

A signed compact index summary avoids repeatedly starting native Restic to decode
unchanged indexes. It binds the exact index-name set, covered packs and SHA256 sets
of native-decoded blob identities and complete pack locations. Old ciphertext is
still freshly read, hashed and included in native graph checking. New indexes are
decoded natively and checked against the certified locations; offset reinterpretation,
duplicate repacks, superseded indexes, missing indexes and uncovered packs fail.
The first incremental call bootstraps the summary; a cold subsequent worker can
reuse it without trusting process memory or producer-supplied plaintext.

The original 24-hour full-read expiry, new-pack byte coverage, archive-only claims,
pre-I/O reservations, no-refund accounting and five-minute writer fencing remain
unchanged. The new mode is explicitly selected with `ATS_LAB_COMPACT_READS=1` on
the isolated test service. The default path remains available.

Final isolated verifier draft: `6ae1f72d51e2ea7575457233`, existing test site
`097f9348-2fae-42f0-99aa-bb211cbb3cc5`. No CRM app deploy was published.

## Rotation implementation and actual staging result

Rotation creates a **new native Restic repository** with copied chunker parameters,
then uses native `restic copy`. It preserves source snapshot paths, timestamps,
tree identities, file permissions/owners and complete artifact bytes. The fresh
repository has its own native encryption identity; production credentials and
all existing recovery keys remain unchanged.

The plan retains the last two verified snapshots, daily recovery points for the
existing seven-day window, every unverified snapshot, and explicit pins. An unknown
pin or incomplete source snapshot inventory stops the plan. Unknown roots are
retained and fully checked rather than treated as disposable history.

Actual synthetic target: CRM Staging `gbyhdsuiqeslgjdnbqng`.

| Item | Result |
| --- | --- |
| Source bucket | `crm-cloud-lab-8c7339da40ce` |
| New private bucket | `crm-cloud-rotation-5a832323f009` |
| Source objects | 18, preserved |
| Replacement objects | 11 |
| Protected snapshots | 2, both restored and authenticated |
| New encrypted bytes uploaded/read back | 36,984,913 / 36,984,913 |
| Source objects removed | 0 |
| Routing changed | No |

Every destination object was freshly downloaded and SHA256 checked against the
new local encrypted repository. Native Restic then performed a full data check and
verified restoration of both retained snapshots. All paired database/private-file,
Auth, payment/delivery, configuration and source artifacts matched the source
certificates, including modes, owners and ordered content fingerprints.

The latest restored database was imported into a separate internal DB-only
container. It matched **177 table fingerprints and 266 effective function
definitions/owners/grants**, plus table ACL/RLS metadata. Its four synthetic private
objects remained covered by the checked archive inventory. The target remained
closed to CRM logins/writes and was stopped. This phase did not perform a further
managed-Supabase database import or open a recovery writer.

A signed `archive-rotation` result binds the plan, original and replacement native
repository identities, source/destination provider inventories, every protected
snapshot mapping and the restored artifact digests. These records cannot authorize
CRM writes. Source and destination metadata are rechecked; changed inventories,
foreign signers, missing mappings and stale proofs are rejected.

### Retirement remains held

Copying and verification are implemented; deletion and production routing are not.
The retirement preview requires a 24-hour grace period, a fresh full verification,
reviewed retirement approval and positive uploader fencing. It always reports
`objectDeletionAllowed=false`; no delete API or `forget`/`prune` command is installed.
The real staging result was held behind those gates. All prior cloud generations,
their keys, snapshots and delivery/payment history remain preserved.

The native fault drill retained an additional unverified root, restored from the
replacement after making its disposable source copy unavailable, and detected
deliberate corruption of replacement ciphertext. Only new temporary test copies
were modified/removed by that drill; original fixtures and cloud objects were kept.

## Quotas and the engineering decision

**Both generations used the same existing namespace budget.** Creating the new
bucket did not reset counters. Before network reads, the rotation job reserved
37,521,489 bytes including full destination readback and conservative metadata/
request allowances. The completed job and signed result were recorded in the
existing staging ledger. No cap was raised, no failed charge refunded, and no
additional database schema, grant or maintenance migration was installed.

The steady-state free-budget gate still fails. At 720 captures/day and one full
baseline/day, the measured optimized reservation projects approximately **7.05 GB
per 31-day month**, before maintenance rotations, retries, growing indexes and
other ATS traffic. Reservations are conservative safety accounting, not provider
billing meters. The guards remain 96 MiB/day and 512 MiB/month.

Repeated physical copying is also too expensive as the steady-state solution.
The measured 11-object replacement plus four new objects/capture reaches the
96-object guard after about 21 captures (42 minutes). Sustaining that pattern
would require about 35 full-copy verifications/day: roughly 40 GB/month of rotation
payload alone. The verified copy-and-restore workflow is useful maintenance and
recovery preparation; it must not be scheduled at that frequency under a free plan.

**Next step in the existing roadmap:** prototype bounded logical generations over
shared immutable encrypted objects, with explicit reference/pin accounting and
the original full-scrub expiry preserved. Review the complete integrity/admission
contract before connecting any incremental evidence to the candidate writer gate.
Do not reset full-read age during metadata-only rotation or increase quotas to
make a test appear to pass. Production remains on Netlify/Supabase.

## Verification and preservation

All **92 tests passed with no skips**, including both real native rehearsal
fixtures, compact-index tampering/repacking cases, physical observation coverage,
retained/pinned/unknown roots, provider-version changes, corruption, expiry,
quota-before-I/O and existing recovery/fencing guarantees. The explicit rehearsal
driver refuses to load private state without its opt-in switch. No new package
dependency or CRM application build was needed for these operations-only changes.

Staging reconciliation passed with the original 129 application entries and three
existing lab maintenance entries, unchanged business policies/Auth guard and closed
lab client access. Production deploy `6adab6d33b9c3096a37ad0a1` and CRM Staging app
deploy `6adb68aaafaed79557bf7051` remain published. Production data, RLS, credentials,
financial behavior, customer messages, DNS/router/VPN settings and scanner setup
were not changed.

Scanner driver PID 1192, configuration SHA256
`804d0864c4e16c8b653e9f837ea923038f28d901a6bbd6353886a1fecb60a709`
and container IDs remain unchanged; both ATS bridges are healthy. The candidate,
benchmark and recovery containers/VMs were left stopped. All 17 unrelated pending
materials/operational lookup files retain their original hashes.

Implementation is under `scripts/home-hosting/`: `index-evidence.mjs`, the opt-in
verifier changes, `rotation-policy.mjs`, `native-rotation.mjs`, the explicit
`rehearse-rotation.mjs` driver, packaging and tests. The driver is pinned to the
existing synthetic run format, staging project and local tools. It is not a
production installer and does not change uploader/read routing.

Private evidence is retained at
`/Users/noelsierra/Documents/Codex/2026-10-28/home-crm-rotation/8c7339da40ce`, including
the same-checkpoint comparison, source certificates, rotation plan/proof, target
inventories, SQL recovery and capacity calculation. Keys and raw logs remain
outside Git. The native fixture drill also used the earlier retained payload run.

References: [native repository copying](https://restic.readthedocs.io/en/stable/045_working_with_repos.html),
[native retention/pruning considerations](https://restic.readthedocs.io/en/stable/060_forget.html),
[previous payload results](HOME_CRM_BACKUP_PAYLOAD.md),
[existing migration roadmap](HOME_CRM_MIGRATION.md).
