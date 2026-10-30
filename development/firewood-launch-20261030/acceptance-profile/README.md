# Firewood acceptance derivation

Local source derivation and consistency review only. Nothing here installs a database or runtime, creates a provider client, reads credentials, sends a message, collects/refunds money, or activates a source. The production descriptor and default acceptance descriptor are unbound. The prior expected sandbox account remains **UNVERIFIED** until root independently reads the actual sandbox key/account/mode.

The fixed production identity is office-live-v2 plus the financial live-v1 source/environment/account. The acceptance identity has separate contracts, source/environment/account, SQL/RPC/advisory namespace, signed paths and HMAC domains. Accepted business terms, payment policy, amounts, accounting math, authorization and original financial branches remain exact frozen-source derivations.

## Files

- `profiles.mjs`: immutable production/unbound acceptance descriptors, fixture-only descriptor, and pure consistency validators. No ambient environment or credential loading. Matching observations never make a descriptor provider-ready or runtime-loadable.
- `SOURCE_LOCK.json`: twenty complete frozen input hashes, exact identity-only literal counts and byte positions. Its own hash is pinned in the derivation module.
- `derive.mjs`: deterministic owned-directory emission, per-span allowlist, byte-exact inverse reconstruction and verification. It refuses changed source bytes, unknown identities, output overwrite, rewritten manifests and unbound SQL envelopes.
- `artifacts-hermetic-v1/`: twenty derived/copied inputs plus the fixture-only descriptor. SQL is explicitly review text (`.review-only.txt`); it has no actual target binding or execution authority. Origins ending `.invalid` exist only in these hermetic fixtures.
- `acceptance-profile.test.mjs`: seventeen focused local tests. `test-runs/` contains **synthetic binding fixtures only**, not real account, database, operator-approval or admission evidence.
- `DERIVATION_PROOF.json`: exact module/source/artifact/test digests and limitations.

## Root integration contract

Root owns actual database creation, operator origin approval, account/key readback, registered admission, source enrollment, runtime construction and all production/provider actions.

The actual acceptance database must be separate and owned, named `ats_firewood_acceptance_<12 lowercase hex>`, with exact OID/system identifier and UUID marker. Its database comment is `ats-firewood-acceptance-v1:<marker>:synthetic-only`. A single root-owned registry row in `ats_firewood_acceptance_meta.target` records `marker_uuid`, `purpose`, `schema_fingerprint`, `release_digest` and `admission_binding_id`. The purpose is exactly `ats-firewood-acceptance-v1`.

`bindAcceptanceReviewDescriptor()` requires matching expected/observed database identities; separately approved actual HTTPS origins and the fixed acceptance path prefixes; fresh exact sandbox account/test-mode readback; and the registered fresh admission observation. Evidence contains only identities, timestamps and proof digests, never credential values. These pure checks cannot authenticate an observation's provenance; root must establish that privately. The `.invalid` fixture cannot become provider-ready through this module.

A bound review derivation adds an identity precondition before each of the six SQL units. Root must execute each precondition plus its reviewed body on one pinned connection, keeping existing transaction boundaries. The guard checks literal database name/OID/system identifier/comment, registry purpose/marker and schema/release/admission binding. All rendered SQL remains `.txt` without execution authority. Do not bypass the guards by separately executing the unguarded review body. Before execution, independently verify the trusted `DERIVATION_MANIFEST.json` SHA-256 supplied by the derivation result; use `verifyDerivedArtifact(path, {expectedManifestSha256})`.

The acceptance namespace **must never install or coexist in production**. The reviewed accounting SQL still dispatches through the original102 shared financial function names. Separate object names alone do not make coexistence safe. No production identifiers or customer data may enter the QA database.

The emitted immutable legacy helper files (`handler`, `contract`, `settlement`, `staging-profile`) are retained solely for the existing capability crypto/cash-reducer import closure. Their frozen sandbox/staging routes are not acceptance routes. This artifact emits no route, transport, runtime factory or installer; root must expose only the separately guarded acceptance entrypoints.

## Local commands

Use the pinned Node22 runtime:

```
/Users/noelsierra/.local/opt/node-v22.23.4-darwin-arm64/bin/node --test acceptance-profile.test.mjs
```

A fresh hermetic artifact may be derived only into a new child directory of this folder:

```
/Users/noelsierra/.local/opt/node-v22.23.4-darwin-arm64/bin/node derive.mjs --hermetic-output <fresh-owned-child-directory>
```

There is no CLI command for provider binding, database installation or activation.
