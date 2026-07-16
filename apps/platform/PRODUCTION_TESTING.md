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
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
APP_BASE_URL=https://admin.angeltreeservices.org
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
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server-only. Start with Stripe test keys and never expose them through browser configuration.
- `APP_BASE_URL` must be `https://admin.angeltreeservices.org` in production so Checkout returns to the same customer portal link.
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

## 8. Stripe Checkout Smoke Test

Before testing, apply `supabase/migrations/20260716210754_stripe_invoice_payments.sql`, deploy with Stripe test-mode environment variables, and configure this Stripe webhook endpoint:

```text
https://admin.angeltreeservices.org/api/stripe/webhook
```

Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `payment_intent.payment_failed`.

1. Open a sent, unpaid invoice through a valid customer link and confirm the displayed amount matches CRM balance due.
2. Click **Pay invoice**, complete a Stripe test payment, and confirm the webhook creates one successful payment record.
3. Refresh the same customer link. Confirm it shows paid status and no payment button.
4. Replay the completed webhook from the Stripe dashboard. Confirm no duplicate payment record appears.
5. Click Checkout twice before paying. Confirm the portal reuses one active Checkout Session and only one completed payment is recorded.
6. Try a voided, paid, draft, or zero-balance invoice. Confirm no payment button appears and the checkout endpoint refuses it.
7. Edit an unpaid invoice amount, then start checkout. Confirm the new Checkout Session uses the latest remaining balance.
8. Duplicate a paid invoice. Confirm the new draft has no payment records, Stripe session, or portal-token history.
9. Record a manual check payment as an owner/admin. Confirm the payment ledger, balance, and invoice status update without any Stripe identifiers.

## 9. Supabase Security Regression

After applying `supabase/migrations/20260716212545_harden_security_definer_functions.sql`:

1. Run `supabase/verification/security_advisor_hardening.sql` and inspect every result set.
2. Confirm former public role/schedule/time helpers are not exposed as REST RPCs to anon or authenticated users.
3. Create a test employee signup and confirm the auth trigger still creates its profile/access flow.
4. Test crew schedule, estimator schedule, owner/admin access, timer-enabled clock-in/out, and admin time review.
5. Confirm an unauthorized user cannot inspect or review another employee's time.
6. Open existing signed-out quote and invoice links and confirm they still load without token changes.
7. Confirm quote/invoice link generation and job-photo access still enforce their existing role boundaries.
8. Confirm Stripe webhook/service-role payment processing remains idempotent and unaffected.
9. Rerun Supabase Security Advisor.
10. In Supabase Auth settings, enable **Prevent the use of leaked passwords** if the advisor still reports it disabled.

Keep `app_private` out of the Supabase Data API exposed-schema list. See `SECURITY_HARDENING.md` for the full function findings and expected grants.

## 10. Rollback Notes

If the admin deploy fails:

1. Open the Netlify admin site.
2. Go to **Deploys**.
3. Roll back to the last known good deploy.
4. Re-check env vars before retrying.

Important:

- The public website should remain unaffected because it is deployed as a separate Netlify site.
- Do not change public-site DNS or env vars while rolling back the admin app unless the lead form target must be corrected.
