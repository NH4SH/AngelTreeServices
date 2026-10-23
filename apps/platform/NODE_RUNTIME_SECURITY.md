# Node runtime security preparation

October 23, 2026. **Local remediation is verified. Hosted security activation is blocked by Netlify's observed managed patch level. Nothing was deployed to business production and no key was rotated.**

## Scope and preservation

`codex/runtime-security-fix` starts from the exact published dashboard hotfix `8fa9df32c95a2e6d6a72c77422391ae7b9ca7528`. Staging and prepared release artifacts use `088f6e56ea953d764bb32bcdd6e60a7878ea76b6`. The earlier Node22 compiled synthetic export is `39f53a7`, with identical application source; `088f6e5` adds only local dev/start guards. Subsequent receipt-verification scripts and this report do not change that application code. The separate unreleased CRM branch remains at `3f12f24`, including proposal expiry, migration-117 reconciliation and the local migration-118 terms work. No business/UI/schema source paths were changed in this security branch.

No financial command, role, RLS policy, key, customer document, automatic-email setting, schedule, database migration or production configuration was altered. Dependency versions are identical to the published baseline; lockfile edits add only Node engine requirements.

## Implemented locally

- Root/application `.node-version`, Netlify build pin and staging export use Node **22.23.4**. The existing CI lanes use **22.23.4** and **24.22.1**, retaining their previous npm versions. Package engines allow patched releases in those two tested major lines.
- CRM `dev`, `build` and `start` refuse affected/unsupported local runtimes before starting work. The official Apple Silicon binaries were installed into separate versioned directories and their SHA-256 digests matched the official release checksums. Global Node/PATH and the other business's CLI account selection are unchanged.
- Next server startup and the existing shared five-worker wrapper log a small, once-per-process runtime record. It contains a fixed component label, advisory/version/verdict, architecture/platform and an optional validated deploy ID. No request data, credential or environment dump is logged. Logging failure does not interrupt or replay business work. There is no new public diagnostic endpoint; public liveness is unchanged.
- `scripts/release/verify-node-runtime-evidence.mjs` rejects wrong/stale receipts, missing functions, artifact/deployment runtime mismatches and unpatched actual versions. Production requires evidence for all six functions; staging requires its single server handler. It recalculates the verdict rather than trusting a supplied `patched` flag. This is read-only consistency checking of externally collected authenticated metadata/logs, not cryptographic proof of a receipt's provenance.
- The scanner bridge Dockerfile pins official `node:22.23.4-bookworm-slim` at manifest digest `sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d`. The replacement image was built/tested only on the existing local disposable Docker host. The home production scanner/VM was not changed.

Use the versioned Node installation for this CRM, for example:

```sh
export PATH="$HOME/.local/opt/node-v22.23.4-darwin-arm64/bin:$PATH"
node --version
npm run dev
```

Run those commands from `apps/platform`. There is no need to replace the global runtime used by another project.

## Verification

| Check | Result |
| --- | --- |
| Published-baseline CRM suite on Node 22.23.4 | 2,210 passed; zero failed/skipped |
| Same suite on Node 24.22.1 | 2,210 passed; zero failed/skipped |
| Route types, TypeScript and optimized Next builds on both lanes | Passed |
| Affected local Node refuses build/dev | Passed |
| Actual benign Brotli round trips | Passed on both Mac runtimes and Linux scanner image; no exploit corpus used |
| Compiled synthetic local staging/perimeter acceptance | Eight scenarios passed; no outbound attempts; server stopped |
| Native staging command regression | 30 assertions passed; all synthetic data rolled back |
| Hosted staging gate/app/asset/worker-denial/document-recovery checks | Seven groups passed |
| Schema contract and original migration fingerprints | Passed; no schema source edits |
| Final staging database preservation | Exact 117 ledger, 5,103 catalog objects, 49 protected data sets, permissions, guard and OFF settings unchanged |
| Actual hosted runtime security | **FAILED: Node 22.23.2; fixed floor is 22.23.4** |

The smaller test count relative to unreleased-main reports is intentional: this branch tests the published baseline without importing later features. Runtime-specific and release-receipt regressions are included. The original five worker schedules are retained in the locally prepared six-function release artifact; the staging artifact selects zero scheduled functions. Staging tests never invoked authenticated mutation workers, sent emails, requested Auth emails or triggered real payments.

## Staging discovery and current state

Assigned site: `d81d923d-6ccf-4c1e-87cc-263f3d51555d`; database: `gbyhdsuiqeslgjdnbqng`. Latest staging deploy: **`6adb68aaafaed79557bf7051`**, hosted server `nodejs22.x`, region `us-east-2`. An actual execution record reports **`v22.23.2`** (Linux/x64), so the security gate correctly refuses approval. Earlier staging deploys `6adb5efcf192caed5479c688` and `6adb665889384965ed442a33` selected `nodejs24.x` and executed **`v24.21.0`**, also below that line's fixed 24.22.1 release.

The first uploads exposed a reproducible manual-deployment hazard in installed Netlify CLI 27.14.2. Its function manifest cache expires after two minutes (`utils/deploy/hash-fns.js`). A later `--no-build` upload can repackage functions, resolving its runtime from the default `dev` environment (`utils/env/index.js` and `lib/functions/config.js`). `--prod` selects the published URL, not that environment context. A production-context-only runtime pin therefore did not protect this path. The hosted metadata correctly showed Node24 even though the original build manifest said Node22.

Only the staging site now has the non-secret `AWS_LAMBDA_JS_RUNTIME=nodejs22.x` override in **all contexts**, using existing public-setting scopes. A fresh upload with the functions cache explicitly skipped then selected Node22 as intended. All eleven pre-existing staging variables and their metadata are unchanged; team/shared variables remain empty. No production variable was installed. A connector acknowledgement of the initial write was not borne out by an independent API read; the actual staging setting was subsequently installed/read back through the typed SDK. No readiness decision relied on the acknowledgement.

The selected major is now correct, but Netlify still executes an affected patch. A `nodejs22.x` label, patched build binary, successful application check or redeploy is insufficient evidence of a patched host. Netlify's supported setting chooses a major, not an arbitrary patch binary. Do not substitute an unsupported runtime string or an application monkey patch for the vendor security update.

The staging outer gate remains first, immutable aliases are denied, internal workers reject unauthorized calls and no schedules were installed. Native ledger 117 is unchanged; migration 118 was neither applied nor included. Automatic sending, appointment notices and recurring generation remain OFF. Synthetic unavailable customer links intentionally use the existing HTTP200 recovery screen; this is not document disclosure. Missing private files return404.

## Production boundary and next action

Business production remains deploy **`6adab6d33b9c3096a37ad0a1`**. Its actual patch was not inferred from staging and remains unverified. Four existing public build settings were checked read-only using the original hotfix resolver. No production server secret was read/exported for building. The locally prepared candidate contains six instrumented functions and the five original schedules. Its build denied production/provider application network access and recorded zero attempts. It has **not** been deployed and is **not approved for activation**.

Obtain Netlify confirmation that the fixed runtime is available in this region, then repeat a fresh isolated staging execution and collect matching metadata/log evidence. The preserved local support note contains versions/site/deploy IDs only; it has not been sent. Do not rotate Stripe keys merely to suppress a runtime warning. Any production runtime-variable change/deploy and the home scanner image replacement remain separate owner approvals. Existing customer deliveries must not be manually replayed for runtime diagnostics; observe workers on their normal schedule after an approved release.

An additional, separate framework security follow-up surfaced in the vendor documentation: this unchanged baseline uses Next16.3.8, while Netlify recommends **16.4.1** for its October14 advisories. No `ImageResponse`, `use cache` or `cacheComponents` use was found in the bounded application/configuration search; Server Actions are present. This is not proof that every framework path is safe. Prepare the framework security update separately before a broader release; no dependency upgrade or exploit test was slipped into this Node batch.

Sources: [Node October security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases), [Node22 fix](https://nodejs.org/en/blog/release/v22.23.4), [Node24 fix](https://nodejs.org/en/blog/release/v24.22.1), [Netlify runtime selection](https://docs.netlify.com/build/functions/configuration/#nodejs-version-for-runtime), [AWS runtime rollout](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-update.html), [separate Next advisory](https://www.netlify.com/changelog/2026-10-14-nextjs-react-security-vulnerabilities/).

Sanitized receipt: `staging/NODE_RUNTIME_SECURITY_VERIFICATION_20261023.json`. Private evidence and the undeployed production candidate are under `/Users/noelsierra/Documents/Codex/2026-10-23/runtime-security-fix/`. Credentials, cookies, complete logs and full database snapshots stay outside Git. Temporary local test servers/containers have stopped; the replacement local image and other project services are preserved.
