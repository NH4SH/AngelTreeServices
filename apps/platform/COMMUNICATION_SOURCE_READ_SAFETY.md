# Communication source-read safety

October 23, 2026. Follow-through to the existing communications/recovery roadmap, based on main `8422b3e8172dd9a7e2ed36af59b2435633bc551d`. The verified appointment-email batch is pushed to main. This new fix is a local candidate, pending a separate push/release request. Production is unchanged.

## Reproduced defect and change

The actual pre-change processor treated an errored customer or organization lookup as a missing contact and marked the message **skipped**. It treated an errored quote, invoice or payment lookup as a missing record and marked the message **cancelled**. All five paths copied the returned backend diagnostic into the queue reason. Controlled reproduction against the saved pre-change source confirmed these outcomes; no provider was called.

The five lookups now distinguish an unsuccessful read from a successful empty result. An error throws into the existing pre-send failure handler, which records **failed** with the existing safe message: “Delivery checks could not be completed safely. No email was sent.” No raw diagnostic is copied into the queue, and a data-plus-error response cannot authorize sending. A successful empty read retains its original deliberate missing-record skip/cancellation behavior. Archived contacts, missing email, closed quotes/invoices and unsuccessful payments retain their existing decisions.

Failed preparation remains visible in the existing **Communications → Failed communications** list. It is held for staff review, not automatically retried when the database recovers. This does not add a Retry button or a new Delivery review outbox entry: preparation can fail before an outbound request exists. Review provider/history and current source state before using existing authorized recovery; do not reset the row or create a new request key to bypass an uncertain outcome. The existing safeguard for an older attempt with no frozen request remains in place.

## Preservation

Only five application error branches changed in `src/lib/communications/processor.ts`. Existing claim ownership checks, source snapshots, recipient validation, exact delivery keys, immutable requests, recent-history checks, provider reconciliation, uncertain-result quarantine and history are reused. Existing organization workflow-contact and appointment queries already fail safely and are unchanged.

Healthy messages retain the same recipient, subjects, HTML/plain text, payment amounts, links and delivery identity. No financial calculation, business term, email template, scheduling command, source-event transaction, worker claim routine, authorization boundary, RLS/grant, dependency or persistent setting changed. There is no migration. Earlier CRM/UI work and the separate runtime branch at `06580f6` remain preserved.

## Verification

| Check | Result |
| --- | --- |
| Complete CRM suite on patched locked dependencies | **2,445 passed**, no failures/skips |
| New focused tests included above | **10 passed**; all five reads, returned/thrown errors, data with error, successful empty results, healthy/repeated sends, lost failure write, accepted history and uncertain delivery |
| Route types, TypeScript and optimized build | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| Build isolation | No ignored environment files/provider credentials copied; zero external application requests |
| Native local SQL | **21 assertions**, five synthetic source fixtures, fully rolled back |
| Native staging SQL | **21 assertions**, five synthetic source fixtures, fully rolled back |
| Actual processors with native database inputs | **60 cases passed**, 30 per environment; healthy pre-change/new payloads and identities match, errors stay failed without sending/retry, successful missing reads retain prior decisions |
| Preservation | Before/after ledger, catalog and protected records/settings match; tested app/test sources match worktree; whitespace check passed |

The native SQL uses actual synthetic customer, organization, quote, invoice, payment and communication rows plus the installed payment-principal command. It verifies stale versus exact failure-state writes, no new outbound/acceptance history and anonymous source-read denial. It never changes a role definition, policy or grant. The worker read errors are controlled response adapters using those database-produced inputs, not a real hosted database outage or a permissions reconfiguration.

Local SQL reused the existing loopback disposable database at migration 105 without reset or upgrade. Its full application catalog, native ledger and public/private/Auth row fingerprints are unchanged afterward. This older database verifies the existing queue/source contracts; current-source tests/build and exact staging 118 checks provide separate current-schema evidence.

Staging used project `gbyhdsuiqeslgjdnbqng` at migration 118. Fresh before/after verification matches its exact native ledger, all 5,110 catalog objects/permissions, 49 protected business/Auth/history sets, no-send Auth guard and settings. Automatic sending, appointment notices and recurring generation remain OFF. No application was deployed and no customer email or provider call occurred. `supabase/verification/communication_source_reads.sql` is rollback-only verification, not migration 119.

## Evidence and remaining scope

Sanitized receipt: `staging/COMMUNICATION_SOURCE_READ_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/communication-source-read-safety/`, including the original processor, before reproduction, build/test logs, protected-state fingerprints and native-input acceptance results. Raw snapshots/diagnostics and synthetic records remain outside Git.

This backend-only fix adds no UI and changes no templates, so browser/mailbox acceptance is unchanged from the preceding appointment batch. It does not certify real provider delivery, a deployed staging worker or outage recovery in production. Real mailbox/device/assistive-technology acceptance, unresolved owner terms-policy decisions and the separate Netlify managed-runtime follow-up remain open in the existing roadmap. No support contact, key rotation, production query/change, hosting change, application deployment or automatic retry was performed.

### Push follow-through — October 23, 2026

The verified source-read fix is pushed normally to `origin/main` as `1f1cfb79e386eb74a575217d612f5cda1d294078`, with CI/Netlify skip markers. The original receipt remains historical local-verification evidence. The next existing checked-update/recovery gap is documented in `APPOINTMENT_QUEUE_SYNC_SAFETY.md`. The concurrent website-only main update `0a85e15` is also preserved in that candidate. No deployment or production change occurred.

### Settings-reader follow-through — October 23, 2026

After the preserved reminder-planning, bulk-cleanup and staging-121 work, `COMMUNICATION_SETTINGS_READ_SAFETY.md` records the focused settings-reader follow-through. Both readers now withhold unsuccessful settings and raw diagnostics, and the processor explicitly checks the returned error before using settings. Existing preparation/claim and accepted-email recovery holds are reused. This is separately verified local work based on main `e89d3bb`; the original source-read report and receipt remain historical evidence. No migration, production change or customer email occurred.
