# Angel Tree Platform Production Testing

Run the reporting and profitability smoke checklist in [REPORTING.md](./REPORTING.md) after applying `20260717005036_business_reporting_profitability.sql`.

Use this checklist after deploying the admin CRM to the live admin domain.

## 1. Deployed Admin URL Checklist

Primary admin domain:

```text
https://admin.angeltreeservices.org
```

Core URLs to verify:

- `/login`
- `/admin`
- `/crew`
- `/admin/schedule`
- `/admin/time`
- `/admin/payroll`
- `/portal/quote/[token]`
- `/portal/invoice/[token]`
- `/api/leads`

## 2. Required Netlify Environment Variables

Set these on the Netlify admin site:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PORTAL_TOKEN_ENCRYPTION_KEY=
RESEND_API_KEY=
EMAIL_FROM=Angel Tree Services <info@angeltreeservice.org>
EMAIL_REPLY_TO=info@angeltreeservice.org
INTERNAL_LEAD_NOTIFICATION_EMAIL=info@angeltreeservice.org
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
APP_BASE_URL=https://admin.angeltreeservices.org
COMMUNICATION_WORKER_SECRET=
NEXT_PUBLIC_GOOGLE_REVIEW_URL=
LEAD_INTAKE_ALLOWED_ORIGINS=https://angeltreeservices.org,https://www.angeltreeservices.org
```

Optional server-side tooling variable:

```env
SUPABASE_DB_URL=
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- `PORTAL_TOKEN_ENCRYPTION_KEY`, `RESEND_API_KEY`, and the email settings are server-only and must not use a `NEXT_PUBLIC_` prefix.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server-only. Start with Stripe test keys and never expose them through browser configuration.
- `APP_BASE_URL` must be `https://admin.angeltreeservices.org` in production so Checkout returns to the same customer portal link.
- `COMMUNICATION_WORKER_SECRET` must be a server-only random value of at least 32 characters shared only by the Netlify Scheduled Function and internal processor route.
- Do not add the service role key to the public website Netlify site.
- `SUPABASE_DB_URL` is not required for normal app page runtime right now.
- Secure invoice links require `supabase/migrations/20260709132222_invoice_portal_tokens.sql`
  and `supabase/migrations/20260710150434_ensure_invoice_portal_tokens.sql`.
  Also apply `supabase/migrations/20260716165828_add_recoverable_portal_links.sql` before using recoverable customer links.
  If `/admin/invoices/[invoiceId]` shows an `invoice_portal_tokens` schema-cache notice, apply the pending migrations and refresh/wait for the Supabase schema cache.

## 3. Required Supabase Auth URLs

Set in Supabase Auth:

- Site URL: `https://admin.angeltreeservices.org`
- Redirect URL: `https://admin.angeltreeservices.org/**`
- Redirect URL: `http://localhost:3000/**`

If preview deploy auth is needed later, add those preview URLs intentionally.

## 4. Manual Route Test List

Signed out:

1. Open `/login` and confirm the sign-in page renders.
2. Open `/admin` and confirm redirect to `/login?next=/admin`.
3. Open `/crew` and confirm redirect to `/login?next=/crew`.
4. Open `/portal/quote/[token]` with a real token and confirm it loads without login.
5. Open `/portal/invoice/[token]` with a real token and confirm the invoice, logo, formatted line items, and print action load without login.

Signed in:

1. Open `/admin` and confirm the dashboard renders.
2. Open `/admin/schedule` and confirm the schedule page renders without a database notice.
3. Open `/admin/time` and confirm the time review page renders for allowed roles.
4. Open `/admin/payroll` and confirm the payroll page renders for allowed roles.
5. Open `/crew` and confirm the crew workspace renders for crew-capable accounts.

## 5. Role Test List

### Owner / Admin

- Can sign in
- Can open `/admin`
- Can open `/admin/time`
- Can open `/admin/payroll`
- Can open `/crew`

### Crew

- Can sign in
- Can open `/crew`
- Should not receive blank screens on restricted admin routes
- Should be redirected or shown a helpful restriction state where access is limited

### Non-staff

- Can sign in if the account exists
- Must not gain access to internal admin routes
- Must see a helpful restriction state instead of raw errors or blank pages

### Timer-enabled user

- Can open `/crew/time`
- Can clock in
- Can clock out
- Sees only their own timer state

### Timer-disabled user

- Can sign in if the account exists
- Must not be able to use the time clock
- Must see a clear access or enablement message instead of a broken page

## 6. Lead Intake Test Notes

Public lead submissions should originate from:

```text
https://angeltreeservices.org
https://www.angeltreeservices.org
```

Test flow:

1. Submit the public website lead form.
2. Confirm the form shows a success state.
3. Confirm it does not show a false failure message after success.
4. Confirm the lead is written into Supabase CRM records.
5. If the form fails, verify:
   - `LEAD_INTAKE_ALLOWED_ORIGINS` is set correctly
   - the public site is posting to `https://admin.angeltreeservices.org/api/leads`
   - Netlify env vars were redeployed after changes

## 7. Operational Workflow Smoke Test

Run this with a non-production test customer after migration and deployment:

1. Create a customer and service location, then create a quote. Confirm the quote starts as `draft`.
2. Save/edit the draft and confirm it remains `draft`; generate a customer link and verify the signed-out portal page loads.
3. Send the quote through the CRM. Confirm it becomes `sent` only after the send succeeds and the existing active link is reused.
4. Edit the sent quote, reopen the original signed-out link, and confirm it shows the latest scope and totals.
5. Approve the quote. Confirm one accepted work order is created or linked; repeat the action and confirm no duplicate work order appears.
6. Schedule the work order, move it through `in progress`, then complete it.
7. Generate the invoice from the completed work order. Confirm scope, prices, quote, customer, and job links carry over.
8. Attempt invoice generation again. Confirm the app links to the existing invoice instead of creating a second invoice.
9. Generate or send the invoice link, edit the invoice, and confirm the same signed-out link shows the saved update.
10. Duplicate a quote, invoice, and work order. Confirm each duplicate is a draft/new record with no copied portal token, email history, payments, time entries, photos, or internal crew notes.
11. Confirm the dashboard shows any remaining draft quote, accepted work awaiting scheduling, completed work awaiting invoice, and sent invoice awaiting payment in their queue.

## 8. Communication Queue Smoke Test

Apply `supabase/migrations/20260716215149_automated_customer_communications.sql` after the security-hardening migration. Keep **Automated sending** off in `/admin/communications` until this test passes. The hourly worker is `netlify/functions/process-communications.ts`.

## Mobile crew job closeout

Apply `supabase/migrations/20260716222258_crew_job_closeout_workflow.sql` before this test. Use non-production customer and job records.

1. Assign a scheduled job to a timer-enabled crew test user and open `/crew/jobs/[jobId]` on a phone-sized viewport.
2. Tap **Start work**. Confirm the schedule times remain unchanged and a second start is rejected.
3. With an active timer on a different job, confirm Start work warns and does not create overlapping time.
4. Mark every scope item. Mark one item partially completed and confirm an exception note is required.
5. Upload before, after, and issue photos. Temporarily interrupt the network during one upload, confirm the failure is visible, and retry.
6. Complete every checklist item. Confirm a Not applicable choice requires a reason.
7. Enter private crew notes and a separate customer-facing summary. Confirm multiline formatting survives save and refresh.
8. Answer the incident and additional-work questions. Confirm incident Yes requires a description and issue photo.
9. Select acknowledged, customer not present, or customer declined. Confirm a typed name is required only for acknowledged.
10. Submit twice. Confirm one closeout remains, one revision is created for the successful submission, and the second request is rejected.
11. Confirm the crew view locks and the job appears at `/admin/jobs/closeouts` as completed awaiting review.
12. Review scope, checklist, photos, notes, incident, acknowledgment, and time at `/admin/jobs/[jobId]/closeout`.
13. Return it with a reason. Confirm assigned crew can correct it and the prior submission snapshot remains.
14. Resubmit, approve, then mark ready to invoice. Confirm incidents and scope exceptions require these deliberate office actions and never become invoice-ready automatically.
15. Generate the invoice through the existing action. Confirm a repeated click opens the existing invoice and does not create another one.
16. Confirm the invoice and customer portal exclude crew/internal notes and incident details.
17. Sign in as a different crew user and confirm the job and closeout are unavailable. Check anonymous/customer portal requests cannot read closeout tables.
18. Recheck quote, invoice, portal-link, email, Stripe, schedule, and time-clock workflows.

If Docker/local Supabase is available, run `supabase db reset`, execute assigned-crew/staff/anonymous RLS checks, and run the security advisors. Otherwise apply the migration in a reviewed Supabase environment and do not treat application build results as database verification.

1. Create a test customer with a valid email and schedule an estimate. Confirm a reminder can be scheduled and sends once.
2. Reschedule the estimate. Confirm the obsolete pending reminder is cancelled and a new version is scheduled.
3. Send a quote with an active recoverable portal link. Confirm 3-day and 7-day follow-ups appear only after automation is enabled.
4. Approve the quote before a follow-up runs. Confirm pending follow-ups are cancelled and no reminder is sent.
5. Create an unpaid invoice with a due date and active recoverable invoice link. Confirm a reminder shows the current server-side balance and reuses that link.
6. Pay the invoice before the reminder runs. Confirm pending invoice reminders are cancelled.
7. Confirm one payment confirmation is queued per successful payment. Disable Stripe automatic receipt email if the platform confirmation is the chosen receipt.
8. Invoke **Process due reminders now** twice or trigger two workers together. Confirm one successful `email_events` row and one provider message exist for each logical reminder.
9. Double-click **Send reminder now**. Confirm the pending state prevents a second submit and the stable idempotency key prevents a duplicate send.
10. Change the customer email before a scheduled send. Confirm the worker uses the current email or skips when it is invalid; it must not send to the stale address.
11. Cancel or complete an appointment and confirm its pending reminders are cancelled.
12. Revoke or expire a portal link and confirm quote/invoice reminders skip with a visible reason rather than generating a replacement.
13. Inspect received appointment email and confirm calendar notes, access notes, gate codes, service notes, crew notes, and internal notes are absent.
14. Force a temporary provider failure, confirm staff can see it, and confirm retries stop after three attempts.
15. Open customer and organization details and confirm communication history is visible only to signed-in staff.

After the test passes, enable **Automated sending**. Turn it off immediately if unexpected recipients or timing are observed; manual sends and history remain available.

## 9. Stripe Checkout Smoke Test

Before testing, apply `supabase/migrations/20260716210754_stripe_invoice_payments.sql`, deploy with Stripe test-mode environment variables, and configure this Stripe webhook endpoint:

```text
https://admin.angeltreeservices.org/api/stripe/webhook
```

Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `payment_intent.payment_failed`.

1. Open a sent, unpaid invoice through a valid customer link and confirm the displayed amount matches CRM balance due.
2. Click **Pay invoice**, complete a Stripe test payment, and confirm the webhook creates one successful payment record.
3. Refresh the same customer link. Confirm it shows paid status and no payment button.
4. Replay the completed webhook from the Stripe dashboard. Confirm no duplicate payment record appears.
5. Click Checkout twice before paying. Confirm the portal reuses one active Checkout Session and only one completed payment is recorded.
6. Try a voided, paid, draft, or zero-balance invoice. Confirm no payment button appears and the checkout endpoint refuses it.
7. Edit an unpaid invoice amount, then start checkout. Confirm the new Checkout Session uses the latest remaining balance.
8. Duplicate a paid invoice. Confirm the new draft has no payment records, Stripe session, or portal-token history.
9. Record a manual check payment as an owner/admin. Confirm the payment ledger, balance, and invoice status update without any Stripe identifiers.

## 10. Supabase Security Regression

After applying `supabase/migrations/20260716212545_harden_security_definer_functions.sql`:

1. Run `supabase/verification/security_advisor_hardening.sql` and inspect every result set.
2. Confirm former public role/schedule/time helpers are not exposed as REST RPCs to anon or authenticated users.
3. Create a test employee signup and confirm the auth trigger still creates its profile/access flow.
4. Test crew schedule, estimator schedule, owner/admin access, timer-enabled clock-in/out, and admin time review.
5. Confirm an unauthorized user cannot inspect or review another employee's time.
6. Open existing signed-out quote and invoice links and confirm they still load without token changes.
7. Confirm quote/invoice link generation and job-photo access still enforce their existing role boundaries.
8. Confirm Stripe webhook/service-role payment processing remains idempotent and unaffected.
9. Rerun Supabase Security Advisor.
10. In Supabase Auth settings, enable **Prevent the use of leaked passwords** if the advisor still reports it disabled.

Keep `app_private` out of the Supabase Data API exposed-schema list. See `SECURITY_HARDENING.md` for the full function findings and expected grants.

## 11. Rollback Notes

If the admin deploy fails:

1. Open the Netlify admin site.
2. Go to **Deploys**.
3. Roll back to the last known good deploy.
4. Re-check env vars before retrying.

Important:

- The public website should remain unaffected because it is deployed as a separate Netlify site.
- Do not change public-site DNS or env vars while rolling back the admin app unless the lead form target must be corrected.
## Equipment, inspection, and maintenance checks

1. Sign in as admin/owner and create a vehicle with an asset number, VIN, plate, safety class, inspection checklist, and maintenance interval.
2. Attempt to create another active asset with the same VIN or plate. Confirm the warning appears and only saves after the explicit duplicate confirmation.
3. Edit the asset and confirm its ID and existing history remain unchanged.
4. Add mileage and engine-hour readings. Enter a lower reading and confirm a reason plus correction acknowledgment are required and the prior row remains visible.
5. Add date-, mileage-, and hour-based maintenance schedules. Confirm a date-based item appears as a maintenance event in `/admin/schedule`.
6. Record completed maintenance and confirm the maintenance history remains and the next interval advances.
7. Assign equipment to a job, schedule event, and crew employee. Confirm it appears on the equipment record, linked job, schedule detail, and `/crew/equipment` for that employee.
8. Attempt an overlapping assignment. Confirm it blocks unless owner/admin enters an override reason.
9. Take an asset out of service and confirm assignment is blocked. Resolve unsafe problems, enter a return-to-service reason, and confirm assignment becomes available again.
10. As crew, confirm only currently assigned equipment is visible and no VIN, ownership, purchase cost, admin notes, or unrelated asset data appears.
11. Complete each fixed inspection template at least once: bucket/aerial, chipper, trailer, chainsaw, skid steer, climbing/rigging, and PPE.
12. Fail a safety-critical inspection item. Confirm the inspection saves, a problem report is created, and the asset immediately becomes out of service.
13. Report an unsafe equipment problem with a camera photo. Confirm the image is stored in the private `equipment-files` bucket and the asset becomes out of service.
14. Report a non-unsafe attention item. Confirm staff sees it in the fleet queue without deleting or replacing prior reports.
15. Verify out-of-service assets, maintenance due, failed inspections, open problems, and expiring documents appear on the admin dashboard/equipment summary.
16. Verify archived equipment leaves active fleet results while readings, assignments, inspections, repairs, documents, and activity rows remain stored.
17. Sign out and confirm equipment tables, RPCs, documents, and storage files are not publicly enumerable.
18. Sign in as crew and attempt direct table reads for `equipment_assets`, `equipment_documents`, and `equipment_asset_costs`; confirm RLS denies them.
19. Sign in as estimator/office staff and confirm operational fleet management works but purchase costs remain hidden.
20. Sign in as admin/owner and confirm purchase cost is available on create/edit.

## Employee onboarding, training, and safety checks

Apply `supabase/migrations/20260716232544_equipment_fleet_management.sql` and then `supabase/migrations/20260716235514_employee_onboarding_training_compliance.sql` before this test.

1. Create an employee record before platform access approval.
2. Approve that employee's existing access request.
3. Confirm the operational employee links to the correct existing auth profile.
4. Confirm approval, page refresh, and repeat backfill do not create duplicate profiles or employees.
5. Assign a crew, supervisor, and platform roles; confirm only owner/admin can change roles.
6. Start onboarding and confirm the seeded checklist appears.
7. Complete and mark checklist items not applicable; confirm verifier and timestamps persist.
8. Reopen a completed item and confirm a reason is required and retained.
9. Add a credential and confirm it remains pending verification.
10. Verify the credential as staff; confirm an employee cannot verify their own credential.
11. Add expiration dates at 90, 60, 30, and 7-day thresholds and confirm configured warning badges/queues.
12. Confirm expired credentials remain stored and visible rather than being deleted.
13. Configure a job-role or equipment-category qualification warning and assign an employee missing it.
14. Confirm schedule/equipment assignment warns without silently removing existing assignments.
15. Override as owner/admin with a reason and confirm `employee_qualification_override` activity is recorded.
16. Create one training session with multiple attendees and confirm one shared session plus distinct attendee rows.
17. Acknowledge assigned training with a typed name; change the document version and confirm prior acknowledgment history remains.
18. Create a safety meeting with present and absent employees and confirm attendance history appears on each employee.
19. Confirm a present employee can acknowledge only their own assigned safety meeting.
20. Upload employee-visible, supervisor-visible, admin-only, and owner-only documents and verify each access boundary with separate accounts.
21. Confirm all employee files use short-lived signed URLs and anonymous users cannot enumerate the bucket or metadata.
22. Issue PPE/equipment through the existing fleet assignment and confirm employee and admin views reference the same assignment.
23. Return the item and confirm assignment history remains visible.
24. Mark an employee as a supervisor and confirm `/crew/team` shows only direct-report/matching-crew readiness, without contact, HR, role, auth, or private document data.
25. Submit a correction, renewed-credential document, and training request from `/employee`; confirm each remains pending for staff review.
26. Mark an employee inactive; confirm login profile and timer eligibility are disabled while old time, job, training, credential, acknowledgment, and equipment history remains.
27. Complete the separation checklist and explicitly review future schedule assignments and unreturned equipment.
28. Exercise one existing optional credential reminder through the current email system only if configured; confirm no private note or document content is included and no duplicate reminder is produced.
29. Recheck scheduling, time clock, payroll review, fleet, closeout, quotes, invoices, portals, email, and Stripe workflows.
30. Run Supabase Security Advisor and verify no new anonymous table access, broad RPC execute grant, public bucket, or exposed `app_private` function/schema exists.

## Production stabilization regression

Apply the reviewed migrations in `DEPLOYMENT_CHECKLIST.md` before this test. Use non-production records and separate owner, estimator, and crew accounts.

1. Open Dashboard, Reports, Employees, Jobs, Quotes, Change Orders, Recurring Services, Invoices, Schedule, Equipment, Materials, Time, Payroll, and Documents. Confirm no ambiguous-relationship, missing-column, missing-table, or repeated database notice appears.
2. Create one individual job and one organization job. Confirm the first resolves only its contracting customer and the second resolves only its organization.
3. Open an individual quote and organization invoice. Confirm their explicit contracting relationships and linked work orders are correct.
4. Assign equipment to a crew member as an owner. Confirm both the assignee and assigning staff member display correctly.
5. Open Reports > Crew & labor. Confirm the type comes from `time_entries.entry_type`, filters and CSV export work, and no `time_type` query remains.
6. Open Payroll with no entries, then with one completed entry in an active pay period. Confirm both load and a crew account receives the existing access-required screen.
7. Open Recurring Services and confirm `follow_up_tasks` is available. Open Reports > Data quality and confirm `contracting_party_review_items` is available.
8. Upload a document, link it to each supported record type as appropriate, search/filter it, open its short-lived signed URL, and archive it. Confirm the Storage bucket is private.
9. Confirm crew and anonymous sessions cannot query `documents` or `pay_periods`; crew can still read only its permitted time and assigned work.
10. Confirm anonymous requests cannot query internal jobs, follow-up tasks, review items, or documents. Confirm no new `SECURITY DEFINER` function is exposed publicly.
11. Run `npx supabase db lint --local`, Supabase Security Advisor, platform typecheck/build, and `git diff --check`.
