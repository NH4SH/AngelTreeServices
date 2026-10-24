# Manual reminder scheduling and retry safety

October 23, 2026. The verified reminder-cancellation fix is pushed normally to main as `4c73280`. This continues the existing PR14 communication preparation/recovery work. The new batch is verified locally and with rollback-only staging fixtures, remains local and undeployed, and needs **no migration**.

## Confirmed problems and resulting behavior

The saved original action reproduces two defects with actual local Auth/PostgREST and synthetic subjects: a cancelled schedule is acknowledged as “Reminder scheduled” when its minute-based key collides, and retrying Send now across a minute boundary creates a second queue identity. Neither reproduction calls an email provider. No production incident is inferred.

Each new manual request now keeps one UUID, saved on the device before dispatch and scoped to the signed-in actor, record, communication type and action. The server derives its queue key from the authenticated actor and UUID. It reads that key before creation, handles native unique-key races, and checks the returned row's identity, owner, mode, record, type, recipient and requested schedule before reporting a result or invoking the existing processor. Read errors never become absence; failed, lost or malformed insert acknowledgements require review. Raw backend diagnostics are not returned.

Retrying a saved request reuses its queue row and existing provider key. Status checks are read-only and never create, claim, send, release or rotate a missing request. Cancelled/skipped/failed/processing entries retain their actual outcomes instead of reporting a new schedule. Accepted delivery is acknowledged without a resend; accepted-but-unrecorded and uncertain outcomes retain review warnings and holds. A pending Send now request can resume through the existing fenced processor. Scheduled requests never invoke a sender from this action.

An uncertain request can be edited **using the same UUID**. If earlier details committed while a response was lost or delayed, those details win and the changed submission is refused without replacement or a second row. If no earlier insert committed, the revised details may create that one row. Finding no row does not authorize forgetting the request. Preparing a separate reminder requires a recorded queue identity and an explicit action; send requests with pending/processing/failed outcomes cannot silently start over.

The forms retain the CRM's current appearance. Saved details replace editable fields during retry, previous requests survive reload, and less frequent status checks sit under “Saved request options” once the request is recorded. New scheduling, explicit separate reminders, edits to unconfirmed details, current recipient selection, cancellation and history remain available. The first visual check exposed competing buttons and stretched cards; one correction grouped status checks progressively, removed the disabled retry control after confirmation, restored secondary styling and bounded text wrapping.

## Preserved boundaries and deliberate functional changes

Existing owner/admin/estimator/payroll-admin access, stored-role/effective-access checks, caller-scoped Supabase clients and native RLS/rights remain unchanged. The actor ID passed by the page scopes device storage; it is never server authorization. There is no new table, privileged command, grant, policy, service-role fallback or schema change. Unsupported record/type combinations are rejected early, including a payment confirmation without a payment subject; actual payment receipt creation and explicit receipt cancellation are untouched.

Intent identity replaces the old minute-based coalescing. Separate, explicitly prepared requests can have separate rows, even in the same minute; an existing request is never reused merely because its minute matches. The existing processor, source checks, recent-send intervals, native dispatch leases, frozen payloads, accepted/uncertain holds and provider keys remain authoritative. The native concurrent-distinct-request test permits exactly one synthetic transport call. No worker, provider adapter, template, automation setting, financial command or historical delivery identity is changed.

The server does not reopen or rewrite legacy queue rows or convert their keys. Existing direct database update rights remain; this is safe application request/retry behavior, not a new universal database write boundary. Queue rows and keys must remain retained for this request identity to survive; a future purge/retention design must preserve equivalent tombstones. Device-local recovery is not a cross-device inbox or a backup after storage is erased. Corrupt/unavailable storage blocks the new form; a failed persistence attempt cannot dispatch a new request.

## Verification

| Check | Result |
| --- | --- |
| Full CRM regression suite | **2,694 passed**, zero failures/cancellations/skips |
| New focused action/storage cases included above | **21 passed** |
| Route types, TypeScript, optimized build and installed framework floor | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| Fresh owned seed-free local database | All original **123 migrations** replayed without a shared reset |
| Native local and staging authorization/uniqueness checks | **25 assertions each**, fixtures rolled back and full before/after state equal |
| Actual local Auth/SDK/actions/processor/native delivery commands | **24 scenarios / 25 TAP results**, synthetic transport only |
| Real unique-key concurrency | Uncommitted winner observed blocking the insert; replay acknowledges the same row; simultaneous schedules converge |
| Duplicate/unknown outcomes | Same-request replay and distinct-request concurrency do not add transport calls; uncertain acceptance remains held |
| All existing entry points | Quote, invoice, job, schedule event and legacy appointment; organization-only invoice billing recipient |
| Financial/history preservation | Invoice money and a pending payment receipt remain exact; native source/global/delivery facts preserved where no send is intended |
| Schema and source/type fingerprints | Fresh native and offline checks passed; original migrations, generated types, schema manifest and dependencies unchanged |
| Security advisors | Local has no findings; staging's existing **80 findings** exactly unchanged |
| Rendered local UI | Keyboard schedule, reload recovery, read-only check, accurate cancelled outcome and explicit new request passed; native rows/history agree |
| Desktop and detector | 1280×720, no horizontal overflow or browser errors; detector found zero issues |

Native SQL uses ten synthetic identities with actual existing RLS, actor-linked rows and the native unique index. It verifies allowed staff, denied nonstaff/disabled/separated subjects and forged metadata, first-writer preservation, changed-body refusal, status review, existing DELETE denial, source money, sending defaults and no delivery/payment effects. Hosted authorization tests use simulated session claims in caller-owned rollback transactions, not a deployed staging app or hosted Auth-session acceptance.

Actual local API tests include both original-action reproductions, lost committed insert responses, pre-forward/read/source faults, read-only missing/pending/past status checks, changed details, all nonpending outcomes, observed unique-index waits, same-key concurrent creation, real processor/native durable acceptance and holds, all four staff roles, removed membership, old disabled/separated sessions, five entry points, organization-only billing and retained receipts. The final API run makes four synthetic transport calls across the intentional acceptance/uncertainty cases; **zero real provider requests** occur. Acceptance may legitimately need source/history reconciliation: tests require the honest success or review-warning outcome and one transport call, rather than treating provider acceptance as proof all follow-through finished.

One incumbent worker test using a one-millisecond preclaim margin failed while the final build ran concurrently. The unchanged focused suite and complete suite passed after the build finished; no expectation or production worker code was changed. Initial local SQL assumed hosted table-grant parity; its assertion was replaced by an actual native DELETE authorization test, preserving both environments' existing grants/RLS. Local preservation snapshots were run after mutable API fixtures completed. Raw diagnostics and successful final evidence are retained privately.

Build/unit/schema checks copy no ignored environment files or provider credentials and attempt no external application requests. The preview's two framework npm version/advisory lookups were blocked before dispatch. No real mailbox, mobile viewport/device or spoken-reader acceptance is claimed; those existing acceptance tasks and the separate managed-runtime follow-up remain open.

## Staging, cleanup and release boundary

ATS CRM Staging (`gbyhdsuiqeslgjdnbqng`) remains exactly at **123 migrations**, latest `20261024014934`, with **5,112 catalog objects** and **49 protected business/Auth/history sets**. Fresh read-only maintenance confirms the full ledger/catalog, document/approval bindings, defaults and no-send Auth guard. Automatic sending, appointment notices and recurring generation remain OFF. No hosted installation, production query/change, app deployment, activation, historical retry or key rotation occurs.

Only this task's temporary preview/tab and newly owned loopback database are stopped; synthetic data is retained. Shared databases, scanner operations, unrelated review artifacts and runtime-security checkpoint `06580f6` are preserved. The batch is saved locally on `codex/manual-reminder-retry-safety`, containing current main `4c73280`, pending a separate push request. Existing owner-policy, real mailbox/device/accessibility and managed-runtime work stays in the existing roadmap.

Sanitized receipt: `staging/MANUAL_REMINDER_RETRY_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/manual-reminder-retry-safety/`, including original source/reproduction, native fingerprints, SQL/API/build logs and the saved/cancelled request images. Raw snapshots, Auth identities, synthetic credentials and diagnostics remain outside Git.

### Queue visibility follow-through

This verified request/retry batch is pushed normally to main as `2940f0e`. `COMMUNICATION_QUEUE_VISIBILITY.md` records the next focused PR14 read-only follow-through: complete paged scheduled/failed/history queue sections, due-time ordering before pagination, exact caller-scoped totals and honest read-error/empty states. Stable manual request identities, cancellation, native sending safeguards and historical deliveries remain unchanged. The new batch stays local and undeployed.
