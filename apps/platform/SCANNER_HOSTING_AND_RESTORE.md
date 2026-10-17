# PR18 scanner hosting configuration and local restore verification

Verified October 17, 2026 UTC (October 16 local). Continues existing PR18/F17;
does not create another roadmap or authorize a release.

## Decision and Git state

The previously verified upload/access package `aa5c1b2` is pushed to both
`origin/main` and `origin/codex/pr18-upload-access`, with `[skip netlify]`.
This hosting/recovery follow-through starts from that main commit and remains
local on `codex/pr18-scanner-hosting` pending the next push request.

**Local hosting preparation and recovery verification are complete. Keep
production activation on hold.** No host, DNS, production secret, hosted schema,
staging/prod deployment, source-file retention job or business-file scan was
created. The existing local CRM at 127.0.0.1:3102 and its scanner are preserved.

## Concrete changes

`scripts/private-scanner/hosting/` contains pinned-base Dockerfiles and a Compose
package for a TLS proxy, private bridge, private ClamAV engine and separate
signature updater. The default published port is loopback only. Runtime services
are non-root, read-only, capability-free and memory/CPU/PID bounded; actual
cgroup memory/no-swap limits were checked. The engine has read-only definitions,
memory-only extraction and no persistent logs. No file-processing service has
general Internet access. The updater cannot join its file-processing networks.

Bridge credentials can come from a private mounted file; the old local env-token
interface remains supported. `probe.mjs` performs a real synthetic scan and
reports loaded engine/definition freshness, with 24h warning, 36h urgent and
over-48h refusal. Nothing configures an external monitor or sends an alert yet.
Proxy logs contain only status/latency and are bounded by space, not a promised
time-based deletion policy. No source file, file name, record metadata or token
is logged. The package includes a future host coredump configuration fragment.

Local runtime versions: Node 22.23.3 / npm 10.9.9; ClamAV 1.5.4 from pinned Ubuntu
24.04 packages; nginx 1.30.6; Compose 5.6.0. Base manifest digests, final local
image IDs and source hashes are in `hosting/LOCAL_VERIFICATION.json`. Images were
built/executed on Linux ARM64 only. No image was published. The Ubuntu engine
recipe avoids the official ClamAV image's missing ARM64 manifest; an eventual
AMD64 host still needs its own build/runtime/capacity proof.

## Problems found and corrected

1. Rootless Docker remaps runtime UIDs. Private token/key mounts initially could
   not be read. Corrected only the new synthetic fixture file ownership using
   the actual mapping; preserved 0600 permissions. The runbook requires this
   check rather than using permissive secrets or root containers.
2. Nginx's unused default temporary directories attempted writes to its read-only
   root. All temporary paths now target bounded tmpfs. Runtime DNS resolution
   also follows bridge replacements instead of retaining a retired container IP.
3. **A real compressed-file test found an inspection gap:** with a 26 MiB member
   ceiling and 100 MiB aggregate ceiling, ClamAV 1.5.4 reported a 110 MiB ZIP
   member clean after truncation. Matching both internal budgets at 100 MiB
   makes the tested case hit the aggregate alert and stay quarantined. Both
   supplied clamd configs are corrected. The application/HTTP file ceiling is
   unchanged at 25 MiB. The memory/scratch and total-work caps remain bounded;
   this is scanner configuration, not a new application permission or validator.
   The engine's [ZIP extraction implementation](https://github.com/Cisco-Talos/clamav/blob/clamav-1.5.4/libclamav/unzip.c)
   explains the truncation behavior; acceptance comes from the actual test.
4. Local catalog restore needs the existing cluster administrator to preserve
   Supabase-owned schemas; `postgres` cannot SET ROLE to `supabase_admin`.
   Used the existing local administrator on a **new** database, without role
   grants, ownership shortcuts or modifying the shared review database. A raw
   ACL can change from explicit owner-only to its equivalent NULL/default
   representation; comparisons normalize defaults/order and verify effective
   grants, owner, RLS and policy definitions. No access was broadened.

## Verified results

| Check | Result |
| --- | --- |
| Credential-free regression suite | 682 passed |
| New hosting integration suite | 8 passed including parent test |
| New seven-area recovery integration suite | 10 passed including parent test |
| Existing upload/access integration suite | 11 passed |
| Existing six-area attachment scanning suite | 25 passed |
| Existing document library/app/scanner suite | 12 passed |
| Typecheck | Passed |
| Empty independent catalog backup/restore | Passed: 243 application functions and 321 policies |
| Previous migration/function/policy/UI preservation | Passed; all 92 migrations retained unchanged |

Hosting tests use actual TLS, the real application scanner client and ClamAV:
clean/EICAR bytes, exact/over-25 MiB limits, encrypted and oversized expanded ZIPs,
untrusted-certificate denial, wrong token/MIME/path/empty requests, two-request
saturation, engine outage/restart, signature readiness and no retained payload
files. Inspecting the read-only layer allows only Docker's secret-mount target
scaffolding. The updater successfully checked signed definition versions.

The recovery drill encrypts only newly created synthetic backup fixtures with
AES-GCM, rejects the wrong key/tampering, verifies SHA-256 and deletes only those
new test bytes to simulate loss. All seven areas restore under actual authorized
sessions and existing RLS; restored bytes remain held until a new real scan.
Old scan tokens cannot approve a new attachment generation. An outage keeps a
restored receipt held until explicit retry; recovered EICAR stays quarantined.
An unrelated crew member cannot open the files. Original job/cost/purchase rows
and the existing photo-upload audit entry are identical before/after recovery.

Six buckets reuse only missing paths with `upsert:false`, receiving new Storage
identities/generations and retaining metadata/attempt history. The library uses
a new document ID/path with preserved classification and archives the missing
original; copying an old clean document record is explicitly prohibited. The
fixture has no business links; real linked-library restore needs a separately
reviewed authorized mapping. No recovery grants or privileged upload bypasses
were introduced. Disabled/unavailable original uploaders require an authorized
recovery plan, not impersonation.

The separate pg_dump/pg_restore drill uses the empty independent 92-file schema
replay, not the shared review database. Restored function definitions/grants,
table owners/effective ACLs/RLS, all policies and private buckets match; scan
switches default OFF. That source has no CLI migration ledger, and none was
fabricated. This is same-cluster catalog recovery, **not** a complete production
PITR/global-role/Storage backup or a scheduled backup service. Supabase database
backups do [not include Storage payloads](https://supabase.com/docs/guides/platform/backups).

The new setup does not change application build inputs: no Next/React code,
dependency lockfile, route, UI, RLS or migration changes. The full app build
passed for `aa5c1b2` in the previous package; it was not repeated into the active
review server's build directory. This pass ran typecheck, all regressions and
66 integration tests including their parent tests. Older native transport and
financial/provider results remain prior evidence, not claimed as new runs.

Synthetic records/audit history and private evidence stay outside Git where
appropriate; only newly created test actors are retired. Original switches and
the separate local review owner remain intact; recurring generation remains OFF.
The additional scanner stack is stopped after testing, retaining its definitions
volume and evidence. No shared stack or user files were reset/deleted.

## Next implementation step within PR18

Review the concrete hosting package for company ownership, capacity, maintainer,
TLS renewal and alert delivery; approve a separately encrypted source-object
backup/manifest, key custody, retention and recovery objectives. Preserve-first
business retention and manual legacy activation remain unchanged. Do not create
a purge worker or bulk scan based on the previously empty inventory.

Then reconcile the recorded hosted schema against the exact release chain
before any migration or activation. The old hosted snapshot had 65 recorded
versions; the repository now has 92. That snapshot was not refreshed or treated
as proof of absent schemas. The existing reconciliation/runbook procedure remains
the authority. An isolated staging host/deployment needs explicit approval and
must prove actual provider transport, CDN/access behavior, resource/definition
reload peaks, TLS and paired source-file/database recovery before production.

See `scripts/private-scanner/hosting/README.md` for configuration/operator
instructions and `tests/README.md` for repeatable opt-in tests. No staging or
production step is authorized by this local verification or by the earlier push.
