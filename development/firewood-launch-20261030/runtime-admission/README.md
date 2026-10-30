# Local release admission reader

This is local, unwired source. It installs no descriptor, supplier, role, service or app route. The existing CRM and Website runtime getters remain closed. No production, staging, provider or database was changed by this work.

`released-context.mjs` is the only production entry. `readReleasedContext(mode)` synchronously returns frozen public provenance or `null`. `createReleasedDependenciesFactory(mode, privateSupplier)` returns a synchronous getter. Its trusted, side-effect-free supplier returns the direct private dependencies object `{config, db, ...}`. It is called only after a fresh gate succeeds; that same object's `config` must match the attested integration HMAC key ID and SHA256 of the literal UTF-8 secret, plus the fixed live identities. A second fresh gate read must agree before any dependencies are returned. No valid context or dependencies are cached. `getReleasedDependencies()` remains `null` because no supplier is installed.

The production entry accepts no path, filesystem, clock, public key, namespace, environment or synthetic bypass overrides. It reads only the fixed Linux process paths and requires app UID1000. Internal pure modules support the separate unit tests. The VM linker and generated signing key exist only in test files and must be excluded from runtime packaging.

## Two separate gates

The master gate reuses exact copied helpers from the corrected 54-file recovery source. All six helper copies match their original pins. The original signed native-WAL receipt format is unchanged. The current namespace `ats-home-continuous-7445a45dddd9` and generation3 cannot release this feature. A new actual namespace and generation above3 are required.

The root publisher must independently verify the installed source, all ten private table enrollments, ACLs, actual schema fingerprint and topology, recovery authority and integration secret custody before publishing a descriptor. The descriptor is root control metadata, not a new recovery certificate. It does not grant SQL privileges, create an independent authority, or prove a five-minute recovery chain by itself.

The reader also requires the actual signed master envelope, exact raw binding bytes, source/boot/database/topology match, safe wall/monotonic clocks, the 280-second capture deadline, no fence latch and a matching workers-release marker confirming provider reconciliation. Its public context deliberately has no `admitted:true` and no fabricated recovery-authority UUID.

Every real request/worker transaction must additionally verify the native SQL guard at BEGIN and immediately before COMMIT, using a genuine permitted native SESSION_USER. Operator sessions using only SET ROLE do not prove this boundary because the existing guard bypasses postgres/supabase_admin SESSION_USER. Combine actual SQL facts with this public context; compare database/SID, boot, topology, epoch/holder and capture facts. Cap the final callback's deadline to the shorter actual native lease and the master receipt, and to the Website adapter's maximum14-second window. No signed envelope or root descriptor substitutes for that fence.

## Filesystem contract

The descriptor is `/release-admission/firewood-release.json`, UID0, exact mode0444, on a read-only mount. The five public admission files under `/admission` must likewise be root-owned regular mode0444 files on a read-only mount. Root-owned parent directories cannot be writable by group or other users. Symlinks, hard links, nonregular files, oversize reads, permission failures, changed snapshots and a newly appearing fence all close the gate. `/proc/<actual pid>/mountinfo` is read with its legitimate process UID1000 ownership, not mistaken for a root-owned file. Mount validation uses the deepest matching component boundary and VFS `ro` flag, allowing normal read-only bind mounts whose underlying superblock remains writable.

The reader does not create these mounts or change permissions. Actual Linux readback of the final mounts remains an installation prerequisite; local positive filesystem tests use faithful in-process metadata fixtures. Negative tests also reject real temporary symlinks and user-owned files without changing fixed OS paths.

## Root-only descriptor fields

The descriptor has an exact key set, defined in `released-context-core.mjs`. No example active descriptor is shipped.

| Fields | Required meaning |
| --- | --- |
| `kind` | `ats-firewood-release-control-v1`; root control metadata only |
| `bindingSha256` | SHA256 of the exact published `/admission/binding.json` bytes, including whitespace |
| `namespace`, `generation` | Exact future master identity; different from the current namespace and generation above3 |
| `sourceId`, `sourceScope`, `sourceEnvironment`, `sourceMigrationCount`, `captureMode`, `privateFileFormat`, `admissionProtocol` | Exact existing production binding fields; immutable102 business baseline and patch-v1 native-WAL protocol |
| `systemIdentifier`, `sourceBoot`, `databaseBoot`, `topologyFingerprint`, `timeline` | Exact actual binding facts; topology is the guard's existing32-hex MD5 identity, not the independent schema SHA256 |
| `authorityPublicKeyFingerprint` | SHA256 of actual Ed25519 SPKI DER from `/admission/authority-public.pem` |
| `schemaSha256` | Root's independently computed actual catalog/schema fingerprint; the reader verifies root custody, format and unchanged attestation, not a new SQL-derived schema claim |
| `releaseComponentDigest` | Root's static final operative source artifact digest, exposed as public `releaseSha256`; distinct from the rotating signed backup `componentSha256` |
| `installationOverlaySha256` | Mandatory SHA256 of the independently registered immutable installation overlay; exact match with the actual signed binding's same field and the approved source-approval identity |
| `baseRecoverySourceManifestSha256` | Exact preserved corrected54 manifest `bceb09357e4815948b6e1a8372880fe8ae4b3e078ab365d119467d6b445d0efa` |
| `signingKeyId`, `signingKeyFingerprint` | Private integration HMAC key identity and SHA256 of its literal UTF-8 value; no private value in the descriptor or public context |
| `stripeKeyFingerprint` | Separate SHA256 pin for the approved CRM restricted live Stripe key, privately verified with the fixed account at installation; a key prefix alone cannot establish custody |
| `modes` | Exact explicit booleans for status/preparation/office/collection/sending; status and the requested mode must both be true |
| `contract`, `officeContract`, `source`, `environment`, `account`, `portalOrigin`, `websiteOrigin`, `termsHash`, `paymentPolicyHash` | Exact code-pinned live Website/CRM contract identities; no environment can override them |

Public provenance includes `bindingSha256` and `authorityPublicKeyFingerprint` separately. The Website callback maps its `recoveryBindingSha256` to the former. There is no recoveryAuthorityId alias and no invented UUID. `backupAgeMs` is the ceiling of actual source uptime minus the signed capture monotonic start, bounded from0 to below280000. `observedMonotonicMs` records that uptime. The public `expiresAtMs` is capped to the earlier of the signed receipt wall expiry and its remaining actual monotonic deadline; `receiptExpiresAtMs` retains the signed wall deadline separately.

Public provenance also exposes the separate `stripeKeyFingerprint`. The actual collector must compare SHA256 of its privately loaded `STRIPE_SECRET_KEY.trim()` against this exact root pin before each provider effect, and use the already verified fixed account. A configuration field or an `rk_live_` prefix is not that verification. Handoff-only dependencies do not need a Stripe credential; if their configuration advertises a Stripe pin it must match. This local work reads no Stripe key and creates no actual fingerprint descriptor.

`installationOverlaySha256` is mandatory in both the root descriptor and the actual signed master binding. The source scope remains `crm-v1` and source migration count102; the overlay does not claim the main migration chain was installed. Before publishing any root control file, the root publisher/controller/authority must independently compare the overlay document and registered source-approval digest. Merely adding a plausible extra field to signed claims is insufficient. The actual approved overlay digest is currently UNBOUND; no real descriptor or binding is produced here. Missing, placeholder, invalid or mismatched overlay identities keep the gate closed. The old96-test local stage is preserved under `history/pre-overlay-96-tests/` as historical review evidence, never operative source or admission authority.

## Verification

Run locally with Node22:

```sh
node --experimental-vm-modules --test released-context.test.mjs released-factory.test.mjs
```

The VM flag is for the test-only linker; the production reader requires no VM feature. Tests exercise real Ed25519 signing/verification with a newly generated synthetic key, expiry and clock rollback, exact bindings, off modes, changed source/schema/release/key, worker reconciliation, latch races, read-only ownership/mount boundaries and dependency freshness. See `LOCAL_TEST_PROOF.json` and `RUNTIME_SOURCE_MANIFEST.json` for the exact checked local files. These files do not certify installation, actual recovery capacity or production admission.
