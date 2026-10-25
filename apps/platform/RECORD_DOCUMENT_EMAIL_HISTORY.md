# Recorded document-email history

Verified October 24, 2026. Migration 124's completed staging reconciliation is pushed normally to `origin/main` as `5cdc0b8000d17e8fafdd44df9f8a1547a4370806`. This is the next focused PR14 communications visibility step in the existing roadmap. It remains local and undeployed on `codex/record-document-email-browsing`, based on that main.

## What staff can do

**View all recorded emails** opens a complete, record-specific history from proposals, invoices and change orders. The owner confirmed **All recorded emails** as the default. **Needs attention** is a secondary view for failed, delayed, bounced, complained, suppressed or explicitly uncertain recorded outcomes. Switching views resets the page while preserving the record.

Each view has native 30-row pages, exact matching counts, stable newest-record/UUID ordering and Previous/Next links above and below the rows. Back to record returns to the same document. The original proposal/invoice recent previews and all existing workflow, sending, payment and reminder controls remain. The change-order entry follows its existing Workflow and Customer link panels.

Subjects, recipients and outcomes are visible immediately. Delivery details uses a keyboard-accessible native disclosure for provider references, type, recorded time and available delivery-status time. Missing actual send dates are explicitly described instead of reconstructed. An uncertain provider outcome is never labelled definitely unsent. Acceptance and receiving-server delivery reports do not claim that a customer read an email. Raw provider errors and frozen message/portal bodies are not rendered.

Linked rows open the existing **Delivery review** for that exact delivery ID. Older rows without a link retain their recorded history; the details disclosure explains that no linked review is available. The new browser has no preparation, cancellation, repair, send, retry or payment form. Opening or paging it sends no email.

### Recorded history is a specific boundary

This browser reads `public.email_events`, including related recorded reminder/receipt outcomes when present. It does not claim to enumerate all prepared, dispatching, unknown or otherwise unrecorded private outbound requests. A footer explains this and links to the existing Delivery review. A verified empty result means **no recorded emails for this record**, not that no request has ever been prepared or attempted. No new delivery read model, migration, backfill or retry protocol is introduced.

## Read and authorization boundaries

- The server authenticates and checks effective internal-staff roles before reading history. The source document is verified under the same caller's RLS. Missing, unauthorized, source-read failure and history-read failure remain distinct from genuine empty results.
- Only three allowlisted source types and valid UUIDs are accepted. Every page, fallback HEAD count and recovered page retains the exact related-document predicate. Invalid scope fails closed; it cannot become a global history query. Related IDs are normalized, and back destinations are derived from the source rather than arbitrary return URLs.
- Counts and rows use caller-scoped SDK reads. Ordering stays in PostgreSQL (`created_at DESC, id ASC`), preserving timestamp microseconds and deterministic UUID ties. The page/count/recovery sequence shares a five-second deadline and permits one bounded out-of-range recovery. Source verification has its own bounded read.
- The projection names only display/identity/timing fields and the matching source foreign key; it selects no message payload, HTML, private context or secure token. Dynamic projections are decoded from unknown values before use. Malformed, mismatched or incomplete rows/counts become unavailable rather than partial or false-empty success.
- There is no service-role fallback in the feature, new public RPC, mutation action, schema change, RLS/grant change, financial change, provider/template change, dependency change or deployment configuration change.

## Verification

- **3,012 regular CRM checks passed**, including **76 new focused cases**; the separate manual-reminder safety suite passed **21**. Zero failures, cancellations or skips on the final corrected source. Focused cases cover source/URL validation, safe projections, exact count/recovery, a shared deadline, malformed responses, role/page guards, uncertainty/date language, states and absence of mutation controls.
- **13 actual local Auth/API scenarios (14 TAP results)** passed against the native 124 schema. Every row was paged and compared with native ordering across three sources and both views, each beyond 1,000 rows. **423 bounded, caller-scoped email reads**, including **six HEAD count reads**, checked recovery, true emptiness, transport/source errors, all four staff roles, anonymous/nonstaff denial, spoofed metadata and disabled/separated/removed-role old sessions. GET/HEAD-only enforcement and before/after fingerprints preserved email/delivery/queue history, documents, settings and finances. There were zero provider requests or customer emails.
- **95 native SQL assertions passed in each fresh local and staging target**. They cover full and attention counts, later pages, UUID ties, legacy/uncertain outcomes, linked and unrecorded durable requests, private-body access denial and eleven stored-role/effective-access identities. All hosted fixtures ran in a caller-owned rollback transaction. Exact before/after snapshots preserve the complete **124-entry ledger**, **5,113-object catalog**, **49 protected sets**, individual document bindings, no-send Auth guard and OFF automation controls. Staging remains at `20261024190625`; no staging app was deployed.
- Fresh native schema and offline fingerprints, framework security floor, route type generation, TypeScript and optimized build passed on Node **22.23.4**, Next **16.4.2**, React **19.2.9**. An initial TypeScript inference issue with a dynamic projection was corrected with runtime decoding from unknown; the final checks passed. No separate lint script is configured. Original migration sources, generated types and public signatures are unchanged.
- Local advisors remain **zero**; staging's existing **80** findings match the recorded migration-124 baseline exactly. No new finding, role/default grant, RLS change or Auth setting change was introduced.
- Actual rendered local checks covered all three entry links and correct source counts, change-order return navigation, keyboard Next to page 2, attention reset to page 1, real delivery-review navigation, empty history, keyboard disclosure and a long provider reference. Frozen-body markers never appeared. A temporary SELECT denial in the newly owned local database produced a real alert with zero rows and no false-empty statement; the full original ACL and every email row were restored exactly afterward.
- Desktop **1280**, tablet **768** and phone **390** captures showed no horizontal overflow. The scoped mechanical detector ran once and reported no findings. The finish reviewer requested restoring the change-order operating hierarchy and the phone disclosure marker; both fixes were implemented, recaptured and scored **resolved**, with **ship at listed-fix scope**. The documenter compared the final feature with incumbent components/tokens and eight captures, preserved system files, and added only the feature's surface brief. Shared communications styling remains code-defined; no unrelated system repair was made.

The browser captures are synthetic local acceptance, not hosted staging browser/Auth-session or real-mailbox acceptance. Physical-device, spoken-screen-reader and actual customer opening/delivery are not claimed. The local API harness and hosted SQL complement these limits; they do not remove them.

## Files and evidence

Implementation: `src/lib/email/record-history-scope.ts`, `record-history.ts`, `src/components/record-email-history-browser.tsx`, the new `admin/communications/email/[recordType]/[recordId]` page/loading routes, three existing document-detail entry links and scoped styles. Tests: `tests/record-email-history.test.mjs`, `tests/record-email-history-fixture.mjs` and `tests/record-email-history.integration.test.mjs` and `supabase/verification/record_document_email_history.sql`. Feature design brief: `.impeccable/surfaces/record-email-history.md` at the repository root.

Sanitized receipt: `staging/RECORD_DOCUMENT_EMAIL_HISTORY_VERIFICATION_20261024.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-24/record-document-email-browsing/`, including final desktop/mobile/tablet, empty/error, footer and record-entry captures. Raw snapshots, credentials, identities and logs remain outside Git. Only this task's preview and isolated loopback database are stopped afterward; synthetic data is retained. Existing worktrees, user tabs, shared stacks and the home scanner are preserved.

## Existing roadmap and limits

Counts, source checks and navigation reflect live state rather than one frozen transaction. Concurrent external changes can move records between pages; refresh and bounded recovery handle stale positions. Unknown historical send times are not reconstructed. The original recent previews remain previews and are not relabelled as complete totals.

This completes the recorded document-email browsing follow-through. The next focused PR14 step is record-scoped visibility of prepared/unresolved private delivery requests, using the established delivery commands and review safeguards; it must preserve recorded history and never turn viewing or recovery into a blind resend. Wider policy, tax-preparer, real-mailbox/device/accessibility and managed-runtime follow-ups remain in the existing roadmap. The separate runtime-security worktree stays at `06580f6c922fa6ab0ebaf229d27b1d30097f1b78`. No production query/change, deployment, key rotation or real customer communication occurred.

## October 25 follow-through

The recorded-history commit is pushed to main. The focused prepared/unresolved
request view is implemented and verified separately in
`RECORD_DELIVERY_VISIBILITY.md`. All recorded emails remains the default, and the
original history/security/workflow boundaries remain. Candidate migration 125
has local native and rollback-only staging verification; permanent staging
reconciliation and release are still separate steps.
