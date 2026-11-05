-- REVIEW-ONLY live Firewood boundary; NOT an approved deployment migration.
-- Outside the global and staging migration ledgers. Do not run on production.
-- No source rows, credentials, payments, sends or activation are installed.
-- Production 102 and frozen sandbox/staging tables/functions remain unchanged.
-- A future reviewed installer must verify actual schema/permissions/guard enrollment,
-- install this disabled candidate, then obtain a fresh five-minute recovery proof.
-- Body derived from reviewed staging command semantics, with independent live names.
-- INV-FW-<complete order UUID> is the deterministic unique business invoice rule.
-- Existing Stripe receipt/apply/reconciliation transactions are reused unchanged.
do $$begin
 if current_setting('ats.firewood_live_review',true)is distinct from'isolated-synthetic-only' then
  raise exception 'Explicit isolated synthetic live review required; no production installer exists.'using errcode='42501';
 end if;
 if to_regclass('app_private.firewood_live_handoff_sources')is not null then
  raise exception 'Live objects already exist; history-preserving reconciliation required.'using errcode='23514';
 end if;
end $$;
-- BEGIN ISOLATED REVIEW BODY
-- Preserve every existing approved terms family; add only the distinct live family.
do $$declare expression text;begin
 select pg_get_expr(c.conbin,c.conrelid)into expression from pg_constraint c where c.conrelid='public.invoices'::regclass and c.conname='invoices_document_terms_version_known';
 if expression is null then raise exception 'Expected invoice terms boundary is missing.'using errcode='23514';end if;
 alter table public.invoices drop constraint invoices_document_terms_version_known;
 execute format('alter table public.invoices add constraint invoices_document_terms_version_known check ((%s) or document_terms_version=%L)',expression,'firewood-household-live-2026-10-29-v1');
end $$;
-- Separate live candidate. No source row is inserted or enabled by installation.
-- Shared financial collectors/transactions and existing permissions are unchanged.
create table app_private.firewood_live_handoff_sources(id text primary key check(id='website_firewood_invoice_live_v1'),stripe_account_id text not null check(stripe_account_id='acct_1Tv92EI7tY6VHUvU'),environment_id text not null check(environment_id='ats_firewood_live_v1'),enabled boolean not null default false,collector_enabled boolean not null default false,surcharge_reporting_enabled boolean not null default false,sender_enabled boolean not null default false);
create table app_private.firewood_live_handoffs(
 source_id text not null references app_private.firewood_live_handoff_sources(id),order_id uuid not null,reference text not null,
 payload jsonb not null,payload_hash text not null,principal_cents integer not null check(principal_cents>0),
 customer_id uuid not null references public.customers(id) on delete restrict,invoice_id uuid not null unique references public.invoices(id) on delete restrict,
 token_id uuid not null references public.invoice_portal_tokens(id) on delete restrict,capability_version integer not null default 1,last_renew_from integer,
 original_paid_evidence jsonb,observation_revision bigint not null default 0,observation_hash text,observation jsonb,
 created_at timestamptz not null default clock_timestamp(),primary key(source_id,order_id),unique(source_id,reference)
);
create table app_private.firewood_live_handoff_payment_events(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references public.invoices(id),payment_id uuid not null references public.payments(id),financial jsonb not null,created_at timestamptz not null default clock_timestamp());
create table app_private.firewood_live_handoff_observations(source_id text not null,order_id uuid not null,revision bigint not null,snapshot jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(source_id,order_id,revision),foreign key(source_id,order_id)references app_private.firewood_live_handoffs(source_id,order_id));
alter table app_private.firewood_live_handoff_sources enable row level security;
alter table app_private.firewood_live_handoffs enable row level security;
alter table app_private.firewood_live_handoff_payment_events enable row level security;
alter table app_private.firewood_live_handoff_observations enable row level security;
revoke all on app_private.firewood_live_handoff_sources,app_private.firewood_live_handoffs,app_private.firewood_live_handoff_payment_events,app_private.firewood_live_handoff_observations from public;
-- Only an authenticated active CRM owner/admin may create this authority.
-- Website service calls cannot issue or directly write an approval.
create table app_private.firewood_live_price_approvals(
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,
 source_id text not null references app_private.firewood_live_handoff_sources(id),order_id uuid not null,
 order_binding jsonb not null,approved_by uuid not null references auth.users(id),approved_at_ms bigint not null,
 expires_at timestamptz not null,reason text not null check(length(btrim(reason))between 1 and 500),
 consumed_invoice_id uuid unique references public.invoices(id)on delete restrict,
 revoked_at timestamptz,revoked_by uuid references auth.users(id),revocation_reason text,
 created_at timestamptz not null default clock_timestamp(),unique(source_id,order_id)
);
alter table app_private.firewood_live_price_approvals enable row level security;
revoke all on app_private.firewood_live_price_approvals from public,anon,authenticated,service_role;

-- Every command requires the server service role; no fixture identity bypass.
create function app_private.firewood_live_handoff_source(p_source text)returns app_private.firewood_live_handoff_sources language plpgsql security invoker set search_path='' as $$
declare s app_private.firewood_live_handoff_sources%rowtype;
begin
 if auth.uid()is not null or current_setting('role',true)is distinct from'service_role'then raise exception 'Firewood server operation only.'using errcode='42501';end if;
 select * into s from app_private.firewood_live_handoff_sources where id=p_source and enabled for share;
 if not found then raise exception 'Firewood handoff source unavailable.'using errcode='42501';end if;return s;
end $$;
revoke all on function app_private.firewood_live_handoff_source(text)from public;
create function public.get_firewood_live_handoff_context(p_source text)returns jsonb language plpgsql security definer set search_path='' as $$
declare s app_private.firewood_live_handoff_sources%rowtype;
begin s:=app_private.firewood_live_handoff_source(p_source);return jsonb_build_object('contract','firewood-invoice-handoff-live-v1','source_id',s.id,'environment_id',s.environment_id,'account_id',s.stripe_account_id,'mode','live','livemode',true,'enabled',s.enabled,'collector_enabled',s.collector_enabled,'surcharge_reporting',s.surcharge_reporting_enabled,'sender_enabled',s.sender_enabled,'terms_hash','b58eaaea481bfd1aecf509ef940a8f0bc135f7db4446784533cb3b588c6ac482','payment_policy_hash','201c6523787fd3e2289843f51e63b1726b85a5fc2978cbae15acf870e79cdad3');end $$;
create function app_private.firewood_live_handoff_canonical(v jsonb) returns text language sql immutable security invoker set search_path='' as $$
 select case jsonb_typeof(v)
 when 'object' then '{'||coalesce((select string_agg(to_jsonb(key)::text||':'||app_private.firewood_live_handoff_canonical(value),',' order by key collate "C") from jsonb_each(v)),'')||'}'
 when 'array' then '['||coalesce((select string_agg(app_private.firewood_live_handoff_canonical(value),',' order by ordinality) from jsonb_array_elements(v) with ordinality),'')||']'
 else v::text end;
$$;
revoke all on function app_private.firewood_live_handoff_canonical(jsonb) from public;

create function app_private.validate_firewood_live_handoff_request(p_source text,p_request jsonb,p_issuing_approval boolean default false)returns void
language plpgsql security invoker set search_path='' as $$
declare s app_private.firewood_live_handoff_sources%rowtype;o jsonb;c jsonb;a jsonb;wood integer;stacking integer;k text;maxlen integer;approval app_private.firewood_live_price_approvals%rowtype;
begin
 select * into strict s from app_private.firewood_live_handoff_sources where id=p_source and enabled for share;
 o:=p_request->'order';c:=o->'contact';a:=o->'office_approval';
 if jsonb_typeof(p_request)is distinct from'object' or octet_length(p_request::text)>16384
 or p_request - array['contract','source_id','environment_id','account_id','mode','order_id','reference','snapshot_hash','order'] <> '{}'::jsonb
 or (select count(*) from jsonb_object_keys(p_request))<>9
 or p_request->>'contract' is distinct from 'firewood-invoice-handoff-live-v1' or p_request->>'mode' is distinct from 'live'
 or p_request->>'environment_id' is distinct from s.environment_id
 or p_request->>'source_id' is distinct from s.id or p_request->>'account_id' is distinct from s.stripe_account_id
 or coalesce(p_request->>'order_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 or p_request->>'reference' is distinct from 'FW-'||upper(left(p_request->>'order_id',8))
 or jsonb_typeof(o)is distinct from'object' or o - array['quantity','stacking','wood_cents','delivery_cents','stacking_cents','principal_cents','currency','tax_cents','tax_basis','terms','accepted_at_ms','office_approval','contact','payment_policy'] <> '{}'::jsonb
 or (select count(*) from jsonb_object_keys(o))<>14
 or jsonb_typeof(c)is distinct from'object' or c - array['name','email','phone','address','address2','city','state','postal','notes'] <> '{}'::jsonb
 or (select count(*) from jsonb_object_keys(c))<>9
 or o->'payment_policy' is distinct from '{"version":"firewood-payment-options-live-2026-10-29-v1","channels":["card","ach","cash_check_pickup","check_mail"],"credit_surcharge_bps":300,"credit_eligibility":"processor_confirmed_US_credit","debit_surcharge_bps":0,"prepaid_surcharge_bps":0,"ach_surcharge_bps":0,"offline_surcharge_bps":0,"fee_basis":"outstanding_principal","surcharge_reporting":"stripe_dedicated","exact_fee_review_before_confirmation":true,"receipt_authority":"crm","accepted":true}'::jsonb
 or o->>'currency' is distinct from 'usd' or o->'delivery_cents' is distinct from '0'::jsonb or o->'tax_cents' is distinct from '0'::jsonb
 or o->>'tax_basis' is distinct from 'va_domestic_use_locality_exempt' or o->'terms' is distinct from '{"version":"firewood-household-live-2026-10-29-v1","currency":"usd","deliveryCents":0,"stackingCents":15000,"maximumCords":2,"notificationDays":7,"cancellationHours":48,"cutoff":"delivery-window-start","unscheduledRefund":"full","angelCancellationRefund":"full","declinedAngelRescheduleRefund":"full","lateCustomerCancellation":"non-refundable","taxBasisPoints":0,"purchaseUse":"personal-household-only","veterans":"Inform Angel before purchase; office-approved price; residential only; one discount.","timezone":"America/New_York","clauses":[{"label":"Your order","text":"This invoice records your accepted firewood quantity, delivery address, selected stacking and agreed price. Choosing a payment method does not confirm payment or complete delivery."},{"label":"Delivery and stacking","text":"Delivery is included. Optional stacking costs $150 once per delivery, with wheelbarrow access and a reasonable carry. Angel Tree Services will contact you with a delivery date within one week; this does not promise delivery within one week."},{"label":"Payment","text":"Choose bank account, card, cash or check pickup, or mail a check. Bank payments must settle, and cash or checks must be received and recorded before they count as paid."},{"label":"Card fee","text":"A 3% fee on the outstanding principal applies only to eligible US credit cards, subject to applicable limits and processor validation. Debit, prepaid, unknown-funding and non-US cards, bank payments, cash and checks are not surcharged. Review the exact fee and total before confirming, or choose another payment method."},{"label":"Cancellation","text":"A full refund applies before delivery is scheduled or at least 48 hours before the agreed delivery window begins. Later customer cancellations are non-refundable. A full refund applies if Angel cancels, cannot fulfill, or you decline an Angel-requested reschedule. Contact the office to arrange any refund."},{"label":"Household use","text":"Your accepted order confirms personal household use at the delivery address and records the qualifying Virginia domestic-fuel and local exemption with zero sales tax. Business purchases require office review."},{"label":"Veterans pricing","text":"Tell the office before purchasing. Residential veterans pricing requires office approval and applies to wood and stacking before taxes and other fees. Only one discount applies."},{"label":"Help with your order","text":"Call Angel Tree Services at (540) 388-8715. An expired payment link or failed payment does not cancel the order or create another invoice. Refunds, disputes and returned payments require office review before another payment."}],"hash":"b58eaaea481bfd1aecf509ef940a8f0bc135f7db4446784533cb3b588c6ac482","accepted":true,"householdUseConfirmed":true}'::jsonb
 or jsonb_typeof(o->'stacking')is distinct from'boolean'
 or p_request->>'snapshot_hash' is distinct from encode(sha256(convert_to(app_private.firewood_live_handoff_canonical(o),'UTF8')),'hex')
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
  if not p_issuing_approval and (o->'wood_cents' is distinct from to_jsonb(wood) or o->'stacking_cents' is distinct from to_jsonb(stacking)) then raise exception 'Office approval required.'using errcode='22023';end if;
 else
  if jsonb_typeof(a)is distinct from'object' or a - array['approval_id','approved_at_ms','residential','single_discount_confirmed'] <> '{}'::jsonb
   or (select count(*) from jsonb_object_keys(a))<>4 or coalesce(a->>'approval_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   or a->'residential' is distinct from 'true'::jsonb or a->'single_discount_confirmed' is distinct from 'true'::jsonb
   or jsonb_typeof(a->'approved_at_ms')is distinct from'number' or coalesce(a->>'approved_at_ms','')!~'^[0-9]{1,16}$'
   or (a->>'approved_at_ms')::numeric not between 1 and (o->>'accepted_at_ms')::numeric
  then raise exception 'Invalid office approval.'using errcode='22023';end if;
  if p_issuing_approval then raise exception 'Office approval request must not assert existing approval.'using errcode='22023';end if;
  select * into approval from app_private.firewood_live_price_approvals where id=(a->>'approval_id')::uuid for update;
  if not found or approval.source_id<>p_source or approval.order_id<>(p_request->>'order_id')::uuid
   or approval.order_binding is distinct from(o-array['accepted_at_ms','office_approval'])
   or approval.approved_at_ms<>(a->>'approved_at_ms')::bigint
   or (approval.consumed_invoice_id is null and(approval.revoked_at is not null or approval.expires_at<=clock_timestamp()))
   or(approval.consumed_invoice_id is not null and not exists(select 1 from app_private.firewood_live_handoffs h where h.source_id=p_source and h.order_id=approval.order_id and h.invoice_id=approval.consumed_invoice_id))
   then raise exception 'Trusted CRM office approval required.'using errcode='42501';end if;
 end if;
 for k,maxlen in select * from (values ('name',100),('email',254),('phone',10),('address',150),('address2',100),('city',100),('state',2),('postal',10),('notes',500)) t(key,len) loop
  if jsonb_typeof(c->k)is distinct from'string' or length(c->>k)>maxlen or c->>k is distinct from btrim(c->>k)
   or (k<>'notes'and c->>k ~ '[[:cntrl:]]')or(k='notes'and regexp_replace(c->>k,E'[\n\r\t]','','g')~'[[:cntrl:]]') or (k not in('address2','notes') and length(c->>k)=0) then raise exception 'Invalid contact.'using errcode='22023';end if;
 end loop;
 if c->>'email'!~'^[a-z0-9.!#$%&''*+/=?^_`{|}~-]{1,64}@[a-z0-9.-]+\.[a-z]{2,63}$' or c->>'email'<>lower(c->>'email')
 or split_part(c->>'email','@',1)like'.%'or split_part(c->>'email','@',1)like'%.'or split_part(c->>'email','@',1)like'%..%'
 or exists(select 1 from regexp_split_to_table(split_part(c->>'email','@',2),'\.')label where label!~'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')
 or split_part(c->>'email','@',2)~'(^|\.)(invalid|localhost|test|example)$'or split_part(c->>'email','@',2)~'(^|\.)example\.(com|net|org)$'
 or c->>'phone'!~'^[2-9][0-9]{2}[2-9][0-9]{6}$' or c->>'state' is distinct from 'VA' or c->>'postal'!~'^[0-9]{5}(-[0-9]{4})?$'
 then raise exception 'Valid live contact required.'using errcode='22023';end if;
end $$;
revoke all on function app_private.validate_firewood_live_handoff_request(text,jsonb,boolean) from public;

create function app_private.validate_firewood_live_handoff_capability(p_capability jsonb)returns void language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_capability)is distinct from'object'
 or p_capability-array['token_hash','token_hint','token_encrypted','expires_at']<>'{}'::jsonb
 or(select count(*)from jsonb_object_keys(p_capability))<>4
 or jsonb_typeof(p_capability->'token_hash')is distinct from'string'or coalesce(p_capability->>'token_hash','')!~'^[a-f0-9]{64}$'
 or jsonb_typeof(p_capability->'token_hint')is distinct from'string'or coalesce(p_capability->>'token_hint','')!~'^[A-Za-z0-9_-]{6}$'
 or jsonb_typeof(p_capability->'token_encrypted')is distinct from'string'or length(p_capability->>'token_encrypted')>4096
 or coalesce(p_capability->>'token_encrypted','')!~'^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
 or jsonb_typeof(p_capability->'expires_at')is distinct from'string'
 or coalesce(p_capability->>'expires_at','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'
 then raise exception 'Invalid Firewood capability.'using errcode='22023';end if;
 if(p_capability->>'expires_at')::timestamptz not between clock_timestamp()+interval'1 minute'and clock_timestamp()+interval'31 minutes'
 then raise exception 'Invalid Firewood capability.'using errcode='22023';end if;
end $$;
create function app_private.firewood_live_handoff_receipt(p_source text,p_order uuid,p_replayed boolean)returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('contract','firewood-invoice-handoff-live-v1','source_id',r.source_id,'environment_id',s.environment_id,'account_id',r.payload->>'account_id','mode','live','order_id',r.order_id,'reference',r.reference,'snapshot_hash',r.payload->>'snapshot_hash','invoice_id',r.invoice_id,'invoice_number',i.invoice_number,'preparation_status','prepared','principal_cents',r.principal_cents,'token_encrypted',case when t.revoked_at is null and t.expires_at>clock_timestamp()then t.token_encrypted else null end,'expires_at',t.expires_at,'capability_version',r.capability_version,'replayed',p_replayed,'receipt_authority','crm','order_confirmation_authority','website','payment_retry_required',false,'delivery_completed',false,'payment_execution_ready',s.collector_enabled and s.surcharge_reporting_enabled,'execution_blockers',case when s.collector_enabled and s.surcharge_reporting_enabled then '[]'::jsonb else jsonb_build_array('collector_source_not_enabled')end)
 from app_private.firewood_live_handoffs r join app_private.firewood_live_handoff_sources s on s.id=r.source_id join public.invoices i on i.id=r.invoice_id join public.invoice_portal_tokens t on t.id=r.token_id where r.source_id=p_source and r.order_id=p_order;
$$;
create function public.prepare_firewood_live_handoff(p_source text,p_request jsonb,p_capability jsonb)returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r app_private.firewood_live_handoffs%rowtype;o jsonb;c jsonb;customer public.customers%rowtype;location public.service_locations%rowtype;invoice public.invoices%rowtype;token uuid;
 candidates integer;location_count integer;delivery_street text;lock_key text;h text;wood integer;stacking integer;total integer;
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
  if candidates>1 then raise exception 'Firewood contact requires review.'using errcode='23505';end if;
  if candidates=1 then
   select * into strict customer from public.customers cu where lower(btrim(cu.email))=lower(c->>'email')or right(regexp_replace(coalesce(cu.phone,''),'[^0-9]','','g'),10)=c->>'phone'for update;
   if customer.status<>'active'or customer.archived_at is not null or customer.customer_type is distinct from'residential'or customer.organization_id is not null or lower(btrim(customer.display_name))<>lower(c->>'name')
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
end $$;
create function public.renew_firewood_live_handoff(p_source text,p_order uuid,p_invoice uuid,p_hash text,p_version integer,p_capability jsonb)returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r app_private.firewood_live_handoffs%rowtype;t public.invoice_portal_tokens%rowtype;i public.invoices%rowtype;new_token uuid;
begin
 perform app_private.firewood_live_handoff_source(p_source);select * into strict r from app_private.firewood_live_handoffs where source_id=p_source and order_id=p_order;
 select * into strict i from public.invoices where id=r.invoice_id for update;select * into strict r from app_private.firewood_live_handoffs where source_id=p_source and order_id=p_order for update;
 if r.invoice_id<>p_invoice or r.payload->>'snapshot_hash'<>p_hash or i.status='void'then raise exception 'Firewood binding changed.'using errcode='23514';end if;
 if r.capability_version<>p_version then
  if r.last_renew_from=p_version and r.capability_version=p_version+1 then return app_private.firewood_live_handoff_receipt(p_source,p_order,true);end if;
  raise exception 'Capability version changed.'using errcode='40001';
 end if;
 select * into strict t from public.invoice_portal_tokens where id=r.token_id for update;
 if t.revoked_at is not null then raise exception 'Portal revoked; office review required.'using errcode='42501';end if;
 perform app_private.validate_firewood_live_handoff_capability(p_capability);
 update public.invoice_portal_tokens set revoked_at=clock_timestamp()where id=t.id;
 insert into public.invoice_portal_tokens(invoice_id,customer_id,organization_id,token_hash,token_hint,token_encrypted,expires_at,created_by_user_id)values(r.invoice_id,r.customer_id,null,p_capability->>'token_hash',p_capability->>'token_hint',p_capability->>'token_encrypted',(p_capability->>'expires_at')::timestamptz,null)returning id into new_token;
 update app_private.firewood_live_handoffs set token_id=new_token,last_renew_from=p_version,capability_version=capability_version+1 where source_id=p_source and order_id=p_order;
 return app_private.firewood_live_handoff_receipt(p_source,p_order,false);
end $$;
create function public.read_firewood_live_handoff(p_source text,p_order uuid,p_invoice uuid,p_hash text)returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r app_private.firewood_live_handoffs%rowtype;i public.invoices%rowtype;result jsonb;
begin
 perform app_private.firewood_live_handoff_source(p_source);select * into strict r from app_private.firewood_live_handoffs where source_id=p_source and order_id=p_order;
 select * into strict i from public.invoices where id=r.invoice_id for share;
 if r.invoice_id<>p_invoice or r.payload->>'snapshot_hash'<>p_hash or i.customer_id<>r.customer_id or i.total_cents<>r.principal_cents or i.automatic_reminders_enabled then raise exception 'Firewood invoice requires review.'using errcode='23514';end if;
 select jsonb_build_object('invoice',to_jsonb(i),'payments',coalesce((select jsonb_agg(to_jsonb(p)order by p.id)from public.payments p where p.invoice_id=i.id),'[]'::jsonb),'attempts',coalesce((select jsonb_agg(to_jsonb(a)order by a.id)from public.invoice_checkout_sessions a where a.invoice_id=i.id),'[]'::jsonb),'refunds',coalesce((select jsonb_agg(jsonb_build_object('refund_id',f.refund_id,'payment_id',f.payment_id,'amount_cents',f.amount_cents,'currency',f.currency,'status',f.status)order by f.refund_id)from app_private.stripe_refund_observations f join public.payments p on p.id=f.payment_id where p.invoice_id=i.id),'[]'::jsonb),'original_paid_evidence',r.original_paid_evidence) into result;
 return result||jsonb_build_object('ledger_hash',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
end $$;
create function public.record_firewood_live_handoff_observation(p_source text,p_order uuid,p_invoice uuid,p_hash text,p_ledger_hash text,p_financial jsonb)returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r app_private.firewood_live_handoffs%rowtype;i public.invoices%rowtype;h text;current_ledger jsonb;
begin
 perform app_private.firewood_live_handoff_source(p_source);select * into strict r from app_private.firewood_live_handoffs where source_id=p_source and order_id=p_order;
 select * into strict i from public.invoices where id=r.invoice_id for share;select * into strict r from app_private.firewood_live_handoffs where source_id=p_source and order_id=p_order for update;
 if r.invoice_id<>p_invoice or r.payload->>'snapshot_hash'<>p_hash or p_financial#>'{totals,invoice_principal_cents}'is distinct from to_jsonb(i.total_cents)or p_financial#>'{totals,balance_due_cents}'is distinct from to_jsonb(i.balance_due_cents)then raise exception 'Financial observation changed.'using errcode='40001';end if;
 current_ledger:=public.read_firewood_live_handoff(p_source,p_order,p_invoice,p_hash);
 if current_ledger->>'ledger_hash'is distinct from p_ledger_hash then raise exception 'Financial observation changed.'using errcode='40001';end if;
 h:=encode(sha256(convert_to(p_financial::text,'UTF8')),'hex');
 if r.observation_hash is distinct from h then update app_private.firewood_live_handoffs set observation_revision=observation_revision+1,observation_hash=h,observation=p_financial where source_id=p_source and order_id=p_order returning * into r;
 insert into app_private.firewood_live_handoff_observations(source_id,order_id,revision,snapshot)values(p_source,p_order,r.observation_revision,p_financial);end if;
 return jsonb_build_object('observation_revision',r.observation_revision,'financial',p_financial);
end $$;
create function app_private.capture_firewood_live_handoff_payment()returns trigger language plpgsql security definer set search_path='' as $$
declare r app_private.firewood_live_handoffs%rowtype;net bigint;gross bigint;fee bigint;ids jsonb;
begin
 select * into r from app_private.firewood_live_handoffs where invoice_id=new.invoice_id;
 if not found then return new;end if;
 select * into strict r from app_private.firewood_live_handoffs where invoice_id=new.invoice_id for update;
 insert into app_private.firewood_live_handoff_payment_events(invoice_id,payment_id,financial)values(new.invoice_id,new.id,to_jsonb(new));
 if r.original_paid_evidence is null then
  select coalesce(sum(p.amount_cents::bigint),0),coalesce(sum(p.total_collected_cents::bigint),0),coalesce(sum(p.surcharge_cents::bigint),0),jsonb_agg(p.id order by p.id)into net,gross,fee,ids from public.payments p where p.invoice_id=new.invoice_id and(p.status in('succeeded','refunded')or p.succeeded_at is not null);
  if net=r.principal_cents then update app_private.firewood_live_handoffs set original_paid_evidence=jsonb_build_object('paid',true,'observed_at',clock_timestamp(),'principal_cents',r.principal_cents,'gross_collected_cents',gross,'surcharge_collected_cents',fee,'payment_ids',ids)where invoice_id=new.invoice_id;end if;
 end if;return new;
end $$;
create trigger firewood_live_handoff_payment_capture after insert or update on public.payments for each row execute function app_private.capture_firewood_live_handoff_payment();
create function app_private.guard_firewood_live_handoff_history()returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_TABLE_NAME<>'firewood_live_handoffs'then raise exception 'Firewood financial history is immutable.'using errcode='23514';end if;
 if TG_OP='DELETE'then raise exception 'Firewood handoff identity is immutable.'using errcode='23514';end if;
 if old.reference is distinct from new.reference or old.created_at is distinct from new.created_at or old.payload is distinct from new.payload or old.payload_hash is distinct from new.payload_hash or old.source_id is distinct from new.source_id or old.order_id is distinct from new.order_id or old.invoice_id is distinct from new.invoice_id or old.customer_id is distinct from new.customer_id or old.principal_cents is distinct from new.principal_cents or(old.original_paid_evidence is not null and old.original_paid_evidence is distinct from new.original_paid_evidence)then raise exception 'Firewood handoff identity is immutable.'using errcode='23514';end if;return new;
end $$;
create trigger firewood_live_handoff_identity before update or delete on app_private.firewood_live_handoffs for each row execute function app_private.guard_firewood_live_handoff_history();
create trigger firewood_live_handoff_history before update or delete on app_private.firewood_live_handoff_payment_events for each row execute function app_private.guard_firewood_live_handoff_history();
create trigger firewood_live_handoff_observation_history before update or delete on app_private.firewood_live_handoff_observations for each row execute function app_private.guard_firewood_live_handoff_history();
create function app_private.guard_firewood_live_handoff_invoice()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='invoices'then
  if exists(select 1 from app_private.firewood_live_handoffs where invoice_id=old.id)and new.status='void'and old.status is distinct from'void'
   then raise exception 'Accepted Firewood order requires coordinated cancellation review.'using errcode='23514';end if;
  if exists(select 1 from app_private.firewood_live_handoffs where invoice_id=old.id)and(new.total_cents is distinct from old.total_cents or new.subtotal_cents is distinct from old.subtotal_cents or new.tax_cents is distinct from old.tax_cents or new.customer_id is distinct from old.customer_id or new.organization_id is distinct from old.organization_id or new.service_location_id is distinct from old.service_location_id or new.job_id is distinct from old.job_id or new.document_terms_version is distinct from old.document_terms_version or new.invoice_number is distinct from old.invoice_number or new.payment_terms is distinct from old.payment_terms or new.purchase_order_reference is distinct from old.purchase_order_reference or new.automatic_reminders_enabled)then raise exception 'Prepared Firewood order is frozen; office review required.'using errcode='23514';end if;return new;
 end if;
 if exists(select 1 from app_private.firewood_live_handoffs where invoice_id=case when TG_OP='DELETE'then old.invoice_id else new.invoice_id end)or(TG_OP='UPDATE'and exists(select 1 from app_private.firewood_live_handoffs where invoice_id=old.invoice_id))then raise exception 'Prepared Firewood lines are frozen; office review required.'using errcode='23514';end if;
 if TG_OP='DELETE'then return old;else return new;end if;
end $$;
create trigger firewood_live_handoff_invoice_frozen before update on public.invoices for each row execute function app_private.guard_firewood_live_handoff_invoice();
create trigger firewood_live_handoff_lines_frozen before insert or update or delete on public.invoice_line_items for each row execute function app_private.guard_firewood_live_handoff_invoice();
create function public.get_firewood_live_collector_context(p_invoice uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare r app_private.firewood_live_handoffs%rowtype;s app_private.firewood_live_handoff_sources%rowtype;allowed boolean;review boolean;balance integer;
begin
 if auth.uid()is not null or current_setting('role',true)is distinct from'service_role'then raise exception 'Server operation only.'using errcode='42501';end if;
 select * into r from app_private.firewood_live_handoffs where invoice_id=p_invoice;
 if not found then return jsonb_build_object('managed',false);end if;
 select * into strict s from app_private.firewood_live_handoff_sources where id=r.source_id;
 select balance_due_cents into strict balance from public.invoices where id=p_invoice;
 review:=exists(select 1 from public.payments p where p.invoice_id=p_invoice and(p.refunded_principal_cents>0 or p.refunded_surcharge_cents>0 or p.dispute_status is not null))or exists(select 1 from app_private.stripe_refund_observations f join public.payments p on p.id=f.payment_id where p.invoice_id=p_invoice and f.status in('pending','requires_action'))or(r.original_paid_evidence is not null and balance>0);
 allowed:=s.enabled and s.collector_enabled and s.surcharge_reporting_enabled and r.original_paid_evidence is null and not review;
 return jsonb_build_object('managed',true,'invoice_id',r.invoice_id,'allowed',allowed,'review_required',review,'already_paid',r.original_paid_evidence is not null and balance=0 and not review,'source_id',s.id,'order_id',r.order_id,'account_id',s.stripe_account_id,'receipt_authority','crm','surcharge_reporting',s.surcharge_reporting_enabled,'environment_id',s.environment_id,'livemode',true,'mode','live','contract','firewood-invoice-handoff-live-v1','sender_enabled',s.sender_enabled,'terms_hash','b58eaaea481bfd1aecf509ef940a8f0bc135f7db4446784533cb3b588c6ac482','payment_policy_hash','201c6523787fd3e2289843f51e63b1726b85a5fc2978cbae15acf870e79cdad3');
end $$;
revoke all on function public.get_firewood_live_collector_context(uuid)from public;
create function public.approve_firewood_live_price(p_source text,p_request jsonb,p_reason text,p_request_id uuid)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare a app_private.firewood_live_price_approvals%rowtype;actor uuid:=auth.uid();binding jsonb;
begin
 -- Same lock as role/offboarding commands: authorize only after access changes serialize.
 perform pg_advisory_xact_lock(hashtext('platform-role-management'));
 if current_setting('role',true)is distinct from'authenticated'or actor is null or not coalesce(app_private.has_platform_admin_role(),false)then raise exception 'Active CRM owner or admin required.'using errcode='42501';end if;
 if p_request_id is null or p_reason is null or length(btrim(p_reason))not between 1 and 500 or p_request#>'{order,office_approval}'is distinct from'null'::jsonb then raise exception 'Invalid office approval request.'using errcode='22023';end if;
 perform app_private.validate_firewood_live_handoff_request(p_source,p_request,true);
 binding:=(p_request->'order')-array['accepted_at_ms','office_approval'];
 perform pg_advisory_xact_lock(hashtextextended('firewood-live-v1-order:'||p_source||':'||(p_request->>'order_id'),0));
 select * into a from app_private.firewood_live_price_approvals where request_id=p_request_id or(source_id=p_source and order_id=(p_request->>'order_id')::uuid)for update;
 if found then
  if a.request_id<>p_request_id or a.approved_by<>actor or a.order_binding<>binding or a.reason<>btrim(p_reason)then raise exception 'Office approval identity changed.'using errcode='23505';end if;
  if a.revoked_at is not null or a.expires_at<=clock_timestamp()then raise exception 'Office approval is no longer available.'using errcode='42501';end if;
 else
  if exists(select 1 from app_private.firewood_live_handoffs where source_id=p_source and order_id=(p_request->>'order_id')::uuid)then raise exception 'Order already accepted.'using errcode='23505';end if;
  insert into app_private.firewood_live_price_approvals(request_id,source_id,order_id,order_binding,approved_by,approved_at_ms,expires_at,reason)
   values(p_request_id,p_source,(p_request->>'order_id')::uuid,binding,actor,floor(extract(epoch from clock_timestamp())*1000)::bigint,clock_timestamp()+interval'24 hours',btrim(p_reason))returning * into a;
  insert into public.activity_log(actor_type,actor_user_id,subject_type,subject_id,event_type,metadata_json)values('staff',actor,'firewood_order',a.order_id,'firewood_live_price_approved',jsonb_build_object('approval_id',a.id,'principal_cents',binding->'principal_cents','source_id',p_source,'expires_at',a.expires_at));
 end if;
 return jsonb_build_object('approval_id',a.id,'approved_at_ms',a.approved_at_ms,'residential',true,'single_discount_confirmed',true,'expires_at',a.expires_at);
end $$;
create function public.revoke_firewood_live_price(p_approval uuid,p_reason text)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare a app_private.firewood_live_price_approvals%rowtype;actor uuid:=auth.uid();
begin
 -- Same lock as role/offboarding commands: authorize only after access changes serialize.
 perform pg_advisory_xact_lock(hashtext('platform-role-management'));
 if current_setting('role',true)is distinct from'authenticated'or actor is null or not coalesce(app_private.has_platform_admin_role(),false)then raise exception 'Active CRM owner or admin required.'using errcode='42501';end if;
 if p_reason is null or length(btrim(p_reason))not between 1 and 500 then raise exception 'Reason required.'using errcode='22023';end if;
 select * into strict a from app_private.firewood_live_price_approvals where id=p_approval for update;
 if a.consumed_invoice_id is not null then raise exception 'Accepted price is frozen; review the existing invoice.'using errcode='23514';end if;
 if a.revoked_at is null then
  update app_private.firewood_live_price_approvals set revoked_at=clock_timestamp(),revoked_by=actor,revocation_reason=btrim(p_reason)where id=a.id returning * into a;
  insert into public.activity_log(actor_type,actor_user_id,subject_type,subject_id,event_type,metadata_json)values('staff',actor,'firewood_order',a.order_id,'firewood_live_price_revoked',jsonb_build_object('approval_id',a.id,'source_id',a.source_id,'reason',btrim(p_reason)));
 end if;
 return jsonb_build_object('approval_id',a.id,'revoked',true);
end $$;
create function app_private.guard_firewood_live_price_approval()returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='DELETE'then raise exception 'Office approval history is immutable.'using errcode='23514';end if;
 if(old.id,old.request_id,old.source_id,old.order_id,old.order_binding,old.approved_by,old.approved_at_ms,old.expires_at,old.reason,old.created_at)is distinct from(new.id,new.request_id,new.source_id,new.order_id,new.order_binding,new.approved_by,new.approved_at_ms,new.expires_at,new.reason,new.created_at)
 or(old.consumed_invoice_id is not null and old.consumed_invoice_id is distinct from new.consumed_invoice_id)
 or(old.revoked_at is not null and(old.revoked_at,old.revoked_by,old.revocation_reason)is distinct from(new.revoked_at,new.revoked_by,new.revocation_reason))
 then raise exception 'Office approval history is immutable.'using errcode='23514';end if;return new;
end $$;
create trigger firewood_live_price_approval_frozen before update or delete on app_private.firewood_live_price_approvals for each row execute function app_private.guard_firewood_live_price_approval();

do $$declare f record;r text;begin
 for f in select p.oid::regprocedure as sig,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','app_private')and(p.proname like '%firewood_live_handoff%'or p.proname='get_firewood_live_collector_context'or p.proname in('approve_firewood_live_price','revoke_firewood_live_price','guard_firewood_live_price_approval')) loop
  execute format('revoke all on function %s from public',f.sig);
  foreach r in array array['anon','authenticated','service_role']loop if exists(select 1 from pg_roles where rolname=r)then execute format('revoke all on function %s from %I',f.sig,r);end if;end loop;
  if f.nspname='public'and f.proname not in('approve_firewood_live_price','revoke_firewood_live_price')and exists(select 1 from pg_roles where rolname='service_role')then execute format('grant execute on function %s to service_role',f.sig);end if;
 end loop;
 foreach r in array array['anon','authenticated','service_role']loop if exists(select 1 from pg_roles where rolname=r)then execute format('revoke all on app_private.firewood_live_handoff_sources,app_private.firewood_live_handoffs,app_private.firewood_live_handoff_payment_events,app_private.firewood_live_handoff_observations from %I',r);end if;end loop;
end $$;
grant execute on function public.approve_firewood_live_price(text,jsonb,text,uuid),public.revoke_firewood_live_price(uuid,text)to authenticated;
notify pgrst,'reload schema';
