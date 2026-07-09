# Angel Tree Platform Deployment Checklist

Use this checklist before the first private staging deployment of the platform app.

## 1. Environment Variables

Set these for the deployed `apps/platform` app:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
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
- `SUPABASE_DB_URL` is not required for normal runtime page rendering. Keep it for migrations and server-side tooling only.

## 2. Supabase Auth Setup

Current login uses email/password and redirects with relative in-app paths like `/login?next=/admin`, so there is no app-side OAuth callback dependency in this phase.

Still verify:

- the deployed platform domain can set auth cookies normally
- your Supabase project has the correct site URL for future auth emails
- any future redirect URLs include the staging/private platform domain before enabling magic links, password recovery, or email confirmations

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

Before deploy, apply `supabase/migrations/20260709132222_invoice_portal_tokens.sql` and verify:

1. An owner/admin can generate an invoice link without email configuration.
2. The copied URL uses the deployed host.
3. Signed-out customers can view and print only the linked invoice.
4. Replaced, revoked, expired, and invalid links show the unavailable state.
5. The browser never receives `SUPABASE_SERVICE_ROLE_KEY`.

## 7. Build And Start Commands

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

## 8. Manual Staging Smoke Test

After deployment, manually verify:

1. Login succeeds for an internal staff account.
2. `/admin` loads.
3. `/crew` loads for a crew-capable account.
4. `/portal/quote/[token]` loads without requiring login.
5. `/portal/invoice/[token]` loads without requiring login.
6. Public lead intake succeeds from the live public-site origin.
7. Quote, invoice, customer, and job detail links navigate cleanly.
8. Time clock pages load for enabled users and deny disabled users with a helpful message.

## 9. Not In Scope Yet

These are still intentionally unfinished for first private deployment:

- public payment collection
- production email sending
- payroll export integration
- external calendar sync
- durable distributed rate limiting for public lead intake
- public invoice portal links
