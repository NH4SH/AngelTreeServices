# Reviewed scheduled-reminder cancellation

October 23, 2026. Migration 123 staging reconciliation is pushed normally to main as `cee29fc`, preserving the atomic reminder controls and all previous CRM/website work. This is a focused follow-through within the existing PR14 communications exception/recovery work. The new implementation remains local and undeployed. No migration is needed.

## Reproduced problem and change

The actual saved original action cancelled a synthetic reminder after another client had rescheduled it since the page's displayed version. Its predicate checked only the reminder ID and pending status. Read/write errors or a missing acknowledgement threw a page-level error; signed-out/unauthorized and missing-ID paths silently returned. These are local reproductions and source findings, not evidence of a production incident.

Cancel now submits the version displayed beside that reminder. One authenticated UPDATE matches the ID, pending status and exact `updated_at` value. A reschedule, edit or worker claim committed while the update waits prevents the stale cancellation. The action reports success only after a matching cancelled-row acknowledgement with valid timestamps. Missing/changed rows get reload guidance; malformed, data-plus-error, thrown or lost acknowledgements return an unconfirmed outcome without backend diagnostics. A committed cancellation with a lost response cannot be written again from the old page.

Each row uses the existing reliable action hook, a disabled “Cancelling…” state, a descriptive accessible button name and inline status/error feedback. The current CRM appearance, layout, dates and responsive CSS are preserved. Successful cancellation moves the item into history on the refreshed record. No new modal, retry worker, replacement delivery identity or historical resend is introduced.

## Preservation boundary

Existing owner/admin/estimator/payroll-admin permissions and fresh effective-access checks are unchanged. The action still uses the caller's Supabase session and existing RLS/table rights; there is no service-role fallback, privileged command or schema change. This version predicate protects the CRM action's reviewed intent; it does not create a universal boundary around existing direct database write permissions.

Staff retains the existing ability to explicitly cancel a selected pending automatic reminder, manual reminder or payment confirmation. Only that selected pending row changes. Other reminders/receipts, all processing/sent/failed/skipped/cancelled history, claim fields, provider results, financial records, global defaults and audit/delivery history remain intact. A cancellation cannot unsend an already processing or accepted email. Existing worker/source locks, frozen requests, claim fencing, duplicate holds and recovery rules are unchanged.

## Verification

| Check | Result |
| --- | --- |
| Full CRM regression suite | **2,673 passed**, zero failures/cancellations/skips |
| New focused action tests included above | **10 passed** |
| Route types, TypeScript, optimized build and framework floor | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| Fresh owned seed-free database | All original **123 migrations** replayed; no shared reset |
| Native local cancellation/RLS checks | **36 assertions**, all fixtures rolled back and complete before/after state equal |
| Native staging cancellation/RLS checks | **36 assertions**, all fixtures rolled back and pinned 123 ledger/catalog/protected state equal |
| Actual installed local Auth/SDK/action checks | **17 scenarios / 18 TAP results**, including original-action reproduction, observed lock waits and lost-response recovery |
| Fresh native schema and offline source/type fingerprints | Passed; original migrations, generated types and schema manifest unchanged |
| Security advisors | Local has no issues; staging's existing **80 findings** exactly unchanged |
| Actual rendered controls | Enter on stale Cancel refused; reload then Enter confirmed cancellation; selected reminder entered history and its receipt stayed pending |
| Desktop rendering | 1280×720; no horizontal overflow or browser errors; detector found zero issues |

Native SQL uses ten synthetic identities and a synthetic invoice/reminder/receipt inside caller-owned rollback transactions. It verifies allowed staff and denied nonstaff, disabled/separated identities and forged owner metadata against existing native RLS, stale/missing updates, every nonpending state, explicit receipt cancellation and unrelated-record preservation. The initial fixture attempted to insert an already separated employee; the existing lifecycle guard correctly refused it and the transaction rolled back. The fixture was corrected to create an active employee before separating it, matching the established test pattern. No guard or permission was relaxed.

Actual local API tests use real Auth sessions and native PostgREST updates. They observe row-lock waits: a worker claim or reschedule committed during the wait defeats the stale cancellation, and simultaneous staff cancellations produce one successful acknowledgement. They cover pre-forward HTTP failure, a deliberately lost committed response, all existing staff roles, removed membership, anonymous/nonstaff/disabled/separated users, automatic/manual reminders, selected pending receipts and complete financial/global/history preservation. Synthetic provider identifiers represent retained historical facts; no provider or sender is called.

Hosted authorization checks use synthetic identities and simulated session claims, not deployed-app or hosted Auth-session acceptance. Mobile viewport, physical-device and spoken-reader acceptance were not performed; no layout/style changes were made. Existing pending owner-policy, mailbox/device/accessibility and separate managed-runtime follow-ups remain in the same roadmap.

Clean build/unit/schema checks copied no ignored environment files or provider credentials and attempted no external application requests. The local development framework attempted two npm version/advisory checks; the network guard blocked both before dispatch. All other preview requests stayed on loopback. This is not a production runtime test or a dependency upgrade.

## Staging and next step

ATS CRM Staging remains exactly at **123 migrations**, latest `20261024014934`, with **5,112 catalog objects** and **49 protected business/Auth/history sets**. The fresh read-only 123 verifier, full native ledger/catalog, document/approval bindings, defaults and no-send Auth guard remain exact. Automatic sending, appointment notices and recurring generation stay OFF. No hosted installation, activation, production query/change, app deployment, historical retry, customer email or key rotation occurred.

Only this task's temporary preview/tab and newly owned loopback database were stopped; synthetic data is retained. Shared local databases, scanner operations, unrelated review artifacts and the separate runtime-security checkpoint `06580f6` are untouched. The new batch is saved locally on `codex/reminder-cancellation-safety`, containing current main `cee29fc`, pending a separate push request.

The next focused communications follow-up is manual reminder scheduling/acknowledgement and retry-intent safety. Keep it within existing queue/delivery recovery; do not change recipients, resend old messages or add a competing automation system. Owner terms-policy, real mailbox/device/assistive-technology and managed-runtime work remains separate.

Sanitized receipt: `staging/REMINDER_CANCELLATION_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/reminder-cancellation-safety/`, including original source/reproduction, SQL/API/build logs, exact native fingerprints and desktop stale/success images. Raw snapshots, Auth identities, synthetic credentials and diagnostics remain outside Git.
