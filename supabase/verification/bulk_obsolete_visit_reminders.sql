-- Candidate command verification, always inside a rollback-only transaction.
begin;
set local lock_timeout='3s';set local statement_timeout='60s';
create temporary table bulk_assertions(label text);
create temporary table bulk_sources(kind text,id uuid,starts_at timestamptz);
create temporary table bulk_fixtures(input jsonb);
create function pg_temp.bulk_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Bulk cleanup assertion failed: %',label;end if;
 insert into pg_temp.bulk_assertions values(label);end $$;
do $test$
<<test_block>>
declare party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();job uuid:=gen_random_uuid();v uuid;kind text;t text;col text;stage text;n integer;
 starts timestamptz:=date_trunc('hour',clock_timestamp())+interval '7 days';batch jsonb;all_sources jsonb;history jsonb;preserved jsonb;facts jsonb;result jsonb;bad jsonb;denied boolean;failed boolean;row_id uuid;settings jsonb;tables jsonb;
begin
 perform pg_temp.bulk_check((select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton),'sending and appointment notices start OFF');
 perform pg_temp.bulk_check((select not prosecdef and proconfig@>array['search_path=""','lock_timeout=2s'] from pg_proc where oid='public.cancel_obsolete_visit_reminders(text,jsonb)'::regprocedure),'command is invoker with empty search path and bounded lock wait');
 perform pg_temp.bulk_check(not has_function_privilege('anon','public.cancel_obsolete_visit_reminders(text,jsonb)','EXECUTE')and not has_function_privilege('authenticated','public.cancel_obsolete_visit_reminders(text,jsonb)','EXECUTE')and has_function_privilege('service_role','public.cancel_obsolete_visit_reminders(text,jsonb)','EXECUTE'),'only the existing server role has execute permission');
 insert into public.customers(id,display_name,email)values(party,'Synthetic bulk reminders','bulk-'||party||'@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state)values(site,party,'123 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,customer_id,service_location_id,status,service_type,requested_scope)values(job,party,site,'new_lead','other','Synthetic bulk reminder cleanup');
 select to_jsonb(s)||jsonb_build_object('automated_sending_enabled',true,'appointment_change_notices_enabled',false,'quote_follow_up_enabled',false,'invoice_reminder_enabled',false,'payment_confirmation_enabled',false,'estimate_confirmation_enabled',true,'estimate_reminder_enabled',true,'updated_at','2000-01-01T00:00:00.000Z')into settings from public.communication_settings s where singleton;
 foreach kind in array array['schedule_event','appointment']loop
  t:=case kind when 'schedule_event'then 'schedule_events'else 'appointments'end;col:=case kind when 'schedule_event'then 'schedule_event_id'else 'appointment_id'end;
  for n in 1..201 loop
   v:=gen_random_uuid();insert into bulk_sources values(kind,v,starts+make_interval(hours=>n%24));
   if kind='schedule_event'then
    insert into public.schedule_events(id,job_id,service_location_id,title,event_type,status,starts_at,ends_at)values(v,job,site,'Synthetic bulk visit','estimate','scheduled',starts+make_interval(hours=>n%24),starts+make_interval(hours=>n%24+1));
   else
    insert into public.appointments(id,job_id,service_location_id,appointment_type,status,starts_at,ends_at)values(v,job,site,'estimate','scheduled',starts+make_interval(hours=>n%24),starts+make_interval(hours=>n%24+1));
   end if;
   foreach stage in array array['obsolete','legacy','current','sent','processing','failed','cancelled']loop
    execute format('insert into public.customer_communications(communication_type,reminder_stage,customer_id,job_id,%I,recipient_source,recipient_email,scheduled_for,source_version,status,is_automatic,idempotency_key)values(''estimate_reminder'',$1,$2,$3,$4,''customer'',$5,$6,$7,$8,true,$9)',col)
    using stage,party,job,v,'bulk-'||party||'@example.invalid',starts,
     case stage when 'legacy'then null when 'current'then starts+make_interval(hours=>n%24)else starts-interval '1 day'end,
     case when stage in('sent','processing','failed','cancelled')then stage else 'pending'end,'synthetic-bulk/'||gen_random_uuid();
   end loop;
  end loop;
  select jsonb_agg(to_jsonb(c)order by id)into history from public.customer_communications c where customer_id=party;
  execute format('select jsonb_agg(to_jsonb(v)order by id)from public.%I v where job_id=$1',t)into facts using job;
  select jsonb_agg(jsonb_build_object('id',s.id,'source_version',s.starts_at)order by s.id)into all_sources from bulk_sources s where s.kind=test_block.kind;
  select jsonb_agg(x order by x->>'id')into batch from(select x from jsonb_array_elements(all_sources)x limit 200)q;
  -- Export database-produced synthetic planner inputs before any cleanup.
  execute format('select jsonb_agg(to_jsonb(v)||jsonb_build_object(''jobs'',to_jsonb(j)||jsonb_build_object(''customers'',to_jsonb(c),''organizations'',null))order by v.id)from public.%I v join public.jobs j on j.id=v.job_id join public.customers c on c.id=j.customer_id where v.job_id=$1',t)into preserved using job;
  tables:=jsonb_build_object('communication_settings',jsonb_build_array(settings),'schedule_events','[]'::jsonb,'appointments','[]'::jsonb,'customer_communications',history)||jsonb_build_object(t,preserved);
  insert into bulk_fixtures values(jsonb_build_object('kind',kind,'tables',tables,'sources',all_sources));
  foreach stage in array array['anon','authenticated']loop
   perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);perform set_config('role',stage,true);denied:=false;
   begin perform public.cancel_obsolete_visit_reminders(kind,batch);exception when insufficient_privilege then denied:=true;end;
   perform set_config('role','none',true);perform pg_temp.bulk_check(denied,kind||': actual '||stage||' role cannot spoof server claims');
  end loop;
  perform set_config('request.jwt.claim.sub',party::text,true);perform set_config('role','service_role',true);denied:=false;
  begin perform public.cancel_obsolete_visit_reminders(kind,batch);exception when insufficient_privilege then denied:=true;end;
  perform set_config('role','none',true);perform set_config('request.jwt.claim.sub','',true);perform pg_temp.bulk_check(denied,kind||': server-role request with a user subject is refused');
  for bad in select x from jsonb_array_elements(jsonb_build_array(null,'{}'::jsonb,'[]'::jsonb,all_sources,jsonb_build_array(batch->0,batch->0),jsonb_build_array(jsonb_build_object('id',null,'source_version',starts)),jsonb_build_array(jsonb_build_object('id',v,'source_version','infinity'))))x loop
   perform set_config('role','service_role',true);failed:=false;
   begin perform public.cancel_obsolete_visit_reminders(kind,bad);exception when data_exception then failed:=true;end;
   perform set_config('role','none',true);perform pg_temp.bulk_check(failed,kind||': invalid batch rejected '||md5(coalesce(bad::text,'')));
  end loop;
  perform set_config('role','service_role',true);failed:=false;
  begin perform public.cancel_obsolete_visit_reminders('invalid',batch);exception when invalid_parameter_value then failed:=true;end;
  perform set_config('role','none',true);perform pg_temp.bulk_check(failed,kind||': invalid source kind rejected');
  -- One wrong version must roll back the whole batch, including other valid sources.
  bad:=jsonb_set(batch,'{0,source_version}',to_jsonb(starts-interval '20 days'));
  perform set_config('role','service_role',true);failed:=false;
  begin perform public.cancel_obsolete_visit_reminders(kind,bad);exception when serialization_failure then failed:=true;end;
  perform set_config('role','none',true);perform pg_temp.bulk_check(failed and history=(select jsonb_agg(to_jsonb(c)order by id)from public.customer_communications c where customer_id=party),kind||': stale version refuses all cleanup');
  bad:=jsonb_set(batch,'{0,id}',to_jsonb(gen_random_uuid()));
  perform set_config('role','service_role',true);failed:=false;
  begin perform public.cancel_obsolete_visit_reminders(kind,bad);exception when serialization_failure then failed:=true;end;
  perform set_config('role','none',true);perform pg_temp.bulk_check(failed and history=(select jsonb_agg(to_jsonb(c)order by id)from public.customer_communications c where customer_id=party),kind||': missing source refuses all cleanup');
  perform set_config('role','service_role',true);
  begin perform public.cancel_obsolete_visit_reminders(kind,batch);raise sqlstate '57014' using message='Synthetic statement cancellation';exception when query_canceled then null;end;
  perform set_config('role','none',true);perform pg_temp.bulk_check(history=(select jsonb_agg(to_jsonb(c)order by id)from public.customer_communications c where customer_id=party),kind||': cancelled transaction preserves all original history');
  perform set_config('role','service_role',true);result:=public.cancel_obsolete_visit_reminders(kind,batch);perform set_config('role','none',true);
  perform pg_temp.bulk_check(result=jsonb_build_object('processed',200,'cancelled',400),kind||': first bounded batch acknowledges every source and obsolete row');
  perform set_config('role','service_role',true);result:=public.cancel_obsolete_visit_reminders(kind,jsonb_build_array(all_sources->200));perform set_config('role','none',true);
  perform pg_temp.bulk_check(result=jsonb_build_object('processed',1,'cancelled',2),kind||': final source is not dropped');
  perform set_config('role','service_role',true);result:=public.cancel_obsolete_visit_reminders(kind,batch);perform set_config('role','none',true);
  perform pg_temp.bulk_check(result=jsonb_build_object('processed',200,'cancelled',0),kind||': zero obsolete rows is a complete idempotent acknowledgement');
  perform pg_temp.bulk_check(not exists(select 1 from jsonb_array_elements(history)x left join public.customer_communications c on c.id=(x->>'id')::uuid where x->>'reminder_stage'not in('obsolete','legacy')and to_jsonb(c)is distinct from x),kind||': current nonpending and unrelated history is byte-identical');
  execute format('select jsonb_agg(to_jsonb(v)order by id)from public.%I v where job_id=$1',t)into preserved using job;
  perform pg_temp.bulk_check(preserved=facts,kind||': all source facts are unchanged');
 end loop;
 perform pg_temp.bulk_check(not exists(select 1 from public.email_events where related_job_id=job)and not exists(select 1 from app_private.outbound_deliveries where context->>'job_id'=job::text),'no outbound delivery or provider acceptance created');
 perform pg_temp.bulk_check((select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton),'sending and appointment notices remain OFF');
end $test$;
select jsonb_build_object('syntheticOnly',true,'rolledBack',true,'assertions',(select jsonb_agg(label order by label)from bulk_assertions),'fixtures',(select jsonb_agg(input)from bulk_fixtures))verification;
rollback;
