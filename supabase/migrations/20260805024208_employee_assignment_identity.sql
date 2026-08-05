-- Make operational employee identity the durable assignment target while
-- retaining profile IDs for authenticated crew access and older integrations.

alter table public.quotes
  add column estimator_employee_id uuid references public.employee_records(id) on delete set null;

alter table public.jobs
  add column assigned_crew_employee_id uuid references public.employee_records(id) on delete set null;

alter table public.appointments
  add column assigned_employee_id uuid references public.employee_records(id) on delete set null;

alter table public.schedule_event_assignments
  drop constraint schedule_event_assignments_pkey,
  alter column user_id drop not null,
  add column id uuid default gen_random_uuid() primary key,
  add column employee_id uuid references public.employee_records(id) on delete restrict;

insert into public.employee_records (
  auth_user_id,
  legal_name,
  preferred_name,
  contact_email,
  contact_phone,
  employment_status,
  manual_review_required
)
select
  profile.id,
  profile.full_name,
  profile.full_name,
  profile.email,
  profile.phone,
  case when profile.status = 'active' then 'active' else 'onboarding' end,
  true
from public.profiles as profile
where exists (
  select 1
  from public.user_roles as membership
  join public.roles as role on role.id = membership.role_id
  where membership.user_id = profile.id
    and role.name in ('owner', 'admin', 'payroll_admin', 'estimator', 'crew')
)
on conflict (auth_user_id) do nothing;

update public.quotes as quote
set estimator_employee_id = employee.id
from public.employee_records as employee
where quote.estimator_user_id = employee.auth_user_id
  and quote.estimator_employee_id is null;

update public.jobs as job
set assigned_crew_employee_id = employee.id
from public.employee_records as employee
where job.assigned_crew_user_id = employee.auth_user_id
  and job.assigned_crew_employee_id is null;

update public.appointments as appointment
set assigned_employee_id = employee.id
from public.employee_records as employee
where appointment.assigned_user_id = employee.auth_user_id
  and appointment.assigned_employee_id is null;

update public.schedule_event_assignments as assignment
set employee_id = employee.id
from public.employee_records as employee
where assignment.user_id = employee.auth_user_id
  and assignment.employee_id is null;

alter table public.schedule_event_assignments
  add constraint schedule_event_assignments_identity_check
  check (employee_id is not null or user_id is not null);

create unique index schedule_event_assignments_event_employee_uidx
  on public.schedule_event_assignments(event_id, employee_id)
  where employee_id is not null;

create unique index schedule_event_assignments_event_user_uidx
  on public.schedule_event_assignments(event_id, user_id)
  where user_id is not null;

create index quotes_estimator_employee_idx
  on public.quotes(estimator_employee_id, created_at desc);

create index jobs_assigned_crew_employee_idx
  on public.jobs(assigned_crew_employee_id, created_at desc);

create index appointments_assigned_employee_idx
  on public.appointments(assigned_employee_id, starts_at);

create index schedule_event_assignments_employee_id_idx
  on public.schedule_event_assignments(employee_id);

create or replace function app_private.sync_employee_assignment_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.employee_id is not null then
    select employee.auth_user_id
    into new.user_id
    from public.employee_records as employee
    where employee.id = new.employee_id;
  elsif new.user_id is not null then
    select employee.id
    into new.employee_id
    from public.employee_records as employee
    where employee.auth_user_id = new.user_id
      and employee.archived_at is null
    limit 1;
  end if;

  return new;
end;
$$;

revoke all on function app_private.sync_employee_assignment_identity() from public, anon, authenticated, service_role;

create trigger schedule_event_assignments_sync_employee_identity
  before insert or update of employee_id, user_id on public.schedule_event_assignments
  for each row execute function app_private.sync_employee_assignment_identity();

create or replace function app_private.sync_quote_estimator_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.estimator_employee_id is distinct from old.estimator_employee_id then
    if new.estimator_employee_id is null then
      new.estimator_user_id := null;
    else
      select employee.auth_user_id into new.estimator_user_id
      from public.employee_records as employee where employee.id = new.estimator_employee_id;
    end if;
  elsif new.estimator_employee_id is not null then
    select employee.auth_user_id
    into new.estimator_user_id
    from public.employee_records as employee
    where employee.id = new.estimator_employee_id;
  elsif new.estimator_user_id is not null then
    select employee.id
    into new.estimator_employee_id
    from public.employee_records as employee
    where employee.auth_user_id = new.estimator_user_id
      and employee.archived_at is null
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function app_private.sync_quote_estimator_identity() from public, anon, authenticated, service_role;

create trigger quotes_sync_estimator_identity
  before insert or update of estimator_employee_id, estimator_user_id on public.quotes
  for each row execute function app_private.sync_quote_estimator_identity();

create or replace function app_private.sync_job_crew_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.assigned_crew_employee_id is distinct from old.assigned_crew_employee_id then
    if new.assigned_crew_employee_id is null then
      new.assigned_crew_user_id := null;
    else
      select employee.auth_user_id into new.assigned_crew_user_id
      from public.employee_records as employee where employee.id = new.assigned_crew_employee_id;
    end if;
  elsif new.assigned_crew_employee_id is not null then
    select employee.auth_user_id
    into new.assigned_crew_user_id
    from public.employee_records as employee
    where employee.id = new.assigned_crew_employee_id;
  elsif new.assigned_crew_user_id is not null then
    select employee.id
    into new.assigned_crew_employee_id
    from public.employee_records as employee
    where employee.auth_user_id = new.assigned_crew_user_id
      and employee.archived_at is null
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function app_private.sync_job_crew_identity() from public, anon, authenticated, service_role;

create trigger jobs_sync_crew_identity
  before insert or update of assigned_crew_employee_id, assigned_crew_user_id on public.jobs
  for each row execute function app_private.sync_job_crew_identity();

create or replace function app_private.sync_appointment_assignee_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.assigned_employee_id is distinct from old.assigned_employee_id then
    if new.assigned_employee_id is null then
      new.assigned_user_id := null;
    else
      select employee.auth_user_id into new.assigned_user_id
      from public.employee_records as employee where employee.id = new.assigned_employee_id;
    end if;
  elsif new.assigned_employee_id is not null then
    select employee.auth_user_id
    into new.assigned_user_id
    from public.employee_records as employee
    where employee.id = new.assigned_employee_id;
  elsif new.assigned_user_id is not null then
    select employee.id
    into new.assigned_employee_id
    from public.employee_records as employee
    where employee.auth_user_id = new.assigned_user_id
      and employee.archived_at is null
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function app_private.sync_appointment_assignee_identity() from public, anon, authenticated, service_role;

create trigger appointments_sync_assignee_identity
  before insert or update of assigned_employee_id, assigned_user_id on public.appointments
  for each row execute function app_private.sync_appointment_assignee_identity();

create or replace function app_private.propagate_employee_auth_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_user_id is not distinct from old.auth_user_id then
    return new;
  end if;

  update public.schedule_event_assignments
  set user_id = new.auth_user_id
  where employee_id = new.id;

  update public.appointments
  set assigned_user_id = new.auth_user_id
  where assigned_employee_id = new.id;

  update public.quotes
  set estimator_user_id = new.auth_user_id
  where estimator_employee_id = new.id;

  update public.jobs
  set assigned_crew_user_id = new.auth_user_id
  where assigned_crew_employee_id = new.id;

  return new;
end;
$$;

revoke all on function app_private.propagate_employee_auth_link() from public, anon, authenticated, service_role;

create trigger employee_records_propagate_auth_link
  after update of auth_user_id on public.employee_records
  for each row execute function app_private.propagate_employee_auth_link();

comment on column public.quotes.estimator_employee_id is
  'Operational estimator identity. estimator_user_id remains the optional linked login for compatibility.';
comment on column public.jobs.assigned_crew_employee_id is
  'Operational primary crew identity. assigned_crew_user_id remains the optional linked login used by crew RLS.';
comment on column public.appointments.assigned_employee_id is
  'Operational assignee identity for legacy appointments; the linked login remains optional.';
comment on column public.schedule_event_assignments.employee_id is
  'Durable operational assignee. user_id is populated only when the employee has a linked platform account.';

create or replace function public.save_job_employee_work_sessions(
  p_job_id uuid,
  p_sessions jsonb,
  p_mode text default 'replace'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_item jsonb;
  employee_id uuid;
  event_id uuid;
  employee_user_ids jsonb;
  legacy_sessions jsonb := '[]'::jsonb;
  result jsonb;
  business_timezone text := 'America/New_York';
  session_date date;
  session_start time;
  session_end time;
begin
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'Work sessions must be supplied as a JSON array.' using errcode = '22023';
  end if;

  select coalesce(settings.business_timezone, 'America/New_York')
  into business_timezone
  from public.reporting_settings as settings
  where settings.singleton_key = true;

  for session_item in select value from jsonb_array_elements(p_sessions)
  loop
    select coalesce(jsonb_agg(employee.auth_user_id), '[]'::jsonb)
    into employee_user_ids
    from jsonb_array_elements_text(coalesce(session_item -> 'assigned_user_ids', '[]'::jsonb)) as selected(value)
    join public.employee_records as employee on employee.id = selected.value::uuid
    where employee.auth_user_id is not null;

    legacy_sessions := legacy_sessions || jsonb_build_array(
      jsonb_set(session_item, '{assigned_user_ids}', employee_user_ids, true)
    );
  end loop;

  result := public.save_job_work_sessions(p_job_id, legacy_sessions, p_mode);

  for session_item in select value from jsonb_array_elements(p_sessions)
  loop
    session_date := (session_item ->> 'date')::date;
    session_start := (session_item ->> 'start_time')::time;
    session_end := (session_item ->> 'end_time')::time;

    event_id := nullif(session_item ->> 'id', '')::uuid;
    if event_id is null then
      select event.id
      into event_id
      from public.schedule_events as event
      where event.job_id = p_job_id
        and event.event_type = 'job'
        and event.starts_at = (session_date + session_start) at time zone business_timezone
        and event.ends_at = (session_date + session_end) at time zone business_timezone
      order by event.created_at desc
      limit 1;
    end if;

    delete from public.schedule_event_assignments as assignment
    where assignment.event_id = event_id;

    for employee_id in
      select distinct value::uuid
      from jsonb_array_elements_text(coalesce(session_item -> 'assigned_user_ids', '[]'::jsonb))
    loop
      insert into public.schedule_event_assignments(event_id, employee_id, assignment_role)
      values (event_id, employee_id, 'assigned');
    end loop;
  end loop;

  update public.jobs as job
  set assigned_crew_employee_id = (
    select assignment.employee_id
    from public.schedule_events as event
    join public.schedule_event_assignments as assignment on assignment.event_id = event.id
    where event.job_id = p_job_id
      and event.event_type = 'job'
      and event.status in ('scheduled', 'confirmed', 'in_progress')
    order by event.starts_at, assignment.created_at, assignment.employee_id
    limit 1
  )
  where job.id = p_job_id;

  return result;
end;
$$;

revoke all on function public.save_job_employee_work_sessions(uuid, jsonb, text) from public, anon;
grant execute on function public.save_job_employee_work_sessions(uuid, jsonb, text) to authenticated, service_role;

comment on function public.save_job_employee_work_sessions(uuid, jsonb, text) is
  'Schedules job work sessions against durable employee records while retaining linked profile IDs for crew access.';
