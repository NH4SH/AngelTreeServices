# Internal review and cancellation safety

Verified October 22, 2026. Manual approval commit `9073592a5e4321350e7e7bda646b7ec1a380d228` is pushed to `main`. This next batch is a separate local implementation. The branch also preserves website commits through `047899b`. No application deployment or production change was made.

## Result

Requesting review, approving internally, returning for clarification, and cancelling previously used separate header and activity writes without binding the action to the version the office reviewed. They now use one `transition_change_order_workflow(request, addition, reviewed_revision, intent)` transaction. Existing statuses, office roles and available actions remain intact.

The command serializes the request, locks the work order before the addition, checks the current revision and allowed transition, derives the actor from Auth, and rechecks live office access after waits and transaction work. Approval also requires nonempty lines with a matching subtotal. Approved or billed additions cannot be cancelled or reopened through these actions. Legacy additions without a job retain their existing nonfinancial review/cancellation capability.

Status, review/cancellation metadata, mandatory activity and a private receipt commit together. Late audit or receipt failures roll everything back. A matching retry returns the original receipt with the current record's status and revision; it never reapplies the old transition over later work. Another actor, intent or reviewed version cannot reuse that request. Receipts survive target deletion as tombstones rather than silently recreating work.

## Access and review invalidation

Migration `20261022143008_atomic_change_order_review_transitions.sql` blocks direct authenticated status, internal-review and cancellation-authority writes. Its authority trigger uses SECURITY INVOKER so direct Data API callers retain their actual database role. Trusted commands and the existing service-only portal/delivery paths retain their authority. The separate manual-approval boundary and approved-record protections remain unchanged.

The public command uses SECURITY DEFINER with an empty search path, authenticated-only execution, live staff checks, version checks and actor-bound receipts. Its receipt table is private, has RLS with an explicit restrictive deny policy, and has all client grants revoked. There are no new browser-readable authorization records.

Changing business details or actual line content while an addition is `ready_to_send` now returns it to `pending_internal_review`, clears its previous review metadata, and records one invalidation event inside the edit transaction. Timestamp-only touches do not invalidate it. Multi-line edits do not produce an invalidation event per line. A failing edit rolls back the invalidation too. Already-sent additions keep their existing status and secure-link behavior; this batch does not introduce a new resend or customer-notice policy.

## Recovery and interface

The existing CRM appearance and cancellation confirmation are retained. Forms submit the loaded version and one opaque request ID. A stale result disables workflow controls and offers the current record. Unknown responses retain the original request and intent; ordinary actions stay disabled until it is resolved. “Check earlier action” remains available after reload even when the original button is no longer present in the new status. Browser storage contains only request/source IDs, revision and intent, with no names, notes, prices, tokens or credentials. If storage is unavailable, recovery remains available in the current page; another tab/device or cleared storage requires reviewing current history.

Two interaction defects found during browser verification were fixed: refreshed records now receive a workflow panel for their saved revision, allowing consecutive actions without a manual reload; forms also supply React's action binding so an early click cannot become a native GET navigation before hydration. Recovery acknowledgement permits the next action even when replay itself makes no database change.

Cancellation does not create a notice or call an email provider. Existing delivery validation rejects a prepared but unclaimed approval email after source cancellation. An already-claimed or in-flight provider request cannot be recalled; the success message therefore promises cancellation only, not that all prior communications were prevented.

## Verification

- Fresh seed-free native Supabase replay: **110 migrations**, generated schema and contract matched. The primary development app and database were not reset.
- **223 rollback assertions:** 39 new workflow, 40 manual approval, 35 copying, 39 editing, 34 customer approval and 36 appointment notices. Includes direct status/actor forgery, stale actions, every allowed transition, request collisions, late failure rollback, edit invalidation, sent-link preservation and prepared-email suppression after cancellation.
- **Eight authenticated API concurrency scenarios:** identical cancellation retries; cancellation versus review; offboarding during a parent-lock wait; line editing during review wait; atomic editing versus internal approval; manual approval versus cancellation; portal approval versus cancellation; lost review acknowledgement after later cancellation.
- Existing invoice generation: **30 scenarios passed**. Financial totals, scope application, work completion and invoice generation retain their established behavior.
- **2,233 CRM checks passed**, zero failed/skipped. Typecheck and isolated optimized Next.js build passed against the final source. UI detector: no findings.
- Browser verification at 1280/390 pixels: all four actions, keyboard submission, consecutive transitions, stale conflict/reload, and no mobile horizontal overflow. The existing native cancellation confirmation remains in code; automated dismissal of that native dialog was not separately verified.
- A local-only proxy withheld a successful action response after commit. After a later source edit and page reload, the original review button was absent. “Check earlier action” recovered the original result, followed by a successful internal approval. Database proof showed **one request receipt and one review-request history event**. No runtime browser warnings/errors occurred after the final source was loaded; two temporary preview-copy compilation errors were resolved before this test. Preview and optimized-build source hashes match the repository.

Staging's native preflight selected only migration 110. An initial transport error occurred before application; a bounded retry succeeded. Installation and all **39 rollback-only synthetic assertions** passed. Selected existing rows, Auth users, communication settings and unrelated routines matched before/after. Staging automatic sending and appointment-change notices remain OFF. This was a database-only staging verification; no hosted staging app was deployed or claimed as UI acceptance.

Security advisors added one intentional authenticated SECURITY DEFINER warning for the guarded workflow command (65 → 66), with no other additions/removals. The private command boundary requires that execution model; the explicit role, actor, revision, grants and invoker-trigger checks enforce its intended access. See the [Supabase advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Release and next priority

Production remains on migration 102 and its existing published app. Production and staging deploy IDs and hosting settings are unchanged. No credentials, production rows, scanner settings or sending switches were changed, and no real provider was called. The task's synthetic office accounts were disabled and its temporary app/proxy/database stopped with data volumes preserved.

Coordinate migration 110 with the updated app in the established release process: the old hosted workflow form's direct status writes are intentionally incompatible with the new boundary. The original 93-migration staging candidate remains unchanged; this addition is recorded in the deferred inventory (110 total, 17 deferred).

The next focused priority is the change-order sending boundary: verify preparation and recovery against the reviewed source version and define safe handling of edits after an approval email has already been sent. Preserve the current customer-link behavior until that policy and its delivery transaction are explicitly implemented. No new resend policy is included here.

Evidence: `staging/CHANGE_ORDER_REVIEW_CANCELLATION_VERIFICATION_20261022.json`. Local screenshots and private test logs are retained outside Git in the dated task evidence directory. Pre-existing Impeccable artifacts remain outside this commit.
