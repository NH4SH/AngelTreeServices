-- Keep assigned-job RLS aligned with the durable employee identifiers used by
-- the normalized multi-day scheduler. Legacy profile assignments remain valid.
create or replace function app_private.is_assigned_to_job(_job_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.jobs as job
    where job.id = _job_id
      and (
        job.assigned_crew_user_id = (select auth.uid())
        or exists (
          select 1
          from public.employee_records as employee
          where employee.id = job.assigned_crew_employee_id
            and employee.auth_user_id = (select auth.uid())
            and employee.is_active = true
            and employee.archived_at is null
        )
        or exists (
          select 1
          from public.schedule_events as event
          join public.schedule_event_assignments as assignment on assignment.event_id = event.id
          left join public.employee_records as employee on employee.id = assignment.employee_id
          where event.job_id = job.id
            and event.event_type = 'job'
            and event.status <> 'cancelled'
            and (
              assignment.user_id = (select auth.uid())
              or (
                employee.auth_user_id = (select auth.uid())
                and employee.is_active = true
                and employee.archived_at is null
              )
            )
        )
      )
  );
$$;

revoke all on function app_private.is_assigned_to_job(uuid) from public, anon;
grant execute on function app_private.is_assigned_to_job(uuid) to authenticated, service_role;

comment on function app_private.is_assigned_to_job(uuid) is
  'Checks legacy profile and durable employee assignments for active job work sessions.';
