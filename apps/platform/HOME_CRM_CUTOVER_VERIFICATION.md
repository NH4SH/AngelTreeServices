# Home-primary cutover verification

Started October 28, 2026; live handoff October 29. **The CRM application and its
database now run on the home Mac.** Netlify remains the canonical HTTPS entry and
the single existing scheduler. Supabase holds independently verified encrypted
recovery checkpoints, with controlled manual failover and a five-minute saved-work
loss limit enforced by write fencing. The owner confirmed that the live dashboard
opened after a fresh sign-in. No paid upgrade or unrelated feature release occurred.

The earlier sections retain their historical pre-activation findings. The final
live handoff below supersedes their statements that production had not moved.
This document continues the existing [migration roadmap](HOME_CRM_MIGRATION.md).

## Completed checks

- The owner confirmed browser use only; there is no installed native-app server
  setting to migrate. Safari coordination with the Website chat was authorized,
  completed, and released after the account-capacity check.
- ATS's signed-in Free usage dashboard showed 0.734/5 GB uncached egress,
  0.353/5 GB cached egress and 0.02/1 GB average storage. Its cycle is October 11
  through November 11; the graph's current storage level was higher than its
  monthly average. Usage may lag. These are observations, not a future quota guarantee.
- The isolated production-feature runtime uses source `8fa9df32` plus the prepared
  security updates and internal server transport. Native Linux ARM64, Node
  **22.23.4**: **2,216 tests passed, no skips**, typecheck and production build passed.
  Next.js is 16.4.3, React is 19.2.9. Its 102-migration production feature baseline
  remains separate from unreleased main and its 129 application migrations.
- The optional internal transport keeps public Supabase URLs/cookies/signed links
  canonical while routing server calls only to `http://api-gw:8000`. Four tests
  cover methods, mutation bytes, streams, cancellation and rejected alternate
  destinations. It is not enabled on production.
- Managed standby fencing was tested on CRM Staging: revoke database `CONNECT`
  from application backend roles and terminate their existing sessions. REST,
  Auth and Storage then denied access. Exact original access was restored and
  verified. `default_transaction_read_only` alone is insufficient because
  PostgREST starts read/write transactions.
- Staging reconciliation preserves **129 original application entries**, 303
  business policies, 49 Auth users and the no-send Auth guard. Twelve explicitly
  recorded recovery-lab maintenance entries are separate from application history.
- The home Mac's AC-only `org.angeltree.crm-awake` user service is running. FileVault
  and sleep settings were not changed. The lid must remain open; a cold boot still
  requires the owner to unlock FileVault.

## Independent checkpoint admission and deadline drill

The original full-read receipt validator still rejects archive certificates.
The new, explicit `certified-incremental-v1` **synthetic-only** protocol additionally
requires independent signatures for a complete current snapshot/catalog, all new
packs checked natively, fresh physical observations of every retained object,
unchanged provider identity, private access denial, exact source/boot/epoch binding,
runtime recovery sources, a 24-hour full-scrub limit and durable serialized admission.

A separate staging transaction compares the exact completed independent job,
catalog and current Storage inventory. It advances sequence monotonically and
preserves the original result/deadline on retry. Archive and metadata-compaction
results remain non-writable. No field was changed to falsely claim a fresh full
download of retained bytes.

Actual independent Netlify verifier plus native home-VM test:

| Check | Result |
| --- | --- |
| Synthetic health corpus | 90,000 records; larger than production's observed health history |
| Full encrypted recovery baseline | 6,411,487 bytes; 15.457 seconds |
| Last stable incremental check | 105,449 bytes read; 17.864 seconds; two new packs fully checked |
| Test writes before injected failure | 11 committed fixture writes |
| JavaScript watchdog and Docker control process | Suspended together |
| Independent kernel deadline | **278,530 ms from capture start**, below five minutes |
| Long transaction that forced deferred checks early | Rolled back by the kernel fence |
| Cold database restart | Refused subsequent writes |
| Target application services afterward | Stopped; synthetic users retired |

The authority test is `9d56c5a2df31`, sequence 4. Its final verifier draft is
`6ae2555557db9bce1771de8f` on the existing recovery-lab site. It is not a CRM app
publication. No production authority, automatic schedule or primary routing was installed.

The tests exposed and corrected an object-key-order mismatch: PostgreSQL JSONB
and JavaScript serialized identical physical metadata differently. Provider
inventory identities now canonicalize only UUID/name/size/version. Ciphertext
hashes and ETags remain independently bound in the signed catalog. Initial
rejections issued no write permit; their evidence and reservations are retained.

## Why repeated logical dumps are not the production backup design

A read-only export measured the actual production data-only custom archive at
**2,130,014 compressed bytes**. Production had 89,193 health-check rows, totaling
21,191,478 bytes as JSON. No customer/Auth/payment records were printed.

The CRM already prunes health history after 35 days. An idle-only benchmark misses
that workload. In a closed synthetic test, pruning the oldest 100 of 90,000 health
records and appending 100 replacements changed **71 of 78** fixed archive pieces:

| Method | New encrypted bytes for that cleanup workload | 31-day payload projection at two-minute checkpoints |
| --- | ---: | ---: |
| Logical custom archive in 256 KiB pieces | 2,420,599 | 54,027,769,680 |
| Native PostgreSQL base backup plus streamed WAL | 30,329 | 676,943,280 |

All other table fingerprints remained unchanged in the logical cleanup test.
The free-capacity decision must use this moving-history workload, not the much
smaller stable checkpoint. Increasing the catalog cap or quota does not fix it.

The optional 128/256 KiB formats preserve the exact original native archive bytes
and validate format, order, lengths and hashes. Moving unchanged runtime instructions
to `runtime.private.json` reduced artificial manifest churn. Those improvements
remain useful for exports and managed recovery; they do not solve rolling-history
cost sufficiently to activate unattended logical checkpoints.

## Native transaction-log result

The successful local trial `01edf465dc96` uses the source's pinned PostgreSQL 17.11
image, `pg_basebackup`, `pg_receivewal --synchronous`, gzip-compressed completed WAL
segments and native encrypted Restic. The initial encrypted base/WAL package was
**9,783,650 bytes**. The equivalent cleanup transaction added **30,329 encrypted
bytes**. Native encrypted checks passed for both checkpoints. This is a short
local measurement, not an account-wide free-operation claim.

A committed native logical message creates a real cutoff even when the database
is idle. The coordinator waits for the completed WAL file and server-confirmed
flush position. Segment-boundary LSNs must select the previous completed byte;
the next segment is still partial and cannot certify the checkpoint. Partial files
are excluded. No `--no-sync` option is used.

The closed fixture needed a temporary, password-authenticated replication entry
for `supabase_admin` at **127.0.0.1/32 only**, within the DB's network namespace.
The original authentication configuration was saved and restored exactly. Each
trial's newly created receiver was stopped and its own replication slot removed,
including failed trials. No existing slot, public database port or production
configuration was changed.

Cold recovery `a4a3b5bed5fd` independently restored the encrypted checkpoint into
new volumes and a new networkless server using the exact source image:

- Native `pg_verifybackup` passed before recovery configuration was added.
- WAL replay reached the bound target LSN `0/E01BC10` and paused.
- All **177 table fingerprints**, RLS/ACL metadata and the complete application
  function fingerprint matched the captured database.
- API logins remained disabled; the standby rejected a write and retained the
  cold hosting guard. The target was stopped afterward.
- **Private object bytes and managed-Supabase recovery were not part of this
  native WAL trial.** Neither is claimed as verified by this result.

## Remaining gates in the existing roadmap

### Native chain admission and separate-machine recovery

Trial `24e1562a9dd3` exercised the new, explicitly separate
`certified-native-wal-v1` protocol end to end. A staging transaction binds the
source, VM boot, database boot, generation, native PostgreSQL identity, immutable
provider object versions, every retained dependency and independently checked
ciphertext. A retry preserves the original admission and deadline. Neither an
archive proof nor a chain reference authorizes writes. Concurrent verifier
requests share one charged attempt; the account-wide budget includes older lab
reservations and bounded metadata overhead.

| Checkpoint | Encrypted bytes read independently | Cloud check | Capture to admission |
| --- | ---: | ---: | ---: |
| Full paired base | 13,432,910 | 11.778 seconds | 29.067 seconds |
| WAL update 2 | 25,551 | 8.516 seconds | 20.501 seconds |
| WAL update 3 | 22,365 | 8.681 seconds | 24.246 seconds |

After 89 successful synthetic writes, both the JavaScript watchdog and rootless
Docker daemon were suspended. The independent kernel deadline stopped the
source after **278,340 ms from the last capture start**. The long transaction
that evaluated deferred checks early rolled back. A cold database restart
refused another write. The test authority was disabled afterward, all source
services stopped, API logins disabled and the trial's own receiver/slot retired.
No production writer, schedule or routing was activated.

The actual trial caught two integration defects before any source admission:
the restricted `postgres` role cannot inspect all file settings, so capture now
uses the existing local maintenance role without widening grants; and staging's
locale sorted the old prefix range differently, so UUID-directory inventory now
uses exact prefix membership with explicit output ordering. Its seven uploaded
objects were recovered by the corrected query. Failed attempts and their budget
reservations were retained. The staging baseline was reverified after cleanup:
129 application migrations, 12 separate lab entries, original permissions and
Auth guard unchanged, all test authorities disabled.

Recovery `8ec0f21aee5a` then downloaded all three immutable cloud components on
the **development Mac**, without SSH or any source-database connection. The extra
13,480,826-byte read was separately charged before download. Ciphertext hashes,
native encrypted readback, private-file archives and the complete chain passed.
The existing disposable Linux VM on this different Mac replayed the exact pinned
PostgreSQL image to `0/1600D6D8`. Native `pg_verifybackup`, all **177 table
fingerprints**, RLS/permissions and function definitions matched. Recovery settings
and database keys came from the encrypted package, not from the live source.
The networkless target had no published ports, remained read-only, denied writes
and was stopped afterward. Existing disposable projects were preserved.

All **135** operations tests passed with no skips; the isolated production-feature
runtime's earlier 2,216-test/typecheck/build result remains separate. The scanner's
configuration SHA and all seven running container IDs remain unchanged.

This is a **closed synthetic source** result. The current producer explicitly
requires stopped application services and cannot be installed as an online
two-minute production backup. Online file/database pairing, native-chain export
into managed Supabase, dependency-safe retention and the fresh primary/ingress
cutover remain required. Production is still Netlify/Supabase.

### Online source, file metadata and failure drill

The subsequent candidate-only `transaction-barrier` mode does not stop services,
change API logins or terminate application sessions. It holds Storage metadata
while copying only committed object versions, checking size, committed MD5 ETag,
SHA256 and file attributes. Ordinary business writes continue during that phase.
A short final shared-table barrier captures the consistent SQL fingerprints and
native WAL cutoff. PostgreSQL limits both lock acquisition and the lifetime of
an abandoned barrier; no controller can hold it indefinitely.

Actual concurrency trial `8055542abf03` copied and verified all four referenced
files, allowed a business write during the file phase and let a waiting business
transaction commit afterward. The Storage barrier lasted **1,274 ms**, the final
business barrier **701 ms**. Suspending the backup controller released its locks
after **8,000 ms**, without killing the waiting writer.

Plain tar bytes omit Linux file-backend metadata. The new explicit paired format
binds the four allowed `user.supabase.*` attributes to each object. Trial
`9979840d680c` restored four files and all eight present attributes into a fresh
volume, then checked their headers through the actual Storage backend. The
candidate Storage runtime advances from Node 24.21.0 to **24.22.1**, within the same
native-addon ABI, using pinned upstream images and a captured Dockerfile. Its
private environment, mounts, ports and restart policy were preserved. The native
metadata addon and actual upload API worked. The old runtime lacked the fixes
in [Node's October security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
No production scanner/runtime image was changed.

Online trial `97e49e42736c` then ran the actual synthetic Auth/REST/Storage/Next
stack, created an invoice and one manual-payment record, retained accepted and
uncertain delivery history, and uploaded a protected document. No provider calls,
real payments or customer emails occurred. Its initial independent full read was
**13,491,446 bytes / 12.121 seconds**. Adding the document correctly required a new
paired base: **13,478,796 bytes / 11.997 seconds**. The next stable online WAL update
was **25,362 bytes / 8.905 seconds**, admitted 21.433 seconds after capture start.

With 96 successful fixture writes, both watchdog and Docker control were
suspended. The independent deadline fenced the source at **278,390 ms**. The
long transaction rolled back; a cold restart refused another write. The source
was stopped, its users retired, API logins disabled, test authority disabled,
own deadline/watchdog units retired, and its receiver/slot closed.

The trial also caught a cross-run cleanup bug: a still-armed timer from an older
fenced run could stop a newer run using the same test containers. Admission now
rejects foreign active deadline/watchdog units; cleanup can retire only its own
units after positively checking that its source processes are stopped. Fence
events are appended and the first fence result is retained. Startup verification
also waits for both Auth and Storage, avoiding partially ready fixture requests.
Earlier failed trials and their charges/history remain preserved.

Independent recovery `5ba5907a1124` selected only the latest complete base and its
WAL dependency, downloaded **13,504,158 bytes** from the cloud with a separate read
reservation, and used no source connection. The separate development Mac replayed
to `0/2500E920`; all 177 tables, permissions, RLS and function fingerprints matched.
Online backups naturally retain login-capable role flags. The recovery target
therefore explicitly rejects API-role local connections, has no published ports,
and remains paused/read-only; its transport denial and write rejection passed.
It was stopped afterward. Captured configuration supplied all recovery settings.

All **138** operations tests passed without skips, and all 116 operation modules
parsed successfully. This remains a scoped synthetic prototype, not an installed
production backup/primary. Managed-Supabase conversion of this online chain,
dependency-safe retention, fresh real-data primary preparation and final ingress
verification remain ahead of cutover.

### Complete package and patched offsite runtime

Paired trial `82a4b608f13d` extends the native backup with the four synthetic
private objects, 21 database-configuration files (including the key outside
PGDATA), the private service environments, exact source archive, and bounded
runtime reconstruction instructions. The source API boundary stayed closed;
this does not claim an online cross-store snapshot. The encrypted package is
**13,433,216 bytes**. Independent restore `a0d3d608ce71` passed the native base
check, reached the exact WAL cutoff, matched all 177 table fingerprints and
RLS/permissions/functions, verified the private files, and restored the database
configuration into a new volume. Its target was stopped; no application started.

Offsite trial `73f0d17038c1` downloaded the complete encrypted package on Netlify,
ran native Restic full readback and restore, streamed all **2,436 native base
files** against PostgreSQL's SHA256 inventory, verified the private archives and
runtime sources, and checked five completed WAL files' gzip integrity, native
headers, system identifier, timeline and required segment coverage. It took
**12.401 seconds**. WAL record replay occurred on the isolated native recovery
server, not in the cloud worker. Its signed result is an archive proof and
**cannot authorize writes**.

The fresh managed Node 24 test still ran unpatched 24.21.0. A newly named Node 22
function actually ran **22.23.4**; a previously reused function continued running
24 despite its bundle manifest claiming Node 22. The authenticated verifier was
then separately tested on 22.23.4 (`6ae265ed1d97b7d876510d97`). The verifier now
rejects unpatched and unreviewed runtime families before reading credentials.
The Go alternative was tested but uses `provided.al2`; it is not used as a custom
Node launcher. No provider account or paid runtime was added.

### Independent small-archive measurement

Trial `64da8d21b0f3` restored the two original native snapshots and isolated the
real 100-row prune/100-row append transaction into its own encrypted repository,
without changing the source database. Its completed WAL file was 40,587 bytes;
the full independent encrypted repository, including metadata, was **30,520 bytes**
across six objects. Native encrypted full read and restore passed. Offsite trial
`51b3d80d0b74` fully downloaded and verified those 30,520 bytes in **9.518 seconds**.

This projects to **681,206,400 payload bytes** per 31 days at two-minute intervals.
It excludes daily base/scrub reads, metadata reservations, failed attempts,
retention and new private files. The existing 256 KiB lab reservation and
512 MiB/month cap were not raised: this archive endpoint is not an unattended
five-minute production admission service. A small archive alone does not prove
that its parent recovery chain is complete or retained. The worker reports both
that limitation and `receiptPermitsWrites: false` explicitly.

### Outstanding cutover work

1. Pair WAL cutoffs with private files and the exact runtime/configuration/source
   recovery set. Bind the base system identifier, timeline and complete WAL chain.
2. Independently verify the native WAL layout offsite. The current archive worker
   and its small catalogs are not a production WAL verifier. Preserve honest
   verification claims, replay protection, source binding and the kernel deadline.
3. Measure real recurring verification, metadata, daily scrubs, retries and
   retention against the account's billing cycle. Bound storage and all namespace
   traffic. Protect every WAL/base dependency of retained recovery points before GC.
   Existing prototype caps were not raised and no cloud object was deleted.
4. Verify portable export from the recovered native database into managed Supabase,
   plus private-file recovery and cold permissions. Keep one writable primary.
5. Finish the protected HTTPS entry point, trusted client-address contract,
   authentication/cookies, streaming and private-upload tests on the isolated
   runtime. Then provision a fresh primary; never promote retired synthetic users
   or demo credentials into production.
6. Drain old workers/provider calls, fence managed writers, take the final paired
   copy and compare state before changing the live entry point. Preserve payment
   and delivery history, hold uncertain outcomes and keep one scheduler. Recovery
   requires current data and positive source fencing; pointing DNS at stale data
   is not a failover procedure.

## Preservation

The live Netlify deploy remains `6adab6d33b9c3096a37ad0a1`. Scanner VM configuration,
ingress, engine/updater and bridge IDs are unchanged; both ATS bridges are healthy.
No router/DNS/Caddy change, customer send, live payment, credential rotation or
production SQL/configuration change occurred. Website/Firewood services and the
separate pending materials work are preserved.

The recovery suite passed **120 tests, zero failures/skips** including the patched
runtime guards, bounded native-base inventory and WAL coverage checks. A further
parent/gap rejection test and the extended driver-scope test passed after that
suite. Actual native and offsite results are reported above.
Private evidence, captures, credentials and full logs remain outside Git under
`/Users/noelsierra/Documents/Codex/2026-10-28/home-crm-cutover` and the home
candidate's corresponding rehearsal directories.

References: [PostgreSQL streaming WAL](https://www.postgresql.org/docs/17/app-pgreceivewal.html),
[native base backups](https://www.postgresql.org/docs/17/app-pgbasebackup.html),
[Supabase egress accounting](https://supabase.com/docs/guides/platform/manage-your-usage/egress).


### Online WAL package restored into managed Supabase

Recovery `5ba5907a1124` was converted from the independent development-Mac
replay, without reconnecting to the home source. The clean free ATS project
**CRM Recovery Rehearsal WAL**, `nbsvdzscgfpabbbdwlob`, received the verified
102 original schema sources and the recovered data. This test used the owner's
previously approved temporary staging pause; production was unchanged.

- **158 tables / 90,563 rows** matched the recovered snapshot. The original
  102-entry rehearsal application migration ledger, including every captured
  version, name and statements field, was restored exactly. This is not a
  replacement or repair of the live production ledger. Supabase's three additional ledger bookkeeping columns
  remained null. Provider Auth/Storage migration ledgers were retained; old
  sessions and transient login challenges were excluded across issuers.
- Policies, effective table/function grants, normalized function bodies,
  sequences/defaults and all foreign keys matched. Fresh managed defaults had
  436 extra table/function grants; reconciliation only revoked those extras
  and additional sequence/default grants. The administrative RLS event trigger
  was recreated with the reviewed managed `postgres` owner.
- The restore exposed an importer defect for `GENERATED ALWAYS` identities.
  Recovery INSERTs now use `OVERRIDING SYSTEM VALUE` to retain original IDs and
  foreign-key references. The failed health-row batch rolled back; no source,
  production or staging rows were changed. A real PostgreSQL-compatible test
  checks identity/FK preservation, ordinary-table inserts and duplicate rejection.
- Eight core API check groups passed: closed signup; six physical files with
  matching bytes and ownership; original password and user ID; idempotent
  manual-payment replay; accepted/unknown deliveries refusing resend; authorized
  download; anonymous file/payment denial; disabled-user denial on the CRM's
  fresh authenticated file request. No customer emails or real payments occurred.
- An ordinary previously requested Storage URL returned a CDN `HIT` after the
  user was disabled. The existing CRM's authenticated URL with a fresh nonce and
  no-cache headers returned 400/DYNAMIC, and its access RPC returned false.
  No security rule was changed to make this test pass. Cached legacy URLs are
  not claimed to provide immediate access revocation.
- Signup and provider jobs were closed. The no-send Auth hook's configuration,
  SQL response and execution grants passed; the HTTP recovery-email probe was
  rate-limited **before** hook execution, so that path remains explicitly
  unverified. No SMTP credentials or provider keys were installed. All restored
  profiles were disabled and the test identity re-banned after testing.
- All **139 operations tests passed, no skips**. This is a managed API recovery
  result, not a full managed-backed Next UI test or a production promotion.

Original private-file business IDs and scan history were retained. Managed
Storage generates new object IDs/versions; their mapping is recorded privately.
The six platform-document fixtures do not prove every other attachment area's
object-version-bound scan mapping. All prior trial evidence and keys remain
preserved outside Git.


### Staging restored; fresh destination prepared

The approved temporary swap is complete. CRM Staging is **ACTIVE_HEALTHY**;
CRM Recovery Rehearsal WAL is **INACTIVE** and preserved. Staging's exact profile,
effective configuration and Storage inventory match their pre-pause snapshots:
129 application entries, 12 separate maintenance entries, 49 Auth accounts,
270 objects / 473,608,109 bytes. Automatic-send settings and no-send Auth guard
remain unchanged. No provider credentials, production data or source history
were modified by the swap.

The complete Auth/Storage/application policy comparison was also verified from
the independent read-only recovered database. Its one synthetic fixture policy
was intentionally excluded from the managed target. All remaining policies match.
The comparison uses the same `pg_catalog` search path as the original capture;
default-path deparsing is not a reliable substitute. The independent target was
stopped again after this read-only comparison.

A native-chain retention **preview** now protects the admitted head, latest two
verified roots, seven daily points, explicit pins, unverified evidence and a
24-hour grace period, including every required ancestor back to its native base.
It handles multiple retry IDs at one sequence, rejects missing/foreign/cyclic
parents and binds its observed source/head/component identities. All six targeted
tests passed. The actual three-component source remains disabled; all three
components are pinned/protected. **No delete executor or production retirement
permission is installed.**

Fresh VM `ats-crm-primary-20261029` is a separate empty destination: 2 CPUs,
4 GiB nominal RAM, 64 GiB sparse disk, no host-folder mounts or custom networks,
only loopback ports 3250/62432 and no built-in containerd. The stopped synthetic
candidate's data/volumes were preserved. The new VM has rootless Docker 29.9.2,
cgroup v2/systemd and signature/checksum-verified Node 22.23.4. Actual non-root
container tests enforced 64 MiB memory, zero swap, half a CPU and 32 processes.
Crash-dump suppression survived a cold VM restart; Apport is masked only inside
this fresh VM. No host sleep/FileVault setting was changed.

The fresh VM has **no CRM installation, production data, provider keys, public
route or writer authority**. It is not the live CRM. The scanner configuration
and seven existing container IDs remain preserved.

A remaining practical capacity issue is explicit: the current online producer
promotes a file-pair change to another full database base. Trial 97e49e42736c
measured 13,478,796 encrypted bytes for that case, compared with 25,362 bytes
for its steady WAL update. This requires incremental private-file handling or a
reviewed measured workload/capacity decision before unattended production use;
steady-WAL-only projections are insufficient for an actively used photo library.


### Incremental private-file format prototype

The new local `native-file-patch.mjs` format binds the exact parent/current file
indexes, SHA256, committed MD5 ETag and supported Linux file attributes. It carries
only new/changed byte payloads; metadata-only changes and removals are explicit.
Wrong parents, forged reuse, unexpected or missing files, changed bytes and
unsupported paths/attributes fail before a result can be accepted. This module
has no uploader, delete client or writer authority. Its verifier explicitly
reports `completeRecoveryPackage=false` because inherited bytes are still needed.

Local proof `b58429c803b5` used six files from the independently recovered
synthetic fixture, with a **projected** five-file parent. It transmitted one
34-byte new file in a 2,048-byte tar plus a 4,383-byte index/patch document.
Actual extraction and reassembly matched all six file digests. It did not copy a
new PostgreSQL base. Seven targeted tests, including real archive verification,
passed. SHA256 remains the integrity hash; optional MD5 checks additionally bind
the reviewed file backend's committed ETag to the actual archived bytes.

This is a **format/byte-reassembly prototype**, not a cloud recovery-chain or
production result. Linux attribute application, independent cloud authority and
receipt integration, native-chain retention execution and failure/recovery drills
remain required. No existing receipt, source allowance, full-scrub expiry or
production permission was changed by this prototype.


Final local verification for this checkpoint: **152 operations tests passed,
zero failures/skips**, including native recovery fixtures, the identity-import
regression, retention dependency/retry cases and file-patch/archive corruption
checks. `git diff --check` passed. The original production Netlify deploy
`6adab6d33b9c3096a37ad0a1` remains current, and production Supabase
`ddvlnixdugcbnrewktes` is healthy on PostgreSQL 17.6.1.127. The Website chat was
updated under the owner's explicit coordination authorization; no Firewood
activation or production switch was implied.

## October 29 — incremental files and production-adapter verification

**The canonical production CRM has not moved.** Netlify still publishes deploy
`6adab6d33b9c3096a37ad0a1`; managed project `ddvlnixdugcbnrewktes` remains its
writer. The private Mac copy has no active write authority, no API login roles
and no running CRM application. No customer emails or payments were initiated.

Verified evidence:

- File-aware native checkpoints `18294554e7af` restored 177 database table
  fingerprints plus seven private files and 14 Linux attributes independently.
- The actual production adapter trial `cc4b4c922baf` completed four certified
  checkpoints. Suspending its watchdog and rootless Docker daemon still stopped
  all seven services after **279,048 ms**; the long transaction rolled back and
  a cold write was refused. The source authority was disabled after the trial.
- Independent recovery `f07fc8d30b50` downloaded **9,385,632 bytes**, verified
  ciphertext and native PostgreSQL backup/replay, matched 176 table fingerprints,
  and recovered its private file, two attributes and actual Storage backend
  headers. It used no connection to the home source and left recovery stopped.
- A fresh, consistent **read-only** managed snapshot imported into a new private
  Mac volume. All **172 imported table row counts and hashes** matched, including
  three users, 54 invoices, 40 payments, delivery history and original migration
  metadata. The source file inventory was zero.
- Actual catalog reconciliation preserved the existing profile reset timestamp
  and three newer migration-history columns absent from the recorded migration
  files. All **265 business function definitions**, all row-security policies,
  and **215 existing relation privilege/owner definitions** match. The reviewed
  platform RLS helper has the required self-hosted superuser owner. Two empty
  Storage-owned Iceberg tables are image internals, with no application activation.
- Thin edge preview `6ae2e1b3c6b00dc6b1a96423` passed real **25 MiB upload and
  download** hash checks, multiple cookies, unchanged webhook bytes/signatures,
  canonical host, website Origin, forged-address stripping and private caching.
  It contains the five existing scheduler entrypoints, held during verification;
  it contains no second Next.js CRM server. The Next.js adapter is skipped for
  this artifact only; existing site settings are preserved.
- `crm-home.angeltreeservices.org` is a separate CNAME to the existing home
  scanner address. Its vhost shares the original Caddy listener; scanner,
  staging scanner and checkout routes remain intact. Seven scanner container IDs
  were preserved and their existing responses rechecked. The canonical CRM
  hostname has not changed routing.
- Retention serializes against head/pin changes, retains dependency closures,
  versions and audit rows, and meters transfers. A batch shares one catalog;
  retirement observations store a compact digest rather than duplicating the
  growing catalog for each retired component. Private production-authority
  maintenance was installed only on Recovery Rehearsal WAL.

### Credential gate — resolved October 29; final handoff still required

The bulk Netlify environment export contains masked production secrets. A
length-only presence check was insufficient. The copied private app/SMTP
configuration must not be treated as usable production configuration.

Netlify's Secrets Controller makes production values write-only outside its
runtime. Do not build an environment-dump endpoint or export protected values.
A private, expiring comparison-only draft was tested; it returns equality flags,
never values/hashes. Its unpublished context cannot see production-only values,
so its matches **do not establish production equality**. No candidate is
approved solely on that draft result.

Original scanner and customer-email worker setup credentials are retained in the
restricted October 21 activation workspace. Other already-held candidates need
independent cryptographic/provider checks. The already-held portal encryption
key now matches all 139 proposal and 41 invoice encrypted tokens and their stored
hashes; the calendar encryption key decrypts the single saved connection. No
plaintext was printed. The existing email-key candidate failed authentication
and is not approved. The original CRM live Stripe API key
and CRM signing secret were not found in the CRM/Website private files initially checked.
The newer Firewood-only key is a separate service credential and must not be
silently substituted. No existing key has been rotated or overwritten.

If the original CRM key cannot be recovered, the proposed addition is a separate
**CRM-only restricted live Stripe key**, retaining all existing keys. Scope it to
existing code: Checkout Sessions write; Payment Intents write (including cancel);
Confirmation Tokens, Charges, Refunds, Disputes, Balance/Balance Transactions and
Events read. No refund, payout, transfer, account-settings or key-management write
permission is needed. Retrieve the existing CRM endpoint signing secret privately;
do not rotate it or create another webhook endpoint. Verify equivalent permissions
in an isolated test environment and live account identity with read-only requests
before enabling the Mac. This is a credential decision, not authority to alter
payment behavior, replay events or charge customers.

The connected live account `acct_1Tv92EI7tY6VHUvU` was independently matched by
retrieving an existing CRM Checkout Session read-only. Its single existing live
CRM webhook is enabled at the canonical `/api/stripe/webhook` URL. Neither its
signing secret nor any new API key was obtained by that metadata check. The
owner subsequently approved the additional restricted CRM key and completed
Stripe's private passkey verification. The key was created in this matched CRM
account. Its approved write scope is Checkout Sessions and Payment Intents;
the other listed payment/recovery resources are read-only. Existing keys remain
active. The existing canonical webhook signing secret was retrieved privately
without rotation or a second endpoint.

The owner also approved a new CRM Resend key in the original account containing
the verified root sending domain. Resend offers sending-only or Full access;
Full access was explicitly approved because delivery recovery retrieves existing
messages, with its broader account-management capability disclosed. The old
sending key, separate Firewood account, sender and reply-to settings were preserved.

Nine Stripe checks passed using the runtime's Stripe SDK 22.3.2, including existing
Checkout/PaymentIntent/charge/balance data, event recovery and offline webhook
signature verification. Three email checks passed: original verified domain,
existing CRM delivery receipt and TLS SMTP authentication. The actual Mac guest
repeated the provider identity and SMTP checks successfully. No payment was
created/cancelled/refunded and no email was sent; SMTP issued no mail commands.
Live write permissions were checked against the approved form, not exercised on
a customer's payment.

The preserved portal keys were verified against 180 encrypted document tokens;
the calendar key decrypted its existing connection and its unchanged OAuth grant
refreshed successfully without calendar writes. Original scanner and worker
credentials were copied from retained private activation artifacts. Other
already-held settings were compared with visible production prefix/suffix
metadata; this comparison alone does not establish full secret equality. Five
known website origins passed read-only CORS checks and an unknown origin was denied.
The actual managed Auth redirect list was retrieved read-only and preserved.
New self-hosted Supabase keys and the canonical backend binding remain separate.

All secrets are in restricted private files outside Git. Previous local settings
were preserved. The refreshed native ARM64 runtime passed typecheck/build; stopped
application/Auth containers were recreated with the verified settings. No API
login was enabled, no application started, and the database container was retained.
Credential verification does not authorize admission by itself: the final managed
writer fence, fresh consistent snapshot, backup verification and single scheduler
handoff are still required before routing production to the Mac.

### Final closed-state verification

The final operations suite passed **185 tests, zero failures/skips**. An additional
startup/admission guard refuses the current `precopy-readonly` approval even if a
valid backup receipt exists. Admission and every subsequent lease renewal reread
the private handoff record and require the correct published release, database
and newer writer generation, managed API denial with no remaining API sessions,
the final snapshot/history checks, usable integration credentials and both
schedulers held. The actual private Mac pre-copy failed this gate as intended;
only its internal database is running. No completed handoff record was fabricated.

This operator record is an activation interlock, not independent proof that the
cloud was fenced. The cutover operator must obtain and retain the real fence and
drain evidence before writing it. It never replaces the signed backup receipt,
short database lease, HTTP admission or independent kernel deadline.

The temporary synthetic origin probe was stopped and its Caddy path removed via
graceful reload. All seven scanner container identities remain unchanged. The
separate inactive home-origin route remains prepared; scanner and staging-scanner
unauthenticated access still returns 401, checkout and the current CRM login
return 200. Production deploy `6adab6d33b9c3096a37ad0a1` is still current.

Recovery Rehearsal WAL is paused after its authority was disabled. CRM Staging
was resumed and its read-only profile matched exactly: 129 application entries,
15 reviewed maintenance entries, unchanged business policies and Auth guard,
disabled recovery authority and closed client permissions. No paid project or
production change was required.

### Capacity and final handoff gates

The reviewed file protocol currently bounds the complete file inventory to
512 files/64 MiB and each component to its reviewed transfer limits. The free
account transfer reservation and retention/catalog bounds are finite. Reaching
any bound closes writes; it must never silently skip a file or extend a permit.
The current production inventory is empty and fits, but expansion must be reviewed
before heavy photo/document use. There is no unlimited-storage or automatic
failover claim.

Before moving traffic: recheck free capacity and independent recovery; hold
all workers; positively fence/drain the managed writer; capture/import a fresh
consistent final snapshot; establish the Mac's certified backup/watch/deadline;
then publish the thin entry artifact. Release the single existing scheduler only
after payment/delivery reconciliation. Retain the managed recovery target and
all prior work. Resume CRM Staging after any approved free-project swap.

## October 29 — live single-primary handoff

The owner authorized resolving the remaining setup and moving the CRM after
verification. Canonical maintenance began at 13:52 UTC. The managed writer was
positively fenced/drained at 13:53; the final consistent copy matched at 13:55;
the Mac started behind a certified checkpoint at 13:57. Login returned HTTP 200,
the unauthenticated admin route redirected to login, and the owner subsequently
confirmed successful live dashboard sign-in.

| Component | Live state |
| --- | --- |
| Public CRM | `https://admin.angeltreeservices.org`, unchanged |
| Application and database | Home VM `ats-crm-primary-20261029`, native ARM64 |
| Production feature baseline | `8fa9df32`, 102 migrations, plus verified runtime/security transport |
| Runtime | Node 22.23.4; Next 16.4.3; React 19.2.9; PostgreSQL 17.11 |
| Netlify entry | `6ae35a9b14a56536ce2c9c1a`, published and locked |
| Independent verifier | `6ae352aab706fe4dd95b0bd2`, published and locked, Node 22.23.4 |
| Backup namespace | `ats-home-continuous-dbde68f901c7`, writer generation 2 |
| Recovery provider | Private encrypted objects and independent authority in `nbsvdzscgfpabbbdwlob` |
| Old managed project | `ddvlnixdugcbnrewktes`, original data retained, API writer fenced and project paused |

The final snapshot matched all **172 imported table row counts and row hashes**,
including all original user IDs, invoices, payments, delivery/provider IDs,
idempotency keys, document tokens and migration history. The original 265 business
function definitions, policies and relation privileges remained unchanged. Three
Auth users, 54 invoices, 40 payments and all 76 accepted delivery records were
preserved. The source private-file inventory was zero; no omitted object bytes
were silently treated as recovered.

Managed fencing preserved the original database ACL privately, retained only the
existing temporary maintenance login needed for the final export, revoked API
role/public CONNECT and terminated API sessions. Previously successful REST,
Auth-admin and Storage requests then failed, with **zero remaining API sessions**.
The final private handoff record was written only after this evidence and the
matching final import existed. No synthetic rehearsal was relabeled as a live
permit. The seven CRM services were started through the original admission,
14-second SQL lease, separate watchdog and independent kernel deadline.

The actual production backup loop has advanced beyond its first checkpoint using
the permanently published verifier. New checkpoints remain on a two-minute
schedule; a missed independent receipt closes admission rather than extending a
stale lease. Source configuration, private environment files, runtime sources,
database/WAL state and referenced file state are included in the encrypted
recovery chain. Neither the cloud service key nor signing private key is installed
on the home primary. The existing independent recovery/failure-drill evidence
above still applies; no destructive outage drill was run against live customers.

At 14:49 UTC the live source had **27 certified checkpoints**, all seven services
running and a current signed receipt. Strict proof-time validation rejected two
initial replies; the same immutable requests recovered approximately five seconds
later, preserving their original deadlines. The recovered error evidence remains
in the private operator logs. No clock/admission check was relaxed to hide it.

Payment/delivery reconciliation found **two legacy expired Stripe checkout links**
that were still labeled open locally. Each matched its original invoice, amount,
currency and provider identity; absent legacy reservation metadata was handled by
the existing closure routine's reviewed compatibility rules. That unmodified
routine verified expanded provider state and changed only each local checkout's
terminal status to expired, with compare-and-set protection. No provider expiry,
charge, cancellation, refund or email was issued. Records/history were retained.
There were no CRM Stripe events during the handoff window requiring replay and
no dispatching/unknown deliveries. A subsequent certified checkpoint includes
the reconciled statuses.

Only after reconciliation did the public worker gate and the five **existing**
scheduler entrypoints resume. No additional timer or manual customer send was
created. Originally unconfigured shared job/manager credentials remain
unconfigured; this handoff does not silently activate additional automations.
The deployment packager defaults to a held artifact; explicit release is bound
to the reviewed artifact and still requires the independent home worker gate.
The first per-deploy environment-based switch remained held in actual Netlify
scheduled invocations, despite the requested release. That issue was caught in
provider logs before any manual customer send. The replacement artifact's five
behavior tests cover default denial before credential access, explicit release,
the original canonical authenticated transport, foreign/staging/missing-credential
denials, preservation of exactly the five original scheduler entrypoints, and
an explicit `nodejs22.x` runtime on each timer. The platform default initially
selected Node 24.21.0; source-bound runtime selection corrected that without
changing account-wide settings. Actual 14:40 UTC invocations logged patched
Node 22.23.4. Calendar and health scheduler wrappers completed with HTTP 204;
their canonical Mac API calls returned HTTP 200. The optional shared-credential
job/manager timers remain unconfigured and reject dispatch, as before.
The full final operations suite passed **190 tests, zero failures/skips**.
Netlify's publication lock
was briefly released for the controlled scheduler-only publication, after checking
that no other production build was running, then reapplied to the new entry.
Future `main` pushes cannot silently replace this hosting entry.

Live checks confirmed existing Auth users via the canonical backend, private
business data denied to anonymous clients, successful allowed Website OPTIONS
requests and denial of an unknown origin. Scanner and staging-scanner endpoints
still require authentication. Website coordination confirmed no Website or
Firewood runtime directly depends on the old managed database beyond canonical
lead intake; Firewood contract/checkout-to-invoice work remains separate and is
not claimed as implemented or deployed here. Unreleased CRM feature worktrees
were preserved.

CRM Staging was restored after the old managed project paused. Its exact read-only
profile passed again: **129 original application migrations, 15 reviewed
maintenance entries**, unchanged permissions and closed lab-client access.
All 17 pending operational-work file hashes still match their pre-migration
record; none were overwritten or bundled into this production feature baseline.

### Capacity and operation after the move

The refreshed ATS Free usage dashboard showed 0.885/5 GB uncached egress,
0.404/5 GB cached egress and 0.037/1 GB average object storage. The private recovery
authority retains its 1.1 GB carry-forward reservation plus its metered new
traffic. Dashboard usage can lag by an hour; average storage is not a current
inventory measurement. The recovery project's measured object inventory was
28,080,313 bytes before the new live chain.

Netlify's existing Free Legacy plan includes 100 function GB-hours and 125,000
function calls. The account showed approximately 68 GB-hours and 162,000 calls
for October, with no API usage-exceeded flag; the reported call count already
exceeds the included figure and must not be treated as spare allowance. A
two-minute, three-request backup cycle projects 66,960 calls per 31 days before
retries/retention/other sites. Moving the CRM server off Netlify removes its old
serverless page/API workload, but this is a measured capacity decision, not a
guarantee of unlimited free operation. No card, paid service or plan was added.

The reviewed 512-file/64 MiB inventory bound, component limits, metered provider
budgets and retention bounds remain. Hitting a bound withholds the next receipt
and closes the writer. Expansion requires review before heavy attachment use.
Keep the home Mac plugged in with its lid open. FileVault remains enabled, so a
cold reboot requires owner unlock. After a fence or restart, recovery/re-admission
is controlled by an operator; there is no automatic cloud promotion or automatic
replay of uncertain emails/payments. Cloud recovery must reconcile provider
activity after its restore point before customer sending or financial operations
resume. Existing provider keys were retained, as authorized; no existing key was
rotated or deleted.

Local capture/operator evidence is also retained. At checkpoint 27 it occupied
275,700 KiB and the guest had 51,680,028 KiB free. Cloud retirement does not prune
those local files. A reviewed local evidence-retention routine remains a follow-up
before long unattended operation; do not assume that a finite disk can grow
without maintenance. No historical evidence was deleted during this handoff.
