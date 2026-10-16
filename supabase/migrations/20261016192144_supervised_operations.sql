-- Selected, supervised review; preserve the original generator and Calendar outbox.
create or replace function public.generate_due_recurring_occurrences(p_limit integer, p_location_ids uuid[])
returns table (created_count integer, existing_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  row_item record;
  generated_id uuid;
  inserted_rows integer := 0;
  existing_rows integer := 0;
  acting_user_id uuid := (select auth.uid());
  generation_enabled boolean;
  business_timezone text;
  business_date date;
begin
  if acting_user_id is not null and not app_private.has_staff_role() then
    raise exception 'Only staff or the service worker can generate recurring occurrences.';
  end if;
  select automated_generation_enabled, settings.business_timezone
    into generation_enabled, business_timezone
  from public.recurring_service_settings settings where singleton_key;
  business_date := pg_catalog.timezone(
    coalesce(business_timezone, 'America/New_York'),
    pg_catalog.now()
  )::date;
  if acting_user_id is null and not coalesce(generation_enabled, false) then
    return query select 0, 0;
    return;
  end if;

  for row_item in
    select p.*, l.id as location_row_id, l.service_location_id, l.next_service_due_date,
      l.next_review_date, l.state as location_state
    from public.recurring_service_plans p
    join public.recurring_plan_locations l on l.recurring_plan_id = p.id
    join public.service_locations sl on sl.id = l.service_location_id
    left join public.customers c on c.id = p.customer_id
    left join public.organizations o on o.id = p.organization_id
    where p.state = 'active'
      and l.state = 'active'
      and (p_location_ids is null or l.id = any(p_location_ids))
      and (c.id is null or c.status = 'active')
      and (o.id is null or o.status = 'active')
      and l.next_service_due_date <= business_date + p.planning_window_days
    order by l.next_service_due_date
    limit greatest(1, least(p_limit, 500))
    for update of l skip locked
  loop
    insert into public.recurring_service_occurrences (
      recurring_plan_id, recurring_plan_location_id, service_location_id,
      occurrence_key, target_service_date, target_window_start, target_window_end,
      status, prior_quote_id, prior_work_order_id, authorization_mode_snapshot,
      authorization_reference_snapshot, approved_price_cents_snapshot,
      pricing_review_status, created_by_user_id
    ) values (
      row_item.id, row_item.location_row_id, row_item.service_location_id,
      row_item.id::text || ':' || row_item.service_location_id::text || ':' || row_item.next_service_due_date::text,
      row_item.next_service_due_date, row_item.next_service_due_date, row_item.next_service_due_date,
      'review_needed', row_item.source_quote_id, row_item.source_job_id,
      row_item.authorization_mode, row_item.agreement_reference, row_item.approved_price_cents,
      case when row_item.authorization_mode = 'existing_agreement' then 'not_applicable' else 'required' end,
      acting_user_id
    )
    on conflict (occurrence_key) do nothing
    returning id into generated_id;

    if generated_id is null then
      existing_rows := existing_rows + 1;
    else
      inserted_rows := inserted_rows + 1;
      insert into public.follow_up_tasks (
        customer_id, organization_id, service_location_id, recurring_plan_id,
        recurring_occurrence_id, title, description, task_type, due_at, priority,
        assigned_to_user_id, dedupe_key, created_by_user_id
      ) values (
        row_item.customer_id, row_item.organization_id, row_item.service_location_id, row_item.id,
        generated_id, 'Review renewal: ' || row_item.plan_name,
        'Review scope, contacts, property status, and current pricing before creating work.',
        'renew_service', (greatest(business_date, row_item.next_service_due_date - row_item.quote_lead_days)::timestamp at time zone coalesce(business_timezone, 'America/New_York')),
        'normal', null,
        'renewal-review:' || generated_id::text, acting_user_id
      ) on conflict (dedupe_key) do nothing;
      insert into public.activity_log (actor_user_id, subject_type, subject_id, event_type, metadata_json)
      values (acting_user_id, 'recurring_occurrence', generated_id, 'renewal_opportunity_created',
        pg_catalog.jsonb_build_object('plan_id', row_item.id, 'service_location_id', row_item.service_location_id));
    end if;
    generated_id := null;
  end loop;

  return query select inserted_rows, existing_rows;
end;
$$;

-- Read-only, bounded by the caller. Existing cycles are identified rather than
-- replayed; plan/location versions and business date fence the approval.
create view public.recurring_generation_preview with (security_invoker=true) as
select l.id,l.recurring_plan_id,p.plan_name,coalesce(o.name,c.display_name,'Customer') party_label,
 coalesce(nullif(sl.label,''),sl.street) property_label,l.next_service_due_date,
 p.authorization_mode, s.business_timezone,
 md5(jsonb_build_array(to_jsonb(p),to_jsonb(l),sl.updated_at,c.updated_at,o.updated_at,
   s.updated_at,timezone(s.business_timezone,now())::date)::text) version,
 exists(select 1 from public.recurring_service_occurrences x where x.occurrence_key=p.id::text||':'||l.service_location_id::text||':'||l.next_service_due_date::text) already_generated
from public.recurring_plan_locations l join public.recurring_service_plans p on p.id=l.recurring_plan_id
join public.service_locations sl on sl.id=l.service_location_id
cross join public.recurring_service_settings s
left join public.customers c on c.id=p.customer_id left join public.organizations o on o.id=p.organization_id
where p.state='active' and l.state='active' and sl.archived_at is null
 and (p.customer_id is null or c.status='active' and c.archived_at is null)
 and (p.organization_id is null or o.status='active' and o.archived_at is null)
 and l.next_service_due_date<=timezone(s.business_timezone,now())::date+p.planning_window_days;
revoke all on public.recurring_generation_preview from public,anon,authenticated,service_role;
grant select on public.recurring_generation_preview to authenticated,service_role;

create table app_private.recurring_review_runs (
 request_id uuid primary key,actor_id uuid not null,selection_hash text not null,
 result jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table app_private.recurring_review_runs enable row level security;
revoke all on app_private.recurring_review_runs from public,anon,authenticated,service_role;

create function public.approve_recurring_generation(p_request_id uuid,p_selection jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selection jsonb;selection_hash text;receipt app_private.recurring_review_runs%rowtype;
 item record;ids uuid[];new_ids uuid[];result jsonb;created integer;existing integer;
begin
 if auth.uid() is null or not app_private.has_staff_role() then raise exception 'Office access required' using errcode='42501';end if;
 if p_request_id is null or p_selection is null or jsonb_typeof(p_selection)<>'array' or jsonb_array_length(p_selection) not between 1 and 25 then raise exception 'Select one to 25 opportunities' using errcode='22023';end if;
 select jsonb_agg(jsonb_build_object('id',(x->>'id')::uuid,'version',x->>'version') order by x->>'id'),array_agg((x->>'id')::uuid order by x->>'id') into selection,ids from jsonb_array_elements(p_selection) x;
 if (select count(distinct v) from unnest(ids) v)<>cardinality(ids) or exists(select 1 from jsonb_array_elements(selection) x where x->>'version' is null or length(x->>'version')<>32) then raise exception 'Invalid selection' using errcode='22023';end if;
 selection_hash:=md5(selection::text);
 perform pg_advisory_xact_lock(hashtextextended('recurring-review:'||p_request_id,0));
 if not app_private.has_staff_role() then raise exception 'Office access required' using errcode='42501';end if;
 select * into receipt from app_private.recurring_review_runs where request_id=p_request_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.selection_hash<>selection_hash then raise exception 'Review request changed' using errcode='40001';end if;
  return receipt.result;
 end if;
 perform 1 from public.recurring_service_settings where singleton_key for share;
 perform 1 from public.recurring_service_plans p where p.id in(select l.recurring_plan_id from public.recurring_plan_locations l where l.id=any(ids)) order by p.id for share;
 perform 1 from public.recurring_plan_locations l where l.id=any(ids) order by l.id for update;
 perform 1 from public.customers c where c.id in(select p.customer_id from public.recurring_service_plans p join public.recurring_plan_locations l on l.recurring_plan_id=p.id where l.id=any(ids)) order by c.id for share;
 perform 1 from public.organizations o where o.id in(select p.organization_id from public.recurring_service_plans p join public.recurring_plan_locations l on l.recurring_plan_id=p.id where l.id=any(ids)) order by o.id for share;
 perform 1 from public.service_locations sl where sl.id in(select l.service_location_id from public.recurring_plan_locations l where l.id=any(ids)) order by sl.id for share;
 if not app_private.has_staff_role() then raise exception 'Office access required' using errcode='42501';end if;
 for item in select * from jsonb_to_recordset(selection) as x(id uuid,version text) loop
  if not exists(select 1 from public.recurring_generation_preview v where v.id=item.id and v.version=item.version) then raise exception 'Opportunity changed. Refresh the preview' using errcode='40001';end if;
 end loop;
 -- Reuse the existing duplicate-safe creation/audit transaction, restricted to
 -- the reviewed properties. No quote, work order, price approval or send occurs.
 -- Avoid taking an existing occurrence lock while holding its location lock;
 -- legacy close commands lock occurrence then location. Replays are read-only.
 select array_agg(v.id order by v.id) into new_ids from public.recurring_generation_preview v where v.id=any(ids) and not v.already_generated;
 created:=0;existing:=cardinality(ids)-coalesce(cardinality(new_ids),0);
 if new_ids is not null then
  select g.created_count,g.existing_count+existing into created,existing from public.generate_due_recurring_occurrences(25,new_ids) g;
 end if;
 if created+existing<>cardinality(ids) then raise exception 'Opportunity changed. Refresh the preview' using errcode='40001';end if;
 result:=jsonb_build_object('request_id',p_request_id,'created_count',created,'existing_count',existing,'reviewed_count',cardinality(ids));
 insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
 values(auth.uid(),'staff','recurring_review',p_request_id,'recurring_review_approved',jsonb_build_object('created_count',created,'existing_count',existing,'reviewed_count',cardinality(ids),'email_sent',false));
 insert into app_private.recurring_review_runs(request_id,actor_id,selection_hash,result) values(p_request_id,auth.uid(),selection_hash,result);
 return result;
end $$;
revoke all on function public.approve_recurring_generation(uuid,jsonb) from public,anon,service_role;
grant execute on function public.approve_recurring_generation(uuid,jsonb) to authenticated;

create function public.get_recurring_review_runs() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not app_private.has_staff_role() then raise exception 'Office access required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('created_at',r.created_at,'created_count',r.result->'created_count','existing_count',r.result->'existing_count') order by r.created_at desc) from (select * from app_private.recurring_review_runs order by created_at desc,request_id desc limit 10) r),'[]'::jsonb);
end $$;
revoke all on function public.get_recurring_review_runs() from public,anon,service_role;
grant execute on function public.get_recurring_review_runs() to authenticated;

create function public.get_calendar_operations() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not app_private.has_platform_admin_role() then raise exception 'Owner or admin access required' using errcode='42501';end if;
 return jsonb_build_object(
  'counts',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from(select status,count(*) n from public.google_calendar_sync_outbox group by status) c),
  'last_attempt_at',(select max(last_sync_attempt_at) from public.google_calendar_connections),
  'last_success_at',(select max(last_sync_succeeded_at) from public.google_calendar_connections),
  'reconnect_count',(select count(*) from public.google_calendar_connections where status in ('revoked','cleanup_failed')),
  'tasks',coalesce((select jsonb_agg(jsonb_build_object('key',q.dedupe_key,'type',q.task_type,'status',q.status,'revision',q.revision,'updated_at',q.updated_at,'attempt_count',q.attempt_count,'available_at',q.available_at,
   'target_label',case when q.task_type='connection' then coalesce((select p.full_name from public.google_calendar_connections c join public.profiles p on p.id=c.auth_user_id where c.id=q.connection_id),'Calendar account') else coalesce((select e.title from public.schedule_events e where e.id=q.schedule_event_id),'Removed schedule entry') end,'schedule_event_id',q.schedule_event_id,
   'needs_reconnect',case when q.task_type='connection' then not exists(select 1 from public.google_calendar_connections c where c.id=q.connection_id and c.sync_enabled and c.status in ('active','error') and app_private.effective_platform_access(c.auth_user_id)) else not exists(select 1 from public.google_calendar_connections c where c.sync_enabled and c.status in ('active','error') and app_private.effective_platform_access(c.auth_user_id)) end) order by q.available_at,q.dedupe_key) from(select * from public.google_calendar_sync_outbox where status in ('exhausted','retry') order by available_at,dedupe_key limit 25) q),'[]'::jsonb));
end $$;
revoke all on function public.get_calendar_operations() from public,anon,service_role;
grant execute on function public.get_calendar_operations() to authenticated;

create function public.retry_calendar_operation(p_key text,p_revision bigint,p_updated_at timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.google_calendar_sync_outbox%rowtype;
begin
 if auth.uid() is null or not app_private.has_platform_admin_role() then raise exception 'Owner or admin access required' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'A brief reason is required' using errcode='22023';end if;
 select * into q from public.google_calendar_sync_outbox where dedupe_key=p_key for update;
 if not app_private.has_platform_admin_role() then raise exception 'Owner or admin access required' using errcode='42501';end if;
 if q.dedupe_key is null or q.status not in ('retry','exhausted') or q.revision is distinct from p_revision or q.updated_at is distinct from p_updated_at then raise exception 'Sync work changed. Refresh before retrying' using errcode='40001';end if;
 if q.task_type='connection' and not exists(select 1 from public.google_calendar_connections c where c.id=q.connection_id and c.sync_enabled and c.status in ('active','error') and app_private.effective_platform_access(c.auth_user_id)) then raise exception 'Account owner must reconnect first' using errcode='23514';end if;
 if q.task_type='schedule_event' and not exists(select 1 from public.google_calendar_connections c where c.sync_enabled and c.status in ('active','error') and app_private.effective_platform_access(c.auth_user_id)) then raise exception 'No active connected account. Review Calendar settings' using errcode='23514';end if;
 update public.google_calendar_sync_outbox set status='pending',available_at=clock_timestamp(),locked_at=null,revision=revision+1
  where dedupe_key=p_key returning * into q;
 insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
 values(auth.uid(),'staff','calendar_operation',coalesce(q.connection_id,q.schedule_event_id),'calendar_retry_requested',jsonb_build_object('reason',btrim(p_reason),'revision',q.revision,'previous_attempt_count',q.attempt_count,'provider_called',false));
 return jsonb_build_object('revision',q.revision,'status',q.status);
end $$;
revoke all on function public.retry_calendar_operation(text,bigint,timestamptz,text) from public,anon,service_role;
grant execute on function public.retry_calendar_operation(text,bigint,timestamptz,text) to authenticated;
notify pgrst,'reload schema';

-- Worker-side check of the target account, independent of stale OAuth tokens.
create function public.calendar_account_can_sync(p_user uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if current_setting('role',true)<>'service_role' or auth.uid() is not null then raise exception 'Worker access required' using errcode='42501';end if;
 return coalesce(app_private.effective_platform_access(p_user),false) and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=p_user and r.name in ('owner','admin','estimator','payroll_admin','crew'));
end $$;
revoke all on function public.calendar_account_can_sync(uuid) from public,anon,authenticated;
grant execute on function public.calendar_account_can_sync(uuid) to service_role;

-- The legacy invoker close command calls a deliberately private date helper.
-- Keep that implementation private; authorize a narrow public transaction instead
-- of granting every API caller access to the helper. Retain occurrence → location
-- lock order, and prevent linked automatic scheduling history being closed here.
alter function public.close_recurring_occurrence(uuid,text,text) set schema app_private;
revoke all on function app_private.close_recurring_occurrence(uuid,text,text) from public,anon,authenticated,service_role;
do $repair$
declare definition text;
begin
 definition:=pg_get_functiondef('app_private.close_recurring_occurrence(uuid,text,text)'::regprocedure);
 if position('where recurring_occurrence_id = p_occurrence_id and status' in definition)=0 then raise exception 'Unexpected recurring close implementation';end if;
 definition:=replace(definition,'where recurring_occurrence_id = p_occurrence_id and status',
  'where recurring_occurrence_id = p_occurrence_id and (dedupe_key is null or dedupe_key not like ''approved-work-schedule:%'') and status');
 execute definition;
end $repair$;
create function public.close_recurring_occurrence(p_occurrence_id uuid,p_status text,p_reason text default null)
returns table(occurrence_id uuid,next_service_due_date date)
language plpgsql security definer set search_path='' as $$
declare location_id uuid;
begin
 if auth.uid() is null or not app_private.has_staff_role() then raise exception 'Office access required' using errcode='42501';end if;
 select o.recurring_plan_location_id into location_id from public.recurring_service_occurrences o where o.id=p_occurrence_id for update;
 perform 1 from public.recurring_plan_locations where id=location_id for update;
 if not app_private.has_staff_role() then raise exception 'Office access required' using errcode='42501';end if;
 return query select * from app_private.close_recurring_occurrence(p_occurrence_id,p_status,p_reason);
end $$;
revoke all on function public.close_recurring_occurrence(uuid,text,text) from public,anon,service_role;
grant execute on function public.close_recurring_occurrence(uuid,text,text) to authenticated;

revoke all on function public.generate_due_recurring_occurrences(integer,uuid[]) from public,anon;
grant execute on function public.generate_due_recurring_occurrences(integer,uuid[]) to authenticated,service_role;

create or replace function public.generate_due_recurring_occurrences(p_limit integer default 100)
returns table(created_count integer,existing_count integer) language sql security invoker set search_path='' as $$
 select * from public.generate_due_recurring_occurrences(p_limit,null::uuid[]);
$$;
