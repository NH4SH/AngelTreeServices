# Mobile saved-request reconciliation — local verification

October 21, 2026. Restart recovery `15362f6` is pushed to `main` and
`codex/mobile-quote-recovery`. This package starts from that same main commit and
adds a read-only way to find the result of a saved creation/copy request.
No hosted database operation, application deployment or production change occurred.

## Behavior

- A recovered new proposal or nonempty copy offers **Check saved request**.
  It checks the original request without creating, copying, editing or sending
  anything on the server. Retrying the original save is a separate explicit action.
  Opening/restarting the app still never sends an unfinished request automatically.
- A recorded result stores the existing proposal ID in the device's encrypted
  recovery record. The app loads a fresh proposal for review; **Use saved proposal**
  or **Use saved copy** remains explicit. Checking alone never clears the draft or
  marks it accepted. An old preview is cleared before another review attempt.
- **Not recorded** means only that no committed receipt existed at the time of
  the read. A later save can still complete. Keep the original body and request
  ID; no automatic resend, reset, replacement identity or draft deletion follows.
- An unavailable historical proposal, denied access, missing migration/old server,
  malformed response, offline connection or timeout retains recovery. A known
  committed-but-unavailable result requires history review in the CRM.
- Existing edits have no durable creation receipt. They keep original revision
  checks and their current review/conflict workflow. Legacy empty copies retain
  one-shot/manual review protection; this package does not claim a safe lookup
  for them. Those operations are refused by the new status endpoint/service.

## Database and authorization

Migration **100**, `20261021060037_quote_request_status.sql`, adds only
`public.resolve_quote_draft_request(uuid,jsonb,jsonb)`. It selects the private
migration99 receipt, original actor, original payload hash and current quote
status. There are no table, policy, existing-function or default-privilege changes.
The catalog comparison confirms exactly one added routine, zero changed/removed
objects. Historical migration99 bytes remain unchanged.

The narrow definer function is necessary to read a ledger that has no API-role
table grants. It uses an empty search path, explicit authenticated-only EXECUTE,
`auth.uid()`, and current office-role/employment checks before and after waiting.
Anonymous and service roles cannot substitute for an employee; another active
employee or a different payload cannot recover the ID. No direct ledger access
is granted. Existing authorization, quote mutation/audit transactions, financial
behavior, pricing, RLS, provider behavior and all earlier work remain.

The resolver takes a **shared transaction advisory lock in creation's existing
namespace**. It waits for an already-held creator lock; concurrent readers may
share the lock. Lock timeout is two seconds and becomes uncertainty, never a
negative receipt. A five-second abortable server deadline bounds the RPC.
Read-committed isolation is required; older repeatable/serializable snapshots are
refused so a completed waiter cannot falsely report an absent receipt. SQL tests
execute the resolver in actual `BEGIN READ ONLY` transactions.

The mobile endpoint uses POST solely to keep saved text out of URLs and caches;
responses are `no-store`. It reuses the original, distinct create/copy validators
and exactly the same header/date/line mapping as creation. It does not revalidate
current contact activity or the copy's source; those may legitimately change
later. SQL still verifies the original actor and full original payload hash.
One RPC is attempted, with strict receipt/result parsing and sanitized errors.
No fallback creation command is available through this route.

Native checks remain account/environment/token-subject/lease bound. A returned
receipt is applied only to the exact saved candidate body, including when a
corrected candidate reused the same request ID. Checking does not increment the
send count. Nonpositive results do not rewrite even the encrypted file. The
existing encrypted format, device key, storage policy and draft contents remain.

## Verification

- All **100 migrations** replayed in a new empty local database; generated schema
  contracts and offline migration fingerprints pass. No source rows were copied.
- **23 new installed SQL scenarios /24 TAP results** pass: four office roles,
  original actor/body binding, active/inactive contacts, later edits/approval,
  deleted records, anonymous/service refusal, offboarding, revoked roles,
  read-only transactions and row fingerprints, stale snapshots, actual concurrent
  commit/rollback, revocation/offboarding while waiting, lock timeout, a negative
  lookup followed by a late successful save, and private grants. The test clone
  is dropped. No notification/provider writes occur.
- Prior durable-creation, creation-race, mobile draft/copy and edit-confirmation
  integration suites pass again with synthetic fixtures only. Their isolated
  clones/rollback behavior and socket guards are preserved.
- **2,098 regular platform results pass**, including 44 new status checks.
  Historical staging tests still require their exact approved targets. The new
  migration is explicitly pinned as deferred; staging99 is not declared schema100
  or hosting-ready. No historical candidate/active profile was rewritten.
- **59 Foundation Swift checks pass** (50 prior +9 new test methods). Actual
  models, encrypted store, API and service sources compile under Swift6; tests
  check exact read-only transport/body, positive receipt restart persistence,
  unchanged negative/unavailable/offline files, old-server/error refusal,
  malformed results, account/token switching, unsupported edits/empty copies,
  copy/source separation and exact-body/stale-lease reconciliation.
- Isolated Node22 typecheck and optimized web build pass with synthetic settings,
  no linked site and no credentials copied. SwiftUI source parsing, whitespace
  and the bounded UI detector pass. Native screen controls preserve existing
  Form/List, Dynamic Type and system accessibility behavior; no new fixed widths.
- Local SQL lint reports no errors; advisors add **no new findings** versus the
  same schema without the resolver. Existing local baseline warnings remain.
  Advisor index-use INFO counts differ with test activity; no indexes were changed.
- The shared local schema/ledger, all **110 public row sets**, policies,
  constraints, buckets and scan settings exactly match the baseline. The local
  admin still redirects unauthenticated callers (307); the new unsigned status
  endpoint refuses access (401).

## Files and release gates

Runtime: iOS quote editor/detail, FieldModels, FieldCache, FieldDataService and
MobileAPIClient; platform mobile quote adapter, new request-status route and
receipt parser. Tests extend MobileAPIClientTests/protocol support, add status
unit/SQL suites, update the existing adapter fixture and the exact local migration
inventory assertion. Generated types/schema manifest and deferred-migration
fingerprint track100. README/report updates document the behavior and gates.

**Not yet applied to shared local, staging or production:** migration100 was
installed only in fresh disposable databases. Staging remains the last reviewed
99-migration target. Reconcile100 against staging with a separate exact catalog,
permission/default/guard review before any hosted activation or app release.
A server missing the new function fails closed and keeps the device request.

**Native acceptance remains outstanding:** full Xcode, native XCTest, Simulator/
device interaction and real Keychain/lock-unlock testing are unavailable with
Command Line Tools alone. The Foundation adapter uses synthetic Auth/URLProtocol/
injected key fixtures; it does not emulate Supabase SDK refresh or test issued
credentials. No native screenshots or device UI acceptance are claimed. Before
release, verify relaunch, offline/late save, review/acknowledgement, rapid taps,
large text/VoiceOver and account changes on an iPhone.

The next practical step is the targeted **staging reconciliation for migration
100**, preserving the existing hosting/scanner/rollout gates. Atomic empty-copy
receipts and a global recovery inbox remain separate follow-up work.

Private local evidence:
`/Users/noelsierra/Documents/Codex/2026-10-21/quote-request-status/`.
