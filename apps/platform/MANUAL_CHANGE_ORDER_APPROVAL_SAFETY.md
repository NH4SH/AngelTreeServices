# Reviewed manual change-order approval and retry recovery

Verified on October 22, 2026. The copying/recovery commit `b441e8d93112cce2cabf29f4ebcba05f46619797` is pushed to `main`. This follow-up is a separate local implementation; no application was deployed and production was not changed.

## Priority and result

After protecting customer approval, editing, and copying, manual approval was the remaining financial authorization entry point that could authorize contents changed since the office loaded the page. Its old authenticated RPC accepted no reviewed version and accepted a caller-supplied recording actor. Direct staff header writes could also set approval status or metadata.

Migration `20261022134716_bound_manual_change_order_approval.sql` adds `record_change_order_manual_approval(request, addition, reviewed_revision, documented_permission)`. It checks the reviewed revision under the same work-order-before-addition locks used by editing, customer approval, and invoice generation. It derives the recording actor from the live authenticated user, validates active office access after waits, and requires the existing approver name, non-portal authorization method, and documentation notes. Active organization approval contacts, contracting party, property, nonempty scope, and line/subtotal consistency are checked before approval.

The command reuses `approve_change_order` for the existing scope snapshot, job projected value, and mandatory approval audit. Its body and service-role portal access are unchanged. Phone, email outside CRM, in-person, signed-paper, and other documented methods remain available to the same office roles. Manual authorization is not subject to the portal-link expiry; documented off-portal approval remains a separate existing capability. Approved/closed/billed records cannot acquire a replacement manual authorization through a new request.

Approval, scope, job value, audit, and private receipt commit together. A final receipt failure rolls all earlier writes back. Exact retries recover the immutable receipt without duplicating work scope, history, or emails, including after a later record refresh. Reusing a request with another actor, version, or documentation is rejected. An active-access check also runs after the underlying transaction work, covering an offboarding change during a downstream wait.

## Database boundary

Authenticated execution of the old unversioned `approve_change_order` is revoked. The new office command invokes it as its owner; the existing service-only customer-portal workflow keeps its original access and checks.

A small SECURITY INVOKER trigger rejects direct authenticated inserts/updates that set approval authority: approved status, approver, recorded-by identity, authorization method/notes, approval time, or scope-application time. It deliberately sees the caller's effective database user. The reviewed command runs as its owner; direct Data API writes run as `authenticated`. Existing service and trusted maintenance paths remain intact. Existing approved-record immutability guards are retained; invoice linking still works and is covered by the invoice integration suite.

The new receipt table is in `app_private`, with RLS, an explicit restrictive deny policy, and all client grants revoked. The public command has an empty search path, strict input keys, bound actor/payload receipts, request serialization, and explicit authenticated-only execution. It does not expose notes, names, costs, tokens, or contact details in its receipt. Its nullable target FK preserves a tombstone if a target is removed.

## Form behavior

The existing form and CRM appearance are preserved. It submits the loaded review version and an opaque request ID. Unsaved name and documentation remain visible after a rejection. A stale review disables approval and offers the current record in another tab so the unsaved documentation remains available.

An uncertain result keeps the same request. Changing authorization details while that result is unknown is blocked; retrying the same details checks the original request. Navigation and refreshed approval display happen only after a matching positive acknowledgement. A confirmed approval removes the obsolete manual-approval controls through the refreshed record.

The existing draft-attempt helper stores only request ID, input digest and version in session storage. It never stores authorization names or notes. If the page is reloaded before commitment, the user must re-enter the same details to retry that pending request. If approval already committed, the refreshed record shows its approval history. Clearing storage, using another tab/device, or disabled storage limits this browser recovery; database receipts and history remain durable.

## Verification

- Fresh, seed-free native Supabase replay of all **109 migrations**, using a dedicated loopback stack; the primary development app/database were not reset.
- **184 rollback assertions:** 40 manual approval, 35 copying, 39 editing, 34 customer portal approval, and 36 appointment notices.
- **Six new authenticated API scenarios:** simultaneous identical retries; competing authorization requests; offboarding during the parent-lock wait; approval versus atomic editing; lost acknowledgement after a later refresh; manual versus customer-portal approval. Each race preserved a single valid authority/scope result.
- Existing invoice-generation integration suite: **30 scenarios passed** (31 tests including the parent). Updated fixtures build line items before closing a record. Legacy-corruption tests now verify normal approved-record writes are denied, then inject corruption only through the guarded disposable maintenance connection. The approved-line concurrency test expects the established denial after its parent wait. No application protection was relaxed to accommodate old fixtures.
- **2,227 CRM checks passed**, zero failed/skipped; typecheck and isolated optimized Next.js build passed.
- Browser at 1280/390 pixels: keyboard name-to-method order; stale approval blocked; name/notes retained; no horizontal overflow; no captured browser warnings/errors.
- A loopback-only test proxy withheld the successful approval response after commit. The form retained its details and offered safe retry. Different documentation was blocked while uncertain. Restoring the original documentation recovered the approval, with exactly **one receipt, one approval audit and one scope item**. The final page showed the original approver, method, notes and approved state.
- Impeccable detector: no findings. Runtime source fingerprints match the source preview and optimized build.

Staging's native dry run selected only migration 109, with no seed or role scripts. Installation and all 40 synthetic rollback assertions passed. Existing selected business rows, Auth users, communication settings and unrelated routines matched before/after. The old approval function's body seal matched; its authenticated execute permission was removed while service-role execution was retained, as intended. Staging automatic sending and appointment-change notices remain OFF. No hosted UI was deployed and no real provider was called.

Security advisors have one intentional new warning for this guarded authenticated SECURITY DEFINER command (64 → 65). No other advisory was added or removed. This is the existing command boundary used to keep private receipts and authorization writes out of client control; the invoker trigger and role/actor/version checks independently enforce that boundary. See the [Supabase advisory explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Release and remaining work

Production remains on its existing published app and migration 102. Neither production nor staging app deploy IDs changed. No production data, scanner setting, credential, sending switch, or provider was modified.

Migration 109 intentionally disables the old authenticated approval entry point. Coordinate it with the updated application during the established release process; the old hosted manual-approval form will not be compatible once that migration is installed. The separate staging database now has this boundary, while its old hosted app is intentionally undeployed. Do not treat a database-only staging test as hosted UI acceptance.

The next focused safety item is internal review/workflow transitions: bind request-review, internal approval, clarification return, and cancellation to the reviewed revision and transactional audit/retry receipts. They remain their existing separate actions in this batch. Customer approval, editing, copying, financial totals, invoice generation, scheduling, employee controls, and scanning retain their completed implementations.

The synthetic local staff were disabled and the task-only web/proxy services and database stack were stopped after verification, preserving local data volumes. Pre-existing Impeccable artifacts were preserved outside this commit.

Safe evidence: `staging/MANUAL_CHANGE_ORDER_APPROVAL_VERIFICATION_20261022.json`.
