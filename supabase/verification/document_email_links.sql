-- Synthetic document-email admission checks. No provider calls; always roll back.
begin;
set local lock_timeout='3s';set local statement_timeout='50s';
create temp table docmail_assertions(label text);
create function pg_temp.docmail_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Document email assertion failed: %',label;end if;insert into docmail_assertions values(label);
end $$;
create function pg_temp.docmail_context(kind text,record_id uuid,party uuid,token_id uuid,organization boolean default false)returns jsonb language sql as $$
 select jsonb_build_object('kind',kind,'email_type',kind,'quote_ids',case when kind='quote'then jsonb_build_array(record_id)else '[]'::jsonb end,
 'invoice_id',case when kind='invoice'then record_id end,'change_order_id',case when kind='change_order'then record_id end,
 'customer_id',case when not organization then party end,'organization_id',case when organization then party end,
 'portal_tokens',jsonb_build_array(jsonb_build_object('kind',kind,'id',token_id)));
$$;
do $test$
declare actor uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();other_customer uuid:=gen_random_uuid();org uuid:=gen_random_uuid();contact uuid:=gen_random_uuid();other_contact uuid:=gen_random_uuid();
 q uuid:=gen_random_uuid();other_q uuid:=gen_random_uuid();i uuid:=gen_random_uuid();other_i uuid:=gen_random_uuid();co uuid:=gen_random_uuid();other_co uuid:=gen_random_uuid();oq uuid:=gen_random_uuid();oi uuid:=gen_random_uuid();oc uuid:=gen_random_uuid();
 qt uuid:=gen_random_uuid();it uuid:=gen_random_uuid();ct uuid:=gen_random_uuid();oqt uuid:=gen_random_uuid();oit uuid:=gen_random_uuid();oct uuid:=gen_random_uuid();
 kind text;record_id uuid;other_id uuid;token_id uuid;table_name text;ctx jsonb;changed jsonb;payload jsonb;receipt jsonb;baseline jsonb;v jsonb;batch_quotes jsonb:='[]';batch_tokens jsonb:='[]';n integer;routine regprocedure;
begin
 insert into auth.users(id,email,raw_user_meta_data)values(actor,'docmail-'||actor||'@example.invalid','{}');
 insert into public.customers(id,display_name,email)values(customer,'Synthetic document customer','docmail-'||customer||'@example.invalid'),(other_customer,'Other synthetic customer','docmail-'||other_customer||'@example.invalid');
 insert into public.organizations(id,name,billing_email)values(org,'Synthetic document organization','docmail-org@example.invalid');
 insert into public.organization_contacts(id,organization_id,full_name,email,is_active)values(contact,org,'Synthetic approver','docmail-approver@example.invalid',true),(other_contact,org,'Other synthetic approver','docmail-other@example.invalid',true);
 insert into public.quotes(id,customer_id,quote_number,status,subtotal_cents,total_cents)values(q,customer,'DOCMAIL-'||q,'sent',10000,10000),(other_q,customer,'DOCMAIL-'||other_q,'sent',10000,10000);
 insert into public.invoices(id,customer_id,invoice_number,status,subtotal_cents,total_cents)values(i,customer,'DOCMAIL-'||i,'sent',10000,10000),(other_i,customer,'DOCMAIL-'||other_i,'sent',10000,10000);
 insert into public.change_orders(id,source_quote_id,customer_id,created_by_user_id,change_order_number,title,status,subtotal_cents,total_cents)values(co,q,customer,actor,'DOCMAIL-'||co,'Synthetic document','ready_to_send',10000,10000),(other_co,other_q,customer,actor,'DOCMAIL-'||other_co,'Other document','ready_to_send',10000,10000);
 insert into public.quotes(id,organization_id,quote_number,status)values(oq,org,'DOCMAIL-'||oq,'sent');
 insert into public.invoices(id,organization_id,invoice_number,status)values(oi,org,'DOCMAIL-'||oi,'sent');
 insert into public.change_orders(id,source_quote_id,organization_id,approval_contact_id,created_by_user_id,change_order_number,title,status)values(oc,oq,org,contact,actor,'DOCMAIL-'||oc,'Organization document','ready_to_send');
 insert into public.quote_portal_tokens(id,quote_id,customer_id,token_hash,expires_at)values(qt,q,customer,encode(sha256(convert_to(qt::text,'UTF8')),'hex'),clock_timestamp()+interval '1 day');
 insert into public.invoice_portal_tokens(id,invoice_id,customer_id,token_hash,expires_at)values(it,i,customer,encode(sha256(convert_to(it::text,'UTF8')),'hex'),clock_timestamp()+interval '1 day');
 insert into public.change_order_portal_tokens(id,change_order_id,customer_id,token_hash,expires_at)values(ct,co,customer,encode(sha256(convert_to(ct::text,'UTF8')),'hex'),clock_timestamp()+interval '1 day');
 insert into public.quote_portal_tokens(id,quote_id,organization_id,token_hash)values(oqt,oq,org,encode(sha256(convert_to(oqt::text,'UTF8')),'hex'));
 insert into public.invoice_portal_tokens(id,invoice_id,organization_id,token_hash)values(oit,oi,org,encode(sha256(convert_to(oit::text,'UTF8')),'hex'));
 insert into public.change_order_portal_tokens(id,change_order_id,organization_id,intended_contact_id,token_hash)values(oct,oc,org,contact,encode(sha256(convert_to(oct::text,'UTF8')),'hex'));
 payload:=jsonb_build_object('from','ATS <test@example.invalid>','reply_to','test@example.invalid','to',jsonb_build_array('docmail-'||customer||'@example.invalid'),'cc','[]'::jsonb,'subject','Synthetic document','text','Synthetic document review');
 baseline:=jsonb_build_object('quotes',(select jsonb_agg(to_jsonb(x)order by id)from public.quotes x where id in(q,other_q,oq)),'invoices',(select jsonb_agg(to_jsonb(x)order by id)from public.invoices x where id in(i,other_i,oi)),'orders',(select jsonb_agg(to_jsonb(x)order by id)from public.change_orders x where id in(co,other_co,oc)));
 foreach kind in array array['quote','invoice','change_order']loop
  record_id:=case kind when 'quote'then q when 'invoice'then i else co end;other_id:=case kind when 'quote'then other_q when 'invoice'then other_i else other_co end;
  token_id:=case kind when 'quote'then qt when 'invoice'then it else ct end;table_name:=case kind when 'quote'then 'quote_portal_tokens'when 'invoice'then 'invoice_portal_tokens'else 'change_order_portal_tokens'end;
  ctx:=pg_temp.docmail_context(kind,record_id,customer,token_id);
  perform pg_temp.docmail_check(app_private.email_source_eligible(ctx,payload),'current active customer token admitted: '||kind);
  changed:=pg_temp.docmail_context(kind,other_id,customer,token_id);perform pg_temp.docmail_check(not app_private.email_source_eligible(changed,payload),'another document token denied even for same customer: '||kind);
  changed:=ctx||jsonb_build_object('customer_id',other_customer);perform pg_temp.docmail_check(not app_private.email_document_tokens_eligible(changed),'context customer cannot differ: '||kind);
  execute format('update public.%I set customer_id=$1 where id=$2',table_name)using other_customer,token_id;
  perform pg_temp.docmail_check(not app_private.email_source_eligible(ctx,payload),'earlier customer token denied: '||kind);
  execute format('update public.%I set customer_id=$1,revoked_at=clock_timestamp() where id=$2',table_name)using customer,token_id;
  perform pg_temp.docmail_check(not app_private.email_source_eligible(ctx,payload),'revoked token denied: '||kind);
  execute format('update public.%I set revoked_at=null,expires_at=clock_timestamp()+interval ''10 milliseconds'' where id=$1',table_name)using token_id;perform pg_sleep(0.03);
  perform pg_temp.docmail_check(not app_private.email_source_eligible(ctx,payload),'expiry is checked against wall clock after transaction begins: '||kind);
  execute format('update public.%I set expires_at=null where id=$1',table_name)using token_id;
  perform pg_temp.docmail_check(app_private.email_source_eligible(ctx,payload),'existing non-expiring token remains supported: '||kind);
  changed:=ctx||jsonb_build_object('portal_tokens',jsonb_build_array(jsonb_build_object('kind',kind,'id',gen_random_uuid())));
  perform pg_temp.docmail_check(not app_private.email_document_tokens_eligible(changed),'missing token denied: '||kind);
  record_id:=case kind when 'quote'then oq when 'invoice'then oi else oc end;token_id:=case kind when 'quote'then oqt when 'invoice'then oit else oct end;
  ctx:=pg_temp.docmail_context(kind,record_id,org,token_id,true);
  perform pg_temp.docmail_check(app_private.email_document_tokens_eligible(ctx),'organization party/contact supported: '||kind);
  if kind='change_order'then
   update public.change_order_portal_tokens set intended_contact_id=other_contact where id=oct;
   perform pg_temp.docmail_check(not app_private.email_document_tokens_eligible(ctx),'earlier change-order approver denied');update public.change_order_portal_tokens set intended_contact_id=contact where id=oct;
  end if;
 end loop;
 -- Preserve the existing combined-email selection size; the public envelope
 -- already bounds context bytes. Do not introduce a new 25-proposal send limit.
 for n in 1..26 loop
  record_id:=gen_random_uuid();token_id:=gen_random_uuid();insert into public.quotes(id,customer_id,quote_number,status)values(record_id,customer,'DOCMAIL-'||record_id,'sent');
  insert into public.quote_portal_tokens(id,quote_id,customer_id,token_hash)values(token_id,record_id,customer,encode(sha256(convert_to(token_id::text,'UTF8')),'hex'));
  batch_quotes:=batch_quotes||jsonb_build_array(record_id);batch_tokens:=batch_tokens||jsonb_build_array(jsonb_build_object('kind','quote','id',token_id));
 end loop;
 perform pg_temp.docmail_check(app_private.email_document_tokens_eligible(jsonb_build_object('kind','quote','email_type','quote','customer_id',customer,'organization_id',null,'quote_ids',batch_quotes,'portal_tokens',batch_tokens)),'26 separate proposal links retain existing combined-email capability');
 ctx:=pg_temp.docmail_context('quote',q,customer,qt);
 foreach kind in array array['quote_follow_up','invoice_payment_reminder','overdue_invoice_reminder']loop
  ctx:=case when kind='quote_follow_up'then pg_temp.docmail_context('quote',q,customer,qt)else pg_temp.docmail_context('invoice',i,customer,it)end;
  changed:=ctx||jsonb_build_object('email_type',kind,'portal_tokens','[]'::jsonb);
  perform pg_temp.docmail_check(not app_private.email_document_tokens_eligible(changed),'unbound older reminder held for review: '||kind);
  perform pg_temp.docmail_check(app_private.email_document_tokens_eligible(ctx||jsonb_build_object('email_type',kind)),'bound reminder admitted: '||kind);
  perform pg_temp.docmail_check(not app_private.email_document_tokens_eligible(ctx||jsonb_build_object('email_type',kind,'portal_tokens',jsonb_build_array(jsonb_build_object('kind','change_order','id',ct)))),'reminder cannot use another document family: '||kind);
 end loop;
 ctx:=pg_temp.docmail_context('quote',q,customer,qt);
 for v in select value from jsonb_array_elements('[null,{},"bad",[null],[{"kind":"quote","id":"bad"}],[{"kind":"unknown","id":"00000000-0000-4000-8000-000000000001"}]]'::jsonb)loop
  perform pg_temp.docmail_check(not app_private.email_document_tokens_eligible(ctx||jsonb_build_object('portal_tokens',v)),'malformed token metadata denied: '||v::text);
 end loop;
 perform pg_temp.docmail_check(not app_private.email_document_tokens_eligible(jsonb_set(ctx,'{quote_ids}',to_jsonb(q::text))),'scalar quote selection denied');
 perform pg_temp.docmail_check(app_private.email_document_tokens_eligible('{"kind":"other","email_type":"payment_confirmation"}'),'non-document messages retain existing behavior');
 for routine in select 'app_private.email_document_tokens_eligible(jsonb)'::regprocedure loop
  perform pg_temp.docmail_check(not has_function_privilege('anon',routine,'EXECUTE')and not has_function_privilege('authenticated',routine,'EXECUTE')and not has_function_privilege('service_role',routine,'EXECUTE'),'helper private; no additional client API grant');
 end loop;
 perform pg_temp.docmail_check(baseline=jsonb_build_object('quotes',(select jsonb_agg(to_jsonb(x)order by id)from public.quotes x where id in(q,other_q,oq)),'invoices',(select jsonb_agg(to_jsonb(x)order by id)from public.invoices x where id in(i,other_i,oi)),'orders',(select jsonb_agg(to_jsonb(x)order by id)from public.change_orders x where id in(co,other_co,oc))),'eligibility checks leave all source records and totals unchanged');
end $test$;
select count(*)as passed_assertions from docmail_assertions;
rollback;
