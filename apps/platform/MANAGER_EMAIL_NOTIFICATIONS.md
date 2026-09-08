# Manager Email Notifications

Morning summaries and assigned Next Action emails reuse the existing Resend sender,
email history, activity log and notification inbox. Both new settings default OFF.
No address is hardcoded, and saving settings does not send a message.

Production schema status: applied to the CRM project on September 8, 2026 as
`20260908131758_manager_notification_emails`. Verified both settings remain off,
no manager emails are queued, RLS remains enabled, and clients can mark notifications
read but cannot edit delivery state or payloads. Do not reapply it to that project.
The admin application deployment and individual opt-in are still separate steps.

## Manual Activation

1. Review and apply `supabase/migrations/20260908131758_manager_notification_emails.sql`
   to the intended Supabase project before deploying the new code. It depends on
   the existing activity/notifications and follow-up task migrations. Do not run a
   production reset. The migration does not opt anyone in or backfill assignments.
2. On the admin Netlify site, verify the existing `APP_BASE_URL`,
   `COMMUNICATION_WORKER_SECRET`, Resend credential, `EMAIL_FROM`, and
   `EMAIL_REPLY_TO` configuration. The worker secret must be at least 32 characters
   and available to both the scheduled function and Next.js server. The app URL
   must be `https://admin.angeltreeservices.org`. Do not print credentials or add
   these settings to the static public site.
3. Manually deploy the admin project. The new Netlify `manager-notifications`
   function runs every five minutes and calls the bearer-protected internal route.
   Deployment alone sends no new manager emails while the settings remain off.
4. Each active owner/admin opens **Settings > Notifications**, verifies their
   sign-in address, selects the desired manager emails and saves. For Saul, use
   his own verified operations account; changing a profile contact address does
   not change the email recipient. Crew and unverified accounts cannot receive
   these administrative emails.

## Behavior

- Morning summary: once per manager per Eastern business date, starting at the
  selected 7-11 AM hour, with catch-up until noon. Counts cover new leads, today's
  event-calendar work, unscheduled approved work, jobs needing invoices, due
  assigned/shared handoffs and overdue invoices. No customer contact or monetary
  details are copied into the summary. Legacy appointments are not included in
  the daily event counts; the email points this out.
- Handoff: assigning a new Next Action queues a message transactionally. Re-saving
  the same assignee does not queue another email. Reassigning cancels old pending
  notifications. Before delivery, the worker checks the current assignee, task
  status, opt-in, active account, owner/admin role and verified Auth address again.
- Quiet hours: these two types send only 7 AM-8 PM Eastern. Existing customer
  activity email behavior is unchanged. Old assignments are not emailed when
  someone first enables the preference.
- Retries: frozen recipient/content and a stable provider idempotency key, at most
  three attempts within 20 hours of the first attempt. A failed provider request
  waits at least 15 minutes. Interrupted claims can recover after ten minutes.
  Changed recipient/sender configuration stops a retry rather than redirecting it.
  The window stays inside Resend's 24-hour idempotency retention. Never manually
  resend an uncertain result without checking provider history first.
- The worker processes bounded batches with a time budget. Large backlogs drain
  over multiple runs. The preference scan is capped at 100 opted-in managers,
  appropriate for this internal team; larger deployments need paginated discovery.
- **Recent manager emails** reports queue/failure/skipped/provider-accepted state.
  Accepted is not proof of inbox delivery. The existing email history retains
  provider send results. Sensitive payload/state columns cannot be edited by inbox
  clients; recipient RLS and mark-read behavior remain intact.

## Verification

Run `npm run test:notifications`, `npm run test:email`, `npm run typecheck`, and
`npm run build` in `apps/platform`, then `git diff --check` from the root.
`tests/manager-notifications.browser.mjs` uses an isolated real form and real CSS
with mocked saves in Chromium, Firefox and WebKit at mobile/landscape/tablet/desktop
sizes; set `ESBUILD_MODULE` and `PLAYWRIGHT_MODULE` if tools are installed externally.
`tests/manager-email-migration.test.mjs` runs the actual SQL in isolated PGlite;
set `PGLITE_MODULE` to a local installation. It does not connect to Supabase.

After manual deployment, first use a verified test manager account: confirm opt-out
produces no mail, opt in, assign one test handoff, check acceptance/history, re-save
the same assignment, and confirm no second message. Verify the next morning summary
and mobile settings. Confirm actual inbox delivery separately. No live emails or
production migrations are required by the automated tests.
