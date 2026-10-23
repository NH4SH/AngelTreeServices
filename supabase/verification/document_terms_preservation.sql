-- Synthetic rollback acceptance. The runner can insert the original candidate
-- body at the marker to prove pre-existing 117 records survive the 118 upgrade.
begin;
set local lock_timeout='3s';set local statement_timeout='45s';
create temporary table terms_assertions(label text);
create temporary table terms_preimages(family text,id uuid,original jsonb);
create function pg_temp.terms_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Document terms assertion failed: %',label;end if;
 insert into pg_temp.terms_assertions values(label);
end $$;
do $seed$
declare actor uuid:=gen_random_uuid();crew uuid:=gen_random_uuid();party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();v uuid;s text;lease jsonb;
begin
 insert into public.roles(name)values('owner'),('crew')on conflict(name)do nothing;
 insert into auth.users(id,email,raw_user_meta_data)select x,'terms-'||x||'@example.invalid','{}'from unnest(array[actor,crew])x;
 update public.profiles set status='active'where id=any(array[actor,crew]);
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)select x,'Synthetic terms operator',true,'active'from unnest(array[actor,crew])x;
 insert into public.user_roles(user_id,role_id)select actor,id from public.roles where name='owner';
 insert into public.user_roles(user_id,role_id)select crew,id from public.roles where name='crew';
 insert into public.customers(id,display_name,email)values(party,'Synthetic preserved terms customer','terms-'||party||'@example.invalid');
 insert into public.service_locations(id,customer_id,label,street,city,state,postal_code)values(site,party,'Synthetic terms site','1 Test Lane','Fredericksburg','VA','22401');
 perform set_config('ats_test.terms_owner',actor::text,true);perform set_config('ats_test.terms_crew',crew::text,true);perform set_config('ats_test.terms_party',party::text,true);perform set_config('ats_test.terms_site',site::text,true);
 foreach s in array array['draft','sent','approved','cancelled']loop
  v:=gen_random_uuid();insert into public.quotes(id,customer_id,service_location_id,quote_number,status,subtotal_cents,total_cents,expires_at,payment_terms,debris_handling_notes)
   values(v,party,site,'TERMS-'||v,s,10000,10000,'2026-11-22T17:00:00Z','50% deposit; retain saved wording','Leave chipped material on site');
  insert into terms_preimages select 'quote',v,to_jsonb(q)-'document_terms_version'from public.quotes q where id=v;
 end loop;
 foreach s in array array['draft','sent','paid','void']loop
  v:=gen_random_uuid();insert into public.invoices(id,customer_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents,due_at,payment_terms)
   values(v,party,'TERMS-'||v,case when s='void'then 'draft'else s end,10000,10000,case when s='paid'then 0 else 10000 end,'2026-11-22T17:00:00Z','Net 30');
  if s='void'then
   perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);perform set_config('role','authenticated',true);
   lease:=public.begin_invoice_void(v);perform public.finalize_invoice_void(v,(lease->>'token')::uuid);perform set_config('role','none',true);
   perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
  end if;
  insert into terms_preimages select 'invoice',v,to_jsonb(i)-'document_terms_version'from public.invoices i where id=v;
 end loop;
end $seed$;

-- APPLY_DOCUMENT_TERMS_CANDIDATE_HERE

do $test$
declare r record;v text;tbl text;id uuid;before_state jsonb;q uuid;i uuid;actor uuid:=current_setting('ats_test.terms_owner')::uuid;party uuid:=current_setting('ats_test.terms_party')::uuid;
 request uuid;header jsonb;lines jsonb:='[{"name":"Synthetic preserved work","description":"Synthetic retained scope","quantity":1,"unit_price_cents":10000,"total_cents":10000}]';a jsonb;b jsonb;
begin
 for r in select *from terms_preimages loop
  tbl:=case when r.family='quote'then 'quotes'else 'invoices'end;
  execute format('select to_jsonb(x) from public.%I x where id=$1',tbl)into before_state using r.id;
  perform pg_temp.terms_check(before_state->>'document_terms_version'='legacy-2026-10-22'and before_state-'document_terms_version'=r.original,
   r.family||' '||(r.original->>'status')||' retains all original values, timestamps and revision');
 end loop;
 foreach tbl in array array['quotes','invoices']loop
  foreach v in array array['unsupported-future','',null]loop
   begin
    execute format('insert into public.%I(customer_id,status,document_terms_version)values($1,''draft'',$2)',tbl)using party,v;
    raise exception using errcode='ZX001';
   exception when check_violation or not_null_violation then null;end;
   perform pg_temp.terms_check(true,tbl||' rejects invalid version on insertion: '||coalesce(v,'NULL'));
   select p.id into id from terms_preimages p where p.family=case when tbl='quotes'then 'quote'else 'invoice'end limit 1;
   execute format('select to_jsonb(x)from public.%I x where x.id=$1',tbl)into before_state using id;
   begin execute format('update public.%I set document_terms_version=$1 where public.%I.id=$2',tbl,tbl)using v,id;raise exception using errcode='ZX001';exception when check_violation then null;end;
   execute format('select to_jsonb(x)from public.%I x where x.id=$1',tbl)into a using id;
   perform pg_temp.terms_check(a=before_state,tbl||' cannot relabel an existing document: '||coalesce(v,'NULL'));
  end loop;
 end loop;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);perform set_config('role','authenticated',true);
 header:=jsonb_build_object('customer_id',party,'service_location_id',current_setting('ats_test.terms_site'),'document_terms_version','forged-future');request:=gen_random_uuid();
 a:=public.create_quote_draft_request(request,header,lines);b:=public.create_quote_draft_request(request,header,lines);q:=(a->>'id')::uuid;
 perform set_config('role','none',true);
 perform pg_temp.terms_check(q=(b->>'id')::uuid and b->>'replayed'='true'and(select document_terms_version='legacy-2026-10-22'from public.quotes where quotes.id=q),'quote creation ignores forged version and retry retains original draft');
 perform set_config('role','authenticated',true);perform public.save_quote_details(q,(select edit_revision from public.quotes where quotes.id=q),jsonb_build_object('customer_message','Synthetic revised scope','document_terms_version','forged-future'),lines,false);perform set_config('role','none',true);
 perform pg_temp.terms_check((select document_terms_version='legacy-2026-10-22'and customer_message='Synthetic revised scope'from public.quotes where quotes.id=q),'normal quote editing preserves the binding while retaining editable scope');
 request:=gen_random_uuid();perform set_config('role','authenticated',true);a:=public.create_standalone_invoice(request,header,lines,'',null);b:=public.create_standalone_invoice(request,header,lines,'',null);i:=(a->>'invoice_id')::uuid;perform set_config('role','none',true);
 perform pg_temp.terms_check(i=(b->>'invoice_id')::uuid and b->>'replayed'='true'and(select document_terms_version='legacy-2026-10-22'from public.invoices where invoices.id=i),'invoice creation ignores forged version and retry retains original draft');
 perform set_config('role','authenticated',true);perform public.save_invoice_details(i,(select updated_at from public.invoices where invoices.id=i),'2026-11-22T17:00:00Z',lines);perform set_config('role','none',true);
 perform pg_temp.terms_check((select document_terms_version='legacy-2026-10-22'and total_cents=10000 and balance_due_cents=10000 from public.invoices where invoices.id=i),'normal invoice editing preserves binding and financial totals');
 foreach tbl in array array['quotes','invoices']loop
  perform pg_temp.terms_check(not has_column_privilege('authenticated','public.'||tbl,'document_terms_version','UPDATE'),tbl||' version has no new authenticated update grant');
 end loop;
 foreach v in array array['anon','authenticated','service_role']loop
  perform pg_temp.terms_check(not has_function_privilege(v,'app_private.preserve_document_terms_version()','EXECUTE'),v||' cannot directly execute the private trigger');
 end loop;
 perform pg_temp.terms_check((select not prosecdef and proconfig=array['search_path=""']from pg_proc where oid='app_private.preserve_document_terms_version()'::regprocedure),'private trigger remains invoker with empty search path');
 perform set_config('ats_test.render_quote',q::text,true);perform set_config('ats_test.render_invoice',i::text,true);
end $test$;
select jsonb_build_object('syntheticOnly',true,'rolledBack',true,'assertions',(select jsonb_agg(label order by label)from terms_assertions),
 'renderFixtures',jsonb_build_object('quote',(select to_jsonb(q)||jsonb_build_object('customers',(select to_jsonb(c)from public.customers c where c.id=q.customer_id),'service_locations',(select to_jsonb(l)from public.service_locations l where l.id=q.service_location_id),'quote_line_items',(select jsonb_agg(to_jsonb(x)order by sort_order)from public.quote_line_items x where x.quote_id=q.id))from public.quotes q where q.id=current_setting('ats_test.render_quote')::uuid),
 'invoice',(select to_jsonb(i)||jsonb_build_object('customers',(select to_jsonb(c)from public.customers c where c.id=i.customer_id),'invoice_line_items',(select jsonb_agg(to_jsonb(x)order by sort_order)from public.invoice_line_items x where x.invoice_id=i.id))from public.invoices i where i.id=current_setting('ats_test.render_invoice')::uuid)))verification;
rollback;
