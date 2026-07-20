-- Local-only multi-day scheduling verification.
-- Usage:
-- psql "$LOCAL_DB_URL" -v owner_id='<owner auth uuid>' -v crew_id='<crew auth uuid>' \
--   -f supabase/verification/multi_day_job_scheduling.sql
-- The transaction is always rolled back and must never be run in production.

\set ON_ERROR_STOP on

begin;

insert into public.roles (name, description)
values ('owner', 'Local scheduling fixture owner'), ('crew', 'Local scheduling fixture crew')
on conflict (name) do nothing;

insert into public.user_roles (user_id, role_id)
select :'owner_id'::uuid, role.id from public.roles as role where role.name = 'owner'
on conflict do nothing;

insert into public.user_roles (user_id, role_id)
select :'crew_id'::uuid, role.id from public.roles as role where role.name = 'crew'
on conflict do nothing;

create temporary table schedule_fixture (job_id uuid primary key, crew_id uuid not null);
grant select, insert, update, delete on table schedule_fixture to authenticated;
grant select, insert, update, delete on table schedule_fixture to service_role;

with customer as (
  insert into public.customers (display_name, customer_type, email)
  values ('Multi-day Schedule Fixture', 'residential', 'schedule-fixture@example.test')
  returning id
), location as (
  insert into public.service_locations (customer_id, label, street, city, state, postal_code)
  select id, 'Primary service location', '100 Test Lane', 'Fredericksburg', 'VA', '22401'
  from customer
  returning id, customer_id
), job as (
  insert into public.jobs (customer_id, service_location_id, status, service_type, requested_scope)
  select customer_id, id, 'accepted', 'tree_removal', 'Verify normalized multi-day scheduling.'
  from location
  returning id
)
insert into schedule_fixture (job_id, crew_id) select id, :'crew_id'::uuid from job;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', :'owner_id', true);
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

select public.save_job_work_sessions(
  (select job_id from schedule_fixture),
  jsonb_build_array(
    jsonb_build_object('date', '2026-10-30', 'start_time', '08:00', 'end_time', '16:00', 'assigned_user_ids', jsonb_build_array(:'crew_id'), 'status', 'scheduled'),
    jsonb_build_object('date', '2026-11-02', 'start_time', '08:00', 'end_time', '16:00', 'assigned_user_ids', jsonb_build_array(:'crew_id'), 'status', 'scheduled'),
    jsonb_build_object('date', '2026-11-04', 'start_time', '08:00', 'end_time', '13:00', 'assigned_user_ids', jsonb_build_array(:'crew_id'), 'status', 'confirmed')
  ),
  'replace'
);

do $$
declare
  target_job uuid := (select job_id from schedule_fixture);
begin
  if (select pg_catalog.count(*) from public.schedule_events where job_id = target_job and event_type = 'job' and status <> 'cancelled') <> 3 then
    raise exception 'Expected three active work sessions.';
  end if;
  if (select assigned_crew_user_id from public.jobs where id = target_job) is distinct from (select crew_id from schedule_fixture) then
    raise exception 'Legacy primary crew assignment was not synchronized.';
  end if;
  if (select status from public.jobs where id = target_job) <> 'scheduled' then
    raise exception 'Accepted job did not transition to Scheduled.';
  end if;
  if exists (
    select 1 from public.schedule_events
    where job_id = target_job
      and (starts_at at time zone 'America/New_York')::date not in ('2026-10-30'::date, '2026-11-02'::date, '2026-11-04'::date)
  ) then
    raise exception 'A selected local date changed during timezone conversion.';
  end if;
end $$;

select public.save_job_work_sessions(
  (select job_id from schedule_fixture),
  (
    select jsonb_agg(jsonb_build_object(
      'id', event.id,
      'date', to_char(event.starts_at at time zone 'America/New_York', 'YYYY-MM-DD'),
      'start_time', to_char(event.starts_at at time zone 'America/New_York', 'HH24:MI'),
      'end_time', case when (event.starts_at at time zone 'America/New_York')::date = '2026-11-04'::date then '14:00' else to_char(event.ends_at at time zone 'America/New_York', 'HH24:MI') end,
      'assigned_user_ids', jsonb_build_array(:'crew_id'),
      'status', event.status
    ) order by event.starts_at)
    from public.schedule_events as event
    where event.job_id = (select job_id from schedule_fixture)
      and event.event_type = 'job'
      and event.status <> 'cancelled'
      and (event.starts_at at time zone 'America/New_York')::date <> '2026-11-02'::date
  ),
  'replace'
);

do $$
declare
  target_job uuid := (select job_id from schedule_fixture);
begin
  if (select pg_catalog.count(*) from public.schedule_events where job_id = target_job and event_type = 'job' and status <> 'cancelled') <> 2 then
    raise exception 'Removing one workday changed the wrong sessions.';
  end if;
  if (select pg_catalog.count(*) from public.schedule_events where job_id = target_job and event_type = 'job' and status = 'cancelled') <> 1 then
    raise exception 'Removed workday was not retained as cancelled history.';
  end if;
end $$;

reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', :'crew_id', true);
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if not exists (select 1 from public.jobs where id = (select job_id from schedule_fixture)) then
    raise exception 'Assigned crew could not read the work order through RLS.';
  end if;
end $$;

reset role;
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.sub', :'owner_id', true);
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

update public.schedule_events
set starts_at = pg_catalog.now() - interval '1 hour', ends_at = pg_catalog.now() + interval '7 hours'
where id = (
  select id from public.schedule_events
  where job_id = (select job_id from schedule_fixture) and status <> 'cancelled'
  order by starts_at limit 1
);

select * from public.advance_scheduled_jobs_to_in_progress();
select * from public.advance_scheduled_jobs_to_in_progress();

do $$
begin
  if (select status from public.jobs where id = (select job_id from schedule_fixture)) <> 'in_progress' then
    raise exception 'First due session did not transition the job to In progress.';
  end if;
  if (select status from public.jobs where id = (select job_id from schedule_fixture)) in ('completed', 'ready_to_invoice') then
    raise exception 'A work session automatically completed the job.';
  end if;
end $$;

rollback;
