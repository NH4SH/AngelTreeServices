-- Normalize job scheduling on the existing schedule_events calendar model.
-- Legacy appointment and job timestamp data is preserved for rollback/reference.

alter table public.schedule_events
  add column if not exists work_session_group_id uuid,
  add column if not exists source_appointment_id uuid references public.appointments(id) on delete set null;

create unique index if not exists schedule_events_source_appointment_uidx
  on public.schedule_events (source_appointment_id)
  where source_appointment_id is not null;

create index if not exists schedule_events_job_work_starts_idx
  on public.schedule_events (job_id, starts_at)
  where event_type = 'job' and status <> 'cancelled';

create index if not exists schedule_events_active_range_idx
  on public.schedule_events (starts_at, ends_at)
  where status in ('scheduled', 'confirmed', 'in_progress');

comment on column public.schedule_events.work_session_group_id is
  'Connects daily work sessions saved together for one job schedule.';
comment on column public.schedule_events.source_appointment_id is
  'Legacy appointment retained as the source of a migrated job work session.';

insert into public.schedule_events (
  job_id,
  service_location_id,
  title,
  description,
  event_type,
  status,
  starts_at,
  ends_at,
  all_day,
  calendar_notes,
  created_by_user_id,
  created_at,
  updated_at,
  work_session_group_id,
  source_appointment_id
)
select
  appointment.job_id,
  appointment.service_location_id,
  coalesce(nullif(job.service_type, ''), 'Scheduled work'),
  job.requested_scope,
  'job',
  appointment.status,
  appointment.starts_at,
  appointment.ends_at,
  false,
  appointment.calendar_notes,
  null,
  appointment.created_at,
  appointment.updated_at,
  gen_random_uuid(),
  appointment.id
from public.appointments as appointment
join public.jobs as job on job.id = appointment.job_id
where appointment.appointment_type = 'job'
on conflict (source_appointment_id) where source_appointment_id is not null do nothing;

insert into public.schedule_event_assignments (event_id, user_id, assignment_role, created_at)
select event.id, appointment.assigned_user_id, 'assigned', appointment.created_at
from public.schedule_events as event
join public.appointments as appointment on appointment.id = event.source_appointment_id
where appointment.assigned_user_id is not null
on conflict (event_id, user_id) do nothing;

insert into public.schedule_events (
  job_id,
  service_location_id,
  title,
  description,
  event_type,
  status,
  starts_at,
  ends_at,
  all_day,
  calendar_notes,
  created_by_user_id,
  work_session_group_id
)
select
  job.id,
  job.service_location_id,
  coalesce(nullif(job.service_type, ''), 'Scheduled work'),
  job.requested_scope,
  'job',
  case when job.status = 'in_progress' then 'in_progress' else 'scheduled' end,
  job.scheduled_start_at,
  job.scheduled_end_at,
  false,
  'Migrated from the work order schedule.',
  null,
  gen_random_uuid()
from public.jobs as job
where job.scheduled_start_at is not null
  and not exists (
    select 1
    from public.schedule_events as existing
    where existing.job_id = job.id and existing.event_type = 'job'
  );

create or replace function public.save_job_work_sessions(
  p_job_id uuid,
  p_sessions jsonb,
  p_mode text default 'replace'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_job record;
  session_item jsonb;
  session_id uuid;
  session_date date;
  session_start time;
  session_end time;
  starts_at_value timestamptz;
  ends_at_value timestamptz;
  session_status text;
  session_notes text;
  session_title text;
  session_group_id uuid := gen_random_uuid();
  business_timezone text := 'America/New_York';
  assigned_user_id uuid;
  retained_ids uuid[] := '{}'::uuid[];
  active_count integer;
  first_start timestamptz;
  last_end timestamptz;
begin
  if not app_private.can_manage_schedule_event_type('job') then
    raise exception 'Owner or admin schedule access is required.' using errcode = '42501';
  end if;

  if p_mode not in ('replace', 'add') then
    raise exception 'Schedule mode must be replace or add.' using errcode = '22023';
  end if;

  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'Work sessions must be supplied as a JSON array.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_sessions) > 60 then
    raise exception 'A job schedule cannot contain more than 60 work sessions.' using errcode = '22023';
  end if;

  select job.id, job.service_location_id, job.service_type, job.requested_scope, job.status
  into target_job
  from public.jobs as job
  where job.id = p_job_id;

  if target_job.id is null then
    raise exception 'Work order was not found or is not available.' using errcode = 'P0002';
  end if;

  select coalesce(settings.business_timezone, 'America/New_York')
  into business_timezone
  from public.reporting_settings as settings
  where settings.singleton_key = true;

  business_timezone := coalesce(business_timezone, 'America/New_York');

  for session_item in select value from jsonb_array_elements(p_sessions)
  loop
    begin
      session_id := nullif(session_item ->> 'id', '')::uuid;
      session_date := (session_item ->> 'date')::date;
      session_start := (session_item ->> 'start_time')::time;
      session_end := (session_item ->> 'end_time')::time;
    exception when others then
      raise exception 'A work session has an invalid date or time.' using errcode = '22007';
    end;

    if session_date is null or session_start is null or session_end is null then
      raise exception 'Each work session requires a date, start time, and end time.' using errcode = '23502';
    end if;

    if session_end <= session_start then
      raise exception 'The work session on % must end after it starts.', session_date using errcode = '22023';
    end if;

    starts_at_value := (session_date + session_start) at time zone business_timezone;
    ends_at_value := (session_date + session_end) at time zone business_timezone;
    session_status := coalesce(nullif(session_item ->> 'status', ''), 'scheduled');
    session_notes := nullif(pg_catalog.btrim(session_item ->> 'notes'), '');
    session_title := coalesce(nullif(pg_catalog.initcap(pg_catalog.replace(target_job.service_type, '_', ' ')), ''), 'Scheduled work');

    if session_status not in ('scheduled', 'confirmed', 'in_progress') then
      raise exception 'Choose a valid active work-session status.' using errcode = '22023';
    end if;

    if session_id is not null then
      update public.schedule_events as event
      set
        service_location_id = target_job.service_location_id,
        title = session_title,
        description = target_job.requested_scope,
        status = session_status,
        starts_at = starts_at_value,
        ends_at = ends_at_value,
        all_day = false,
        calendar_notes = session_notes,
        work_session_group_id = coalesce(event.work_session_group_id, session_group_id)
      where event.id = session_id
        and event.job_id = p_job_id
        and event.event_type = 'job'
      returning event.id into session_id;

      if session_id is null then
        raise exception 'A work session no longer belongs to this job.' using errcode = 'P0002';
      end if;
    else
      insert into public.schedule_events (
        job_id, service_location_id, title, description, event_type, status,
        starts_at, ends_at, all_day, calendar_notes, created_by_user_id,
        work_session_group_id
      ) values (
        p_job_id, target_job.service_location_id, session_title, target_job.requested_scope, 'job', session_status,
        starts_at_value, ends_at_value, false, session_notes, (select auth.uid()),
        session_group_id
      ) returning id into session_id;
    end if;

    retained_ids := pg_catalog.array_append(retained_ids, session_id);

    delete from public.schedule_event_assignments as assignment
    where assignment.event_id = session_id;

    for assigned_user_id in
      select distinct value::uuid
      from jsonb_array_elements_text(coalesce(session_item -> 'assigned_user_ids', '[]'::jsonb))
    loop
      insert into public.schedule_event_assignments (event_id, user_id, assignment_role)
      values (session_id, assigned_user_id, 'assigned');
    end loop;
  end loop;

  if p_mode = 'replace' then
    update public.schedule_events as event
    set status = 'cancelled'
    where event.job_id = p_job_id
      and event.event_type = 'job'
      and event.status in ('scheduled', 'confirmed', 'in_progress')
      and not (event.id = any(retained_ids));
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.min(event.starts_at),
    pg_catalog.max(event.ends_at)
  into active_count, first_start, last_end
  from public.schedule_events as event
  where event.job_id = p_job_id
    and event.event_type = 'job'
    and event.status in ('scheduled', 'confirmed', 'in_progress');

  update public.jobs as job
  set
    scheduled_start_at = first_start,
    scheduled_end_at = last_end,
    assigned_crew_user_id = (
      select assignment.user_id
      from public.schedule_events as event
      join public.schedule_event_assignments as assignment on assignment.event_id = event.id
      where event.job_id = p_job_id
        and event.event_type = 'job'
        and event.status in ('scheduled', 'confirmed', 'in_progress')
      order by event.starts_at, assignment.created_at, assignment.user_id
      limit 1
    ),
    status = case
      when active_count > 0 and job.status = 'accepted' then 'scheduled'
      when active_count = 0 and job.status = 'scheduled' then 'accepted'
      else job.status
    end
  where job.id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'session_count', active_count,
    'first_start', first_start,
    'last_end', last_end
  );
end;
$$;

revoke all on function public.save_job_work_sessions(uuid, jsonb, text) from public, anon;
grant execute on function public.save_job_work_sessions(uuid, jsonb, text) to authenticated, service_role;

comment on function public.save_job_work_sessions(uuid, jsonb, text) is
  'Atomically adds or replaces normalized daily work sessions for one job under schedule RLS.';

-- Crew access historically followed jobs.assigned_crew_user_id. Keep that
-- primary-assignee compatibility while allowing every work-session assignee to
-- read the same narrowly scoped job context.
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
          from public.schedule_events as event
          join public.schedule_event_assignments as assignment on assignment.event_id = event.id
          where event.job_id = job.id
            and event.event_type = 'job'
            and event.status <> 'cancelled'
            and assignment.user_id = (select auth.uid())
        )
      )
  );
$$;

revoke all on function app_private.is_assigned_to_job(uuid) from public, anon;
grant execute on function app_private.is_assigned_to_job(uuid) to authenticated, service_role;

alter policy "Crew can read assigned jobs" on public.jobs
  using (app_private.is_assigned_to_job(id));

alter policy "Crew can read customers for assigned jobs" on public.customers
  using (exists (
    select 1 from public.jobs as job
    where job.customer_id = customers.id
      and app_private.is_assigned_to_job(job.id)
  ));

alter policy "Crew can read locations for assigned jobs" on public.service_locations
  using (exists (
    select 1 from public.jobs as job
    where job.service_location_id = service_locations.id
      and app_private.is_assigned_to_job(job.id)
  ));

alter policy "Crew can read visible notes for assigned jobs" on public.notes
  using (
    visibility in ('crew_visible', 'customer_visible')
    and app_private.is_assigned_to_job(job_id)
  );

alter policy "Crew can read photos for assigned jobs" on public.job_photos
  using (app_private.is_assigned_to_job(job_id));

alter policy "Crew can add photos to assigned jobs" on public.job_photos
  with check (
    uploaded_by_user_id = (select auth.uid())
    and app_private.is_assigned_to_job(job_id)
  );

alter policy "Crew can read organizations for assigned jobs" on public.organizations
  using (exists (
    select 1 from public.jobs as job
    where job.organization_id = organizations.id
      and app_private.is_assigned_to_job(job.id)
  ));

alter policy "Crew can read organization contacts for assigned jobs" on public.organization_contacts
  using (exists (
    select 1 from public.jobs as job
    where job.organization_id = organization_contacts.organization_id
      and app_private.is_assigned_to_job(job.id)
      and organization_contacts.id in (job.onsite_contact_id, job.property_manager_contact_id)
  ));

create or replace function private.can_access_job_photo_object(object_name text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then app_private.has_staff_role()
        or app_private.is_assigned_to_job(split_part(object_name, '/', 1)::uuid)
    else false
  end;
$$;

revoke all on function private.can_access_job_photo_object(text) from public;
grant execute on function private.can_access_job_photo_object(text) to authenticated;

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
    select job.id as job_id, work_session.id as work_session_id, work_session.starts_at
    from public.jobs as job
    cross join lateral (
      select event.id, event.starts_at
      from public.schedule_events as event
      where event.job_id = job.id
        and event.event_type = 'job'
        and event.status in ('scheduled', 'confirmed', 'in_progress')
      order by event.starts_at, event.created_at
      limit 1
    ) as work_session
    where job.status in ('accepted', 'scheduled')
      and work_session.starts_at <= pg_catalog.now()
      and not exists (
        select 1 from public.invoices as invoice
        where invoice.job_id = job.id
          and invoice.status in ('sent', 'partially_paid', 'paid', 'overdue')
      )
  ), advanced as (
    update public.jobs as job
    set status = 'in_progress', started_at = coalesce(job.started_at, pg_catalog.now()), updated_at = pg_catalog.now()
    from due_jobs
    where job.id = due_jobs.job_id and job.status in ('accepted', 'scheduled')
    returning job.id, due_jobs.work_session_id, due_jobs.starts_at
  ), activity as (
    insert into public.activity_log (actor_user_id, subject_type, subject_id, event_type, metadata_json)
    select null, 'job', advanced.id, 'job_automatically_started',
      jsonb_build_object(
        'work_session_id', advanced.work_session_id,
        'scheduled_start_at', advanced.starts_at,
        'message', 'Job automatically moved to In progress at its first scheduled work session.'
      )
    from advanced
    returning 1
  )
  select pg_catalog.count(*)::integer into changed_count from activity;

  return query select changed_count;
end;
$$;

comment on function public.advance_scheduled_jobs_to_in_progress() is
  'Idempotently advances a scheduled job at its first normalized work session without completing it.';

revoke all on function public.advance_scheduled_jobs_to_in_progress() from public, anon, authenticated, service_role;
grant execute on function public.advance_scheduled_jobs_to_in_progress() to service_role;
create or replace view public.job_operations_index
with (security_invoker = true)
as
with job_facts as (
  select
    job.id,
    job.customer_id,
    job.organization_id,
    job.service_location_id,
    job.assigned_crew_user_id,
    job.source_quote_id,
    job.status as job_status,
    job.priority,
    job.service_type,
    job.requested_scope,
    job.updated_at,
    job.created_at,
    customer.display_name as customer_name,
    organization.name as organization_name,
    coalesce(organization.name, customer.display_name, 'Contracting party missing') as contracting_party_name,
    location.street,
    location.city,
    location.state,
    location.postal_code,
    crew.full_name as assigned_crew_name,
    crew.email as assigned_crew_email,
    appointment.id as appointment_id,
    appointment.status as appointment_status,
    appointment.starts_at as appointment_starts_at,
    appointment.ends_at as appointment_ends_at,
    quote.id as quote_id,
    quote.quote_number,
    quote.status as quote_status,
    quote.total_cents as quote_total_cents_unmasked,
    quote.first_line_name as quote_first_line_name,
    quote.line_names as quote_line_names,
    invoice.id as invoice_id,
    invoice.invoice_number,
    invoice.status as invoice_status,
    invoice.total_cents as invoice_total_cents_unmasked,
    invoice.balance_due_cents as invoice_balance_due_cents_unmasked,
    invoice.due_at as invoice_due_at,
    coalesce(change_orders.unbilled_count, 0)::integer as approved_unbilled_change_order_count,
    coalesce(communications.failed_count, 0)::integer as failed_communication_count,
    cancelled_appointment.has_cancelled_appointment,
    case
      when job.service_type is null or job.service_type = 'other' then
        coalesce(
          nullif(quote.first_line_name, ''),
          nullif(pg_catalog.left(pg_catalog.split_part(job.requested_scope, E'\n', 1), 72), ''),
          'Field service work'
        )
      else pg_catalog.initcap(pg_catalog.replace(job.service_type, '_', ' '))
    end as display_title
  from public.jobs as job
  left join public.customers as customer on customer.id = job.customer_id
  left join public.organizations as organization on organization.id = job.organization_id
  left join public.service_locations as location on location.id = job.service_location_id
  left join public.profiles as crew on crew.id = job.assigned_crew_user_id
  left join lateral (
    select
      candidate.id,
      candidate.status,
      candidate.starts_at,
      candidate.ends_at
    from public.schedule_events as candidate
    where candidate.job_id = job.id
      and candidate.event_type = 'job'
      and candidate.status in ('scheduled', 'confirmed', 'in_progress')
    order by
      (candidate.status = 'in_progress') desc,
      (candidate.ends_at is null or candidate.ends_at >= pg_catalog.now()) desc,
      candidate.starts_at,
      candidate.created_at
    limit 1
  ) as appointment on true
  left join lateral (
    select
      candidate.id,
      candidate.quote_number,
      candidate.status,
      candidate.total_cents,
      line_summary.first_line_name,
      line_summary.line_names
    from public.quotes as candidate
    left join lateral (
      select
        (pg_catalog.array_agg(line.name order by line.sort_order, line.created_at))[1] as first_line_name,
        pg_catalog.string_agg(line.name, ' ' order by line.sort_order, line.created_at) as line_names
      from public.quote_line_items as line
      where line.quote_id = candidate.id
    ) as line_summary on true
    where candidate.id = job.source_quote_id or candidate.job_id = job.id
    order by (candidate.id = job.source_quote_id) desc, (candidate.status = 'approved') desc, candidate.created_at desc
    limit 1
  ) as quote on true
  left join lateral (
    select
      candidate.id,
      candidate.invoice_number,
      candidate.status,
      candidate.total_cents,
      candidate.balance_due_cents,
      candidate.due_at
    from public.invoices as candidate
    where candidate.job_id = job.id and candidate.status <> 'void'
    order by candidate.created_at, candidate.id
    limit 1
  ) as invoice on true
  left join lateral (
    select pg_catalog.count(*)::integer as unbilled_count
    from public.change_orders as change_order
    where change_order.job_id = job.id
      and change_order.status = 'approved'
      and change_order.invoice_id is null
  ) as change_orders on true
  left join lateral (
    select pg_catalog.count(*)::integer as failed_count
    from public.customer_communications as communication
    left join public.appointments as related_appointment on related_appointment.id = communication.appointment_id
    left join public.schedule_events as related_event on related_event.id = communication.schedule_event_id
    where communication.status = 'failed'
      and (communication.job_id = job.id or related_appointment.job_id = job.id or related_event.job_id = job.id)
  ) as communications on true
  left join lateral (
    select true as has_cancelled_appointment
    from public.schedule_events as cancelled
    where cancelled.job_id = job.id
      and cancelled.event_type = 'job'
      and cancelled.status = 'cancelled'
    limit 1
  ) as cancelled_appointment on true
), derived as (
  select
    job_facts.*,
    case
      when invoice_status = 'paid' or job_status = 'paid' then 'paid'
      when invoice_status in ('sent', 'partially_paid', 'overdue') or job_status = 'invoiced' then 'invoiced'
      when job_status in ('cancelled', 'lost') then 'cancelled'
      when job_status in ('completed', 'completed_pending_review', 'ready_to_invoice') then 'work_complete'
      when job_status = 'returned_for_correction' then 'needs_attention'
      when job_status = 'in_progress' or appointment_status = 'in_progress' then 'in_progress'
      when appointment_starts_at is not null and appointment_starts_at <= pg_catalog.now() then 'in_progress'
      when appointment_starts_at is not null then 'scheduled'
      else 'to_be_scheduled'
    end as operational_state
  from job_facts
)
select
  derived.id,
  derived.customer_id,
  derived.organization_id,
  derived.service_location_id,
  derived.assigned_crew_user_id,
  derived.source_quote_id,
  derived.job_status,
  derived.operational_state,
  derived.priority,
  derived.service_type,
  derived.display_title,
  derived.requested_scope,
  derived.contracting_party_name,
  derived.customer_name,
  derived.organization_name,
  derived.street,
  derived.city,
  derived.state,
  derived.postal_code,
  derived.assigned_crew_name,
  derived.assigned_crew_email,
  derived.appointment_id,
  derived.appointment_status,
  derived.appointment_starts_at,
  derived.appointment_ends_at,
  (derived.appointment_starts_at at time zone 'America/New_York')::date as appointment_local_date,
  derived.quote_id,
  derived.quote_number,
  derived.quote_status,
  case when app_private.has_financial_reporting_role() then derived.quote_total_cents_unmasked else null end as quote_total_cents,
  derived.invoice_id,
  derived.invoice_number,
  derived.invoice_status,
  case when app_private.has_financial_reporting_role() then derived.invoice_total_cents_unmasked else null end as invoice_total_cents,
  case when app_private.has_financial_reporting_role() then derived.invoice_balance_due_cents_unmasked else null end as invoice_balance_due_cents,
  derived.invoice_due_at,
  derived.approved_unbilled_change_order_count,
  derived.failed_communication_count,
  coalesce(derived.has_cancelled_appointment, false) as has_cancelled_appointment,
  coalesce((
    derived.job_status = 'returned_for_correction'
    or derived.customer_id is null and derived.organization_id is null
    or derived.service_location_id is null
    or derived.failed_communication_count > 0
    or derived.approved_unbilled_change_order_count > 0
    or derived.invoice_status = 'overdue'
    or (
      coalesce(derived.has_cancelled_appointment, false)
      and derived.operational_state in ('to_be_scheduled', 'scheduled', 'in_progress')
      and derived.appointment_id is null
    )
  ), false) as needs_attention,
  (derived.appointment_starts_at at time zone 'America/New_York')::date = (pg_catalog.now() at time zone 'America/New_York')::date as is_today,
  (
    derived.invoice_status in ('draft', 'sent', 'partially_paid', 'overdue')
    or derived.job_status in ('completed', 'completed_pending_review', 'ready_to_invoice') and derived.invoice_id is null
    or derived.approved_unbilled_change_order_count > 0
  ) as is_billing,
  (
    derived.job_status in ('completed', 'completed_pending_review', 'ready_to_invoice')
    and derived.invoice_id is null
  ) as awaiting_invoice,
  case
    when derived.operational_state = 'in_progress' then 10
    when (derived.appointment_starts_at at time zone 'America/New_York')::date = (pg_catalog.now() at time zone 'America/New_York')::date then 20
    when derived.appointment_starts_at < pg_catalog.now() then 30
    when derived.job_status = 'returned_for_correction' then 35
    when derived.operational_state = 'to_be_scheduled' then 40
    when derived.operational_state = 'scheduled' then 50
    when derived.job_status in ('completed', 'completed_pending_review', 'ready_to_invoice') and derived.invoice_id is null then 60
    else 90
  end as action_rank,
  pg_catalog.lower(pg_catalog.concat_ws(
    ' ',
    derived.contracting_party_name,
    derived.street,
    derived.city,
    derived.state,
    derived.postal_code,
    derived.display_title,
    derived.service_type,
    derived.requested_scope,
    derived.quote_number,
    derived.quote_line_names,
    derived.invoice_number
  )) as search_text,
  derived.updated_at,
  derived.created_at
from derived;

comment on view public.job_operations_index is
  'RLS-aware operations read model using normalized daily job work sessions.';

revoke all on table public.job_operations_index from public, anon;
grant select on table public.job_operations_index to authenticated, service_role;
