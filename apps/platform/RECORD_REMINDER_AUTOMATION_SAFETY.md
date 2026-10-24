# Atomic quote and invoice reminder controls

October 23, 2026. Migration 122 staging reconciliation is pushed normally to main as `3d52b76`, preserving the settings-save fix, earlier CRM work and main's website changes. This is the next focused follow-through within the existing communications preparation/recovery work (PR13–PR14), not a separate roadmap. The new batch is verified locally and against rollback-only staging fixtures; production is unchanged.

## Confirmed problems and change

The existing invoice reminder toggle cancelled **every pending automatic communication linked to the invoice**, including a payment confirmation. The saved original action reproduces that receipt cancellation with synthetic rows. It also reported success after a zero-row source update, ignored stale intent, and saved the toggle before separately cancelling queue rows. An injected cancellation failure left a partial disable. These reproductions use the actual original action and controlled synthetic writes; they do not establish a production incident.

The existing quote/invoice controls now submit the version of the record displayed on screen. One caller-scoped native command checks the current version and changes the flag and matching pending reminders in a single transaction. A changed or unavailable record requires a reload. An unsuccessful, lost, malformed or wrong-record acknowledgement never reports a confirmed save or exposes backend diagnostics. Retrying an old form after a committed but unacknowledged change cannot write again.

Disabling quote follow-ups cancels only pending automatic `quote_follow_up` rows for that quote. Disabling invoice reminders cancels only pending automatic `invoice_payment_reminder` and `overdue_invoice_reminder` rows for that invoice. **Payment confirmations and manual reminders remain intact.** Processing, sent, failed, skipped, previously cancelled and unrelated history remain unchanged. Enabling only changes the flag; it does not create messages or resurrect cancelled stages. Historical receipts cancelled by older behavior are not reopened or resent.

The functional changes are deliberately limited to atomicity, stale-intent/acknowledgement checks and correcting the overbroad receipt cancellation. The buttons, layout, styling, existing permissions, recipients, templates, financial rules and worker logic are preserved.

## Transaction and permission boundary

Candidate migration **123**, `20261024014934_atomic_record_reminder_automation.sql`, adds only `public.set_record_reminder_automation(text,uuid,boolean,timestamptz)`. It uses SECURITY INVOKER, an empty search path and a two-second lock timeout. Only authenticated callers may execute it; its live stored-role/effective-access check preserves owner, admin, estimator and payroll-admin access. Other roles, disabled profiles, separated employees, removed memberships and spoofed owner metadata remain denied. There is no service-role fallback, privileged routine, table grant or RLS change.

The command follows the existing job → source → queue lock order. It checks the source version and parent again after waiting; a changed parent requires a reload. Matching pending rows lock in ID order. A cancellation error or timeout rolls back the flag, its timestamp and all cancellation writes together. No provider request or delivery claim occurs inside the command.

Existing source-column rights remain unchanged; this is the safer command used by the CRM controls, not a new universal boundary around every possible external database write. A planner may prepare a row from an earlier read, and an already processing or dispatched communication is not unsent by a toggle. Existing send-time eligibility, source locking, claim fencing, accepted/uncertain outcome holds and duplicate prevention remain authoritative. No recovery bypass, automatic retry or new delivery identity is added.

## Verification

| Check | Result |
| --- | --- |
| Complete CRM regression suite | **2,653 passed**, zero failures/cancellations/skips |
| New focused action tests included above | **8 passed** |
| Route types, TypeScript, optimized build | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| Clean build isolation | No ignored environment files or provider credentials copied; zero external application requests |
| Fresh owned local replay | Original 122 migrations replayed without a shared reset |
| Local candidate SQL | **58 assertions**, all candidate DDL/fixtures rolled back; exact before/after state |
| Staging candidate SQL | **58 assertions**, all candidate DDL/fixtures rolled back; exact before/after state |
| Installed owned local migration 123 | **58 assertions**, fixture rollback; original 122 full ledger entries preserved; catalog matches reviewed candidate |
| Local security advisors | No issues found before/after |
| Actual local Auth/SDK/action acceptance | **28 scenarios / 29 TAP results passed**, including observed lock waits and controlled HTTP failures |
| Fresh native schema and offline source/type contract | Passed; generated types add only the new RPC |
| Actual rendered controls | Keyboard quote/invoice toggles, stale refusal, reload and subsequent success passed; receipt/manual/history preservation confirmed natively |

Native SQL uses ten synthetic identities, a customer quote and invoice, another invoice, both reminder stages, manual reminders, a receipt and all existing nonpending states. It checks current roles/access, immutable financial/source fields, matching cancellation, missing/stale records and an injected cancellation failure after the flag update. Complete rollback preserves all prior records/history and global OFF settings. Local and staging candidate definitions, owner, execution rights, invoker mode, search path and timeout match exactly.

Actual API tests use real local Auth sessions and native PostgREST transactions. They cover all four existing staff roles, nonstaff and metadata spoofing, old sessions after access/membership changes, anonymous/server denial, invalid kinds, standalone quotes and organization-only invoices. For both source kinds, two simultaneous old-version toggles produce one writer; a parent change during a lock wait requires reload; a worker's processing transition retains its claim; a queue-lock timeout rolls back all writes. A response deliberately replaced after the real commit leaves the old retry rejected. Pre-forward HTTP failures leave state unchanged. Global settings, payments, outbound deliveries and email history are unchanged; no real provider is called.

The actual local UI showed automatic invoice reminders disabled while its manual reminder and payment confirmation remained pending. A stale Enable action after another synthetic client's edits displayed reload guidance without overwriting the current disable. Reload and Enter then enabled successfully without resurrecting cancelled rows. The quote toggle also worked through Enter. The browser error log was empty. A 1280×720 proof image is saved privately as `invoice-reminders-local.jpg`. No physical-device, spoken screen-reader or hosted app acceptance is claimed; no layout/CSS changed.

## Preservation and next step

ATS CRM Staging (`gbyhdsuiqeslgjdnbqng`) remains at **122 migrations**, latest `20261024010036`, with **5,111 catalog objects** and **49 protected business/Auth/history sets**. The prospective catalog adds only the one reviewed invoker command. Its DDL and all fixtures roll back; the full native ledger, catalog, records, settings, document/approval bindings and staging no-send Auth guard remain exact. Automatic sending, appointment notices and recurring generation stay OFF throughout. No hosted migration or app installation occurred.

Migration 123 is installed only in the newly owned loopback database. SQL fixtures roll back exactly; separate API/browser tests intentionally retain synthetic local records. The temporary preview/tab and owned database are stopped, with data retained. Shared databases, the scanner and runtime-security checkpoint `06580f6` are untouched. Original 122 migration sources and existing generated declarations are unchanged; the schema fingerprint adds only the new migration/RPC. The deferred inventory keeps its release hold and exact new source hash.

The next database step is **targeted staging reconciliation for migration 123**, using the unchanged reviewed source. Do not use an unrestricted database push. Existing owner terms-policy choices, mailbox/device/assistive-technology acceptance and the separate managed-runtime issue remain in the same roadmap.

Sanitized receipt: `staging/RECORD_REMINDER_AUTOMATION_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/record-reminder-automation-safety/`, including saved original source/reproduction, native fingerprints, test/build logs, real local API results and rendered proof. Raw snapshots, Auth identities, credentials and diagnostics remain outside Git. This batch is saved locally pending a separate push request. No production query/change, deployment, customer email/provider request, historical retry, activation or key rotation occurred.
