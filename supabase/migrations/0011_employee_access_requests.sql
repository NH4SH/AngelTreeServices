-- Employee access request and approval flow.
--
-- This keeps public employee signup separate from staff authorization:
-- sign-up can create a pending request, but only owner/admin accounts can
-- approve and assign internal roles.

create table if not exists public.employee_access_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  full_name text not null,
  phone text,
  requested_role text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  assigned_role text check (
    assigned_role is null
    or assigned_role in ('admin', 'estimator', 'crew', 'payroll_admin')
  ),
  time_clock_enabled boolean not null default false,
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_access_requests_status_idx
  on public.employee_access_requests(status);

create unique index if not exists employee_access_requests_pending_email_idx
  on public.employee_access_requests (lower(email))
  where status = 'pending';

create unique index if not exists employee_access_requests_pending_auth_user_id_idx
  on public.employee_access_requests (auth_user_id)
  where status = 'pending' and auth_user_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'employee_access_requests_set_updated_at'
  ) then
    create trigger employee_access_requests_set_updated_at
      before update on public.employee_access_requests
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.employee_access_requests enable row level security;

create or replace function public.has_platform_admin_role()
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
      and r.name in ('owner', 'admin')
  );
$$;

revoke all on function public.has_platform_admin_role() from public;
grant execute on function public.has_platform_admin_role() to authenticated, service_role;

grant select, insert, update, delete on table public.employee_access_requests to authenticated, service_role;
grant insert on table public.employee_access_requests to anon;

drop policy if exists "Public can submit employee access requests" on public.employee_access_requests;
create policy "Public can submit employee access requests"
  on public.employee_access_requests
  for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and assigned_role is null
    and time_clock_enabled = false
    and reviewed_by_user_id is null
    and reviewed_at is null
    and rejection_reason is null
    and (auth_user_id is null or auth_user_id = auth.uid())
  );

drop policy if exists "Requesters can read their own employee access requests" on public.employee_access_requests;
create policy "Requesters can read their own employee access requests"
  on public.employee_access_requests
  for select
  to authenticated
  using (
    auth_user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "Platform admins can manage employee access requests" on public.employee_access_requests;
create policy "Platform admins can manage employee access requests"
  on public.employee_access_requests
  for all
  to authenticated
  using (public.has_platform_admin_role())
  with check (public.has_platform_admin_role());
