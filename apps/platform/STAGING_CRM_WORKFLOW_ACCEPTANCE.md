# Actual CRM staging workflow acceptance — October 21, 2026

> Historical baseline below. The conflict-response and private-download failures recorded here were subsequently fixed and reverified on staging deploy `6ad93840ccebc7a5679b1b28`, with migration101. See [current verification](CONFLICT_AND_PRIVATE_DOWNLOAD_VERIFICATION.md). The original observations and evidence are retained; they are not the current verdict.

The current CRM now runs on the dedicated protected staging site:
https://angel-tree-admin-staging.netlify.app. **Production was not changed.**
The positive business workflow passes, but this is **not production acceptance**:
two software failures must be resolved before release.

## Exact target and source

- Staging Netlify site: `d81d923d-6ccf-4c1e-87cc-263f3d51555d`.
- Final staging deploy: `6ad932724d4a26dd3415fc7a`.
- Staging Supabase: `gbyhdsuiqeslgjdnbqng`, 100 migrations, PostgREST 14.18.
- Committed source: `616ad8209b43956c55a31667818d1672d01c88ee`, platform tree
  `9ec8e8fa2ed6f255c7ef0dc962e3bbff36fa108c`. This preserves the new website-only
  main commit and all completed CRM work. No financial/application source overlay.
- Explicit overlay: the staging build plugin/configuration described below.
  Its hashes are recorded in `staging/CRM_WORKFLOW_ACCEPTANCE_20261021.json`.
- Node 22.23.3, Next 16.3.8, Netlify Next adapter 5.16.3, Node 22 Functions.
- Production remains CSS-only deploy `6ad6ecfc6c03786554247e4a`.
  The redesigned dashboard is visible in staging, not published to production.

The isolated committed-source export used actual private staging values in memory,
not masked Netlify placeholders. No credentials were copied into source. Static,
Edge and server artifacts were checked for embedded private values. No scheduled
Functions were selected. CLI deployment explicitly published `.netlify/static`;
the adapter restores `.next` after the build, so using that directory with a
separate `--no-build` upload gives missing browser assets. No production build or
hosting configuration was changed. CLI skew protection is unavailable; no claim
of CLI skew protection is made.

## Checks performed

| Area | Actual result |
| --- | --- |
| Build/regression | 2,173 checks pass; isolated typecheck and actual Netlify adapter build pass |
| Visitor protection | Seven final hosted scenarios pass: 48 anonymous method/path denials, separate secure preview session and CRM login, real assets after cache warming, five worker denials, current immutable alias rejection, tamper/origin rejection, logout |
| Login/dashboard | Synthetic owner signs in through the rendered app; dashboard shows $240 collected/invoiced and $0 outstanding after the test payment |
| Connected business journey | Actual staging Auth/PostgREST commands carry one synthetic lead through quote editing/approval, crew scheduling, explicit completion, invoice generation and manual cash payment; actual mobile read endpoint returns the saved quote |
| Retry correctness | Lead submission, approval, invoice generation and manual-payment replays retain one work order/invoice/payment and the expected audit events |
| Access/offboarding | Anonymous and crew money commands denied; the same admin JWT loses CRM access after deactivation; reactivation restores roles while clock permission remains disabled |
| Employee presentation | Active employment remains separate from 0% onboarding progress; CRM enabled/time-clock disabled are rendered correctly; deactivation dialog retains the required reason and three plain-language consequences; Escape closes it and restores focus |
| Private source-file recovery | Encrypted synthetic metadata/bytes pair restored into a fresh document/path; wrong key and tampering rejected; fresh scan required; old scan receipt rejected; recovered bytes match; unauthorized crew denied |
| Browser uploads | 86-byte text and exactly 26,214,400-byte text pass through the actual browser upload/staging transport, private Storage and home scanner; both become clean |
| Quarantine | Standard synthetic EICAR text becomes quarantined through the real browser form, with no open/download control |
| Customer pages | Paid invoice shows $0 due and no payment action; approved proposal suppresses approval controls; another synthetic customer submits a change request and receives confirmation; the quote becomes `change_requested` |
| Communication isolation | Auth no-send hook and disabled public signup retained; communication/recurring automation OFF; zero provider attempts, first dispatches or customer deliveries; two prepared synthetic outbound records retained, unsent |
| Private downloads | Authorization, stale-version/range rejection, deactivation revocation and anonymous cache isolation pass; **valid file bytes fail with HTTP 412** |

Financial command/API checks and rendered browser checks are separate evidence.
No actual Stripe checkout, bank/card transaction, Resend email, calendar update or
real customer contact was performed. The manual payment is fictional staging data.
No claim is made that provider delivery or external payment recovery passed here.

## Verified staging fixes retained

The real Next adapter runs generated middleware before user Edge declarations.
With the original exporter, anonymous `/admin` requests returned a CRM login
redirect before reaching the preview gate. The new staging-only build plugin
inserts the **existing unchanged gate** first in the generated framework chain.
It retains the generated middleware, stops on an unexpected adapter manifest or
target, and is selected only in the staging export. Production's `netlify.toml`
remains unchanged. Final real Netlify requests now reach the gate first.

Fresh staging contained only the migration-created `payroll_admin` role. The
existing owner/admin/crew/estimator labels were bootstrapped for synthetic tests.
No new role predicate, RLS policy, database grant or business command was added.

## Release blocker 1 — deterministic conflicts trigger hosted retries

A stale quote approval does not mutate the quote, and an authenticated SQL check
returns the expected `40001` exception immediately. Through hosted PostgREST,
the equivalent request hangs: a bounded reproduction timed out after 30,005 ms.
The test window returned 27,191 PostgreSQL log rows matching `40001` or
serialization text. Staging's actual OpenAPI version reports **14.18**.

This matches Supabase's documented PostgREST 14 retry-loop issue for manually
raised serialization failures. The direct SQL safety check is **not** a substitute
for a passing HTTP conflict response. Twenty-three current public/private function
definitions contain an explicitly raised `40001`; the inventory is retained
privately. Do not repeatedly run stale-version HTTP probes against this target.
No matching hanging approval backend remained at final cleanup.

**Next implementation:** an additive migration that uses a non-retryable business
conflict response such as `PT409` for these deliberate version/snapshot conflicts,
with client error mapping and real HTTP stale/concurrent request tests. Preserve
locks, transaction boundaries, authorization, idempotency and history. Keep genuine
database serialization/deadlock handling separate. Do not edit the historical
migrations or weaken optimistic concurrency checks to make the test pass.

[Supabase troubleshooting](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions)
and [Netlify declaration order](https://docs.netlify.com/build/edge-functions/declarations/)
support these platform-specific findings; the failures above were observed on this
actual staging deployment, not inferred solely from documentation.

## Release blocker 2 — valid private file downloads fail

An authorized active admin receives the correct private file descriptor, but the
following bounded range request using its returned version receives **412** with
`The file changed. Open it again.` despite no intervening object change. Crew and
missing-session requests remain denied, so this is a delivery failure rather than
an authorization bypass.

The staging gate strips response ETags, which also conflicts with the private
client's required chunk-version header. A narrow experiment forwarding conditional
requests and preserving matching range versions passed local adapter tests but
**did not resolve the hosted 412**. That experiment was reverted from source and
the final staging artifact. The cause of the request-version mismatch is still
unconfirmed; do not claim it was fixed by forwarding alone.

**Next implementation after conflict handling:** trace the version precondition
through real Edge/Next/Storage transport and fix both request and response version
handling. Retain live staff authorization for every chunk, byte bounds, object
identity rechecks, no-store caching and native/web compatibility. Verify unchanged
files download, changed files fail, and deactivated/unauthorized users still fail.

## Smaller issue — dashboard invoice action count

After the synthetic invoice is fully paid, `Invoice finished work` still shows 1.
The workflow pipeline counts completed/ready-to-invoice jobs without excluding
jobs that already have invoices (`src/lib/data/workflow-pipeline.ts`). The cash,
invoiced and outstanding figures match the synthetic ledger. This queue count
should be corrected after the two release blockers; duplicate invoice generation
remains protected by the existing command.

## Preservation and end state

All three synthetic CRM profiles are disabled, employee records are separated,
all test Auth sessions are revoked, and audit/business/file fixtures are retained.
No customer or production records were copied. The synthetic recovery deleted only
its own test bytes and archived its original metadata; no general purge occurred.
Only staging's document-library scan switch was enabled for these tests; the six
remaining attachment switches stay OFF. The staging database function/policy
fingerprints and 100-entry migration count match the pre-test baseline.

The shared `staging/targets.json` remains unassigned/false. The actual target was
bound only in the isolated export, using prior hosted perimeter/key/scanner proof,
the fresh Auth review and the real synthetic paired recovery. Full release
readiness was not promoted. No code was committed or pushed in this check batch.
The original local CRM still returns health 200. Earlier scanner documents and
unrelated Impeccable work remain preserved.

Remaining release work includes these two software fixes, their staging acceptance,
production paired backup/cutover verification, and the existing scanner capacity,
monitoring/renewal and physical Mac/WAN restart evidence. The Mac was not rebooted.

Private reproducible scripts, logs, credential-free browser evidence and screenshots:
`/Users/noelsierra/Documents/Codex/2026-10-21/crm-staging-workflows/`.
Credential and portal-link files in that directory are private and must not be
copied into Git or shared reports.
