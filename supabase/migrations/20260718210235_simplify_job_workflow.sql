-- Simplified office workflow support. The scheduled worker advances only the
-- authoritative active work appointment and never moves closed/billed jobs
-- backward. Draft invoice creation remains an application action.

create or replace function public.advance_scheduled_jobs_to_in_progress()
returns table (advanced_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed_count integer := 0;
begin
  with due_jobs as (
    select job.id as job_id, current_appointment.id as appointment_id,
      current_appointment.starts_at
    from public.jobs as job
    cross join lateral (
      select appointment.id, appointment.starts_at
      from public.appointments as appointment
      where appointment.job_id = job.id
        and appointment.appointment_type in ('job', 'maintenance')
        and appointment.status in ('scheduled', 'confirmed')
      order by appointment.updated_at desc, appointment.created_at desc
      limit 1
    ) as current_appointment
    where job.status in ('accepted', 'scheduled')
      and current_appointment.starts_at <= pg_catalog.now()
      and not exists (
        select 1
        from public.invoices as invoice
        where invoice.job_id = job.id
          and invoice.status in ('sent', 'partially_paid', 'paid', 'overdue')
      )
  ), advanced as (
    update public.jobs as job
    set
      status = 'in_progress',
      started_at = coalesce(job.started_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
    from due_jobs
    where job.id = due_jobs.job_id
      and job.status in ('accepted', 'scheduled')
    returning job.id, due_jobs.appointment_id, due_jobs.starts_at
  ), activity as (
    insert into public.activity_log (
      actor_user_id,
      subject_type,
      subject_id,
      event_type,
      metadata_json
    )
    select
      null,
      'job',
      advanced.id,
      'job_automatically_started',
      pg_catalog.jsonb_build_object(
        'appointment_id', advanced.appointment_id,
        'scheduled_start_at', advanced.starts_at,
        'message', 'Job automatically moved to In progress at scheduled start time.'
      )
    from advanced
    returning 1
  )
  select pg_catalog.count(*)::integer into changed_count from activity;

  return query select changed_count;
end;
$$;

comment on function public.advance_scheduled_jobs_to_in_progress() is
  'Idempotently advances accepted or scheduled jobs using their latest active work appointment.';

revoke all on function public.advance_scheduled_jobs_to_in_progress()
  from public, anon, authenticated, service_role;
grant execute on function public.advance_scheduled_jobs_to_in_progress()
  to service_role;
