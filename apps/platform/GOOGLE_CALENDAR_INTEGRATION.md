# Google Calendar One-Way Mirror

Angel Tree is authoritative. Google Calendar is an optional, one-way mirror of active CRM estimates and job work sessions. Staff must make schedule changes in Angel Tree; a later reconciliation can overwrite manual edits made to an integration-managed Google event.

## Architecture

1. An authorized staff or crew user starts OAuth at `/employee/integrations/google-calendar`.
2. The server creates a signed, short-lived OAuth state bound to that authenticated user and stores it in a secure HTTP-only cookie.
3. Google returns an authorization code to the server callback. The server verifies state, exchanges the code, identifies the Google account, and encrypts the refresh token with AES-256-GCM before service-role storage.
4. Schedule and assignment database triggers only enqueue a deduplicated outbox row. They never call Google and cannot make a CRM schedule write fail.
5. A Netlify Scheduled Function calls the authenticated internal processor every five minutes. `Sync now` uses the same centralized reconciler directly.
6. Durable mappings and deterministic provider event IDs make create/update/delete operations idempotent. Private Google extended properties provide recovery when a mapping is missing.

The sync window is the current Eastern calendar day through the next 90 days. Each active day of a multi-day job is a separate `schedule_events` row and therefore a separate Google event.

## What Is Mirrored

- Active `estimate` and `job` schedule events with status `scheduled`, `confirmed`, or `in_progress`.
- Events assigned through the connected user's durable employee record, according to that user's preferences.
- Optionally, all qualifying company work for an owner or admin. This authorization is checked again server-side.
- Title, contracting-party display name, service address, exact CRM start/end time, and a link back to Angel Tree.

Google events are private and deliberately exclude prices, balances, payment data, customer email/phone, long scope, calendar/office notes, crew notes, and other sensitive fields. Completed, cancelled, unassigned, disabled-by-preference, past, and out-of-window events are removed only when they were created by this integration. Unrelated personal events are never changed.

## Google Cloud Setup

1. Open the intended Google Cloud project and enable **Google Calendar API**.
2. Configure the OAuth consent screen. Use the organization's appropriate Internal or External audience; while the app is in testing, add only intended Angel Tree test users.
3. Create an **OAuth client ID** with application type **Web application**.
4. Add these exact authorized redirect URIs:

```text
https://admin.angeltreeservices.org/api/integrations/google-calendar/callback
http://localhost:3000/api/integrations/google-calendar/callback
```

5. Configure or approve only these scopes:

```text
openid
email
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.calendarlist.readonly
```

`openid` and `email` identify the connected Google account. `calendar.events` manages only calendar events. `calendar.calendarlist.readonly` lists calendars so the user can choose one where Google reports writer/owner access.

## Server Environment

Set these only on the Netlify project serving `https://admin.angeltreeservices.org` and, when needed, `apps/platform/.env.local`. Never use `NEXT_PUBLIC_`, never add them to the public static-site project, and never put them in iOS configuration.

```env
APP_BASE_URL=https://admin.angeltreeservices.org
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_TOKEN_ENCRYPTION_KEY=
GOOGLE_CALENDAR_WORKER_SECRET=
```

For localhost, use `APP_BASE_URL=http://localhost:3000` and the same localhost callback registered above. Generate independent server secrets with:

```bash
openssl rand -base64 32  # GOOGLE_TOKEN_ENCRYPTION_KEY: exactly 32 decoded bytes
openssl rand -hex 32     # GOOGLE_CALENDAR_WORKER_SECRET: at least 32 characters
```

Keep the token-encryption key stable while connections exist. Rotating it without a credential re-encryption plan requires each user to reconnect.

## Database And Deployment

Review and apply this additive migration before deploying the compatible application:

```text
supabase/migrations/20260813020719_google_calendar_one_way_sync.sql
```

The migration adds service-role-only connection, mapping, and outbox tables; fixed-search-path trigger/RPC functions; RLS; constraints; indexes; and bounded task claiming. It does not modify existing schedule rows or create Google events.

Production procedure:

1. Back up Supabase and compare local/remote history with `npx supabase migration list --linked`.
2. Review the exact SQL and run `npx supabase db push --linked --dry-run`.
3. Apply only after the dry run contains the expected pending migration: `npx supabase db push --linked`.
4. If PostgREST does not see the new tables, run `notify pgrst, 'reload schema';` in the Supabase SQL Editor.
5. Complete Google Cloud setup and add all five server environment values to the admin Netlify project.
6. Deploy the admin app. The deployment includes `netlify/functions/process-google-calendar.ts`, scheduled every five minutes.
7. Connect one non-production staff account, choose preferences, press **Sync now**, and complete the smoke test below before broader use.

Do not apply the migration from a Netlify build. Do not apply it to production without reviewing migration parity first.

## Operations And Recovery

- Schedule changes commit before Google work. Provider outages, rate limits, and revoked access cannot roll back or alter the CRM save.
- Transient failures retry at 15, 30, 60, 120, and 240-minute delays, with six total bounded attempts. The settings page also provides **Sync now**.
- Revoked authorization disables automatic sync and asks the user to reconnect; it does not retry forever.
- Reconciliation creates missing events, patches changed events, adopts recoverable managed events, and removes stale mapped events.
- Google-side edits never flow into Angel Tree. Reconciliation may restore the CRM title, location, and time.
- Disconnect disables sync first, stops queued work, revokes the credential, and removes protected local mappings. The user can optionally remove future integration-managed Google events. Failed remote cleanup remains visible and retryable.
- A future shared company connection can reuse the mapping/outbox design, but V1 stores one user-owned connection per authenticated platform user.
- Future native iOS clients must update the CRM schedule only. They must not implement a second Google OAuth or sync engine.

## Manual Smoke Test

1. Connect a test Google account and confirm only writable calendars appear.
2. Enable estimates and jobs assigned to the test employee; leave company-wide sync off.
3. Press **Sync now** and verify only active events from today through 90 days appear.
4. Move and resize an event in Angel Tree; verify the same Google event updates after processing.
5. Add/remove the employee assignment and verify that user's Google event is created/removed.
6. Schedule a two-day job and verify two separate Google events.
7. Cancel one workday and verify only its managed Google event is removed.
8. Edit a managed event in Google, then press **Sync now** and verify Angel Tree values return.
9. Confirm personal Google events are untouched and synced descriptions contain no private or financial data.
10. Revoke Google access and confirm Angel Tree scheduling still saves while settings reports reconnection is required.
11. Disconnect once without cleanup and once with **Remove future Angel Tree events** in an isolated test calendar.

Automated coverage runs with `npm run test:google-calendar`; it mocks Google HTTP and never creates a real Calendar event.
