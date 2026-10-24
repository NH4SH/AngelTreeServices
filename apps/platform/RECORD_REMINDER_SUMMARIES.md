# Accurate record-level reminder summaries

October 24, 2026. The verified complete queue-visibility batch is pushed normally to main as `d39e87c`. This is the next focused PR14 communications follow-through. The new record-summary batch remains local and undeployed and needs **no migration**.

## Confirmed problem and resulting behavior

Proposal, invoice, job and appointment controls previously derived “Next scheduled” and “Last sent” from the newest-created 20–30 communication rows. A native local reproduction with more than 1,000 recent entries per record hid both an older-created pending reminder and a later-sent historical entry. The rendered invoice showed “None”/“None yet” even though those records existed. This demonstrates the application defect; no production incident or missed customer delivery is inferred.

Summary dates now use three narrow caller-scoped queries, each returning at most one row: the earliest pending reminder ordered by its scheduled time, the latest sent entry with a recorded send date, and the latest sent legacy entry without that date. Queries filter the exact record relation and status **before** ordering/limiting, use native UUID tie order, and share a five-second deadline. The existing bounded recent-history reader no longer determines either summary.

The sent candidates are compared using the existing `sent_at ?? updated_at` meaning, preserving Postgres microseconds and timezone offsets. JavaScript millisecond-only ordering cannot distinguish the tested one-microsecond difference. Older entries without a send date retain their historical recorded-time fallback, now explicitly labelled **“Recorded time; send date unavailable.”** No missing timestamp becomes today's date. A recorded-time fallback is not evidence of the actual send time, delivery to the mailbox, or customer opening.

A failed or malformed candidate is unavailable rather than absent. Failure of either sent candidate withholds the combined last-sent result; a healthy next-reminder result remains visible, and vice versa. Genuine empty reads retain “None”/“None yet.” Staff receive short refresh guidance without backend diagnostics. The existing CRM layout, spacing and controls are retained.

## Record boundaries and preserved capabilities

The summary covers all existing communication types attached through the same record relation as the controls, including receipts; it does not silently restrict to the form's currently selected reminder type. Pending is a queue state, not a promise that delivery will occur while sending is disabled or other checks hold it.

Proposal and invoice pages fetch their summary in parallel with their existing detail reads. A job uses its selected current legacy appointment when the existing control does, otherwise the job relation. Calendar event and legacy appointment panels receive separate summaries, including when both IDs occur in the URL. Existing parent/child relationship meanings remain intact.

This batch adds no queue write, privileged client, permission, grant, policy, schema change, dependency, migration, sender, retry or cancellation path. Existing recent pending/history lists, recipient selection, manual request storage/identity recovery, checked cancellation, automatic-reminder controls, native delivery fencing, accepted/uncertain holds, templates, immutable history, financial rules, employee screens and dashboard remain unchanged. Only narrow summary points (ID, date and timing kind) are passed to the existing client controls.

These are live reads, not one transactionally frozen snapshot. Concurrent queue changes may occur between queries or after display. If a read exceeds the deadline, its summary shows unavailable. Recent lists remain bounded previews and can still omit the older row identified by a summary; this batch does not claim complete record history browsing. No retention or legacy delivery identity is rewritten.

## Verification

| Check | Result |
| --- | --- |
| Full CRM regression suite | **2,767 passed**, zero failures/cancellations/skips |
| New focused reader/component cases, included above | **34 passed** |
| Existing manual scheduling/retry cases | **21 passed** separately and in regression |
| Actual local Auth/SDK/PostgREST acceptance | **14 scenarios / 15 TAP results**, 72 bounded caller-scoped GETs |
| Complete record history | All **five record types**, each with **1,006+ rows**, match full native SQL next/last selection despite the capped preview |
| Timestamp and compatibility cases | Both actual-send and legacy candidates can win; native one-microsecond order, equal-time UUID ties, timezone offsets and valid fractional-second formats checked |
| Faults and empty results | Each candidate fault, missing/malformed results, wrong record/status, read error with plausible data, absent client, invalid scope and genuine emptiness remain distinct; no diagnostic leakage |
| Actual access | All four staff roles allowed; nonstaff, forged user metadata, disabled/separated/removed old sessions and anonymous clients cannot retrieve summary IDs/dates |
| Native local and staging | **50 assertions each**, synthetic fixtures fully rolled back and exact complete before/after protected state equal |
| Preservation | API reads retain exact queue-row fingerprint, proposal/invoice money/status, settings, payments, outbound/email history and identities |
| Schema/security | Original **123 migrations** replayed in a fresh seed-free owned database; native/offline schema/type checks passed; local advisors zero and staging's existing **80 findings** unchanged |
| Typecheck/build | Route types, TypeScript, framework floor and optimized build passed on Node **22.23.4**, Next **16.4.2**, React/DOM **19.2.9** |
| Rendered UI | Proposal, invoice, expanded job section, calendar-event and legacy-appointment summaries checked; desktop **1280×800**, mobile **390×844**, partial failure, empty state and legacy note checked; no horizontal overflow or console warnings/errors |
| Keyboard/design | Existing form controls remain reachable with Tab; detector found zero issues in the changed summary/controls |

Native SQL uses five synthetic source records and ten synthetic identities. It verifies scoped native ordering outside the original preview, exact timestamp precision, caller RLS/effective access, unrelated communication-family retention and financial/delivery/default preservation. Hosted tests use simulated session claims in caller-owned rollback transactions, not a deployed staging application or hosted Auth-session acceptance.

Actual local acceptance uses real Auth sessions, the installed SDK and the same reader as the server wrapper. Query acceptance permits only local GETs with `limit=1` and explicit narrow columns. The sender/provider is never configured or invoked. Browser failure/empty-state tests use a private local response shim; it is not shipped in application code. Mobile viewport and keyboard checks are not physical-device, real-mailbox or spoken screen-reader acceptance.

The initial component-test fixture omitted the preview's communication type; adding the real field corrected that harness without changing application behavior or weakening expectations. The first login screenshot attempt raced the page load; subsequent rendered checks waited for the actual summary. Raw diagnostic evidence remains private.

## Staging and release boundary

ATS CRM Staging (`gbyhdsuiqeslgjdnbqng`) stays exactly at **123 native migration entries**, latest `20261024014934`, with **5,112 catalog objects** and **49 protected business/Auth/history sets** unchanged. Fresh read-only verification checks the pinned physical identity, full ledger/catalog, document/approval bindings, no-send Auth guard and disabled automatic-sending, appointment-notice and recurring-generation switches. No hosted install or app deploy is performed.

Only this task's preview/tab and new isolated loopback database are stopped, retaining synthetic data. Shared databases, scanner operations, unrelated review artifacts and separate runtime-security checkpoint `06580f6` remain preserved. No production query/change, customer email, provider request, historical retry or key rotation occurred. Framework development npm version/advisory lookups were blocked before dispatch; no ignored environment files were copied into the build snapshot.

The batch is saved locally on `codex/record-reminder-summaries`, containing current main `d39e87c`, pending a separate push request. Continue existing PR14 work with scoped record-level reminder/history browsing so staff can find the older reminder identified by a summary. Owner-policy, real mailbox/device/assistive-technology acceptance and the separate managed-runtime follow-up remain in the existing roadmap.

Sanitized receipt: `staging/RECORD_REMINDER_SUMMARY_VERIFICATION_20261024.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/record-reminder-summaries/`, including the original reproduction, native fingerprints, SQL/API/test/build logs and before/desktop/mobile/error/job screenshots. Credentials, Auth subjects, raw catalog/business snapshots and local fixture data remain outside Git.
