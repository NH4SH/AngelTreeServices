# Home CRM failover verification — October 27, 2026

## Engineering decision

The matched **production-feature, 102-migration** candidate can be recovered into
both an isolated native Supabase stack and a clean managed Supabase project.
Actual Auth login, financial retry protection, retained delivery outcomes and
private-file serving passed. The controlled rehearsal positively stopped the old
writer before authorizing the recovered native writer.

**This is not authorization to move production, and the ongoing five-minute
data-loss limit is not yet guaranteed.** The next implementation is an unattended
paired-backup and write-admission rehearsal under scanner load, including backup
failure/network-loss tests. A successful one-off backup does not establish that
the system will keep backing up every two minutes.

No production application, database, credentials, DNS, routing, scheduler or
scanner configuration was changed. No real customer message or payment was sent.
No commit or push was made. The pending materials lookup work was preserved.

## What was tested

| Area | Result and scope |
| --- | --- |
| Old writer fencing | All seven candidate services stopped with restart policy `no`; all nonoperator DB login roles disabled; no surviving nonoperator sessions |
| Transaction boundary | A real transaction inserted a row, explicitly evaluated deferred constraints early, then slept. Fencing terminated it and the insert rolled back |
| Paired source capture | Database, Auth, business grants/RLS/functions, source/config, payment/email history and three physical private files captured while fenced |
| Offsite readback | Encrypted Restic repository uploaded to private staging Storage, downloaded independently, checked and restored; anonymous/public retrieval denied |
| Native full restore | All 177 captured table fingerprints, RLS and table permissions matched; all three file digests matched |
| Native runtime | Seven actual HTTP check groups passed, including GoTrue password login, SSR cookie/Bearer CRM access and the Next ranged private-file route |
| Managed restore | 157 selected table fingerprints / 291 rows matched before runtime tests; all restored foreign keys checked; 138 business tables and 294 policies retained |
| Managed permissions | Table ACL, function ACL and policy fingerprints matched the existing production catalog after fresh-project privilege reconciliation; normalized function bodies matched |
| Managed runtime | Eight core check groups passed against managed Auth, REST/RPC and Storage; a full managed-backed Next preview was not launched |
| Offline regression checks | 25 passing tests for recovery policy, signed admission/fencing, effective grants and client-side COPY conversion; 24 scripts passed syntax checks |

The source feature release remains `8fa9df32c95a2e6d6a72c77422391ae7b9ca7528`,
with the separately verified runtime security overlay from
`06580f6c922fa6ab0ebaf229d27b1d30097f1b78`, Next 16.4.3,
React 19.2.9 and Node 22.23.4. Main's additional unreleased migrations were not
silently included. The working branch remains based on main
`36d90bbeb003643cd24acf4318aa73d676568dbe`.

## Fencing and admission findings

The prior deferred database guard alone is insufficient: a client can evaluate
deferred constraints before a lease expires and keep its transaction open.
The rehearsal does not hide that finding. Controlled recovery instead requires a
positive hard-fence receipt: drain/terminate writers, disable API logins, stop all
app/Auth/REST/Storage services and prevent automatic restart. Merely losing SSH,
changing DNS or seeing an expired timestamp is not sufficient evidence.

The source was fenced at `2026-10-27T17:00:10.974Z`, generation 7. Its old
services stayed stopped while the clone was restored. The independently held
Ed25519 authority issued a one-use **rehearsal-only** generation-8 permit bound to
the exact namespace, challenge, source snapshot and recovered container identity.
Tampered, stale, foreign-target, foreign-signer and reused/old-generation
conditions are covered by rejection tests. This authority is not installed as a
production service or production failover controller.

A deliberately stale admission baseline was rejected before a permit was issued.
A genuinely new paired capture of the still-fenced recovered state was then
uploaded and read back. Its capture started at `17:35:36.314Z`; the permit was
consumed at `17:37:36.260Z`. Uploading an old capture with a new timestamp was not
used to reset freshness. The recovered test writer was finally fenced again.

The original and recovered native stacks ended with all **14 containers stopped**
and no automatic restart. All synthetic source/recovered users were retired.
Both CRM VMs were stopped; the scanner VM remained running with its original
driver PID 1192 and unchanged Lima configuration digest
`804d0864c4e16c8b653e9f837ea923038f28d901a6bbd6353886a1fecb60a709`.

## Native and managed runtime results

The restored password authenticated the original user UUID. Replaying the original
manual-payment request returned its existing payment ID, retained exactly one
payment and left the invoice balance at zero. Accepted and uncertain outbound
deliveries could not be claimed again; their states and attempt counts stayed
unchanged. No email provider or payment provider credentials were installed in
the recovered test runtimes.

Authorized downloads returned the exact private bytes. Anonymous and public URL
downloads were denied. Disabling the restored employee/profile revoked private
file access for an already-issued token. On the native clone, the real CRM
cookie/Bearer endpoints and Next private-file range response also passed.

The orchestration SSH response was interrupted after the native run. The durable
success report and stopped-service state were read back rather than replaying the
test operations. This prevented a connection failure from triggering duplicate
business actions.

## Managed Supabase compatibility

The free clean project is **CRM Recovery Rehearsal**,
`axopsuifavowlrywfelh`, ATS organization, us-east-2. Only synthetic records and
synthetic file bytes were imported. It was created under the owner's $0-only
authorization and is retained paused after testing. No paid service was enabled.

The original 102 migration sources were applied in 11 recorded batches, followed
by source-catalog permission/default reconciliation. Fresh project defaults were
broader than the existing database. Replaying schema migrations alone would
therefore have failed the permission comparison. The reviewed maintenance RLS
event trigger was also restored with the managed `postgres` owner; the native
image's special `supabase_admin` ownership was not copied blindly.

Matched catalog fingerprints:

- Policies: `89341afb03e560b9610716ddee0068d3`
- Table ACLs: `e1b1a738e306c358233c31bd2a2b1ae1`
- Function ACLs: `9166eb8e3c678291b216dcaae3db0dd5`
- Normalized function bodies: `563dfb25952aaf15d0d4996c7806ab62`

The native restore exposed one equivalent PostgreSQL ACL representation:
`prevent_inactive_lead_conversion()` had an explicit default ACL in the source
and an implicit default ACL after restore. Comparison now checks effective
grantor/grantee/privilege/grantability plus owner and definition. It continues to
reject changed bodies, owners, grants, table permissions, RLS or data; it does
not waive a permission mismatch.

The COPY converter also verifies multibyte UTF-8 names, escaped delimiters,
literal backslashes, SQL quoting and malformed input. Its final output was
compared with the actual verified import, with no differences across the 157
selected tables.

Managed Auth/Storage service migration ledgers were preserved. Empty native-only
Iceberg tables and the rehearsal's guard/fixture objects were not imported into
the managed application schema. The encrypted original archive retains the
original 102-entry application ledger; the test project's batch ledger and source
file hashes are recorded separately. This is not an in-place overwrite of the
production or staging ledger.

Original user IDs, password hashes, identities, bans and business authorization
records were restored. Old Auth sessions, refresh/one-time tokens and transient
login challenges were deliberately excluded across issuers: users must sign in
again. Business and service audit history was retained.

Files were restored through the managed Storage upload API, then read back and
hashed. Original owner identity was reconciled and checked. Managed object IDs
and versions are new; an explicit source-to-target mapping is retained. Original
business document IDs and scan audit records remained intact. The three restored
platform documents passed their existing private-file policies without forging
new clean scan verdicts. A future restore of other attachment areas must also
reconcile their object-version-bound scan records; this limited fixture does not
prove that mapping for every attachment type.

Public Auth signup was disabled and a private no-send hook activated before using
the restored credentials. Configuration readback, hook SQL return value and
effective Auth-role execution grants were checked. The HTTP password-recovery
probe returned **email rate limit exceeded before hook execution**, so its
end-to-end hook path remains unverified in this new project. The managed role
also refused `SET ROLE supabase_auth_admin`; no role membership was widened to
bypass that boundary. These limits are recorded separately from the eight
passing core recovery checks.

## Temporary staging swap

The owner explicitly authorized temporarily pausing CRM Staging to free the
second active free-project slot, testing the clean recovery project, pausing it
and resuming staging. Neither project was deleted and no staging migration/data
restore was performed. The pre-pause baseline was recorded privately for
post-resume comparison: 129 migrations, 49 Auth users, 28 Storage objects,
65,871,173 stored bytes, 149 business tables and 303 policies. Automatic sending
was disabled and the existing Auth email guard/configuration was retained.

Final resume/readback evidence is recorded in
`home-crm-failover/staging-swap-final.json` in the private evidence directory.
The swap completed: CRM Staging returned **ACTIVE_HEALTHY** and CRM Recovery
Rehearsal is **INACTIVE**. All recorded migration/count/byte totals and the guard
definition matched the pre-pause baseline. The complete pulled configuration
also matched, including the enabled private Auth email hook. The staging
Postgres version remained `17.11.0.003`. No project was deleted.

Final read-only production checks still showed Netlify deploy
`6adab6d33b9c3096a37ad0a1` and the original 102-migration production ledger
(`46394436fcbf2f2d7d516b69c84a45af`). Both scanner bridges reported healthy;
their existing five-hour uptimes were retained. A fresh main fetch showed zero
commits ahead/behind, and all 17 pending operational lookup file hashes matched.

## Remaining cutover gates

1. Implement and soak-test the two-minute paired offsite backup cadence and a
   write-admission gate that closes before backup age exceeds five minutes.
   Exercise network loss, failed/partial uploads, slow captures, in-flight HTTP
   work and provider uncertainty while the scanner remains healthy. Briefly
   stopping the full stack for each rehearsal capture is not a production backup
   schedule.
2. Integrate the production external generation/lease authority and all browser,
   mobile, website, Auth, Storage, webhook and scheduler writers. Prove that a
   returning stale Mac and old cloud credentials cannot produce two writers.
3. Test supported recovery into the intended long-lived standby, matched Next
   runtime, public HTTPS/canonical routing and manual promotion/rollback. This
   clean synthetic project does not authorize overwriting either existing cloud
   database. Reconcile possible lost-window Stripe/Resend effects before releasing
   dispatchers; synthetic retained outcomes do not query real provider records.
4. Complete unattended power/sleep, FileVault unlock, monitoring, sustained
   resource capacity and a timed recovery drill. Five minutes is the accepted
   lost-work limit, not a recovery-time guarantee. Check actual backup/egress
   capacity and retention against the existing free allowance.

Private evidence (including encrypted repositories, private fixture credentials,
restore mappings and raw results) is in
`/Users/noelsierra/Documents/Codex/2026-10-27/home-crm-failover` (0700). No private
keys, passwords, plaintext dumps or provider credentials belong in Git.
