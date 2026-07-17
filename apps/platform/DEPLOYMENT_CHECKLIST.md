# Angel Tree Platform Deployment Checklist

Change-order deployment: review and apply `supabase/migrations/20260717015652_change_orders_and_organization_parity.sql` after the crew closeout, reporting, and materials migrations. It adds no environment variables and reuses `PORTAL_TOKEN_ENCRYPTION_KEY`. Follow [CHANGE_ORDER_AND_ORGANIZATION_WORKFLOW.md](./CHANGE_ORDER_AND_ORGANIZATION_WORKFLOW.md), refresh the PostgREST schema cache, and rerun Supabase Security Advisor before enabling customer approval links.

Reporting deployment: apply `supabase/migrations/20260717005036_business_reporting_profitability.sql` before deploying the reports application changes, then follow [REPORTING.md](./REPORTING.md). No new environment variables are required.

Use this checklist before the first private staging deployment of the platform app.

## 1. Environment Variables

Set these for the deployed `apps/platform` app:

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
LEAD_INTAKE_ALLOWED_ORIGINS=
```

Optional, server-only tooling value:

```env
SUPABASE_DB_URL=
```

Notes:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are the only Supabase values that belong in browser code.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. It is used for secure quote-token lookup and public lead intake writes. Never expose it in client components, browser bundles, or public logs.
- `PORTAL_TOKEN_ENCRYPTION_KEY`, `RESEND_API_KEY`, and the email settings are server-only. Do not prefix them with `NEXT_PUBLIC_`.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server-only. Use Stripe test keys first and never prefix either value with `NEXT_PUBLIC_`.
- `APP_BASE_URL` is the canonical platform origin used for Stripe Checkout return URLs. It must be the deployed admin origin, without a path.
- `COMMUNICATION_WORKER_SECRET` is server-only and authenticates the hourly Netlify function to the internal communication processor. Generate at least 32 random characters with `openssl rand -hex 32`.
- `SUPABASE_DB_URL` is not required for normal runtime page rendering. Keep it for migrations and server-side tooling only.

## 2. Supabase Auth Setup

Current login uses email/password and redirects with relative in-app paths like `/login?next=/admin`, so there is no app-side OAuth callback dependency in this phase.

Still verify:

- the deployed platform domain can set auth cookies normally
- your Supabase project has the correct site URL for future auth emails
- any future redirect URLs include the staging/private platform domain before enabling magic links, password recovery, or email confirmations
- Supabase Auth settings have **Prevent the use of leaked passwords** enabled (available on Pro plans and above)

## 3. Protected And Public Routes

Expected behavior:

- `/admin` and all `/admin/*` routes are protected
- `/crew` and all `/crew/*` routes are protected
- `/portal` is protected for signed-in portal users
- `/portal/quote/[token]` is intentionally public and token-scoped
- `/portal/invoice/[token]` is intentionally public and token-scoped

Do a quick smoke test after deploy:

1. Open `/admin` in a signed-out browser and confirm redirect to `/login`.
2. Open `/crew` signed out and confirm redirect to `/login`.
3. Open `/portal` signed out and confirm redirect to `/login`.
4. Open a valid `/portal/quote/[token]` link signed out and confirm the quote page still loads.
5. Open a valid `/portal/invoice/[token]` link signed out and confirm only that invoice loads.

## 4. Public Lead Intake Origins

If the public website submits directly to the deployed platform app across origins, set:

```env
LEAD_INTAKE_ALLOWED_ORIGINS=https://angeltreeservices.org,https://www.angeltreeservices.org
```

Add any staging public-site origin used for testing.

Important:

- The public lead endpoint is `POST /api/leads`.
- The endpoint accepts inserts only; it does not expose CRM reads.
- If the public website and platform share one domain via rewrites, origin handling is simpler.

## 5. Quote Portal Assumptions

Quote portal links currently:

- store only a token hash in the database
- require `SUPABASE_SERVICE_ROLE_KEY` on the server
- expose only the single quote tied to the token

Before deploy, verify:

1. An admin can generate a portal link from a quote detail page.
2. The copied URL uses the deployed host.
3. A revoked or expired token shows the unavailable state cleanly.

## 6. Invoice Portal Assumptions

Before deploy, apply `supabase/migrations/20260709132222_invoice_portal_tokens.sql`, `supabase/migrations/20260710150434_ensure_invoice_portal_tokens.sql`, and `supabase/migrations/20260716165828_add_recoverable_portal_links.sql`, then refresh/wait for the Supabase schema cache and verify:

1. An owner/admin can generate an invoice link without email configuration.
2. The copied URL uses the deployed host.
3. Signed-out customers can view and print only the linked invoice.
4. Replaced, revoked, expired, and invalid links show the unavailable state.
5. The browser never receives `SUPABASE_SERVICE_ROLE_KEY`.

## 7. Stripe Checkout Setup

Before enabling online payment, apply `supabase/migrations/20260716210754_stripe_invoice_payments.sql` after the existing portal-link migrations. Then, in the Stripe test-mode dashboard, create this webhook endpoint:

```text
https://admin.angeltreeservices.org/api/stripe/webhook
```

Subscribe it to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `payment_intent.payment_failed`

Copy that endpoint's signing secret to `STRIPE_WEBHOOK_SECRET`, redeploy the platform, and complete the test-mode smoke test before using live-mode keys. The portal uses hosted Stripe Checkout; no publishable key is needed.

## 8. Supabase Security Advisor Hardening

After all earlier migrations, apply:

```text
supabase/migrations/20260716212545_harden_security_definer_functions.sql
```

Then:

1. Run `supabase/verification/security_advisor_hardening.sql` in the SQL editor or with `psql`.
2. Confirm `app_private` is **not** in Supabase Data API exposed schemas.
3. Rerun Supabase Security Advisor and confirm the mutable-search-path and exposed `SECURITY DEFINER` warnings are gone.
4. In Supabase Auth settings, enable **Prevent the use of leaked passwords** manually.
5. Complete the security regression checklist in `SECURITY_HARDENING.md`.

The migration is not an application deployment step and must not be applied to production without an intentional database review.

## 9. Build And Start Commands

Before building, apply and review this migration without enabling automatic sends:

```text
supabase/migrations/20260716215149_automated_customer_communications.sql
```

The migration defaults the communication master switch to off. After deployment, open `/admin/communications`, verify a test recipient and active portal link, send one manual reminder, run **Process due reminders now**, then enable automatic sending. The scheduled function is `netlify/functions/process-communications.ts` and runs hourly. Turn the master switch off to stop automatic processing quickly without deleting queue history.

## Crew closeout migration

Before deploying the crew closeout routes, review and apply:

```text
supabase/migrations/20260716222258_crew_job_closeout_workflow.sql
```

Apply it after `20260716215149_automated_customer_communications.sql`. No new secret or storage bucket is required. After the schema cache refreshes, verify with separate crew and owner/admin test accounts:

1. Assigned crew can read and submit only their assigned work order closeout.
2. An unassigned crew account cannot read the job, closeout, checklist, scope results, or photos.
3. Customer/anonymous sessions cannot read any closeout table.
4. Crew cannot approve, reopen, mark ready to invoice, change pricing, or generate an invoice.
5. Office users can review at `/admin/jobs/closeouts` and `/admin/jobs/[jobId]/closeout`.
6. A returned closeout becomes editable by assigned crew and retains earlier submission snapshots.
7. Invoice generation accepts `ready_to_invoice`, reuses an existing invoice, and does not include internal or incident notes.

From `apps/platform`:

```powershell
npm install
npm run typecheck
npm run build
npm run start
```

For local LAN verification only:

```powershell
npm run dev:lan
npm run start:lan
```

## 10. Manual Staging Smoke Test

After deployment, manually verify:

1. Login succeeds for an internal staff account.
2. `/admin` loads.
3. `/crew` loads for a crew-capable account.
4. `/portal/quote/[token]` loads without requiring login.
5. `/portal/invoice/[token]` loads without requiring login.
6. Public lead intake succeeds from the live public-site origin.
7. Quote, invoice, customer, and job detail links navigate cleanly.
8. Time clock pages load for enabled users and deny disabled users with a helpful message.
9. Complete a test work order, generate its invoice once, and confirm a second attempt opens the existing invoice instead of creating another.
10. Edit a sent quote and a sent invoice, then open their existing customer links signed out to confirm each shows the latest saved document.
11. Open a sent test invoice through its customer link, pay it with Stripe test mode, then confirm one payment appears and the invoice becomes paid.
12. Replay the successful webhook event from Stripe and confirm no second payment record is created.
13. Record a manual check payment on a separate sent invoice and confirm its balance/status update without a Stripe record.
14. Complete the communication smoke test in `PRODUCTION_TESTING.md` before enabling the master switch.

## 11. Not In Scope Yet

These are still intentionally unfinished for first private deployment:

- SMS reminders and marketing automation
- payroll export integration
- external calendar sync
- durable distributed rate limiting for public lead intake
- subscriptions, financing, saved cards, and customer-entered partial payments
## Equipment and fleet migration

Apply `supabase/migrations/20260716232544_equipment_fleet_management.sql` before deploying the equipment routes. The migration creates private fleet, assignment, reading, inspection, repair, maintenance, document, and status-history tables; authenticated crew RPCs; RLS policies; and the private `equipment-files` Storage bucket.

From the repository root, use the existing linked Supabase project workflow:

```bash
supabase migration list
supabase db push
```

Do not add `app_private` to the Supabase Data API exposed schemas. After applying, refresh the PostgREST schema cache if the project does not pick up the new tables automatically.

## Employee onboarding and compliance migration

Review and apply these migrations in order:

```text
supabase/migrations/20260716232544_equipment_fleet_management.sql
supabase/migrations/20260716235514_employee_onboarding_training_compliance.sql
```

The second migration references equipment assignments for issued PPE/equipment self-service. It creates the private `employee-files` and `employee-program-files` buckets, role-aware document metadata/storage policies, narrow employee and supervisor RPCs, operational employee tables, repeat-safe profile backfill, and configurable qualification warning mappings. It adds no secrets or environment variables and does not enable automated email notifications.

From the repository root:

```bash
supabase migration list
supabase db push
```

After applying:

1. Refresh the PostgREST schema cache if needed.
2. Keep `app_private` out of exposed API schemas.
3. Review `/admin/employees` records marked for manual review and confirm email-to-auth matches.
4. Verify owner/admin, office staff, supervisor, employee, crew, and anonymous access separately.
5. Confirm `employee-files` is private and signed links respect employee-visible, supervisor-visible, admin-only, and owner-only classifications.
6. Run Supabase Security Advisor and the employee checklist in `PRODUCTION_TESTING.md`.

For a local Supabase environment:

```bash
supabase start
supabase db reset
supabase db lint --local
```

Do not treat the Next.js build as proof that migrations, RLS, Storage, or backfill behavior passed.

## Materials and inventory migration

Review and apply in this order:

```text
supabase/migrations/20260716232544_equipment_fleet_management.sql
supabase/migrations/20260716235514_employee_onboarding_training_compliance.sql
supabase/migrations/20260717005036_business_reporting_profitability.sql
supabase/migrations/20260717012234_materials_inventory_operations.sql
```

From the repository root:

```bash
npx supabase migration list
npx supabase db push
```

The materials migration adds no secrets. It creates private inventory tables, fixed-search-path trigger functions, least-privilege RLS, and the private `material-files` bucket. Keep `app_private` out of exposed API schemas. After deployment, refresh the PostgREST schema cache if necessary and run Supabase Security Advisor to confirm no privileged function is publicly callable.

First setup:

1. Open `/admin/materials?view=catalog` and create the main yard location.
2. Create raw chips, brown mulch, and dump-fee materials with their actual business units.
3. Enter internal costs only from an owner/admin/payroll-capable account.
4. Open `/admin/materials?view=movements` and receive opening stock. Do not invent historical stock.
5. Verify an assigned crew account can see job plans but cannot see costs, vendor pricing, or arbitrary adjustments.

Manual materials smoke test:

1. Receive 20 estimated cubic yards of raw chips at the main yard.
2. Transfer a load to a truck and confirm source/destination balances.
3. Add 12 cubic yards of mulch to a work order and reserve it.
4. Confirm on hand is unchanged while available is reduced.
5. Record 12 yards loaded, 11 used, and 1 returned from the crew job page.
6. Confirm the reservation is fulfilled and balances are correct.
7. Record a disposal load with fee and private receipt.
8. Confirm approved disposal/material cost appears once in job profitability.
9. Cancel a test work order and confirm active reservations are released with history.
10. Complete a batch from raw chips to dyed mulch; confirm input and estimated output movements.
11. Record a customer delivery with service location and private proof photo.
12. Double-click a field action and confirm its idempotency key prevents a duplicate.
13. Attempt a crew negative adjustment and confirm it is denied.
14. Record an owner/admin negative override with a reason and confirm it is visible in history.
15. Reverse a transaction and confirm the original row remains immutable.
16. Duplicate a quote and invoice; confirm no transactions or reservations copy.
17. Approve a quote with a linked material and confirm a work-order plan is created without stock use.
18. Confirm wood/chips instructions carry from the approved quote to the work order and crew view.
19. Confirm customer quote/invoice portals show customer line text but no stock, vendor, cost, receipt, or internal note data.
20. Confirm bulk visual/dimension measurements say estimated in inventory and reports.
21. Confirm low stock, missing disposal receipt, and due delivery alerts link to `/admin/materials`.
22. Confirm unplanned crew use requires an explanation.
23. Confirm crew-recorded job use creates a pending private cost review.
24. Approve that cost and confirm one immutable historical unit-cost snapshot and one job-cost entry.
25. Confirm purchase cost itself was not also counted against job profitability.
26. Confirm old job cost does not change after editing the current material cost.
27. Verify `/admin/reports?view=materials` for movement, disposal, stock, production, and restricted cost display.
28. Re-test work-order closeout, invoice, payment, email, fleet, employee, and time workflows.
29. Run `npx supabase db lint --local` against a local reset database.
30. Run Supabase Security Advisor and verify no new anonymous inventory access or public privileged functions.

Known limitation: visual and dimensional bulk stockpile measurements are operational estimates, not survey-grade quantities. The platform does not infer legal load limits, chemical ratios, or unit conversions.

## Recurring services migration

Apply the recurring workflow after its organization/change-order dependency:

```text
supabase/migrations/20260717015652_change_orders_and_organization_parity.sql
supabase/migrations/20260717022829_recurring_services_followups_and_renewals.sql
```

From the repository root:

```bash
npx supabase migration list
npx supabase db push
```

The migration adds no environment variables. Leave `automated_generation_enabled` off for initial deployment. Confirm `/admin/recurring` loads, manually generate one due test occurrence twice, and verify the second run creates no duplicate. Test individual and multi-property organization plans, distinct approval/onsite/billing contacts, independent property pause, renewal pricing review, exactly-one work-order conversion, invoice provenance, assigned-crew recommendation submission, anonymous denial, and the checklist in `RECURRING_SERVICES.md` before considering scheduled generation.

Refresh the PostgREST schema cache if necessary, keep `app_private` out of exposed API schemas, and run Supabase Security Advisor. Do not treat a successful Next.js build as database or RLS verification.
