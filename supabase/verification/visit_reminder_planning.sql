-- Synthetic visit/coverage sets; no sender, no permanent settings or data changes.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
create temporary table visit_planning_assertions(label text);
create temporary table visit_planning_fixtures(data jsonb);
create temporary table visit_planning_ids(kind text,id uuid,n integer);
create function pg_temp.visit_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Visit planning assertion failed: %',label;end if;
 insert into pg_temp.visit_planning_assertions values(label);end $$;
do $test$
declare party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();job uuid:=gen_random_uuid();v uuid;kind text;t text;n integer;
 starts timestamptz:=date_trunc('hour',clock_timestamp())+interval '7 days';settings jsonb;tables jsonb;coverage jsonb;notice uuid;linked uuid;first_appointment uuid;denied boolean;before_rows jsonb;
begin
 perform pg_temp.visit_check((select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton),'sending and notices start OFF');
 select to_jsonb(s)||jsonb_build_object('automated_sending_enabled',true,'appointment_change_notices_enabled',true,
 'estimate_confirmation_enabled',true,'estimate_reminder_enabled',true,'work_confirmation_enabled',true,'work_reminder_enabled',true,
 'quote_follow_up_enabled',false,'invoice_reminder_enabled',false,'payment_confirmation_enabled',false,'updated_at','2000-01-01T00:00:00.000Z')into settings from public.communication_settings s where singleton;
 insert into public.customers(id,display_name,email)values(party,'Synthetic visit planning','visit-'||party||'@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state)values(site,party,'123 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,customer_id,service_location_id,status,service_type,requested_scope)values(job,party,site,'new_lead','other','Synthetic complete visit planning');
 foreach kind in array array['appointment','schedule_event']loop
  for n in 1..1003 loop
   v:=gen_random_uuid();insert into visit_planning_ids values(kind,v,n);
   if kind='appointment' then
    insert into public.appointments(id,job_id,service_location_id,appointment_type,status,starts_at,ends_at)
    values(v,job,site,case when n>1001 then 'job'else 'estimate'end,'scheduled',starts+make_interval(hours=>n%24),starts+make_interval(hours=>n%24+1));
   else
    insert into public.schedule_events(id,job_id,service_location_id,title,event_type,status,starts_at,ends_at,source_appointment_id)
    values(v,job,site,'Synthetic complete visit',case when n>1001 then 'job'else 'estimate'end,'scheduled',starts+make_interval(hours=>n%24),starts+make_interval(hours=>n%24+1),case when n=1 then(select id from visit_planning_ids i where i.kind='appointment'and i.n=1)else null end);
   end if;
  end loop;
 end loop;
 perform pg_temp.visit_check((select count(*)=2006 from visit_planning_ids),'1003 sources per visit family exceed the API cap');
 -- Coverage function needs the notice switch, changed only within this transaction.
 -- Master sending stays OFF and the hosted worker cannot see this uncommitted row.
 update public.communication_settings set appointment_change_notices_enabled=true where singleton;
 for v in select id from visit_planning_ids i where i.kind='schedule_event'and i.n<=1001 loop
  notice:=gen_random_uuid();
  insert into app_private.appointment_notice_events(id,source_kind,source_id,notice_kind,before_state,after_state,job_id,customer_id)
  values(notice,'schedule_event',v,'changed','{}','{}',job,party);
  insert into public.customer_communications(id,communication_type,reminder_stage,customer_id,job_id,schedule_event_id,recipient_source,recipient_email,scheduled_for,source_version,is_automatic,status,idempotency_key)
  values(notice,'appointment_changed','changed',party,job,v,'customer','visit-'||party||'@example.invalid',starts,(select starts_at from public.schedule_events where id=v),true,'pending','synthetic-visit-notice/'||notice);
 end loop;
 select id into first_appointment from visit_planning_ids i where i.kind='appointment'and i.n=1;
 notice:=gen_random_uuid();
 insert into app_private.appointment_notice_events(id,source_kind,source_id,notice_kind,before_state,after_state,job_id,customer_id)
 values(notice,'appointment',first_appointment,'changed','{}','{}',job,party);
 insert into public.customer_communications(id,communication_type,reminder_stage,customer_id,job_id,appointment_id,recipient_source,recipient_email,scheduled_for,source_version,is_automatic,status,sent_at,idempotency_key)
 values(notice,'appointment_changed','changed',party,job,first_appointment,'customer','visit-'||party||'@example.invalid',starts,(select starts_at from public.appointments where id=first_appointment),true,'sent',clock_timestamp()-interval '30 days','synthetic-visit-notice/'||notice);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
 select jsonb_agg(to_jsonb(c)order by source_kind,source_id,suppress_reminder)into coverage from public.get_appointment_notice_coverage()c;
 perform set_config('role','none',true);
 select jsonb_agg(x order by x->>'source_kind',x->>'source_id',x->>'suppress_reminder')into coverage from jsonb_array_elements(coverage)x where exists(select 1 from visit_planning_ids i where i.kind=x->>'source_kind'and i.id::text=x->>'source_id');
 perform pg_temp.visit_check(jsonb_array_length(coverage)=1003,'service coverage includes 1001 scheduled sources and both canonical appointment rows');
 perform pg_temp.visit_check((select count(*)=2 and bool_or((x->>'suppress_reminder')::boolean)and not bool_and((x->>'suppress_reminder')::boolean)from jsonb_array_elements(coverage)x where x->>'source_kind'='appointment'and x->>'source_id'=first_appointment::text),'canonical appointment can have false and true coverage simultaneously');
 tables:=jsonb_build_object('communication_settings',jsonb_build_array(settings),'customer_communications',jsonb_build_array());
 foreach kind in array array['schedule_event','appointment']loop
  t:=case kind when 'schedule_event'then 'schedule_events'else 'appointments'end;
  execute format('select jsonb_agg(to_jsonb(v)||jsonb_build_object(''jobs'',to_jsonb(j)||jsonb_build_object(''customers'',to_jsonb(c),''organizations'',null))order by v.id)from public.%I v join visit_planning_ids i on i.id=v.id and i.kind=$1 join public.jobs j on j.id=v.job_id join public.customers c on c.id=j.customer_id',t)into before_rows using kind;
  tables:=tables||jsonb_build_object(t,before_rows);
 end loop;
 insert into visit_planning_fixtures values(jsonb_build_object('party',party,'tables',tables,'coverage',coverage));
 denied:=false;perform set_config('request.jwt.claims','{"role":"anon"}',true);perform set_config('role','anon',true);
 begin perform public.get_appointment_notice_coverage();exception when insufficient_privilege then denied:=true;end;
 perform set_config('role','none',true);perform pg_temp.visit_check(denied,'anonymous callers cannot read notice coverage');
 denied:=false;perform set_config('request.jwt.claims','{"role":"authenticated"}',true);perform set_config('role','authenticated',true);
 begin perform public.get_appointment_notice_coverage();exception when insufficient_privilege then denied:=true;end;
 perform set_config('role','none',true);perform pg_temp.visit_check(denied,'ordinary signed-in callers cannot read notice coverage');
 perform pg_temp.visit_check(not exists(select 1 from public.email_events where related_job_id=job)and not exists(select 1 from app_private.outbound_deliveries where context->>'job_id'=job::text),'native setup creates no outbound delivery or provider acceptance');
 perform pg_temp.visit_check((select not automated_sending_enabled from public.communication_settings where singleton),'master sending remains OFF even inside the rollback transaction');
end $test$;
select jsonb_build_object('syntheticOnly',true,'rolledBack',true,'assertions',(select jsonb_agg(label order by label)from visit_planning_assertions),'fixtures',(select jsonb_agg(data)from visit_planning_fixtures))verification;
rollback;
