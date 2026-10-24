# Record reminder and history browsing

Verified October 24, 2026. The complete-summary fix `40a2015` was pushed normally to main. This batch follows PR14's existing communications visibility work and includes main's independent website update `909b93f`. It remains local and undeployed.

## What staff can do

“View reminders & history” opens a full record-specific list from proposal, invoice, job, calendar-event and legacy-appointment communication controls. Scheduled, Failed and History each have native 30-row pages, exact counts and keyboard links above and below the list. Switching views resets the page while keeping the record and safe return destination. Existing embedded recent previews and sending/automation controls remain available.

The job entry retains its existing current-appointment scope. Its back link returns to the job. Calendar entries return to the same selected event/appointment, date, view and allowed calendar filters. Return links are restricted to local record/calendar paths and discard arbitrary query fields, tokens, fragments and external destinations.

Scheduled rows can use the existing checked Cancel action. The shared form retains its original reminder ID, expected update version, pending guard and accessible status/error message. The browser refreshes its list after the action returns. Already-cancelled or stale submissions cannot cancel a different row, resend a reminder or overwrite processing/sent history.

History preserves processing, sent, skipped and cancelled outcomes; Failed is separate. Sent dates use `sent_at` when known. Legacy sent rows explicitly say that the send date is unavailable and show the existing recorded-time fallback. The three complete summary reads remain unchanged.

## Read and security boundaries

- The server checks authentication, effective internal-staff access and the source record under the caller's RLS before claiming its queue is empty. Missing sources return not-found; source/read errors stay unavailable.
- An exact source foreign-key filter is applied to every page, fallback HEAD count and recovered page. An invalid scope fails closed, never to the global queue. Returned rows must match the source and contain usable timestamps.
- The existing native sort keys and UUID tie ordering remain: scheduled time ascending; failed update time descending; history creation time descending. Each read/recovery shares a five-second deadline and makes at most one out-of-range recovery.
- This is reminder history in `customer_communications`. Document-email/provider delivery history remains separate and accessible through Delivery review. Opening or paging this list never schedules, retries or sends anything.
- No migration, RLS/grant, sending worker, financial command, delivery identity, manual request recovery, template, dependency or deployment configuration changes are included. Cancellation reuses the existing action unchanged; only its form is shared and the dedicated browser refreshes after a response.

## Verification

- **2,823** regular CRM checks passed on the final source, including **56** new focused cases. The combined queue/summary/browser focused run passed **129**; the existing manual-reminder safety suite separately passed **21**.
- **21** actual local Auth/API scenarios (**22** TAP results) paged every matching row across all five sources and three views. Each view had more than 1,000 entries. **543** bounded caller-scoped reads included one fallback HEAD count. Native ordering, no missing/repeated IDs, all four staff roles, nonstaff, forged owner metadata, disabled/separated/removed-role old sessions, anonymous denial and injected read errors were checked. All queue, financial, settings and delivery fingerprints stayed unchanged during read acceptance.
- **80** native SQL assertions passed in each fresh local and staging environment. All staged fixtures ran inside rollback-only transactions. Exact pre/post schema, 123-entry migration ledger, protected business/Auth/history sets and OFF controls matched. Staging remains at `20261024014934`; no app was deployed there. Local advisors were clear; staging's existing 80 findings were unchanged.
- Fresh native and offline schema checks, framework floor check, type generation, typecheck and optimized Node 22.23.4 / Next 16.4.2 / React 19.2.9 build passed. No separate lint script is configured.
- Real rendered acceptance covered entry links and return navigation, second/last pages, legacy date labels, empty/error states, keyboard focus and Enter cancellation, a stale second-tab cancellation, staff/nonstaff/signed-out access, and widths 1280, 768 and 390. No horizontal overflow; mobile Refresh/Cancel sizing was corrected. The real synthetic cancellation retained the original row, all other queue records, finances, settings and delivery history, without a send.
- Impeccable's final manual detector reported no findings. Main's website compatibility checks also passed: 239 Node tests, nine Python tests, public build and validation. The public build uses the installed Python 3.13; Apple's older Python 3.9 cannot parse the existing website generator's f-strings.

Sanitized receipt: `staging/RECORD_REMINDER_BROWSING_VERIFICATION_20261024.json`.
Private synthetic evidence: `/Users/noelsierra/Documents/Codex/2026-10-24/record-reminder-browsing/` (`record-browse-desktop.png`, `record-browse-mobile.png`, `record-browse-error.png`). The before view is retained in the prior record-summary evidence. Only this task's local preview and database were stopped afterward; their synthetic data is retained. User tabs, other local services and the separate runtime-security checkpoint were preserved.

## Limits and next step in the existing roadmap

Counts, source checks and summaries reflect live state, rather than one frozen transaction across separate reads and navigation. An external change can move a row between pages; stable native ordering prevents ambiguity for unchanged data, and refresh/out-of-range recovery supports changed queues. Historical recorded timestamps do not reconstruct an unknown actual send date.

Staging acceptance is native rollback-only SQL with simulated caller claims, not a deployed staging app or hosted browser/Auth-session run. Browser keyboard/viewport checks do not replace real mailbox, physical-device or spoken screen-reader acceptance. No production query/change, provider send, key rotation or deployment occurred.

The next focused PR14 follow-through is record-scoped document-email delivery/history browsing, so the separately retained provider outcomes can be reached beyond their recent previews without retrying old messages. Owner-policy decisions, real mailbox/device/accessibility acceptance and the separate managed-runtime work remain in the existing roadmap.


## Recorded document-email follow-through

`RECORD_DOCUMENT_EMAIL_HISTORY.md` documents the next verified local PR14 step. Proposal, invoice and change-order records now link to their full recorded `email_events` history, with All recorded emails by default, Needs attention, exact native paging and existing delivery-review links. All original reminder browsing/cancellation behavior remains unchanged. Staging stays at 124 after synthetic rollback-only verification, with no new migration, deployment, production change or customer email. Unrecorded prepared/uncertain requests remain explicitly separate and are the next scoped visibility follow-up.
