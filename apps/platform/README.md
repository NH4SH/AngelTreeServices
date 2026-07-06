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

Apply the first schema migration:

```text
supabase/migrations/0001_initial_platform_schema.sql
```

For the first pass, you can paste the migration into the Supabase SQL editor. Later, use the Supabase CLI for repeatable local and remote migrations.

The migration creates the core platform tables and enables Row Level Security. It intentionally inserts no real customer, job, quote, invoice, or payment data.

## Run Locally

```powershell
npm run dev
```

Open:

```text
http://localhost:3000/
http://localhost:3000/login
http://localhost:3000/admin
http://localhost:3000/crew
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

- No real CRM data.
- No customer/job/quote/invoice CRUD.
- No payment handling.
- No email delivery.
- No Supabase Storage buckets yet.
- No customer secure quote-link flow yet.
- No crew assigned-job policies yet.
- No public website migration yet.

## Next Step

Create and assign initial staff roles in Supabase, then tighten `/admin`, `/crew`, and `/portal` authorization with server-side role checks.
