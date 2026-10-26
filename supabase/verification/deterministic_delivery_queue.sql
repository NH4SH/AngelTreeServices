-- Caller owns BEGIN/ROLLBACK. Synthetic fixtures only; no recovery/sender calls.
set local lock_timeout='3s';
set local statement_timeout='90s';
create temporary table queue_paging_assertions(label text);
create function pg_temp.queue_check(ok boolean,label text) returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'Queue paging assertion failed: %',label;end if;
 insert into pg_temp.queue_paging_assertions values(label);
end $$;
do $test$
declare
 owner_id uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();location uuid:=gen_random_uuid();
 fixture uuid:=gen_random_uuid();selected uuid;r jsonb;expected uuid[];seen uuid[];page_ids uuid[];
 include_all boolean;page_no integer;total integer;plan json;before_state jsonb;after_state jsonb;
begin
 perform pg_temp.queue_check(not (select automated_sending_enabled or appointment_change_notices_enabled from public.communication_settings where singleton),'Automatic sending and appointment notices remain OFF');
 insert into public.roles(name)values('owner')on conflict(name)do nothing;
 insert into auth.users(id,email)values(owner_id,'queue-owner-'||owner_id||'@example.invalid');
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(owner_id,'Synthetic queue operator',true,'active');
 insert into public.user_roles(user_id,role_id)select owner_id,id from public.roles where name='owner';
 insert into public.customers(id,display_name,email)values(customer,'Synthetic queue customer','queue@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state)values(location,customer,'1 Synthetic Lane','Fredericksburg','VA');
 -- All rows share a timestamp. IDs and insertion order intentionally disagree.
 insert into app_private.outbound_deliveries(id,business_key,provider_key,payload,payload_hash,context,source_snapshot,state,delivery_status,repair_state,followup_sync_pending,created_at)
 select gen_random_uuid(),'queue:'||fixture||':'||n,'queue:'||fixture||':'||n,
  '{"to":["queue@example.invalid"],"subject":"Synthetic tied queue request","html":"PRIVATE_QUEUE_BODY"}',repeat('a',64),
  jsonb_build_object('kind','invoice','email_type','invoice','invoice_id',fixture),'{}','prepared',
  case when n%11=0 then 'bounced'else 'pending'end,case when n%7=0 then 'complete'else 'pending'end,n%13=0,'2099-01-01T00:00:00Z'
 from generate_series(1,1301)n;
 -- Identity is explicitly supplied: rollback tests do not advance its sequence.
 -- Duplicate event_order values also occur with imports/restores and need a tie-breaker.
 insert into app_private.customer_source_events(id,source_key,source_audit_id,event,event_hash,event_order)overriding system value
 select gen_random_uuid(),'queue-source:'||fixture||':'||n,gen_random_uuid(),jsonb_build_object('title','Synthetic tied source event','destination_path','/admin/invoices/'||fixture,'body','PRIVATE_QUEUE_SOURCE'),repeat('b',64),-9000000000
 from generate_series(1,1201)n;
 insert into public.jobs(id,customer_id,service_location_id,website_submission_id,notification_status,submitted_at)
 select gen_random_uuid(),customer,location,'queue-preview:'||fixture||':'||n,'pending','2099-01-01T00:00:00Z'from generate_series(1,31)n;
 insert into public.email_events(id,recipient_email,subject,email_type,status,error_message,created_at)
 select gen_random_uuid(),'queue@example.invalid','Synthetic tied legacy receipt','invoice','failed','provider_outcome_unknown','2099-01-01T00:00:00Z'from generate_series(1,31)n;
 select jsonb_build_object('outbox',(select md5(string_agg(to_jsonb(x)::text,''order by id))from app_private.outbound_deliveries x),'sources',(select md5(string_agg(to_jsonb(x)::text,''order by id))from app_private.customer_source_events x),'history',(select md5(string_agg(to_jsonb(x)::text,''order by id))from public.email_events x),'jobs',(select md5(string_agg(to_jsonb(x)::text,''order by id))from public.jobs x),'queue',(select count(*)from public.customer_communications),'settings',(select to_jsonb(x)from public.communication_settings x where singleton),'payments',(select count(*)from public.payments),'audit',(select count(*)from public.activity_log))into before_state;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 foreach include_all in array array[false,true]loop
  select array_agg(id order by created_at desc,id desc)into expected from app_private.outbound_deliveries
   where include_all or repair_state<>'complete' or followup_sync_pending or delivery_status in('bounced','complained','failed','suppressed');
  total:=cardinality(expected);seen:='{}';
  perform pg_temp.queue_check(total>1000,'Both native delivery views exceed 1000 matching rows');
  for page_no in 1..ceil(total/50.0)::integer loop
   perform set_config('role','authenticated',true);r:=public.list_outbound_deliveries(include_all,null,page_no);perform set_config('role','none',true);
   select coalesce(array_agg((x->>'id')::uuid order by n),'{}')into page_ids from jsonb_array_elements(r->'deliveries')with ordinality v(x,n);
   perform pg_temp.queue_check((r->>'total')::integer=total and page_ids=expected[(page_no-1)*50+1:least(page_no*50,total)],'Exact tied delivery page and count: '||include_all||':'||page_no);
   seen:=seen||page_ids;
  end loop;
  perform pg_temp.queue_check(seen=expected and cardinality(seen)=(select count(distinct x)from unnest(seen)x),'Complete ordered delivery traversal has no duplicate or missing IDs');
  perform set_config('enable_indexscan','off',true);perform set_config('enable_indexonlyscan','off',true);perform set_config('enable_bitmapscan','off',true);
  perform set_config('role','authenticated',true);r:=public.list_outbound_deliveries(include_all,null,2);perform set_config('role','none',true);
  select array_agg((x->>'id')::uuid order by n)into page_ids from jsonb_array_elements(r->'deliveries')with ordinality v(x,n);
  perform pg_temp.queue_check(page_ids=expected[51:100],'Delivery order survives alternate sequential-scan plan');
  perform set_config('enable_indexscan','on',true);perform set_config('enable_indexonlyscan','on',true);perform set_config('enable_bitmapscan','on',true);
 end loop;
 select id into selected from app_private.outbound_deliveries where business_key like 'queue:'||fixture||':%'order by id limit 1;
 perform set_config('role','authenticated',true);r:=public.list_outbound_deliveries(false,selected,8);perform set_config('role','none',true);
 perform pg_temp.queue_check(r->>'total'='1'and r->'deliveries'='[]'::jsonb,'Native selection/count and numbered offset contract unchanged');
 perform set_config('role','authenticated',true);r:=public.list_outbound_deliveries(false,selected,1);perform set_config('role','none',true);
 perform pg_temp.queue_check(r->>'total'='1'and r#>>'{deliveries,0,id}'=selected::text,'Selected request remains exact and unique');
 perform pg_temp.queue_check(r::text not like '%PRIVATE_QUEUE%','Private request/source bodies are never projected');
 select array_agg(id order by submitted_at desc,id desc)into expected from(select j.id,j.submitted_at from public.jobs j left join app_private.website_lead_submissions s on s.job_id=j.id where j.website_submission_id is not null and j.notification_status in('pending','failed')and coalesce(cardinality(s.notice_delivery_ids),0)=0 and j.lead_disposition='active'order by j.submitted_at desc,j.id desc limit 20)x;
 select array_agg((x->>'id')::uuid order by n)into page_ids from jsonb_array_elements(r->'pending_office_notices')with ordinality v(x,n);
 perform pg_temp.queue_check(page_ids=expected and cardinality(page_ids)=20,'Office preview uses deterministic timestamp/UUID membership and JSON order');
 select array_agg(id order by created_at desc,id desc)into expected from(select id,created_at from public.email_events where outbound_delivery_id is null and status='failed'and error_message='provider_outcome_unknown'order by created_at desc,id desc limit 20)x;
 select array_agg((x->>'id')::uuid order by n)into page_ids from jsonb_array_elements(r->'legacy_attempts')with ordinality v(x,n);
 perform pg_temp.queue_check(page_ids=expected and cardinality(page_ids)=20,'Legacy preview uses deterministic timestamp/UUID membership and JSON order');
 select array_agg(id order by event_order,id)into expected from app_private.customer_source_events where prepared_activity_id is null;
 total:=cardinality(expected);seen:='{}';
 for page_no in 1..ceil(total/20.0)::integer loop
  perform set_config('role','authenticated',true);r:=public.list_pending_customer_source_events(page_no);perform set_config('role','none',true);
  select coalesce(array_agg((x->>'id')::uuid order by n),'{}')into page_ids from jsonb_array_elements(r->'events')with ordinality v(x,n);
  perform pg_temp.queue_check((r->>'total')::integer=total and page_ids=expected[(page_no-1)*20+1:least(page_no*20,total)],'Exact tied source page/count: '||page_no);
  seen:=seen||page_ids;
 end loop;
 perform pg_temp.queue_check(seen=expected and cardinality(seen)=(select count(distinct x)from unnest(seen)x),'Complete source traversal has no duplicate or missing IDs');
 -- Check that ordered index paths exist without changing hosted statistics.
 -- Tiny rollback fixtures have deliberately stale estimates; this is not a benchmark.
 perform set_config('enable_seqscan','off',true);
 perform set_config('enable_bitmapscan','off',true);
 perform set_config('enable_incremental_sort','off',true);
 perform set_config('enable_sort','off',true);
 execute 'explain(format json)select id from app_private.outbound_deliveries order by created_at desc,id desc limit 50 offset 1000'into plan;
 perform pg_temp.queue_check(plan::text like '%outbound_deliveries_queue_order%'and plan::text not like '%"Node Type": "Sort"%','Recent delivery ordering has a matching index path');
 execute 'explain(format json)select id from app_private.outbound_deliveries where repair_state<>''complete''or followup_sync_pending or delivery_status in(''bounced'',''complained'',''failed'',''suppressed'')order by created_at desc,id desc limit 50 offset 1000'into plan;
 perform pg_temp.queue_check(plan::text like '%outbound_deliveries_attention_order%'and plan::text not like '%"Node Type": "Sort"%','Needs review ordering has a matching partial index path');
 execute 'explain(format json)select id from app_private.customer_source_events where prepared_activity_id is null order by event_order,id limit 20 offset 1000'into plan;
 perform pg_temp.queue_check(plan::text like '%customer_source_events_pending_order%'and plan::text not like '%"Node Type": "Sort"%','Source queue ordering has a matching partial index path');
 perform set_config('enable_seqscan','on',true);
 perform set_config('enable_bitmapscan','on',true);
 perform set_config('enable_incremental_sort','on',true);
 perform set_config('enable_sort','on',true);
 select jsonb_build_object('outbox',(select md5(string_agg(to_jsonb(x)::text,''order by id))from app_private.outbound_deliveries x),'sources',(select md5(string_agg(to_jsonb(x)::text,''order by id))from app_private.customer_source_events x),'history',(select md5(string_agg(to_jsonb(x)::text,''order by id))from public.email_events x),'jobs',(select md5(string_agg(to_jsonb(x)::text,''order by id))from public.jobs x),'queue',(select count(*)from public.customer_communications),'settings',(select to_jsonb(x)from public.communication_settings x where singleton),'payments',(select count(*)from public.payments),'audit',(select count(*)from public.activity_log))into after_state;
 perform pg_temp.queue_check(before_state=after_state,'All queue, delivery, source, history, job, finance, audit and settings rows unchanged by reads');
end $test$;
select jsonb_build_object('assertions',(select jsonb_agg(label order by ctid)from queue_paging_assertions),'providerRequests',0,'customerEmailsSent',0,'syntheticOnly',true,'callerMustRollback',true)as verification;
