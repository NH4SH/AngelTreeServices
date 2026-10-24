# Complete reminder queue visibility

October 23, 2026. The verified manual reminder scheduling/retry batch is pushed normally to main as `2940f0e`. This continues the existing PR14 communications recovery work. The new visibility batch remains local and undeployed and needs **no migration**. The independent website update `b184367` is included with a normal fast-forward.

## Confirmed problem and change

The current communications page fetches the newest-created 30 pending rows and only then sorts those rows by due time. Older reminders due sooner disappear from that preview. Failed and recent queues stop at 20 entries without page controls. Their page lengths are also used as summary totals. An actual local caller-scoped PostgREST reproduction with 1,003 pending synthetic reminders confirmed that the old query hides earlier-due records; this is not evidence of a production incident or of missed customer delivery.

The three queue sections now use independent 30-row pages with exact counts under the caller's existing RLS. Scheduled reminders sort by due time before pagination; failures sort by latest update; history retains newest-created ordering. UUID is the deterministic tie-breaker. Every page has its range/total and keyboard-accessible Previous/Next links above and below its rows. Navigation keeps the other queue pages and the current lead/search/block context and anchors to the relevant section.

Pending and failed-reminder summaries now show actual queue totals, not page lengths. The old mixed “Recent failures” figure combined two bounded sources that could describe the same delivery. “Failed reminders” now reports only the exact failed queue total. Document-email failures remain available in the existing history and an explicitly labelled latest-email-record summary; its existing 30-record scope and “Recent accepted” meaning are preserved.

A failed, incomplete, malformed or timed-out read produces an unavailable count and a section-specific refresh message, never “no reminders” or a zero total. Other healthy sections remain usable. A genuine zero is still an empty state. A stale URL pointing past the end of a shrinking queue gets one bounded recount and last-page recovery; another race fails clearly. All related requests share a five-second deadline. The scoped styles keep anchor headings below the mobile header and keep each status marker next to its text rather than spreading them across the row.

## Preserved behavior and limits

This is a read/presentation change. Existing record links, status/reason text, staff/effective-access checks, RLS, grants, queue identities, pending/processing/accepted/uncertain holds, cancellation, manual request recovery, worker/processor logic, provider adapters, templates, automation settings, immutable history and financial commands are unchanged. No new privileged client, database command, permission, setting, dependency, migration or sending/retry path is introduced. Reads use the existing signed-in server client.

These are pages of a live queue, not a single frozen snapshot across clicks. Concurrent processing may move entries between pages; refreshing reviews current state. Exact counts can time out as data grows; the UI then reports unavailability instead of inventing a total. Record-detail reminder/history previews, dashboard previews, website-lead context and the latest document-email history remain their existing bounded views. This batch does not claim a global historical archive or change retention.

## Verification

| Check | Result |
| --- | --- |
| Full CRM regression suite | **2,733 passed**, zero failures, cancellations or skips |
| New focused reader/component cases, included above | **39 passed** |
| Existing manual scheduling/retry cases | **21 passed** separately and in regression |
| Actual local Auth/SDK/PostgREST integration | **9 scenarios / 10 TAP results**, 135 caller-scoped GET/HEAD requests |
| Complete data and ordering | All **1,003 rows in each of three views** appear once in native order across 34 pages; tied dates retain ID order |
| Actual access and errors | All four staff roles allowed; nonstaff, forged user metadata, disabled/separated/removed old sessions and anonymous clients cannot enumerate the queue; read outage and native out-of-range recovery checked |
| Native local and staging checks | **31 assertions each**, synthetic fixture transactions rolled back with full before/after protected state equal |
| Financial/delivery preservation | Exact queue-row fingerprint, invoice money/status, defaults, payment count, outbound history and email facts unchanged by API reads |
| Schema and security | All original **123 migrations** replayed in a fresh owned local database; fresh native/offline schema/type fingerprints passed; local advisors zero, staging's existing **80 findings** exactly unchanged |
| Typecheck/build | Route type generation, TypeScript, installed framework floor and optimized build passed on Node **22.23.4**, Next **16.4.2**, React/DOM **19.2.9** |
| Rendered UI | Keyboard page navigation, independent pages/filter preservation, genuine empty response and controlled read outage checked; no console warnings/errors or horizontal overflow at **1280×800** and **390×844** |
| Concurrent main compatibility | **239** website Node tests and **9** Python tests passed; unchanged public build and validation passed on Python **3.13.16** |
| Design detector | Zero findings in the changed page/section |

The native SQL fixture uses synthetic parties/records and ten synthetic identities. It checks all six queue outcomes, exact count/page filtering, native tied-time ordering and caller visibility without claiming a delivery, sending, cancelling or modifying source money. Hosted authorization uses simulated session claims in caller-owned rollback transactions, not a deployed staging application or hosted Auth-session acceptance.

Actual local API scenarios use real sign-in sessions, the installed SDK and the same reader the server wrapper calls. The synthetic dataset exceeds the standard API cap in each view. Requests during queue acceptance are restricted to GET/HEAD against the local queue endpoint, and all external application requests are blocked. Browser outage/empty-state tests use a private, local-only response shim; no shim or test flag is part of the application. Browser checks confirm committed navigation URLs before reading results. Mobile viewport checks are not physical-device or spoken screen-reader acceptance; no real mailbox was used.

Initial test-harness setup needed an SDK import-path correction, JSON boolean serialization and a server-compatible component-tree harness; no application expectations or production boundaries were weakened. The first public build used macOS Python 3.9, which cannot parse existing f-string syntax. Its already-passing 239 Node/9 Python tests were retained; the unchanged build/validation passed using the installed Python 3.13.16. Raw diagnostic evidence remains private.

## Staging, cleanup and next step

ATS CRM Staging (`gbyhdsuiqeslgjdnbqng`) remains exactly at **123 native migration entries**, latest `20261024014934`, with **5,112 catalog objects** and **49 protected business/Auth/history sets** unchanged. Fresh read-only maintenance validates the pinned staging identity, full ledger/catalog, document/approval bindings, no-send Auth guard and disabled automatic-sending, appointment-notice and recurring-generation switches. No hosted install or app deploy is performed.

Only this task's loopback preview, temporary browser tabs and new owned database are stopped, retaining synthetic data. Shared databases, scanner operations, unrelated review artifacts and separate runtime-security checkpoint `06580f6` are preserved. No production query/change, real provider request, customer email, historical retry or key rotation occurred. Framework npm version/advisory attempts from the development preview were blocked before dispatch.

The batch stays local on `codex/reminder-queue-visibility`, containing current main `b184367`, pending a separate push request. The next focused PR14 follow-through is accurate **record-level next-reminder/last-sent visibility despite bounded recent history**, reusing the same read-only and caller-scoped boundaries. Owner-policy decisions, real mailbox/device/assistive-technology acceptance and the separate managed-runtime follow-up remain in the existing roadmap; none is silently marked complete here.

Sanitized receipt: `staging/COMMUNICATION_QUEUE_VISIBILITY_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/reminder-queue-visibility/`, including old-query reproduction, native snapshots, SQL/API logs, build/test logs and before/desktop/mobile/error screenshots. Credentials, Auth identities, raw catalog/business snapshots and local fixture data remain outside Git.

### Record-summary follow-through — October 24, 2026

This verified queue-visibility batch is pushed normally to main as `d39e87c`. `RECORD_REMINDER_SUMMARIES.md` records the next focused PR14 follow-through: next-reminder and last-sent dates are selected independently across full record history with bounded caller-scoped reads, honest partial-failure states and an explicit legacy recorded-time note. Existing queue browsing, request recovery, sending/cancellation rules, history and security remain intact. The new summary batch stays local and undeployed; no migration is needed.
