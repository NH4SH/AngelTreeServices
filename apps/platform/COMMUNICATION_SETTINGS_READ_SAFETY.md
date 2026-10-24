# Communication settings read safety

October 23, 2026. The verified migration 121 staging reconciliation is pushed normally to main through `e89d3bb`, preserving the concurrent website-only update `a0506d1`. This next focused communications/recovery fix is verified locally and against native synthetic staging inputs. It remains a local checkpoint pending a separate push/release request. Production is unchanged.

## Problem and resulting behavior

The worker settings reader could retain data alongside a reported read error, and the claimed-message processor checked only for data. A controlled response adapter using the actual saved pre-change reader and processor reached the synthetic sender once in that case. The staff reader also returned raw backend diagnostics and could throw instead of returning an error for the existing warning display. This is a reproduced error-handling defect, not evidence that Supabase normally returns both data and an error or that a production email was sent incorrectly.

Both settings readers now return no settings and the safe message “Communication settings are unavailable.” for a returned error, thrown read, missing row or nonobject result. Healthy settings are returned unchanged, including disabled automation. The staff reader retains the existing missing-configuration message and also catches client-creation errors. No settings are invented, written or enabled.

The claimed-message processor explicitly refuses a settings result with an error, even if a future reader returns data with it. The existing failure handler records the safe pre-send failure; it does not skip/cancel the message, copy the backend diagnostic or automatically retry it. Failed settings preparation also blocks new batch claims and leaves an accepted email's source follow-up pending without resending or acknowledging completion. A lost failure-state write remains an unrecorded outcome under the existing ownership checks.

Staff can review failed preparation in **Communications → Failed communications**. This batch adds no recovery button or request-key reset. Review current source/provider history before using existing authorized recovery; do not bypass an uncertain result by creating a new identity.

## Scope and preservation

Only the two settings-reader functions and one processor condition changed in application code: `src/lib/communications/queue.ts`, `src/lib/data/communications.ts` and `src/lib/communications/processor.ts`. The queue planners, timing, bulk cleanup, immutable requests, delivery identities, recipients, healthy payloads, claim fences and accepted/uncertain-result recovery retain their existing behavior. The staff page uses its existing warning renderer; no UI markup changed.

No migration, original migration source, generated public type, dependency, email template, financial calculation, document binding, authorization boundary, policy, grant or persistent setting changed. Earlier CRM/UI work and the separate runtime-security checkpoint `06580f6` are preserved. This is a basic result/object guard, not complete runtime validation of every settings field. It adds no new timeout or automatic retry and does not claim to fix every administrative data loader.

## Verification

| Check | Result |
| --- | --- |
| Complete CRM suite | **2,598 passed**, zero failures/cancellations/skips |
| New focused tests included above | **15 passed**, covering both readers, unsafe results, thrown/client errors, worker claims, recovery, healthy identities and OFF holds |
| Route types, TypeScript, optimized build | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| Clean build isolation | No ignored environment files/provider credentials copied; zero external application network attempts |
| Native local verification | **26 assertions**, five synthetic source contexts, all rolled back |
| Native staging verification | **26 assertions**, five synthetic source contexts, all rolled back |
| Native-input processor/worker/recovery checks | **100 passed**, 50 per environment; actual before/after modules, controlled failures, synthetic transport only |
| Actual local Supabase/PostgREST readers | Healthy OFF settings preserved, anonymous read denied, returned/thrown faults sanitized by both readers; GET-only settings requests |
| Public website compatibility | Existing public tests/build/validation passed; all 18 approved pages validated |
| Preservation | Exact before/after native state, tested-source parity and whitespace checks passed |

`supabase/verification/communication_settings_reads.sql` is rollback-only verification. It exercises synthetic customer, organization, quote, invoice, payment and communication rows; verifies server-role settings access, anonymous/unauthenticated-authenticated denial, exact claim-fenced failure writes, no outbound acceptance and settings preservation. It is not a new migration. Native-input application tests use those database-produced inputs with controlled read-fault adapters; they do not reconfigure staging permissions, simulate a real hosted outage or contact a provider.

The newly owned seed-free local project replayed the original 121 migrations without resetting a shared database. Its complete native ledger, application catalog and public/private/Auth row fingerprints match before/after testing. Only this task's project is stopped afterward, retaining its data.

ATS CRM Staging (`gbyhdsuiqeslgjdnbqng`) remains exactly at **121 migrations**, latest `20261023232306`, with **5,111 catalog objects** and **49 protected business/Auth/history sets**. Complete native statement history, permissions, records, settings, document/approval definitions and the no-send Auth guard match the pinned 121 baseline. Automatic sending, appointment notices and recurring generation remain OFF. No hosted migration or app was installed in this batch.

## Evidence and remaining work

Sanitized receipt: `staging/COMMUNICATION_SETTINGS_READ_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/communication-settings-read-safety/`, including saved original source, controlled reproduction, clean build/test logs, native fingerprints and actual local API results. Raw records, credentials and diagnostics remain outside Git.

This completes another focused source-read safety follow-through in the existing communications roadmap. Other administrative read/recovery paths can be reviewed separately; this does not replace the existing owner terms-policy decisions, real mailbox/device/assistive-technology acceptance or separate Netlify managed-runtime follow-up. No new browser/mailbox or deployed-worker acceptance is claimed for this backend-only change. No production query/change, deployment, real provider request, customer email, historical retry, key rotation or support contact occurred.

### Push follow-through — October 23, 2026

The verified settings-read fix is pushed normally to main as `011f53f`, with CI/Netlify skip markers. The original receipt remains historical local-verification evidence. `REMINDER_LINK_READ_SAFETY.md` records the next focused follow-through: unverifiable reminder links remain failed for review instead of becoming skipped. Its local and rollback-only staging verification preserves the installed 121 baseline and sending controls. The new link-failure batch remains local and undeployed; production is unchanged.
