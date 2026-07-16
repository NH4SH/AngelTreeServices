-- Remove internal authorization helpers from the exposed public RPC schema.
--
-- PostgreSQL migrations run transactionally, so policies never observe a state
-- where their replacement helpers are unavailable. ALTER FUNCTION ... SET
-- SCHEMA preserves each function OID and its existing policy/trigger dependency
-- while the explicit ALTER POLICY statements make the final dependency clear.

create schema if not exists app_private;

revoke all on schema app_private from public;
revoke all on schema app_private from anon;
grant usage on schema app_private to authenticated, service_role;

comment on schema app_private is
  'Internal RLS and trigger helpers. This schema must not be added to the Supabase Data API exposed schemas.';

-- set_updated_at is trigger-only. Keep its stable public identity for all
-- existing table triggers, but remove RPC execution and fix its search path.
alter function public.set_updated_at() set search_path = '';
revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;

-- Move the auth signup trigger function without recreating the trigger. The
-- trigger depends on the function OID, so it follows the function into the
-- private schema and continues to create profiles after auth.users inserts.
alter function public.handle_new_user() set schema app_private;

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.handle_new_user() from public, anon, authenticated, service_role;

-- rls_auto_enable is an owner-created production event-trigger function. It is
-- absent from fresh repository migrations, so move and restrict it only when it
-- exists. ALTER FUNCTION preserves the ensure_rls event trigger dependency.
do $$
begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    alter function public.rls_auto_enable() set schema app_private;
    alter function app_private.rls_auto_enable() set search_path = pg_catalog;
    revoke all on function app_private.rls_auto_enable()
      from public, anon, authenticated, service_role;
    execute 'comment on function app_private.rls_auto_enable() is '
      || quote_literal(
        'Administrative event-trigger helper that enables RLS on newly created public tables; not callable by API roles.'
      );
  end if;
end
$$;

-- Move RLS-only helpers out of public. These functions are not called through
-- supabase-js RPC anywhere in the platform application.
alter function public.has_staff_role() set schema app_private;
alter function public.has_platform_admin_role() set schema app_private;
alter function public.has_schedule_admin_role() set schema app_private;
alter function public.has_schedule_estimator_role() set schema app_private;
alter function public.has_schedule_crew_role() set schema app_private;
alter function public.can_manage_schedule_event_type(text) set schema app_private;
alter function public.is_schedule_event_assignee(uuid) set schema app_private;
alter function public.can_manage_schedule_assignment(uuid) set schema app_private;
alter function public.has_time_clock_review_role() set schema app_private;
alter function public.has_time_clock_eligible_role() set schema app_private;
alter function public.can_use_time_clock(uuid) set schema app_private;

create or replace function app_private.has_staff_role()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin', 'estimator')
  );
$$;

create or replace function app_private.has_platform_admin_role()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin')
  );
$$;

create or replace function app_private.has_schedule_admin_role()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin')
  );
$$;

create or replace function app_private.has_schedule_estimator_role()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin', 'estimator')
  );
$$;

create or replace function app_private.has_schedule_crew_role()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin', 'estimator', 'crew')
  );
$$;

create or replace function app_private.can_manage_schedule_event_type(_event_type text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    app_private.has_schedule_admin_role()
    or (
      app_private.has_schedule_estimator_role()
      and _event_type in ('estimate', 'follow_up', 'maintenance')
    );
$$;

create or replace function app_private.is_schedule_event_assignee(_event_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.schedule_event_assignments sea
    where sea.event_id = _event_id
      and sea.user_id = (select auth.uid())
  );
$$;

create or replace function app_private.can_manage_schedule_assignment(_event_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.schedule_events se
    where se.id = _event_id
      and app_private.can_manage_schedule_event_type(se.event_type)
  );
$$;

create or replace function app_private.has_time_clock_review_role()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin')
  );
$$;

create or replace function app_private.has_time_clock_eligible_role()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin', 'estimator', 'crew')
  );
$$;

create or replace function app_private.can_use_time_clock(_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    (
      (
        _user_id = (select auth.uid())
        and app_private.has_time_clock_eligible_role()
      )
      or (
        app_private.has_time_clock_review_role()
        and exists (
          select 1
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          where ur.user_id = _user_id
            and r.name in ('owner', 'admin', 'payroll_admin', 'estimator', 'crew')
        )
      )
    )
    and exists (
      select 1
      from public.time_clock_permissions tcp
      where tcp.user_id = _user_id
        and tcp.is_enabled = true
    );
$$;

-- Moving functions preserves their old ACLs, including the unsafe default
-- PUBLIC grants on early migrations. Reset every helper to an explicit minimum.
revoke all on function app_private.has_staff_role() from public, anon, authenticated, service_role;
revoke all on function app_private.has_platform_admin_role() from public, anon, authenticated, service_role;
revoke all on function app_private.has_schedule_admin_role() from public, anon, authenticated, service_role;
revoke all on function app_private.has_schedule_estimator_role() from public, anon, authenticated, service_role;
revoke all on function app_private.has_schedule_crew_role() from public, anon, authenticated, service_role;
revoke all on function app_private.can_manage_schedule_event_type(text) from public, anon, authenticated, service_role;
revoke all on function app_private.is_schedule_event_assignee(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.can_manage_schedule_assignment(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.has_time_clock_review_role() from public, anon, authenticated, service_role;
revoke all on function app_private.has_time_clock_eligible_role() from public, anon, authenticated, service_role;
revoke all on function app_private.can_use_time_clock(uuid) from public, anon, authenticated, service_role;

grant execute on function app_private.has_staff_role() to authenticated, service_role;
grant execute on function app_private.has_platform_admin_role() to authenticated, service_role;
grant execute on function app_private.has_schedule_admin_role() to authenticated, service_role;
grant execute on function app_private.has_schedule_estimator_role() to authenticated, service_role;
grant execute on function app_private.has_schedule_crew_role() to authenticated, service_role;
grant execute on function app_private.can_manage_schedule_event_type(text) to authenticated, service_role;
grant execute on function app_private.is_schedule_event_assignee(uuid) to authenticated, service_role;
grant execute on function app_private.can_manage_schedule_assignment(uuid) to authenticated, service_role;
grant execute on function app_private.has_time_clock_review_role() to authenticated, service_role;
grant execute on function app_private.has_time_clock_eligible_role() to authenticated, service_role;
grant execute on function app_private.can_use_time_clock(uuid) to authenticated, service_role;

-- Keep the non-exposed Storage helper private and point it at the moved staff
-- helper. It remains callable only by authenticated Storage policy evaluation.
create or replace function private.can_access_job_photo_object(object_name text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when pg_catalog.split_part(object_name, '/', 1)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then exists (
        select 1
        from public.jobs j
        where j.id = pg_catalog.split_part(object_name, '/', 1)::uuid
          and (
            j.assigned_crew_user_id = (select auth.uid())
            or app_private.has_staff_role()
          )
      )
    else false
  end;
$$;

revoke all on function private.can_access_job_photo_object(text)
  from public, anon, authenticated, service_role;
grant execute on function private.can_access_job_photo_object(text) to authenticated;

-- The two portal-token functions are intentional authenticated RPCs. They are
-- SECURITY INVOKER and retain their existing argument/return contract while
-- using private authorization helpers and an empty search path.
create or replace function public.create_or_get_quote_portal_token(
  p_quote_id uuid,
  p_token_hash text,
  p_token_hint text,
  p_token_encrypted text,
  p_expires_at timestamptz
)
returns table (
  id uuid,
  token_encrypted text,
  expires_at timestamptz,
  created boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_token record;
  record_customer_id uuid;
begin
  if not app_private.has_staff_role() then
    raise exception 'Only staff can manage quote portal links.';
  end if;

  select quotes.customer_id
  into record_customer_id
  from public.quotes
  where quotes.id = p_quote_id
  for update;

  if not found then
    raise exception 'Quote not found or no access.';
  end if;

  select quote_portal_tokens.id,
         quote_portal_tokens.token_encrypted,
         quote_portal_tokens.expires_at
  into existing_token
  from public.quote_portal_tokens
  where quote_portal_tokens.quote_id = p_quote_id
    and quote_portal_tokens.revoked_at is null
    and (
      quote_portal_tokens.expires_at is null
      or quote_portal_tokens.expires_at > pg_catalog.now()
    )
  order by quote_portal_tokens.created_at desc
  limit 1;

  if found then
    return query
      select existing_token.id,
             existing_token.token_encrypted,
             existing_token.expires_at,
             false;
    return;
  end if;

  return query
  with inserted as (
    insert into public.quote_portal_tokens (
      quote_id,
      customer_id,
      token_hash,
      token_hint,
      token_encrypted,
      expires_at,
      created_by_user_id
    )
    values (
      p_quote_id,
      record_customer_id,
      p_token_hash,
      p_token_hint,
      p_token_encrypted,
      p_expires_at,
      auth.uid()
    )
    returning quote_portal_tokens.id,
              quote_portal_tokens.token_encrypted,
              quote_portal_tokens.expires_at
  )
  select inserted.id, inserted.token_encrypted, inserted.expires_at, true
  from inserted;
end;
$$;

revoke all on function public.create_or_get_quote_portal_token(uuid, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.create_or_get_quote_portal_token(uuid, text, text, text, timestamptz)
  to authenticated, service_role;

create or replace function public.create_or_get_invoice_portal_token(
  p_invoice_id uuid,
  p_token_hash text,
  p_token_hint text,
  p_token_encrypted text,
  p_expires_at timestamptz
)
returns table (
  id uuid,
  token_encrypted text,
  expires_at timestamptz,
  created boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_token record;
  record_customer_id uuid;
begin
  if not app_private.has_platform_admin_role() then
    raise exception 'Only owners and admins can manage invoice portal links.';
  end if;

  select invoices.customer_id
  into record_customer_id
  from public.invoices
  where invoices.id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found or no access.';
  end if;

  select invoice_portal_tokens.id,
         invoice_portal_tokens.token_encrypted,
         invoice_portal_tokens.expires_at
  into existing_token
  from public.invoice_portal_tokens
  where invoice_portal_tokens.invoice_id = p_invoice_id
    and invoice_portal_tokens.revoked_at is null
    and (
      invoice_portal_tokens.expires_at is null
      or invoice_portal_tokens.expires_at > pg_catalog.now()
    )
  order by invoice_portal_tokens.created_at desc
  limit 1;

  if found then
    return query
      select existing_token.id,
             existing_token.token_encrypted,
             existing_token.expires_at,
             false;
    return;
  end if;

  return query
  with inserted as (
    insert into public.invoice_portal_tokens (
      invoice_id,
      customer_id,
      token_hash,
      token_hint,
      token_encrypted,
      expires_at,
      created_by_user_id
    )
    values (
      p_invoice_id,
      record_customer_id,
      p_token_hash,
      p_token_hint,
      p_token_encrypted,
      p_expires_at,
      auth.uid()
    )
    returning invoice_portal_tokens.id,
              invoice_portal_tokens.token_encrypted,
              invoice_portal_tokens.expires_at
  )
  select inserted.id, inserted.token_encrypted, inserted.expires_at, true
  from inserted;
end;
$$;

revoke all on function public.create_or_get_invoice_portal_token(uuid, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.create_or_get_invoice_portal_token(uuid, text, text, text, timestamptz)
  to authenticated, service_role;

-- Core CRM policies.
alter policy "Staff can manage profiles" on public.profiles
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage roles" on public.roles
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage user roles" on public.user_roles
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage organizations" on public.organizations
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage lead sources" on public.lead_sources
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage customers" on public.customers
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage service locations" on public.service_locations
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage jobs" on public.jobs
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage job photos" on public.job_photos
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage notes" on public.notes
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage quotes" on public.quotes
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage quote line items" on public.quote_line_items
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage invoices" on public.invoices
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage invoice line items" on public.invoice_line_items
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage payments" on public.payments
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage appointments" on public.appointments
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can manage organization contacts" on public.organization_contacts
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can read activity log" on public.activity_log
  using (app_private.has_staff_role());
alter policy "Staff can create activity log entries" on public.activity_log
  with check (app_private.has_staff_role());
alter policy "Staff can manage quote portal tokens" on public.quote_portal_tokens
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
alter policy "Staff can read email events" on public.email_events
  using (app_private.has_staff_role());
alter policy "Staff can create email events" on public.email_events
  with check (app_private.has_staff_role());

-- Owner/admin access policies.
alter policy "Platform admins can manage employee access requests"
  on public.employee_access_requests
  using (app_private.has_platform_admin_role())
  with check (app_private.has_platform_admin_role());
alter policy "Owner and admin can manage invoice portal tokens"
  on public.invoice_portal_tokens
  using (app_private.has_platform_admin_role())
  with check (app_private.has_platform_admin_role());

-- Schedule policies.
alter policy "Schedule staff can read events" on public.schedule_events
  using (
    app_private.has_schedule_estimator_role()
    or (
      app_private.has_schedule_crew_role()
      and app_private.is_schedule_event_assignee(id)
    )
  );
alter policy "Schedule managers can insert events" on public.schedule_events
  with check (app_private.can_manage_schedule_event_type(event_type));
alter policy "Schedule managers can update events" on public.schedule_events
  using (app_private.can_manage_schedule_event_type(event_type))
  with check (app_private.can_manage_schedule_event_type(event_type));
alter policy "Schedule managers can delete events" on public.schedule_events
  using (app_private.can_manage_schedule_event_type(event_type));
alter policy "Schedule staff can read assignments" on public.schedule_event_assignments
  using (
    app_private.has_schedule_estimator_role()
    or (
      app_private.has_schedule_crew_role()
      and user_id = (select auth.uid())
    )
  );
alter policy "Schedule managers can insert assignments" on public.schedule_event_assignments
  with check (app_private.can_manage_schedule_assignment(event_id));
alter policy "Schedule managers can update assignments" on public.schedule_event_assignments
  using (app_private.can_manage_schedule_assignment(event_id))
  with check (app_private.can_manage_schedule_assignment(event_id));
alter policy "Schedule managers can delete assignments" on public.schedule_event_assignments
  using (app_private.can_manage_schedule_assignment(event_id));

-- Time clock and payroll review policies.
alter policy "Reviewers can manage time clock permissions" on public.time_clock_permissions
  using (app_private.has_time_clock_review_role())
  with check (app_private.has_time_clock_review_role());
alter policy "Reviewers can read all time entries" on public.time_entries
  using (app_private.has_time_clock_review_role());
alter policy "Enabled users can create their own active time entries" on public.time_entries
  with check (
    app_private.can_use_time_clock(user_id)
    and status = 'active'
    and clock_out_at is null
  );
alter policy "Users can update their own active time entries" on public.time_entries
  using (
    (select auth.uid()) = user_id
    and app_private.can_use_time_clock(user_id)
    and status = 'active'
    and clock_out_at is null
  )
  with check (
    (select auth.uid()) = user_id
    and user_id = (select auth.uid())
    and status in ('active', 'completed')
  );
alter policy "Reviewers can update all time entries" on public.time_entries
  using (app_private.has_time_clock_review_role())
  with check (app_private.has_time_clock_review_role());
alter policy "Reviewers can read time entry adjustments" on public.time_entry_adjustments
  using (app_private.has_time_clock_review_role());
alter policy "Reviewers can create time entry adjustments" on public.time_entry_adjustments
  with check (app_private.has_time_clock_review_role());
alter policy "Reviewers can read time entry approvals" on public.time_entry_approvals
  using (app_private.has_time_clock_review_role());
alter policy "Reviewers can create time entry approvals" on public.time_entry_approvals
  with check (app_private.has_time_clock_review_role());
alter policy "Reviewers can manage pay periods" on public.pay_periods
  using (app_private.has_time_clock_review_role())
  with check (app_private.has_time_clock_review_role());

-- Storage policy still permits assigned owners or staff to clean up objects.
alter policy "Authorized users can remove owned private job photos" on storage.objects
  using (
    bucket_id = 'job-photos'
    and private.can_access_job_photo_object(name)
    and (
      owner_id = (select auth.uid()::text)
      or app_private.has_staff_role()
    )
  );

comment on function app_private.can_use_time_clock(uuid) is
  'RLS-only timer eligibility check. A user may check self; owner/admin/payroll reviewers may check another eligible user.';
