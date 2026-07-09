# Angel Tree Platform App

This is the separate TypeScript/Next.js foundation for the future Angel Tree Services CRM, customer portal, and crew field app. The existing static public website remains outside this app.

## Setup

From the repo root:

```powershell
cd apps/platform
npm install
```

## Run Commands

From the repo root:

```powershell
cd apps/platform
```

Localhost development:

```powershell
npm run dev
```

LAN development, bound to all interfaces:

```powershell
npm run dev:lan
```

LAN production-style verification:

```powershell
npm run typecheck
npm run build
npm run start:lan
```

Open:

```text
http://localhost:3000
http://192.168.1.161:3000
```

Replace `192.168.1.161` with the current LAN IP of the machine running the app when needed.

Production mode is the better final check for LAN styling and asset loading because it uses the optimized build output instead of the live development pipeline.

For a staging/private deployment pass, use:

```text
DEPLOYMENT_CHECKLIST.md
```

Create a Supabase project at `https://supabase.com`, then copy `.env.example` from the repo root to:

```text
apps/platform/.env.local
```

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are the only values that browser code should use.

`SUPABASE_SERVICE_ROLE_KEY` is server-only, bypasses Row Level Security, and must never be imported into client components, exposed in browser JavaScript, committed with real values, or printed to public logs.

`LEAD_INTAKE_ALLOWED_ORIGINS` is an optional comma-separated list of additional public website origins allowed to submit the contact form. The endpoint already allows `https://angeltreeservices.org`, `https://www.angeltreeservices.org`, `http://localhost:8000`, and `http://127.0.0.1:8000`.

Transactional email uses Resend from server-only code. Add these environment variables in Netlify and local `.env.local` when email sending should be active:

```env
RESEND_API_KEY=
EMAIL_FROM="Angel Tree Services <info@angeltreeservice.org>"
EMAIL_REPLY_TO="info@angeltreeservice.org"
INTERNAL_LEAD_NOTIFICATION_EMAIL="info@angeltreeservice.org"
```

Do not commit real Resend API keys or SMTP credentials.

## Supabase Auth Redirect URLs

Employee password reset emails send users back to `/update-password`, where they choose their own new password. Add these URLs to the Supabase Auth redirect allow-list before testing password resets:

```text
https://admin.angeltreeservices.org/update-password
https://admin.angeltreeservices.org/**
http://localhost:3000/update-password
http://localhost:3000/**
```

Admins and owners can trigger the email from `/admin/access`, but the app never stores, displays, or manually emails passwords.

## Resend And Supabase SMTP

Recommended sender setup:

- Sender: `Angel Tree Services <info@angeltreeservice.org>` or the value in `EMAIL_FROM`
- Reply-to: `info@angeltreeservice.org` or the value in `EMAIL_REPLY_TO`
- Verify `angeltreeservice.org` or a dedicated mail subdomain in Resend.
- Add the SPF, DKIM, and DMARC DNS records Resend provides for the verified domain.
- In Supabase Auth, configure custom SMTP using Resend so Auth emails, including password reset, are not limited by Supabase built-in email quotas.
- Keep Supabase SMTP credentials and `RESEND_API_KEY` only in Supabase/Netlify environment settings.

The app's CRM transactional email helper uses Resend's Email API for employee access notices, lead notifications, and explicit quote/invoice sends. If `RESEND_API_KEY` is missing, admin pages show: `Email sending is not configured. Drafts are still available.`

## Database

Apply the schema migrations in order:

```text
supabase/migrations/0001_initial_platform_schema.sql
supabase/migrations/0002_add_job_priority.sql
supabase/migrations/0003_quote_portal_tokens.sql
supabase/migrations/0004_job_photo_storage.sql
supabase/migrations/0005_service_role_and_staff_grants.sql
supabase/migrations/0006_schedule_events_foundation.sql
supabase/migrations/0007_role_controlled_time_clock.sql
supabase/migrations/0008_payroll_review_foundation.sql
supabase/migrations/0009_align_internal_staff_role_helpers.sql
supabase/migrations/0010_time_clock_clock_out_policy_fix.sql
supabase/migrations/0011_employee_access_requests.sql
supabase/migrations/20260707000822_email_events_log.sql
supabase/migrations/20260708004341_quote_first_workflow.sql
```

For the first pass, you can paste the migration into the Supabase SQL editor. Later, use the Supabase CLI for repeatable local and remote migrations.

The migration creates the core platform tables and enables Row Level Security. It intentionally inserts no real customer, job, quote, invoice, or payment data.

The current CRM forms use normal authenticated Supabase requests. They do not use the service role key. For reads and writes to work, the signed-in user must have one of the staff roles allowed by the migration policies: `owner`, `admin`, or `estimator`.

If your Supabase Data API settings do not automatically expose SQL-created tables, grant access to the `authenticated` role while keeping RLS enabled. Do not disable RLS to fix access errors.

## CRM Data Layer

The first admin CRM surface now includes:

- `/admin/customers`: customer records, first notes, and service locations.
- `/admin/customers/[customerId]`: customer file with contact info, notes, service locations, jobs, quotes, invoices, and quick actions.
- `/admin/jobs`: approved, scheduled, active, and completed jobs/work orders, with legacy lead records still supported.
- `/admin/jobs/[jobId]`: job file with customer/location summary, scope, schedule, quote/invoice links, photos, crew work order link, and validated status transitions.
- `/admin/quotes`: quote-first proposal center for customer/location draft quotes and multi-line proposal line items.
- `/admin/quotes/[quoteId]`: quote file with line items, document preview, send-quote action, approval/change/decline workflow actions, and create-invoice-from-quote after approval.
- `/admin/invoices`: invoice records and one starter line item, without payment collection.
- `/admin/invoices/[invoiceId]`: invoice file with line items, balance due, due date, payment placeholder, document preview, and safe invoice status actions.
- `/admin/schedule`: estimate, job, and follow-up appointment records.
- `/admin/documents`: quote, invoice, email, and work-order preview scaffolds.
- `/admin/marketing`: protected review-request queue, completed-job post drafts, private gallery candidates, and service-area content ideas.
- `/admin/organizations`: property-manager, HOA, and commercial account records.
- `/admin/organizations/[organizationId]`: organization file with contacts, properties, linked customers, jobs, quotes, invoices, and an internal work-request scaffold.
- `/admin`: workflow summaries for new leads, estimates to schedule, quotes awaiting response, today's jobs, follow-ups due, and unpaid invoices.
- `/crew`: field dashboard for today's jobs, upcoming work, photo needs, and completion queue.
- `/crew/jobs`: large crew job cards with directions, call, message, photos, and complete actions.
- `/crew/jobs/[jobId]`: focused job detail with location, scope, crew notes, private photo uploads, signed thumbnail previews, checklist, and status updates.

Manual TypeScript table types live in `src/lib/types/database.ts`. Replace them later with generated Supabase types once the project has a stable Supabase CLI workflow.

Document templates currently live as local constants and helper functions in `src/lib/documents/templates.ts`. There is no `document_templates` database table yet.

## Job Photos And Storage

Create a private Supabase Storage bucket named:

```text
job-photos
```

Recommended path shape:

```text
job-photos/{job_id}/before/{timestamp}-{filename}
job-photos/{job_id}/after/{timestamp}-{filename}
job-photos/{job_id}/issue/{timestamp}-{filename}
job-photos/{job_id}/completion/{timestamp}-{filename}
```

Apply `supabase/migrations/0004_job_photo_storage.sql`, then configure the bucket in the Supabase dashboard:

- Keep the bucket private.
- Set the maximum file size to `6 MB`.
- Allow `image/jpeg`, `image/png`, `image/webp`, `image/heic`, and `image/heif`.

The migration adds the dedicated `completion` photo type and Storage policies for short-lived signed previews. `owner`, `admin`, and `estimator` roles can access job photos broadly. Crew users can access only photos whose first path segment belongs to their assigned job. Anonymous users receive no Storage access.

Crew checklist state is local UI only right now. Persist it later with a table such as `job_checklist_items` after checklist ownership and audit requirements are clear.

Crew app-layer access now mirrors the intended policy shape: `owner`, `admin`, and `estimator` can view crew jobs broadly, while regular crew access is scoped to `jobs.assigned_crew_user_id`. Production RLS should enforce the same rule in the database.

Photo uploads validate UUID job IDs, allowed categories, image MIME type, caption length, and file size server-side before hitting Storage. If file upload succeeds but metadata insert fails, the app attempts to remove the uploaded object so private storage does not accumulate unattached files. Photo display uses authenticated server-side signed URLs with a 15-minute lifetime.

There is no delete button yet. The migration permits assigned uploaders to remove their own object and staff to remove accessible objects so failed metadata writes can clean up safely. Add a deliberate staff delete action with an audit-log entry before exposing deletion in the UI.

## Connected CRM Workflow

The internal workflow now connects:

```text
Customer -> Service Location -> Quote -> Approval -> Job / Work Order -> Invoice
```

Implemented actions:

- Job status transitions: `new_lead -> estimate_scheduled`, `estimate_scheduled -> quoted`, `accepted -> scheduled`, `scheduled -> in_progress`, `in_progress -> completed`.
- Quote creation: saves a `draft` quote from a customer, service location, optional estimate event, optional existing job/work order, and multiple proposal line items.
- Quote line editor: supports add, remove, duplicate, reorder, multi-line scope descriptions, an Indent line helper, and visible subtotal/total calculation.
- Send quote: generates a fresh secure portal link, sends the quote email, then automatically marks the quote `sent` and records `sent_at`.
- Quote workflow actions: approve and create/link a work order, mark change requested, or mark declined.
- Create invoice from quote: requires an approved quote, ensures the work order exists, copies quote line items into invoice line items, and links invoice to quote, job, and customer.
- Invoice status actions: mark sent, mark void.

Scaffolded only:

- Record manual payment later.
- Production PDF generation.
- Production email sending.
- Stripe/payment collection.

## Printable Documents And Email Drafts

Protected detail pages now render reusable printable business documents:

- `/admin/quotes/[quoteId]`: professional quote preview with customer, service location, scope, line items, totals, expiration date, notes, approval placeholder, print button, quote email draft, and quote follow-up draft.
- `/admin/invoices/[invoiceId]`: professional invoice preview with customer, location, line items, total, balance due, due date, payment-status placeholder, print button, and invoice email draft.
- `/admin/jobs/[jobId]`: printable crew work order with contact, address, scope, access notes, crew notes, equipment placeholder, completion checklist, print button, crew message draft, and completed-job review draft.

Reusable document components live in:

```text
src/components/documents/document-shell.tsx
src/components/documents/quote-document.tsx
src/components/documents/invoice-document.tsx
src/components/documents/work-order-document.tsx
src/components/documents/print-button.tsx
```

Email draft generation lives in `src/lib/documents/email-drafts.ts`. The reusable clipboard UI is `src/components/email-draft-card.tsx`. Quote and invoice line item descriptions preserve line breaks and simple indentation in previews, portal pages, and email draft copy.

The print buttons call `window.print()`. Browser print-to-PDF is available for office use, but the app does not generate or store production PDF files yet. Email draft cards copy text to the clipboard; quote and invoice detail pages also include explicit Resend-powered send buttons when email is configured.

## Secure Customer Quote Portal Links

Apply `supabase/migrations/0003_quote_portal_tokens.sql` before testing customer quote links. The migration creates `public.quote_portal_tokens`, enables RLS, grants access only to authenticated users, and adds a staff-only management policy. It deliberately grants nothing to `anon`.

From `/admin/quotes/[quoteId]`, use **Send quote email** to generate a fresh 30-day secure quote link and send it to the customer, or use **Generate secure quote link** when the office needs to copy a link manually. Copy manual URLs immediately: the app stores only a SHA-256 hash and a short hint, never the raw token. Existing links can be revoked from the same quote page.

The customer opens:

```text
http://localhost:3000/portal/quote/{token}
```

The public route performs a narrow server-side lookup and exposes only the linked quote, customer summary, service location, and line items. It does not provide direct anonymous access to CRM tables or the token table. Customers can approve the quote or request changes without creating an account. Approval marks the quote `approved` and creates or links one job/work order. Duplicate approvals do not create duplicate jobs. Change requests are stored as internal customer/location/job notes where available.

`SUPABASE_SERVICE_ROLE_KEY` is required on the server for this public token lookup. It must never be exposed to client components, browser code, public logs, or static files. Before production, add request rate limiting and decide whether the canonical public platform URL should come from deployment configuration rather than request headers.

## Public Website Lead Intake

The existing static public contact form keeps its visual design, labels, validation, honeypot, and submit-state behavior. Its enhancement script now posts valid requests to:

```text
POST /api/leads
```

The endpoint validates a fixed allowlist of public fields and uses the server-only service role client to create:

```text
Website lead_source -> customer -> service_location -> new_lead job -> internal note
```

It does not grant anonymous Data API access to CRM tables and never returns CRM record IDs to the browser.

For production, serve the public website and platform API behind the same domain or configure a hosting rewrite from `/api/leads` to the platform app. If the website is intentionally hosted on a separate origin, set `window.ATS_LEAD_INTAKE_URL` before `ats-form-enhancements.js` loads and add that website origin to `LEAD_INTAKE_ALLOWED_ORIGINS`.

For local testing, run the static site on port `8000` and the platform app on port `3000`. The public enhancement script automatically posts local static submissions to `http://localhost:3000/api/leads`.

The endpoint includes a best-effort in-memory limit of five submissions per IP per ten minutes. Replace this with a durable distributed limiter before production traffic. Office email notification delivery is best-effort through Resend after CRM lead creation; notification failure is logged but does not fail a saved public lead.

## Scheduling And Follow-Ups

The protected CRM schedule now supports estimate, job, follow-up, and maintenance appointments without a calendar dependency.

Use:

```text
/admin/schedule
/admin/jobs/{jobId}
/admin/quotes/{quoteId}
```

The schedule page provides:

- Day and week list views.
- Appointment-type and status filters.
- Appointment creation with job, location, start, end, assignee, and office notes.
- Inline appointment time, assignee, notes, and status editing.
- Directions links when a service location has an address.
- Follow-ups due today or overdue on the admin dashboard.

Job files can add estimate visits, job visits, and follow-up reminders. Quote files can add a quote follow-up reminder after a work order exists. Scheduling an estimate advances `new_lead -> estimate_scheduled`; scheduling field work advances `accepted -> scheduled`. Other job status changes remain explicit and validated.

Copyable local draft helpers are available for estimate scheduling, job scheduling, quote follow-up, and post-job follow-up messages. They do not send SMS; quote and invoice emails can be sent only from their explicit admin detail-page actions.

To test in a development Supabase project:

1. Open a test job under `/admin/jobs/{jobId}`.
2. Schedule an estimate and confirm a `new_lead` job advances to `estimate_scheduled`.
3. Add a follow-up with a time earlier today and confirm it appears under **Follow-ups due** on `/admin`.
4. Open `/admin/schedule`, switch between day and week, then filter by `follow_up`.
5. Edit the appointment status, time, assignee, or notes from the schedule card.

External calendar sync, automated reminders, and production SMS/email delivery are intentionally not implemented yet.

## Completed Job Review And Marketing Workflow

Add the public Google Business review destination to `apps/platform/.env.local`:

```text
NEXT_PUBLIC_GOOGLE_REVIEW_URL=
```

This URL is safe to expose because it is a public review destination. The platform only inserts it into copy-only drafts. It does not send messages, submit reviews, scrape review content, or publish posts.

Completed job files now show a marketing workspace when `jobs.status = 'completed'`. The workspace provides:

- Review-request email draft.
- Review-request text-message draft.
- Before/after photo selection scaffold.
- Customer-permission checkbox.
- Future public-gallery eligibility toggle.
- Unsaved customer follow-up note scaffold.
- Unsaved public completion-notes field.
- Google Business, Facebook, and website-gallery caption drafts.

The protected `/admin/marketing` route includes completed, invoiced, and paid jobs so marketing review remains available after billing advances. Public-facing copy uses city-level location context only and redacts emails, phone numbers, and street-address-like text. Photos remain private signed previews and are internal by default.

Permission, photo-selection, follow-up-note, and gallery-eligibility controls intentionally remain local UI state. Add persistence and audit logging before treating them as durable approval records or publishing anything.

## Property Manager And HOA Foundation

The protected CRM now supports organization records using the existing `organizations` and `organization_contacts` tables:

- Add property-manager, HOA, commercial, and other organization records.
- Add billing contacts and job-update recipients.
- Add properties linked to an existing organization customer.
- Review linked customers, properties, jobs, quotes, and invoices.
- View an internal work-request form scaffold for future portal submissions.

The public route `/portal/organization/{token}` is intentionally inert. It displays a setup message and exposes no organization records. Before activating it, add a dedicated organization-portal token migration that follows the quote-link pattern:

- Generate a long random token server-side.
- Store only a SHA-256 hash and short token hint.
- Add expiry and revocation timestamps.
- Scope every server-side lookup to exactly one organization.
- Keep anonymous users away from direct organization, customer, property, job, quote, invoice, and photo table access.

Current limitation: linked customers must already have `customers.organization_id` set. Add organization-aware customer editing before using this workflow broadly.

## Native Crew App API Boundary

The future native crew app has a versioned contract in:

```text
docs/CREW_APP_API.md
```

Implemented bearer-authenticated routes:

```text
GET  /api/crew/jobs
GET  /api/crew/jobs/{jobId}
GET  /api/crew/jobs/{jobId}/photos
POST /api/crew/jobs/{jobId}/photos
```

These routes validate a Supabase access token server-side, load centralized role assignments, use the caller's token for RLS-protected queries, and return a deliberately small crew DTO. They do not use the service-role client.

Status updates, persisted checklists, and offline field-note sync are documented contracts only. Add narrow assigned-crew policies and durable schema support before activating those mutations.

## Run Locally

```powershell
npm run dev
```

Open:

```text
http://localhost:3000/
http://localhost:3000/login
http://localhost:3000/admin
http://localhost:3000/admin/customers
http://localhost:3000/admin/jobs
http://localhost:3000/admin/quotes
http://localhost:3000/admin/invoices
http://localhost:3000/admin/schedule
http://localhost:3000/admin/documents
http://localhost:3000/crew
http://localhost:3000/crew/jobs
http://localhost:3000/crew/jobs/{jobId}
http://localhost:3000/portal
http://localhost:3000/portal/quote/{token}
http://localhost:3000/api/leads
```

## Test Login

1. Configure `apps/platform/.env.local`.
2. In Supabase Auth, create a test user with email/password.
3. Start the app with `npm run dev`.
4. Visit `/admin`, `/crew`, or `/portal`.
5. Confirm the route redirects to `/login`.
6. Sign in with the Supabase test user.
7. Confirm the app opens the requested protected route.
8. Use the top navigation Sign out button.

If env vars are missing, protected pages render a setup message instead of throwing a runtime error.

Protected-route behavior is implemented with Next.js Proxy in `src/proxy.ts`, which uses the Supabase session helper in `src/lib/supabase/middleware.ts`.

## Roles

Role-aware helpers are prepared in `src/lib/auth/roles.ts`.

Intended role names:

- `owner`
- `admin`
- `estimator`
- `crew`
- `customer`
- `property_manager`

For now, logged-in access is enough. Full role enforcement should come after initial roles are created and assigned in Supabase.

## Current Limitations

- No payment handling.
- Email delivery requires Resend/Supabase SMTP configuration.
- No external calendar sync or automated reminder delivery.
- No PDF generation.
- No public invoice links.
- No persisted completion checklist yet.
- No job-photo delete UI or deletion activity-log entry yet.
- No persisted marketing permission, photo selection, gallery eligibility, or follow-up note state yet.
- No real review-request delivery, social posting, review scraping, or public gallery publishing.
- No active organization portal tokens, public organization records, or portal work-request writes.
- No organization-aware customer-link editing UI yet.
- No production rate limiting for public quote-link actions yet.
- Website lead intake uses a best-effort in-memory rate limiter; production still needs a durable distributed limiter.
- No generated Supabase TypeScript types yet.
- No native app code yet. The crew API boundary is prepared for a later iOS or React Native client.
- No native status-update, persisted-checklist, or offline-note mutation endpoints yet.
- No public website migration yet.

## Next Step

Add production rate limiting and canonical deployment URL configuration for customer quote-link actions, then prepare secure invoice portal links and real email delivery.
