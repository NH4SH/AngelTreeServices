# Complete proposal and invoice reminder preparation

October 23, 2026. Existing communications recovery/scalable-read follow-through. Payment-confirmation planning is pushed normally to main as `4a9ea6c`. This new batch remains local and unreleased; production is unchanged.

## Reproduced defect and change

Proposal follow-up and invoice reminder planners each read eligible records once, without paging. With 1,001 eligible synthetic sources and a 1,000-row API cap, both previous planners prepared 2,000 stages instead of 2,002 and reported success. Native local/staging inputs and the real local Supabase API reproduced this incomplete-success path. No real customer incident or delivery is inferred.

Both planners now read ascending UUID pages of at most 200 until an empty page, continuing through short server-capped pages. They retain their exact eligibility filters and build both existing reminder stages only after the complete read succeeds. Later read failures, unusable/nonadvancing results and budget expiry return a plain safe error; existing worker behavior withholds a new delivery claim and leaves accepted-email follow-up pending.

Complete source reads precede batches of at most 200 duplicate-ignore writes. Each original quote/invoice/stage key, recipient, timing, source version and queue field is preserved. Interrupted or lost batch acknowledgements cannot report complete preparation. Earlier successful batches may remain; existing recovery repeats the same keys without resetting accepted, processing, failed, skipped or cancelled history. No automatic historical resend is added.

## Scope and limits

Application changes are confined to `syncQuotes`, `syncInvoices` and two internal preparation helpers in `src/lib/communications/queue.ts`. Payment-confirmation preparation and visit planning are byte-identical to the pushed implementation. Tests use canonical UUID fixtures for the existing proposal-expiry planner case; its assertions and business expectations are unchanged.

Proposal status, enabled flags, 14-day sent window and explicit expiry filter are unchanged. Invoice status, positive stored-balance selection, enabled flag, non-null due date and 45-day window are unchanged. Optional invoice scope is applied on every page. Contact precedence and the existing configured stage offsets remain intact. No payment/financial calculation, document term, template, sender, capability, RLS, lock, source snapshot, native claim or provider key changes. All 120 migration files, generated types, schema manifest, dependencies, employee UI and dashboard remain unchanged; no migration is needed.

Each family has a five-second read/build/write budget with request abort signals. Preparation is a bounded complete pass, not a durable cross-run cursor or an unlimited backlog processor. The existing `created` result counts acknowledged preparation inputs, including ignored same-key duplicates; it is not a new insert count. A source read failure withholds that family's writes. A later write failure preserves acknowledged earlier batches and leaves recovery pending.

The scan is not one database snapshot. New eligibility behind the cursor is picked up on another pass; sources already read can change. Existing final source/recipient/expiry/payment checks remain authoritative before provider I/O. Other families prepare independently in parallel. A failure stops this worker's new claim batch, not an already-running worker or earlier committed preparation. This does not make all reminder preparation one transaction.

## Verification

| Check | Result |
| --- | --- |
| Full CRM regression suite | **2,535 passed**, no failures/skips; includes 26 new focused cases |
| Type generation, TypeScript, optimized build | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| Native local database | New seed-free original 120 replay; no shared development reset |
| Native local and staging SQL | **12 assertions each**; 1,005 proposal and 1,006 invoice fixtures per environment, including 1,001 eligible sources per family; hosted fixtures fully rolled back |
| Actual planner/worker/accepted-follow-up code with native inputs | **32 scenarios** across both families and environments; previous truncation reproduced; healthy payloads/timing byte-identical; complete reads and safe recovery verified |
| Actual local Supabase client/PostgREST | Previous preparation 4,000 stages; new preparation 4,004 stages; seven source requests per family and 22 writes, each capped at 200; existing queue history/settings preserved and invoice scope retained |
| Preservation | Exact staging migration-120 ledger, 5,110 catalog objects, 49 protected record sets, settings and Auth guard unchanged; original local ledger/catalog/public/private/Auth rows preserved after rollback |

Focused checks cover >1,000 sources, short pages, returned/thrown/null read failures, invalid/nonadvancing/unordered cursors, earlier deletions, pending recovery, no claims after incomplete reads/writes, partial/lost batch acknowledgements, exact-key recovery, bounded writes, concurrent preparation, budget expiry, master/family OFF controls, proposal expiry/contacts/timing, invoice eligibility/contacts/timing and invoice-scoped recovery. Native checks verify both stage keys, source/financial preservation, saved-history preservation, anonymous denial and no outbound request/acceptance. Existing invoice-initial-state protection was respected when choosing synthetic excluded records; no trigger or guard was disabled.

Error/acknowledgement scenarios use controlled responses with database-produced synthetic inputs; they do not certify a hosted outage or deployed worker. Real PostgREST checks run only against the new owned local project. All staged synthetic records roll back. Stored automatic sending, appointment notices and recurring generation remain OFF. Clean build verification copied no ignored environment files/provider credentials and recorded zero external application requests.

## Remaining work and evidence

Continue the existing scoped communications follow-up with visit-source planning and complete appointment-notice coverage before claiming all bulk preparation reads are complete. Owner terms-policy decisions, mailbox/device/assistive-technology acceptance and the separate managed-runtime issue remain in the current roadmap. This batch grants no production, deployment, automatic-activation or historical-message retry authority.

Sanitized receipt: `staging/REMINDER_SOURCE_PLANNING_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/reminder-source-planning/`. Raw synthetic records, native/API responses and credentials stay outside Git. Only the task-owned local project is stopped after acceptance, retaining its data. Main is preserved through `4a9ea6c`; the separate runtime-security branch remains at `06580f6`. No production query/change, hosted migration application, customer email, provider request, key rotation or support message occurred.
