# Production scanner and customer-email activation

Owner authorization: enable the production scanner and automatic customer emails only after verification; preserve existing records and prevent duplicate sends.

## Verified release safeguards

- Production and staging use separate scanner hostnames, tokens and nonroot bridges. The existing bounded ClamAV engine remains shared; no additional engine or provider account is required.
- Public TLS, digest matching, EICAR quarantine, missing/wrong/cross-environment token rejection and concurrent 25 MiB scans passed. Staging scanning remains intact. Readiness now checks loaded definition age and TLS expiry through the existing incident-deduplicated health monitor.
- A dedicated `CUSTOMER_EMAIL_WORKER_SECRET` activates customer communication processing without activating job advancement, calendar synchronization or manager-notification workers. Existing installations may still use the original shared key as a fallback.
- Migration 102 preserves the transactional delivery admission function, authorization, source locks, provider idempotency identities and uncertain-delivery protections. It puts first/overdue invoice reminders in the same admission family and includes accepted legacy invoice/quote delivery history. It changes no financial values, RLS or business records.
- Local real-Postgres concurrency checks passed: one winner for competing reminder stages; legacy accepted delivery suppression; legitimate later reminders; uncertain delivery holds; unrelated payment receipts; separate invoices; no anonymous or staff dispatch grants. All 2,195 regression checks and typecheck passed.
- Migration 102 was installed through the native exact-ledger workflow in staging, then production. Historical staging candidate verifiers retain their original exact-ledger acceptance; the additional migration is independently hash-pinned.

## Activation procedure

1. Deploy the verified source with production scanner configuration and the dedicated customer worker credential. Credentials stay outside Git and client code.
2. Run the operator-only, body-free synthetic scanner acceptance route from the actual Netlify runtime. Verify the existing health monitor observes the new critical scanner component.
3. Recheck the seven private attachment inventories before enabling their gates. Do not mark legacy files clean or disable a gate to recover access. Retention and purge remain unchanged.
4. Enable customer automation while refreshing the settings activation timestamp so historical payment receipts are not backfilled. Preserve existing per-record opt-outs and the minimum send interval.
5. Let the normal processor cancel stale sources and reconcile provider acknowledgments. Repeat inspection before any further pass. Never manually resend accepted or uncertain deliveries.

A closed-connection TLS regression test reproduces missing peer-certificate metadata under session resumption. Readiness uses a fresh, normally verified TLS handshake so repeated monitoring does not produce a false outage. A separate fresh local Supabase stack replayed all 102 committed migrations and regenerated the public schema contract.

## Completed activation — October 21, 2026 (Eastern)

The production release is **`943f3e2f8ffd724029186d4a40c417fa8b150099`**, Netlify deploy **`6ad95318d4baa154ecf3456a`**. Documentation-only commits after this release use skip markers; the deployed application code matches main.

| Check | Final evidence |
| --- | --- |
| Private scanner | Enabled for all seven private attachment areas; all buckets remain private |
| Scanner runtime | Repeated clean/digest checks, EICAR quarantine and two concurrent 25 MiB scans passed from the actual Netlify CRM runtime within the unchanged 12-second deadline |
| Monitoring | Scheduled run at `2026-10-22T00:10:22Z` recorded operational status, current loaded definitions and trusted TLS; no active scanner incident |
| Credentials | Distinct staging/production scanner tokens; cross-environment, missing and wrong tokens denied; no scanner ports exposed beyond the existing HTTPS ingress |
| Customer email | Enabled; existing offsets, per-record opt-outs and 24-hour minimum interval preserved; hourly Netlify function confirmed |
| Activation deliveries | Seven due customer reminders accepted: five proposal follow-ups and two reminders for distinct invoices; each has one provider attempt and a recorded acknowledgment |
| Duplicate protection | Four redundant proposal stages skipped; one competing invoice stage cancelled before any provider attempt; zero duplicate provider IDs or repeated customer-reminder identities |
| Repeat processing | Final repeat: zero claimed, sent, failed or uncertain; no overdue pending queue rows |
| Old communications | Past appointment reminder cancelled normally; previously sent reminder not resent; zero historical payment receipts backfilled |
| History and finance | All 433 pre-existing email-history rows retain their original fingerprint; invoice, invoice-line, payment and checkout row counts and fingerprints match the pre-activation snapshot |
| Staging | Migration 102 installed; customer/recurring automation still off, existing library-only scan gate preserved, staging application deployment unchanged |
| Other automation | Shared job/calendar/manager worker key remains absent; recurring generation remains off; retention/purge were not activated |
| Verification | 2,195 regression checks, typecheck, full fresh 102-migration replay, schema fingerprint check and optimized hosted production build passed; security advisor counts unchanged |

The inventory immediately before gate activation contained zero objects or referenced file paths in the seven areas. No legacy file was labelled clean, deleted, replaced or made public. The local financial rehearsal database was closed to new connections; the existing local development app and stack remain intact.

The competing invoice reminder remains visible in Delivery review as a blocked item (`matching_delivery`, cancelled, zero provider attempts). Its counterpart was accepted. **Do not retry or copy this blocked reminder.** This is a recorded duplicate suppression, not an uncertain delivery. Future scheduled reminders remain queued normally.

During verification, Node's resumed TLS sessions caused false scanner-monitor failures and administrator health alerts. A regression test reproduces the issue without the fix; fresh verified handshakes correct it. The scheduled monitor recorded recovery, and the incident and alert history were preserved. These operational alerts were separate from customer reminders.

This activation did not deploy the public website. An independent website update was observed and preserved. Existing production service credentials were not overwritten; only the new scanner settings and dedicated customer-email worker credential were added. Nine public login-page JavaScript assets were checked for the new credential values; none contained them.

Private operator evidence and credentials are retained outside Git in the restricted local activation workspace. No token values, customer addresses, frozen email bodies or backup credentials appear in this report.

## Operating limits

The home Mac requires power, internet and a running guest. A full Mac reboot requires FileVault unlock and operator login. Scanner failure, stale definitions or a definition reload hold files closed; monitoring reports sustained outages. The current memory-bounded engine pauses scans briefly during reload rather than raising its memory limit or approving unchecked files. No business documents are retained by the scanning bridge. The scanner has no Supabase, Resend or Stripe credentials.

Netlify's current plan requires all supported variable scopes. The three new variables remain production-context only, have no client-public prefix, and both credentials are marked secret. No plan upgrade is required.
