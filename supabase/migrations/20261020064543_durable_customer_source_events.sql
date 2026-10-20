-- Capture new customer notification intent with the existing required audit.
-- No historical backfill, provider I/O, financial rewrite or automatic worker.
create table app_private.customer_source_events (
 id uuid primary key default gen_random_uuid(),source_key text not null unique check(length(source_key) between 1 and 240),
 source_audit_id uuid not null unique,event jsonb not null check(jsonb_typeof(event)='object' and octet_length(event::text)<=65536),
 event_hash text not null check(event_hash ~ '^[a-f0-9]{64}$'),event_order bigint generated always as identity,
 created_at timestamptz not null default now(),prepared_activity_id uuid,prepared_at timestamptz,
 preparation_problem text check(preparation_problem is null or preparation_problem='legacy_activity_hold'),
 review_id uuid unique,reviewed_by uuid,review_reason text,reviewed_at timestamptz,
 check((prepared_activity_id is null)=(prepared_at is null))
);
create index customer_source_events_pending on app_private.customer_source_events(event_order) where prepared_activity_id is null;
create index customer_source_events_subject on app_private.customer_source_events((event->>'subject_id'),(event->>'event_type'),event_order desc);
alter table app_private.customer_source_events enable row level security;
revoke all on app_private.customer_source_events from public,anon,authenticated,service_role;
revoke all on sequence app_private.customer_source_events_event_order_seq from public,anon,authenticated,service_role;

-- Retrying a change-order response must not create another note or overwrite a
-- later approval. Token deletion may remove retry metadata, never saved intent.
create table app_private.change_order_response_requests (
 request_id uuid primary key,change_order_id uuid not null references public.change_orders(id) on delete cascade,
 token_id uuid not null references public.change_order_portal_tokens(id) on delete cascade,
 expected_updated_at timestamptz not null,payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 source_event_id uuid not null references app_private.customer_source_events(id),note_id uuid,responded_at timestamptz not null
);
create index change_order_response_requests_order on app_private.change_order_response_requests(change_order_id);
create index change_order_response_requests_token on app_private.change_order_response_requests(token_id);
create index change_order_response_requests_event on app_private.change_order_response_requests(source_event_id);
alter table app_private.change_order_response_requests enable row level security;
revoke all on app_private.change_order_response_requests from public,anon,authenticated,service_role;

create function app_private.capture_customer_source_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare q public.quotes%rowtype;co public.change_orders%rowtype;i public.invoices%rowtype;
 e jsonb;party text;label text;k text;body text;category text;title text;summary text;event_type text;destination text;
 customer uuid;organization uuid;quote uuid;invoice uuid;change_order uuid;metadata jsonb:='{}';existing_hash text;
begin
 -- Audit columns alone are not authority: browser inserts cannot mint intents.
 if current_setting('role',true)<>'service_role' or auth.uid() is not null then return new;end if;
 if new.event_type in ('quote_approved','quote_change_request_recorded') and new.actor_type='portal' and new.subject_type='quote' then
  select * into strict q from public.quotes where id=new.subject_id;
  if new.event_type='quote_approved' and (q.status<>'approved' or q.approved_from_revision is null) then raise exception 'Approval source is incomplete' using errcode='23514';end if;
  customer:=q.customer_id;organization:=q.organization_id;quote:=q.id;category:='quotes';label:=coalesce(nullif(q.quote_number,''),'Quote');destination:='/admin/quotes/'||q.id;
  party:=coalesce((select name from public.organizations where id=organization),(select display_name from public.customers where id=customer),'Customer');
  if new.event_type='quote_approved' then
   k:='quote:'||q.id||':portal-approved';event_type:='quote_portal_approved';title:='Quote approved by customer';summary:=left(party,180)||' approved '||label||'.';
  else
   select substring(n.body from length('Customer portal change request: ')+1) into body from public.notes n where n.id=nullif(new.metadata_json->>'note_id','')::uuid and n.body like 'Customer portal change request: %';
   if body is null then raise exception 'Change request note is incomplete' using errcode='23514';end if;
   k:='quote:'||q.id||':change-request:'||(new.metadata_json->>'note_id');event_type:='quote_portal_changes_requested';title:='Customer requested quote changes';summary:=left(party,180)||' requested changes to '||label||'.';
  end if;
 elsif new.event_type in ('change_order_approved','change_order_response_recorded') and new.actor_type='portal' and new.subject_type='change_order' then
  select * into strict co from public.change_orders where id=new.subject_id;
  if new.event_type='change_order_approved' and (co.status<>'approved' or co.approval_method<>'portal') then return new;end if;
  customer:=co.customer_id;organization:=co.organization_id;quote:=co.source_quote_id;change_order:=co.id;category:='change_orders';label:=co.change_order_number;destination:='/admin/change-orders/'||co.id;
  party:=coalesce((select name from public.organizations where id=organization),(select display_name from public.customers where id=customer),'Customer');
  if new.event_type='change_order_approved' then
   k:='change-order:'||co.id||':portal-approved';event_type:='change_order_portal_approved';title:='Change order approved';summary:=left(party,180)||' approved '||label||'.';
  else
   if co.status not in ('declined','change_requested') then raise exception 'Response source is incomplete' using errcode='23514';end if;
   if nullif(new.metadata_json->>'note_id','') is not null then
    select substring(n.body from length('Change order customer response: ')+1) into body from public.notes n where n.id=(new.metadata_json->>'note_id')::uuid and n.body like 'Change order customer response: %';
    if body is null then raise exception 'Response note is incomplete' using errcode='23514';end if;
   end if;
   k:='change-order:'||co.id||':response:'||(new.metadata_json->>'request_id');
   event_type:=case co.status when 'declined' then 'change_order_portal_declined' else 'change_order_portal_changes_requested' end;
   title:=case co.status when 'declined' then 'Change order declined' else 'Customer requested change-order updates' end;
   summary:=left(party,180)||case co.status when 'declined' then ' declined ' else ' requested changes to ' end||label||'.';
  end if;
 elsif new.event_type='customer_selected_payment_preference' and new.subject_type='invoice' and new.idempotency_key is null then
  -- The prepared activity uses the same event name but a non-null key; it must
  -- never capture itself recursively. The original command writes this audit
  -- only after an actual preference transition, never on a no-op retry.
  select * into strict i from public.invoices where id=new.subject_id;
  customer:=i.customer_id;organization:=i.organization_id;invoice:=i.id;category:='payments';label:=coalesce(nullif(i.invoice_number,''),'Invoice');destination:='/admin/invoices/'||i.id;
  party:=coalesce((select name from public.organizations where id=organization),(select display_name from public.customers where id=customer),'Customer');
  k:='invoice:'||i.id||':payment-preference-event:'||new.id;event_type:=new.event_type;title:='Customer selected a payment option';
  summary:=left(party,180)||' selected '||case i.payment_preference when 'ach' then 'Bank account (ACH)' when 'card' then 'Debit or credit card' when 'cash_check_pickup' then 'Cash or check pickup' when 'check_mail' then 'Mail a check' end||' for '||label||'. No payment was recorded.';
  metadata:=jsonb_build_object('payment_preference',i.payment_preference,'balance_due_cents',greatest(0,i.total_cents-app_private.invoice_paid_principal(i.id)));
 else return new;end if;
 e:=jsonb_build_object('category',category,'changes','{}'::jsonb,'metadata',metadata,'destination_path',destination,
  'event_type',event_type,'idempotency_key',k,'organization_id',organization,'record_label',left(label,180),'summary',left(summary,500),
  'body',coalesce(body,left(summary,500)),'title',title,'subject_id',new.subject_id,'subject_type',new.subject_type,
  'customer_id',customer,'invoice_id',invoice,'change_order_id',change_order,'payment_id',null,'quote_id',quote);
 insert into app_private.customer_source_events(source_key,source_audit_id,event,event_hash,preparation_problem)
 values(k,new.id,e,encode(sha256(convert_to(e::text,'UTF8')),'hex'),
  case when event_type='customer_selected_payment_preference' and coalesce(current_setting('app.customer_source_handoff',true),'')<>'invoice-v1' then 'legacy_activity_hold' end) on conflict(source_key) do nothing;
 select event_hash into strict existing_hash from app_private.customer_source_events where source_key=k;
 if existing_hash<>encode(sha256(convert_to(e::text,'UTF8')),'hex') then raise exception 'Source event collision' using errcode='23505';end if;
 return new;
end $$;
revoke all on function app_private.capture_customer_source_event() from public,anon,authenticated,service_role;
create trigger capture_customer_source_event after insert on public.activity_log for each row execute function app_private.capture_customer_source_event();

-- Preserve the existing invoice command and every payable/token/payment rule.
-- This wrapper only returns the durable event in the same transaction; a no-op
-- retry can recover the latest exact preference event, never a fabricated one.
create function public.record_invoice_preference_with_event(p_token_hash text,p_preference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r record;source_id uuid;previous_handoff text;
begin
 perform app_private.email_server_only();
 -- Classification only, never an authorization predicate. Older callers may
 -- still dispatch timestamp-key mail; their intents are retained but held.
 previous_handoff:=current_setting('app.customer_source_handoff',true);
 perform set_config('app.customer_source_handoff','invoice-v1',true);
 select * into strict r from public.record_invoice_payment_preference(p_token_hash,p_preference);
 perform set_config('app.customer_source_handoff',coalesce(previous_handoff,''),true);
 select id into source_id from app_private.customer_source_events where event->>'subject_id'=r.invoice_id::text
  and event->>'event_type'='customer_selected_payment_preference' and event#>>'{metadata,payment_preference}'=p_preference order by event_order desc limit 1;
 if r.preference_changed and source_id is null then raise exception 'Preference handoff is incomplete' using errcode='23514';end if;
 return jsonb_build_object('invoice_id',r.invoice_id,'preference_changed',r.preference_changed,'source_event_id',source_id);
end $$;

create function public.respond_to_change_order_by_portal(p_request_id uuid,p_token_hash text,p_expected_updated_at timestamptz,p_intent text,p_message text) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare co public.change_orders%rowtype;t public.change_order_portal_tokens%rowtype;r app_private.change_order_response_requests%rowtype;
 co_id uuid;parent uuid;msg text:=btrim(coalesce(p_message,''));ph text;note_id uuid;audit_id uuid;source_id uuid;responded timestamptz;
begin
 perform app_private.email_server_only();
 if p_request_id is null or p_expected_updated_at is null or p_intent is null or p_intent not in ('request_changes','decline') or length(msg)>1000 or (p_intent='request_changes' and length(msg)<3) then raise exception 'Review the addition and enter a valid response.' using errcode='22023';end if;
 if p_token_hash is null or p_token_hash!~'^[a-f0-9]{64}$' then raise exception 'This change order link is unavailable.' using errcode='42501';end if;
 ph:=encode(sha256(convert_to(jsonb_build_array(p_intent,msg)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('change-order-response/'||p_request_id::text,0));
 select change_order_id into co_id from public.change_order_portal_tokens where token_hash=p_token_hash;
 if co_id is null then raise exception 'This change order link is unavailable.' using errcode='42501';end if;
 select job_id into parent from public.change_orders where id=co_id;
 if parent is not null then perform 1 from public.jobs where id=parent for update;end if;
 select * into co from public.change_orders where id=co_id for update;
 if not found or co.job_id is distinct from parent then raise exception 'The addition changed. Refresh and review it.' using errcode='40001';end if;
 select * into t from public.change_order_portal_tokens where token_hash=p_token_hash and change_order_id=co.id for update;
 if not found or t.revoked_at is not null or (t.expires_at is not null and t.expires_at<=clock_timestamp()) then raise exception 'This change order link is unavailable.' using errcode='42501';end if;
 select * into r from app_private.change_order_response_requests where request_id=p_request_id;
 if found then
  if r.change_order_id<>co.id or r.token_id<>t.id or r.expected_updated_at<>p_expected_updated_at or r.payload_hash<>ph then raise exception 'This response was already used for different details.' using errcode='22023';end if;
  return jsonb_build_object('change_order_id',co.id,'source_event_id',r.source_event_id,'replayed',true);
 end if;
 if co.updated_at<>p_expected_updated_at then raise exception 'The addition changed. Refresh and review it.' using errcode='40001';end if;
 if co.status not in ('sent','change_requested') then raise exception 'This addition is no longer open for a response.' using errcode='23514';end if;
 responded:=clock_timestamp();
 if msg<>'' then insert into public.notes(customer_id,service_location_id,job_id,visibility,body)
  values(co.customer_id,co.service_location_id,co.job_id,'internal','Change order customer response: '||msg) returning id into note_id;end if;
 update public.change_orders set status=case p_intent when 'decline' then 'declined' else 'change_requested' end,
  declined_at=case p_intent when 'decline' then responded end where id=co.id;
 update public.change_order_portal_tokens set used_at=responded where id=t.id;
 insert into public.activity_log(actor_type,subject_type,subject_id,event_type,metadata_json)
  values('portal','change_order',co.id,'change_order_response_recorded',jsonb_build_object('request_id',p_request_id,'note_id',note_id)) returning id into audit_id;
 select id into strict source_id from app_private.customer_source_events where source_audit_id=audit_id;
 insert into app_private.change_order_response_requests values(p_request_id,co.id,t.id,p_expected_updated_at,ph,source_id,note_id,responded);
 return jsonb_build_object('change_order_id',co.id,'source_event_id',source_id,'replayed',false);
end $$;

create function public.find_customer_source_event(p_source_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin perform app_private.email_server_only();return(select jsonb_build_object('id',id,'destination_path',event->>'destination_path') from app_private.customer_source_events where source_key=p_source_key);end $$;
create function public.get_customer_source_event(p_source_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin perform app_private.email_server_only();return(select jsonb_build_object('id',id,'destination_path',event->>'destination_path') from app_private.customer_source_events where id=p_source_id);end $$;

create function public.prepare_customer_source_event(p_source_id uuid,p_envelope jsonb,p_destination text default null,p_review_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s app_private.customer_source_events%rowtype;r jsonb;
begin
 perform app_private.email_server_only();select * into s from app_private.customer_source_events where id=p_source_id;
 if not found then raise exception 'Source event is unavailable' using errcode='P0002';end if;
 if p_review_id is not null and (s.review_id is distinct from p_review_id or not app_private.email_staff(s.reviewed_by,true) or s.reviewed_at<=clock_timestamp()-interval '15 minutes') then raise exception 'Source review authority changed' using errcode='42501';end if;
 if s.event_hash<>encode(sha256(convert_to(s.event::text,'UTF8')),'hex') then raise exception 'Source event integrity changed' using errcode='23514';end if;
 if s.preparation_problem='legacy_activity_hold' then
  return jsonb_build_object('source_event_id',s.id,'legacy_hold',true);
 end if;
 -- Do not hold a source row lock before PR14's business-source locks. Intent is
 -- immutable; the final acknowledgement follows the existing source lock order.
 r:=public.prepare_customer_activity(s.event,p_envelope,p_destination);
 if p_review_id is not null then
  select * into s from app_private.customer_source_events where id=p_source_id for update;
  if s.review_id is distinct from p_review_id or not app_private.email_staff(s.reviewed_by,true) or s.reviewed_at<=clock_timestamp()-interval '15 minutes' then raise exception 'Source review authority changed' using errcode='42501';end if;
 end if;
 if coalesce((r->>'legacy_hold')::boolean,true) then
  update app_private.customer_source_events set preparation_problem='legacy_activity_hold' where id=s.id;
 else
  update app_private.customer_source_events set prepared_activity_id=(r->>'activity_id')::uuid,prepared_at=coalesce(prepared_at,clock_timestamp()),preparation_problem=null where id=s.id;
 end if;
 return r||jsonb_build_object('source_event_id',s.id);
end $$;

create function public.list_pending_customer_source_events(p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not app_private.email_staff(auth.uid(),true) then raise exception 'Administrator review required' using errcode='42501';end if;
 return jsonb_build_object('total',(select count(*) from app_private.customer_source_events where prepared_activity_id is null),
 'events',(select coalesce(jsonb_agg(r order by event_order),'[]') from(select id,event_order,event->>'title' title,event->>'destination_path' destination_path,created_at,preparation_problem
  from app_private.customer_source_events where prepared_activity_id is null order by event_order limit 20 offset (greatest(1,least(10000,coalesce(p_page,1)))-1)*20) r));
end $$;
create function public.review_customer_source_event(p_source_id uuid,p_request_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s app_private.customer_source_events%rowtype;
begin
 if auth.uid() is null or not app_private.email_staff(auth.uid(),true) then raise exception 'Administrator review required' using errcode='42501';end if;
 if p_request_id is null or p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then raise exception 'Provide a short review reason' using errcode='22023';end if;
 select * into s from app_private.customer_source_events where id=p_source_id for update;
 if not found then raise exception 'Source event is unavailable' using errcode='P0002';end if;
 if not app_private.email_staff(auth.uid(),true) then raise exception 'Administrator review required' using errcode='42501';end if;
 if s.review_id=p_request_id then
  if s.reviewed_by<>auth.uid() or s.review_reason<>btrim(p_reason) then raise exception 'Review request collision' using errcode='23505';end if;
 else
  update app_private.customer_source_events set review_id=p_request_id,reviewed_by=auth.uid(),review_reason=btrim(p_reason),reviewed_at=clock_timestamp() where id=s.id;
  insert into public.activity_log(actor_type,actor_user_id,subject_type,subject_id,event_type,metadata_json)
   values('staff',auth.uid(),'customer_source_event',s.id,'source_activity_preparation_reviewed',jsonb_build_object('request_id',p_request_id,'reason',btrim(p_reason),'email_sent',false));
 end if;
 return jsonb_build_object('source_event_id',s.id,'review_id',p_request_id);
end $$;

revoke all on function public.record_invoice_preference_with_event(text,text),public.respond_to_change_order_by_portal(uuid,text,timestamptz,text,text),public.find_customer_source_event(text),public.get_customer_source_event(uuid),public.prepare_customer_source_event(uuid,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.record_invoice_preference_with_event(text,text),public.respond_to_change_order_by_portal(uuid,text,timestamptz,text,text),public.find_customer_source_event(text),public.get_customer_source_event(uuid),public.prepare_customer_source_event(uuid,jsonb,text,uuid) to service_role;
revoke all on function public.list_pending_customer_source_events(integer),public.review_customer_source_event(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.list_pending_customer_source_events(integer),public.review_customer_source_event(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
