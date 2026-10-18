-- Complete the remaining legacy save boundary without migrating/deleting visits.
alter table public.appointments
  add column edit_revision integer not null default 1 check (edit_revision > 0),
  -- Retained request actor identity, not another ambiguous profiles relation.
  add column created_by_user_id uuid,
  add column creation_request_hash text;

create function app_private.guard_legacy_appointment_command() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('authenticated','anon') then
    raise exception 'Use the appointment save command. Refresh the calendar before trying again.' using errcode='42501';
  end if;
  if tg_op='UPDATE' then new.edit_revision:=old.edit_revision+1;end if;
  if tg_op='DELETE' then return old;end if;
  return new;
end $$;
revoke all on function app_private.guard_legacy_appointment_command() from public,anon,authenticated,service_role;
create trigger appointments_command_boundary before insert or update or delete on public.appointments
  for each row execute function app_private.guard_legacy_appointment_command();

create function public.save_legacy_appointment(
  p_appointment_id uuid,p_job_id uuid,p_expected_revision integer,p_values jsonb,
  p_mode text default 'details',p_override_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();j public.jobs%rowtype;a public.appointments%rowtype;old_a public.appointments%rowtype;
  employee public.employee_records%rowtype;employee_id uuid;ids uuid[];
  kind text;state text;start_time timestamptz;end_time timestamptz;notes text;request_hash text;
  warnings integer:=0;missing integer:=0;blocking boolean:=false;today date;next_job_status text;
begin
  -- Preserve legacy office permissions, including estimator and payroll access.
  if actor is null or not app_private.has_staff_role() then raise exception 'Office access required.' using errcode='42501';end if;
  if p_mode is null or p_mode not in ('create','details','status') or p_appointment_id is null or p_job_id is null
    or jsonb_typeof(p_values) is distinct from 'object' or length(coalesce(p_override_reason,''))>600 then
    raise exception 'Review the appointment fields before saving.' using errcode='22023';end if;
  if exists(select 1 from jsonb_object_keys(p_values) k where k not in ('appointment_type','starts_at','ends_at','assigned_id','calendar_notes','status')) then
    raise exception 'Review the appointment fields before saving.' using errcode='22023';end if;
  -- Same parent-first order as PR08/09/15; no appointment trigger locks a job.
  select * into j from public.jobs where id=p_job_id for update;
  if j.id is null then raise exception 'Work order not found or no access.' using errcode='42501';end if;
  select * into a from public.appointments where id=p_appointment_id for update;
  if not app_private.has_staff_role() then raise exception 'Office access required.' using errcode='42501';end if;
  if a.id is not null and a.job_id is distinct from j.id then
    raise exception 'This appointment changed. Refresh the calendar.' using errcode='40001';end if;
  if p_mode='create' then
    request_hash:=encode(sha256(convert_to(jsonb_build_object('job_id',p_job_id,'values',p_values,'reason',nullif(btrim(p_override_reason),''))::text,'UTF8')),'hex');
    if a.id is not null then
      if a.created_by_user_id is distinct from actor or a.creation_request_hash is distinct from request_hash then
        raise exception 'This appointment request was already used. Review the calendar before adding another.' using errcode='40001';end if;
      return jsonb_build_object('id',a.id,'revision',a.edit_revision,'replayed',true,'warning_count',0);
    end if;
    kind:=p_values->>'appointment_type';state:='scheduled';
    if kind is null or kind not in ('estimate','job','follow_up','maintenance') then raise exception 'Choose an available appointment type.' using errcode='22023';end if;
  else
    if a.id is null or p_expected_revision is null or a.edit_revision<>p_expected_revision then
      raise exception 'This appointment changed. Refresh before saving; your changes have not been applied.' using errcode='40001';end if;
    old_a:=a;kind:=a.appointment_type;state:=a.status;
    if p_mode='status' then state:=p_values->>'status';end if;
  end if;
  if state is null or state not in ('scheduled','confirmed','in_progress','completed','cancelled','no_show') then
    raise exception 'Choose a valid appointment status.' using errcode='22023';end if;
  if p_mode='status' then
    start_time:=a.starts_at;end_time:=a.ends_at;notes:=a.calendar_notes;employee_id:=a.assigned_employee_id;
  else
    start_time:=(p_values->>'starts_at')::timestamptz;end_time:=nullif(p_values->>'ends_at','')::timestamptz;
    notes:=nullif(btrim(p_values->>'calendar_notes'),'');
    if start_time is null or not isfinite(start_time) or (end_time is not null and (not isfinite(end_time) or end_time<=start_time))
      or length(coalesce(notes,''))>1000 then raise exception 'Choose a valid start, end, and notes.' using errcode='22023';end if;
    if nullif(p_values->>'assigned_id','') is not null then
      ids:=app_private.normalize_schedule_employees(array[(p_values->>'assigned_id')::uuid]);employee_id:=ids[1];
    end if;
  end if;
  if state in ('scheduled','confirmed','in_progress')
    and (j.archived_at is not null or j.status in ('cancelled','lost') or (kind in ('job','maintenance') and j.status='completed')) then
    raise exception 'Review or reopen this work order before scheduling another active visit.' using errcode='23514';end if;
  -- Historical closed assignments are retained; new/active assignments use durable
  -- employee state, independently of onboarding progress and CRM login access.
  if employee_id is not null and (state in ('scheduled','confirmed','in_progress') or employee_id is distinct from old_a.assigned_employee_id) then
    select * into employee from public.employee_records where id=employee_id for update;
    if employee.id is null or not employee.is_active or employee.archived_at is not null or employee.employment_status in ('inactive','separated','leave') then
      raise exception 'Choose an active employee for this appointment.' using errcode='23514';end if;
    if employee.employment_status in ('applicant','onboarding') then warnings:=warnings+1;end if;
    select (clock_timestamp() at time zone coalesce(business_timezone,'America/New_York'))::date into today from public.reporting_settings where singleton_key;
    select count(*),coalesce(bool_or(not r.warning_only),false) into missing,blocking
    from public.qualification_requirements r where r.is_active and r.requirement_scope='job_assignment_role' and r.scope_value=kind
      and not exists(select 1 from public.employee_credentials c where c.employee_id=employee.id and c.credential_type_id=r.credential_type_id
        and c.status='active' and c.archived_at is null and (c.expiration_date is null or c.expiration_date>=today));
    if blocking and (nullif(btrim(p_override_reason),'') is null or not app_private.has_platform_admin_role()) then
      raise exception 'An owner or admin must review the missing qualification and enter an override reason.' using errcode='23514';end if;
    warnings:=warnings+missing;
  end if;
  -- Recheck issued-token authorization after all potentially blocking row locks.
  if not app_private.has_staff_role() then raise exception 'Office access required.' using errcode='42501';end if;
  if p_mode='create' then
    insert into public.appointments(id,job_id,service_location_id,appointment_type,status,starts_at,ends_at,calendar_notes,assigned_employee_id,created_by_user_id,creation_request_hash)
      values(p_appointment_id,j.id,j.service_location_id,kind,state,start_time,end_time,notes,employee_id,actor,request_hash) returning * into a;
    next_job_status:=case when kind='estimate' and j.status='new_lead' then 'estimate_scheduled' when kind='job' and j.status='accepted' then 'scheduled' end;
    if next_job_status is not null then
      update public.jobs set status=next_job_status where id=j.id;
      insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
        values(actor,'staff','job',j.id,case when next_job_status='scheduled' then 'work_order_scheduled' else 'estimate_scheduled' end,jsonb_build_object('appointment_id',a.id));
    end if;
  else
    update public.appointments set status=state,starts_at=start_time,ends_at=end_time,calendar_notes=notes,
      assigned_employee_id=employee_id where id=a.id returning * into a;
    if a.starts_at is distinct from old_a.starts_at or a.ends_at is distinct from old_a.ends_at or a.status in ('completed','cancelled','no_show') then
      update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),processing_started_at=null,last_error=null,
        skip_reason='Appointment changed; review the current schedule.' where appointment_id=a.id and status='pending';
    end if;
  end if;
  if warnings>0 then
    insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
      values(actor,'staff','appointment',a.id,case when nullif(btrim(p_override_reason),'') is null then 'employee_qualification_warning' else 'employee_qualification_override' end,
        jsonb_build_object('assigned_employee_id',employee_id,'reason',p_override_reason,'warning_count',warnings));
  end if;
  perform app_private.sync_scheduling_handoff(j.id);
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
    values(actor,'staff','appointment',a.id,'legacy_appointment_'||p_mode,
      jsonb_build_object('job_id',j.id,'status',a.status,'revision',a.edit_revision,'customer_email_sent',false));
  return jsonb_build_object('id',a.id,'revision',a.edit_revision,'replayed',false,'warning_count',warnings);
end $$;
revoke all on function public.save_legacy_appointment(uuid,uuid,integer,jsonb,text,text) from public,anon,service_role;
grant execute on function public.save_legacy_appointment(uuid,uuid,integer,jsonb,text,text) to authenticated;
