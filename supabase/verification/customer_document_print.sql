-- Synthetic customer document inputs for local/staging render acceptance.
-- Always roll back. No provider calls, sends or approval/payment submissions.
begin;
set local lock_timeout='3s';set local statement_timeout='30s';
create temp table customer_print_cases(kind text,variant text,id uuid,party uuid,location uuid,job uuid,raw_token text);
do $fixtures$
declare kind text;variant text;doc uuid;party uuid;location uuid;job uuid;raw text;actor uuid:=gen_random_uuid();n integer;items integer;price integer;description text;table_name text;column_name text;
begin
 insert into auth.users(id,email,raw_user_meta_data)values(actor,'print-'||actor||'@example.invalid','{}');
 foreach kind in array array['quote','invoice','change_order']loop
  foreach variant in array array['short','long']loop
   doc:=gen_random_uuid();party:=gen_random_uuid();location:=gen_random_uuid();job:=gen_random_uuid();raw:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
   insert into public.customers(id,display_name,email)values(party,'Synthetic print customer','print-'||party||'@example.invalid');
   insert into public.service_locations(id,customer_id,label,street,city,state,postal_code)values(location,party,'Synthetic site','1 Test Lane','Fredericksburg','VA','22401');
   insert into public.jobs(id,customer_id,service_location_id,status,service_type,requested_scope)values(job,party,location,'accepted','other','Synthetic print work');
   if kind='quote'then
    insert into public.quotes(id,customer_id,job_id,service_location_id,quote_number,status,subtotal_cents,total_cents,customer_message)values(doc,party,job,location,'PRINT-'||variant,'sent',10000,10000,'SYNTHETIC DOCUMENT END');
   elsif kind='invoice'then
    insert into public.invoices(id,customer_id,job_id,service_location_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents)values(doc,party,job,location,'PRINT-'||variant,'sent',10000,10000,10000);
    insert into public.payments(invoice_id,customer_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,status)values(doc,party,2000,2000,0,'usd','cash','manual','succeeded');
   else
    insert into public.change_orders(id,customer_id,job_id,service_location_id,change_order_number,title,status,subtotal_cents,total_cents,original_approved_amount_cents,created_by_user_id,customer_notes)
     values(doc,party,job,location,'PRINT-'||variant,'Synthetic additional work','ready_to_send',10000,10000,50000,actor,'SYNTHETIC DOCUMENT END');
   end if;
   items:=case when variant='long'then 8 else 1 end;price:=10000/items;
   for n in 1..items loop
    description:=case when variant='long'then repeat('Synthetic scope for print testing: protect the listed site features and remove only the described debris. ',case when n=1 then 45 else 5 end)else 'Synthetic print scope. 'end||'SCOPE-LINE-'||n||'-END';
    if kind='change_order'then insert into public.change_order_line_items(change_order_id,title,description,quantity,unit_price_cents,amount_cents,sort_order)values(doc,'Synthetic service '||n,description,1,price,price,n);
    else table_name:=kind||'_line_items';column_name:=kind||'_id';
     execute format('insert into public.%I(%I,name,description,quantity,unit_price_cents,total_cents,sort_order)values($1,$2,$3,1,$4,$4,$5)',table_name,column_name)using doc,'Synthetic service '||n,description,price,n;
    end if;
   end loop;
   table_name:=kind||'_portal_tokens';column_name:=kind||'_id';
   execute format('insert into public.%I(%I,customer_id,token_hash,expires_at)values($1,$2,$3,clock_timestamp()+interval ''1 day'')',table_name,column_name)using doc,party,encode(sha256(convert_to(raw,'UTF8')),'hex');
   insert into customer_print_cases values(kind,variant,doc,party,location,job,raw);
  end loop;
 end loop;
end $fixtures$;
grant select on customer_print_cases to service_role;
set local role service_role;
set local request.jwt.claims='{"role":"service_role"}';
select jsonb_build_object('cases',jsonb_agg(jsonb_build_object('kind',c.kind,'variant',c.variant,'rawToken',c.raw_token,
 'record',case c.kind
 when 'quote'then(select to_jsonb(q)||jsonb_build_object('customers',(select to_jsonb(x)from public.customers x where x.id=c.party),'service_locations',(select to_jsonb(x)from public.service_locations x where x.id=c.location),'quote_line_items',(select jsonb_agg(to_jsonb(x)order by sort_order)from public.quote_line_items x where x.quote_id=c.id))from public.quotes q where q.id=c.id)
 when 'invoice'then(select to_jsonb(i)||jsonb_build_object('customers',(select to_jsonb(x)from public.customers x where x.id=c.party),'jobs',jsonb_build_object('service_locations',(select to_jsonb(x)from public.service_locations x where x.id=c.location)),'invoice_line_items',(select jsonb_agg(to_jsonb(x)order by sort_order)from public.invoice_line_items x where x.invoice_id=c.id),'payments',(select jsonb_agg(to_jsonb(x))from public.payments x where x.invoice_id=c.id))from public.invoices i where i.id=c.id)
 else public.get_change_order_portal_review(encode(sha256(convert_to(c.raw_token,'UTF8')),'hex'))end,
 'principal',case when c.kind='invoice'then public.get_invoice_payment_principal(c.id)end)order by c.kind,c.variant))as verification
from customer_print_cases c;
reset role;
rollback;
