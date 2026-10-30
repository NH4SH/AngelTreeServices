-- Owned local/native prototype upgrade only. Not a managed installation.
-- Keeps every source flag, invoice, token, payment, mapping and history row.
begin;
do $$begin
 if current_database()<>'fw_crm_v2_full_qa' or not exists(select 1 from app_private.firewood_handoff_sources where id='website_firewood_invoice_v2'and stripe_account_id='acct_1UU9U8RAZXGe6tX0'and environment_id~'^ats_fwhandoff_home_[a-f0-9]{12}$'and not collector_enabled)then
  raise exception 'Expected held, owned native QA prototype required.'using errcode='42501';end if;
end $$;
alter table app_private.firewood_handoff_sources drop constraint firewood_handoff_sources_environment_id_check;
alter table app_private.firewood_handoff_sources add constraint firewood_handoff_sources_environment_id_check check(environment_id~'^ats_fwhandoff_(home_)?[a-f0-9]{12}$'or environment_id='ats_fwhandoff_staging_gbyhdsuiqeslgjdnbqng');
create or replace function app_private.firewood_handoff_source(p_source text)returns app_private.firewood_handoff_sources language plpgsql security invoker set search_path='' as $$
declare s app_private.firewood_handoff_sources%rowtype;
begin
 if auth.uid()is not null or current_setting('role',true)is distinct from'service_role'then raise exception 'Firewood server operation only.'using errcode='42501';end if;
 select * into s from app_private.firewood_handoff_sources where id=p_source and enabled;
 if not found then raise exception 'Firewood handoff source unavailable.'using errcode='42501';end if;return s;
end $$;
create or replace function public.get_firewood_handoff_context(p_source text)returns jsonb language plpgsql security definer set search_path='' as $$
declare s app_private.firewood_handoff_sources%rowtype;
begin s:=app_private.firewood_handoff_source(p_source);return jsonb_build_object('environment_id',s.environment_id,'account_id',s.stripe_account_id,'livemode',false);end $$;
create or replace function app_private.firewood_handoff_canonical(v jsonb) returns text language sql immutable security invoker set search_path='' as $$
 select case jsonb_typeof(v)
 when 'object' then '{'||coalesce((select string_agg(to_jsonb(key)::text||':'||app_private.firewood_handoff_canonical(value),',' order by key collate "C") from jsonb_each(v)),'')||'}'
 when 'array' then '['||coalesce((select string_agg(app_private.firewood_handoff_canonical(value),',' order by ordinality) from jsonb_array_elements(v) with ordinality),'')||']'
 else v::text end;
$$;
create or replace function app_private.validate_firewood_handoff_request(p_source text,p_request jsonb)returns void
language plpgsql security invoker set search_path='' as $$
declare s app_private.firewood_handoff_sources%rowtype;o jsonb;c jsonb;a jsonb;wood integer;stacking integer;k text;maxlen integer;
begin
 s:=app_private.firewood_handoff_source(p_source);o:=p_request->'order';c:=o->'contact';a:=o->'office_approval';
 if jsonb_typeof(p_request)is distinct from'object' or octet_length(p_request::text)>16384
 or p_request - array['contract','source_id','account_id','mode','order_id','reference','snapshot_hash','order'] <> '{}'::jsonb
 or (select count(*) from jsonb_object_keys(p_request))<>8
 or p_request->>'contract' is distinct from 'firewood-invoice-handoff-v2' or p_request->>'mode' is distinct from 'sandbox'
 or p_request->>'source_id' is distinct from s.id or p_request->>'account_id' is distinct from s.stripe_account_id
 or coalesce(p_request->>'order_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 or p_request->>'reference' is distinct from 'FW-'||upper(left(p_request->>'order_id',8))
 or jsonb_typeof(o)is distinct from'object' or o - array['quantity','stacking','wood_cents','delivery_cents','stacking_cents','principal_cents','currency','tax_cents','tax_basis','terms','accepted_at_ms','office_approval','contact','payment_policy'] <> '{}'::jsonb
 or (select count(*) from jsonb_object_keys(o))<>14
 or jsonb_typeof(c)is distinct from'object' or c - array['name','email','phone','address','address2','city','state','postal','notes'] <> '{}'::jsonb
 or (select count(*) from jsonb_object_keys(c))<>9
 or o->'payment_policy' is distinct from '{"version":"firewood-payment-options-2026-10-29","channels":["card","ach","cash_check_pickup","check_mail"],"credit_surcharge_bps":300,"credit_eligibility":"processor_confirmed_US_credit","fee_basis":"outstanding_principal","exact_fee_review_before_confirmation":true,"receipt_authority":"crm","accepted":true}'::jsonb
 or o->>'currency' is distinct from 'usd' or o->'delivery_cents' is distinct from '0'::jsonb or o->'tax_cents' is distinct from '0'::jsonb
 or o->>'tax_basis' is distinct from 'va_domestic_use_locality_exempt' or o->'terms' is distinct from '{"version":"firewood-20261028-household-v2","currency":"usd","deliveryCents":0,"stackingCents":15000,"maximumCords":2,"notificationDays":7,"cancellationHours":48,"cutoff":"delivery-window-start","unscheduledRefund":"full","angelCancellationRefund":"full","declinedAngelRescheduleRefund":"full","lateCustomerCancellation":"non-refundable","taxBasisPoints":0,"purchaseUse":"personal-household-only","veterans":"Inform Angel before purchase; office-approved price; residential only; one discount.","timezone":"America/New_York","hash":"ecf0666b872db0a9a6b588ea25143887d51171a9606cda65d16ae792213a83a5","accepted":true,"householdUseConfirmed":true}'::jsonb
 or jsonb_typeof(o->'stacking')is distinct from'boolean'
 or p_request->>'snapshot_hash' is distinct from encode(sha256(convert_to(app_private.firewood_handoff_canonical(o),'UTF8')),'hex')
 or jsonb_typeof(o->'accepted_at_ms')is distinct from'number' or coalesce(o->>'accepted_at_ms','')!~'^[0-9]{1,16}$'
 or (o->>'accepted_at_ms')::numeric not between 1 and 9007199254740991
 or (o->>'accepted_at_ms')::numeric > extract(epoch from clock_timestamp())*1000+300000
 then raise exception 'Invalid Firewood candidate request.' using errcode='22023';end if;
 wood:=case o->>'quantity' when 'half' then 30000 when 'full' then 45000 when 'two' then 84000 end;
 stacking:=case when (o->>'stacking')::boolean then 15000 else 0 end;
 if wood is null or jsonb_typeof(o->'wood_cents')is distinct from'number' or jsonb_typeof(o->'stacking_cents')is distinct from'number' or coalesce(o->>'wood_cents','')!~'^[0-9]+$' or (o->>'wood_cents')::numeric not between 1 and wood
 or coalesce(o->>'stacking_cents','')!~'^[0-9]+$' or (o->>'stacking_cents')::numeric not between 0 and stacking
 or o->'principal_cents' is distinct from to_jsonb((o->>'wood_cents')::integer+(o->>'stacking_cents')::integer)
 then raise exception 'Invalid candidate totals.' using errcode='22023';end if;
 if a='null'::jsonb then
  if o->'wood_cents' is distinct from to_jsonb(wood) or o->'stacking_cents' is distinct from to_jsonb(stacking) then raise exception 'Office approval required.'using errcode='22023';end if;
 else
  if jsonb_typeof(a)is distinct from'object' or a - array['approval_id','approved_at_ms','residential','single_discount_confirmed'] <> '{}'::jsonb
   or (select count(*) from jsonb_object_keys(a))<>4 or coalesce(a->>'approval_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   or a->'residential' is distinct from 'true'::jsonb or a->'single_discount_confirmed' is distinct from 'true'::jsonb
   or jsonb_typeof(a->'approved_at_ms')is distinct from'number' or coalesce(a->>'approved_at_ms','')!~'^[0-9]{1,16}$'
   or (a->>'approved_at_ms')::numeric not between 1 and (o->>'accepted_at_ms')::numeric
  then raise exception 'Invalid office approval.'using errcode='22023';end if;
 end if;
 for k,maxlen in select * from (values ('name',100),('email',254),('phone',10),('address',150),('address2',100),('city',100),('state',2),('postal',10),('notes',500)) t(key,len) loop
  if jsonb_typeof(c->k)is distinct from'string' or length(c->>k)>maxlen or c->>k is distinct from btrim(c->>k)
   or (k not in('address2','notes') and length(c->>k)=0) then raise exception 'Invalid contact.'using errcode='22023';end if;
 end loop;
 if c->>'email'!~'^[^[:space:]@]+@[^[:space:]@]+\.invalid$' or c->>'email'<>lower(c->>'email')
 or c->>'phone'!~'^[0-9]{10}$' or c->>'state' is distinct from 'VA' or c->>'postal'!~'^[0-9]{5}(-[0-9]{4})?$'
 then raise exception 'Synthetic contact required.'using errcode='22023';end if;
end $$;
create or replace function app_private.firewood_handoff_receipt(p_source text,p_order uuid,p_replayed boolean)returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('contract','firewood-invoice-handoff-v2','source_id',r.source_id,'account_id',r.payload->>'account_id','mode','sandbox','order_id',r.order_id,'reference',r.reference,'snapshot_hash',r.payload->>'snapshot_hash','invoice_id',r.invoice_id,'invoice_number',i.invoice_number,'preparation_status','prepared','principal_cents',r.principal_cents,'token_encrypted',case when t.revoked_at is null and t.expires_at>clock_timestamp()then t.token_encrypted else null end,'expires_at',t.expires_at,'capability_version',r.capability_version,'replayed',p_replayed,'receipt_authority','crm','order_confirmation_authority','website','payment_retry_required',false,'delivery_completed',false,'payment_execution_ready',s.collector_enabled and s.surcharge_reporting_enabled,'execution_blockers',case when s.collector_enabled and s.surcharge_reporting_enabled then '[]'::jsonb else jsonb_build_array('collector_source_not_enabled')end)
 from app_private.firewood_handoffs r join app_private.firewood_handoff_sources s on s.id=r.source_id join public.invoices i on i.id=r.invoice_id join public.invoice_portal_tokens t on t.id=r.token_id where r.source_id=p_source and r.order_id=p_order;
$$;
create or replace function public.prepare_firewood_handoff(p_source text,p_request jsonb,p_capability jsonb)returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r app_private.firewood_handoffs%rowtype;o jsonb;c jsonb;customer public.customers%rowtype;location public.service_locations%rowtype;invoice public.invoices%rowtype;token uuid;
 candidates integer;location_count integer;delivery_street text;lock_key text;h text;wood integer;stacking integer;total integer;
begin
 perform app_private.validate_firewood_handoff_request(p_source,p_request);o:=p_request->'order';c:=o->'contact';total:=(o->>'principal_cents')::integer;wood:=(o->>'wood_cents')::integer;stacking:=(o->>'stacking_cents')::integer;
 h:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');perform pg_advisory_xact_lock(hashtextextended('firewood-v2-order:'||p_source||':'||(p_request->>'order_id'),0));
 select * into r from app_private.firewood_handoffs where source_id=p_source and order_id=(p_request->>'order_id')::uuid;
 if found then
  if r.payload_hash<>h or r.payload<>p_request then raise exception 'Firewood order identity changed.'using errcode='23505';end if;
  return app_private.firewood_handoff_receipt(p_source,r.order_id,true);
 end if;
 if jsonb_typeof(p_capability)is distinct from'object' or coalesce(p_capability->>'token_hash','')!~'^[a-f0-9]{64}$'or coalesce(p_capability->>'token_hint','')!~'^[A-Za-z0-9_-]{6}$'or coalesce(p_capability->>'token_encrypted','')!~'^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'or(p_capability->>'expires_at')::timestamptz not between clock_timestamp()+interval'1 minute'and clock_timestamp()+interval'31 minutes' then raise exception 'Invalid Firewood capability.'using errcode='22023';end if;
  -- This lock serializes this importer's contact resolution without granting a
  -- new customer merge/update permission. Existing records are never overwritten.
  for lock_key in select key from unnest(array['firewood-contact:email:'||lower(c->>'email'),'firewood-contact:phone:'||(c->>'phone')])key order by key loop
   perform pg_advisory_xact_lock(hashtextextended(lock_key,0));
  end loop;
  select count(*)into candidates from public.customers cu where lower(btrim(cu.email))=lower(c->>'email')or right(regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g'),10)=c->>'phone';
  if candidates>1 then raise exception 'Firewood contact requires review.'using errcode='23505';end if;
  if candidates=1 then
   select * into strict customer from public.customers cu where lower(btrim(cu.email))=lower(c->>'email')or right(regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g'),10)=c->>'phone'for update;
   if customer.status<>'active'or customer.organization_id is not null or lower(btrim(customer.display_name))<>lower(c->>'name')
    or lower(btrim(coalesce(customer.email,'')))<>lower(c->>'email')or right(regexp_replace(coalesce(customer.phone,''),'[^0-9]','','g'),10)<>c->>'phone'
    then raise exception 'Firewood contact requires review.'using errcode='23505';end if;
  else
   insert into public.customers(display_name,email,phone,customer_type)values(c->>'name',c->>'email',c->>'phone','residential')returning * into customer;
  end if;
  delivery_street:=concat_ws(E'\n',c->>'address',nullif(c->>'address2',''));
  select count(*)into location_count from public.service_locations l where l.customer_id=customer.id and l.organization_id is null
   and lower(btrim(l.street))=lower(delivery_street)and lower(btrim(l.city))=lower(c->>'city')and upper(l.state)=c->>'state'and coalesce(l.postal_code,'')=c->>'postal';
  if location_count>1 then raise exception 'Firewood address requires review.'using errcode='23505';end if;
  if location_count=1 then select * into strict location from public.service_locations l where l.customer_id=customer.id and l.organization_id is null
   and lower(btrim(l.street))=lower(delivery_street)and lower(btrim(l.city))=lower(c->>'city')and upper(l.state)=c->>'state'and coalesce(l.postal_code,'')=c->>'postal'for share;
  else insert into public.service_locations(customer_id,street,city,state,postal_code)values(customer.id,delivery_street,c->>'city',c->>'state',c->>'postal')returning * into location;end if;

 insert into public.invoices(invoice_number,customer_id,service_location_id,status,subtotal_cents,tax_cents,total_cents,balance_due_cents,due_at,automatic_reminders_enabled,document_terms_version,purchase_order_reference,payment_terms)
 values('TEST-FW2-'||(p_request->>'order_id'),customer.id,location.id,'sent',total,0,total,total,null,false,'firewood-handoff-test-2026-10-29',p_request->>'reference','Sandbox prepayment invoice. Payment preference is not payment. Exact eligible credit-card fee must be reviewed before confirmation. No delivery is completed.')returning * into invoice;
 insert into public.invoice_line_items(invoice_id,name,description,quantity,unit_price_cents,total_cents,sort_order)values(invoice.id,'Firewood — '||case o->>'quantity'when'half'then'half cord'when'full'then'full cord'else'two cords'end||', delivered','Accepted Website order; delivery included.',1,wood,wood,0);
 if(o->>'stacking')::boolean then insert into public.invoice_line_items(invoice_id,name,description,quantity,unit_price_cents,total_cents,sort_order)values(invoice.id,'Firewood stacking','Once per delivery, as accepted before payment.',1,stacking,stacking,1);end if;
 insert into public.invoice_portal_tokens(invoice_id,customer_id,organization_id,token_hash,token_hint,token_encrypted,expires_at,created_by_user_id)values(invoice.id,customer.id,null,p_capability->>'token_hash',p_capability->>'token_hint',p_capability->>'token_encrypted',(p_capability->>'expires_at')::timestamptz,null)returning id into token;
 insert into app_private.firewood_handoffs(source_id,order_id,reference,payload,payload_hash,principal_cents,customer_id,invoice_id,token_id)values(p_source,(p_request->>'order_id')::uuid,p_request->>'reference',p_request,h,total,customer.id,invoice.id,token);
 insert into public.activity_log(actor_type,subject_type,subject_id,event_type,metadata_json)values('system','invoice',invoice.id,'firewood_v2_prepared',jsonb_build_object('order_id',p_request->>'order_id','source_id',p_source,'principal_cents',total,'paid',false,'receipt_authority','crm','customer_email_sent',false,'delivery_completed',false,'test_only',true));
 return app_private.firewood_handoff_receipt(p_source,(p_request->>'order_id')::uuid,false);
end $$;
create or replace function public.renew_firewood_handoff(p_source text,p_order uuid,p_invoice uuid,p_hash text,p_version integer,p_capability jsonb)returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r app_private.firewood_handoffs%rowtype;t public.invoice_portal_tokens%rowtype;i public.invoices%rowtype;new_token uuid;
begin
 perform app_private.firewood_handoff_source(p_source);select * into strict r from app_private.firewood_handoffs where source_id=p_source and order_id=p_order;
 select * into strict i from public.invoices where id=r.invoice_id for update;select * into strict r from app_private.firewood_handoffs where source_id=p_source and order_id=p_order for update;
 if r.invoice_id<>p_invoice or r.payload->>'snapshot_hash'<>p_hash or i.status='void'then raise exception 'Firewood binding changed.'using errcode='23514';end if;
 if r.capability_version<>p_version then
  if r.last_renew_from=p_version and r.capability_version=p_version+1 then return app_private.firewood_handoff_receipt(p_source,p_order,true);end if;
  raise exception 'Capability version changed.'using errcode='40001';
 end if;
 select * into strict t from public.invoice_portal_tokens where id=r.token_id for update;
 if t.revoked_at is not null then raise exception 'Portal revoked; office review required.'using errcode='42501';end if;
 if coalesce(p_capability->>'token_hash','')!~'^[a-f0-9]{64}$'or coalesce(p_capability->>'token_hint','')!~'^[A-Za-z0-9_-]{6}$'or coalesce(p_capability->>'token_encrypted','')!~'^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'or(p_capability->>'expires_at')::timestamptz not between clock_timestamp()+interval'1 minute'and clock_timestamp()+interval'31 minutes'then raise exception 'Invalid Firewood capability.'using errcode='22023';end if;
 update public.invoice_portal_tokens set revoked_at=clock_timestamp()where id=t.id;
 insert into public.invoice_portal_tokens(invoice_id,customer_id,organization_id,token_hash,token_hint,token_encrypted,expires_at,created_by_user_id)values(r.invoice_id,r.customer_id,null,p_capability->>'token_hash',p_capability->>'token_hint',p_capability->>'token_encrypted',(p_capability->>'expires_at')::timestamptz,null)returning id into new_token;
 update app_private.firewood_handoffs set token_id=new_token,last_renew_from=p_version,capability_version=capability_version+1 where source_id=p_source and order_id=p_order;
 return app_private.firewood_handoff_receipt(p_source,p_order,false);
end $$;
create or replace function public.read_firewood_handoff(p_source text,p_order uuid,p_invoice uuid,p_hash text)returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r app_private.firewood_handoffs%rowtype;i public.invoices%rowtype;result jsonb;
begin
 perform app_private.firewood_handoff_source(p_source);select * into strict r from app_private.firewood_handoffs where source_id=p_source and order_id=p_order;
 select * into strict i from public.invoices where id=r.invoice_id for share;
 if r.invoice_id<>p_invoice or r.payload->>'snapshot_hash'<>p_hash or i.customer_id<>r.customer_id or i.total_cents<>r.principal_cents or i.automatic_reminders_enabled then raise exception 'Firewood invoice requires review.'using errcode='23514';end if;
 select jsonb_build_object('invoice',to_jsonb(i),'payments',coalesce((select jsonb_agg(to_jsonb(p)order by p.id)from public.payments p where p.invoice_id=i.id),'[]'::jsonb),'attempts',coalesce((select jsonb_agg(to_jsonb(a)order by a.id)from public.invoice_checkout_sessions a where a.invoice_id=i.id),'[]'::jsonb),'refunds',coalesce((select jsonb_agg(jsonb_build_object('refund_id',f.refund_id,'payment_id',f.payment_id,'amount_cents',f.amount_cents,'currency',f.currency,'status',f.status)order by f.refund_id)from app_private.stripe_refund_observations f join public.payments p on p.id=f.payment_id where p.invoice_id=i.id),'[]'::jsonb),'original_paid_evidence',r.original_paid_evidence) into result;
 return result||jsonb_build_object('ledger_hash',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
end $$;
create or replace function public.record_firewood_handoff_observation(p_source text,p_order uuid,p_invoice uuid,p_hash text,p_ledger_hash text,p_financial jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare r app_private.firewood_handoffs%rowtype;i public.invoices%rowtype;h text;current_ledger jsonb;
begin
 perform app_private.firewood_handoff_source(p_source);select * into strict r from app_private.firewood_handoffs where source_id=p_source and order_id=p_order;
 select * into strict i from public.invoices where id=r.invoice_id for share;select * into strict r from app_private.firewood_handoffs where source_id=p_source and order_id=p_order for update;
 if r.invoice_id<>p_invoice or r.payload->>'snapshot_hash'<>p_hash or p_financial#>'{totals,invoice_principal_cents}'is distinct from to_jsonb(i.total_cents)or p_financial#>'{totals,balance_due_cents}'is distinct from to_jsonb(i.balance_due_cents)then raise exception 'Financial observation changed.'using errcode='40001';end if;
 current_ledger:=public.read_firewood_handoff(p_source,p_order,p_invoice,p_hash);
 if current_ledger->>'ledger_hash'is distinct from p_ledger_hash then raise exception 'Financial observation changed.'using errcode='40001';end if;
 h:=encode(sha256(convert_to(p_financial::text,'UTF8')),'hex');
 if r.observation_hash is distinct from h then update app_private.firewood_handoffs set observation_revision=observation_revision+1,observation_hash=h,observation=p_financial where source_id=p_source and order_id=p_order returning * into r;
 insert into app_private.firewood_handoff_observations(source_id,order_id,revision,snapshot)values(p_source,p_order,r.observation_revision,p_financial);end if;
 return jsonb_build_object('observation_revision',r.observation_revision,'financial',p_financial);
end $$;
create or replace function app_private.capture_firewood_handoff_payment()returns trigger language plpgsql security definer set search_path='' as $$
declare r app_private.firewood_handoffs%rowtype;net bigint;gross bigint;fee bigint;ids jsonb;
begin
 select * into r from app_private.firewood_handoffs where invoice_id=new.invoice_id;
 if not found then return new;end if;
 select * into strict r from app_private.firewood_handoffs where invoice_id=new.invoice_id for update;
 insert into app_private.firewood_handoff_payment_events(invoice_id,payment_id,financial)values(new.invoice_id,new.id,to_jsonb(new));
 if r.original_paid_evidence is null then
  select coalesce(sum(p.amount_cents::bigint),0),coalesce(sum(p.total_collected_cents::bigint),0),coalesce(sum(p.surcharge_cents::bigint),0),jsonb_agg(p.id order by p.id)into net,gross,fee,ids from public.payments p where p.invoice_id=new.invoice_id and(p.status in('succeeded','refunded')or p.succeeded_at is not null);
  if net=r.principal_cents then update app_private.firewood_handoffs set original_paid_evidence=jsonb_build_object('paid',true,'observed_at',clock_timestamp(),'principal_cents',r.principal_cents,'gross_collected_cents',gross,'surcharge_collected_cents',fee,'payment_ids',ids)where invoice_id=new.invoice_id;end if;
 end if;return new;
end $$;
create or replace function app_private.guard_firewood_handoff_history()returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_TABLE_NAME<>'firewood_handoffs'then raise exception 'Firewood financial history is immutable.'using errcode='23514';end if;
 if old.payload is distinct from new.payload or old.payload_hash is distinct from new.payload_hash or old.source_id is distinct from new.source_id or old.order_id is distinct from new.order_id or old.invoice_id is distinct from new.invoice_id or old.customer_id is distinct from new.customer_id or old.principal_cents is distinct from new.principal_cents or(old.original_paid_evidence is not null and old.original_paid_evidence is distinct from new.original_paid_evidence)then raise exception 'Firewood handoff identity is immutable.'using errcode='23514';end if;return new;
end $$;
create or replace function app_private.guard_firewood_handoff_invoice()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='invoices'then
  if exists(select 1 from app_private.firewood_handoffs where invoice_id=old.id)and(new.total_cents is distinct from old.total_cents or new.subtotal_cents is distinct from old.subtotal_cents or new.tax_cents is distinct from old.tax_cents or new.customer_id is distinct from old.customer_id or new.organization_id is distinct from old.organization_id or new.service_location_id is distinct from old.service_location_id or new.job_id is distinct from old.job_id or new.document_terms_version is distinct from old.document_terms_version or new.automatic_reminders_enabled)then raise exception 'Prepared Firewood order is frozen; office review required.'using errcode='23514';end if;return new;
 end if;
 if exists(select 1 from app_private.firewood_handoffs where invoice_id=case when TG_OP='DELETE'then old.invoice_id else new.invoice_id end)then raise exception 'Prepared Firewood lines are frozen; office review required.'using errcode='23514';end if;
 if TG_OP='DELETE'then return old;else return new;end if;
end $$;
create or replace function public.get_firewood_collector_context(p_invoice uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare r app_private.firewood_handoffs%rowtype;s app_private.firewood_handoff_sources%rowtype;allowed boolean;review boolean;balance integer;
begin
 if auth.uid()is not null or current_setting('role',true)is distinct from'service_role'then raise exception 'Server operation only.'using errcode='42501';end if;
 select * into r from app_private.firewood_handoffs where invoice_id=p_invoice;
 if not found then return jsonb_build_object('managed',false);end if;
 select * into strict s from app_private.firewood_handoff_sources where id=r.source_id;
 select balance_due_cents into strict balance from public.invoices where id=p_invoice;
 review:=exists(select 1 from public.payments p where p.invoice_id=p_invoice and(p.refunded_principal_cents>0 or p.refunded_surcharge_cents>0 or p.dispute_status is not null))or exists(select 1 from app_private.stripe_refund_observations f join public.payments p on p.id=f.payment_id where p.invoice_id=p_invoice and f.status in('pending','requires_action'))or(r.original_paid_evidence is not null and balance>0);
 allowed:=s.enabled and s.collector_enabled and s.surcharge_reporting_enabled and r.original_paid_evidence is null and not review;
 return jsonb_build_object('managed',true,'allowed',allowed,'review_required',review,'already_paid',r.original_paid_evidence is not null and balance=0 and not review,'source_id',s.id,'order_id',r.order_id,'account_id',s.stripe_account_id,'receipt_authority','crm','surcharge_reporting',s.surcharge_reporting_enabled);
end $$;
revoke all on function public.get_firewood_collector_context(uuid)from public;
do $$declare f record;r text;begin
 for f in select p.oid::regprocedure as sig,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','app_private')and(p.proname like '%firewood_handoff%'or p.proname='get_firewood_collector_context') loop
  execute format('revoke all on function %s from public',f.sig);
  foreach r in array array['anon','authenticated','service_role']loop if exists(select 1 from pg_roles where rolname=r)then execute format('revoke all on function %s from %I',f.sig,r);end if;end loop;
  if f.nspname='public'and exists(select 1 from pg_roles where rolname='service_role')then execute format('grant execute on function %s to service_role',f.sig);end if;
 end loop;
 foreach r in array array['anon','authenticated','service_role']loop if exists(select 1 from pg_roles where rolname=r)then execute format('revoke all on app_private.firewood_handoff_sources,app_private.firewood_handoffs,app_private.firewood_handoff_payment_events,app_private.firewood_handoff_observations from %I',r);end if;end loop;
end $$;
notify pgrst,'reload schema';

commit;
