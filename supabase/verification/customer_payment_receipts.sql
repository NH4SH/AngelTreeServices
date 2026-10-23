-- Synthetic receipt inputs only. No provider, send, persistent setting or migration.
begin;
set local lock_timeout='3s';
set local statement_timeout='45s';
create temporary table receipt_fixtures(label text,payment jsonb,principal jsonb,expected_balance integer);
create temporary table receipt_assertions(label text);
create function pg_temp.receipt_check(ok boolean,label text)returns void language plpgsql as $$begin
  if ok is distinct from true then raise exception 'Payment receipt assertion failed: %',label;end if;
  insert into pg_temp.receipt_assertions values(label);
end $$;
do $test$
declare party uuid:=gen_random_uuid();inv uuid;pay uuid;scenario text;method text;provider text;state text;
  amount integer;surcharge integer;principal jsonb;expected integer;date_paid timestamptz;reference text;
begin
  insert into public.customers(id,display_name,email)
    values(party,'Synthetic receipt homeowner','receipt-'||party||'@example.invalid');
  foreach scenario in array array['card','ach','check','cash','legacy','pending','refunded']loop
    inv:=gen_random_uuid();pay:=gen_random_uuid();amount:=10000;surcharge:=0;
    method:=scenario;provider:='manual';state:='succeeded';date_paid:='2026-10-22T16:30:00Z';reference:=null;
    if scenario='card'then surcharge:=300;provider:='stripe';reference:='pi_synthetic_private';end if;
    if scenario='ach'then provider:='stripe';end if;
    if scenario='check'then amount:=4000;reference:='Synthetic check 42';end if;
    if scenario='cash'then amount:=15000;end if;
    if scenario='legacy'then method:=null;date_paid:=null;end if;
    if scenario='pending'then method:='ach';provider:='stripe';state:='pending';date_paid:=null;end if;
    if scenario='refunded'then method:='card';provider:='stripe';state:='refunded';end if;
    insert into public.invoices(id,customer_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents)
      values(inv,party,'SYNTHETIC-RECEIPT-'||inv,'sent',15000,15000,15000);
    insert into public.payments(id,invoice_id,customer_id,amount_cents,surcharge_cents,total_collected_cents,currency,payment_method,provider,status,paid_at,reference)
      values(pay,inv,party,amount,surcharge,amount+surcharge,'usd',method,provider,state,date_paid,reference);
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    perform set_config('role','service_role',true);
    principal:=public.get_invoice_payment_principal(inv);
    perform set_config('role','none',true);
    expected:=15000-case when state='succeeded'then amount else 0 end;
    perform pg_temp.receipt_check(principal->>'invoice_id'=inv::text and (principal->>'paid_principal_cents')::integer=15000-expected,
      scenario||': installed principal snapshot retains the correct invoice balance');
    insert into receipt_fixtures select scenario,to_jsonb(p)||jsonb_build_object('invoices',
      jsonb_build_object('id',inv,'invoice_number','SYNTHETIC-RECEIPT-'||inv,'total_cents',15000)),principal,expected
      from public.payments p where p.id=pay;
  end loop;
  perform pg_temp.receipt_check((select payment->>'paid_at'is null and payment->>'payment_method'is null from receipt_fixtures where label='legacy'),
    'legacy missing payment facts remain absent rather than backfilled');
end $test$;
select jsonb_build_object('syntheticOnly',true,'rolledBack',true,
  'assertions',(select jsonb_agg(label order by label)from receipt_assertions),
  'fixtures',(select jsonb_agg(to_jsonb(f)order by label)from receipt_fixtures f))verification;
rollback;
