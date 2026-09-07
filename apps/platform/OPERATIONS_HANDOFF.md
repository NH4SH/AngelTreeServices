# Three-week management handoff

## Morning routine

1. Open Dashboard. Start with Needs attention, Due handoffs, and Today/Tomorrow.
2. Open Follow-ups and choose Assigned to me. Also check All office handoffs for unassigned work.
3. Review Leads & Communications for new calls, preferred contact method, customer responses, and failed deliveries.
4. Confirm today's estimates, crew, service locations, and equipment in Schedule. Change timing in Angel Tree, not Google Calendar.
5. Review completed jobs without invoices and unpaid/overdue invoices. A draft invoice is not a sent invoice; open and send it deliberately.

Dashboard queues are bounded previews, not exhaustive counts. Use their full-list links when workload is high. Estimates are considered performed only when recorded as completed, not simply because their time passed. The estimate follow-through preview covers the latest 100 completed schedule events and excludes linked proposals (including drafts), job-linked proposals, and archived jobs. Legacy appointments without this relationship require a manual review in Schedule. Draft proposals have their own queue.

## Leave a next action

Customer, organization, quote, job, and invoice detail pages now have Next actions. Use Add next action, name the action, set its Eastern due time, and optionally assign an active office login. Shared office queue is appropriate when either manager can handle it. Descriptions are internal; do not put crew instructions here expecting the field app to receive them.

The implementation reuses `follow_up_tasks`, its existing staff RLS, and activity events. Tasks on quotes/jobs/invoices inherit their contracting party and appear on that party's page too. Complete or start tasks directly from the record or Follow-ups. A save retry uses the same request key rather than inserting a second task. Open tasks are bounded to 20 per record/100 in the queue; record panels show the first 10. The full recurring screen retains completed task history and reopening. Reopening/starting clears an old snooze.

Schedule events use their linked customer/organization/job for handoffs; no new event task model was added. From the calendar drawer, Open customer/organization/job, then add the action there. Tasks are office-only, not exposed to public tokens or crew mobile endpoints. There are no automatic task emails.

## Accounts and permissions

Use individual, approved **admin** accounts for managers who must handle the whole routine. Do not share Noel's login. Do not assign owner just for the trip. An employee record and an authenticated login are separate: confirm each employee is linked to the intended active profile and role under platform access.

| Routine | Existing authorization boundary |
| --- | --- |
| Lead/customer estimate conversion | Owner/admin server actions in admin/schedule/actions.ts |
| Customer, organization, locations, job CRUD | Authenticated server clients and staff database policies |
| Quote/invoice writing and email with CC | Internal staff checks; owner/admin/payroll_admin/estimator |
| Schedule and crew assignment | Staff actions/database functions; safety overrides require owner/admin |
| Portal links and deliberate approval | Existing protected actions, token validation and workflow functions; unchanged |
| Manual payment, correction, restore | Owner/admin checks in lib/actions/payments.ts |
| Financial reporting | Owner/admin/payroll_admin |
| Access approvals and system health | Owner/admin |
| Google Calendar | Each user's existing employee integration; one-way mirror |

Admin is broad: it includes access management and sensitive operations, not a limited dispatcher role. Estimator is insufficient for the entire handoff (lead conversion and manual payments need admin). No account or permission was changed. This is a source-code audit, not confirmation of production account roles or installed RLS.

## Customer calls and workflow

- Search Customers/Organizations. Use contact information, service locations/access notes, linked quotes/jobs/invoices, and communication/delivery history already on those pages. The new next-action section is above the existing details, which are preserved.
- New lead: open the lead estimate form, verify intake details and preferred contact channel, call back, then choose timing. Do not create a second customer to bypass an error.
- Estimate performed: record completion. Review estimate follow-through and Draft quotes; write/send a proposal deliberately.
- Approval: use customer approval or the existing explicit manual approval, then open the linked job. Schedule and assign crew, rather than creating another work order.
- Completed work: open the job and create its invoice. Check items, due date, recipient/CC and delivery history before sending.
- Payment: record actual cash/check receipt through the manual payment action. Do not record it as paid merely because a pickup was requested. Stripe reconciliation stays unchanged.
- Resend: use the quote/invoice composer and existing link. Do not regenerate a working link as a routine resend.
- Rescheduling/cancellation: edit the existing schedule event/workdays to preserve record links; do not create replacement customers or jobs.

## Storm / emergency call

Dashboard links to customer lookup and the existing schedule drawer. Find/reuse the customer and service location; capture callback number, issue, affected structures/utilities and access restrictions. Choose Emergency in the event form, confirm the response window and assigned crew, and associate the existing job if available. Use the job's existing photo section for images and crew-visible scope/access notes for field instructions. Leave an office Next action for callback commitments. Do not promise a guaranteed arrival time or declare a hazard safe remotely. Use emergency services/utility contacts for immediate threats as appropriate.

## Failures and escalation

- Failed communications remain visible on Dashboard/Follow-ups. Open the linked record and its delivery history before retrying. Provider acceptance is not proof of delivery; a history-recording warning needs investigation before resending.
- Settings > System Health covers service outages; it does not prove every individual email or payment succeeded.
- Settings > Google Calendar opens each user's connection/status/retry controls. Check errors there. The CRM schedule is authoritative even when sync fails. No central cross-user Google health query was added.
- Lead notification emails are not the intake database. Check Leads & Communications even if a notification never arrives.
- Payment discrepancies: inspect invoice payment/activity history; do not repeatedly charge or delete entries to make totals match.
- Persistent auth, schema, webhook, or email-credential failures still require an administrator/developer with appropriate vendor access. Arrange a backup contact before leaving.

## Native app

Today, Schedule, Customers, job details, call/directions and photos already support field operations. Owner/admin team visibility and crew assigned-work limits remain unchanged. Use the web CRM for office handoffs and full communications management. No iOS changes/build were required; internal tasks may contain financial or private notes, so they were not added to crew APIs.

## Daily digest decision

Deferred automatic digest: existing transactional messages do not provide a manager digest's recipient preferences, opt-in schedule and per-day deduplication. The live morning dashboard is the V1 summary. A later implementation can use the existing email/activity infrastructure with explicit manager recipients, business-date dedupe keys, no customer recipients, and retry-safe delivery. Do not repurpose customer reminder settings.

## Pre-trip rehearsal (use approved test records)

1. Sign in separately as each manager; test recovery and web/native access. Confirm admin role and active profile, not just employment status.
2. Intake a test lead, verify contact preference, schedule its estimate, complete it, and create/send a test proposal only to a controlled recipient.
3. Approve once, confirm one job, schedule multiple days and assign crew. Reschedule/cancel one event and verify original links.
4. Complete work, create one invoice, verify its due date, send/resend deliberately, and inspect delivery history/CC.
5. Rehearse manual payment in an isolated environment; do not use live customer invoices for testing.
6. Create a next action for the other manager, confirm My follow-ups, complete it, and verify activity/history and party context. Retry a failed save without a duplicate.
7. Confirm crew cannot read office tasks; verify field contact/directions/photos still work.
8. Rehearse an emergency call using the existing customer/job flow. Review integration failure/retry screens.
9. Review all unassigned tasks and high-volume full queues before departure. Agree on who covers calls and invoice follow-up each day.

No new migration is needed. Production must already have the existing recurring-service/follow_up_tasks migration and current quote/schedule relationships. Nothing in this task applies migrations, deploys, changes roles, sends email, or touches real customer data.

## Verification and changed files

Platform typecheck and production build passed. Focused handoff/detail-loading tests: 20 passed. Schedule: 35 passed. Mobile contracts: 20 passed. Security: 46 passed, with the opt-in live local password-recovery integration test skipped. Isolated Chromium/Firefox checks cover 320, 390, 768 and 1440px, queue expansion, direct drawer links, long text, form failure recovery (including assignee), stable retry keys and success feedback. These are fixture-backed tests, not a production workflow rehearsal.

Docker was not running, so a real local PostgREST/RLS integration check could not run. No production database was used as a substitute. Confirm the existing schema and perform the rehearsal above before departure. No Xcode build was needed because native sources were not changed.

Files changed, relative to `/Users/noelsierra/ats`:

- `apps/platform/src/app/admin/page.tsx`
- `apps/platform/src/app/admin/follow-ups/page.tsx`
- `apps/platform/src/app/admin/customers/[customerId]/page.tsx`
- `apps/platform/src/app/admin/organizations/[organizationId]/page.tsx`
- `apps/platform/src/app/admin/quotes/[quoteId]/page.tsx`
- `apps/platform/src/app/admin/jobs/[jobId]/page.tsx`
- `apps/platform/src/app/admin/invoices/[invoiceId]/page.tsx`
- `apps/platform/src/components/NextActionForm.tsx`
- `apps/platform/src/components/NextActionsPanel.tsx`
- `apps/platform/src/components/CompletedEstimatesPanel.tsx`
- `apps/platform/src/lib/next-actions.ts`
- `apps/platform/src/lib/data/next-actions.ts`
- `apps/platform/src/lib/actions/recurring.ts`
- `apps/platform/src/lib/data/jobs.ts`
- `apps/platform/src/lib/data/schedule.ts`
- `apps/platform/src/lib/types/database.ts` (TypeScript dashboard summary only, not schema)
- `apps/platform/src/styles/globals.css`
- `apps/platform/tests/handoff.test.mjs`
- `apps/platform/tests/handoff.browser.mjs`
- `apps/platform/OPERATIONS_HANDOFF.md`

Run focused tests with `node --test tests/handoff.test.mjs tests/detail-loading.test.mjs` from `apps/platform`. The browser test is `node tests/handoff.browser.mjs`; set `ESBUILD_MODULE` and `PLAYWRIGHT_MODULE` to external tooling paths if those optional tools are not installed locally. Browser artifacts stay in ignored `output/playwright/handoff`.
