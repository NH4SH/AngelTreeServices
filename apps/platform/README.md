# Angel Tree Platform App

This is the separate TypeScript/Next.js foundation for the future Angel Tree Services CRM, customer portal, and crew field app. The existing static public website remains outside this app.

## Setup

From the repo root:

```powershell
cd apps/platform
npm install
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

## Database

Apply the schema migrations in order:

```text
supabase/migrations/0001_initial_platform_schema.sql
supabase/migrations/0002_add_job_priority.sql
```

For the first pass, you can paste the migration into the Supabase SQL editor. Later, use the Supabase CLI for repeatable local and remote migrations.

The migration creates the core platform tables and enables Row Level Security. It intentionally inserts no real customer, job, quote, invoice, or payment data.

The current CRM forms use normal authenticated Supabase requests. They do not use the service role key. For reads and writes to work, the signed-in user must have one of the staff roles allowed by the migration policies: `owner`, `admin`, or `estimator`.

If your Supabase Data API settings do not automatically expose SQL-created tables, grant access to the `authenticated` role while keeping RLS enabled. Do not disable RLS to fix access errors.

## CRM Data Layer

The first admin CRM surface now includes:

- `/admin/customers`: customer records, first notes, and service locations.
- `/admin/jobs`: job records, status flow, priority, service type, and estimated date.
- `/admin/quotes`: quote records and one starter line item.
- `/admin/invoices`: invoice records and one starter line item, without payment collection.
- `/admin/schedule`: estimate, job, and follow-up appointment records.
- `/admin/documents`: quote, invoice, email, and work-order preview scaffolds.
- `/admin`: workflow summaries for new leads, estimates to schedule, quotes awaiting response, today's jobs, follow-ups due, and unpaid invoices.
- `/crew`: field dashboard for today's jobs, upcoming work, photo needs, and completion queue.
- `/crew/jobs`: large crew job cards with directions, call, message, photos, and complete actions.
- `/crew/jobs/[jobId]`: focused job detail with location, scope, crew notes, photo upload scaffolds, checklist, and status update scaffold.

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

The current `job_photos.photo_type` database check supports `before`, `after`, and `issue`, but not a dedicated `completion` type yet. The completion uploader is scaffolded and will show a clear setup message instead of pretending to upload. Add a small future migration before persisting completion photo metadata.

Storage bucket policies must keep objects private and restrict access by role and job assignment. Do not make job photos public by default.

Crew checklist state is local UI only right now. Persist it later with a table such as `job_checklist_items` after checklist ownership and audit requirements are clear.

Crew app-layer access now mirrors the intended policy shape: `owner`, `admin`, and `estimator` can view crew jobs broadly, while regular crew access is scoped to `jobs.assigned_crew_user_id`. Production RLS should enforce the same rule in the database.

Photo uploads validate image type and size server-side before hitting Storage. If file upload succeeds but metadata insert fails, the app attempts to remove the uploaded object so private storage does not accumulate unattached files.

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

- No customer detail, job detail, quote detail, or schedule detail routes yet.
- No invoice detail/edit routes yet.
- No payment handling.
- No email delivery.
- No PDF generation.
- No public document links or secure quote approval URLs.
- No Supabase Storage buckets yet.
- No persisted completion checklist yet.
- No dedicated `completion` job photo database type yet.
- No customer secure quote-link flow yet.
- No crew assigned-job policies yet.
- No generated Supabase TypeScript types yet.
- No public website migration yet.

## Next Step

Create and assign initial staff roles in Supabase, then test the first CRM writes. After that, add customer/job/detail pages, quote-to-invoice copying, and secure token design for customer portal quote approval links.
