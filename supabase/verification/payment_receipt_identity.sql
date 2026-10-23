-- Actual native commands with synthetic records; all DDL, facts and history roll back.
begin;
set local lock_timeout='3s';set local statement_timeout='45s';
create temporary table receipt_identity_assertions(label text);
create temporary table receipt_identity_fixtures(label text,input jsonb);
create temporary table receipt_identity_metadata as select to_jsonb(p)-'prosrc'metadata
  from pg_proc p where p.oid='public.claim_outbound_delivery(uuid)'::regprocedure;
create function pg_temp.receipt_identity_check(ok boolean,label text)returns void language plpgsql as $$begin
  if ok is distinct from true then raise exception 'Receipt identity assertion failed: %',label;end if;
  insert into receipt_identity_assertions values(label);
end $$;
create function pg_temp.receipt_identity_prepare(party uuid,inv uuid,pay uuid,stage text default 'payment')returns jsonb
language plpgsql as $$
declare cm uuid:=gen_random_uuid();ctx jsonb;payload jsonb;prepared jsonb;
begin
  insert into public.customer_communications(id,communication_type,reminder_stage,customer_id,invoice_id,payment_id,recipient_source,recipient_email,scheduled_for,idempotency_key)
    values(cm,'payment_confirmation',stage,party,inv,pay,'customer','receipt-'||party||'@example.invalid',clock_timestamp(),'customer-communication/'||cm);
  ctx:=jsonb_build_object('kind','other','email_type','payment_confirmation','communication_id',cm,'invoice_id',inv,'payment_id',pay,'customer_id',party);
  payload:=jsonb_build_object('from','office@example.invalid','reply_to','office@example.invalid','to',jsonb_build_array('receipt-'||party||'@example.invalid'),
    'cc','[]'::jsonb,'subject','Synthetic payment receipt','text','Synthetic payment receipt '||pay);
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
  prepared:=public.prepare_outbound_delivery('customer-communication/'||cm,payload,ctx);
  perform set_config('role','none',true);
  return jsonb_build_object('delivery',prepared->>'id','communication',cm,'context',ctx,'payload',payload);
end $$;
create function pg_temp.receipt_identity_seed()returns jsonb language plpgsql as $$
declare party uuid:=gen_random_uuid();inv uuid:=gen_random_uuid();p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();first_request jsonb;second_request jsonb;
begin
  insert into public.customers(id,display_name,email)values(party,'Synthetic receipt identity','receipt-'||party||'@example.invalid');
  insert into public.invoices(id,customer_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents)
    values(inv,party,'SYNTHETIC-RECEIPT-IDENTITY-'||inv,'sent',15000,15000,15000);
  insert into public.payments(id,invoice_id,customer_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,status,paid_at)
    values(p1,inv,party,2000,2000,0,'usd','cash','manual','succeeded',clock_timestamp()),
      (p2,inv,party,3000,3000,0,'usd','check','manual','succeeded',clock_timestamp());
  first_request:=pg_temp.receipt_identity_prepare(party,inv,p1);
  second_request:=pg_temp.receipt_identity_prepare(party,inv,p2);
  return jsonb_build_object('party',party,'invoice',inv,'first_payment',p1,'second_payment',p2,'first',first_request,'second',second_request);
end $$;
create function pg_temp.receipt_identity_claim(id uuid)returns jsonb language plpgsql as $$declare result jsonb;begin
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
  result:=public.claim_outbound_delivery(id);perform set_config('role','none',true);return result;
end $$;

-- APPLY_RECEIPT_IDENTITY_CANDIDATE_HERE

do $test$
declare f jsonb;a jsonb;b jsonb;duplicate jsonb;state text;saved jsonb;history jsonb;facts jsonb;result jsonb;role_name text;denied boolean;
begin
  perform pg_temp.receipt_identity_check((select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton),'sending and appointment notices remain OFF');
  perform pg_temp.receipt_identity_check((select to_jsonb(p)-'prosrc'=b.metadata from pg_proc p cross join receipt_identity_metadata b
    where p.oid='public.claim_outbound_delivery(uuid)'::regprocedure),'claim owners, rights, search path and metadata are unchanged');
  foreach state in array array['accepted','dispatching','unknown']loop
    f:=pg_temp.receipt_identity_seed();
    select jsonb_build_object('invoice',(select to_jsonb(i)from public.invoices i where id=(f->>'invoice')::uuid),
      'payments',(select jsonb_agg(to_jsonb(p)order by id)from public.payments p where invoice_id=(f->>'invoice')::uuid))into facts;
    a:=pg_temp.receipt_identity_claim((f#>>'{first,delivery}')::uuid);
    perform pg_temp.receipt_identity_check(a is not null,state||': first receipt admitted');
    if state<>'dispatching'then
      perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
      result:=public.finish_outbound_delivery((f#>>'{first,delivery}')::uuid,(a->>'attempt_id')::uuid,state,
        case when state='accepted'then gen_random_uuid()::text else null end);
      perform set_config('role','none',true);
      perform pg_temp.receipt_identity_check(result->>'state'=state,state||': synthetic result saved');
    end if;
    select to_jsonb(d)into saved from app_private.outbound_deliveries d where id=(f#>>'{first,delivery}')::uuid;
    select coalesce(jsonb_agg(to_jsonb(e)order by id),'[]'::jsonb)into history from public.email_events e where related_invoice_id=(f->>'invoice')::uuid;
    b:=pg_temp.receipt_identity_claim((f#>>'{second,delivery}')::uuid);
    perform pg_temp.receipt_identity_check(b is not null,state||': separate payment on one invoice retains its own receipt');
    duplicate:=pg_temp.receipt_identity_prepare((f->>'party')::uuid,(f->>'invoice')::uuid,(f->>'first_payment')::uuid,'duplicate');
    perform pg_temp.receipt_identity_check(pg_temp.receipt_identity_claim((duplicate->>'delivery')::uuid)is null,state||': same payment duplicate remains blocked');
    perform pg_temp.receipt_identity_check(pg_temp.receipt_identity_claim((f#>>'{first,delivery}')::uuid)is null,state||': same saved request cannot be claimed again');
    perform pg_temp.receipt_identity_check((select to_jsonb(d)=saved from app_private.outbound_deliveries d where id=(f#>>'{first,delivery}')::uuid)
      and(select coalesce(jsonb_agg(to_jsonb(e)order by id),'[]'::jsonb)=history from public.email_events e where related_invoice_id=(f->>'invoice')::uuid),state||': first request and delivery history retained exactly');
    perform pg_temp.receipt_identity_check((select jsonb_build_object('invoice',(select to_jsonb(i)from public.invoices i where id=(f->>'invoice')::uuid),
      'payments',(select jsonb_agg(to_jsonb(p)order by id)from public.payments p where invoice_id=(f->>'invoice')::uuid)))=facts,state||': no invoice/payment mutation');
    perform pg_temp.receipt_identity_check((select count(*)=2 from app_private.outbound_delivery_attempts where delivery_id in((f#>>'{first,delivery}')::uuid,(f#>>'{second,delivery}')::uuid,(duplicate->>'delivery')::uuid)),state||': exactly one native attempt per genuine payment');
    insert into receipt_identity_fixtures values(state,f);
  end loop;
  f:=pg_temp.receipt_identity_seed();
  insert into public.email_events(email_type,status,recipient_email,subject,related_invoice_id,related_payment_id,related_customer_id,sent_at)
    values('payment_confirmation','sent','receipt-'||(f->>'party')||'@example.invalid','Synthetic legacy receipt',(f->>'invoice')::uuid,(f->>'first_payment')::uuid,(f->>'party')::uuid,clock_timestamp());
  perform pg_temp.receipt_identity_check(pg_temp.receipt_identity_claim((f#>>'{second,delivery}')::uuid)is not null,'legacy event for a different payment does not suppress the second receipt');
  perform pg_temp.receipt_identity_check(pg_temp.receipt_identity_claim((f#>>'{first,delivery}')::uuid)is null,'legacy same-payment acceptance continues blocking duplicates');
  f:=pg_temp.receipt_identity_seed();
  a:=pg_temp.receipt_identity_claim((f#>>'{first,delivery}')::uuid);
  -- Synthetic historical request lacking enough identity to distinguish payments.
  update app_private.outbound_deliveries set context=context-'payment_id' where id=(f#>>'{first,delivery}')::uuid;
  select to_jsonb(d)into saved from app_private.outbound_deliveries d where id=(f#>>'{first,delivery}')::uuid;
  perform pg_temp.receipt_identity_check(pg_temp.receipt_identity_claim((f#>>'{second,delivery}')::uuid)is null,'unidentified historical in-flight receipt retains the invoice-level hold');
  perform pg_temp.receipt_identity_check((select to_jsonb(d)=saved from app_private.outbound_deliveries d where id=(f#>>'{first,delivery}')::uuid),'unidentified historical request remains unchanged by the hold');
  f:=pg_temp.receipt_identity_seed();
  update public.customer_communications set is_automatic=true where id=(f#>>'{first,communication}')::uuid;
  perform pg_temp.receipt_identity_check(pg_temp.receipt_identity_claim((f#>>'{first,delivery}')::uuid)is null,'automatic sending OFF still rejects automatic payment receipts');
  foreach role_name in array array['anon','authenticated']loop
    denied:=false;perform set_config('request.jwt.claims',jsonb_build_object('role',role_name)::text,true);perform set_config('role',role_name,true);
    begin perform public.claim_outbound_delivery((f#>>'{second,delivery}')::uuid);exception when insufficient_privilege then denied:=true;end;
    perform set_config('role','none',true);
    perform pg_temp.receipt_identity_check(denied,role_name||': service-only admission remains denied');
  end loop;
end $test$;
select jsonb_build_object('syntheticOnly',true,'rolledBack',true,
  'assertions',(select jsonb_agg(label order by label)from receipt_identity_assertions),
  'fixtures',(select jsonb_agg(to_jsonb(f)order by label)from receipt_identity_fixtures f))verification;
rollback;
