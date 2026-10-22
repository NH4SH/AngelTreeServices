-- Rollback-only synthetic inputs for customer entry/link recovery acceptance.
-- No emails, approvals, payments, persistent roles, schema or grants are changed.
begin;
set local lock_timeout='3s';set local statement_timeout='30s';
create temp table entry_documents(kind text,id uuid,party uuid,location uuid,raw_token text);
create temp table entry_cases(kind text,scenario text,id uuid,raw_token text,expected_available boolean);
do $fixtures$
declare kind text;scenario text;doc uuid;party uuid;other_party uuid:=gen_random_uuid();location uuid;job uuid;raw text;actor uuid:=gen_random_uuid();table_name text;column_name text;
begin
 insert into auth.users(id,email,raw_user_meta_data)values(actor,'entry-'||actor||'@example.invalid','{}');
 insert into public.customers(id,display_name)values(other_party,'ENTRY_OTHER_CUSTOMER_CANARY');
 foreach kind in array array['quote','invoice','change_order']loop
  doc:=gen_random_uuid();party:=gen_random_uuid();location:=gen_random_uuid();job:=gen_random_uuid();
  insert into public.customers(id,display_name,email)values(party,'ENTRY_CUSTOMER_CANARY','entry-'||party||'@example.invalid');
  insert into public.service_locations(id,customer_id,label,street,city,state,postal_code)values(location,party,'Synthetic property','1 Test Lane','Fredericksburg','VA','22401');
  insert into public.jobs(id,customer_id,service_location_id,status,service_type,requested_scope)values(job,party,location,'accepted','other','Synthetic entry recovery');
  if kind='quote'then
   insert into public.quotes(id,customer_id,job_id,service_location_id,quote_number,status,subtotal_cents,total_cents)values(doc,party,job,location,'ENTRY-SYNTHETIC','sent',10000,10000);
   insert into public.quote_line_items(quote_id,name,quantity,unit_price_cents,total_cents)values(doc,'ENTRY_SCOPE_CANARY',1,10000,10000);
  elsif kind='invoice'then
   insert into public.invoices(id,customer_id,job_id,service_location_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents)values(doc,party,job,location,'ENTRY-SYNTHETIC','sent',10000,10000,10000);
   insert into public.invoice_line_items(invoice_id,name,quantity,unit_price_cents,total_cents)values(doc,'ENTRY_SCOPE_CANARY',1,10000,10000);
  else
   insert into public.change_orders(id,customer_id,job_id,service_location_id,change_order_number,title,status,subtotal_cents,total_cents,original_approved_amount_cents,created_by_user_id)
    values(doc,party,job,location,'ENTRY-SYNTHETIC','ENTRY_SCOPE_CANARY','ready_to_send',10000,10000,50000,actor);
   insert into public.change_order_line_items(change_order_id,title,quantity,unit_price_cents,amount_cents)values(doc,'ENTRY_SCOPE_CANARY',1,10000,10000);
  end if;
  foreach scenario in array array['active','expired','revoked','unknown','wrong_document','reassigned']loop
   raw:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
   if scenario not in('unknown','wrong_document')then
    table_name:=kind||'_portal_tokens';column_name:=kind||'_id';
    execute format('insert into public.%I(%I,customer_id,token_hash,expires_at,revoked_at)values($1,$2,$3,$4,$5)',table_name,column_name)
     using doc,case when scenario='reassigned'then other_party else party end,encode(sha256(convert_to(raw,'UTF8')),'hex'),
      case when scenario='expired'then clock_timestamp()-interval '1 day'else clock_timestamp()+interval '1 day'end,
      case when scenario='revoked'then clock_timestamp()else null end;
   end if;
   insert into entry_cases values(kind,scenario,doc,raw,scenario='active');
   if scenario='active'then insert into entry_documents values(kind,doc,party,location,raw);end if;
  end loop;
 end loop;
 update entry_cases c set raw_token=(select d.raw_token from entry_documents d where d.kind=case when c.kind='quote'then'invoice'else'quote'end)where c.scenario='wrong_document';
end $fixtures$;

grant select on entry_documents to anon;
set local role anon;
set local request.jwt.claims='{"role":"anon"}';
do $denials$
declare d record;hits integer;
begin
 for d in select * from entry_documents loop
  begin
   execute format('select count(*)from public.%I where id=$1',case d.kind when'quote'then'quotes'when'invoice'then'invoices'else'change_orders'end)into hits using d.id;
   if hits<>0 then raise exception 'Anonymous document row access must remain denied';end if;
  exception when insufficient_privilege then null;
  end;
 end loop;
 if has_function_privilege('anon','public.get_change_order_portal_review(text)','execute')then raise exception 'Anonymous capability RPC access must remain denied';end if;
end $denials$;
reset role;
grant select on entry_documents,entry_cases to service_role;
set local role service_role;
set local request.jwt.claims='{"role":"service_role"}';
select jsonb_build_object('cases',jsonb_agg(jsonb_build_object('kind',c.kind,'scenario',c.scenario,'rawToken',c.raw_token,'expectedAvailable',c.expected_available,
 'token',case c.kind
  when'quote'then(select to_jsonb(t)from public.quote_portal_tokens t where token_hash=encode(sha256(convert_to(c.raw_token,'UTF8')),'hex'))
  when'invoice'then(select to_jsonb(t)from public.invoice_portal_tokens t where token_hash=encode(sha256(convert_to(c.raw_token,'UTF8')),'hex'))end,
 'record',case c.kind
  when'quote'then(select to_jsonb(q)||jsonb_build_object('customers',(select to_jsonb(x)from public.customers x where x.id=d.party),'quote_line_items',(select jsonb_agg(to_jsonb(x))from public.quote_line_items x where x.quote_id=c.id))from public.quotes q where q.id=c.id)
  when'invoice'then(select to_jsonb(i)||jsonb_build_object('customers',(select to_jsonb(x)from public.customers x where x.id=d.party),'invoice_line_items',(select jsonb_agg(to_jsonb(x))from public.invoice_line_items x where x.invoice_id=c.id),'payments','[]'::jsonb)from public.invoices i where i.id=c.id)end,
 'review',case when c.kind='change_order'then public.get_change_order_portal_review(encode(sha256(convert_to(c.raw_token,'UTF8')),'hex'))end,
 'principal',case when c.kind='invoice'then public.get_invoice_payment_principal(c.id)end)order by c.kind,c.scenario),'anonymousRowsDenied',true)as verification
from entry_cases c join entry_documents d using(kind,id);
reset role;
rollback;
