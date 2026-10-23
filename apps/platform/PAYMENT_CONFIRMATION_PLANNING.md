# Complete payment-confirmation preparation

October 23, 2026. Existing communications recovery/scalable-read follow-through. Migration 120 reconciliation is pushed normally to main as `d14d504`. This new implementation remains local and unreleased. Production is unchanged.

## Reproduced defect and change

The payment-confirmation planner read eligible payments once, without paging. With 1,001 synthetic eligible records and a 1,000-row API cap, the actual previous queue prepared 1,000 receipts and reported success. Native local/staging inputs reproduced the same problem with 1,002 payments. The real local Supabase API independently returned the same incomplete successful result. This is a demonstrated preparation gap, not a claim about a real production incident or customer delivery.

The payment planner now uses ascending UUID cursors in pages of at most 200 and continues until an empty page. It does not treat a short server-capped page as complete. Later read errors, unusable/nonadvancing results or an exhausted budget withhold this family's writes and return a short safe error. Existing worker behavior then stops before claiming new deliveries; accepted-email follow-up remains pending for the existing recovery flow.

After checking all source pages, it submits batches of at most 200 with the same existing `auto:payment:<id>:confirmation` keys and duplicate-ignore behavior. A failed or lost batch acknowledgement cannot report complete preparation or acknowledge follow-up recovery. Earlier successful writes may remain; repeating preparation preserves those rows and completes the missing rows under their original keys. No existing accepted/processing/failed/skipped message is reset or resent.

## Scope and transaction limits

Only `syncPayments` in `src/lib/communications/queue.ts` changes application behavior. The source selection, succeeded/since-settings filters, optional invoice restriction, contracting-party/contact precedence, source versions, queue fields and current scheduling rule remain intact. Existing sending switches, source snapshots, sender, payment receipt identity, claim fencing, proposal-expiry checks, frozen requests and delivery history are preserved. Money, balances, payment processing, receipt templates, authorization, RLS, schema, dependencies and hosting are unchanged. All 120 migration sources and generated public types remain byte-identical. No new migration is needed.

Payment preparation has a five-second budget, with an abort signal on each read/write. If it cannot finish, it returns an error and leaves supervised recovery pending. This is a bounded complete pass, not a persistent cross-run cursor or an unlimited backlog processor. The return field `created` retains its existing meaning of acknowledged preparation inputs, including stable-key duplicates; it is not a new database insert count.

The scan is not a single database snapshot. Newly eligible payments behind the cursor are picked up on a later pass; previously read sources can change. Existing final source/recipient/payment checks remain authoritative before sending. Invoice-scoped recovery retains its invoice filter on every page and does not plan unrelated schedules. Other reminder families can prepare independently in parallel; a payment-family failure prevents this worker's new claim batch, not an already-running worker or an earlier committed batch. This does not make synchronization globally atomic.

## Verification

| Check | Result |
| --- | --- |
| Full CRM regression suite | **2,509 passed**, no failures/skips; includes 14 new focused cases |
| Type generation, TypeScript, optimized build | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| New native local database | Fresh original 120 replay; no shared database reset |
| Native local and staging SQL | **11 assertions each**, 1,002 synthetic payments each, all hosted fixtures rolled back |
| Actual queue/worker/accepted-follow-up code with native inputs | **16 scenarios** across local/staging inputs; old truncation reproduced, complete preparation and safe recovery verified |
| Actual local Supabase client/PostgREST | Old planner reports 1,000; new planner reads all 1,002 in seven source requests and submits six bounded same-key batches; invoice scope, existing queue history and stored OFF settings preserved |
| Preservation | Exact staging 120 ledger/catalog, 49 protected record sets, settings and Auth guard unchanged; local original ledger/catalog/public/private/Auth rows preserved by rollback checks |

Focused tests cover >1,000 sources; pages capped below the requested size; failed/null/thrown later reads; repeated, invalid or unordered cursors; source deletion before the cursor; stable duplicate-ignore keys; partial/lost writes and recovery; no claim on failure; pending accepted-email follow-up; invoice scope; succeeded/since/contact eligibility; OFF switches; budget expiry; and concurrent preparation. Healthy recipient/type/key/version fields match the previous planner. Native checks also verify anonymous write denial and that preparation creates no provider request or acceptance event.

Native-input worker tests use controlled PostgREST responses/transport with database-produced synthetic sources. Error and lost-ack cases are controlled responses, not a certification of a hosted outage. Real PostgREST acceptance runs only in the new owned local project. Staging fixtures and changes roll back; stored automatic sending, appointment notices and recurring generation remain OFF. Clean build verification copied no ignored environment files/provider credentials and recorded zero external application requests.

## Remaining work and evidence

Continue the existing scalable communications work with the other bulk source planners; quote, invoice and visit planning are outside this payment-specific fix. Actual mailbox/device/assistive-technology acceptance, unresolved owner terms-policy decisions and the separate managed-runtime follow-up remain in the existing roadmap. This change does not authorize historical receipt retries, application deployment or production activation.

Sanitized receipt: `staging/PAYMENT_CONFIRMATION_PLANNING_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/payment-confirmation-planning/`. Raw generated records, credentials and native/API responses remain outside Git. Only the task-owned local project is stopped after acceptance, with data retained. Main is preserved through `d14d504`; the separate runtime branch stays at `06580f6`. No production query/change, hosted migration application, customer email, provider request, key rotation or support message occurred.

### Push follow-through — October 23, 2026

The verified payment preparation fix is pushed normally to `origin/main` as `4a9ea6c30f5855d93f4857fdcf7187342054b898`, with CI/Netlify skip markers. The next existing proposal/invoice reminder-source follow-through is recorded in `REMINDER_SOURCE_PLANNING.md`. Payment preparation remains unchanged in that batch. No app deployment, production change, automatic sending or historical resend occurred.
