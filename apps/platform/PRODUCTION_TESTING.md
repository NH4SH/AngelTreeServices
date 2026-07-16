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
PORTAL_TOKEN_ENCRYPTION_KEY=
RESEND_API_KEY=
EMAIL_FROM=Angel Tree Services <info@angeltreeservice.org>
EMAIL_REPLY_TO=info@angeltreeservice.org
INTERNAL_LEAD_NOTIFICATION_EMAIL=info@angeltreeservice.org
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

## 8. Rollback Notes

If the admin deploy fails:

1. Open the Netlify admin site.
2. Go to **Deploys**.
3. Roll back to the last known good deploy.
4. Re-check env vars before retrying.

Important:

- The public website should remain unaffected because it is deployed as a separate Netlify site.
- Do not change public-site DNS or env vars while rolling back the admin app unless the lead form target must be corrected.
