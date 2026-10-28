# Incremental backup verification

Verified overnight October 27–28, 2026 (America/New_York).

**Result:** independent incremental archive verification works locally and in the
isolated Netlify/Supabase test environment, including a cold deployment. Readback
fell from about 37 MB to 403–407 KB per checkpoint, with complete native checking
of every new pack. Full-restore agreement and failure tests pass.

**Activation decision:** production stays on its existing hosting. Incremental
results are archive evidence and cannot authorize CRM writes. The existing
continuous full-read admission policy and five-minute fencing checks are unchanged.
This is a verified incremental-verification phase, not a production cutover or an
unattended backup activation.

## Pushed baseline and preserved work

The previously verified cloud-verification phase was pushed atomically to main
and codex/home-crm-hosting as `3132c19`, with CI/deploy skip markers. Its 64 tests
were rechecked first. The new incremental code is saved locally, awaiting a later
push. No application source, feature, financial behavior, credentials, production
configuration, DNS, router rules or scanner settings were changed.

Both CRM app deploys remain unchanged: production
`6adab6d33b9c3096a37ad0a1`, staging `6adb68aaafaed79557bf7051`.
The scanner still has driver PID 1192, the same original configuration SHA256 and
healthy, uninterrupted 14-hour bridge uptimes. The benchmark and CRM candidate VMs
are stopped. All 17 pending materials/operational lookup files retain their
original hashes. Source APIs, payment dispatchers, senders and schedulers stayed off.

## Actual cloud evidence

| Run | Repository bytes | Downloaded bytes | Payload reduction | Seconds | New packs fully checked |
| --- | ---: | ---: | ---: | ---: | ---: |
| Checkpoint 2 | 37,305,623 | 402,685 | 98.92% | 18.458 | 2 |
| Checkpoint 3 / fresh deployment | 37,702,012 | 406,704 | 98.92% | 19.052 | 2 |

The initial independent baseline read 36,909,154
bytes and completed in 14.342 seconds. Checkpoint 3 ran
after a fresh draft deployment, with no retained ciphertext cache. It used only
the signed catalog and fresh Storage observations to recover verification state.

An exact retry returned the original signed envelope and catalog certificate.
It did not extend the original last-full-verification expiry. Changed config
object versions were rejected at the inventory stage before payload reads.
A corrupted catalog signature was rejected before a verification job began.

For independent full-restore comparison, every encrypted file in the matching
local repository copy was first checked against the cloud-signed ciphertext
SHA256 catalog. Native Restic then ran a full data check and verified restore of
that copy. All eight artifact hashes/fingerprints and the private-file inventory
matched the incremental result. This comparison used a throwaway local signing
key, not a new cloud authority. It did not bypass the transfer budget by silently
pulling the entire repository again. No extra managed PostgreSQL import is claimed;
the earlier 177-table/266-function native and managed restore evidence remains in
[HOME_CRM_FAILOVER_VERIFICATION.md](HOME_CRM_FAILOVER_VERIFICATION.md).

Test site: `ats-recovery-verifier-lab`,
`097f9348-2fae-42f0-99aa-bb211cbb3cc5`. Final isolated draft:
`6ae177b6f274324025bc4845` ([test site](https://6ae177b6f274324025bc4845--ats-recovery-verifier-lab.netlify.app)).
After the final baseline-identity check was tightened and all native tests passed,
this draft was bundled again. Anonymous requests returned 401 and the deliberately
replaced base was rejected at `base-inventory` before payload reads. The successful
cloud checkpoint measurements above precede that final hardening; no additional
full cloud baseline was charged for this last change.
Supabase target: `gbyhdsuiqeslgjdnbqng`, private bucket `crm-cloud-lab-d85b4fbe5cd8`.
The source is the existing fenced, synthetic production-feature candidate with
102 migrations. The 27 unreleased application migrations were not implicitly
installed into that candidate or production.

## Verification protocol

1. A fresh full read/check/restore creates an Ed25519-signed catalog. It binds the
   source, namespace, generation, host/database boots, topology, snapshot,
   ciphertext SHA256, Storage object ID/version/size, strong provider ETag and
   artifact content/permission fingerprints. Each ETag is captured from the full
   download response and checked against a fresh probe before signing; an identity
   change between the full read and probe withholds the certificate.
   The catalog is generated only after
   the full verifier has checked the paired database, Auth, payment/delivery,
   private-file and source artifacts.
2. Every incremental job validates that signature and scope, increasing sequence
   and capture time, and the original full-read expiry. Removing/replacing a base
   object or changing keys requires full verification. All retained objects are
   physically probed through bounded Range GETs and their strong ETags checked.
   Every metadata object is fully read and rehashed.
3. Every new encrypted object is fully downloaded and checked against its content
   address. The native Restic binary performs deterministic pack-group checks
   covering **all** new packs. The adapter records the actual byte intervals read
   by successful native checks; a missing interval rejects the proof. Every blob
   in those new packs is authenticated by Restic. Pack selection is not random
   sampling. An old pack sharing a selected bucket is fully read, hash-checked and
   charged too; it is never hidden in the transfer estimate.
4. Native Restic checks the complete snapshot graph and authenticated indexes.
   New indexes cannot reinterpret offsets/identities inside a previously checked
   pack, introduce unknown pack locations, or silently repack the base. The
   selected snapshot must have the expected capture path and artifact layout.
5. Unchanged artifacts reuse only an exact authenticated ordered-blob fingerprint,
   size, mode and owner identity. Changed artifacts are dumped through Restic and
   independently SHA256 checked. The current manifest must match the ticket and
   bind the actual database, private-file archive and application source bytes.
   Private-file inventory changes trigger complete streaming tar validation.
   Links, unsafe paths and broadened private-file permissions are rejected.
   The existing 0644 source-code archive remains supported inside the private
   capture; credential/data files remain private.
6. Fresh inventory is checked again before durable completion. Only then is the
   archive receipt/certificate returned. The next catalog inherits the original
   full-read timestamp and expiry; incremental activity cannot slide it forward.
   Expiry is checked again after work, including the case where it expires during
   verification. The catalog has a 24-hour maximum age and a 40 KiB payload cap;
   requests are capped at 64 KiB and repositories at 96 objects for this prototype.

The read-only REST adapter binds only loopback with an unguessable path, refuses
writes, and uses bounded source inventory. Restic receives no Supabase service
credential. Encryption, decryption, MAC checks, object decoding and graph checking
remain in pinned native Restic 0.19.1. No custom backup encryption format was added.
PostgreSQL dump and application/private-file formats remain unchanged.

## Integrity boundary and write safety

Incremental verification does not freshly read every retained physical byte. It
relies on the Storage ID/version and strong ETag immutability contract between
full scrubs. Silent provider corruption that changes neither identity nor ETag
can require a full scrub/restore to detect. Full scrubs must remain mandatory.
All base objects remain pinned by the chain; even removing an unreferenced old
object invalidates the current catalog. Reviewed generation rotation with a fresh
full verification is needed before pruning.

For that reason the new results explicitly use `archive-verification`, with
`remoteBytesReadBack=false` and `writeAdmission=false`. Existing continuous
admission rejects both those receipts and the catalog kind. No flag or fallback
promotes cached/incremental evidence into a full-read write permit. Integrating
this protocol with the candidate writer gate requires an explicit integrity and
admission review followed by the existing deadline/fault tests. Nothing here
changes production access, RLS, Stripe recovery, email idempotency or dispatch.

## Durable quotas, retries and failures

The staging-only incremental RPC shares the original namespace mutex, job table
and daily/monthly counters with the full verifier. Both worker types exclude each
other. It reserves metadata before inventory responses and charges each bounded
read before fetching bytes. Responses include conservative overhead allowances.
Daily and monthly changes are atomic. Failed work is not refunded. Completion
checks the current inventory and lease again. A failed job retains its history
and cannot later complete; expired/unresponsive attempts remain recorded.

Retries preserve the original claims and catalog; they charge their response
metadata rather than refreshing the proof. No provider sends or business writes
occur in these jobs. The test namespace reserved
76,015,128 bytes, including
failed preflights, a terminated attempt and replays. Its limits remain 96 MiB/day
and 512 MiB/month. Counters are namespace-scoped, not account-wide billing meters.
No quotas were raised and no paid plan/settings or new provider account were used.

One initial per-blob implementation returned HTTP 502 after about 30 seconds
without a completed proof. Replacing repeated native startups with full native
new-pack checks brought successful cold cloud work below 20 seconds. No speculative
memory/region upgrades or timeout extensions were used. All failed attempts and
their charges remain in the ledger and private evidence.

## Staging reconciliation

The original 129 application migrations, latest `20261026212535`, keep versions
MD5 `166e4aac5f22e788561f6acd61478441` and complete application-ledger MD5
`42b9556b3e7f31050aa8a8c070cc8814`. One staging-only maintenance entry was added:
`20261028034426_recovery_verifier_lab_incremental`. Total ledger entries are now
132: 129 application entries plus three reviewed lab operations. Original history
was preserved; no application migration or old ledger row was repaired/deleted.

The new public wrapper is service-role-only, owned by postgres with a fixed search
path. Its internal charging helper has no direct public, authenticated or service
role execution grant. Existing four ledger tables retain RLS and denied direct
client access. The exact-target profile pins both new function definitions and
the maintenance statement hash. The live read-only verifier passed. The 49 Auth
users, 303 business policies and no-send Auth guard remain unchanged. Advisors
introduced no new client-executable definer warning. Historical candidate
verifiers remain strict about their original target state.

## Tests and implementation

**80 tests passed, with no skips**, including actual native Restic fixtures.
Coverage includes cold continuation/full-restore agreement, missing payloads,
corrupted new ciphertext, provider identity changes (including between a baseline
download and its final probe), replaced base objects,
malicious index offsets, incomplete native pack reads, archive traversal/link
rejection, mid-job expiry, stale jobs, quota-before-I/O, cross-worker exclusion,
retry identity, client-denied RPCs, and the existing recovery/fencing guarantees.
Additional verification: real cloud/Supabase Range reads, a fresh draft deployment,
actual tamper/replacement rejection, final exact staging reconciliation, standalone
function bundling and preservation checks. Application source/dependencies were
unchanged, so no CRM application build was needed.

Implementation is under `scripts/home-hosting/`: incremental policy/verifier,
read-only Restic REST adapter and process runner, isolated Netlify handler,
archive-only ledger extension and tests. The existing full verifier gained an
optional full-verification catalog hook; default write-admission behavior is
unchanged. The packager and exact staging profile were updated. No new npm
runtime dependency was added in this phase.

Private artifacts, signed certificates, coherent captures, keys and raw logs are
retained outside Git at `/Users/noelsierra/Documents/Codex/2026-10-27/home-crm-incremental/d85b4fbe5cd8`.
They must not be committed. Prior failed attempt files are preserved in its
`attempts/` directory; the successful baseline was reused after the bounded
preflight failure rather than repeatedly reading it outside the quota.

## Next implementation step

**Optimize the producer's changing database/manifest payload before activation.**
The current capture still publishes about 396 KB of new encrypted data even in
this small synthetic dataset. At two-minute intervals, successful job reservations
of roughly 0.53–0.58 MB project about 380–420 MB/day before daily full scrubs. That
still exceeds the 96 MiB/day and 512 MiB/month test limits. The 99% verification
improvement is real; free continuous operation is not yet demonstrated.

Measure stable per-table/native dump output and manifest layout changes using the
same paired barrier, then repeat native/managed restore parity. Keep quotas and
full-scrub requirements intact. Review shared account/generation budgets, safe
rotation, and the candidate's incremental-admission contract before unattended
scheduling. The existing power/suspend, monitoring, ingress and manual-failover
gates remain in the original roadmap. Production remains on its current hosting.

References: [Restic repository/REST format](https://restic.readthedocs.io/en/stable/100_references.html),
[pinned native pack selection](https://github.com/restic/restic/blob/v0.19.1/cmd/restic/cmd_check.go),
[the prior cloud report](HOME_CRM_CLOUD_VERIFICATION.md).
