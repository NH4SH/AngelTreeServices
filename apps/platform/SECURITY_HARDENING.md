# Supabase Security Advisor Hardening

This pass is implemented by:

```text
supabase/migrations/20260716212545_harden_security_definer_functions.sql
```

It does not change CRM records, disable RLS, alter portal tokens, or apply the
migration to production. Read-only post-migration checks are in:

```text
supabase/verification/security_advisor_hardening.sql
```

## Function Findings

| Function | Classification and callers | Hardening |
| --- | --- | --- |
| `public.set_updated_at()` | Trigger-only; used by CRM `updated_at` triggers. Not `SECURITY DEFINER`, but inherited mutable `search_path` and PUBLIC execute. | Stays in `public` for trigger compatibility, gets `search_path = ''`, and loses all API-role execute grants. |
| `public.handle_new_user()` | Trigger-only; `auth.users.on_auth_user_created` creates the profile row. No app RPC caller. | Moves to `app_private` by OID, keeps `SECURITY DEFINER`, uses an empty search path, and is executable only by its owner/trigger. |
| `public.rls_auto_enable()` | Production-only administrative event-trigger helper used by `ensure_rls` on `ddl_command_end`; absent from repository migrations. | Conditionally moves to `app_private`, keeps `search_path = pg_catalog`, and loses PUBLIC/anon/authenticated/service-role execute. The event trigger follows the same function OID. |
| `public.has_staff_role()` | RLS helper for core CRM, quote token, email event, and Storage policies; also used inside the intentional quote-token RPC. No direct app RPC caller. | Moves to `app_private`, keeps definer behavior with `search_path = ''`, and receives only authenticated/service-role execute for policy/internal use. |
| `public.has_platform_admin_role()` | RLS helper for access requests and invoice token management; also used inside the intentional invoice-token RPC. No direct app RPC caller. | Moves to `app_private` with an empty search path and minimum policy/internal grants. |
| `public.has_schedule_admin_role()` | RLS-only schedule role helper. | Moves to `app_private`; role behavior is unchanged. |
| `public.has_schedule_estimator_role()` | RLS-only schedule read/manage helper. | Moves to `app_private`; estimator behavior is unchanged. |
| `public.has_schedule_crew_role()` | RLS-only assigned-event visibility helper. | Moves to `app_private`; crew behavior is unchanged. |
| `public.can_manage_schedule_event_type(text)` | RLS-only event insert/update/delete helper. | Moves to `app_private`, validates the same event-type allow-list, and calls private role helpers. |
| `public.is_schedule_event_assignee(uuid)` | RLS-only assigned-event lookup. | Moves to `app_private` and still compares the assignment to `auth.uid()`. |
| `public.can_manage_schedule_assignment(uuid)` | RLS-only assignment write helper. | Moves to `app_private` and still derives authorization from the referenced event type. |
| `public.has_time_clock_review_role()` | RLS-only time/pay-period reviewer helper. | Moves to `app_private`; owner/admin/payroll reviewer behavior is unchanged. |
| `public.has_time_clock_eligible_role()` | Internal helper used by timer eligibility. | Moves to `app_private`; no public RPC remains. |
| `public.can_use_time_clock(uuid)` | RLS-only insert/update eligibility helper; no app `.rpc()` caller. The old body already required `_user_id = auth.uid()`. | Moves to `app_private`. Normal users remain self-only; owner/admin/payroll reviewers may evaluate another eligible user. |
| `private.can_access_job_photo_object(text)` | Existing non-exposed Storage-policy helper. | Remains private with an empty search path and now calls `app_private.has_staff_role()`. Only authenticated policy evaluation retains execute. |
| `public.create_or_get_quote_portal_token(...)` | Intentional authenticated app RPC; already `SECURITY INVOKER`. | Remains public/invoker, changes to `search_path = ''`, calls the private staff helper, and keeps only authenticated/service-role execute. |
| `public.create_or_get_invoice_portal_token(...)` | Intentional authenticated app RPC; already `SECURITY INVOKER`. | Remains public/invoker, changes to `search_path = ''`, calls the private owner/admin helper, and keeps only authenticated/service-role execute. |

Repository and production-catalog searches found no other public-schema
`SECURITY DEFINER` functions. `app_private` must remain absent from the Supabase
Data API exposed-schema list.

## Deployment Order

1. Back up production and confirm the current migration list.
2. Apply all earlier pending migrations in filename order.
3. Apply `20260716212545_harden_security_definer_functions.sql` through the normal Supabase migration process.
4. Run `supabase/verification/security_advisor_hardening.sql`.
5. Refresh the PostgREST schema cache if needed, then rerun Supabase Security Advisor.
6. In Supabase Dashboard Auth settings, enable **Prevent the use of leaked passwords** (available on Pro plans and above).
7. Run the role, signup, portal, and Stripe regression checklist below before considering the change complete.

Do not add `app_private` to **API Settings -> Exposed schemas**. The only
remaining manual advisor item should be leaked-password protection until the
Dashboard setting is enabled. No privileged public `SECURITY DEFINER` warning is
intentionally retained.

## Manual Security Regression

- Anonymous REST RPC calls to every former public role/schedule/time helper are unavailable or denied.
- Employee signup still creates the expected profile and access request.
- An employee awaiting approval does not gain staff, schedule, or timer access.
- Crew login, assigned-job access, crew schedule, and enabled clock-in/clock-out work.
- A timer-disabled employee cannot clock in.
- Estimator quote and schedule access still works, including the existing event-type restrictions.
- Owner/admin dashboard, access approvals, schedule management, and time review work.
- Payroll reviewers can review time; an unauthorized user cannot review another employee's time.
- Schedule assignment writes still enforce role and event-type authorization.
- Public quote and invoice links still work and remain token-scoped.
- Existing customer portal links remain active; no token is regenerated or revoked by this migration.
- Quote and invoice link generation still works through the two intentional `SECURITY INVOKER` RPCs.
- Job-photo reads/uploads remain scoped to assigned crew or staff.
- Stripe webhook and service-role operations remain unaffected, including idempotent payment handling.

## Local Database Commands

When Docker and local Supabase are available, run from the repository root:

```bash
supabase start
supabase db reset
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/verification/security_advisor_hardening.sql
```

For a linked non-production project, inspect pending migrations before pushing:

```bash
supabase migration list
supabase db push --dry-run
```

Do not use these instructions to apply the migration to production without an
intentional deployment review.
