# Current production CRM: verified backup repair and safe restoration

Completed October 29, 2026, at 9:57 p.m. EDT / October 30, 01:57 UTC. The owner explicitly approved **“Repair backups and restore the current live CRM.”** The existing CRM and automatic dispatch behavior are restored. Firewood v2 remains absent from production.

## Preserved release and services

- Existing feature source: `8fa9df32c95a2e6d6a72c77422391ae7b9ca7528`, **102 migrations**.
- Existing security/home-host build: **Node 22.23.4, Next 16.4.3, React 19.2.9**. The same six app/API/Auth/REST/Storage/imgproxy container IDs, immutable images and complete configurations were verified unchanged before and after starting them.
- The same physical PostgreSQL database was retained. All business row/catalog fingerprints matched before access was restored. No database import, data reset, financial correction, feature migration, key rotation or application deployment occurred.
- The scanner, VPN, DNS/router setup, existing provider credentials and existing customer-worker schedules were preserved.
- Supabase remains the recovery service. Manual failover and one writable primary remain required; the old managed writer was not reopened.

## Incident and narrow repair

At 22:31:25 UTC on October 29, the independent backup deadline deliberately stopped the primary stack after the next backup failed. Docker recorded `OOMKilled=false`. An empty file-list archive utility was stuck reading its interactive Docker input. The outer operation stopped, leaving the old `capture.lock` and utility behind; retries could not obtain that lock. The protection correctly withheld further writes.

Four backup-operation files were repaired with exact deployed preimages and preserved originals:

1. `referenced-object-files.mjs` uses a bounded archive helper.
2. `bounded-file-archive.mjs` produces a valid empty tar without starting Docker; nonempty lists use a private read-only file mount. Named utilities have per-attempt ownership labels and may be stopped only after exact identity/mount checks.
3. `native-online-candidate.mjs` obtains its owned lock before moving artifacts and covers all subsequent setup with cleanup.
4. `capture-attempt-lock.mjs` independently attempts rollback/HBA restoration and retains the lock whenever utility or database cleanup is unconfirmed. An explicit error marker propagates that condition through the producer.

Twenty-one focused/existing safety tests passed. An actual rootless Node 22.23.4 rehearsal verified 20 empty archives, a byte-exact nonempty archive and cleanup of a genuinely blocked reader. Only the new synthetic fixtures were removed. Old production lock 257, failed artifacts, original helper versions and old cloud registration/history were retained. The exact legacy orphan was retired after its ID, immutable image, command, user, creation time, read-only mount and network boundary were verified.

The source helper closure is now **54 files**, including the two new helpers. Future hosting or release exports must include this corrected closure. The reviewed package and hashes are in `recovery/backup-fix-source/BACKUP_FIX_MANIFEST.json`; the hosting worktree's older 52-file closure must not be used to reconstruct this repaired runtime.

## Controlled restoration

Only the existing database was started first. Backend logins and sessions were held closed; the old lease was expired and capture maintenance remained enabled. The original HBA was restored only after matching the exact known temporary replication prefix and the retained complete-checkpoint hash. The inactive, owned old physical replication slot was recorded and retired; the stopped old receiver and all historical backups were preserved.

The changed database boot required a new immutable registration:

| Binding | Verified value |
| --- | --- |
| Namespace | `ats-home-continuous-7445a45dddd9` |
| Writer generation | 3 |
| Source migration count | 102 |
| Binding SHA-256, compact JSON | `f3b0b15b2a179cf1653b3bfc17c5bdc7e982f3fa6c231472149bc5bd51bcf35f` |
| Private recovery bucket | `crm-native-home-7445a45dddd9` |

The parent registered this source on the existing recovery project, carried forward account-wide storage/transfer reservations and disabled the exact old registration without resetting its 256-checkpoint history. A separate backup-only Netlify draft used the unchanged verifier library and existing credentials with the new namespace; the published CRM application and existing published verifier were not replaced. No paid project or new provider credential was created.

A fresh full checkpoint was captured and independently verified before requesting admission. The independent timer, watchdog and automatic two-minute backup loop ran while the database hold still prevented backend logins. Automatic sequences 2 and 3 both verified complete chains and all new bytes. The hold was then released, restoring only the three previously approved backend roles: `authenticator`, `supabase_auth_admin` and `supabase_storage_admin`. The same existing app services were started; customer workers remained held until the separate payment/email checks passed.

The first host script installed the helper files before issuing its explicit old-unit stop command, after prior read-only evidence had shown failed units and no Node producer. Explicit post-stop MainPIDs were zero. The retained recovery script was corrected to stop/assert those old units before replacement in any future use. No active producer was observed during replacement.

## Payments and customer email safety

The one pending live bank payment was independently read inside the primary VM using its existing restricted production key. Its Checkout Session, PaymentIntent and bank charge matched the exact invoice/reservation, currency and amounts. Stripe still reports **processing / pending**, matching the CRM. It requires no forced correction, replacement charge or financial retry.

Direct Account Read remains denied with HTTP 403. Account ownership was bound through the unchanged original production credential fingerprint and its previously verified production Checkout reference; the sandbox account was excluded. No key scope was broadened, and no key or raw provider response was copied to development or QA. Private exact-object evidence remains in the VM incident directory.

Before restoring the worker gate, all **79 accepted deliveries, 1 cancelled delivery and 82 idempotency aliases** matched their original full fingerprints. The gate was then published for the new namespace/generation using the existing dispatch authorization mechanism. No worker configuration or schedule changed. The checks did not supply any valid worker secret or invoke a processor:

| Readiness probe | Result |
| --- | --- |
| Communications GET | 405, method enforcement retained |
| Communications POST without credentials | 401 |
| Notifications POST without credentials | 401 |

After another automatic backup, all original delivery/provider/business identities and alias mappings remained unchanged: **zero duplicate provider messages, zero new delivery records, zero new aliases**. No manual email, charge, confirmation, refund or financial-recovery command was executed. Ordinary future scheduled work resumes through the existing authorization and deduplication rules.

## Final live verification

| Check | Actual result |
| --- | --- |
| Public login and HTML renderer | 200 |
| Public live-health endpoint | 200, independently checked from development |
| Backend Auth health | 200 with the existing public anon API key; a no-key request correctly returned 401 |
| Anonymous admin request | 307 to sign-in |
| Firewood v2 production tables | Absent |
| Automatic backup after app restoration | Verified sequence 7 and later |
| Automatic backup after worker restoration | Verified **sequence 11** |
| Sequence 11 capture start | `2026-10-30T01:56:39.794Z` |
| Sequence 11 receipt expiry | `2026-10-30T02:01:19.794Z` |
| Independent timer | `ats-home-deadline-7445a45dddd9-11`, active |
| Watchdog and backup loop | Active |
| Old failed history and lock | Preserved |

One admission briefly failed the existing strict proof-time check: its signed `issuedAt` was 21 ms ahead of the local clock. The same immutable admission automatically succeeded five seconds later; later sequences also succeeded. The historical error is preserved and distinguished from current successful heartbeats. No clock setting, receipt deadline, signature check or security rule was relaxed.

A subsequent check at **02:02:39 UTC** verified signed sequence **13** (capture `02:00:40.609Z`, expiry `02:05:20.609Z`), with timer/watch/loop all active, the generation-3 worker gate restored and no fence latch. Development-side public login and live-health checks both remained HTTP 200.

Safe copied proof files are under `/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/recovery/current-live-safe-proofs/`. The complete private incident evidence remains in the primary VM at `/home/noelsierra.guest/primary/backup-incident-7445a45dddd9/`. Raw container configuration, private provider identities and credentials remain there. This current-production repair is separate from the newer synthetic Firewood staging/recovery checkpoints and the unreleased focused feature backport.
