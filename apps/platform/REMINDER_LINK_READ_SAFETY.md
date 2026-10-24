# Reminder link verification failures

October 23, 2026. The verified communication-settings safety fix is pushed normally to main as `011f53f`, with the previous CRM, migration 121 reconciliation and employee/dashboard work preserved. This candidate includes the concurrent website-only update `56caef4` from main. This next focused communications/recovery change is a verified local candidate, pending a separate push/release request. Production is unchanged.

## Problem and change

Proposal follow-ups, invoice reminders and overdue reminders previously became **skipped** when their secure customer link could not be verified. The shared verifier deliberately returns the same safe failure for an unsuccessful read and an unusable capability, so a temporary token/source lookup error could be mistaken for a deliberate skip. Controlled reproduction using the saved original processor and the actual link/token readers confirmed that outcome for all three reminder types. No production incident or real provider send is inferred from that reproduction.

Those three reminder types now enter the existing pre-send failure handler when the link result has an error or lacks its URL/token identity. The message remains **failed** for staff review, with the existing safe explanation: “Delivery checks could not be completed safely. No email was sent.” An unavailable, expired, revoked, wrong-party, corrupt or unrecoverable link also requires review. These conditions are no longer presented as intentional skips, and a result with both a URL and an error cannot authorize sending.

There is no automatic retry, replacement link, new delivery identity or backfill. Staff can review the failure in **Communications → Failed communications** and inspect the document's existing links. Review current source and provider/history evidence before using existing authorized recovery; do not reset a row or create a new request key to bypass an uncertain outcome. Existing skipped historical rows are untouched.

## Preserved behavior

Application code changes only two conditions in `src/lib/communications/processor.ts`. The shared token reader, party/hash/encryption verification, expiry/revocation checks, canonical URL construction and native send-time token recheck are unchanged. Valid reminders retain their exact payload, recipient, token identity and request key. Deliberately closed/paid documents still cancel before link lookup; disabled automatic sending still holds the reminder pending. Other communication types retain their previous behavior.

The existing claim fence and failure-write acknowledgement remain authoritative. A lost failure write is not reported as recorded, and an uncertain provider result stays held without another send. This does not add a recovery button or alter accepted-email repair. It adds no migration, dependency, generated type, template, UI, financial calculation, source-event transaction, authorization rule, RLS/grant or persistent setting.

## Verification

| Check | Result |
| --- | --- |
| Complete CRM regression suite | **2,617 passed**, zero failures/cancellations/skips |
| New focused tests included above | **19 passed**, using actual link readers and synthetic AES/hash verification |
| Route types, TypeScript and optimized build | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| Clean build isolation | No ignored environment files/provider credentials copied; zero external application network attempts |
| Native local SQL | **34 assertions**, five synthetic source contexts; complete rollback and exact before/after state |
| Native staging SQL | **34 assertions**, five synthetic source contexts; complete rollback and exact before/after state |
| Native-input processor checks | **122 passed**, 61 per environment; original/new healthy payloads and identities match, link faults held without replacement/resend, payment-receipt control preserved |
| Actual local Supabase/PostgREST and durable commands | **21 scenarios / 22 TAP results passed**; six invalid/read-failure cases and one healthy single-acceptance case per reminder type |
| Source preservation | Only the two intended application conditions differ; original migrations, dependencies and generated types unchanged |
| Concurrent website compatibility | Existing public tests, build and 18-page validation passed with main's `56caef4` included |

The local API checks use the real SDK, actual token/source queries, actual queue writes and native durable-delivery commands. Controlled HTTP errors are injected only into the selected token/source reads; database permissions are not changed. Healthy messages reach a synthetic transport once, record one acceptance event and retain their verified link. Failed reads, missing/revoked/expired links and mismatched hashes create no outbound request and remain held after a repeated action. Anonymous token access stays denied. No real email provider is called.

`supabase/verification/reminder_link_reads.sql` is rollback-only verification, not migration 122. It receives session-local synthetic ciphertexts prepared with an ephemeral test key. It verifies server-role access, anonymous/unauthenticated-authenticated denial, claim-fenced failure writes, no acceptance/outbound rows and byte-identical links/settings. Database-produced fixture inputs then exercise the actual application modules with controlled failures. This does not claim a real hosted outage, a deployed staging worker or real mailbox delivery.

The newly owned loopback database replayed the original 121 migrations without a shared reset. Native SQL fixtures rolled back. The separate real API checks intentionally retain only synthetic local records/history in that owned database, which is stopped with its data preserved after verification.

ATS CRM Staging (`gbyhdsuiqeslgjdnbqng`) remains at **121 migrations**, latest `20261023232306`, with **5,111 catalog objects** and **49 protected business/Auth/history sets**. Its complete native statement history, records, permissions, document/approval definitions, settings and no-send Auth guard match the pinned 121 baseline. Automatic sending, appointment notices and recurring generation remain OFF. No hosted migration, application or setting was installed/changed.

## Evidence and remaining scope

Sanitized receipt: `staging/REMINDER_LINK_READ_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/reminder-link-read-safety/`, including saved original source, reproduction, clean test/build logs, native fingerprints, API results and synthetic ciphertext/key material. Raw snapshots, capabilities, credentials and diagnostics remain outside Git.

This follows the existing communications source/settings-read safety work. It does not weaken link validation or reopen closed documents. Historical skipped messages are not reclassified or resent. No new timeout, retry policy, sender activation or customer UI is introduced. Existing owner terms-policy decisions, real mailbox/device/assistive-technology acceptance and the separate managed-runtime follow-up remain in the same roadmap. No app deployment, production query/change, customer email, key rotation or support contact occurred.
