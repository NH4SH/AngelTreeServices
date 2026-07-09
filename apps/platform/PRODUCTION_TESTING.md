# Angel Tree Platform Production Testing

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
NEXT_PUBLIC_GOOGLE_REVIEW_URL=
LEAD_INTAKE_ALLOWED_ORIGINS=https://angeltreeservices.org,https://www.angeltreeservices.org
```

Optional server-side tooling variable:

```env
SUPABASE_DB_URL=
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- Do not add the service role key to the public website Netlify site.
- `SUPABASE_DB_URL` is not required for normal app page runtime right now.

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

## 7. Rollback Notes

If the admin deploy fails:

1. Open the Netlify admin site.
2. Go to **Deploys**.
3. Roll back to the last known good deploy.
4. Re-check env vars before retrying.

Important:

- The public website should remain unaffected because it is deployed as a separate Netlify site.
- Do not change public-site DNS or env vars while rolling back the admin app unless the lead form target must be corrected.
