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
STRIPE_PUBLISHABLE_KEY=
STRIPE_CREDIT_SURCHARGE_BPS=300
STRIPE_SURCHARGE_ENABLED=false
STRIPE_UNSURCHARGED_CARD_ENABLED=false
BUSINESS_CHECK_MAILING_ADDRESS=
APP_BASE_URL=https://admin.angeltreeservices.org
COMMUNICATION_WORKER_SECRET=
NEXT_PUBLIC_GOOGLE_REVIEW_URL=
LEAD_INTAKE_ALLOWED_ORIGINS=https://angeltreeservices.org,https://www.angeltreeservices.org,https://angeltreeservice.org,https://www.angeltreeservice.org
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
- `STRIPE_PUBLISHABLE_KEY` is passed to Stripe.js for the Payment Element and is not a secret. Keep it on the admin project so the public static site remains independent.
- Apply `supabase/migrations/20260718200940_invoice_payment_options.sql` and `supabase/migrations/20260720074140_stripe_card_confirmation_flow.sql` before deploying the card review flow. Keep both card flags `false` until test-mode classification, disclosure, refund, webhook, processor-notice, and account-mode checks pass.
- `STRIPE_UNSURCHARGED_CARD_ENABLED=false` keeps card payment unavailable unless the owner explicitly enables the reviewed card flow. ACH and offline preferences do not depend on this setting.
- `BUSINESS_CHECK_MAILING_ADDRESS` is optional and server-only. When blank, the portal tells customers to call for the current mailing address.
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
LEAD_INTAKE_ALLOWED_ORIGINS=https://angeltreeservices.org,https://www.angeltreeservices.org,https://angeltreeservice.org,https://www.angeltreeservice.org
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
- `payment_intent.processing`
- `payment_intent.succeeded`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.closed`

Copy that endpoint's signing secret to `STRIPE_WEBHOOK_SECRET`, redeploy the platform, and complete the test-mode smoke test before using live-mode keys. ACH uses hosted Checkout. Cards use Stripe Payment Element and a two-step ConfirmationToken review, so `STRIPE_PUBLISHABLE_KEY` is also required.

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
# Contracting Party Migration

Migration: `20260717040930_contracting_party_integrity_and_review.sql`

This release makes organizations first-class contracting parties. It does not automatically resolve records with both or neither owner. Before deployment:

1. Back up the production database.
2. Run `supabase/verification/contracting_party_ownership_audit.sql` in the Supabase SQL Editor.
3. Review every ambiguous record. Do not infer that a linked person is the contracting customer merely because they are an organization contact.
4. Apply the reviewed migration. It preserves existing rows, enforces exact ownership on new/changed rows, and writes ambiguous history to `contracting_party_review_items`.
5. Deploy the compatible platform application immediately after the migration.
6. Open **Reports > Data quality** and resolve the manual-review queue.
7. After the queue is empty, validate the `*_exactly_one_*` constraints in a separately reviewed migration.
8. Run individual, organization, portal, email, Stripe test-mode, recurring-service, and crew-assignment smoke tests.
9. Run Supabase Security Advisor and confirm no new anon table access or public function execution.

Rollback consideration: application code deployed with this release expects `contracting_party_review_items`. Roll back the application before rolling back the migration. Do not restore legacy `NOT NULL customer_id` constraints while organization-owned records exist.

Manual smoke test:

- Complete the individual customer quote -> portal approval -> one work order -> invoice -> payment path.
- Create an organization with no linked customer, three role-specific contacts, and two properties.
- Create a quote for the second property; verify `customer_id` is null and the recipient, approver, onsite, and billing contacts remain distinct.
- Send and approve the quote through its token; verify exactly one organization-owned work order and no placeholder customer.
- Confirm crew sees the organization, property, onsite contact, and access instructions without organization billing data.
- Create and approve a change order, complete closeout, generate the invoice, and verify ownership and service location match the quote and job.
- Send the invoice to the billing/AP contact and complete one Stripe test-mode payment; verify one payment and one balance update.
- Duplicate the organization quote, work order, and invoice; verify ownership and active contacts copy while portal tokens, approvals, email history, and payments do not.
- Create an organization recurring plan without a customer, then generate and approve a renewal quote and verify one work order for the selected property.
- Schedule an organization job and verify notices resolve to the onsite/property contact, while invoice/payment messages resolve to billing/AP.
- Record a material delivery for the organization and verify its linked work order has the same contracting party.
- Confirm individual customer pages contain only individual-owned records and the organization page shows direct-owned work, payments, balance, communications, recurring work, and activity.
- Confirm Reports separates individual customers from organizations and does not count organization contacts as customers.
- Open a quote/invoice portal signed out and verify it exposes only the token's document.
- Verify crew cannot read organization billing data and anon cannot query organization or review tables.

## Public website lead intake

The root `index.html` and `landing-clean/landing-clean.html` load `ats-form-enhancements.js` and set the production intake URL to `https://admin.angeltreeservices.org/api/leads`. The API implementation is `apps/platform/src/app/api/leads/route.ts`; do not add a competing static-site endpoint.

Deploy in this order:

1. Back up production and review `supabase/migrations/20260717160000_public_website_lead_intake_metadata.sql`.
2. Apply the reviewed migration. Do not apply it automatically from the public-site deploy.
3. Configure `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `INTERNAL_LEAD_NOTIFICATION_EMAIL`, and the exact `LEAD_INTAKE_ALLOWED_ORIGINS` value above on the admin CRM.
4. Deploy the admin CRM/API and open `/admin/communications/lead-intake` while signed in to confirm endpoint, allowed origins, database connectivity, and notification destination.
5. Deploy the public static website files.
6. Submit one controlled request from the plural production domain and one from the singular domain.
7. Confirm each request appears once in `/admin/communications` with source Website, and confirm the office email arrives.
8. Remove or clearly label controlled test records.

A saved lead is the customer-facing success condition. If office email fails after the save, the API returns success and records `notification_status = failed` for staff review. If the database save fails, the API returns a failure and the browser retains the entered form values.

Rollback the public website endpoint configuration before rolling back the API. Roll back the application before removing columns it expects; the migration is additive and can safely remain while an application rollback is investigated.

## Production stabilization and schema alignment

Do not deploy the stabilization application before its required database objects exist. This checkout was not linked to a remote Supabase project during local verification, so `npx supabase migration list` could not compare production history. Link the intended project and review the local/remote columns before running any push.

Production symptoms indicate these migrations are absent or incomplete:

```text
supabase/migrations/20260717022829_recurring_services_followups_and_renewals.sql
  creates public.follow_up_tasks
supabase/migrations/20260717040930_contracting_party_integrity_and_review.sql
  creates public.contracting_party_review_items
supabase/migrations/20260717141937_document_library_stabilization.sql
  adds Documents v1, a private bucket, RLS, and the Storage-policy grant correction
```

The dual `customer_id` and `legacy_customer_id` relationships visible in production suggest `20260717032430_organization_contracting_parties.sql` is already present, but migration history is the authority. Do not infer applied history only from columns. No historical migration was edited in this stabilization pass.

Required chronological order, including prerequisites, is:

```text
20260717015652_change_orders_and_organization_parity.sql
20260717022829_recurring_services_followups_and_renewals.sql
20260717032430_organization_contracting_parties.sql
20260717040930_contracting_party_integrity_and_review.sql
20260717141937_document_library_stabilization.sql
```

Before deployment:

1. Confirm a recent Supabase backup or PITR restore point. For a manual backup, use a protected direct database connection and `pg_dump` from a trusted machine; never commit the dump or database password.
2. Link only the intended production project and run `npx supabase migration list`.
3. Investigate any remote migration recorded out of chronological order or any local migration missing remotely. Do not edit an already-applied migration.
4. Review the pending migrations above and deploy the compatible platform build immediately after the database changes.
5. Do not expose `app_private` through the Data API. Confirm the `platform-documents` bucket is private.

After migrations succeed, reload PostgREST only if the new objects are still absent from the schema cache:

```sql
notify pgrst, 'reload schema';
```

A reload does not create `follow_up_tasks`, `contracting_party_review_items`, or `documents`. Apply migrations first. Then verify those tables through an authenticated staff session, run Supabase Security Advisor, and complete the stabilization checklist in `PRODUCTION_TESTING.md`.

Rollback considerations:

- Roll back the application before rolling back a migration it expects.
- The Documents migration is additive; leaving its table and private bucket in place is safer than dropping uploaded metadata or files.
- Do not restore legacy customer requirements or remove organization ownership columns while organization-owned records exist.
- If a migration fails, stop and inspect the exact statement and production history. Do not mark it applied manually or continue with later migrations.

## Simplified job workflow

The simplified job command center depends on the reviewed migration below. Do not apply it automatically from a Netlify deploy:

```text
supabase/migrations/20260718210235_simplify_job_workflow.sql
```

Before deployment:

1. Back up production and compare local/remote migration history with `npx supabase migration list`.
2. Review and apply `20260718210235_simplify_job_workflow.sql` to the intended Supabase project.
3. Keep `COMMUNICATION_WORKER_SECRET` configured in Netlify. The scheduled `advance-scheduled-jobs` function uses the same secret to call the protected internal route every five minutes.
4. Leave `CREW_JOB_CLOSEOUT_ENABLED=false` and `CREW_JOB_PROGRESS_CHECKLIST_ENABLED=false` unless the optional crew closeout workflow is intentionally enabled and tested.
5. Deploy the compatible platform build after the migration succeeds.
6. Complete the simplified job workflow checks in `PRODUCTION_TESTING.md` with controlled records.

The worker only advances accepted or scheduled jobs whose latest active job/maintenance appointment has started. It does not move billed, cancelled, completed, or correction-review records backward. Draft invoice creation does not change the job's physical status and does not send the invoice.

Rollback the application before removing a database function it calls. The migration is additive and can remain safely in place while an application rollback is investigated.

## Jobs operations index

The compact `/admin/jobs` workspace depends on this additive, RLS-aware read-model migration:

```text
supabase/migrations/20260718214709_jobs_operations_index.sql
```

Review and apply it only after `20260718210235_simplify_job_workflow.sql`. The migration adds supporting partial indexes and the `public.job_operations_index` security-invoker view; it does not rewrite jobs, appointments, quotes, invoices, or change orders. Deploy the compatible platform build after the migration succeeds, refresh the PostgREST schema cache only if the view is not immediately visible, and complete the jobs operations index checks in `PRODUCTION_TESTING.md`.

Financial quote and invoice values in the view are masked through the existing financial-reporting role helper. Keep `app_private` out of exposed Data API schemas. Roll back the application before removing the view; leaving the additive indexes in place is safe during an application rollback.
