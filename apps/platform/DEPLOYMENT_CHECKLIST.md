# Angel Tree Platform Deployment Checklist

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
