-- Narrow same-order Firewood handoff and office visibility repair.
-- No provider calls, accepted-order updates, payment writes, merges or email dispatch.
CREATE OR REPLACE FUNCTION public.prepare_firewood_live_handoff(p_source text, p_request jsonb, p_capability jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare r app_private.firewood_live_handoffs%rowtype;o jsonb;c jsonb;customer public.customers%rowtype;location public.service_locations%rowtype;invoice public.invoices%rowtype;token uuid;
 candidates integer;exact_candidates integer;location_count integer;delivery_street text;lock_key text;h text;wood integer;stacking integer;total integer;
begin
 perform app_private.firewood_live_handoff_source(p_source);
 if jsonb_typeof(p_request)is distinct from'object'or coalesce(p_request->>'order_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  then raise exception 'Invalid Firewood order identity.'using errcode='22023';end if;
 -- Match office issuance: source, order lock, approval row, invoice/handoff.
 perform pg_advisory_xact_lock(hashtextextended('firewood-live-v1-order:'||p_source||':'||(p_request->>'order_id'),0));
 perform app_private.validate_firewood_live_handoff_request(p_source,p_request);o:=p_request->'order';c:=o->'contact';total:=(o->>'principal_cents')::integer;wood:=(o->>'wood_cents')::integer;stacking:=(o->>'stacking_cents')::integer;
 h:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 select * into r from app_private.firewood_live_handoffs where source_id=p_source and order_id=(p_request->>'order_id')::uuid;
 if found then
  if r.payload_hash<>h or r.payload<>p_request then raise exception 'Firewood order identity changed.'using errcode='23505';end if;
  return app_private.firewood_live_handoff_receipt(p_source,r.order_id,true);
 end if;
 perform app_private.validate_firewood_live_handoff_capability(p_capability);
  -- This lock serializes this importer's contact resolution without granting a
  -- new customer merge/update permission. Existing records are never overwritten.
  for lock_key in select key from unnest(array['firewood-contact:email:'||lower(c->>'email'),'firewood-contact:phone:'||(c->>'phone')])key order by key loop
   perform pg_advisory_xact_lock(hashtextextended(lock_key,0));
  end loop;
  select count(*)into candidates from public.customers cu where lower(btrim(cu.email))=lower(c->>'email')or right(regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g'),10)=c->>'phone';
  -- Shared household contact details do not authorize a merge. Reuse only
  -- one exact, active residential match; ambiguous or partial matches stay held.
  if candidates>0 then
   select count(*)into exact_candidates from public.customers cu
    where cu.status='active'and cu.archived_at is null and cu.customer_type='residential'and cu.organization_id is null
    and lower(btrim(cu.display_name))=lower(c->>'name')
    and lower(btrim(coalesce(cu.email,'')))=lower(c->>'email')
    and right(regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g'),10)=c->>'phone';
   if exact_candidates<>1 then raise exception 'Firewood contact requires review.'using errcode='23505';end if;
   select *into strict customer from public.customers cu
    where cu.status='active'and cu.archived_at is null and cu.customer_type='residential'and cu.organization_id is null
    and lower(btrim(cu.display_name))=lower(c->>'name')
    and lower(btrim(coalesce(cu.email,'')))=lower(c->>'email')
    and right(regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g'),10)=c->>'phone'for update;
  else
   insert into public.customers(display_name,email,phone,customer_type)values(c->>'name',c->>'email',c->>'phone','residential')returning * into customer;
  end if;
  delivery_street:=concat_ws(E'\n',c->>'address',nullif(c->>'address2',''));
  select count(*)into location_count from public.service_locations l where l.customer_id=customer.id and l.organization_id is null
   and lower(btrim(l.street))=lower(delivery_street)and lower(btrim(l.city))=lower(c->>'city')and upper(l.state)=c->>'state'and coalesce(l.postal_code,'')=c->>'postal';
  if location_count>1 then raise exception 'Firewood address requires review.'using errcode='23505';end if;
  if location_count=1 then select * into strict location from public.service_locations l where l.customer_id=customer.id and l.organization_id is null
   and lower(btrim(l.street))=lower(delivery_street)and lower(btrim(l.city))=lower(c->>'city')and upper(l.state)=c->>'state'and coalesce(l.postal_code,'')=c->>'postal'for share;
   if location.archived_at is not null then raise exception 'Firewood address requires review.'using errcode='23505';end if;
  else insert into public.service_locations(customer_id,street,city,state,postal_code)values(customer.id,delivery_street,c->>'city',c->>'state',c->>'postal')returning * into location;end if;

 insert into public.invoices(invoice_number,customer_id,service_location_id,status,subtotal_cents,tax_cents,total_cents,balance_due_cents,due_at,automatic_reminders_enabled,document_terms_version,purchase_order_reference,payment_terms)
 values('INV-FW-'||upper(p_request->>'order_id'),customer.id,location.id,'sent',total,0,total,total,null,false,'firewood-household-live-2026-10-29-v1',p_request->>'reference','Firewood prepayment invoice. Delivery is included; scheduling follows payment confirmation. Payment preference is not payment. Review any eligible credit-card fee before confirming payment.')returning * into invoice;
 insert into public.invoice_line_items(invoice_id,name,description,quantity,unit_price_cents,total_cents,sort_order)values(invoice.id,'Firewood — '||case o->>'quantity'when'half'then'half cord'when'full'then'full cord'else'two cords'end||', delivered','Accepted Website order; delivery included.',1,wood,wood,0);
 if(o->>'stacking')::boolean then insert into public.invoice_line_items(invoice_id,name,description,quantity,unit_price_cents,total_cents,sort_order)values(invoice.id,'Firewood stacking','Once per delivery, as accepted before payment.',1,stacking,stacking,1);end if;
 insert into public.invoice_portal_tokens(invoice_id,customer_id,organization_id,token_hash,token_hint,token_encrypted,expires_at,created_by_user_id)values(invoice.id,customer.id,null,p_capability->>'token_hash',p_capability->>'token_hint',p_capability->>'token_encrypted',(p_capability->>'expires_at')::timestamptz,null)returning id into token;
 insert into app_private.firewood_live_handoffs(source_id,order_id,reference,payload,payload_hash,principal_cents,customer_id,invoice_id,token_id)values(p_source,(p_request->>'order_id')::uuid,p_request->>'reference',p_request,h,total,customer.id,invoice.id,token);
 if o->'office_approval'<>'null'::jsonb then
  update app_private.firewood_live_price_approvals set consumed_invoice_id=invoice.id where id=(o#>>'{office_approval,approval_id}')::uuid and consumed_invoice_id is null and revoked_at is null and expires_at>clock_timestamp();
  if not found then raise exception 'Office approval already consumed or expired.'using errcode='40001';end if;
 end if;
 insert into public.activity_log(actor_type,subject_type,subject_id,event_type,metadata_json)values('system','invoice',invoice.id,'firewood_live_v1_prepared',jsonb_build_object('order_id',p_request->>'order_id','source_id',p_source,'principal_cents',total,'paid',false,'receipt_authority','crm','customer_email_sent',false,'delivery_completed',false,'livemode',true));
 return app_private.firewood_live_handoff_receipt(p_source,(p_request->>'order_id')::uuid,false);
end $function$
;

CREATE OR REPLACE FUNCTION public.list_firewood_live_office(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
 SET lock_timeout TO '3s'
AS $function$
declare items jsonb;total bigint;begin
 perform app_private.firewood_live_office_actor();
 if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size<1 or p_page_size>50 then raise exception 'Invalid office page.'using errcode='22023';end if;
 with existing_rows as(select coalesce(h.order_id,r.order_id)order_id,coalesce(h.reference,r.reference)reference,h.invoice_id,
 case when h.invoice_id is null then'price_request'else'accepted_order'end kind,
 case when h.invoice_id is not null then coalesce(w.state,'active')else app_private.firewood_live_office_price_receipt(r.order_id)->>'status'end state,
 case when h.invoice_id is null then r.revision else coalesce(w.revision,0)end revision,
 coalesce(h.payload#>>'{order,contact,name}',r.draft#>>'{contact,name}')customer_name,
 coalesce(h.payload#>>'{order,quantity}',r.draft->>'quantity')quantity,
 coalesce(h.payload#>'{order,stacking}',r.draft->'stacking')stacking,h.principal_cents,
 coalesce(h.created_at,r.created_at)created_at
 from app_private.firewood_live_handoffs h full join app_private.firewood_live_office_requests r on r.source_id=h.source_id and r.order_id=h.order_id left join app_private.firewood_live_order_workflows w on w.invoice_id=h.invoice_id
 where h.invoice_id is not null or not exists(select 1 from app_private.fwofficev2_orders o where o.id=r.order_id)),
 saved_rows as(select o.id order_id,o.request->>'reference' reference,null::uuid invoice_id,
 'saved_order'::text kind,case when p.status='review'then'preparation_review'else'preparing'end state,
 p.tries revision,o.request#>>'{order,contact,name}' customer_name,o.request#>>'{order,quantity}' quantity,
 o.request#>'{order,stacking}' stacking,(o.request#>>'{order,principal_cents}')::integer principal_cents,
 to_timestamp(o.created_at/1000.0)created_at from app_private.fwofficev2_orders o
 join app_private.fwofficev2_prepare p using(id)
 where not exists(select 1 from app_private.firewood_live_handoffs h where h.order_id=o.id)),
 rows as(select *from existing_rows union all select *from saved_rows),
 page as(select *from rows order by created_at desc,order_id desc limit p_page_size offset(p_page-1)*p_page_size)
 select(select count(*)from rows),coalesce((select jsonb_agg(to_jsonb(page)order by created_at desc,order_id desc)from page),'[]'::jsonb)into total,items;
 return jsonb_build_object('page',p_page,'page_size',p_page_size,'total_count',total,'items',items);
end $function$
;

CREATE OR REPLACE FUNCTION public.inspect_firewood_live_office(p_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
 SET lock_timeout TO '3s'
AS $function$
declare saved app_private.fwofficev2_orders%rowtype;prep app_private.fwofficev2_prepare%rowtype;preparation jsonb;h app_private.firewood_live_handoffs%rowtype;r app_private.firewood_live_office_requests%rowtype;lifecycle jsonb;money jsonb;decision text;events jsonb;order_data jsonb;price jsonb;begin
 perform app_private.firewood_live_office_actor();select *into h from app_private.firewood_live_handoffs where order_id=p_order;
 select *into r from app_private.firewood_live_office_requests where order_id=p_order;
 select *into saved from app_private.fwofficev2_orders where id=p_order;
 select *into prep from app_private.fwofficev2_prepare where id=p_order;
 if h.invoice_id is null and r.order_id is null and saved.id is null then raise exception 'Firewood order not found.'using errcode='P0002';end if;
 if h.invoice_id is not null then
  perform 1 from public.invoices where id=h.invoice_id for share;
  lifecycle:=app_private.firewood_live_workflow_json(h.invoice_id);money:=app_private.firewood_live_workflow_money(h.invoice_id);decision:=app_private.firewood_live_cancellation_disposition(money,lifecycle->>'refund_eligibility');
  order_data:=jsonb_build_object('order_id',h.order_id,'reference',h.reference,'invoice_id',h.invoice_id,'invoice_number',(select invoice_number from public.invoices where id=h.invoice_id),'principal_cents',h.principal_cents,'wood_cents',h.payload#>'{order,wood_cents}','stacking_cents',h.payload#>'{order,stacking_cents}','quantity',h.payload#>'{order,quantity}','stacking',h.payload#>'{order,stacking}','contact',h.payload#>'{order,contact}','terms_version',h.payload#>'{order,terms,version}');
 elsif saved.id is not null then
  order_data:=jsonb_build_object('order_id',saved.id,'reference',saved.request->>'reference','invoice_id',null,'invoice_number',null,
   'principal_cents',saved.request#>'{order,principal_cents}','wood_cents',saved.request#>'{order,wood_cents}',
   'stacking_cents',saved.request#>'{order,stacking_cents}','quantity',saved.request#>'{order,quantity}',
   'stacking',saved.request#>'{order,stacking}','contact',saved.request#>'{order,contact}','terms_version',saved.request#>'{order,terms,version}');
  preparation:=jsonb_build_object('status',prep.status,'tries',prep.tries,
   'can_retry',prep.status='review'and prep.lease is null and prep.invoice_id is null and prep.receipt is null);
 else order_data:=jsonb_build_object('order_id',r.order_id,'reference',r.reference,'invoice_id',null,'invoice_number',null,'principal_cents',null,'wood_cents',null,'stacking_cents',null,'quantity',r.draft->'quantity','stacking',r.draft->'stacking','contact',r.draft->'contact','terms_version','firewood-household-live-2026-10-29-v1');end if;
 if r.order_id is not null then price:=app_private.firewood_live_office_price_receipt(p_order);end if;
 select coalesce(jsonb_agg(jsonb_build_object('revision',e.revision,'operation',e.operation,'actor_id',e.actor_id,'details',e.details,'created_at',e.created_at)order by e.created_at,e.id),'[]'::jsonb)into events from(select *from app_private.firewood_live_office_events where order_id=p_order order by created_at desc,id desc limit 20)e;
 return jsonb_build_object('preparation',preparation,'order',order_data,'price_request',price,'lifecycle',lifecycle,'financial',money,'financial_disposition',decision,'can_confirm',coalesce(lifecycle->>'state'='cancellation_requested'and decision in('no_refund_due','refund_complete'),false),'confirmation_blockers',case when lifecycle is null or lifecycle->>'state'<>'cancellation_requested'then jsonb_build_array('cancellation_not_requested')when decision not in('no_refund_due','refund_complete')then jsonb_build_array(decision)else'[]'::jsonb end,'can_credit',coalesce(h.invoice_id is not null and app_private.firewood_live_credit_blockers(h.invoice_id)='[]'::jsonb,false),'credit_blockers',case when h.invoice_id is null then jsonb_build_array('invoice_not_accepted')else app_private.firewood_live_credit_blockers(h.invoice_id)end,'events',events);
end $function$
;


CREATE FUNCTION public.retry_firewood_live_preparation(p_order uuid,p_expected_revision integer,p_reason text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' SET lock_timeout='3s' AS $$
declare actor uuid;payload jsonb;replay jsonb;result jsonb;saved app_private.fwofficev2_orders%rowtype;prep app_private.fwofficev2_prepare%rowtype;
begin
 actor:=app_private.firewood_live_office_actor();
 payload:=jsonb_build_object('order_id',p_order,'revision',p_expected_revision,'reason',p_reason);
 replay:=app_private.firewood_live_office_replay(actor,p_request_id,'preparation_retry_requested',payload);
 if replay is not null then return replay;end if;
 if p_reason is null or length(btrim(p_reason))not between 1 and 500 or p_expected_revision is null or p_expected_revision<0
  then raise exception 'Saved order and review reason required.'using errcode='22023';end if;
 select *into strict saved from app_private.fwofficev2_orders where id=p_order;
 -- Same source/order lock as invoice issuance. A retry never changes accepted bytes.
 perform pg_advisory_xact_lock(hashtextextended('firewood-live-v1-order:'||(saved.request->>'source_id')||':'||p_order::text,0));
 select *into strict prep from app_private.fwofficev2_prepare where id=p_order for update;
 if prep.status<>'review'or prep.tries<>p_expected_revision or prep.lease is not null or prep.receipt is not null or prep.invoice_id is not null
  or exists(select 1 from app_private.firewood_live_handoffs where order_id=p_order)
  then raise exception 'Saved order preparation changed. Refresh before retrying.'using errcode='40001';end if;
 update app_private.fwofficev2_prepare set status='pending',retry_at=0 where id=p_order;
 insert into app_private.firewood_live_office_events(order_id,invoice_id,revision,operation,actor_id,details)
  values(p_order,null,prep.tries+1,'preparation_retry_requested',actor,jsonb_build_object('reason',btrim(p_reason),'previous_tries',prep.tries,'order_changed',false,'payment_created',false,'email_sent',false));
 result:=jsonb_build_object('order_id',p_order,'revision',prep.tries+1,'status','pending');
 return app_private.firewood_live_office_ack(actor,p_request_id,'preparation_retry_requested',payload,result);
end $$;
REVOKE ALL ON FUNCTION public.retry_firewood_live_preparation(uuid,integer,text,uuid) FROM public,anon,service_role;
GRANT EXECUTE ON FUNCTION public.retry_firewood_live_preparation(uuid,integer,text,uuid) TO authenticated;
