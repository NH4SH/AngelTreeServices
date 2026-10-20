# Staging runtime and perimeter acceptance

October20, 2026. Reconciliation `abe52d7` is pushed to `main` and
`codex/staging-source-event-reconciliation`, deployment skipped. This follow-up
is local on `codex/staging-runtime-access-acceptance`, aligned with that main.
**The scanner-independent local runtime checks pass. Hosted runtime and CDN
acceptance remain unverified because the staging app is undeployed.**

This package adds verification only: no app feature, production/staging runtime
source, dependency, lockfile, hosting setting, database object, migration, RLS
policy, scanner switch or credential was changed. No deployment occurred.

## Fresh hosted observations — read-only

- Dedicated Netlify site `d81d923d-6ccf-4c1e-87cc-263f3d51555d` still has no
  published deploy. This is metadata evidence, not a test of live protection,
  generated platform routes, failed/old immutable deploys or aliases.
- Exactly nine prepared staging variables retain their reviewed flags, scopes
  and contexts; no shared team variables were returned. The four public target
  settings still point to staging. The browser-key format was checked in memory
  and redacted before disk. Four private-variable fields were redacted before
  evidence was saved; no credential material was used for runtime testing.
  Metadata does not prove actual Functions/Edge environment values or key binding.
- The independent96 read-only verifier still passes: exact ledger/catalog/grants,
  assigned physical database, unchanged Auth/API fingerprints and no-send guard,
  empty business/source/response/notification/outbox state and OFF switches.
  No hosted user, fixture, provider request, configuration or database write ran.
- Production remains ready CSS-only deploy `6ad6ecfc6c03786554247e4a`, confirmed
  by read-only Netlify metadata. No production variable/credential value was read
  for comparison. Historical target inventory is not current schema evidence;
  the96 maintenance verifier remains authoritative for the reviewed database.

## What was executed locally

The existing source exporter archived committed `abe52d7` into a new private,
unlinked temporary directory. It copied no `.env`, hosting linkage or credentials.
Its staging configuration hash was checked; the custom function directory contains
only its README, with zero scheduled functions selected. Only reserved `.invalid`
hosts, unsigned synthetic project keys and synthetic scanner values enter this
isolated copy. True fixture flags never enter the real target manifest.

A fresh Node22 optimized Next build and isolated typecheck pass. The actual Edge
entry source is executed with Web API requests, explicit synthetic `Netlify.env`
reads and a synthetic `context.next` binding. The authorized Request is then
forwarded only to an owned IPv4-loopback instance of the actual compiled app.
The compiled child has outbound fetch, HTTP(S), TCP and TLS connections blocked;
attempts would be recorded and fail the test. Its listeners are loopback-only,
all test processes are stopped, and existing CRM/gateway processes are preserved.

The two layers were tested together:

| Check | Observed result |
| --- | --- |
| Missing platform environment, incorrect site/origin/markers, exposed gate variables |503; no forwarding |
| Anonymous document, portal, API, worker, framework/static/image and direct-function paths |401; `context.next` never called |
| Wrong alias or middleware-subrequest bypass claim, even with a valid session |421; no forwarding |
| Correct synthetic preview code |303 with scoped Secure/HttpOnly/SameSite cookie |
| Authorized compiled login/health |200, private/no-store and restricted browser CSP |
| Authorized admin/delivery-review without CRM login |307 to CRM login; perimeter access grants no employee access |
| Actual compiled JS asset | Exact bytes retained; four cache headers forced private/no-store; validators removed |
| All five compiled worker routes without worker credentials |401; no worker/provider execution |
| Production-origin intake OPTIONS against the compiled app |403, no allowed-origin response |
| Gate-cookie removal and request forwarding | Gate cookie removed; existing CRM cookies/Bearer/body preserved |
| Upstream exception | Generic503; no diagnostic canary disclosed |
| End preview access | Scoped cookie cleared; subsequent anonymous CRM request denied |
| Browser build canaries | All90 JS/CSS/JSON/map files inspected; no synthetic server/scanner keys found |
| Compiled-child outbound attempts |0 |

**862 regular regression results pass**, including six new actual-entry-point
cases. The new opt-in compiled runtime suite passes **eight scenarios / nine TAP
results**. A second run includes export configuration and empty-function-directory
checks. Existing13 shared-handler tests retain the full session expiry/rotation,
CSRF/body bounds and cookie matrix; no competing auth implementation was added.
Offline schema/migration fingerprints and operational syntax also pass.

All110 shared-local public row fingerprint sets, schema/function and constraint
fingerprints, policies, private buckets, scanner settings and native68-entry
ledger exactly match this package's separate pre-work baseline. The existing
local app still returns health200; its signed-in review session was not changed.

## What these results do not prove

Node execution of the actual Edge entry with explicit platform bindings is **not
Netlify Deno execution**, adapter-generated routing, TLS/browser-cookie behavior,
CDN caching, immutable-deploy isolation, hosted credential binding or hosted logs
verification. The compiled app is real; the outer platform/context and all keys
are synthetic. No `netlify dev`/`netlify build`/deployment or account credential
import was used. The source-only export is not an uploaded Netlify artifact.

Shared `staging/targets.json` stays unassigned/false. Hosted readiness is not
promoted from metadata, local success or fixture flags. The home scanner,
source-file/database recovery pair and assigned operator remain the existing
separate prerequisites; no scanner-free bypass or plan/account change was added.

## Bounded checklist for a later approved hosted acceptance

After release prerequisites and a separate staging deployment approval, bind the
checks to one exact staging deploy, canonical hostname and known alias inventory:

1. Verify the built artifact actually contains the noncached catch-all gate,
   fail-closed error behavior, no public exceptions and no scheduled workers.
   Inspect the generated Next/server/Edge routes and their actual execution order.
2. From a clean browser/client, check GET/HEAD for documents, portal, APIs, real
   static/image/RSC/data/skew paths and direct generated function paths. Check
   unauthenticated worker POST/OPTIONS without worker secrets. No anonymous
   request may reach protected app data. Repeat after authenticated cache warming.
3. Use the independently prepared code privately. Verify Secure host-only cookie
   behavior, separate CRM login, logout, wrong-origin writes, expiry/tampering and
   gate-cookie stripping. Do not paste cookies/codes into evidence or shared logs.
4. Inspect actual edge/CDN cache results and repeat from a separate anonymous
   client. Headers and local proxy behavior alone cannot establish CDN isolation.
5. Exercise every branch/preview/immutable alias from the real deploy inventory.
   The current exact-origin policy must deny alternate hosts. Review old deploys
   individually; a new key is not proof that frozen old deploys lost their keys.
6. Establish real Functions/Edge `SITE_ID`/target/scope and read-only staging key
   binding without printing values or creating customers. Inspect actual log
   access/redaction. Keep no-send Auth, provider credentials absent and automation
   OFF; verify the96 database candidate again before any synthetic hosted write.

Those are remaining acceptance requirements, not performed operations or a new
approval. **Local-only preparation is complete; another local repeat cannot close
these hosted gates.** Continue unrelated CRM work while the home hardware and
restore/operator prerequisites remain unavailable. No production rollout is implied.

Safe evidence: `staging/RUNTIME_ACCESS_ACCEPTANCE_VERIFICATION.json`.
Private reproduction/build/runtime metadata:
`/Users/noelsierra/Documents/Codex/2026-10-20/runtime-access-acceptance/`.
Tests: `tests/staging-edge-adapter.test.mjs` and
`tests/staging-runtime-access.integration.test.mjs`; usage is in `tests/README.md`.
References: [Edge context/next](https://docs.netlify.com/build/edge-functions/api/),
[request chain](https://docs.netlify.com/resources/troubleshooting/request-chain/),
[Next runtime](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).
