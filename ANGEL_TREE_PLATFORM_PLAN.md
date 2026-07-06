# Angel Tree Services Platform Plan

## Current Codebase Audit

Angel Tree Services is currently a static marketing website exported from Squarespace. The public site is served from `index.html`, with exported Squarespace assets in `angeltreeservices_backup_files/` and a duplicate-looking `assets/` folder. The custom public-site layer is `overrides.css` plus `ats-form-enhancements.js`.

There is no package manager file, TypeScript config, framework router, build step, server runtime, API layer, database client, or authentication system in this repository yet. The deployment assumption appears to be static hosting, with `.netlify` ignored in `.gitignore`, so Netlify may be used locally or in production, but there is no checked-in `netlify.toml`.

## Framework And Structure

- Framework: none currently; static HTML/CSS/JavaScript.
- Routing style: file-based static routes, where `index.html` serves `/` and folders can provide routes such as `/admin/` through `admin/index.html`.
- Styling system: exported Squarespace CSS, custom `overrides.css`, and inline styles inside `index.html`.
- Components/pages: no reusable component system yet. The homepage is a single generated HTML document. `landing-clean/` and `localbuild/` appear to be alternate static builds or experiments.
- Backend: none currently.
- Auth: none currently.

## Product Direction

Build toward one synchronized platform with a shared backend and multiple interfaces:

1. Public marketing website and service pages.
2. Internal admin CRM.
3. Quote and invoice system.
4. Customer portal.
5. Crew-friendly mobile web app now, native iOS later.
6. Property manager and HOA portal later.

The platform app should feel simple, premium, modern, and operational: clean white backgrounds, very subtle green-tinted secondary surfaces, deep forest green primary actions, sparse fresh green or refined yellow-green accents, charcoal text, soft cool gray-green borders, rounded cards, readable type, and uncluttered workflows. The static public marketing site can keep its existing visual direction until a deliberate public-site migration begins.

## Product Vision

Angel Tree Services should have one organized operating system for the whole business. A homeowner or property manager can request work from the public website, the office can manage the lead inside the CRM, the estimator can create a quote, the customer can approve it securely, the crew can see what needs to happen in the field, and billing can move from invoice to payment without duplicate entry.

The first principle is synchronization: customers, properties, jobs, quotes, invoices, payments, notes, photos, and activity should eventually live in one shared backend instead of separate spreadsheets, inboxes, texts, and paper notes.

## Recommended Technical Path

### Phase 0: Static Foundation

- Keep the current public site stable.
- Add isolated route folders for future apps, beginning with `/admin/`.
- Document the intended data model and workflows before adding backend code.
- Add no public navigation links to internal routes until authentication exists.
- Use a clean white and green design-token layer for new platform routes. Public Squarespace-export styling can migrate gradually to avoid visual regressions.

### Phase 1: App Architecture Foundation

Recommended next step is to introduce a modern TypeScript app framework in a contained way, either:

- Next.js App Router for public site plus internal apps, or
- A separate TypeScript app under an `apps/` folder while preserving the static public site during migration.

Given the current static export, the safest path is a parallel migration: keep `index.html` live, build the CRM/customer/crew interfaces separately, then migrate public pages gradually.

Phase 1 should not require a real database yet unless the stack is changed intentionally. It should establish protected route structure, shared design tokens, placeholder page states, and clear contracts for the future backend.

### Phase 2: Auth And Database

Use Supabase/Postgres unless another backend is chosen after requirements are clearer.

- Supabase Auth for staff/customer identity.
- Postgres row-level security for customer portal isolation.
- Storage buckets for job photos and uploaded customer photos.
- Server-side API routes or edge functions for sensitive quote/invoice/payment actions.

Do not store sensitive CRM data in static files or browser-only JavaScript.

Until the admin surface is protected by real authentication, `/admin/` must remain a placeholder with no live customer, quote, invoice, payment, schedule, or crew data.

### Phase 3: CRM Core

- Staff login.
- Dashboard with leads, scheduled estimates, open quotes, active jobs, unpaid invoices, and follow-up reminders.
- Customer list and customer detail.
- Property/service location records.
- Job pipeline using the recommended statuses.
- Notes and activity timeline.
- Lead source tracking.

## Admin CRM Features

- Customer list and customer detail pages.
- Property and service location records.
- Job pipeline grouped by status.
- Placeholder dashboard lanes for new leads, estimates to schedule, quotes awaiting response, today's jobs, follow-ups due, and unpaid invoices.
- Notes and activity timeline.
- Lead source tracking.
- Scheduling and calendar view.
- Revenue, close-rate, and aging dashboards later.

### Phase 4: Quotes And Invoices

- Quote builder with reusable line items.
- Quote approval workflow.
- Invoice builder copied from accepted quote line items.
- PDF generation.
- Email quote/invoice sending.
- Payment records, then online payments.

## Quote / Invoice Features

- Quote builder with line items, quantities, unit prices, totals, customer-facing notes, and expiration dates.
- Invoice builder that can be created from an accepted quote.
- Invoice line items, balances, payment status, due dates, and sent dates.
- PDF generation later.
- Email quote and invoice delivery later.
- Payment provider integration later, likely through Stripe or a comparable provider.

### Phase 5: Crew Mobile Web

- Today's jobs.
- Job detail with address, directions, call/text actions, scope of work, crew notes, before/after photos, completion checklist, and mark-complete action.
- Large tap targets and readable field-service layout.

## Crew / Mobile App Features

- Today's jobs.
- Job detail with address and directions button.
- Customer call/text actions where permissions allow.
- Scope of work and crew notes.
- Before/after photo upload.
- Completion checklist.
- Mark job complete.
- Offline-tolerant behavior later for weak service areas.

### Phase 6: Customer Portal

- Secure quote links.
- View quote, approve quote, or request changes.
- View invoice and pay invoice.
- Upload photos.
- Review link after completion.

## Customer Portal Features

- Secure quote link without exposing other customer records.
- View quote and quote line items.
- Approve quote.
- Request quote changes.
- View invoice.
- Pay invoice later.
- Upload photos for estimates or follow-up.
- Leave review link after completion.

## Future Native iOS App Plan

The crew experience should begin as a mobile-friendly web app so workflows can be tested quickly with the real team. After the core data model, auth, scheduling, job detail, photo upload, and completion checklist are proven, a native iOS app can be built on top of the same backend.

The native app should focus on field reliability: today's jobs, directions, calls/texts, scope, notes, photo capture, checklist completion, and sync status. It should not become a separate system with separate business logic.

### Phase 7: Property Manager / HOA Portal

- Organization accounts.
- Multiple properties/service locations.
- Organization contacts.
- Job and invoice history by property.
- Bulk requests and recurring service visibility.

## Security Notes

- Do not store real CRM data in static HTML, static JSON, public JavaScript, or client-only state.
- Protect staff/admin routes before adding real records.
- Use role-based permissions for owners, office staff, estimators, crew, customers, and organization contacts.
- Use row-level security or equivalent server-side authorization so customers can only access their own quotes, invoices, payments, and photos.
- Store uploaded photos in private buckets until access rules are defined.
- Log meaningful activity in `activity_log` for quote approvals, invoice sends, payment status changes, note creation, and job status changes.

## Suggested Database / Backend Direction

Supabase/Postgres is the recommended starting direction because it provides Postgres, auth, storage, row-level security, and a practical path from web app to future mobile app. A future Next.js TypeScript app can use server-side routes/actions for sensitive workflows and Supabase client/server libraries for authenticated data access.

Keep the backend swappable until Phase 1 architecture is chosen, but model the data relationally from the start.

## Core Data Model

Primary relationship:

`Customer -> Property/Service Location -> Job -> Quote -> Invoice -> Payment`

### users

Staff, customers, crew members, and future organization contacts. Should map to the authentication provider user ID.

Suggested fields:

- id
- auth_provider_id
- full_name
- email
- phone
- user_type
- status
- created_at
- updated_at

### roles / permissions

Controls staff/admin/crew/customer capabilities.

Suggested entities:

- roles
- permissions
- user_roles
- role_permissions

### customers

Residential or commercial customer records.

Suggested fields:

- id
- display_name
- customer_type
- primary_contact_name
- email
- phone
- billing_address
- organization_id nullable
- lead_source_id nullable
- created_at
- updated_at

### properties / service_locations

Physical locations where work is performed.

Suggested fields:

- id
- customer_id
- organization_id nullable
- label
- street
- city
- state
- postal_code
- access_notes
- gate_code
- service_notes
- latitude
- longitude
- created_at
- updated_at

### jobs

Work requests and scheduled work.

Suggested fields:

- id
- customer_id
- property_id
- assigned_crew_user_id nullable
- status
- service_type
- requested_scope
- internal_notes
- scheduled_start_at
- scheduled_end_at
- completed_at
- lost_reason
- created_at
- updated_at

Recommended statuses:

- new_lead
- estimate_scheduled
- quoted
- accepted
- scheduled
- in_progress
- completed
- invoiced
- paid
- lost
- cancelled

### job_photos

Photos uploaded by staff, crew, or customers.

Suggested fields:

- id
- job_id
- uploaded_by_user_id
- photo_type
- storage_path
- caption
- created_at

### notes

Internal and customer-visible notes.

Suggested fields:

- id
- subject_type
- subject_id
- author_user_id
- visibility
- body
- created_at

### quotes

Estimate documents tied to jobs.

Suggested fields:

- id
- job_id
- customer_id
- status
- quote_number
- subtotal_cents
- tax_cents
- total_cents
- approved_at
- expires_at
- customer_message
- created_at
- updated_at

### quote_line_items

Suggested fields:

- id
- quote_id
- name
- description
- quantity
- unit_price_cents
- total_cents
- sort_order

### invoices

Suggested fields:

- id
- job_id
- quote_id nullable
- customer_id
- status
- invoice_number
- subtotal_cents
- tax_cents
- total_cents
- balance_due_cents
- due_at
- sent_at
- paid_at
- created_at
- updated_at

### invoice_line_items

Suggested fields:

- id
- invoice_id
- name
- description
- quantity
- unit_price_cents
- total_cents
- sort_order

### payments

Suggested fields:

- id
- invoice_id
- customer_id
- amount_cents
- payment_method
- provider
- provider_payment_id
- status
- paid_at
- created_at

### schedules / appointments

Suggested fields:

- id
- job_id
- appointment_type
- starts_at
- ends_at
- assigned_user_id
- status
- calendar_notes
- created_at
- updated_at

### lead_sources

Suggested fields:

- id
- name
- source_type
- is_active

### organizations

Property managers, HOAs, and commercial accounts.

Suggested fields:

- id
- name
- organization_type
- billing_email
- billing_phone
- billing_address
- created_at
- updated_at

### organization_contacts

Suggested fields:

- id
- organization_id
- user_id nullable
- full_name
- email
- phone
- role_title
- receives_invoices
- receives_job_updates
- created_at
- updated_at

### activity_log

Append-only audit trail for meaningful events.

Suggested fields:

- id
- actor_user_id nullable
- subject_type
- subject_id
- event_type
- metadata_json
- created_at

## First Safe Implementation Step

This repository now has an isolated `/admin/` route folder with a placeholder dashboard. It is intentionally static and contains no sensitive data. Before real CRM records are added, this route must be protected by real authentication at the hosting/app layer.

## Phase 2 Platform Scaffold

Phase 2 adds a separate TypeScript app beside the static public website:

- `apps/platform/` is the future protected platform app.
- The existing public homepage remains at `index.html`.
- The existing static placeholder remains at `admin/index.html`.
- Supabase helper files live under `apps/platform/src/lib/supabase/`.
- The first database migration lives at `supabase/migrations/0001_initial_platform_schema.sql`.

### Install The Platform App

From the repo root:

```powershell
cd apps/platform
npm install
```

Next.js currently requires Node.js 20.9 or newer.

### Run The Platform App Locally

From `apps/platform`:

```powershell
npm run dev
```

Then open:

- `http://localhost:3000/`
- `http://localhost:3000/admin`
- `http://localhost:3000/portal`
- `http://localhost:3000/crew`
- `http://localhost:3000/login`

If port `3000` is already in use, run:

```powershell
npm run dev -- -p 3001
```

### Test The Existing Static Website

From the repo root:

```powershell
python -m http.server 8000
```

Then open:

- `http://localhost:8000/`
- `http://localhost:8000/admin/`

This confirms the existing static public site and the static admin placeholder still work independently of the new platform app.

### Configure Supabase Environment Variables

Copy `.env.example` to `apps/platform/.env.local` for local development, then fill in:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` can be used by browser code. `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` must stay server-only. The service role key bypasses Row Level Security and must never be exposed in client components, static files, public logs, or browser JavaScript.

### What Is Intentionally Not Implemented Yet

- Real authentication UI and login actions.
- Protected route middleware.
- Real CRM records.
- Customer portal access rules.
- Crew assigned-job access rules.
- Supabase Storage buckets for job photos.
- Quote approval workflows.
- Invoice/payment handling.
- Email delivery.
- Public website migration into Next.js.

### Next Planned Step

The next step after the Phase 2 scaffold is a narrow auth foundation:

1. Create a Supabase project.
2. Apply `supabase/migrations/0001_initial_platform_schema.sql`.
3. Create initial `owner`, `admin`, `estimator`, `crew`, `customer`, and `property_manager` roles through the Supabase SQL editor or service-role tooling.
4. Add protected route middleware for `apps/platform/src/app/admin`, `portal`, and `crew`.
5. Implement a minimal login flow with Supabase Auth.
6. Keep all CRM tables empty until role assignment and route protection are verified.

## Supabase Auth Wiring

The platform app now has a minimal Supabase Auth foundation:

- `/login` is public and uses real Supabase email/password sign-in when env vars are configured.
- `/admin`, `/crew`, and `/portal` require a logged-in user through Next.js Proxy and the Supabase session middleware helper.
- Missing Supabase env vars render a setup message instead of a confusing runtime crash.
- A shared authenticated app frame provides navigation for Admin, Crew, Portal, and Sign out.
- Role-awareness is prepared in `apps/platform/src/lib/auth/roles.ts`.

Current intended role names:

- `owner`
- `admin`
- `estimator`
- `crew`
- `customer`
- `property_manager`

For now, logged-in access is sufficient. Full role enforcement should be added only after roles are created and assigned in Supabase.

## First CRM Data Layer

The platform now has the first internal CRM pages under the protected Next.js app:

- `/admin/customers`
- `/admin/jobs`
- `/admin/quotes`
- `/admin/invoices`
- `/admin/schedule`
- `/admin/documents`
- `/crew`
- `/crew/jobs`
- `/crew/jobs/[jobId]`

These pages use server-side Supabase helpers and normal authenticated requests. They do not use the service role key and do not add fake customer data.

Current data helpers live under `apps/platform/src/lib/data/`:

- `customers.ts`
- `jobs.ts`
- `quotes.ts`
- `invoices.ts`
- `payments.ts`
- `appointments.ts`
- `crew-jobs.ts`
- `job-photos.ts`

Manual table types live in `apps/platform/src/lib/types/database.ts`. Replace those with generated Supabase types after the Supabase CLI workflow is stable.

Apply migrations in order before testing real reads and writes:

```text
supabase/migrations/0001_initial_platform_schema.sql
supabase/migrations/0002_add_job_priority.sql
```

The initial RLS policies require a signed-in user with one of the staff roles: `owner`, `admin`, or `estimator`. If forms return RLS or permission errors, create roles and assign the current user in Supabase instead of disabling RLS or exposing the service role key.

If the Supabase Data API is configured to avoid automatically exposing new tables, explicitly grant the needed table privileges to `authenticated` while keeping RLS enabled.

What is still intentionally not implemented:

- Invoice detail/edit routes.
- PDF generation, production email delivery, or payment processing.
- Public customer quote links.
- Customer-specific portal policies.
- Crew assigned-job policies.
- Photo upload storage buckets.
- Detail pages and edit flows.

## Invoice And Document Workflow Foundation

The invoice foundation uses the existing `invoices`, `invoice_line_items`, and `payments` tables from `0001_initial_platform_schema.sql`. The app now reads invoices and payments through RLS-aware server helpers and provides an invoice create scaffold at `/admin/invoices`.

Invoice notes are currently stored as internal `notes` records connected to the job/customer because the `invoices` table does not yet include a dedicated notes column. Avoid adding another column until invoice detail/edit workflows are clearer.

The document workflow hub at `/admin/documents` is a protected preview surface only. It includes:

- Quote preview.
- Invoice preview.
- Crew work order preview.
- Quote email draft.
- Invoice email draft.
- Follow-up email draft.
- Completed job review request draft.

Document templates are local constants and helper functions in `apps/platform/src/lib/documents/templates.ts`. Do not add a `document_templates` table until templates need versioning, staff editing, or audit history.

Still not implemented in this phase:

- Actual PDF generation.
- Production email sending.
- Stripe or other payment provider integration.
- Public document URLs.
- Secure quote approval links.
- Customer portal token handling.

## Job Photos And Crew Field Workflow

The crew field workflow is now scaffolded as protected routes:

- `/crew`: field dashboard for today's jobs, upcoming jobs, photo needs, and ready-to-complete work.
- `/crew/jobs`: large mobile-friendly job cards with directions, call, message, photos, and complete actions.
- `/crew/jobs/[jobId]`: focused job detail with status, customer contact, service location, scope, crew notes, access notes, equipment placeholder, photo upload scaffold, completion checklist, and status update scaffold.

The crew data helper intentionally selects only job-level field information. Crew views should not expose full customer history, billing history, or unrelated CRM records.

Recommended private Supabase Storage bucket:

```text
job-photos
```

Recommended storage paths:

```text
job-photos/{job_id}/before/{timestamp}-{filename}
job-photos/{job_id}/after/{timestamp}-{filename}
job-photos/{job_id}/issue/{timestamp}-{filename}
job-photos/{job_id}/completion/{timestamp}-{filename}
```

Bucket policies must restrict access by role and job assignment. Job photos should stay private by default. Signed URLs or customer-visible photo access should wait until customer portal token rules are designed.

The app layer now scopes crew job lists and job details by assignment for regular crew users. `owner`, `admin`, and `estimator` roles can still inspect the broader crew workflow. Database RLS must enforce the same boundary before production use.

Photo uploads must pass server-side image type and file size checks. If Storage upload succeeds but metadata insert fails, the app attempts to delete the uploaded object to avoid orphaned private files.

Current database caveat: `job_photos.photo_type` supports `before`, `after`, `customer_upload`, `estimate`, `job`, and `issue`. A dedicated `completion` type needs a future migration before completion-photo metadata can persist cleanly. The UI surfaces this as setup work rather than faking success.

The completion checklist is local UI state for now. Persist checklist items later with a table such as:

```text
job_checklist_items
- id
- job_id
- key
- label
- completed_by_user_id
- completed_at
- created_at
- updated_at
```

Status update scaffolding supports only:

- `scheduled -> in_progress`
- `in_progress -> completed`

Do not broaden this into arbitrary client-side status changes. Updates must stay server-side and RLS-protected.
