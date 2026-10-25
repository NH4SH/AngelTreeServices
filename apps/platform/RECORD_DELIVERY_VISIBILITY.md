# Record-level prepared and unresolved delivery visibility

Verified October 25, 2026. The preceding recorded-email history commit,
`a8a5481b9ac8f31904ae2afcd369266f29dff331`, is pushed normally to `origin/main`.
This focused PR14 communications follow-through is based on that main and remains
local on `codex/record-delivery-visibility`. Production and deployment settings are untouched.

## Staff experience

The user confirmed **All recorded emails** stays the default. Proposal, invoice and
change-order email histories now also offer **Prepared & unresolved**. It shows
requests that can exist before an `email_events` entry, without mixing request
counts with recorded-email totals. Existing recent previews, record actions,
Needs attention, recorded outcomes and back destinations remain intact.

Each request shows its subject, primary recipient, plain-language outcome and
preparation time. Native Request details reveals recorded attempt counts, available
attempt/acceptance times and provider reference. The existing **Review this
delivery** destination retains all its original permission, lease, retry-window,
provider-evidence and repair safeguards. The new view contains no mutation form,
send, retry, cancellation, repair or payment command.

Prepared with no recorded attempt is distinguished from prepared for another
attempt. Sending and unknown outcomes never claim the message was definitely
unsent. Accepted requests with pending record/follow-up synchronization remain
visible; delayed or adverse delivery reports also remain visible until reviewed.
An acknowledged terminal cancellation or rejection is omitted. Acknowledgement
alone does not hide an unknown or in-flight attempt, or pending follow-up work.
Historical facts remain in their existing stores and recorded-history views.

Pages contain 30 requests, with exact counts, deterministic native
`created_at DESC, id ASC` order, Previous/Next above and below the list, and Refresh.
Switching views returns to page 1 and retains the source document. Error,
missing/unauthorized source, loading and a verified empty result stay distinct.
A request may also have a recorded outcome; these are complementary views.

## Read and security boundaries

Migration **125**, `20261025173049_record_delivery_visibility.sql`, adds one private
metadata reader, one public invoker endpoint and a private GIN containment index.
It does not replace any dispatch, acceptance, reconciliation or review command.
No original migration, table policy, table grant, trigger, financial behavior,
message template, automation setting or credential is changed.

- The exposed `list_record_delivery_requests` function is **SECURITY INVOKER**.
  It verifies the exact source through the caller's RLS before invoking the private
  helper. A restrictive source policy was independently tested against active staff.
- Crossing the pre-existing private outbox boundary requires a private
  `SECURITY DEFINER` helper. It has an empty search path, qualified objects,
  explicit stored/effective internal-staff checks and source/type/page validation.
  Execute is revoked from PUBLIC, anonymous and service roles; only authenticated
  callers receive the narrowly scoped reader. The private schema remains unexposed
  to the Data API. This is not a grant to the outbox table or its message bodies.
- Scoping uses canonical invoice/change-order IDs or containment of **any** matching
  proposal in `context.quote_ids`. It does not inspect only the first proposal, pull
  global pages for client-side filtering or infer scope from a job/customer.
- Only display metadata leaves SQL. Frozen HTML, portal tokens, source snapshots,
  raw context, provider/business keys, attempt identifiers and raw problem codes
  remain private. The server decoder explicitly projects known fields and rejects
  malformed, duplicate, incomplete or scope-mismatched responses.
- Exact total, clamped page and rows are computed in one stable SQL statement and
  snapshot. A caller-bound GET RPC uses a five-second deadline. No service fallback
  or request-preparation/retry side effect is available. The containment index was
  verified as usable with a native EXPLAIN (sequential scans disabled for that plan check); completed delivery commands are unchanged.

## Verification

- **3,073 regular CRM checks passed**, including **137 focused recorded-history and
  request-view cases**. The separate manual-reminder suite passed **21** checks.
  Final runs have zero failures, cancellations or skips. A local snapshot run initially overlapped synthetic API fixture creation; the final native snapshot test ran sequentially and required exact before/after equality. A historic migration
  inventory assertion was updated from 124 to 125 while preserving its original
  93-entry historical ledger checks and deferred-source safeguards.
- **Nine actual local Auth/API scenarios (ten TAP results)** passed. They made
  **196 scoped GET reads**, paged all matching requests beyond 1,000 per source,
  verified UUID ties and multi-proposal membership, recovered exhausted pages and
  distinguished empty/missing/failing reads. Four stored staff roles retained
  access; anonymous, nonstaff, forged-metadata and disabled/separated/removed-role
  old sessions were denied. Complete before/after fingerprints preserved outbox,
  history, queue, invoice data, payments, settings and audit. Provider requests and
  customer emails sent: **zero**.
- **100 native SQL assertions passed on both local and staging targets**. Independent
  named outcome fixtures check prepared/in-flight/unknown, healthy completed,
  bounced/delayed, acknowledged terminal, source-changed, follow-up and repair
  states. Tests also cover all eleven stored-role/effective-access identities,
  source RLS, the private helper’s independent guard and unexposed API boundary, complete native pages, strict arguments, redaction and the GIN plan.
- All hosted candidate DDL and synthetic fixtures ran inside a single rollback
  transaction. Fresh pre/post evidence matched the complete **124-entry staging
  ledger**, **5,113-object catalog**, **49 protected sets**, immutable document
  bindings, no-send Auth guard, settings and OFF automation controls exactly.
  Staging remains at **`20261024190625`**. Migration 125 is **not permanently
  installed there** and no staging application was deployed.
- The newly owned local stack replayed all original 124 migrations, then installed
  only candidate 125 through the native CLI. Types and schema fingerprints were
  generated from that schema. Fresh and offline schema checks, framework security
  floor, route type generation, TypeScript and optimized build passed on Node
  **22.23.4**, Next **16.4.2**, React **19.2.9**. No lint script is configured.
- Local advisors remain **zero**. Hosted staging's existing **80** advisor findings
  match the migration-124 baseline exactly; no new finding is claimed resolved.
- Actual rendered local checks covered all three record scopes, exact back/review
  links, keyboard paging, default-history return, native disclosure, long reference
  wrapping, true empty and real read-error states. A temporary execute denial in
  the owned local database produced an alert with no false empty/count statement;
  the original complete ACL and every outbox row were restored exactly afterward.
  Desktop 1280, tablet 768 and phone 390 layouts had no horizontal overflow.

Browser captures are synthetic local acceptance. Hosted browser/Auth-session,
physical-device, spoken-screen-reader, provider delivery and customer mailbox
acceptance are not claimed. Exact per-page count consistency does not freeze a
multi-page browsing session: concurrent deliveries can still move between pages.

## Evidence and release boundary

Sanitized receipt: `staging/RECORD_DELIVERY_VISIBILITY_VERIFICATION_20261025.json`.
Private logs, credentials, catalog snapshots and browser captures live outside Git
under `/Users/noelsierra/Documents/Codex/2026-10-25/record-delivery-visibility/`.
Only task-owned local services/tabs are closed afterward; synthetic volumes and
existing worktrees are retained. The runtime-security worktree remains at
`06580f6c922fa6ab0ebaf229d27b1d30097f1b78`.

This completes the existing roadmap's record-specific prepared/unresolved
visibility gap. The next release step is targeted staging reconciliation for
migration 125, with the existing baseline and no-send controls preserved, followed
by a separately authorized application release. The deferred manifest keeps
`productionReady: false` and `readyForHosting: false`. No production query/change,
provider call, customer email, deployment or key rotation occurred.

## Subsequent staging reconciliation — October 25

Migration 125 is now installed and verified natively on ATS CRM Staging, with the
original 124 history entries, protected state, guard and OFF automation settings
preserved. The initial implementation evidence above records the earlier
rollback-only verification; permanent reconciliation is documented in
`STAGING_RECORD_DELIVERY_RECONCILIATION.md`. No application deployment or production
change accompanies it. Implementation and checkpoint remain local pending push.
