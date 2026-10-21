# Mobile draft and request recovery across restarts

## Result and scope

Verified copy protection `5620ac3` was pushed atomically/nonforce to main and
its preserved branch. This PR05/PR12 follow-through is local on
`codex/mobile-quote-recovery`, aligned with main `53a06e8`, pending push. Separate
website updates `f429e39` and `53a06e8` are preserved; neither changes CRM/Supabase
source. No deployment, hosted database/configuration/production operation,
provider sending, scanner change or new paid service/account is involved.

## What is recovered

- Opening New Proposal restores the account's unfinished new-proposal editor.
  Opening an existing proposal restores its local edit through Edit/Recover local
  edit. Copy recovery is attached to the source proposal. Nothing is submitted
  merely because the app or a screen opens.
- Drafts retain raw input: partial/invalid quantity and price strings, line order
  and local/persisted IDs, multiline wording, party/property/contact selections,
  expiration, original edit revision/capability and the creation request UUID.
  Extreme unfinished numeric input cannot crash the recovered editor's total.
- An unsent draft is editable. A pending request retains the exact submitted
  body, kind, UUID and original edit revision. Inputs stay protected while that
  request needs confirmation; recovered wording is selectable for manual review.
  Removed properties/contacts do not silently substitute another selection.
- New/copy retries reuse the installed migration99 request transaction and its
  existing strict receipt checks, actor/payload binding and live permissions.
  Edits retry the original revision, never automatically rebase. If a lost edit
  already saved, its conflict keeps the local work and offers current-record
  review; there is no invented idempotent edit receipt.
- First confirmed saves retain normal navigation. Replays require review. An
  acknowledged result leaves a local completed receipt, covering a crash before
  navigation. New/copy creation then needs an explicit new intent; opening an
  acknowledged existing record for editing can start a fresh revision-bound edit.
- Local edit recovery remains accessible when the source is closed, and through
  the existing detail entry point if the cloud record is unavailable. This does
  not allow editing a closed/missing record: unchanged server rules still refuse.
  Local copy recovery can use its stored snapshot even when its original detail
  cannot load. There is no global recovery inbox in this pass.

## Storage and isolation

`QuoteRecoveryStore` is separate from ordinary FieldCache/ScheduleCache, so normal
logout/cache clearing preserves uncertain work. Scope is the authenticated UUID
plus the configured Supabase URL and API base URL, with separate new/edit/copy
contexts. Filenames are hashed; draft/request contents are never plaintext files,
auth tokens or service keys. No additional environment secrets are required.

Each scope uses a random 256-bit key held in the app's default Keychain access
group. Files use CryptoKit AES-GCM with scope/context authenticated data, atomic
replacement, owner-only permissions, backup exclusion and iOS complete file
protection. Keys use [WhenUnlockedThisDeviceOnly](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly)
and no Keychain synchronization; encryption uses [Apple CryptoKit](https://developer.apple.com/documentation/cryptokit/aes/gcm).
The app's existing Application Support storage is required; recovery never falls
back to temporary storage. It is device-local, not cloud/backup/device-migration
recovery. Reinstalling or deleting app data can lose these records.

Unreadable/corrupt/future-format files, unavailable/invalid keys and failed writes
fail closed. Missing keys are not silently replaced over existing ciphertext.
The draft and immutable request are written before a mutation; a persisted
possible-send counter is updated before each API call. Storage failure prevents
that call. A failed receipt write after HTTP keeps the original pending request.

The service checks account ownership before/after recovery reads and results,
checks environment scope and binds the outgoing JWT subject to the draft owner.
That subject check is scope binding, not signature or role authorization: the
unchanged server still verifies tokens and live office access. Cached role claims
or local recovery data never grant server permissions. Changing accounts during
a response cannot expose/acknowledge the previous account's result.

One app-owned actor serializes writes. Each open editor has a lease; another editor
or acknowledgement invalidates stale writers. Typing coalesces into one writer
and one latest snapshot, rather than retaining an unbounded task queue. Close
flushes the latest fields; failure offers Keep editing or an explicit close
without the latest changes. An in-flight send cannot be discarded by another
editor. There is no automatic expiry of uncertain requests.

## Rejections, manual review and preserved behavior

The client's only special prewrite rejection is the existing HTTP 400
`invalid_quote` response on the protected create/copy/edit routes. On a first
possible-send only, this can unlock corrections. Raw fields, the original body
and UUID remain saved; corrected creation details keep that UUID. A later
validation error after uncertainty, unknown error, timeout, auth failure or
conflict cannot silently replace the pending request. Retained rejected requests
also prevent ordinary reset/identity rotation without explicit review.

Historical empty copies retain their legacy endpoint. Their local possible-send
marker now survives restarts/logout and cannot be replayed. An uncertain empty
copy requires manual proposal review; this is not a new server-side empty-copy
receipt. Older installed clients retain their current contracts.

Discarding recovery is a separate, explicit confirmation after reviewing the
proposal/list. It discards only this device's draft/request and does not delete,
void, edit or undo any cloud record. An uncertain request may already have saved;
manual review is still an operator decision, not proof of non-commit. No uncertain
request is automatically discarded on error or app restart. Authoritative read-only
request-status lookup and an atomic empty-copy receipt remain worthwhile next
server follow-ups.

Existing atomic quote editing, copy wording/capacity, prices, original invoice/
completion/payment safeguards, authorization/RLS, cache/logout behavior, history,
providers and production settings remain. No SQL migration, generated schema,
cloud configuration, new dependency, Xcode project regeneration or secret change
was required. CryptoKit/Security are system frameworks. Ordinary mobile editor
field limits/normalization remain the existing server behavior.

## Verification

- **50 Foundation Swift model/API/service checks passed** (25 prior +25 new).
  Actual repository test bodies run against the actual Foundation source with a
  private assertion adapter. New checks cover encrypted round-trip, raw partial
  fields, scope separation, ciphertext swapping/tampering, lost keys, unknown
  format, immutable bodies, stale leases, completed receipts, storage failure
  before send and after HTTP, restart retries for creation/copy, original edit
  revision/conflict, one-shot empty requests, logout, wrong JWT subject/environment,
  account switching and party reads, safe SDK errors, first rejection/corrections and retained uncertainty.
- **Four independent OS processes passed**: write draft/pending possible-send,
  reopen/read it, confirm/acknowledge, and reopen the completed receipt. Real
  Foundation/CryptoKit files are used; fixtures and keys are synthetic and the
  temporary process vault is removed. No actual Mac Keychain item was created.
- **2,054 regular platform results passed. 37 installed SQL scenarios /39 TAP
  results passed** across mobile draft/copy and edit-confirmation suites. Existing
  live roles, receipts, source changes, counts, conflicts and rollback guarantees
  remain; all fixtures/savepoints/outer transactions roll back.
- Isolated Node 22 typecheck and optimized web build passed with synthetic settings
  and no linked site/credentials. Web runtime and Supabase source are unchanged.
  Offline schema99 fingerprints and whitespace checks pass. Final source hashes
  are recorded with the evidence; incoming main changes are website-only.
- All 110 existing local public row sets, function definitions, ledger, policies,
  constraints, buckets and scan switches exactly match the pre-test baseline.
  The local admin remains200 and unsigned copy creation401.

The Swift harness compiles actual model, storage, service, API and configuration
code, using the existing Auth protocol declaration. URLProtocol/Auth/key adapters
supply synthetic transport/session/key behavior; it does not emulate Supabase SDK
refresh or test real issued credentials. This is not a new committed SQL race or
mobile-device end-to-end acceptance run; existing SQL boundaries are unchanged.

**Native XCTest, full Xcode/iOS build, Simulator/device screen interaction and
real device Keychain/lock-unlock behavior remain unverified:** only Command Line
Tools is installed. SwiftUI/AppModel/test-support syntax parsing passes. Before
releasing, test kill/relaunch, locked-device save failure, rapid typing/close,
account/environment switches, old-server refusal and copy/edit review on iPhone.
Autosave is best effort until its write completes; an immediate forced kill can
lose the latest unsent keystrokes. Mutation requests await persistence first.

Runtime changes are in the existing iOS AppModel/configuration, quote editor/detail,
FieldModels, FieldCache, FieldDataService and MobileAPIClient files. Tests extend
MobileAPIClientTests and existing protocol support. No new source registration
or framework package is needed. Native tests remain in the existing Xcode target;
platform checks and opt-in SQL commands are documented in tests/README.md.

Private evidence:
`/Users/noelsierra/Documents/Codex/2026-10-21/mobile-quote-recovery/`.
