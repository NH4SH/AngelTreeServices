-- PR08: normalized visits, crew, job summary, history and pending reminders
-- commit together. Legacy appointments and existing schedule data are retained.
alter table public.schedule_events add column edit_revision integer not null default 1
  check (edit_revision > 0);

create function app_private.guard_schedule_command()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    raise exception 'Use the schedule save command. Refresh the calendar before trying again.' using errcode = '42501';
  end if;
  if tg_table_name = 'schedule_events' and tg_op = 'UPDATE' then
    new.edit_revision := old.edit_revision + 1;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.guard_schedule_command() from public, anon, authenticated, service_role;
create trigger schedule_events_command_boundary before insert or update on public.schedule_events
  for each row execute function app_private.guard_schedule_command();
create trigger schedule_assignments_command_boundary before insert or update or delete on public.schedule_event_assignments
  for each row execute function app_private.guard_schedule_command();

create function app_private.schedule_assignment_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.schedule_events set updated_at = clock_timestamp()
  where id = case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  if tg_op = 'UPDATE' and old.event_id is distinct from new.event_id then
    update public.schedule_events set updated_at = clock_timestamp() where id = old.event_id;
  end if;
  return null;
end;
$$;
revoke all on function app_private.schedule_assignment_revision() from public, anon, authenticated, service_role;
create trigger schedule_assignments_revision after insert or update or delete on public.schedule_event_assignments
  for each row execute function app_private.schedule_assignment_revision();

-- Pending messages for the old schedule cannot remain eligible after a move.
-- Processing/sent messages remain the communications worker's PR14 boundary.
create function app_private.invalidate_schedule_reminders()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
    or new.job_id is distinct from old.job_id or new.service_location_id is distinct from old.service_location_id
    or new.status in ('completed', 'cancelled', 'no_show') then
    update public.customer_communications set status = 'cancelled',cancelled_at=clock_timestamp(),
      last_error=null,processing_started_at=null,skip_reason='Visit changed; review the current schedule.'
    where schedule_event_id = new.id and status = 'pending';
  end if;
  return null;
end;
$$;
revoke all on function app_private.invalidate_schedule_reminders() from public, anon, authenticated, service_role;
create trigger schedule_events_invalidate_reminders after update on public.schedule_events
  for each row execute function app_private.invalidate_schedule_reminders();

create function app_private.normalize_schedule_employees(p_ids uuid[])
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_employee uuid; v_result uuid[] := '{}'::uuid[];
begin
  if p_ids is null or cardinality(p_ids) > 100 then
    raise exception 'Choose a valid crew of no more than 100 employees.' using errcode = '22023';
  end if;
  foreach v_id in array p_ids loop
    select id into v_employee from public.employee_records where id = v_id;
    if v_employee is null then
      select id into v_employee from public.employee_records where auth_user_id = v_id;
    end if;
    if v_employee is null then
      raise exception 'An assigned employee was not found. Review the crew selection.' using errcode = '23503';
    end if;
    v_result := array_append(v_result, v_employee);
  end loop;
  return array(select distinct x from unnest(v_result) as x order by x);
end;
$$;
revoke all on function app_private.normalize_schedule_employees(uuid[]) from public, anon, authenticated, service_role;

-- The row locks serialize overlapping assignments, including two different jobs.
-- This helper is private; callers cannot supply exclusion IDs to bypass checks.
create function app_private.validate_schedule_crew(
  p_ids uuid[], p_type text, p_start timestamptz, p_end timestamptz,
  p_exclude uuid[], p_reason text, p_allow_conflicts boolean
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_employee public.employee_records%rowtype; v_today date;
  v_warnings integer := 0; v_blocking boolean; v_conflict boolean; v_timezone text;
begin
  if length(p_reason)>600 then raise exception 'Keep the override reason within 600 characters.' using errcode='22023'; end if;
  select business_timezone into v_timezone from public.reporting_settings where singleton_key;
  v_today := (clock_timestamp() at time zone coalesce(v_timezone, 'America/New_York'))::date;
  for v_employee in select * from public.employee_records where id = any(p_ids) order by id for update loop
    if not v_employee.is_active or v_employee.archived_at is not null
      or v_employee.employment_status in ('inactive', 'separated', 'leave') then
      raise exception '% is unavailable for scheduling. Choose an active employee.',coalesce(v_employee.preferred_name,v_employee.legal_name,'This employee') using errcode = '23514';
    end if;
    if v_employee.employment_status in ('applicant', 'onboarding') then v_warnings := v_warnings + 1; end if;
    select exists (
      select 1 from public.qualification_requirements r
      where r.is_active and r.requirement_scope = 'job_assignment_role' and r.scope_value = p_type
        and not r.warning_only and not exists (
          select 1 from public.employee_credentials c where c.employee_id = v_employee.id
            and c.credential_type_id = r.credential_type_id and c.status = 'active'
            and c.archived_at is null and (c.expiration_date is null or c.expiration_date >= v_today)
        )
    ) into v_blocking;
    if v_blocking and (nullif(btrim(p_reason), '') is null or not app_private.has_platform_admin_role()) then
      raise exception '% needs a current qualification for this visit. An owner or admin must enter an override reason.',coalesce(v_employee.preferred_name,v_employee.legal_name,'This employee') using errcode = '23514';
    end if;
    if v_blocking or exists (
      select 1 from public.qualification_requirements r
      where r.is_active and r.requirement_scope = 'job_assignment_role' and r.scope_value = p_type
        and r.warning_only and not exists (
          select 1 from public.employee_credentials c where c.employee_id = v_employee.id
            and c.credential_type_id = r.credential_type_id and c.status = 'active'
            and c.archived_at is null and (c.expiration_date is null or c.expiration_date >= v_today)
        )
    ) then v_warnings := v_warnings + 1; end if;
    select exists (
      select 1 from public.schedule_events e join public.schedule_event_assignments a on a.event_id = e.id
      where a.employee_id = v_employee.id and not(e.id = any(p_exclude))
        and e.status in ('scheduled', 'confirmed', 'in_progress')
        and e.starts_at < coalesce(p_end, p_start + interval '1 hour')
        and coalesce(e.ends_at, e.starts_at + interval '1 hour') > p_start
      union all
      select 1 from public.appointments a where
        (a.assigned_employee_id = v_employee.id or a.assigned_user_id = v_employee.auth_user_id)
        and a.status in ('scheduled', 'confirmed', 'in_progress')
        and not exists(select 1 from public.schedule_events e where e.source_appointment_id = a.id)
        and a.starts_at < coalesce(p_end, p_start + interval '1 hour')
        and coalesce(a.ends_at, a.starts_at + interval '1 hour') > p_start
    ) into v_conflict;
    if v_conflict and (not coalesce(p_allow_conflicts,false) or nullif(btrim(p_reason), '') is null
      or not app_private.has_platform_admin_role()) then
      raise exception '% has an overlapping visit on %. Review the calendar; an owner or admin may confirm it with a reason.',coalesce(v_employee.preferred_name,v_employee.legal_name,'This employee'),to_char(p_start at time zone coalesce(v_timezone,'America/New_York'),'YYYY-MM-DD HH24:MI') using errcode = '23P01';
    end if;
    if v_conflict then v_warnings := v_warnings + 1; end if;
  end loop;
  if auth.uid() is null or not app_private.can_manage_schedule_event_type(p_type) then
    raise exception 'You no longer have permission to edit this schedule.' using errcode = '42501';
  end if;
  return v_warnings;
end;
$$;
revoke all on function app_private.validate_schedule_crew(uuid[],text,timestamptz,timestamptz,uuid[],text,boolean) from public, anon, authenticated, service_role;

create function app_private.refresh_job_schedule(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_start timestamptz; v_end timestamptz; v_employee uuid;
begin
  if p_job_id is null then return; end if;
  select count(*), min(starts_at), max(ends_at) into v_count, v_start, v_end
  from public.schedule_events where job_id = p_job_id and event_type = 'job'
    and status in ('scheduled','confirmed','in_progress');
  select a.employee_id into v_employee from public.schedule_events e
    join public.schedule_event_assignments a on a.event_id = e.id
    where e.job_id = p_job_id and e.event_type = 'job' and e.status in ('scheduled','confirmed','in_progress')
    order by e.starts_at, a.employee_id limit 1;
  update public.jobs set scheduled_start_at = v_start, scheduled_end_at = v_end,
    assigned_crew_employee_id = v_employee,
    assigned_crew_user_id = (select auth_user_id from public.employee_records where id=v_employee),
    status = case when v_count > 0 and status = 'accepted' then 'scheduled'
      when v_count = 0 and status = 'scheduled' then 'accepted' else status end
    where id = p_job_id;
end;
$$;
revoke all on function app_private.refresh_job_schedule(uuid) from public, anon, authenticated, service_role;

create function app_private.save_schedule_event_locked(
  p_event_id uuid, p_expected_revision integer, p_event jsonb, p_employee_ids uuid[],
  p_override_reason text, p_allow_conflicts boolean, p_exclude uuid[], p_mode text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old public.schedule_events%rowtype; v_new public.schedule_events%rowtype;
  v_old_ids uuid[]; v_initial_job uuid; v_request uuid; v_replay public.schedule_events%rowtype; v_job public.jobs%rowtype; v_ids uuid[]; v_warnings integer := 0;
begin
  if auth.uid() is null or not app_private.has_schedule_estimator_role() then
    raise exception 'Sign in with schedule management access.' using errcode = '42501';
  end if;
  if p_event is null or jsonb_typeof(p_event) <> 'object' or p_mode not in ('details','time','status') then
    raise exception 'The visit could not be read. Refresh the calendar.' using errcode = '22023';
  end if;
  -- The browser keeps this creation identity through uncertain responses.
  -- A retry acknowledges the saved visit and never replays crew/history edits.
  if p_event_id is null and p_mode='details' then
    v_request := nullif(p_event->>'request_id','')::uuid;
    if v_request is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_request::text,8081));
      select * into v_replay from public.schedule_events where id=v_request;
      if v_replay.id is not null then
        if v_replay.created_by_user_id is distinct from auth.uid()
          or not app_private.can_manage_schedule_event_type(v_replay.event_type) then
          raise exception 'This visit cannot be acknowledged by this account.' using errcode='42501';
        end if;
        return jsonb_build_object('id',v_replay.id,'job_id',v_replay.job_id,'edit_revision',v_replay.edit_revision,'warning_count',0,'replayed',true);
      end if;
    end if;
  end if;
  select job_id into v_initial_job from public.schedule_events where id = p_event_id;
  -- Job before event everywhere, and sorted parents when relinking a visit.
  perform 1 from public.jobs where id in (v_initial_job, nullif(p_event->>'job_id','')::uuid) order by id for update;
  if p_event_id is not null then
    select * into v_old from public.schedule_events where id = p_event_id for update;
    if v_old.id is null then raise exception 'Visit not found.' using errcode = 'P0002'; end if;
    if v_old.job_id is distinct from v_initial_job or p_expected_revision is null or v_old.edit_revision <> p_expected_revision then
      raise exception 'This schedule changed since you opened it. Your entries are still here. Refresh and review the latest schedule before saving.' using errcode = '40001';
    end if;
    if not app_private.can_manage_schedule_event_type(v_old.event_type) then
      raise exception 'You do not have permission to edit this visit.' using errcode = '42501';
    end if;
    v_new := v_old;
  else
    if p_mode <> 'details' then raise exception 'Choose an existing visit.' using errcode = '22023'; end if;
    v_new.id := coalesce(v_request,gen_random_uuid()); v_new.created_by_user_id := auth.uid();
    v_new.status := 'scheduled'; v_new.all_day := false;
    v_new.work_session_group_id := coalesce(nullif(p_event->>'work_session_group_id','')::uuid,gen_random_uuid());
  end if;
  if p_mode = 'details' then
    v_new.title := nullif(btrim(p_event->>'title'),'');
    v_new.description := nullif(p_event->>'description','');
    v_new.event_type := p_event->>'event_type'; v_new.status := p_event->>'status';
    v_new.job_id := nullif(p_event->>'job_id','')::uuid;
    v_new.starts_at := (p_event->>'starts_at')::timestamptz;
    v_new.ends_at := nullif(p_event->>'ends_at','')::timestamptz;
    v_new.all_day := coalesce((p_event->>'all_day')::boolean,false);
    v_new.location_label := nullif(p_event->>'location_label','');
    v_new.calendar_notes := nullif(p_event->>'calendar_notes','');
  elsif p_mode = 'time' then
    if v_old.status not in ('scheduled','confirmed','in_progress') then
      raise exception 'This visit is no longer active. Refresh the calendar.' using errcode = '40001';
    end if;
    v_new.starts_at := (p_event->>'starts_at')::timestamptz;
    v_new.ends_at := (p_event->>'ends_at')::timestamptz; v_new.all_day := false;
  else v_new.status := p_event->>'status';
  end if;
  if not coalesce(app_private.can_manage_schedule_event_type(v_new.event_type),false) then
    raise exception 'You do not have permission to schedule this visit type.' using errcode = '42501';
  end if;
  if v_new.title is null or length(v_new.title) > 140 or v_new.starts_at is null
    or (v_new.ends_at is not null and v_new.ends_at <= v_new.starts_at)
    or length(v_new.description)>5000 or length(v_new.location_label)>240
    or length(v_new.calendar_notes) > 1000 or length(p_override_reason) > 600 then
    raise exception 'Review the visit title, dates, times and notes.' using errcode = '22023';
  end if;
  if v_old.lead_intake_job_id is not null and v_new.job_id is distinct from v_old.job_id then
    raise exception 'A website estimate must stay linked to its original lead.' using errcode = '23514';
  end if;
  if v_new.job_id is not null then
    select * into v_job from public.jobs where id = v_new.job_id;
    if v_job.id is null or v_job.archived_at is not null or v_job.status in ('cancelled','lost') then
      raise exception 'Choose an available work order.' using errcode = '23514';
    end if;
    if not exists(select 1 from public.service_locations l where l.id = v_job.service_location_id and l.archived_at is null
      and ((v_job.customer_id is not null and l.customer_id = v_job.customer_id and l.organization_id is null)
        or (v_job.organization_id is not null and l.organization_id = v_job.organization_id and l.customer_id is null))) then
      raise exception 'The work order property needs review before scheduling.' using errcode = '23514';
    end if;
    if v_old.source_customer_id is not null and v_job.customer_id is distinct from v_old.source_customer_id
      or v_old.source_organization_id is not null and v_job.organization_id is distinct from v_old.source_organization_id then
      raise exception 'The selected work order belongs to another customer.' using errcode = '23514';
    end if;
    v_new.service_location_id := v_job.service_location_id;
  elsif v_old.job_id is not null then v_new.service_location_id := null;
  end if;
  if p_mode = 'details' then v_ids := app_private.normalize_schedule_employees(p_employee_ids);
  else select coalesce(array_agg(employee_id order by employee_id), '{}') into v_ids
    from public.schedule_event_assignments where event_id = p_event_id;
  end if;
  select coalesce(array_agg(employee_id order by employee_id),'{}') into v_old_ids
    from public.schedule_event_assignments where event_id=p_event_id;
  if v_new.status in ('scheduled','confirmed','in_progress') or (p_mode='details' and v_ids is distinct from v_old_ids) then
    v_warnings := app_private.validate_schedule_crew(v_ids,v_new.event_type,
      case when v_new.status in ('scheduled','confirmed','in_progress') then v_new.starts_at else null end,
      case when v_new.status in ('scheduled','confirmed','in_progress') then v_new.ends_at else null end,
      coalesce(p_exclude,'{}') || v_new.id,p_override_reason,p_allow_conflicts);
  end if;
  -- Recheck live authorization after waiting for parent/event/employee locks.
  if not app_private.can_manage_schedule_event_type(v_new.event_type) then
    raise exception 'You no longer have permission to save this visit.' using errcode = '42501';
  end if;
  if p_event_id is null then
    insert into public.schedule_events(id,job_id,service_location_id,title,description,event_type,status,
      starts_at,ends_at,all_day,location_label,calendar_notes,created_by_user_id,work_session_group_id)
    values(v_new.id,v_new.job_id,v_new.service_location_id,v_new.title,v_new.description,v_new.event_type,v_new.status,
      v_new.starts_at,v_new.ends_at,v_new.all_day,v_new.location_label,v_new.calendar_notes,auth.uid(),v_new.work_session_group_id);
  else
    update public.schedule_events set job_id=v_new.job_id, service_location_id=v_new.service_location_id,
      title=v_new.title,description=v_new.description,event_type=v_new.event_type,status=v_new.status,
      starts_at=v_new.starts_at,ends_at=v_new.ends_at,all_day=v_new.all_day,
      location_label=v_new.location_label,calendar_notes=v_new.calendar_notes where id=v_new.id;
  end if;
  if p_mode = 'details' then
    delete from public.schedule_event_assignments where event_id=v_new.id;
    insert into public.schedule_event_assignments(event_id,employee_id,assignment_role)
      select v_new.id,x,case when v_new.event_type='estimate' then 'estimator' else 'assigned' end from unnest(v_ids) as x;
  end if;
  if v_old.event_type='job' then perform app_private.refresh_job_schedule(v_old.job_id); end if;
  if v_new.event_type='job' then perform app_private.refresh_job_schedule(v_new.job_id);
  elsif v_new.event_type='estimate' and v_new.status in ('scheduled','confirmed','in_progress') then
    update public.jobs set status='estimate_scheduled' where id=v_new.job_id and status='new_lead';
  end if;
  insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
    values(auth.uid(),'schedule_event',v_new.id,case when p_event_id is null then 'schedule_event_created' else 'schedule_event_updated' end,
      jsonb_build_object('mode',p_mode,'from_revision',v_old.edit_revision,
        'from_start',v_old.starts_at,'to_start',v_new.starts_at,'from_status',v_old.status,'to_status',v_new.status,
        'assigned_employee_ids',to_jsonb(v_ids),'override_reason',nullif(btrim(p_override_reason),''),'warning_count',v_warnings));
  perform app_private.queue_google_calendar_schedule_event(v_new.id,'atomic_schedule_saved');
  return (select jsonb_build_object('id',id,'job_id',job_id,'edit_revision',edit_revision,'warning_count',v_warnings)
    from public.schedule_events where id=v_new.id);
end;
$$;
revoke all on function app_private.save_schedule_event_locked(uuid,integer,jsonb,uuid[],text,boolean,uuid[],text) from public, anon, authenticated, service_role;

create function public.save_schedule_event(
  p_event_id uuid, p_expected_revision integer, p_event jsonb,
  p_employee_ids uuid[] default '{}', p_override_reason text default null,
  p_allow_conflicts boolean default false, p_mode text default 'details'
) returns jsonb language sql security definer set search_path = '' as $$
  select app_private.save_schedule_event_locked(p_event_id,p_expected_revision,p_event,p_employee_ids,
    p_override_reason,p_allow_conflicts,'{}',p_mode);
$$;
revoke all on function public.save_schedule_event(uuid,integer,jsonb,uuid[],text,boolean,text) from public, anon, authenticated, service_role;
grant execute on function public.save_schedule_event(uuid,integer,jsonb,uuid[],text,boolean,text) to authenticated;

-- A complete displayed active-session snapshot catches changed, added and
-- cancelled workdays. Never replace it with a fresh server-side snapshot.
create function public.save_job_employee_work_sessions(
  p_job_id uuid, p_sessions jsonb, p_mode text, p_expected_snapshot jsonb,
  p_override_reason text default null, p_allow_conflicts boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.jobs%rowtype; v_current jsonb; v_expected jsonb; v_item jsonb;
  v_id uuid; v_ids uuid[]; v_all_ids uuid[]; v_exclude uuid[]; v_retained uuid[] := '{}'::uuid[];
  v_dates date[] := '{}'::date[]; v_date date; v_start time; v_end time; v_start_at timestamptz; v_end_at timestamptz;
  v_timezone text; v_result jsonb; v_count integer; v_group uuid := gen_random_uuid();
begin
  if auth.uid() is null or not app_private.has_schedule_admin_role() then
    raise exception 'Owner or admin schedule access is required.' using errcode='42501';
  end if;
  if p_mode is null or p_mode not in ('replace','add') or jsonb_typeof(p_sessions) is distinct from 'array'
    or jsonb_array_length(p_sessions)>60 or jsonb_typeof(p_expected_snapshot) is distinct from 'array'
    or length(p_override_reason)>600 then
    raise exception 'Refresh and review a valid work schedule before saving.' using errcode='22023';
  end if;
  select * into v_job from public.jobs where id=p_job_id for update;
  if v_job.id is null or v_job.archived_at is not null or v_job.status in ('cancelled','lost') then
    raise exception 'Work order not found or unavailable.' using errcode='23514';
  end if;
  perform 1 from public.schedule_events where job_id=p_job_id and event_type='job' order by id for update;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'edit_revision',edit_revision) order by id),'[]'),
    coalesce(array_agg(id),'{}') into v_current,v_exclude from public.schedule_events
    where job_id=p_job_id and event_type='job' and status in ('scheduled','confirmed','in_progress');
  select coalesce(jsonb_agg(jsonb_build_object('id',(x->>'id')::uuid,'edit_revision',(x->>'edit_revision')::integer)
    order by (x->>'id')::uuid),'[]') into v_expected from jsonb_array_elements(p_expected_snapshot) x;
  if v_current <> v_expected then
    raise exception 'This schedule changed since you opened it. Your entries are still here. Refresh and review the latest schedule before saving.' using errcode='40001';
  end if;
  select coalesce(business_timezone,'America/New_York') into v_timezone from public.reporting_settings where singleton_key;
  v_timezone := coalesce(v_timezone,'America/New_York');
  -- Lock the complete crew in one order before checking any day's overlap.
  select app_private.normalize_schedule_employees(coalesce(array_agg(distinct (u.value)::uuid),'{}')) into v_all_ids
    from jsonb_array_elements(p_sessions) s cross join lateral jsonb_array_elements_text(coalesce(s->'assigned_user_ids','[]')) u;
  perform 1 from public.employee_records where id=any(v_all_ids) order by id for update;
  for v_item in select value from jsonb_array_elements(p_sessions) loop
    v_id := nullif(v_item->>'id','')::uuid;
    if v_id is not null and (not(v_id=any(v_exclude)) or v_id=any(v_retained)) then
      raise exception 'A workday is duplicated or no longer active on this job.' using errcode='40001';
    end if;
    v_date := (v_item->>'date')::date; v_start := (v_item->>'start_time')::time; v_end := (v_item->>'end_time')::time;
    if v_date is null or v_date=any(v_dates) or v_start is null or v_end is null or v_end<=v_start
      or coalesce(v_item->>'status','scheduled') not in ('scheduled','confirmed','in_progress') then
      raise exception 'Use one valid workday per date with an end time after its start.' using errcode='22023';
    end if;
    if p_mode='add' and exists(select 1 from public.schedule_events e where e.job_id=p_job_id and e.event_type='job'
      and e.status in ('scheduled','confirmed','in_progress') and (e.starts_at at time zone v_timezone)::date=v_date
      and e.id is distinct from v_id) then
      raise exception 'This job already has a workday on that date. Edit the existing workday.' using errcode='23514';
    end if;
    v_dates := array_append(v_dates,v_date);
    v_start_at := (v_date+v_start) at time zone v_timezone; v_end_at := (v_date+v_end) at time zone v_timezone;
    if v_start_at at time zone v_timezone <> v_date+v_start or v_end_at at time zone v_timezone <> v_date+v_end
      or v_end_at<=v_start_at then
      raise exception 'This time does not exist on the selected daylight-saving date. Choose another time.' using errcode='22007';
    end if;
    v_ids := app_private.normalize_schedule_employees(array(select value::uuid from jsonb_array_elements_text(coalesce(v_item->'assigned_user_ids','[]'))));
    v_result := app_private.save_schedule_event_locked(v_id,
      (select edit_revision from public.schedule_events where id=v_id),
      jsonb_build_object('job_id',p_job_id,'title',coalesce(initcap(replace(v_job.service_type,'_',' ')),'Scheduled work'),
        'work_session_group_id',v_group,'description',left(v_job.requested_scope,5000),'event_type','job','status',coalesce(v_item->>'status','scheduled'),
        'starts_at',v_start_at,'ends_at',v_end_at,'all_day',false,'calendar_notes',v_item->>'notes'),
      v_ids,p_override_reason,p_allow_conflicts,case when p_mode='replace' then v_exclude else '{}'::uuid[] end,'details');
    v_retained := array_append(v_retained,(v_result->>'id')::uuid);
  end loop;
  if p_mode='replace' then
    update public.schedule_events set status='cancelled' where id=any(v_exclude) and not(id=any(v_retained));
  end if;
  perform app_private.refresh_job_schedule(p_job_id);
  select count(*) into v_count from public.schedule_events where job_id=p_job_id and event_type='job'
    and status in ('scheduled','confirmed','in_progress');
  insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
    values(auth.uid(),'job',p_job_id,case when v_count=0 then 'work_schedule_cleared' else 'work_schedule_updated' end,
      jsonb_build_object('session_count',v_count,'override_reason',nullif(btrim(p_override_reason),'')));
  return jsonb_build_object('job_id',p_job_id,'session_count',v_count,'sessions',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'date',to_char(e.starts_at at time zone v_timezone,'YYYY-MM-DD'),
      'start_time',to_char(e.starts_at at time zone v_timezone,'HH24:MI'),
      'end_time',to_char(e.ends_at at time zone v_timezone,'HH24:MI'),'status',e.status,'notes',coalesce(e.calendar_notes,''),
      'assigned_user_ids',(select coalesce(jsonb_agg(a.employee_id order by a.employee_id),'[]') from public.schedule_event_assignments a where a.event_id=e.id)
    ) order by e.starts_at),'[]') from public.schedule_events e where e.job_id=p_job_id and e.event_type='job' and e.status in ('scheduled','confirmed','in_progress')),
    'snapshot',(
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'edit_revision',edit_revision) order by id),'[]')
    from public.schedule_events where job_id=p_job_id and event_type='job' and status in ('scheduled','confirmed','in_progress')));
end;
$$;
revoke all on function public.save_job_employee_work_sessions(uuid,jsonb,text,jsonb,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.save_job_employee_work_sessions(uuid,jsonb,text,jsonb,text,boolean) to authenticated;
-- Old clients must refresh rather than bypass eligibility or overwrite newer work.
revoke all on function public.save_job_work_sessions(uuid,jsonb,text) from public, anon, authenticated, service_role;
revoke all on function public.save_job_employee_work_sessions(uuid,jsonb,text) from public, anon, authenticated, service_role;

-- Preserve the existing source workflow and save its employee inside the same transaction.
create or replace function public.schedule_lead_estimate(
  p_lead_job_id uuid,
  p_contact_name text,
  p_organization_name text,
  p_phone text,
  p_email text,
  p_street text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_access_notes text,
  p_service_notes text,
  p_service_type text,
  p_requested_scope text,
  p_internal_notes text,
  p_preferred_contact_method text,
  p_preferred_appointment_timing text,
  p_event_title text,
  p_calendar_notes text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_assigned_user_id uuid,
  p_override_reason text default null,
  p_expected_revision integer default null
)
returns table (
  event_id uuid,
  event_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_ids uuid[];
  current_revision integer;
  acting_user_id uuid := (select auth.uid());
  target public.jobs%rowtype;
  existing_event_status text;
  resolved_contact_id uuid;
  resolved_event_id uuid;
  resolved_end_at timestamptz := coalesce(p_ends_at, p_starts_at + interval '1 hour');
  inserted_event boolean := false;
begin
  if acting_user_id is null or not app_private.has_platform_admin_role() then
    raise exception using errcode = '42501', message = 'Only owners and admins can schedule lead estimates.';
  end if;

  if p_starts_at is null or resolved_end_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'Enter a valid estimate start time.';
  end if;

  if nullif(pg_catalog.btrim(p_contact_name), '') is null
    or (nullif(pg_catalog.btrim(p_phone), '') is null and nullif(pg_catalog.btrim(p_email), '') is null)
    or nullif(pg_catalog.btrim(p_street), '') is null
    or nullif(pg_catalog.btrim(p_city), '') is null
    or pg_catalog.length(pg_catalog.btrim(p_state)) <> 2
    or nullif(pg_catalog.btrim(p_service_type), '') is null
    or nullif(pg_catalog.btrim(p_requested_scope), '') is null
    or nullif(pg_catalog.btrim(p_event_title), '') is null
  then
    raise exception using errcode = '22023', message = 'Contact, property, service, scope, title, and estimate time are required.';
  end if;

  select job.*
  into target
  from public.jobs as job
  where job.id = p_lead_job_id
    and job.website_submission_id is not null
    and job.archived_at is null
  for update;

  if target.id is null then
    raise exception using errcode = 'P0002', message = 'Website lead not found or no access.';
  end if;

  if target.status not in ('new_lead', 'estimate_scheduled') then
    raise exception using errcode = '22023', message = 'This lead has already moved beyond estimate scheduling.';
  end if;

  select event.status
  into existing_event_status
  from public.schedule_events as event
  where event.lead_intake_job_id = target.id
  for update;

  select edit_revision into current_revision from public.schedule_events where lead_intake_job_id=target.id;
  if current_revision is not null and current_revision is distinct from p_expected_revision then
    raise exception 'This estimate changed. Refresh the calendar and review the latest visit.' using errcode='40001';
  end if;
  if existing_event_status in ('in_progress', 'completed') then
    raise exception using errcode = '22023', message = 'This estimate has already started or completed.';
  end if;

  if target.customer_id is not null then
    update public.customers as customer
    set
      display_name = pg_catalog.left(pg_catalog.btrim(p_contact_name), 180),
      primary_contact_name = pg_catalog.left(pg_catalog.btrim(p_contact_name), 180),
      phone = nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
      email = nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), '')
    where customer.id = target.customer_id;
  else
    update public.organizations as organization
    set
      name = coalesce(
        nullif(pg_catalog.left(pg_catalog.btrim(p_organization_name), 180), ''),
        organization.name
      ),
      billing_phone = nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
      billing_email = nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), '')
    where organization.id = target.organization_id;

    resolved_contact_id := coalesce(target.onsite_contact_id, target.property_manager_contact_id);
    if resolved_contact_id is null then
      insert into public.organization_contacts (
        organization_id,
        full_name,
        email,
        phone,
        role_title,
        preferred_contact_method,
        contact_roles,
        receives_invoices,
        receives_job_updates
      )
      values (
        target.organization_id,
        pg_catalog.left(pg_catalog.btrim(p_contact_name), 180),
        nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), ''),
        nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
        'Website contact',
        nullif(pg_catalog.left(pg_catalog.btrim(p_preferred_contact_method), 30), ''),
        array['website_lead'],
        false,
        true
      )
      returning id into resolved_contact_id;

      update public.jobs as job
      set
        onsite_contact_id = resolved_contact_id,
        property_manager_contact_id = resolved_contact_id
      where job.id = target.id;
    else
      update public.organization_contacts as contact
      set
        full_name = pg_catalog.left(pg_catalog.btrim(p_contact_name), 180),
        email = nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), ''),
        phone = nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
        preferred_contact_method = nullif(
          pg_catalog.left(pg_catalog.btrim(p_preferred_contact_method), 30),
          ''
        )
      where contact.id = resolved_contact_id
        and contact.organization_id = target.organization_id;
    end if;
  end if;

  update public.service_locations as location
  set
    street = pg_catalog.left(pg_catalog.btrim(p_street), 240),
    city = pg_catalog.left(pg_catalog.btrim(p_city), 120),
    state = pg_catalog.upper(pg_catalog.left(pg_catalog.btrim(p_state), 2)),
    postal_code = nullif(pg_catalog.left(pg_catalog.btrim(p_postal_code), 20), ''),
    access_notes = nullif(pg_catalog.left(pg_catalog.btrim(p_access_notes), 2000), ''),
    service_notes = nullif(pg_catalog.left(pg_catalog.btrim(p_service_notes), 2000), '')
  where location.id = target.service_location_id
    and (
      location.customer_id = target.customer_id
      or location.organization_id = target.organization_id
    );

  if not found then
    raise exception using errcode = '23503', message = 'The lead service location is no longer available.';
  end if;

  update public.jobs as job
  set
    service_type = pg_catalog.left(pg_catalog.btrim(p_service_type), 80),
    requested_scope = pg_catalog.left(pg_catalog.btrim(p_requested_scope), 5000),
    internal_notes = nullif(pg_catalog.left(pg_catalog.btrim(p_internal_notes), 5000), ''),
    preferred_contact_method = nullif(
      pg_catalog.left(pg_catalog.btrim(p_preferred_contact_method), 30),
      ''
    ),
    preferred_appointment_timing = nullif(
      pg_catalog.left(pg_catalog.btrim(p_preferred_appointment_timing), 180),
      ''
    ),
    status = 'estimate_scheduled'
  where job.id = target.id;

  normalized_ids := app_private.normalize_schedule_employees(case when p_assigned_user_id is null then '{}'::uuid[] else array[p_assigned_user_id] end);
  perform app_private.validate_schedule_crew(normalized_ids,'estimate',p_starts_at,resolved_end_at,
    coalesce(array(select id from public.schedule_events where lead_intake_job_id=target.id),'{}'),p_override_reason,false);
  if not app_private.has_platform_admin_role() then raise exception 'Owner or admin access is required.' using errcode='42501'; end if;
  insert into public.schedule_events as existing (
    job_id,
    lead_intake_job_id,
    service_location_id,
    title,
    description,
    event_type,
    status,
    starts_at,
    ends_at,
    all_day,
    location_label,
    calendar_notes,
    created_by_user_id
  )
  values (
    target.id,
    target.id,
    target.service_location_id,
    pg_catalog.left(pg_catalog.btrim(p_event_title), 140),
    pg_catalog.left(pg_catalog.btrim(p_requested_scope), 500),
    'estimate',
    'scheduled',
    p_starts_at,
    resolved_end_at,
    false,
    pg_catalog.left(
      pg_catalog.concat_ws(
        ', ',
        nullif(pg_catalog.btrim(p_street), ''),
        nullif(pg_catalog.btrim(p_city), ''),
        nullif(pg_catalog.btrim(p_state), ''),
        nullif(pg_catalog.btrim(p_postal_code), '')
      ),
      240
    ),
    nullif(pg_catalog.left(pg_catalog.btrim(p_calendar_notes), 1000), ''),
    acting_user_id
  )
  on conflict (lead_intake_job_id) where lead_intake_job_id is not null
  do update set
    job_id = excluded.job_id,
    service_location_id = excluded.service_location_id,
    title = excluded.title,
    description = excluded.description,
    status = case
      when existing.status = 'confirmed' then 'confirmed'
      else 'scheduled'
    end,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    all_day = false,
    location_label = excluded.location_label,
    calendar_notes = excluded.calendar_notes
  returning existing.id, (existing.xmax = 0)
  into resolved_event_id, inserted_event;

  delete from public.schedule_event_assignments as assignment
  where assignment.event_id = resolved_event_id;

  if p_assigned_user_id is not null then
    insert into public.schedule_event_assignments (event_id, employee_id, assignment_role)
    select resolved_event_id,x,'estimator' from unnest(normalized_ids) as x;
  end if;

  insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
    values(auth.uid(),'schedule_event',resolved_event_id,'estimate_schedule_saved',jsonb_build_object('override_reason',nullif(btrim(p_override_reason),'')));
  perform app_private.queue_google_calendar_schedule_event(resolved_event_id,'atomic_estimate_saved');
  event_id := resolved_event_id;
  event_created := inserted_event;
  return next;
end;
$$;
revoke all on function public.schedule_lead_estimate(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,uuid) from public, anon, authenticated, service_role;
revoke all on function public.schedule_lead_estimate(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,uuid,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.schedule_lead_estimate(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,uuid,text,integer) to authenticated;

-- Preserve the existing source workflow and save its employee inside the same transaction.
create or replace function public.schedule_party_estimate(
  p_source_request_key uuid,
  p_customer_id uuid,
  p_organization_id uuid,
  p_contact_id uuid,
  p_service_location_id uuid,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_street text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_access_notes text,
  p_service_notes text,
  p_service_type text,
  p_requested_scope text,
  p_event_title text,
  p_calendar_notes text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_assigned_user_id uuid,
  p_override_reason text default null,
  p_expected_revision integer default null
)
returns table (
  event_id uuid,
  event_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_ids uuid[];
  acting_user_id uuid := (select auth.uid());
  existing public.schedule_events%rowtype;
  resolved_event_id uuid;
  resolved_end_at timestamptz := coalesce(p_ends_at, p_starts_at + interval '1 hour');
  location_owner_valid boolean := false;
  inserted_event boolean := false;
begin
  if acting_user_id is null or not app_private.has_platform_admin_role() then
    raise exception using errcode = '42501', message = 'Only owners and admins can schedule estimates from customer records.';
  end if;

  if p_source_request_key is null
    or (p_customer_id is null) = (p_organization_id is null)
    or p_service_location_id is null
    or p_starts_at is null
    or resolved_end_at <= p_starts_at
  then
    raise exception using errcode = '22023', message = 'Choose one customer or organization, a property, and a valid estimate time.';
  end if;

  if nullif(pg_catalog.btrim(p_contact_name), '') is null
    or (nullif(pg_catalog.btrim(p_phone), '') is null and nullif(pg_catalog.btrim(p_email), '') is null)
    or nullif(pg_catalog.btrim(p_street), '') is null
    or nullif(pg_catalog.btrim(p_city), '') is null
    or pg_catalog.length(pg_catalog.btrim(p_state)) <> 2
    or nullif(pg_catalog.btrim(p_requested_scope), '') is null
    or nullif(pg_catalog.btrim(p_event_title), '') is null
  then
    raise exception using errcode = '22023', message = 'Contact, property, work request, title, and estimate time are required.';
  end if;

  -- Serialize the request key even before the first row exists.
  perform pg_advisory_xact_lock(hashtextextended(p_source_request_key::text, 808));
  select * into existing from public.schedule_events where source_request_key=p_source_request_key for update;
  if existing.id is not null or p_expected_revision is not null then
    raise exception 'This estimate is already scheduled. Open the current calendar visit to make changes.' using errcode='40001';
  end if;
  if p_customer_id is not null then
    update public.customers as customer
    set
      primary_contact_name = pg_catalog.left(pg_catalog.btrim(p_contact_name), 180),
      phone = nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
      email = nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), '')
    where customer.id = p_customer_id
      and customer.archived_at is null;
    if not found then
      raise exception using errcode = 'P0002', message = 'Customer not found or unavailable.';
    end if;
  else
    perform 1
    from public.organizations as organization
    where organization.id = p_organization_id
      and organization.archived_at is null
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Organization not found or unavailable.';
    end if;

    if p_contact_id is not null then
      update public.organization_contacts as contact
      set
        full_name = pg_catalog.left(pg_catalog.btrim(p_contact_name), 180),
        phone = nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
        email = nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), '')
      where contact.id = p_contact_id
        and contact.organization_id = p_organization_id
        and contact.is_active = true;
      if not found then
        raise exception using errcode = '23503', message = 'Choose an active contact for this organization.';
      end if;
    else
      update public.organizations as organization
      set
        billing_phone = nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
        billing_email = nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), '')
      where organization.id = p_organization_id;
    end if;
  end if;

  select (
    (p_customer_id is not null and location.customer_id = p_customer_id and location.organization_id is null)
    or
    (p_organization_id is not null and location.organization_id = p_organization_id and location.customer_id is null)
  )
  into location_owner_valid
  from public.service_locations as location
  where location.id = p_service_location_id
    and location.archived_at is null
  for update;

  if not coalesce(location_owner_valid, false) then
    raise exception using errcode = '23503', message = 'Choose a service location belonging to this customer or organization.';
  end if;

  update public.service_locations as location
  set
    street = pg_catalog.left(pg_catalog.btrim(p_street), 240),
    city = pg_catalog.left(pg_catalog.btrim(p_city), 120),
    state = pg_catalog.upper(pg_catalog.left(pg_catalog.btrim(p_state), 2)),
    postal_code = nullif(pg_catalog.left(pg_catalog.btrim(p_postal_code), 20), ''),
    access_notes = nullif(pg_catalog.left(pg_catalog.btrim(p_access_notes), 2000), ''),
    service_notes = nullif(pg_catalog.left(pg_catalog.btrim(p_service_notes), 2000), '')
  where location.id = p_service_location_id;

  normalized_ids := app_private.normalize_schedule_employees(case when p_assigned_user_id is null then '{}'::uuid[] else array[p_assigned_user_id] end);
  perform app_private.validate_schedule_crew(normalized_ids,'estimate',p_starts_at,resolved_end_at,
    coalesce(array(select id from public.schedule_events where source_request_key=p_source_request_key),'{}'),p_override_reason,false);
  if not app_private.has_platform_admin_role() then raise exception 'Owner or admin access is required.' using errcode='42501'; end if;
  insert into public.schedule_events as current_event (
    job_id,
    service_location_id,
    title,
    description,
    event_type,
    status,
    starts_at,
    ends_at,
    all_day,
    location_label,
    calendar_notes,
    created_by_user_id,
    source_customer_id,
    source_organization_id,
    source_contact_id,
    source_service_type,
    source_request_key
  )
  values (
    null,
    p_service_location_id,
    pg_catalog.left(pg_catalog.btrim(p_event_title), 140),
    pg_catalog.left(pg_catalog.btrim(p_requested_scope), 5000),
    'estimate',
    'scheduled',
    p_starts_at,
    resolved_end_at,
    false,
    pg_catalog.left(
      pg_catalog.concat_ws(', ', p_street, p_city, p_state, p_postal_code),
      240
    ),
    nullif(pg_catalog.left(pg_catalog.btrim(p_calendar_notes), 1000), ''),
    acting_user_id,
    p_customer_id,
    p_organization_id,
    p_contact_id,
    nullif(pg_catalog.left(pg_catalog.btrim(p_service_type), 80), ''),
    p_source_request_key
  )
  on conflict (source_request_key) where source_request_key is not null
  do update set
    service_location_id = excluded.service_location_id,
    title = excluded.title,
    description = excluded.description,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    location_label = excluded.location_label,
    calendar_notes = excluded.calendar_notes,
    source_customer_id = excluded.source_customer_id,
    source_organization_id = excluded.source_organization_id,
    source_contact_id = excluded.source_contact_id,
    source_service_type = excluded.source_service_type
  returning current_event.id, (current_event.xmax = 0)
  into resolved_event_id, inserted_event;

  delete from public.schedule_event_assignments as assignment
  where assignment.event_id = resolved_event_id;

  if p_assigned_user_id is not null then
    insert into public.schedule_event_assignments(event_id, employee_id, assignment_role)
    select resolved_event_id,x,'estimator' from unnest(normalized_ids) as x;
  end if;

  insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
    values(auth.uid(),'schedule_event',resolved_event_id,'estimate_schedule_saved',jsonb_build_object('override_reason',nullif(btrim(p_override_reason),'')));
  perform app_private.queue_google_calendar_schedule_event(resolved_event_id,'atomic_estimate_saved');
  event_id := resolved_event_id;
  event_created := inserted_event;
  return next;
end;
$$;
revoke all on function public.schedule_party_estimate(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,uuid) from public, anon, authenticated, service_role;
revoke all on function public.schedule_party_estimate(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,uuid,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.schedule_party_estimate(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,uuid,text,integer) to authenticated;

-- Compatibility for the existing explicit office completion flow. PR09 still
-- owns whether/when work should be completed; this command changes no job state.
create function public.complete_completed_job_schedule(p_job_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_status text; v_event record; v_count integer := 0;
begin
  if auth.uid() is null or not app_private.has_schedule_estimator_role() then
    raise exception 'Schedule management access is required.' using errcode='42501';
  end if;
  select status into v_status from public.jobs where id=p_job_id for update;
  if v_status is distinct from 'completed' then
    raise exception 'The work order must already be complete.' using errcode='23514';
  end if;
  for v_event in select id,event_type from public.schedule_events where job_id=p_job_id
    and status in ('scheduled','confirmed','in_progress') order by id for update loop
    -- Retain the previous per-type RLS boundary for each office role.
    if app_private.can_manage_schedule_event_type(v_event.event_type) then
      update public.schedule_events set status='completed' where id=v_event.id;
      perform app_private.queue_google_calendar_schedule_event(v_event.id,'job_completed');
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.complete_completed_job_schedule(uuid) from public, anon, authenticated, service_role;
grant execute on function public.complete_completed_job_schedule(uuid) to authenticated;

notify pgrst, 'reload schema';
