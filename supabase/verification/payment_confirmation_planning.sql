-- Native synthetic source/queue checks only. No migration, provider or setting change.
begin;
set local lock_timeout='3s';set local statement_timeout='45s';
create temporary table payment_planning_assertions(label text);
create temporary table payment_planning_fixtures(input jsonb);
create function pg_temp.payment_planning_check(ok boolean,label text)returns void language plpgsql as $$begin
  if ok is distinct from true then raise exception 'Payment planning assertion failed: %',label;end if;
  insert into payment_planning_assertions values(label);
end $$;
do $test$
declare party uuid:=gen_random_uuid();inv uuid:=gen_random_uuid();other_inv uuid:=gen_random_uuid();other_pay uuid:=gen_random_uuid();
  original_payments jsonb;settings jsonb;rows jsonb;source jsonb;customer jsonb;history jsonb;next_id uuid;cursor_id uuid;total integer:=0;n integer;denied boolean;first_id uuid;
begin
  insert into public.customers(id,display_name,email)values(party,'Synthetic planning customer','planning-'||party||'@example.invalid');
  insert into public.invoices(id,customer_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents)
    values(inv,party,'SYNTHETIC-PLANNING-'||inv,'sent',10000,10000,10000),
      (other_inv,party,'SYNTHETIC-OTHER-'||other_inv,'sent',10000,10000,10000);
  insert into public.payments(invoice_id,customer_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,status,paid_at)
    select inv,party,1,1,0,'usd','cash','manual','succeeded',clock_timestamp()from generate_series(1,1001);
  insert into public.payments(id,invoice_id,customer_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,status,paid_at)
    values(other_pay,other_inv,party,1,1,0,'usd','check','manual','succeeded',clock_timestamp());
  select jsonb_agg(to_jsonb(p)order by id)into original_payments from public.payments p where customer_id=party;
  select to_jsonb(c)into customer from public.customers c where id=party;
  -- Enabled values are exported test-adapter inputs only; stored switches stay OFF.
  select to_jsonb(s)||jsonb_build_object('automated_sending_enabled',true,'payment_confirmation_enabled',true,
    'appointment_change_notices_enabled',false,'quote_follow_up_enabled',false,'invoice_reminder_enabled',false,'updated_at','2000-01-01T00:00:00.000Z')into settings
    from public.communication_settings s where singleton;
  select jsonb_agg(to_jsonb(p)||jsonb_build_object('customers',customer,'organizations',null,'invoices',jsonb_build_object('accounts_payable_contact',null,'billing_contact',null))order by p.id)
    into rows from public.payments p where customer_id=party;
  insert into payment_planning_fixtures values(jsonb_build_object('settings',settings,'invoice',inv,'otherInvoice',other_inv,'otherPayment',other_pay,'payments',rows));
  perform pg_temp.payment_planning_check(jsonb_array_length(rows)=1002,'native fixture exceeds the API row cap and includes a second invoice');
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
  loop
    select count(*),max(p.id::text)::uuid into n,next_id from(select id from public.payments
      where invoice_id=inv and status='succeeded'and created_at>='2000-01-01'and(cursor_id is null or id>cursor_id)order by id limit 200)p;
    exit when n=0;total:=total+n;cursor_id:=next_id;
  end loop;
  perform set_config('role','none',true);
  perform pg_temp.payment_planning_check(total=1001,'native ordered UUID cursor reads all invoice payments across six nonempty pages');
  perform pg_temp.payment_planning_check(cursor_id=(select max(id::text)::uuid from public.payments where invoice_id=inv),'native cursor reaches the final eligible payment');
  perform set_config('role','service_role',true);
  insert into public.customer_communications(communication_type,reminder_stage,customer_id,invoice_id,payment_id,recipient_source,recipient_email,scheduled_for,source_version,is_automatic,idempotency_key)
    select 'payment_confirmation','payment',party,inv,p.id,'customer','planning-'||party||'@example.invalid',clock_timestamp(),p.updated_at,true,'auto:payment:'||p.id||':confirmation'
      from public.payments p where invoice_id=inv and status='succeeded'on conflict(idempotency_key)do nothing;
  get diagnostics n=row_count;perform set_config('role','none',true);
  perform pg_temp.payment_planning_check(n=1001,'service-role preparation creates one stable queue row for every eligible payment');
  select id into first_id from public.customer_communications where invoice_id=inv order by id limit 1;
  update public.customer_communications set status='sent',provider_message_id='synthetic-saved-receipt',sent_at=clock_timestamp()where id=first_id;
  select jsonb_agg(to_jsonb(c)order by id)into history from public.customer_communications c where invoice_id=inv;
  perform set_config('role','service_role',true);
  insert into public.customer_communications(communication_type,reminder_stage,customer_id,invoice_id,payment_id,recipient_source,recipient_email,scheduled_for,is_automatic,idempotency_key)
    select 'payment_confirmation','payment',party,inv,p.id,'customer','planning-'||party||'@example.invalid',clock_timestamp(),true,'auto:payment:'||p.id||':confirmation'
      from public.payments p where invoice_id=inv and status='succeeded'on conflict(idempotency_key)do nothing;
  get diagnostics n=row_count;perform set_config('role','none',true);
  perform pg_temp.payment_planning_check(n=0,'same-key recovery adds no duplicate queue row');
  perform pg_temp.payment_planning_check((select jsonb_agg(to_jsonb(c)order by id)=history from public.customer_communications c where invoice_id=inv),'same-key recovery retains accepted state and exact queue history');
  perform pg_temp.payment_planning_check(not exists(select 1 from public.customer_communications where invoice_id=other_inv),'invoice-scoped preparation leaves the other invoice untouched');
  perform pg_temp.payment_planning_check((select jsonb_agg(to_jsonb(p)order by id)=original_payments from public.payments p where customer_id=party),'planning does not mutate payment facts');
  perform pg_temp.payment_planning_check(not exists(select 1 from public.email_events where related_customer_id=party)
    and not exists(select 1 from app_private.outbound_deliveries where context->>'customer_id'=party::text),'queue preparation creates no email acceptance or outbound provider request');
  denied:=false;perform set_config('request.jwt.claims','{"role":"anon"}',true);perform set_config('role','anon',true);
  begin insert into public.customer_communications(communication_type,reminder_stage,customer_id,recipient_source,recipient_email,scheduled_for,idempotency_key)
    values('payment_confirmation','payment',party,'customer','synthetic@example.invalid',clock_timestamp(),'synthetic-denied/'||party);
  exception when insufficient_privilege then denied:=true;end;perform set_config('role','none',true);
  perform pg_temp.payment_planning_check(denied,'anonymous queue writes remain denied');
  perform pg_temp.payment_planning_check((select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton),'stored sending and appointment notices remain OFF');
end $test$;
select jsonb_build_object('syntheticOnly',true,'rolledBack',true,'assertions',(select jsonb_agg(label order by label)from payment_planning_assertions),
  'fixtures',(select jsonb_agg(input)from payment_planning_fixtures))verification;
rollback;
