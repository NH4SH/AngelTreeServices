-- Atomic customer activity + frozen admin notices + PR14 email requests.
-- No legacy backfill or new transport. Every provider call remains outside SQL.
create table app_private.customer_activity_preparations (
  request_key text primary key check(length(request_key) between 1 and 240),
  activity_id uuid not null unique references public.activity_log(id),
  event_hash text not null check(event_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create table app_private.customer_activity_deliveries (
  notification_id uuid primary key references public.admin_notifications(id) on delete cascade,
  delivery_id uuid not null unique references app_private.outbound_deliveries(id)
);
alter table app_private.customer_activity_preparations enable row level security;
alter table app_private.customer_activity_deliveries enable row level security;
revoke all on app_private.customer_activity_preparations,app_private.customer_activity_deliveries from public,anon,authenticated,service_role;

create function app_private.admin_activity_email_enabled(p_user uuid,p_category text) returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce((select case p_category
    when 'quotes' then quote_email_enabled when 'change_orders' then change_order_email_enabled
    when 'messages' then message_email_enabled when 'files' then file_email_enabled
    when 'customer_updates' then customer_update_email_enabled when 'payments' then payment_email_enabled
    else false end from public.admin_notification_preferences where user_id=p_user),p_category in ('quotes','change_orders','messages','files','customer_updates','payments'));
$$;

create function app_private.admin_activity_email_eligible(c jsonb,p jsonb) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.admin_notifications n
    join app_private.customer_activity_preparations a on a.activity_id=n.activity_id
    join public.profiles u on u.id=n.recipient_user_id
    where n.id=nullif(c->>'notification_id','')::uuid and n.activity_id=nullif(c->>'activity_id','')::uuid
      and u.status='active' and app_private.email_staff(u.id,true)
      and lower(btrim(u.email))=p#>>'{to,0}'
      and jsonb_array_length(p->'to')=1 and coalesce(p->'cc','[]'::jsonb)='[]'::jsonb
      and app_private.admin_activity_email_enabled(u.id,n.category));
$$;

-- Extend only the admin-activity branch. Leave all PR14 source/suppression,
-- financial, portal, reminder and sender-block predicates byte-for-byte intact.
do $migration$
declare d text; needle text;
begin
  d:=pg_get_functiondef('app_private.email_source_snapshot(jsonb)'::regprocedure);
  needle:=E'begin\n  for q_id in';
  if strpos(d,needle)=0 then raise exception 'Unexpected saved-email snapshot boundary';end if;
  execute replace(d,needle,$guard$begin
  if c->>'kind'='admin_activity' then
    return (select jsonb_build_object('activity_id',n.activity_id,'notification_id',n.id,
      'recipient_user_id',n.recipient_user_id,'category',n.category,'title',n.title,'body',n.body,
      'destination_path',n.destination_path,'event_hash',a.event_hash)
      from public.admin_notifications n join app_private.customer_activity_preparations a on a.activity_id=n.activity_id
      where n.id=nullif(c->>'notification_id','')::uuid and n.activity_id=nullif(c->>'activity_id','')::uuid);
  end if;
  for q_id in$guard$);
  d:=pg_get_functiondef('app_private.email_source_eligible(jsonb,jsonb)'::regprocedure);
  needle:='  -- Sender-specific kinds preserve existing access; internal notices do not use';
  if strpos(d,needle)=0 then raise exception 'Unexpected saved-email eligibility boundary';end if;
  execute replace(d,needle,E'  if c->>''kind''=''admin_activity'' and not app_private.admin_activity_email_eligible(c,p) then return false;end if;\n'||needle);
end $migration$;

create function app_private.sync_admin_activity_delivery() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  -- Only the original saved request owns this notification's status. Explicit
  -- additional copies retain separate history without rewriting the original.
  update public.admin_notifications n set
    email_status=case when new.state='accepted' then 'sent'
      when new.state in ('unknown','rejected') then 'failed'
      when new.state in ('cancelled','not_attempted') then 'skipped' else 'pending' end,
    email_attempted_at=new.last_dispatched_at
    from app_private.customer_activity_deliveries m where m.delivery_id=new.id and n.id=m.notification_id;
  return new;
end $$;
create trigger sync_admin_activity_delivery after update of state,accepted_at,delivery_status
on app_private.outbound_deliveries for each row
when (new.context->>'kind'='admin_activity') execute function app_private.sync_admin_activity_delivery();

create function public.prepare_customer_activity(p_event jsonb,p_envelope jsonb,p_destination text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare k text; h text; aid uuid; nid uuid; r record; d jsonb; payload jsonb; ctx jsonb;
  saved app_private.customer_activity_preparations%rowtype; ids uuid[]:='{}'; total integer:=0;
  content text; escaped text; enabled boolean;
begin
  perform app_private.email_server_only();
  if jsonb_typeof(p_event) is distinct from 'object' or octet_length(p_event::text)>65536
    or coalesce(length(p_event->>'idempotency_key'),0) not between 1 and 240
    or p_event->>'idempotency_key'<>btrim(p_event->>'idempotency_key')
    or coalesce(length(p_event->>'event_type'),0) not between 1 and 180
    or coalesce(length(p_event->>'subject_type'),0) not between 1 and 80
    or coalesce(length(p_event->>'title'),0) not between 1 and 998
    or coalesce(length(p_event->>'summary'),0) not between 1 and 500
    or coalesce(length(p_event->>'body'),0)>16000
    or coalesce(length(p_event->>'record_label'),0)>180
    or coalesce(p_event->>'category','') not in ('quotes','change_orders','messages','files','customer_updates','payments','other')
    or jsonb_typeof(p_event->'changes') is distinct from 'object' or jsonb_typeof(p_event->'metadata') is distinct from 'object'
    or not coalesce((p_event->>'destination_path'='/admin' or p_event->>'destination_path' like '/admin/%'),false)
    or coalesce(p_event->>'subject_id','') !~ '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$'
    or coalesce(length(p_event->>'destination_path'),0) not between 6 and 500
    or (p_destination is not null and (length(p_destination)>2048 or p_destination !~ '^https?://[^[:space:]]+$'))
    or jsonb_typeof(p_envelope) is distinct from 'object'
    or coalesce(length(p_envelope->>'from'),0) not between 1 and 998
    or coalesce(length(p_envelope->>'reply_to'),0) not between 1 and 320 then
    raise exception 'Invalid activity preparation' using errcode='22023';
  end if;
  k:=p_event->>'idempotency_key';h:=encode(sha256(convert_to(p_event::text,'UTF8')),'hex');
  -- All concurrent/replayed callers share one transaction boundary and audience.
  perform pg_advisory_xact_lock(145,hashtext(k));
  select * into saved from app_private.customer_activity_preparations where request_key=k;
  if found then
    if saved.event_hash<>h then raise exception 'Activity request collision' using errcode='23505';end if;
    select count(*) into total from public.admin_notifications where activity_id=saved.activity_id;
    select coalesce(array_agg(m.delivery_id order by m.delivery_id),'{}'::uuid[]) into ids
      from app_private.customer_activity_deliveries m join public.admin_notifications n on n.id=m.notification_id where n.activity_id=saved.activity_id;
    return jsonb_build_object('activity_id',saved.activity_id,'created',false,'notification_count',total,'delivery_ids',ids,'delivery_count',cardinality(ids),'legacy_hold',false);
  end if;
  -- Older activity lacks a frozen audience/content receipt. Never infer a send
  -- from old pending/failed labels or reconstruct it using today's directory.
  select id into aid from public.activity_log where idempotency_key=k;
  if found then return jsonb_build_object('activity_id',aid,'created',false,'notification_count',0,'delivery_ids','[]'::jsonb,'delivery_count',0,'legacy_hold',true);end if;
  insert into public.activity_log(actor_type,action_category,changes_json,destination_path,event_type,idempotency_key,metadata_json,
    organization_id,record_label,summary,subject_id,subject_type)
  values('portal',p_event->>'category',p_event->'changes',p_event->>'destination_path',p_event->>'event_type',k,p_event->'metadata',
    nullif(p_event->>'organization_id','')::uuid,p_event->>'record_label',p_event->>'summary',(p_event->>'subject_id')::uuid,p_event->>'subject_type') returning id into aid;
  insert into app_private.customer_activity_preparations(request_key,activity_id,event_hash) values(k,aid,h);
  -- One SQL statement freezes the complete directory + preferences snapshot.
  -- No PostgREST row cap, URI-sized ID list, or duplicate owner/admin membership.
  for r in select u.id,u.email,u.full_name,app_private.admin_activity_email_enabled(u.id,p_event->>'category') email_enabled
    from public.profiles u where u.status='active' and app_private.email_staff(u.id,true) order by u.id loop
    enabled:=r.email_enabled and coalesce(lower(btrim(r.email)),'') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and not exists(select 1 from app_private.email_suppressions where recipient=lower(btrim(r.email)));
    insert into public.admin_notifications(activity_id,body,category,destination_path,organization_id,recipient_user_id,title,email_status)
      values(aid,coalesce(p_event->>'body',p_event->>'summary'),p_event->>'category',p_event->>'destination_path',nullif(p_event->>'organization_id','')::uuid,
        r.id,p_event->>'title',case when enabled then 'pending' else 'skipped' end) returning id into nid;
    total:=total+1;
    if not enabled then continue;end if;
    content:=case when nullif(r.full_name,'') is null then 'Hello,' else 'Hi '||r.full_name||',' end||E'\n'||(p_event->>'summary')
      ||case when nullif(p_event->>'record_label','') is not null then E'\nRecord: '||(p_event->>'record_label') else '' end
      ||E'\nTime: '||to_char(transaction_timestamp() at time zone 'America/New_York','Mon DD, YYYY HH12:MI AM')||' ET'
      ||case when p_destination is not null then E'\nOpen in admin: '||p_destination else '' end;
    escaped:=replace(replace(replace(replace(replace(content,'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#039;');
    payload:=jsonb_build_object('from',p_envelope->>'from','reply_to',p_envelope->>'reply_to','to',jsonb_build_array(lower(btrim(r.email))),
      'cc','[]'::jsonb,'subject',p_event->>'title','text',content,'html','<p>'||replace(escaped,E'\n','<br />')||'</p>');
    ctx:=jsonb_build_object('kind','admin_activity','email_type','admin_customer_activity','notification_id',nid,'activity_id',aid,
      'customer_id',p_event->>'customer_id','organization_id',p_event->>'organization_id','invoice_id',p_event->>'invoice_id',
      'payment_id',p_event->>'payment_id','change_order_id',p_event->>'change_order_id','quote_ids',
      case when nullif(p_event->>'quote_id','') is null then '[]'::jsonb else jsonb_build_array(p_event->>'quote_id') end);
    d:=public.prepare_outbound_delivery('admin-activity:'||nid,payload,ctx);
    if coalesce((d->>'conflict')::boolean,true) then raise exception 'Saved activity email conflict' using errcode='23505';end if;
    insert into app_private.customer_activity_deliveries(notification_id,delivery_id) values(nid,(d->>'id')::uuid);
    ids:=array_append(ids,(d->>'id')::uuid);
  end loop;
  return jsonb_build_object('activity_id',aid,'created',true,'notification_count',total,'delivery_ids',ids,'delivery_count',cardinality(ids),'legacy_hold',false);
end $$;

revoke all on function app_private.admin_activity_email_enabled(uuid,text),app_private.admin_activity_email_eligible(jsonb,jsonb),app_private.sync_admin_activity_delivery() from public,anon,authenticated,service_role;
revoke all on function public.prepare_customer_activity(jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.prepare_customer_activity(jsonb,jsonb,text) to service_role;
notify pgrst,'reload schema';
