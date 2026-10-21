# Conflict responses and private downloads — October 21, 2026

Both requested fixes pass locally and on the protected CRM staging application. Production is unchanged. The working branch remains based on the current main commit, `616ad8209b43956c55a31667818d1672d01c88ee`. This records verification before publication; the verified batch was subsequently pushed as `1aafe8a212a56cdea29e6250fed740cf8ba04354`, with deployment skipped.

## Changes and security guarantees

Migration 101, `20261021215535_business_conflict_responses.sql`, changes deliberately raised business-conflict SQLSTATEs from 40001 to PT409 in exactly 23 reviewed functions. PostgREST 14.18 now returns HTTP 409 instead of retrying these deterministic failures. The migration checks each exact preimage/result and fails on unexpected definitions. It is atomic and repeatable. Historical migrations are unchanged.

Only the error-code tokens change. Local and hosted comparisons verify unchanged OIDs, owners, ACLs, security-definer settings, search paths, function arguments, locks, business branches, transaction boundaries and RLS policies. Existing financial calculations, authorization, idempotency and audit history are preserved. Genuine database-generated serialization errors remain separate; clients still safely recognize the older 40001 response during compatibility periods. No automatic write retry was added.

Private-file web and native clients now send and validate `X-ATS-File-Version`, carrying the same hashed object version from the authenticated descriptor. The server retains origin compatibility with If-Match and rejects contradictory preconditions. Clients require the application version in each successful chunk; an ETag alone is insufficient. The staging gate can retain its existing ETag-stripping and no-store behavior.

User-session authorization and Storage RLS still run for each bounded chunk, followed by a second descriptor/object-identity check. The 25 MiB maximum, 1 MiB chunks, exact lengths/ranges, user-token Storage fetch, timeouts, and private/no-store headers remain. No privileged delivery path, public bucket, reusable signed URL or credential was introduced.

## Actual staging evidence

- Dedicated Netlify deploy: `6ad93840ccebc7a5679b1b28` at https://angel-tree-admin-staging.netlify.app.
- Dedicated Supabase: `gbyhdsuiqeslgjdnbqng`, exact 100→101 ledger upgrade. Native CLI dry-run selected only the reviewed migration, no seeds/roles. Repeated dry-run is up to date. Original ledger entries and all existing application/Auth/Storage rows were preserved during migration.
- Stale quote approval returns 409/PT409 in 1,351 ms, creates no job and changes no quote/money. Stale invoice save returns 409/PT409 in 436 ms and preserves header, totals and lines.
- Two concurrent schedule edits produce one winner and one 409. Repeating the stale edit leaves the winner intact. No retrying conflict backend remains.
- Authorized recovered file returns exact 206 bytes through the gate; the rendered browser reaches “Your file is ready,” downloads it, and matches its original SHA256.
- A 25 MiB file downloads in 25 bounded chunks and matches the original full digest. Missing/stale/conflicting versions, missing CRM sessions, unauthorized crew and anonymous cache-warmed reads are denied.
- Actual replacement of this batch’s separate synthetic object produces 412 for its old version and returns no replacement bytes. That fixture is now archived; metadata/audit are retained.
- Deactivating the synthetic admin invalidates the next chunk with the already-issued JWT. Reactivation restores reviewed CRM access while clock permission remains disabled.
- All seven hosted perimeter scenarios pass, including48 anonymous method/path denials, secure separate gate/CRM sessions, real asset cache isolation, five worker denials, immutable alias rejection, tamper/origin checks and logout.
- Auth/API effective settings are unchanged. Security advisor findings remain 3→3, with no new findings. Existing INFO advisories were not rewritten opportunistically.

The first staging build omitted source overlays because of a directory-relative path filter. The hosted range test caught it. The corrected final build explicitly verifies all source overlay hashes and the new protocol in both server and browser artifacts. All hosted results above come from the corrected deploy.

## Verification

| Check | Result |
| --- | --- |
| Full CRM unit/regression suite | 2,184 pass; 0 failures |
| Database pgTAP, fresh owned local upgrade | 295 assertions across 15 suites pass |
| Real local Auth/RLS/HTTP and concurrency suites | 126 passing checks across quote approval, invoice edits/boundaries, scheduling, quote change requests and private files |
| Migration rollback/repeat/security metadata | Pass; 23 bodies change only in error codes |
| Schema contract | Regenerated from the owned disposable upgrade; public TypeScript types unchanged; offline fingerprint check passes |
| Isolated typecheck and actual Netlify adapter build | Pass; Next 16.3.8/adapter 5.16.3/Node 22.23.3 |
| Native API/model verification | 59 Foundation-only Swift checks pass; iOS XCTest/simulator/full Xcode build unavailable here |
| Hosted functionality | 8 scenarios pass, plus actual object-replacement test |
| Browser download | Actual download and SHA256 match |
| Git | HEAD matches origin/main; existing work retained; diff whitespace check passes |

The local test scanner initially rejected scans because its loaded definitions were stale. Its signed definitions were refreshed and reloaded, after which all 17 local permission/private-file checks pass. No scanner security threshold was relaxed.

### Broader regression limitation at original verification (resolved)

The follow-through in [ISOLATED_PAYMENT_VERIFICATION.md](ISOLATED_PAYMENT_VERIFICATION.md) passes all 111 isolated checks, including recovery across two notification batches. The original observations below are retained for context.

The older ordered-payments live integration suite is not green in the accumulated local fixture database: 10 checks pass and 14 fail including the parent. Test events fan out to 123 accumulated test recipients, while the existing webhook processor reads at most 100 queued/submitting notifications per invocation. Its unchanged completion guard correctly refuses to mark a receipt complete while recipients remain queued. This batch does not change that processor or completion function, or weaken that guard. Re-run that suite in a fresh isolated fixture environment and explicitly cover bounded multi-invocation notification recovery before production acceptance. Do not represent the entire financial integration suite as passing.

No real Stripe charge/refund, Resend email, calendar write or customer communication was attempted. Provider delivery/payment recovery and a full iOS build are not claimed by this report.

## Final retained state and follow-up

Three new synthetic staging accounts were signed out globally, disabled, and separated. Final totals are zero Auth sessions, active profiles, active test employees, provider delivery attempts or first dispatches. Communication/recurring automation remains OFF. Only the existing document-library scan switch is ON. Existing synthetic workflow/file records and audit history remain; the new quote and invoice are drafts and no new payment was created. Production remains deploy `6ad6ecfc6c03786554247e4a`; no production schema/configuration write or application deployment occurred.

The two software blockers from STAGING_CRM_WORKFLOW_ACCEPTANCE.md are resolved. Production acceptance still requires the coordinated 65→101 migration/application review, paired production recovery and maintenance cutover, scanner capacity/availability/monitoring evidence, and the other operational release requirements. The fresh financial regression is now verified in ISOLATED_PAYMENT_VERIFICATION.md. The smaller already-observed “Invoice finished work” count issue is separate and unchanged.

Maintenance check: `SUPABASE_BIN=/path/to/supabase node scripts/release/verify-staging-business-conflicts.mjs --project-ref gbyhdsuiqeslgjdnbqng`. This only reads the exact 101 ledger, reviewed function bodies, security catalog, Auth guard and OFF switches. The historical93–100 profiles remain historical, not a 101 acceptance verdict.

Primary modified application files: `src/lib/files/private-file-response.ts`, `src/lib/files/private-file-client.ts`, native `MobileAPIClient.swift`, and the ten existing conflict-mapping locations for invoice/quote save/completion, appointments, report reads, handoffs, sender blocking, recurring operations and portal change orders. Existing live integration expectations now assert PT409; historical migration fixtures retain their original 40001 behavior.

Credential-free machine evidence: [CONFLICT_PRIVATE_DOWNLOAD_VERIFICATION_20261021.json](staging/CONFLICT_PRIVATE_DOWNLOAD_VERIFICATION_20261021.json). Reproducible private scripts/logs and browser proof: `/Users/noelsierra/Documents/Codex/2026-10-21/conflict-private-download-fixes/`. Credential-bearing files in that directory must remain outside Git.
