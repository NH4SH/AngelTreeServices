-- Visit changes are captured atomically with the authorized schedule command.
-- No backfill, provider calls, or automatic activation. Existing outbox owns delivery.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';

alter table public.communication_settings add column appointment_change_notices_enabled boolean not null default false;
do $constraints$
declare t text; n text; d text;
begin
 for t,n in select * from (values
  ('customer_communications','customer_communications_communication_type_check'),
  ('email_events','email_events_email_type_check')) x(t,n) loop
  select pg_get_constraintdef(oid) into strict d from pg_constraint where conrelid=('public.'||t)::regclass and conname=n;
  if d not like '%''payment_confirmation''::text%' or d like '%appointment_changed%' then raise exception 'Unexpected email type constraint';end if;
  d:=replace(d,'''payment_confirmation''::text','''payment_confirmation''::text, ''appointment_changed''::text, ''appointment_cancelled''::text');
  execute format('alter table public.%I drop constraint %I',t,n);
  execute format('alter table public.%I add constraint %I %s',t,n,d);
 end loop;
end $constraints$;

create table app_private.appointment_notice_events (
 id uuid primary key default gen_random_uuid(),
 event_order bigint generated always as identity unique,
 source_kind text not null check(source_kind in ('schedule_event','appointment')),
 source_id uuid not null,
 notice_kind text not null check(notice_kind in ('changed','cancelled','none')),
 before_state jsonb not null,
 after_state jsonb not null,
 job_id uuid not null,
 customer_id uuid,
 organization_id uuid,
 gap_reason text,
 created_at timestamptz not null default clock_timestamp()
);
create index appointment_notice_origin_idx on app_private.appointment_notice_events(source_kind,source_id,event_order desc);
alter table app_private.appointment_notice_events enable row level security;
revoke all on app_private.appointment_notice_events from public,anon,authenticated,service_role;
revoke all on sequence app_private.appointment_notice_events_event_order_seq from public,anon,authenticated,service_role;

create function app_private.appointment_notice_state(r jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('job_id',r->'job_id','service_location_id',r->'service_location_id',
  'starts_at',r->'starts_at','ends_at',r->'ends_at','status',r->'status','type',coalesce(r->'event_type',r->'appointment_type'));
$$;

create function app_private.capture_appointment_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare b jsonb:=app_private.appointment_notice_state(to_jsonb(old)); a jsonb:=app_private.appointment_notice_state(to_jsonb(new));
 k text:=case when tg_table_name='schedule_events' then 'schedule_event' else 'appointment' end;
 kind text:='none'; j public.jobs%rowtype; s public.communication_settings%rowtype; prev app_private.appointment_notice_events%rowtype;
 notice_id uuid:=gen_random_uuid(); email text; gap text;
begin
 if a=b or new.job_id is null then return new;end if;
 -- Migrated appointments are represented by one canonical schedule event.
 if k='appointment' and exists(select 1 from public.schedule_events where source_appointment_id=new.id) then return new;end if;
 select * into j from public.jobs where id=new.job_id;
 if not found then return new;end if;
 select * into s from public.communication_settings where singleton;
 if b->>'status' in ('scheduled','confirmed') and (b->>'starts_at')::timestamptz>clock_timestamp() and a->>'status'='cancelled' then kind:='cancelled';
 elsif a->>'status' in ('scheduled','confirmed') and (a->>'starts_at')::timestamptz>clock_timestamp()
  and b->>'status' in ('scheduled','confirmed','cancelled') and (a-'status'<>b-'status' or b->>'status'='cancelled') then kind:='changed';end if;
 if a->>'job_id' is distinct from b->>'job_id' or a->>'type' not in ('estimate','job','maintenance','emergency') then kind:='none';end if;
 -- Confirmation alone isn't a customer-visible change and must not invalidate a pending notice.
 if a-'status'=b-'status' and a->>'status' in ('scheduled','confirmed') and b->>'status' in ('scheduled','confirmed') then return new;end if;
 select * into prev from app_private.appointment_notice_events where source_kind=k and source_id=new.id order by event_order desc limit 1;
 -- Coalesce rapid unsent edits from the last customer-visible version, never from an uncertain send.
 if prev.id is not null and exists(select 1 from public.customer_communications where id=prev.id and status='pending')
  and not exists(select 1 from app_private.outbound_deliveries where context->>'communication_id'=prev.id::text and first_dispatched_at is not null) then
  b:=prev.before_state;
  if a-'status'=b-'status' and a->>'status' in ('scheduled','confirmed') and b->>'status' in ('scheduled','confirmed') then kind:='none';end if;
 end if;
 if j.organization_id is not null then
  select lower(btrim(coalesce(oc.email,o.billing_email))) into email from public.organizations o
   left join public.organization_contacts oc on oc.id=coalesce(j.onsite_contact_id,j.property_manager_contact_id) and oc.organization_id=o.id and oc.is_active
   where o.id=j.organization_id and o.status='active';
 else
  select lower(btrim(c.email)) into email from public.customers c where c.id=j.customer_id and c.status='active';
 end if;
 gap:=case when kind='none' then 'not_notifiable' when not coalesce(s.automated_sending_enabled and s.appointment_change_notices_enabled,false) then 'disabled'
  when j.archived_at is not null or j.lead_disposition<>'active' then 'inactive_job'
  when email is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then 'recipient_unavailable' end;
 insert into app_private.appointment_notice_events(id,source_kind,source_id,notice_kind,before_state,after_state,job_id,customer_id,organization_id,gap_reason)
 values(notice_id,k,new.id,kind,b,a,j.id,j.customer_id,j.organization_id,gap);
 update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),skip_reason='A newer visit update replaced this notice.'
  where status='pending' and communication_type in ('appointment_changed','appointment_cancelled')
   and ((k='schedule_event' and schedule_event_id=new.id) or (k='appointment' and appointment_id=new.id));
 if gap is null or gap='recipient_unavailable' then
  update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),skip_reason='A visit update replaces this reminder.'
   where status='pending' and communication_type in ('estimate_confirmation','estimate_reminder','work_confirmation','work_reminder')
    and ((k='schedule_event' and schedule_event_id=new.id) or (k='appointment' and appointment_id=new.id));
  insert into public.customer_communications(id,communication_type,reminder_stage,customer_id,organization_id,job_id,schedule_event_id,appointment_id,
    recipient_source,recipient_email,scheduled_for,source_version,is_automatic,idempotency_key,status,skip_reason)
  values(notice_id,case kind when 'changed' then 'appointment_changed' else 'appointment_cancelled' end,kind,j.customer_id,j.organization_id,j.id,
    case when k='schedule_event' then new.id end,case when k='appointment' then new.id end,
    case when j.organization_id is null then 'customer' else 'organization' end,coalesce(email,''),clock_timestamp()+interval '2 minutes',new.starts_at,true,'auto:appointment-notice/'||notice_id,
    case when gap is null then 'pending' else 'skipped' end,case when gap is not null then 'Customer email is missing or invalid. Contact the customer about this visit update.' end);
 end if;
 return new;
end $$;
create trigger schedule_event_change_notice after update on public.schedule_events for each row execute function app_private.capture_appointment_notice();
create trigger legacy_appointment_change_notice after update on public.appointments for each row execute function app_private.capture_appointment_notice();

create function app_private.current_appointment_notice(p_id uuid) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare e app_private.appointment_notice_events%rowtype; cm public.customer_communications%rowtype; a jsonb; loc jsonb; j public.jobs%rowtype;
begin
 select * into e from app_private.appointment_notice_events where id=p_id;
 if not found or e.notice_kind='none' then return jsonb_build_object('status','obsolete');end if;
 select * into cm from public.customer_communications where id=e.id;
 if not found or not cm.is_automatic or cm.communication_type<>(case e.notice_kind when 'changed' then 'appointment_changed' else 'appointment_cancelled' end)
  or cm.job_id is distinct from e.job_id or cm.customer_id is distinct from e.customer_id or cm.organization_id is distinct from e.organization_id
  or (e.source_kind='schedule_event' and (cm.schedule_event_id is distinct from e.source_id or cm.appointment_id is not null))
  or (e.source_kind='appointment' and (cm.appointment_id is distinct from e.source_id or cm.schedule_event_id is not null))
  or cm.quote_id is not null or cm.invoice_id is not null or cm.payment_id is not null
  or exists(select 1 from app_private.appointment_notice_events n where n.source_kind=e.source_kind and n.source_id=e.source_id and n.event_order>e.event_order)
  then return jsonb_build_object('status','obsolete');end if;
 if not exists(select 1 from public.communication_settings where singleton and automated_sending_enabled and appointment_change_notices_enabled) then
  return jsonb_build_object('status','held');end if;
 if e.source_kind='schedule_event' then select app_private.appointment_notice_state(to_jsonb(v)) into a from public.schedule_events v where id=e.source_id;
 else select app_private.appointment_notice_state(to_jsonb(v)) into a from public.appointments v where id=e.source_id;end if;
 select * into j from public.jobs where id=e.job_id;
 if (a is distinct from e.after_state and not (a-'status'=e.after_state-'status' and a->>'status' in ('scheduled','confirmed') and e.after_state->>'status' in ('scheduled','confirmed'))) or not found or j.archived_at is not null or j.status in ('cancelled','lost') or j.lead_disposition<>'active'
  or j.customer_id is distinct from e.customer_id or j.organization_id is distinct from e.organization_id
  or (case when e.notice_kind='cancelled' then (e.before_state->>'starts_at')::timestamptz else (a->>'starts_at')::timestamptz end)<=clock_timestamp()
  then return jsonb_build_object('status','obsolete');end if;
 if e.source_kind='appointment' and exists(select 1 from public.schedule_events where source_appointment_id=e.source_id) then return jsonb_build_object('status','obsolete');end if;
 if cm.scheduled_for>clock_timestamp() then return jsonb_build_object('status','held');end if;
 if exists(select 1 from app_private.outbound_deliveries d join app_private.appointment_notice_events prior on d.context->>'communication_id'=prior.id::text
  where prior.source_kind=e.source_kind and prior.source_id=e.source_id and prior.event_order<e.event_order and d.state in ('dispatching','unknown')) then
  return jsonb_build_object('status','held');end if;
 select jsonb_build_object('street',street,'city',city,'state',state,'postal_code',postal_code) into loc from public.service_locations where id=(a->>'service_location_id')::uuid;
 return jsonb_build_object('status','ready','kind',e.notice_kind,'before',e.before_state,'after',a,'location',loc);
end $$;

create function public.get_appointment_change_notice(p_communication_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin perform app_private.email_server_only();return app_private.current_appointment_notice(p_communication_id);end $$;

-- Shared by polling and final transactional admission: an update replaces confirmation,
-- and holds nearby reminders until its own delivery is certain and the interval has elapsed.
create function app_private.appointment_notice_coverage() returns table(source_kind text,source_id uuid,suppress_reminder boolean)
language sql stable security invoker set search_path='' as $$
 with latest as (select distinct on(e.source_kind,e.source_id) e.* from app_private.appointment_notice_events e order by e.source_kind,e.source_id,e.event_order desc),
 covered as (
 select e.source_kind,e.source_id,(cm.status in ('pending','processing','failed') or
  (cm.status='sent' and cm.sent_at>now()-make_interval(hours=>s.minimum_send_interval_hours))) as suppress_reminder
 from latest e join public.customer_communications cm on cm.id=e.id cross join public.communication_settings s
 where s.singleton and s.appointment_change_notices_enabled and cm.communication_type in ('appointment_changed','appointment_cancelled')
 ), canonical as (select * from covered union all
 select 'appointment',v.source_appointment_id,c.suppress_reminder from covered c join public.schedule_events v on c.source_kind='schedule_event' and v.id=c.source_id where v.source_appointment_id is not null)
 select * from canonical;
$$;
create function public.get_appointment_notice_coverage() returns table(source_kind text,source_id uuid,suppress_reminder boolean)
language plpgsql security definer set search_path='' as $$
begin perform app_private.email_server_only();return query select * from app_private.appointment_notice_coverage();end $$;

do $extend$
declare f text; anchor text; changed text;
begin
 -- Preserve every existing financial, authorization, suppression and source check.
 f:=pg_get_functiondef('app_private.email_source_snapshot(jsonb)'::regprocedure);
 anchor:='  return result;';
 changed:=$body$  if c->>'email_type' in ('appointment_changed','appointment_cancelled') then
    result:=result||jsonb_build_object('appointment_notice',app_private.current_appointment_notice((c->>'communication_id')::uuid));
  end if;
  return result;$body$;
 if (length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected snapshot preimage';end if;
 execute replace(f,anchor,changed);
 f:=pg_get_functiondef('app_private.email_source_eligible(jsonb,jsonb)'::regprocedure);
 anchor:='    else'||chr(10)||'      if cm.schedule_event_id is not null then';
 changed:=$body$    elsif cm.communication_type in ('appointment_changed','appointment_cancelled') then
      if app_private.current_appointment_notice(cm.id)->>'status'<>'ready' then return false;end if;
    else
      if exists(select 1 from app_private.appointment_notice_coverage() x where
        ((x.source_kind='schedule_event' and x.source_id=cm.schedule_event_id) or (x.source_kind='appointment' and x.source_id=cm.appointment_id))
        and (cm.communication_type like '%_confirmation' or x.suppress_reminder)) then return false;end if;
      if cm.schedule_event_id is not null then$body$;
 if (length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected eligibility preimage';end if;
 f:=replace(f,anchor,changed);
 anchor:='    if cm.communication_type=''quote_follow_up'' then';
 if (length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected communication type preimage';end if;
 changed:=$body$    if (cm.communication_type in ('appointment_changed','appointment_cancelled') or c->>'email_type' in ('appointment_changed','appointment_cancelled'))
      and cm.communication_type is distinct from c->>'email_type' then return false;end if;
    if cm.communication_type='quote_follow_up' then$body$;
 execute replace(f,anchor,changed);
 f:=pg_get_functiondef('public.prepare_outbound_delivery(text,jsonb,jsonb,jsonb)'::regprocedure);
 anchor:='  elsif p_context->>''communication_id'' is not null then';
 if (length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected delivery identity preimage';end if;
 changed:=$body$  elsif p_context->>'email_type' in ('appointment_changed','appointment_cancelled') then
    -- End-only edits and cancel/restore can share the same start timestamp.
    -- Each verified immutable source event has exactly one queue/delivery identity.
    business:='appointment-notice/'||(p_context->>'communication_id');
  elsif p_context->>'communication_id' is not null then$body$;
 execute replace(f,anchor,changed);
 f:=pg_get_functiondef('public.claim_outbound_delivery(uuid)'::regprocedure);
 anchor:='  if d.context->>''communication_id'' is not null then';
 if (length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected delivery claim preimage';end if;
 -- Distinct immutable visit revisions are not repeat reminders.
 -- Only these two immutable event types bypass the cross-row reminder cooldown.
 f:=replace(f,anchor,'  if d.context->>''communication_id'' is not null and d.context->>''email_type'' not in (''appointment_changed'',''appointment_cancelled'') then');
 execute f;
 f:=pg_get_functiondef('app_private.invalidate_schedule_reminders()'::regprocedure);
 anchor:='where schedule_event_id = new.id and status = ''pending'';';
 if (length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected schedule invalidation preimage';end if;
 execute replace(f,anchor,'where schedule_event_id = new.id and status = ''pending'' and communication_type not in (''appointment_changed'',''appointment_cancelled'');');
 f:=pg_get_functiondef('public.save_legacy_appointment(uuid,uuid,integer,jsonb,text,text)'::regprocedure);
 anchor:='where appointment_id=a.id and status=''pending'';';
 if (length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected legacy command preimage';end if;
 execute replace(f,anchor,'where appointment_id=a.id and status=''pending'' and communication_type not in (''appointment_changed'',''appointment_cancelled'');');
end $extend$;

do $acl$ declare f regprocedure;
begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private'
  and p.proname in ('appointment_notice_state','capture_appointment_notice','current_appointment_notice','appointment_notice_coverage') loop
  execute format('alter function %s owner to postgres',f);execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
 end loop;
end $acl$;
revoke all on function public.get_appointment_change_notice(uuid),public.get_appointment_notice_coverage() from public,anon,authenticated;
grant execute on function public.get_appointment_change_notice(uuid),public.get_appointment_notice_coverage() to service_role;
notify pgrst,'reload schema';
commit;
