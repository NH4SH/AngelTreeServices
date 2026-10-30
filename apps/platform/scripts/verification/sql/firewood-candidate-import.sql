-- Test-only Firewood import. No source is enabled by this migration.
-- Install only in an explicitly isolated disposable test stack for this review.
set local lock_timeout='3s';
set local statement_timeout='30s';

create table app_private.firewood_candidate_sources (
 id text primary key check(id = 'website_firewood_candidate_v1'),
 stripe_account_id text not null check(stripe_account_id = 'acct_1UU9U8RAZXGe6tX0'),
 environment_id text not null check(environment_id ~ '^ats_fwcandidate_[a-f0-9]{12}$'),
 enabled boolean not null default false,
 livemode boolean not null default false check(livemode=false)
);
create table app_private.firewood_candidate_imports (
 id uuid primary key default gen_random_uuid(),
 source_id text not null references app_private.firewood_candidate_sources(id),
 order_id uuid not null,attempt_id uuid not null,reference text not null,
 payload jsonb not null,payload_hash text not null,
 stripe_account_id text not null,livemode boolean not null default false check(livemode=false),
 session_id text not null,intent_id text,charge_id text,
 customer_id uuid references public.customers(id)on delete restrict,
 invoice_id uuid unique references public.invoices(id)on delete restrict,
 payment_id uuid unique references public.payments(id)on delete restrict,
 lease_id uuid,lease_expires_at timestamptz,
 last_finished_lease uuid,last_proof jsonb,last_proof_hash text,
 original_proof jsonb,refund_review_required boolean not null default false,
 last_failure text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(source_id,order_id),unique(source_id,reference),unique(source_id,attempt_id),unique(stripe_account_id,livemode,session_id),
 check((invoice_id is null)=(payment_id is null)),
 check((lease_id is null)=(lease_expires_at is null))
);
create unique index firewood_candidate_import_intent on app_private.firewood_candidate_imports(stripe_account_id,livemode,intent_id)where intent_id is not null;
alter table app_private.firewood_candidate_sources enable row level security;
alter table app_private.firewood_candidate_imports enable row level security;
revoke all on app_private.firewood_candidate_sources,app_private.firewood_candidate_imports from public,anon,authenticated,service_role;

-- A distinct immutable test family records the reviewed Website household policy
-- without rewriting older terms or requesting payment a second time.
alter table public.invoices drop constraint invoices_document_terms_version_known;
alter table public.invoices add constraint invoices_document_terms_version_known
 check(document_terms_version in('legacy-2026-10-22','firewood-household-2026-10-24','firewood-checkout-test-2026-10-25','firewood-candidate-test-2026-10-28'));

create function app_private.firewood_candidate_source(p_source text)returns app_private.firewood_candidate_sources
language plpgsql security invoker set search_path='' as $$
declare s app_private.firewood_candidate_sources%rowtype;
begin
 if auth.uid()is not null or current_setting('role',true)<>'service_role' then raise exception 'Firewood server operation only.'using errcode='42501';end if;
 select * into s from app_private.firewood_candidate_sources where id=p_source and enabled and not livemode;
 if not found then raise exception 'Firewood test source unavailable.'using errcode='42501';end if;
 return s;
end $$;
revoke all on function app_private.firewood_candidate_source(text)from public,anon,authenticated,service_role;

-- Keep every provider observation, including later failed refunds. No direct API access.
create table app_private.firewood_candidate_observations (
 id uuid primary key default gen_random_uuid(), import_id uuid not null references app_private.firewood_candidate_imports(id) on delete restrict,
 lease_id uuid not null unique, proof jsonb not null, proof_hash text not null, recorded_at timestamptz not null default clock_timestamp()
);
alter table app_private.firewood_candidate_observations enable row level security;
revoke all on app_private.firewood_candidate_observations from public,anon,authenticated,service_role;
create function app_private.firewood_candidate_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_TABLE_NAME='firewood_candidate_observations' then raise exception 'Provider history is immutable.' using errcode='23514';end if;
 if OLD.payload is distinct from NEW.payload or OLD.source_id is distinct from NEW.source_id or OLD.order_id is distinct from NEW.order_id
  or OLD.attempt_id is distinct from NEW.attempt_id or OLD.reference is distinct from NEW.reference or OLD.payload_hash is distinct from NEW.payload_hash
  or OLD.stripe_account_id is distinct from NEW.stripe_account_id or OLD.session_id is distinct from NEW.session_id
  or (OLD.original_proof is not null and OLD.original_proof is distinct from NEW.original_proof)
  or (OLD.invoice_id is not null and (OLD.invoice_id is distinct from NEW.invoice_id or OLD.payment_id is distinct from NEW.payment_id
   or OLD.customer_id is distinct from NEW.customer_id or OLD.intent_id is distinct from NEW.intent_id or OLD.charge_id is distinct from NEW.charge_id))
 then raise exception 'Firewood candidate identity changed.' using errcode='23514';end if;
 return NEW;
end $$;
revoke all on function app_private.firewood_candidate_immutable() from public,anon,authenticated,service_role;
create trigger firewood_candidate_history_immutable before update or delete on app_private.firewood_candidate_observations for each row execute function app_private.firewood_candidate_immutable();
create trigger firewood_candidate_binding_immutable before update on app_private.firewood_candidate_imports for each row execute function app_private.firewood_candidate_immutable();
create function app_private.firewood_candidate_canonical(v jsonb) returns text language sql immutable security invoker set search_path='' as $$
 select case jsonb_typeof(v)
 when 'object' then '{'||coalesce((select string_agg(to_jsonb(key)::text||':'||app_private.firewood_candidate_canonical(value),',' order by key collate "C") from jsonb_each(v)),'')||'}'
 when 'array' then '['||coalesce((select string_agg(app_private.firewood_candidate_canonical(value),',' order by ordinality) from jsonb_array_elements(v) with ordinality),'')||']'
 else v::text end;
$$;
revoke all on function app_private.firewood_candidate_canonical(jsonb) from public,anon,authenticated,service_role;

-- Confirm the private disposable-stack identity before claiming any intent.
create function public.get_firewood_candidate_source_context(p_source text)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s app_private.firewood_candidate_sources%rowtype;
begin
 s:=app_private.firewood_candidate_source(p_source);
 return jsonb_build_object('environment_id',s.environment_id,'account_id',s.stripe_account_id,'livemode',s.livemode);
end $$;
revoke all on function public.get_firewood_candidate_source_context(text)from public,anon,authenticated;
grant execute on function public.get_firewood_candidate_source_context(text)to service_role;

create function app_private.validate_firewood_candidate_request(p_source text,p_request jsonb)returns void
language plpgsql security invoker set search_path='' as $$
declare s app_private.firewood_candidate_sources%rowtype;o jsonb;c jsonb;a jsonb;wood integer;stacking integer;k text;maxlen integer;
begin
 s:=app_private.firewood_candidate_source(p_source);o:=p_request->'order';c:=o->'contact';a:=o->'office_approval';
 if jsonb_typeof(p_request)is distinct from'object' or octet_length(p_request::text)>16384
 or p_request - array['contract','source_id','account_id','mode','order_id','reference','attempt_id','session_id','snapshot_hash','order'] <> '{}'::jsonb
 or (select count(*) from jsonb_object_keys(p_request))<>10
 or p_request->>'contract' is distinct from 'firewood-paid-order-v1' or p_request->>'mode' is distinct from 'sandbox'
 or p_request->>'source_id' is distinct from s.id or p_request->>'account_id' is distinct from s.stripe_account_id
 or coalesce(p_request->>'order_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 or p_request->>'attempt_id' is distinct from p_request->>'order_id'
 or p_request->>'reference' is distinct from 'FW-'||upper(left(p_request->>'order_id',8))
 or coalesce(p_request->>'session_id','')!~'^cs_test_[A-Za-z0-9_]{8,200}$'
 or jsonb_typeof(o)is distinct from'object' or o - array['quantity','stacking','wood_cents','delivery_cents','stacking_cents','total_cents','currency','tax_cents','tax_basis','terms','accepted_at_ms','office_approval','contact'] <> '{}'::jsonb
 or (select count(*) from jsonb_object_keys(o))<>13
 or jsonb_typeof(c)is distinct from'object' or c - array['name','email','phone','address','address2','city','state','postal','notes'] <> '{}'::jsonb
 or (select count(*) from jsonb_object_keys(c))<>9
 or o->>'currency' is distinct from 'usd' or o->'delivery_cents' is distinct from '0'::jsonb or o->'tax_cents' is distinct from '0'::jsonb
 or o->>'tax_basis' is distinct from 'va_domestic_use_locality_exempt' or o->'terms' is distinct from '{"version":"firewood-20261028-household-v2","currency":"usd","deliveryCents":0,"stackingCents":15000,"maximumCords":2,"notificationDays":7,"cancellationHours":48,"cutoff":"delivery-window-start","unscheduledRefund":"full","angelCancellationRefund":"full","declinedAngelRescheduleRefund":"full","lateCustomerCancellation":"non-refundable","taxBasisPoints":0,"purchaseUse":"personal-household-only","veterans":"Inform Angel before purchase; office-approved price; residential only; one discount.","timezone":"America/New_York","hash":"ecf0666b872db0a9a6b588ea25143887d51171a9606cda65d16ae792213a83a5","accepted":true,"householdUseConfirmed":true}'::jsonb
 or jsonb_typeof(o->'stacking')is distinct from'boolean'
 or p_request->>'snapshot_hash' is distinct from encode(sha256(convert_to(app_private.firewood_candidate_canonical(o),'UTF8')),'hex')
 or jsonb_typeof(o->'accepted_at_ms')is distinct from'number' or coalesce(o->>'accepted_at_ms','')!~'^[0-9]{1,16}$'
 or (o->>'accepted_at_ms')::numeric not between 1 and 9007199254740991
 or (o->>'accepted_at_ms')::numeric > extract(epoch from clock_timestamp())*1000+300000
 then raise exception 'Invalid Firewood candidate request.' using errcode='22023';end if;
 wood:=case o->>'quantity' when 'half' then 30000 when 'full' then 45000 when 'two' then 84000 end;
 stacking:=case when (o->>'stacking')::boolean then 15000 else 0 end;
 if wood is null or jsonb_typeof(o->'wood_cents')is distinct from'number' or jsonb_typeof(o->'stacking_cents')is distinct from'number' or coalesce(o->>'wood_cents','')!~'^[0-9]+$' or (o->>'wood_cents')::numeric not between 1 and wood
 or coalesce(o->>'stacking_cents','')!~'^[0-9]+$' or (o->>'stacking_cents')::numeric not between 0 and stacking
 or o->'total_cents' is distinct from to_jsonb((o->>'wood_cents')::integer+(o->>'stacking_cents')::integer)
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
 or c->>'phone'!~'^[0-9]{10}$' or c->>'state'!~'^[A-Z]{2}$' or c->>'postal'!~'^[0-9]{5}(-[0-9]{4})?$'
 then raise exception 'Synthetic contact required.'using errcode='22023';end if;
end $$;
revoke all on function app_private.validate_firewood_candidate_request(text,jsonb) from public,anon,authenticated,service_role;

create function public.claim_firewood_candidate_import(p_source text,p_request jsonb)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare s app_private.firewood_candidate_sources%rowtype;r app_private.firewood_candidate_imports%rowtype;h text;token uuid:=gen_random_uuid();
begin
 perform app_private.validate_firewood_candidate_request(p_source,p_request);s:=app_private.firewood_candidate_source(p_source);
 h:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('firewood-order:'||p_source||':'||(p_request->>'order_id'),0));
 select * into r from app_private.firewood_candidate_imports where source_id=p_source and order_id=(p_request->>'order_id')::uuid for update;
 if not found then
  insert into app_private.firewood_candidate_imports(source_id,order_id,attempt_id,reference,payload,payload_hash,stripe_account_id,session_id)
   values(p_source,(p_request->>'order_id')::uuid,(p_request->>'attempt_id')::uuid,p_request->>'reference',p_request,h,s.stripe_account_id,p_request->>'session_id')returning * into r;
 elsif r.payload_hash<>h or r.payload<>p_request then raise exception 'Firewood import identity changed.'using errcode='23505';end if;
 if r.lease_expires_at>clock_timestamp()then return jsonb_build_object('busy',true);end if;
 update app_private.firewood_candidate_imports set lease_id=token,lease_expires_at=clock_timestamp()+interval'30 seconds',last_failure=null,updated_at=clock_timestamp()where id=r.id;
 return jsonb_build_object('busy',false,'lease_id',token,'import_id',r.id,'already_recorded',r.invoice_id is not null);
end $$;

create function public.release_firewood_candidate_import(p_source text,p_order uuid,p_lease uuid,p_code text)returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.firewood_candidate_source(p_source);
 if p_code not in('provider_unavailable','payment_not_paid','provider_binding_invalid','contact_review_required','database_unconfirmed','invalid_request')then raise exception 'Invalid review code.'using errcode='22023';end if;
 update app_private.firewood_candidate_imports set lease_id=null,lease_expires_at=null,last_failure=p_code,updated_at=clock_timestamp()
  where source_id=p_source and order_id=p_order and lease_id=p_lease;
 return found;
end $$;

create function app_private.firewood_candidate_receipt(p_id uuid,p_replayed boolean)returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('contract','firewood-paid-order-v1','import_status','recorded','source_id',r.source_id,'order_id',r.order_id,'reference',r.reference,
  'attempt_id',r.attempt_id,'account_id',r.stripe_account_id,'mode','sandbox','snapshot_hash',r.payload->>'snapshot_hash','session_id',r.session_id,'payment_intent_id',r.intent_id,
  'invoice_id',i.id,'invoice_number',i.invoice_number,'payment_id',p.id,'invoice_status',i.status,'balance_due_cents',i.balance_due_cents,
  'total_cents',i.total_cents,'currency','usd','replayed',p_replayed,'original_receipt',jsonb_build_object('paid',true,'balance_due_cents',0),
  'payment_retry_required',false,'refund_pending',exists(select 1 from jsonb_array_elements(r.last_proof->'refunds')x where x->>'status'in('pending','requires_action')),
  'refund_review_required',r.refund_review_required,'refresh_required',exists(select 1 from jsonb_array_elements(r.last_proof->'refunds')x where x->>'status'in('pending','requires_action')),
  'refund_cents',p.refunded_principal_cents,'dispute_status',p.dispute_status,'review_required',p.refunded_principal_cents>0 or p.dispute_status is not null or r.refund_review_required or exists(select 1 from jsonb_array_elements(r.last_proof->'refunds')x where x->>'status'in('pending','requires_action')),
  'notification_authority','website','crm_customer_email_sent',false,'delivery_completed',false)
 from app_private.firewood_candidate_imports r join public.invoices i on i.id=r.invoice_id join public.payments p on p.id=r.payment_id where r.id=p_id;
$$;
revoke all on function app_private.firewood_candidate_receipt(uuid,boolean)from public,anon,authenticated,service_role;

create function public.finish_firewood_candidate_import(p_source text,p_order uuid,p_lease uuid,p_proof jsonb)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r app_private.firewood_candidate_imports%rowtype;prior app_private.firewood_candidate_imports%rowtype;s app_private.firewood_candidate_sources%rowtype;
 o jsonb;c jsonb;customer public.customers%rowtype;location public.service_locations%rowtype;invoice public.invoices%rowtype;payment public.payments%rowtype;
 candidates integer;location_count integer;wood integer;stacking integer;total integer;new_invoice boolean;h text;entry jsonb;old_entry jsonb;
 refunds integer:=0;d jsonb;disputed integer:=0;captured_time timestamptz;delivery_street text;lock_key text;phase text;
begin
 s:=app_private.firewood_candidate_source(p_source);
 if jsonb_typeof(p_proof)is distinct from'object'or octet_length(p_proof::text)>524288
  or p_proof->>'account_id'is distinct from s.stripe_account_id or p_proof->'livemode'is distinct from'false'::jsonb
  or p_proof->>'currency'is distinct from'usd'or p_proof->>'session_status'is distinct from'complete'
  or p_proof->>'payment_status'is distinct from'paid'or p_proof->>'intent_status'is distinct from'succeeded'
  or p_proof->'captured'is distinct from'true'::jsonb
  or coalesce(p_proof->>'intent_id','')!~'^pi_[A-Za-z0-9_]+$'or coalesce(p_proof->>'charge_id','')!~'^ch_[A-Za-z0-9_]+$'
  or not(p_proof?'dispute') or jsonb_typeof(p_proof->'dispute')not in('object','null')
  or jsonb_typeof(p_proof->'refunds')is distinct from'array'or jsonb_array_length(p_proof->'refunds')>1000
 then raise exception 'Verified Firewood payment required.'using errcode='23514';end if;
 -- Read first, then use invoice -> import/payment parent order on refreshes.
 select * into r from app_private.firewood_candidate_imports where source_id=p_source and order_id=p_order;
 if not found then raise exception 'Firewood import intent unavailable.'using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('firewood-payment:'||(p_proof->>'intent_id'),0));
 if r.invoice_id is not null then select * into strict invoice from public.invoices where id=r.invoice_id for update;end if;
 select * into strict r from app_private.firewood_candidate_imports where id=r.id for update;
 h:=encode(sha256(convert_to(p_proof::text,'UTF8')),'hex');
 if r.last_finished_lease=p_lease and r.last_proof_hash=h then return app_private.firewood_candidate_receipt(r.id,true);end if;
 if r.lease_id is distinct from p_lease or r.lease_expires_at<=clock_timestamp()then raise exception 'Firewood observation lease expired.'using errcode='40001';end if;
 perform app_private.validate_firewood_candidate_request(p_source,r.payload);o:=r.payload->'order';c:=o->'contact';wood:=(o->>'wood_cents')::integer;stacking:=(o->>'stacking_cents')::integer;total:=wood+stacking;
 if p_proof->>'session_id'is distinct from r.session_id or p_proof->>'snapshot_hash'is distinct from r.payload->>'snapshot_hash'
  or p_proof->'amount_cents'is distinct from to_jsonb(total)or p_proof->'amount_received_cents'is distinct from to_jsonb(total)
  or(r.intent_id is not null and r.intent_id<>p_proof->>'intent_id')or(r.charge_id is not null and r.charge_id<>p_proof->>'charge_id')
 then raise exception 'Firewood provider binding changed.'using errcode='23514';end if;
 captured_time:=(p_proof->>'paid_at')::timestamptz;
 if captured_time is null or captured_time>clock_timestamp()+interval'5 minutes'then raise exception 'Invalid payment time.'using errcode='23514';end if;
 if exists(select 1 from public.payments p where(p.provider_payment_id=p_proof->>'intent_id'or p.provider_checkout_session_id=r.session_id or p.provider_charge_id=p_proof->>'charge_id')and p.id is distinct from r.payment_id)then raise exception 'Payment already belongs to another invoice.'using errcode='23505';end if;
 if(select count(*)<>count(distinct x->>'id')from jsonb_array_elements(p_proof->'refunds')x)then raise exception 'Duplicate refund evidence.'using errcode='22023';end if;
 for entry in select value from jsonb_array_elements(p_proof->'refunds')loop
  if coalesce(entry->>'id','')!~'^(re|pyr)_[A-Za-z0-9_]+$'or entry->>'intent_id'is distinct from p_proof->>'intent_id'
   or entry->>'charge_id'is distinct from p_proof->>'charge_id'or entry->>'currency'is distinct from'usd'
   or entry->>'status'not in('pending','requires_action','succeeded','failed','canceled')or entry->>'status'is null
   or jsonb_typeof(entry->'amount_cents')is distinct from'number'or(entry->>'amount_cents')::numeric<>(entry->>'amount_cents')::integer
   or(entry->>'amount_cents')::integer not between 1 and total
  then raise exception 'Invalid refund evidence.'using errcode='23514';end if;
  select value into old_entry from jsonb_array_elements(coalesce(r.last_proof->'refunds','[]'))x where x->>'id'=entry->>'id';
  if old_entry is not null and(old_entry->'amount_cents'<>entry->'amount_cents'or old_entry->'created_at'is distinct from entry->'created_at'
   or(old_entry->>'status'in('failed','canceled')and entry->>'status'<>old_entry->>'status'))then raise exception 'Refund observation regressed.'using errcode='40001';end if;
  if entry->>'status'='succeeded'then refunds:=refunds+(entry->>'amount_cents')::integer;end if;
 end loop;
 if refunds>total or exists(select 1 from jsonb_array_elements(coalesce(r.last_proof->'refunds','[]'))x where not exists(select 1 from jsonb_array_elements(p_proof->'refunds')y where x->>'id'=y->>'id'))then raise exception 'Incomplete refund observation.'using errcode='23514';end if;
 d:=p_proof->'dispute';
 if d is not null and d<>'null'::jsonb then
  if jsonb_typeof(d)is distinct from'object'or coalesce(d->>'id','')!~'^(dp|du)_[A-Za-z0-9_]+$'
   or d->>'charge_id'is distinct from p_proof->>'charge_id'or d->>'intent_id'is distinct from p_proof->>'intent_id'
   or d->>'currency'is distinct from'usd'or d->>'status'is null
   or d->>'status'not in('warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','won','lost')
   or jsonb_typeof(d->'amount_cents')is distinct from'number'or(d->>'amount_cents')::numeric<>(d->>'amount_cents')::integer
   or(d->>'amount_cents')::integer not between 1 and total then raise exception 'Invalid dispute evidence.'using errcode='23514';end if;
  disputed:=(d->>'amount_cents')::integer;
 end if;
 if r.last_proof->'dispute'is not null and r.last_proof->'dispute'<>'null'::jsonb and
  (d is null or d='null'::jsonb or r.last_proof#>>'{dispute,id}'is distinct from d->>'id'
   or r.last_proof#>'{dispute,amount_cents}'is distinct from d->'amount_cents'
   or(r.last_proof#>>'{dispute,status}'in('won','lost','warning_closed')and r.last_proof#>>'{dispute,status}'is distinct from d->>'status'))then raise exception 'Dispute observation regressed.'using errcode='40001';end if;
 new_invoice:=r.invoice_id is null;
 if new_invoice then
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
   values('TEST-FW-'||r.order_id::text,customer.id,location.id,'draft',total,0,total,total,captured_time,false,'firewood-candidate-test-2026-10-28',r.reference,
    'TEST ONLY. Paid at website checkout; do not collect again. Personal household use. Delivery is not completed. Terms: firewood-20261028-household-v2. Cancellation: full refund before scheduling or at least 48 hours before the delivery window; later customer cancellations are non-refundable. Full refund if Angel cancels or cannot fulfill, or you decline an Angel-requested reschedule. Refund/dispute changes require office review.')returning * into invoice;
  insert into public.invoice_line_items(invoice_id,name,description,quantity,unit_price_cents,total_cents,sort_order)
   values(invoice.id,'Firewood — '||case o->>'quantity'when'half'then'half cord'when'full'then'full cord'else'two cords'end||', delivered','Delivery included. Any package savings are already included.',1,wood,wood,0);
  if (o->>'stacking')::boolean then insert into public.invoice_line_items(invoice_id,name,description,quantity,unit_price_cents,total_cents,sort_order)
   values(invoice.id,'Firewood stacking','One charge per delivery. Requires wheelbarrow access and reasonable carrying distance.',1,stacking,stacking,1);end if;
  insert into public.payments(invoice_id,customer_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,provider_payment_id,provider_checkout_session_id,provider_charge_id,status,paid_at,succeeded_at,reference)
   values(invoice.id,customer.id,total,total,0,'usd','stripe_checkout','stripe',p_proof->>'intent_id',r.session_id,p_proof->>'charge_id','succeeded',captured_time,captured_time,r.reference)returning * into payment;
  update app_private.firewood_candidate_imports set customer_id=customer.id,invoice_id=invoice.id,payment_id=payment.id,intent_id=p_proof->>'intent_id',charge_id=p_proof->>'charge_id'where id=r.id;
  insert into public.activity_log(actor_type,subject_type,subject_id,event_type,metadata_json)
   values('system','invoice',invoice.id,'firewood_candidate_paid_imported',jsonb_build_object('source_id',p_source,'order_id',p_order,'reference',r.reference,'payment_id',payment.id,'total_cents',total,'original_capture_verified',true,'notification_authority','website','customer_email_sent',false,'delivery_completed',false,'test_only',true));
 else
  select * into strict payment from public.payments where id=r.payment_id for update;
  if invoice.status='void'or invoice.total_cents<>total or invoice.customer_id is distinct from r.customer_id or invoice.document_terms_version<>'firewood-candidate-test-2026-10-28'
   or invoice.automatic_reminders_enabled or invoice.job_id is not null or invoice.tax_cents<>0
   or payment.invoice_id<>invoice.id or payment.amount_cents<>total or payment.total_collected_cents<>total or payment.surcharge_cents<>0
   or payment.paid_at is distinct from captured_time
   or payment.provider_payment_id is distinct from r.intent_id or payment.provider_charge_id is distinct from r.charge_id or payment.provider_checkout_session_id is distinct from r.session_id
   then raise exception 'Imported Firewood billing requires review.'using errcode='23514';end if;
 end if;
 update public.payments set refunded_principal_cents=refunds,refunded_surcharge_cents=0,status=case when refunds=total then'refunded'else'succeeded'end,
  refunded_at=case when refunds>0 then coalesce(refunded_at,clock_timestamp())else refunded_at end,
  provider_dispute_id=d->>'id',dispute_status=d->>'status',disputed_gross_cents=disputed,disputed_principal_cents=disputed,disputed_surcharge_cents=0,
  disputed_at=case when d is not null and d<>'null'::jsonb then coalesce(disputed_at,clock_timestamp())else disputed_at end,
  dispute_closed_at=case when d->>'status'in('won','lost','warning_closed')then coalesce(dispute_closed_at,clock_timestamp())else dispute_closed_at end
  where id=payment.id;
 perform public.reconcile_invoice_balance(invoice.id);
 if r.last_proof_hash is distinct from h then
  insert into public.activity_log(actor_type,subject_type,subject_id,event_type,metadata_json)
   values('system','invoice',invoice.id,'firewood_candidate_payment_reconciled',jsonb_build_object('source_id',p_source,'order_id',p_order,'payment_id',payment.id,'proof_hash',h,'refund_cents',refunds,'dispute_status',d->>'status','test_only',true,'customer_email_sent',false));
 end if;
 insert into app_private.firewood_candidate_observations(import_id,lease_id,proof,proof_hash)values(r.id,p_lease,p_proof,h);
 update app_private.firewood_candidate_imports set original_proof=coalesce(original_proof,p_proof),
  refund_review_required=refund_review_required or refunds<coalesce((select sum((x->>'amount_cents')::integer)from jsonb_array_elements(r.last_proof->'refunds')x where x->>'status'='succeeded'),0) or exists(select 1 from jsonb_array_elements(p_proof->'refunds')x where x->>'status'in('failed','canceled')),
  last_finished_lease=p_lease,last_proof=p_proof,last_proof_hash=h,lease_id=null,lease_expires_at=null,last_failure=null,updated_at=clock_timestamp()where id=r.id;
 return app_private.firewood_candidate_receipt(r.id,not new_invoice);
end $$;

revoke all on function public.claim_firewood_candidate_import(text,jsonb),public.release_firewood_candidate_import(text,uuid,uuid,text),public.finish_firewood_candidate_import(text,uuid,uuid,jsonb)from public,anon,authenticated;
grant execute on function public.claim_firewood_candidate_import(text,jsonb),public.release_firewood_candidate_import(text,uuid,uuid,text),public.finish_firewood_candidate_import(text,uuid,uuid,jsonb)to service_role;
notify pgrst,'reload schema';
