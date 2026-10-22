-- Synthetic payment snapshots for the customer invoice/print renderer.
-- Run only in the declared disposable or staging environment. Always roll back.
begin;
set local lock_timeout='3s';set local statement_timeout='30s';
create temp table invoice_display_cases(name text,invoice jsonb,expected_due integer,expected_choose boolean);
do $fixtures$
declare spec jsonb;payment jsonb;party uuid;invoice_id uuid;record jsonb;kind text;total integer:=100000;actor uuid:=gen_random_uuid();lease jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data)values(actor,'invoice-display-'||actor||'@example.invalid','{}');
 update public.profiles set status='active'where id=actor;
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(actor,'Synthetic invoice reviewer',true,'active');
 insert into public.roles(name)values('owner')on conflict(name)do nothing;
 insert into public.user_roles(user_id,role_id)select actor,id from public.roles where name='owner';
 for spec in select value from jsonb_array_elements('[
  {"name":"unpaid stale zero","due":100000,"stored":0,"choose":true},
  {"name":"partial stale full","due":60000,"stored":100000,"choose":true,"payments":[{"amount":40000}]},
  {"name":"refunded principal","due":80000,"stored":60000,"choose":true,"payments":[{"amount":40000,"refund":20000}]},
  {"name":"lost dispute","due":70000,"stored":60000,"choose":true,"payments":[{"amount":40000,"dispute":10000,"dispute_status":"lost"}]},
  {"name":"won dispute","due":60000,"stored":100000,"choose":true,"payments":[{"amount":40000,"dispute":10000,"dispute_status":"won"}]},
  {"name":"fully paid stale full","due":0,"stored":100000,"choose":false,"status":"paid","payments":[{"amount":100000}]},
  {"name":"overpayment","due":0,"stored":100000,"choose":false,"payments":[{"amount":120000}]},
  {"name":"bank processing is not paid","due":100000,"stored":0,"choose":false,"payments":[{"amount":100000,"status":"pending","provider":"stripe","method":"ach"}]},
  {"name":"failed card is not paid","due":100000,"stored":0,"choose":true,"payments":[{"amount":100000,"status":"failed","provider":"stripe","method":"card"}]},
  {"name":"paid status needs review","due":60000,"stored":0,"choose":false,"status":"paid","payments":[{"amount":40000}]},
  {"name":"void cannot collect","due":100000,"stored":0,"choose":false,"status":"void"},
  {"name":"organization partial","due":60000,"stored":0,"choose":true,"organization":true,"payments":[{"amount":40000}]},
  {"name":"complete aggregate over API row cap","due":98995,"stored":0,"choose":true,"many":1005}
 ]'::jsonb)loop
  party:=gen_random_uuid();invoice_id:=gen_random_uuid();
  if coalesce((spec->>'organization')::boolean,false)then
   insert into public.organizations(id,name,billing_email)values(party,'Synthetic display organization','invoice-display@example.invalid');kind:='organization';
  else insert into public.customers(id,display_name,email)values(party,'Synthetic display customer','invoice-display@example.invalid');kind:='customer';end if;
  insert into public.invoices(id,customer_id,organization_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents)
   values(invoice_id,case when kind='customer'then party end,case when kind='organization'then party end,'DISPLAY-'||invoice_id,case when spec->>'status'='void'then 'sent'else coalesce(spec->>'status','sent')end,total,total,(spec->>'stored')::integer);
  for payment in select value from jsonb_array_elements(coalesce(spec->'payments','[]'))loop
   insert into public.payments(invoice_id,customer_id,organization_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,status,refunded_principal_cents,disputed_principal_cents,disputed_gross_cents,dispute_status)
    values(invoice_id,case when kind='customer'then party end,case when kind='organization'then party end,(payment->>'amount')::integer,(payment->>'amount')::integer,0,'usd',coalesce(payment->>'method','cash'),coalesce(payment->>'provider','manual'),coalesce(payment->>'status','succeeded'),coalesce((payment->>'refund')::integer,0),coalesce((payment->>'dispute')::integer,0),coalesce((payment->>'dispute')::integer,0),payment->>'dispute_status');
  end loop;
  if spec?'many'then insert into public.payments(invoice_id,customer_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,status)
   select invoice_id,party,1,1,0,'usd','cash','manual','succeeded'from generate_series(1,(spec->>'many')::integer);end if;
  if spec->>'status'='void'then
   perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
   lease:=public.begin_invoice_void(invoice_id);perform public.finalize_invoice_void(invoice_id,(lease->>'token')::uuid);
   perform set_config('request.jwt.claims','{}',true);
  end if;
  select to_jsonb(i)||jsonb_build_object('invoice_line_items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Synthetic service','quantity',1,'unit_price_cents',total,'total_cents',total,'sort_order',0)),
   'payments',coalesce((select jsonb_agg(to_jsonb(p))from(select * from public.payments p where p.invoice_id=i.id order by p.id limit 1)p),'[]'::jsonb),
   'jobs',null,'customers',case when kind='customer'then jsonb_build_object('display_name','Synthetic display customer')end,
   'organizations',case when kind='organization'then jsonb_build_object('name','Synthetic display organization')end)into record from public.invoices i where i.id=invoice_id;
  insert into invoice_display_cases values(spec->>'name',record,(spec->>'due')::integer,(spec->>'choose')::boolean);
 end loop;
end $fixtures$;
grant select on invoice_display_cases to service_role;
set local role service_role;
set local request.jwt.claims='{"role":"service_role"}';
select jsonb_build_object('cases',jsonb_agg(jsonb_build_object('name',c.name,'invoice',c.invoice,'expectedDue',c.expected_due,'expectedChoose',c.expected_choose,
 'receipt',public.get_invoice_payment_principal((c.invoice->>'id')::uuid))order by c.name))as verification
from invoice_display_cases c;
reset role;
rollback;
