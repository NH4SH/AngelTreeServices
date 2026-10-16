-- One existing follow-up system; no sends, workers, financial or access-rule changes.
alter table public.follow_up_tasks add column next_action_at timestamptz
  generated always as (coalesce(snoozed_until,due_at)) stored;
create index follow_up_tasks_active_next_action_idx on public.follow_up_tasks(next_action_at,id)
  where status in ('open','in_progress','waiting');

create function app_private.handoff_staff(p_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce(app_private.effective_platform_access(p_user),false) and exists(
    select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
    where ur.user_id=p_user and r.name in ('owner','admin','estimator','payroll_admin'));
$$;
revoke all on function app_private.handoff_staff(uuid) from public,anon,authenticated,service_role;

-- The protected source-quote link is established by the approval command. Job
-- changes create the task before final quote approval, within that same transaction.
-- There is no quote-row trigger: it would invert the established job → quote order.
-- Definer authority is limited to follow-up/audit writes and the private live-role
-- helper. No callable client endpoint can invoke this helper directly.
create function app_private.sync_scheduling_handoff(p_job uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype;q public.quotes%rowtype;t public.follow_up_tasks%rowtype;
  desired text;owner_id uuid;key text:='approved-work-schedule:'||p_job;changed boolean:=false;
begin
  select * into j from public.jobs where id=p_job for update;
  if not found then return null;end if;
  select * into q from public.quotes where id=j.source_quote_id;
  if q.id is null then return null;end if;
  if j.archived_at is not null or j.status in ('cancelled','lost') then desired:='cancelled';
  elsif j.status not in ('accepted','scheduled') or exists(select 1 from public.schedule_events e where e.job_id=j.id and e.event_type='job' and e.status in ('scheduled','confirmed','in_progress','completed'))
    or exists(select 1 from public.appointments a where a.job_id=j.id and a.appointment_type='job' and a.status in ('scheduled','confirmed','in_progress','completed')) then desired:='completed';
  else desired:='open';end if;
  select * into t from public.follow_up_tasks where dedupe_key=key for update;
  if desired<>'open' then
    -- Existing manually added scheduling tasks are resolved too; other callback
    -- types and completed/cancelled history remain untouched.
    for t in select * from public.follow_up_tasks where job_id=j.id and task_type='schedule_approved_work' and status in ('open','in_progress','waiting') order by id for update loop
      update public.follow_up_tasks set status=desired,completed_at=case when desired='completed' then clock_timestamp() end,
        completed_by_user_id=case when desired='completed' then auth.uid() end,snoozed_until=null where id=t.id;
      insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
        values(auth.uid(),case when auth.uid() is null then 'system' else 'staff' end,'follow_up_task',t.id,'scheduling_handoff_resolved',jsonb_build_object('job_id',j.id,'status',desired,'email_sent',false));
    end loop;
    return t.id;
  end if;
  if t.id is null then
    -- Reuse an open manual scheduling handoff rather than adding a duplicate.
    select * into t from public.follow_up_tasks where job_id=j.id and task_type='schedule_approved_work' and status in ('open','in_progress','waiting') order by created_at,id limit 1 for update;
    if found then return t.id;end if;
    owner_id:=case when app_private.handoff_staff(q.estimator_user_id) then q.estimator_user_id
      when app_private.handoff_staff(auth.uid()) then auth.uid() end;
    if owner_id is null then
      select p.id into owner_id from public.profiles p where app_private.handoff_staff(p.id)
        and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=p.id and r.name in ('owner','admin'))
        order by p.created_at,p.id limit 1;
    end if;
    insert into public.follow_up_tasks(customer_id,organization_id,service_location_id,quote_id,job_id,title,description,task_type,due_at,assigned_to_user_id,dedupe_key,created_by_user_id)
      values(j.customer_id,j.organization_id,j.service_location_id,q.id,j.id,'Schedule approved work',
      'Confirm a crew date with the customer and book the work. This task closes when the work is booked.',
      'schedule_approved_work',coalesce(q.approved_at,clock_timestamp()),owner_id,key,auth.uid()) returning * into t;
    changed:=true;
  elsif t.status in ('completed','cancelled') then
    update public.follow_up_tasks set status='open',completed_at=null,completed_by_user_id=null,snoozed_until=null,due_at=clock_timestamp()
      where id=t.id returning * into t;changed:=true;
  end if;
  if changed then
    insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
      values(auth.uid(),case when auth.uid() is null then 'system' else 'staff' end,'follow_up_task',t.id,'scheduling_handoff_opened',jsonb_build_object('job_id',j.id,'quote_id',q.id,'assigned_to_user_id',t.assigned_to_user_id,'email_sent',false));
  end if;
  return t.id;
end $$;
revoke all on function app_private.sync_scheduling_handoff(uuid) from public,anon,authenticated,service_role;

create function app_private.refresh_scheduling_handoff() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.sync_scheduling_handoff(new.id);
  return new;
end $$;
revoke all on function app_private.refresh_scheduling_handoff() from public,anon,authenticated,service_role;
create trigger jobs_scheduling_handoff after insert or update of status,archived_at,source_quote_id,scheduled_start_at,scheduled_end_at on public.jobs
  for each row execute function app_private.refresh_scheduling_handoff();

create function app_private.guard_scheduling_handoff() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op='INSERT' and new.dedupe_key like 'approved-work-schedule:%' then raise exception 'Use the scheduling handoff command' using errcode='42501';end if;
    if tg_op in ('UPDATE','DELETE') and old.dedupe_key like 'approved-work-schedule:%' then
      if tg_op='DELETE' then raise exception 'Scheduling history must be retained' using errcode='42501';end if;
      if new.dedupe_key is distinct from old.dedupe_key or new.job_id is distinct from old.job_id or new.quote_id is distinct from old.quote_id
        or new.task_type is distinct from old.task_type or (new.status is distinct from old.status and (new.status in ('completed','cancelled') or old.status in ('completed','cancelled'))) then
        raise exception 'Book or cancel the work to close its scheduling handoff' using errcode='42501';end if;
    elsif tg_op='UPDATE' and new.dedupe_key like 'approved-work-schedule:%' then raise exception 'Reserved scheduling identity' using errcode='42501';end if;
  end if;
  if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function app_private.guard_scheduling_handoff() from public,anon,authenticated,service_role;
create trigger guard_scheduling_handoff before insert or update or delete on public.follow_up_tasks
  for each row execute function app_private.guard_scheduling_handoff();

create function public.ensure_scheduling_handoff(p_job_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not app_private.has_staff_role() then raise exception 'Office access required' using errcode='42501';end if;
  perform 1 from public.jobs where id=p_job_id for update;
  if not app_private.has_staff_role() then raise exception 'Office access required' using errcode='42501';end if;
  return app_private.sync_scheduling_handoff(p_job_id);
end $$;
revoke all on function public.ensure_scheduling_handoff(uuid) from public,anon,service_role;
grant execute on function public.ensure_scheduling_handoff(uuid) to authenticated;

create function public.update_office_handoff(p_task_id uuid,p_expected_updated_at timestamptz,p_assignee_id uuid,p_snoozed_until timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.follow_up_tasks%rowtype;job_id uuid;
begin
  if auth.uid() is null or not app_private.has_staff_role() then raise exception 'Office access required' using errcode='42501';end if;
  select f.job_id into job_id from public.follow_up_tasks f where f.id=p_task_id;
  if job_id is not null then perform 1 from public.jobs where id=job_id for update;end if;
  select * into t from public.follow_up_tasks where id=p_task_id for update;
  if not app_private.has_staff_role() then raise exception 'Office access required' using errcode='42501';end if;
  if t.id is null or t.status not in ('open','in_progress','waiting') then raise exception 'Refresh this handoff before changing it' using errcode='40001';end if;
  if p_expected_updated_at is null or t.updated_at is distinct from p_expected_updated_at then raise exception 'This handoff changed. Refresh before saving' using errcode='40001';end if;
  if p_assignee_id is not null and not app_private.handoff_staff(p_assignee_id) then raise exception 'Choose an active office account' using errcode='23514';end if;
  if p_snoozed_until is not null and p_snoozed_until<=clock_timestamp() then raise exception 'Choose a future return time' using errcode='22023';end if;
  update public.follow_up_tasks set assigned_to_user_id=p_assignee_id,snoozed_until=p_snoozed_until,
    status=case when p_snoozed_until is not null then 'waiting' when t.status='waiting' then 'open' else t.status end
    where id=t.id returning * into t;
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
    values(auth.uid(),'staff','follow_up_task',t.id,'office_handoff_changed',jsonb_build_object('assigned_to_user_id',p_assignee_id,'snoozed_until',p_snoozed_until,'email_sent',false));
  return jsonb_build_object('id',t.id,'updated_at',t.updated_at);
end $$;
revoke all on function public.update_office_handoff(uuid,timestamptz,uuid,timestamptz) from public,anon,service_role;
grant execute on function public.update_office_handoff(uuid,timestamptz,uuid,timestamptz) to authenticated;

-- A boolean projection lets the invoker view check the full existing access
-- predicate without exposing private employee/access fields or granting clients
-- access to the private helper itself.
create function public.office_handoff_owner_is_active(p_user uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if current_setting('role',true)<>'service_role' and (auth.uid() is null or not app_private.has_staff_role()) then return false;end if;
  return app_private.handoff_staff(p_user);
end $$;
revoke all on function public.office_handoff_owner_is_active(uuid) from public,anon;
grant execute on function public.office_handoff_owner_is_active(uuid) to authenticated,service_role;

create view public.office_follow_up_queue with (security_invoker=true) as
select f.*, coalesce(p.full_name,p.email,'Shared office queue') assigned_label,
  (not public.office_handoff_owner_is_active(f.assigned_to_user_id)) needs_owner,
  coalesce(o.name,c.display_name,'Office handoff') party_label
from public.follow_up_tasks f left join public.profiles p on p.id=f.assigned_to_user_id
  left join public.customers c on c.id=f.customer_id left join public.organizations o on o.id=f.organization_id;
revoke all on public.office_follow_up_queue from public,anon,authenticated,service_role;
grant select on public.office_follow_up_queue to authenticated,service_role;

create view public.office_handoff_staff with (security_invoker=true) as
select p.id,p.full_name,p.email from public.profiles p
where public.office_handoff_owner_is_active(p.id);
revoke all on public.office_handoff_staff from public,anon,authenticated,service_role;
grant select on public.office_handoff_staff to authenticated,service_role;

create view public.approved_work_handoff_gaps with (security_invoker=true) as
select j.id,j.source_quote_id,coalesce(o.name,c.display_name,'Approved work') party_label,q.approved_at
from public.jobs j join public.quotes q on q.id=j.source_quote_id
left join public.customers c on c.id=j.customer_id left join public.organizations o on o.id=j.organization_id
where j.status in ('accepted','scheduled') and j.archived_at is null and q.status='approved' and q.archived_at is null
  and not exists(select 1 from public.schedule_events e where e.job_id=j.id and e.event_type='job' and e.status in ('scheduled','confirmed','in_progress','completed'))
  and not exists(select 1 from public.appointments a where a.job_id=j.id and a.appointment_type='job' and a.status in ('scheduled','confirmed','in_progress','completed'))
  and not exists(select 1 from public.follow_up_tasks f where f.job_id=j.id and f.task_type='schedule_approved_work' and f.status in ('open','in_progress','waiting'));
revoke all on public.approved_work_handoff_gaps from public,anon,authenticated,service_role;
grant select on public.approved_work_handoff_gaps to authenticated,service_role;
notify pgrst,'reload schema';
