# Netlify scanner evaluation — October 17, 2026 (US Eastern)

**Decision: reject a direct/free migration. Retain a paid, queued Netlify worker
as a conditional research candidate; it is not yet an approved security-equivalent
replacement.** This keeps the owner's Netlify/Supabase-first direction and
continues PR18/F17. No third infrastructure provider is proposed.

The real ClamAV engine passed the local corpus with a larger memory budget.
That establishes compute feasibility for further work. It does not establish
Netlify runtime compatibility, secure parser isolation, hosted capacity or cost.
Existing code, security rules and scan switches remain unchanged.

## Actual local experiment

`scripts/private-scanner/evaluation/benchmark.mjs` creates only its own labeled
containers/internal network, using the existing pinned ARM64 engine and Node
images. Existing definitions are mounted read-only, with no network updates.
There are no public ports, credentials, provider requests or business files.
It enforces memory/no-swap cgroups, non-root/read-only containers, no capabilities,
no core dumps and memory-only extraction. Owned fixtures/containers/network are
cleaned up; the prior stopped hosting stack stays stopped and the original local
CRM/scanner remain running. No image is built or published.

| Measurement | 1,024 MiB engine /0.5 CPU | 4,096 MiB engine /1.5 CPU |
| --- | --- | --- |
| Cold readiness, including local probe overhead | 15.224 s | 14.942 s |
| Loaded definitions | ClamAV1.5.4 / signature28156, current under existing48h rule | Same |
| Clean text, EICAR,25MiB,encrypted archive | Correct verdicts | Correct verdicts |
| 110MiB expanded archive | Engine OOM-killed, exit137; no clean verdict | Quarantined,247ms |
| Two concurrent25MiB files | Not reached after failure | Both clean,244ms |
| Observed engine peak | Last live sample about974MiB; final peak unavailable after OOM | About1,065MiB |
| Complete corpus | Failed safely / unavailable | All six scenarios passed |

The client is a **separate**256MiB container (0.5 CPU), with about143MiB peak RSS
in the larger run. These are engine budgets, not an exact whole-function memory
simulation. The larger run's combined CPU ceilings total2. Neither run includes
remote definition downloads, uploads, Lambda/Netlify overhead or a definition
update/reload cycle.4GiB was a tested upper candidate, not a claim that it is the
minimum safe allocation. A small corpus does not certify every future definition
set or malicious file. The existing reviewed resource ceilings are unchanged.

The first harness run stopped when its success assertion encountered the smaller
budget failure. Cleanup completed. The harness was corrected to retain negative
budget outcomes and continue; the final run independently confirms the OOM.
Raw attempts remain outside Git; the final sanitized results are in
`staging/NETLIFY_SCANNER_EVALUATION.json`.

## Platform fit and blockers

1. **Transport:** Netlify documents a6MB buffered limit, approximately4.5MB for
   binary requests; background payloads are256KB. Our25MiB byte POST cannot move
   unchanged. A future private worker would receive a small opaque job reference
   and fetch the authorized object server-side. Streaming responses do not solve
   request size. [Function limits](https://docs.netlify.com/build/functions/configuration/).
2. **Plan/compute:** documentation permits1,024–4,096MB configurable memory on
   eligible Credit-based Pro/Enterprise plans. Live read-only team metadata says
   ATS is Free; prior dashboard evidence identifies the legacy plan. Default1GB
   failed here. No upgrade, entitlement or monthly-cost cap was approved.
   [Memory configuration](https://docs.netlify.com/build/functions/configuration/),
   [plan/billing restrictions](https://docs.netlify.com/build/functions/usage-and-billing/).
3. **Timing:** current scanner HTTP timeout is12s. Both measured cold starts
   exceed it before the first scan, even with definitions already on local disk.
   Background Functions can run up to15minutes, but the existing SQL claim/finish
   leases expire after90seconds. Queue delay, cold start and provider retries
   cannot be inserted between claim and finish without careful orchestration.
   [Background execution/retries](https://docs.netlify.com/build/functions/background-functions/).
4. **No container host:** this four-service Compose package is not a Netlify
   function artifact. Current Linux binaries are Ubuntu ARM64 with GLIBC2.39.
   No target-runtime binary/dependency bundle, platform size allowance, child
   process support or native architecture was proved on Netlify. No arbitrary
   Ubuntu-to-Lambda compatibility or bundle/tmp capacity is assumed.
5. **Isolation:** our parser currently has no general outbound network, service
   key or updater network; definitions are read-only and extraction is tmpfs.
   A native parser inside a function that also downloads objects could inherit
   network access, secrets or writable scratch. Unsetting child environment
   variables, application fetch allowlists or deleting `/tmp` in `finally` do
   not prove the same boundary under parser compromise or process termination.
   Netlify Private Connectivity documents static outbound IPs; that is not proof
   of a network-denied parser sandbox. No such guarantee was established here.
   [Private Connectivity](https://docs.netlify.com/manage/security/private-connectivity/).
6. **Definitions:** current database files total175,568,935bytes (about167.4MiB),
   before engine/libraries/packaging overhead. The existing48h freshness refusal,
   signed-update validation and separate updater must survive serverless caching,
   eviction and version rollout. Build-time downloads and redeploys alone are
   not an acceptable update/recovery strategy. No public mirror, file copy or
   new credentials were created. [ClamAV memory/update considerations](https://docs.clamav.net/manual/Installing/Docker.html).

Netlify Edge Functions are not an engine candidate: documented512MB memory and
50ms CPU budget do not fit this native ClamAV workload.
[Edge limits](https://docs.netlify.com/build/edge-functions/limits/).
Async Workloads still execute as Functions and retain their limits; durable
routing does not supply a container host or replace our database locks.
[Async limits](https://docs.netlify.com/build/async-workloads/limitations/).

## Safe candidate design to investigate next

Keep uploads private in Supabase and show the existing checking/held state. A
server-approved job reference, never an arbitrary URL, bucket/path, browser
verdict or bearer credential, may initiate work. Prepare trusted fresh engine
state **before acquiring** the short scan lease; claim the exact current object
using the existing actor/access checks. Hash actual bytes and finish with the
same token, generation, object/version and digest. Recheck live actor access and
classification at completion. Keep archive, timeout, size and encryption handling.

Duplicate delivery, lost worker, archive/delete, replacement, deactivation,
expired lease and stale/wrong definitions must leave files inaccessible or finish
through the existing authoritative command. A202 response means queued, never
clean. Never store source bytes or signed URLs in event payloads/logs. Retried
provider events cannot directly mark a file clean. Keep all seven attachment
areas and audit/history/financial side effects intact.

**Next gate:** establish an enforceable parser isolation/runtime packaging design
within Netlify and review the eligible existing-account plan/cost. Request provider
clarification if documented controls cannot establish it. If that boundary cannot
be preserved, reject standard Functions for this engine; do not quietly waive
security or introduce another account. Only after that gate should a local
worker prototype integrate existing claim/finish commands. Any later hosted proof
needs separate deployment approval. No queue, migration or app feature is added
by this evaluation.

## Verification and preservation

- Full regressions:731 passed,0 failures/skips. Typecheck passed.
- Real scanner: six positive scenarios in the larger budget; a meaningful
  negative OOM/unavailable result in the default-size budget.
- Existing configured stale-signature refusal and strict verdict parsing were
  reused; no signature subset, disabled heuristic or reduced archive coverage.
- Native binary/bundle packaging, actual Netlify execution, paid entitlement,
  cost, network/scratch isolation and update recovery remain unverified.
- No production/application/scanner runtime configuration, dependency lockfile,
  migration/RLS, financial behavior, retention or shared target-manifest change.
  No provider setting, deployment, push, account, secret or hosted data change.
- New files are evaluation tooling and reports only, outside the selected
  function directory. No runtime handler is registered. No Next production build
  was repeated because application/build inputs are unchanged.

Reproduce only in the existing disposable setup (the explicit local socket,
pinned images and labeled definitions volume must exist):

```sh
node scripts/private-scanner/evaluation/benchmark.mjs \
  --docker /absolute/path/to/docker \
  --socket /absolute/path/to/pr02-disposable/sock/docker.sock \
  --out /absolute/path/to/a-new-result.json
```

Do not run `probe-client.mjs` directly on the Mac: the harness passes its source
into the private Node image where the existing `/app/bridge.mjs` import lives.
No environment file is required or read.
