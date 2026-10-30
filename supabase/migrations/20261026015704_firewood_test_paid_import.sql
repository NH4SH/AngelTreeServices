-- Test-only Firewood import. No source is enabled by this migration.
-- Install only in an explicitly isolated disposable test stack for this review.
set local lock_timeout='3s';
set local statement_timeout='30s';

create table app_private.firewood_test_sources (
 id text primary key check(id ~ '^[a-z][a-z0-9_-]{2,63}$'),
 stripe_account_id text not null check(stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
 environment_id text not null check(environment_id ~ '^ats_fwimport_[a-f0-9]{12}$'),
 enabled boolean not null default false,
 livemode boolean not null default false check(livemode=false)
);
create table app_private.firewood_test_imports (
 id uuid primary key default gen_random_uuid(),
 source_id text not null references app_private.firewood_test_sources(id),
 order_id uuid not null,attempt_id uuid not null,reference text not null,
 payload jsonb not null,payload_hash text not null,
 stripe_account_id text not null,livemode boolean not null default false check(livemode=false),
 session_id text not null,intent_id text,charge_id text,
 customer_id uuid references public.customers(id)on delete restrict,
 invoice_id uuid unique references public.invoices(id)on delete restrict,
 payment_id uuid unique references public.payments(id)on delete restrict,
 lease_id uuid,lease_expires_at timestamptz,
 last_finished_lease uuid,last_proof jsonb,last_proof_hash text,
 last_failure text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(source_id,order_id),unique(source_id,reference),unique(source_id,attempt_id),unique(stripe_account_id,livemode,session_id),
 check((invoice_id is null)=(payment_id is null)),
 check((lease_id is null)=(lease_expires_at is null))
);
create unique index firewood_test_import_intent on app_private.firewood_test_imports(stripe_account_id,livemode,intent_id)where intent_id is not null;
alter table app_private.firewood_test_sources enable row level security;
alter table app_private.firewood_test_imports enable row level security;
revoke all on app_private.firewood_test_sources,app_private.firewood_test_imports from public,anon,authenticated,service_role;

-- A distinct immutable test family avoids pretending the checkout confirmed the
-- older domestic-use tax exemption or requesting payment a second time.
alter table public.invoices drop constraint invoices_document_terms_version_known;
alter table public.invoices add constraint invoices_document_terms_version_known
 check(document_terms_version in('legacy-2026-10-22','firewood-household-2026-10-24','firewood-checkout-test-2026-10-25'));

create function app_private.firewood_test_source(p_source text)returns app_private.firewood_test_sources
language plpgsql security invoker set search_path='' as $$
declare s app_private.firewood_test_sources%rowtype;
begin
 if auth.uid()is not null or current_setting('role',true)<>'service_role' then raise exception 'Firewood server operation only.'using errcode='42501';end if;
 select * into s from app_private.firewood_test_sources where id=p_source and enabled and not livemode;
 if not found then raise exception 'Firewood test source unavailable.'using errcode='42501';end if;
 return s;
end $$;
revoke all on function app_private.firewood_test_source(text)from public,anon,authenticated,service_role;

-- Confirm the private disposable-stack identity before claiming any intent.
create function public.get_firewood_test_source_context(p_source text)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s app_private.firewood_test_sources%rowtype;
begin
 s:=app_private.firewood_test_source(p_source);
 return jsonb_build_object('environment_id',s.environment_id,'account_id',s.stripe_account_id,'livemode',s.livemode);
end $$;
revoke all on function public.get_firewood_test_source_context(text)from public,anon,authenticated;
grant execute on function public.get_firewood_test_source_context(text)to service_role;

create function app_private.validate_firewood_test_request(p_source text,p_request jsonb)returns void
language plpgsql security invoker set search_path='' as $$
declare s app_private.firewood_test_sources%rowtype;o jsonb;c jsonb;wood integer;stacking integer;
begin
 s:=app_private.firewood_test_source(p_source);o:=p_request->'order';c:=o->'contact';
 if jsonb_typeof(p_request)is distinct from'object'or octet_length(p_request::text)>16384
  or p_request->>'contract'is distinct from'firewood-test-import-v1'
  or p_request->>'source_id'is distinct from s.id or p_request->>'account_id'is distinct from s.stripe_account_id
  or coalesce(p_request->>'order_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  or coalesce(p_request->>'attempt_id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  or coalesce(p_request->>'reference','')!~'^FW-TEST-[A-Z0-9]{8,48}$'
  or coalesce(p_request->>'session_id','')!~'^cs_test_[A-Za-z0-9_]{8,200}$'
  or coalesce(p_request->>'snapshot_hash','')!~'^[a-f0-9]{64}$'
  or jsonb_typeof(o)is distinct from'object'or jsonb_typeof(c)is distinct from'object'
  or o->>'currency'is distinct from'usd'or o->>'tax_assumption'is distinct from'unresolved_test_only'
  or o->>'terms_version'is distinct from'firewood-checkout-test-2026-10-25'
  or jsonb_typeof(o->'stacking')is distinct from'boolean'
 then raise exception 'Invalid Firewood test request.'using errcode='22023';end if;
 wood:=case o->>'quantity'when'half'then 30000 when'full'then 45000 when'two'then 84000 end;
 stacking:=case when(o->>'stacking')::boolean then 15000 else 0 end;
 if wood is null or o->'wood_cents'is distinct from to_jsonb(wood)or o->'delivery_cents'is distinct from'0'::jsonb
  or o->'stacking_cents'is distinct from to_jsonb(stacking)or o->'total_cents'is distinct from to_jsonb(wood+stacking)
  or length(coalesce(c->>'name',''))not between 1 and 100 or length(coalesce(c->>'email',''))not between 3 and 254
  or c->>'email'!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or coalesce(c->>'phone','')!~'^[0-9]{10}$'
  or length(coalesce(c->>'address',''))not between 1 and 150 or length(coalesce(c->>'city',''))not between 1 and 100
  or coalesce(c->>'state','')!~'^[A-Z]{2}$'or coalesce(c->>'postal','')!~'^[0-9]{5}(-[0-9]{4})?$'
  or length(coalesce(c->>'address2',''))>100 or length(coalesce(c->>'notes',''))>500
 then raise exception 'Invalid Firewood test totals or contact.'using errcode='22023';end if;
end $$;
revoke all on function app_private.validate_firewood_test_request(text,jsonb)from public,anon,authenticated,service_role;

create function public.claim_firewood_test_import(p_source text,p_request jsonb)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare s app_private.firewood_test_sources%rowtype;r app_private.firewood_test_imports%rowtype;h text;token uuid:=gen_random_uuid();
begin
 perform app_private.validate_firewood_test_request(p_source,p_request);s:=app_private.firewood_test_source(p_source);
 h:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('firewood-order:'||p_source||':'||(p_request->>'order_id'),0));
 select * into r from app_private.firewood_test_imports where source_id=p_source and order_id=(p_request->>'order_id')::uuid for update;
 if not found then
  insert into app_private.firewood_test_imports(source_id,order_id,attempt_id,reference,payload,payload_hash,stripe_account_id,session_id)
   values(p_source,(p_request->>'order_id')::uuid,(p_request->>'attempt_id')::uuid,p_request->>'reference',p_request,h,s.stripe_account_id,p_request->>'session_id')returning * into r;
 elsif r.payload_hash<>h or r.payload<>p_request then raise exception 'Firewood import identity changed.'using errcode='23505';end if;
 if r.lease_expires_at>clock_timestamp()then return jsonb_build_object('busy',true);end if;
 update app_private.firewood_test_imports set lease_id=token,lease_expires_at=clock_timestamp()+interval'30 seconds',last_failure=null,updated_at=clock_timestamp()where id=r.id;
 return jsonb_build_object('busy',false,'lease_id',token,'import_id',r.id,'already_recorded',r.invoice_id is not null);
end $$;

create function public.release_firewood_test_import(p_source text,p_order uuid,p_lease uuid,p_code text)returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.firewood_test_source(p_source);
 if p_code not in('provider_unavailable','payment_not_paid','provider_binding_invalid','contact_review_required','database_unconfirmed','invalid_request')then raise exception 'Invalid review code.'using errcode='22023';end if;
 update app_private.firewood_test_imports set lease_id=null,lease_expires_at=null,last_failure=p_code,updated_at=clock_timestamp()
  where source_id=p_source and order_id=p_order and lease_id=p_lease;
 return found;
end $$;

create function app_private.firewood_test_receipt(p_id uuid,p_replayed boolean)returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('contract','firewood-test-import-v1','import_status','recorded','source_id',r.source_id,'order_id',r.order_id,'reference',r.reference,
  'attempt_id',r.attempt_id,'account_id',r.stripe_account_id,'mode','test','session_id',r.session_id,'payment_intent_id',r.intent_id,
  'invoice_id',i.id,'invoice_number',i.invoice_number,'payment_id',p.id,'invoice_status',i.status,'balance_due_cents',i.balance_due_cents,
  'total_cents',i.total_cents,'currency','usd','replayed',p_replayed,'original_receipt',jsonb_build_object('paid',true,'balance_due_cents',0),
  'refund_cents',p.refunded_principal_cents,'dispute_status',p.dispute_status,'review_required',p.refunded_principal_cents>0 or p.dispute_status is not null,
  'notification_authority','website','crm_customer_email_sent',false,'delivery_completed',false)
 from app_private.firewood_test_imports r join public.invoices i on i.id=r.invoice_id join public.payments p on p.id=r.payment_id where r.id=p_id;
$$;
revoke all on function app_private.firewood_test_receipt(uuid,boolean)from public,anon,authenticated,service_role;

create function public.finish_firewood_test_import(p_source text,p_order uuid,p_lease uuid,p_proof jsonb)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r app_private.firewood_test_imports%rowtype;prior app_private.firewood_test_imports%rowtype;s app_private.firewood_test_sources%rowtype;
 o jsonb;c jsonb;customer public.customers%rowtype;location public.service_locations%rowtype;invoice public.invoices%rowtype;payment public.payments%rowtype;
 candidates integer;location_count integer;wood integer;stacking integer;total integer;new_invoice boolean;h text;entry jsonb;old_entry jsonb;
 refunds integer:=0;d jsonb;disputed integer:=0;captured_time timestamptz;delivery_street text;lock_key text;phase text;
begin
 s:=app_private.firewood_test_source(p_source);
 if jsonb_typeof(p_proof)is distinct from'object'or octet_length(p_proof::text)>524288
  or p_proof->>'account_id'is distinct from s.stripe_account_id or p_proof->'livemode'is distinct from'false'::jsonb
  or p_proof->>'currency'is distinct from'usd'or p_proof->>'session_status'is distinct from'complete'
  or p_proof->>'payment_status'is distinct from'paid'or p_proof->>'intent_status'is distinct from'succeeded'
  or p_proof->'captured'is distinct from'true'::jsonb
  or coalesce(p_proof->>'intent_id','')!~'^pi_[A-Za-z0-9_]+$'or coalesce(p_proof->>'charge_id','')!~'^ch_[A-Za-z0-9_]+$'
  or jsonb_typeof(p_proof->'refunds')is distinct from'array'or jsonb_array_length(p_proof->'refunds')>1000
 then raise exception 'Verified Firewood payment required.'using errcode='23514';end if;
 -- Read first, then use invoice -> import/payment parent order on refreshes.
 select * into r from app_private.firewood_test_imports where source_id=p_source and order_id=p_order;
 if not found then raise exception 'Firewood import intent unavailable.'using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('firewood-payment:'||(p_proof->>'intent_id'),0));
 if r.invoice_id is not null then select * into strict invoice from public.invoices where id=r.invoice_id for update;end if;
 select * into strict r from app_private.firewood_test_imports where id=r.id for update;
 h:=encode(sha256(convert_to(p_proof::text,'UTF8')),'hex');
 if r.last_finished_lease=p_lease and r.last_proof_hash=h then return app_private.firewood_test_receipt(r.id,true);end if;
 if r.lease_id is distinct from p_lease or r.lease_expires_at<=clock_timestamp()then raise exception 'Firewood observation lease expired.'using errcode='40001';end if;
 perform app_private.validate_firewood_test_request(p_source,r.payload);o:=r.payload->'order';c:=o->'contact';wood:=(o->>'wood_cents')::integer;stacking:=(o->>'stacking_cents')::integer;total:=wood+stacking;
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
   or(old_entry->>'status'in('succeeded','failed','canceled')and entry->>'status'<>old_entry->>'status'))then raise exception 'Refund observation regressed.'using errcode='40001';end if;
  if entry->>'status'='succeeded'then refunds:=refunds+(entry->>'amount_cents')::integer;end if;
 end loop;
 if refunds>total or exists(select 1 from jsonb_array_elements(coalesce(r.last_proof->'refunds','[]'))x where not exists(select 1 from jsonb_array_elements(p_proof->'refunds')y where x->>'id'=y->>'id'))then raise exception 'Incomplete refund observation.'using errcode='23514';end if;
 d:=p_proof->'dispute';
 if d is not null and d<>'null'::jsonb then
  if jsonb_typeof(d)is distinct from'object'or coalesce(d->>'id','')!~'^dp_[A-Za-z0-9_]+$'
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
   values('TEST-FW-'||r.order_id::text,customer.id,location.id,'draft',total,0,total,total,captured_time,false,'firewood-checkout-test-2026-10-25',r.reference,
    'TEST ONLY. Paid at website checkout; do not collect again. Delivery is not completed. Refund/dispute changes require office review.')returning * into invoice;
  insert into public.invoice_line_items(invoice_id,name,description,quantity,unit_price_cents,total_cents,sort_order)
   values(invoice.id,'Firewood — '||case o->>'quantity'when'half'then'half cord'when'full'then'full cord'else'two cords'end||', delivered','Delivery included. Any package savings are already included.',1,wood,wood,0);
  if stacking>0 then insert into public.invoice_line_items(invoice_id,name,description,quantity,unit_price_cents,total_cents,sort_order)
   values(invoice.id,'Firewood stacking','One charge per delivery. Requires wheelbarrow access and reasonable carrying distance.',1,stacking,stacking,1);end if;
  insert into public.payments(invoice_id,customer_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,provider_payment_id,provider_checkout_session_id,provider_charge_id,status,paid_at,succeeded_at,reference)
   values(invoice.id,customer.id,total,total,0,'usd','stripe_checkout','stripe',p_proof->>'intent_id',r.session_id,p_proof->>'charge_id','succeeded',captured_time,captured_time,r.reference)returning * into payment;
  update app_private.firewood_test_imports set customer_id=customer.id,invoice_id=invoice.id,payment_id=payment.id,intent_id=p_proof->>'intent_id',charge_id=p_proof->>'charge_id'where id=r.id;
  insert into public.activity_log(actor_type,subject_type,subject_id,event_type,metadata_json)
   values('system','invoice',invoice.id,'firewood_test_paid_imported',jsonb_build_object('source_id',p_source,'order_id',p_order,'reference',r.reference,'payment_id',payment.id,'total_cents',total,'original_capture_verified',true,'notification_authority','website','customer_email_sent',false,'delivery_completed',false,'test_only',true));
 else
  select * into strict payment from public.payments where id=r.payment_id for update;
  if invoice.status='void'or invoice.total_cents<>total or invoice.customer_id is distinct from r.customer_id or invoice.document_terms_version<>'firewood-checkout-test-2026-10-25'
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
   values('system','invoice',invoice.id,'firewood_test_payment_reconciled',jsonb_build_object('source_id',p_source,'order_id',p_order,'payment_id',payment.id,'proof_hash',h,'refund_cents',refunds,'dispute_status',d->>'status','test_only',true,'customer_email_sent',false));
 end if;
 update app_private.firewood_test_imports set last_finished_lease=p_lease,last_proof=p_proof,last_proof_hash=h,lease_id=null,lease_expires_at=null,last_failure=null,updated_at=clock_timestamp()where id=r.id;
 return app_private.firewood_test_receipt(r.id,not new_invoice);
end $$;

revoke all on function public.claim_firewood_test_import(text,jsonb),public.release_firewood_test_import(text,uuid,uuid,text),public.finish_firewood_test_import(text,uuid,uuid,jsonb)from public,anon,authenticated;
grant execute on function public.claim_firewood_test_import(text,jsonb),public.release_firewood_test_import(text,uuid,uuid,text),public.finish_firewood_test_import(text,uuid,uuid,jsonb)to service_role;
notify pgrst,'reload schema';
