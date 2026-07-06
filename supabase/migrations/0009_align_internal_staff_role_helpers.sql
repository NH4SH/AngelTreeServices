-- Align database role helpers with the platform app's internal staff model.
--
-- The application treats payroll_admin as internal staff for admin, schedule,
-- time, and payroll pages. Earlier database helper functions still excluded
-- that role, which could surface as RLS/database notices on protected pages.
--
-- This migration updates only the helper functions so existing policies pick
-- up the broader role set without changing page behavior or adding new tables.

create or replace function public.has_staff_role()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name in ('owner', 'admin', 'payroll_admin', 'estimator')
  );
$$;

create or replace function public.has_schedule_admin_role()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name in ('owner', 'admin', 'payroll_admin')
  );
$$;

create or replace function public.has_schedule_estimator_role()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name in ('owner', 'admin', 'payroll_admin', 'estimator')
  );
$$;

create or replace function public.has_schedule_crew_role()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name in ('owner', 'admin', 'payroll_admin', 'estimator', 'crew')
  );
$$;

create or replace function private.can_access_job_photo_object(object_name text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then exists (
        select 1
        from public.jobs j
        where j.id = split_part(object_name, '/', 1)::uuid
          and (
            j.assigned_crew_user_id = (select auth.uid())
            or public.has_staff_role()
          )
      )
    else false
  end;
$$;

grant execute on function public.has_staff_role() to authenticated, service_role;
grant execute on function public.has_schedule_admin_role() to authenticated, service_role;
grant execute on function public.has_schedule_estimator_role() to authenticated, service_role;
grant execute on function public.has_schedule_crew_role() to authenticated, service_role;
grant execute on function private.can_access_job_photo_object(text) to authenticated;
