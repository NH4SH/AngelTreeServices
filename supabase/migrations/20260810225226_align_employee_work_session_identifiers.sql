-- Record the production-safe employee assignment wrapper in migration history.
-- Scheduling behavior is unchanged; the explicit local names avoid PL/pgSQL
-- ambiguity with schedule_event_assignments.event_id and employee_id.
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
  target_employee_id uuid;
  target_event_id uuid;
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

  business_timezone := coalesce(business_timezone, 'America/New_York');

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

    target_event_id := nullif(session_item ->> 'id', '')::uuid;
    if target_event_id is null then
      select event.id
      into target_event_id
      from public.schedule_events as event
      where event.job_id = p_job_id
        and event.event_type = 'job'
        and event.starts_at = (session_date + session_start) at time zone business_timezone
        and event.ends_at = (session_date + session_end) at time zone business_timezone
      order by event.created_at desc
      limit 1;
    end if;

    delete from public.schedule_event_assignments as assignment
    where assignment.event_id = target_event_id;

    for target_employee_id in
      select distinct selected.value::uuid
      from jsonb_array_elements_text(coalesce(session_item -> 'assigned_user_ids', '[]'::jsonb)) as selected(value)
    loop
      insert into public.schedule_event_assignments(event_id, employee_id, assignment_role)
      values (target_event_id, target_employee_id, 'assigned');
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
