-- Candidate installed inside caller-owned BEGIN/ROLLBACK. Synthetic only; no I/O.
set local lock_timeout='3s';set local statement_timeout='45s';
create temporary table delivery_visibility_checks(label text);
create function pg_temp.delivery_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Delivery visibility failed: %',label;end if;
 insert into pg_temp.delivery_visibility_checks values(label);
end$$;
do $test$
declare actor uuid;creator uuid:=gen_random_uuid();party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();job uuid:=gen_random_uuid();q uuid:=gen_random_uuid();q2 uuid:=gen_random_uuid();inv uuid:=gen_random_uuid();co uuid:=gen_random_uuid();empty_inv uuid:=gen_random_uuid();edge_inv uuid:=gen_random_uuid();plan jsonb;target uuid;kind text;role_name text;r jsonb;r2 jsonb;expected bigint;seen uuid[];actual uuid[];pg integer;denied boolean;before_state jsonb;after_state jsonb;config_before jsonb;
begin
 select to_jsonb(x) into config_before from public.communication_settings x where singleton;
 perform pg_temp.delivery_check((config_before->>'automated_sending_enabled')::boolean=false and(config_before->>'appointment_change_notices_enabled')::boolean=false,'Sending switches OFF');
 perform pg_temp.delivery_check(not has_table_privilege('authenticated','app_private.outbound_deliveries','SELECT'),'No frozen table grant');
 perform pg_temp.delivery_check(not has_function_privilege('anon','public.list_record_delivery_requests(text,uuid,integer)','EXECUTE'),'Anon cannot execute reader');
 perform pg_temp.delivery_check(not has_function_privilege('service_role','public.list_record_delivery_requests(text,uuid,integer)','EXECUTE'),'No server-key read fallback');
 perform pg_temp.delivery_check(not(select prosecdef from pg_proc where oid='public.list_record_delivery_requests(text,uuid,integer)'::regprocedure),'Public reader is invoker');
 perform pg_temp.delivery_check((select prosecdef and provolatile='s'and proconfig=array['search_path=""'] from pg_proc where oid='app_private.read_record_delivery_requests(text,uuid,integer)'::regprocedure),'Private reader is stable with empty search path');
 insert into public.roles(name)values('owner'),('admin'),('estimator'),('payroll_admin'),('crew'),('customer'),('property_manager')on conflict(name)do nothing;
 insert into auth.users(id,email)values(creator,'delivery-test-'||creator||'@example.invalid');
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(creator,'Synthetic delivery operator',true,'active');
 insert into public.user_roles(user_id,role_id)select creator,id from public.roles where name='owner';
 insert into public.customers(id,display_name,email)values(party,'Synthetic delivery customer','delivery@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state)values(site,party,'1 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,customer_id,service_location_id,status)values(job,party,site,'scheduled');
 insert into public.quotes(id,customer_id,service_location_id,quote_number,status)values(q,party,site,'SYNTHETIC-DELIVERY-'||q,'sent'),(q2,party,site,'SYNTHETIC-DELIVERY-'||q2,'sent');
 insert into public.invoices(id,customer_id,service_location_id,invoice_number,status)values(inv,party,site,'SYNTHETIC-DELIVERY-'||inv,'sent'),(empty_inv,party,site,'SYNTHETIC-EMPTY-'||empty_inv,'draft'),(edge_inv,party,site,'SYNTHETIC-EDGE-'||edge_inv,'sent');
 insert into public.change_orders(id,change_order_number,source_quote_id,job_id,customer_id,service_location_id,created_by_user_id,title,status)values(co,'SYNTHETIC-DELIVERY-'||co,q,job,party,site,creator,'Synthetic work','sent');
 for kind,target in select * from(values('quote',q),('invoice',inv),('change_order',co))v loop
  insert into app_private.outbound_deliveries(business_key,provider_key,payload,payload_hash,context,source_snapshot,state,delivery_status,repair_state,attempt_count,created_at)
  select 'visibility:'||kind||':'||n||':'||target,'visibility:'||kind||':'||n||':'||target,
   jsonb_build_object('to',jsonb_build_array('delivery@example.invalid'),'subject','Synthetic request '||n,'html','PRIVATE_BODY_WITH_PORTAL_TOKEN'),repeat('a',64),
   case kind when 'quote' then jsonb_build_object('quote_ids',jsonb_build_array(q2::text,target::text))when 'invoice' then jsonb_build_object('invoice_id',target::text)else jsonb_build_object('change_order_id',target::text)end||jsonb_build_object('portal_tokens','PRIVATE_CONTEXT_TOKEN'),
   '{"private":"PRIVATE_SOURCE_SNAPSHOT"}',(array['prepared','dispatching','unknown','accepted','rejected','not_attempted','cancelled'])[1+n%7],
   case when n%7=3 then 'delivered'else 'pending'end,case when n%7=3 then 'complete'when n%7=6 then 'acknowledged'else 'pending'end,case when n%7=0 then 0 else 1 end,
   '2026-10-25T12:00:00Z'::timestamptz+(n/2)*interval'1 microsecond' from generate_series(1,2107)n;
 end loop;
 -- Accepted-but-unsynchronized is still unresolved even with a successful report.
 insert into app_private.outbound_deliveries(business_key,provider_key,payload,payload_hash,context,source_snapshot,state,delivery_status,repair_state,followup_sync_pending)
 values('visibility:followup:'||inv,'visibility:followup:'||inv,'{"to":["delivery@example.invalid"],"subject":"Synthetic followup pending","html":"PRIVATE_BODY"}',repeat('b',64),jsonb_build_object('invoice_id',inv),'{}','accepted','delivered','complete',true);

 insert into app_private.outbound_deliveries(business_key,provider_key,payload,payload_hash,context,source_snapshot,state,delivery_status,repair_state,followup_sync_pending)
 select 'edge:'||edge_inv||':'||label,'edge:'||edge_inv||':'||label,jsonb_build_object('to',jsonb_build_array('delivery@example.invalid'),'subject',label),repeat('c',64),jsonb_build_object('invoice_id',edge_inv),'{}',state,delivery_status,repair_state,pending
 from(values('prepared','prepared','pending','complete',false),('uncertain-reviewed','unknown','pending','acknowledged',false),('in-flight-reviewed','dispatching','pending','acknowledged',false),('healthy-done','accepted','delivered','complete',false),('bounce','accepted','bounced','complete',false),('delayed','accepted','delayed','complete',false),('reviewed-rejection','rejected','pending','acknowledged',false),('reviewed-cancellation','cancelled','pending','acknowledged',false),('source-changed','cancelled','pending','source_changed',false),('followup-pending','accepted','delivered','complete',true),('not-attempted','not_attempted','pending','complete',false),('repair-pending','accepted','accepted','pending',false))v(label,state,delivery_status,repair_state,pending);
 select jsonb_build_object('outbox',(select md5(string_agg(to_jsonb(x)::text,''order by id))from app_private.outbound_deliveries x),'history',(select md5(coalesce(string_agg(to_jsonb(x)::text,''order by id),''))from public.email_events x),'queue',(select md5(coalesce(string_agg(to_jsonb(x)::text,''order by id),''))from public.customer_communications x),'finance',(select md5(coalesce(string_agg(to_jsonb(x)::text,''order by id),''))from public.invoices x),'payments',(select count(*)from public.payments),'audit',(select count(*)from public.activity_log))into before_state;
 perform set_config('request.jwt.claim.sub',creator::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',creator,'role','authenticated')::text,true);
 perform set_config('role','authenticated',true);r:=public.list_record_delivery_requests('invoice',edge_inv);perform set_config('role','none',true);
 perform pg_temp.delivery_check((r->>'total')::integer=9,'Nine explicitly unresolved edge cases; completed and acknowledged terminal cases excluded');
 perform pg_temp.delivery_check((select array_agg(x->>'subject'order by x->>'subject')from jsonb_array_elements(r->'deliveries')x)=array['bounce','delayed','followup-pending','in-flight-reviewed','not-attempted','prepared','repair-pending','source-changed','uncertain-reviewed'],'State semantics checked against independent named outcomes');
 perform set_config('enable_seqscan','off',true);
 execute 'explain(format json) select id from app_private.outbound_deliveries where context @> $1' into plan using jsonb_build_object('invoice_id',inv::text);
 perform pg_temp.delivery_check(plan::text like '%outbound_deliveries_record_context%','Record containment uses native GIN index');perform set_config('enable_seqscan','on',true);
 for kind,target in select * from(values('quote',q),('invoice',inv),('change_order',co))v loop
  select array_agg(id order by created_at desc,id asc) into actual from app_private.outbound_deliveries where context @>case kind when 'quote'then jsonb_build_object('quote_ids',jsonb_build_array(target::text))when'invoice'then jsonb_build_object('invoice_id',target::text)else jsonb_build_object('change_order_id',target::text)end and(state in('prepared','dispatching','unknown')or followup_sync_pending or(repair_state<>'acknowledged'and(repair_state<>'complete'or state in('rejected','not_attempted')or delivery_status in('delayed','failed','bounced','complained','suppressed'))));
  expected:=cardinality(actual);seen:='{}';perform pg_temp.delivery_check(expected>1000,kind||': beyond default API cap');
  perform set_config('role','authenticated',true);
  for pg in 1..ceil(expected::numeric/30)::integer loop
   r:=public.list_record_delivery_requests(kind,target,pg);
   if(r->>'total')::bigint<>expected or(r->>'page')::integer<>pg then raise exception 'Incorrect count/page';end if;
   select seen||array_agg((x->>'id')::uuid order by ord)into seen from jsonb_array_elements(r->'deliveries')with ordinality v(x,ord);
   if r::text ~ 'PRIVATE_|"payload"|"context"|"source_snapshot"|"problem_code"|"provider_key"|"business_key"'then raise exception 'Private data escaped';end if;
  end loop;
  r:=public.list_record_delivery_requests(kind,target,71582788);
  perform set_config('role','none',true);
  perform pg_temp.delivery_check(seen=actual,kind||': complete native order, ties and no repeated or missing rows');
  perform pg_temp.delivery_check((r->>'page')::integer=ceil(expected::numeric/30)::integer,kind||': exhausted page clamped in same snapshot');
  perform pg_temp.delivery_check(not exists(select 1 from jsonb_array_elements(r->'deliveries')x where x?'payload'),kind||': narrow metadata only');
 end loop;
 perform set_config('role','authenticated',true);r:=public.list_record_delivery_requests('quote',q2);r2:=public.list_record_delivery_requests('quote',q);perform set_config('role','none',true);
 perform pg_temp.delivery_check(r->'deliveries'=r2->'deliveries'and r->'total'=r2->'total','Every proposal in multi-quote request is matched');
 foreach role_name in array array['owner','admin','estimator','payroll_admin','crew','customer','property_manager','none','disabled','separated','removed']loop
  actor:=gen_random_uuid();insert into auth.users(id,email,raw_user_meta_data)values(actor,'delivery-reader-'||actor||'@example.invalid','{"role":"owner"}');
  update public.profiles set status=case when role_name='disabled'then'disabled'else'active'end where id=actor;
  insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(actor,'Synthetic reader',true,'active');
  if role_name='separated'then update public.employee_records set is_active=false,employment_status='separated'where auth_user_id=actor;end if;
  if role_name not in('none','removed')then insert into public.user_roles(user_id,role_id)select actor,id from public.roles where name=case when role_name in('disabled','separated')then'owner'else role_name end;end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','user_metadata','{"role":"owner"}'::jsonb)::text,true);
  for kind,target in select * from(values('quote',q),('invoice',inv),('change_order',co))v loop
   denied:=false;perform set_config('role','authenticated',true);begin r:=public.list_record_delivery_requests(kind,target);exception when insufficient_privilege then denied:=true;end;perform set_config('role','none',true);
   perform pg_temp.delivery_check(denied=(role_name not in('owner','admin','estimator','payroll_admin')),kind||': stored effective access '||role_name);
   denied:=false;perform set_config('role','authenticated',true);begin r:=app_private.read_record_delivery_requests(kind,target,1);exception when insufficient_privilege then denied:=true;end;perform set_config('role','none',true);
   perform pg_temp.delivery_check(denied=(role_name not in('owner','admin','estimator','payroll_admin')),kind||': private helper independently checks stored effective access '||role_name);
  end loop;
 end loop;
 perform set_config('request.jwt.claim.sub',creator::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',creator,'role','authenticated')::text,true);
 perform set_config('role','authenticated',true);r:=public.list_record_delivery_requests('invoice',empty_inv,100);perform set_config('role','none',true);
 perform pg_temp.delivery_check(r->'deliveries'='[]'::jsonb and r->>'total'='0'and r->>'page'='1','Genuine empty is scoped and recovers to first page');
 -- Even active staff cannot use the exposed reader around source RLS.
 execute 'create policy visibility_source_denial on public.invoices as restrictive for select to authenticated using(false)';
 denied:=false;perform set_config('role','authenticated',true);begin r:=public.list_record_delivery_requests('invoice',inv);exception when insufficient_privilege then denied:=true;end;perform set_config('role','none',true);
 perform pg_temp.delivery_check(denied,'Caller RLS enforced before private reader');execute 'drop policy visibility_source_denial on public.invoices';
 foreach kind in array array['','toString','job']loop
  denied:=false;perform set_config('role','authenticated',true);begin r:=public.list_record_delivery_requests(kind,inv);exception when invalid_parameter_value then denied:=true;end;perform set_config('role','none',true);perform pg_temp.delivery_check(denied,'Invalid scope denied: '||kind);
 end loop;
 for pg in select * from unnest(array[0,-1,71582789,null]::integer[])loop
  denied:=false;perform set_config('role','authenticated',true);begin r:=public.list_record_delivery_requests('invoice',inv,pg);exception when invalid_parameter_value then denied:=true;end;perform set_config('role','none',true);perform pg_temp.delivery_check(denied,'Invalid page denied: '||coalesce(pg::text,'null'));
 end loop;
 denied:=false;perform set_config('role','authenticated',true);begin r:=public.list_record_delivery_requests('invoice',gen_random_uuid());exception when insufficient_privilege then denied:=true;end;perform set_config('role','none',true);perform pg_temp.delivery_check(denied,'Missing source never becomes global');
 select jsonb_build_object('outbox',(select md5(string_agg(to_jsonb(x)::text,''order by id))from app_private.outbound_deliveries x),'history',(select md5(coalesce(string_agg(to_jsonb(x)::text,''order by id),''))from public.email_events x),'queue',(select md5(coalesce(string_agg(to_jsonb(x)::text,''order by id),''))from public.customer_communications x),'finance',(select md5(coalesce(string_agg(to_jsonb(x)::text,''order by id),''))from public.invoices x),'payments',(select count(*)from public.payments),'audit',(select count(*)from public.activity_log))into after_state;
 perform pg_temp.delivery_check(before_state=after_state,'Browsing does not write outbox, history, queue, finances or audit');
 perform pg_temp.delivery_check(config_before=(select to_jsonb(x)from public.communication_settings x where singleton),'Settings unchanged');
end$test$;
select jsonb_build_object('assertions',(select jsonb_agg(label order by label)from pg_temp.delivery_visibility_checks),'sendingSwitchesStayedOff',true)verification;
