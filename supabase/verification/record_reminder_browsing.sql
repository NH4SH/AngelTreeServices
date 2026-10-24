-- Caller owns BEGIN/ROLLBACK; synthetic records only. No workers or senders.
set local lock_timeout='3s';set local statement_timeout='45s';
create temporary table record_summary_assertions(label text);
create function pg_temp.record_summary_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Record browsing assertion failed: %',label;end if;
 insert into pg_temp.record_summary_assertions values(label);
end $$;
do $test$
declare party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();job uuid:=gen_random_uuid();quote uuid:=gen_random_uuid();invoice uuid:=gen_random_uuid();visit uuid:=gen_random_uuid();appointment uuid:=gen_random_uuid();column_name text;target uuid;actor uuid;role_name text;p1 uuid;p2 uuid;actual_sent uuid;legacy uuid;later_legacy uuid;selected uuid;visible_count integer;denied boolean;queue_before jsonb;source_before jsonb;settings_before jsonb;history_before jsonb;expected_total integer:=0;
begin
 select to_jsonb(s)into settings_before from public.communication_settings s where singleton;
 perform pg_temp.record_summary_check((settings_before->>'automated_sending_enabled')::boolean=false and(settings_before->>'appointment_change_notices_enabled')::boolean=false,'sending controls remain OFF');
 perform pg_temp.record_summary_check((select relrowsecurity from pg_class where oid='public.customer_communications'::regclass),'queue RLS remains enabled');
 select jsonb_build_object('outbound',(select count(*)from app_private.outbound_deliveries),'email',(select count(*)from public.email_events),'payments',(select count(*)from public.payments))into history_before;
 insert into public.roles(name)values('owner'),('admin'),('payroll_admin'),('estimator'),('crew'),('customer'),('property_manager')on conflict(name)do nothing;
 insert into public.customers(id,display_name,email)values(party,'Synthetic summary customer','summary@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state)values(site,party,'1 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,customer_id,service_location_id,status)values(job,party,site,'scheduled');
 insert into public.quotes(id,customer_id,service_location_id,quote_number,status,subtotal_cents,total_cents)values(quote,party,site,'SYNTHETIC-SUMMARY-'||quote,'sent',10000,10000);
 insert into public.invoices(id,customer_id,service_location_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents)values(invoice,party,site,'SYNTHETIC-SUMMARY-'||invoice,'sent',10000,10000,10000);
 insert into public.schedule_events(id,job_id,service_location_id,title,event_type,status,starts_at,ends_at)values(visit,job,site,'Synthetic summary visit','job','scheduled','2099-12-05T12:00:00Z','2099-12-05T13:00:00Z');
 insert into public.appointments(id,job_id,service_location_id,appointment_type,status,starts_at,ends_at)values(appointment,job,site,'job','scheduled','2099-12-05T12:00:00Z','2099-12-05T13:00:00Z');
 for column_name,target in select * from(values('quote_id',quote),('invoice_id',invoice),('job_id',job),('schedule_event_id',visit),('appointment_id',appointment))r loop
  p1:=gen_random_uuid();p2:=gen_random_uuid();actual_sent:=gen_random_uuid();legacy:=gen_random_uuid();
  execute format('insert into public.customer_communications(communication_type,reminder_stage,customer_id,%I,recipient_email,scheduled_for,status,is_automatic,idempotency_key,created_at)select ''work_reminder'',''synthetic_summary'',$1,$2,''summary@example.invalid'',''2099-12-03T17:00:00Z'',''cancelled'',false,''synthetic-summary:''||$2||'':''||n,''2026-10-10T12:00:00Z''::timestamptz+n*interval''1 second''from generate_series(1,37)n',column_name)using party,target;
  execute format('insert into public.customer_communications(id,communication_type,reminder_stage,customer_id,%I,recipient_email,scheduled_for,status,is_automatic,idempotency_key,created_at,sent_at,updated_at)values($1,''work_reminder'',''synthetic_summary'',$2,$3,''summary@example.invalid'',''2099-12-01T17:00:00Z'',''pending'',false,''summary-next:''||$1,''2026-09-01T12:00:00Z'',null,''2026-09-01T12:00:00Z''),($4,''work_reminder'',''synthetic_summary'',$2,$3,''summary@example.invalid'',''2099-12-01T17:00:00Z'',''pending'',false,''summary-next:''||$4,''2026-09-01T12:00:00Z'',null,''2026-09-01T12:00:00Z''),($5,''work_reminder'',''synthetic_summary'',$2,$3,''summary@example.invalid'',''2026-09-01T12:00:00Z'',''sent'',false,''summary-sent:''||$5,''2026-09-01T12:00:00Z'',''2026-10-23T12:00:00.123456Z'',''2026-10-23T12:00:00.123456Z''),($6,''work_reminder'',''synthetic_summary'',$2,$3,''summary@example.invalid'',''2026-09-01T12:00:00Z'',''sent'',false,''summary-legacy:''||$6,''2026-08-01T12:00:00Z'',null,''2026-10-23T12:00:00.123455Z'')',column_name)using p1,party,target,p2,actual_sent,legacy;
  execute format('select id from public.customer_communications where %I=$1 and status=''pending''order by scheduled_for,id limit 1',column_name)into selected using target;
  perform pg_temp.record_summary_check(selected=least(p1,p2),column_name||': earliest pending/tied UUID selected outside recent preview');
  execute format('select id from public.customer_communications where %I=$1 and status=''sent''and sent_at is not null order by sent_at desc,id limit 1',column_name)into selected using target;
  perform pg_temp.record_summary_check(selected=actual_sent,column_name||': latest actual send selected');
  execute format('select id from public.customer_communications where %I=$1 and status=''sent''order by coalesce(sent_at,updated_at)desc,id limit 1',column_name)into selected using target;
  perform pg_temp.record_summary_check(selected=actual_sent,column_name||': microsecond comparison agrees with native coalesce order');
  execute format('select count(*)from(select status from public.customer_communications where %I=$1 order by created_at desc limit 30)c where status in(''pending'',''sent'')',column_name)into visible_count using target;
  perform pg_temp.record_summary_check(visible_count=0,column_name||': old capped preview falsely contains neither summary outcome');
  
  -- Exercise all browse partitions independently of the recent preview.
  execute format('insert into public.customer_communications(communication_type,reminder_stage,customer_id,%I,recipient_email,scheduled_for,status,is_automatic,idempotency_key,created_at,updated_at)select ''work_reminder'',''synthetic_browse'',$1,$2,''browse@example.invalid'',''2099-12-02T17:00:00Z'',s,false,''browse:''||$2||'':''||s||'':''||n,''2026-10-11T12:00:00Z'',''2026-10-23T12:00:00Z''from unnest(array[''pending'',''failed'',''processing'',''skipped''])s cross join generate_series(1,37)n',column_name)using party,target;
  execute format('select count(*)from public.customer_communications where %I=$1 and status=''pending''',column_name)into visible_count using target;
  perform pg_temp.record_summary_check(visible_count=39,column_name||': complete scheduled count');
  execute format('select count(*)from public.customer_communications where %I=$1 and status=''failed''',column_name)into visible_count using target;
  perform pg_temp.record_summary_check(visible_count=37,column_name||': complete failed count');
  execute format('select count(*)from public.customer_communications where %I=$1 and status in(''processing'',''sent'',''skipped'',''cancelled'')',column_name)into visible_count using target;
  perform pg_temp.record_summary_check(visible_count=113,column_name||': history preserves all non-failed outcomes');
  execute format('select count(*)from(select id from public.customer_communications where %I=$1 and status=''pending''order by scheduled_for,id offset 30 limit 30)q',column_name)into visible_count using target;
  perform pg_temp.record_summary_check(visible_count=9,column_name||': scheduled second page beyond preview');
  execute format('select count(*)from(select id from public.customer_communications where %I=$1 and status=''failed''order by updated_at desc,id offset 30 limit 30)q',column_name)into visible_count using target;
  perform pg_temp.record_summary_check(visible_count=7,column_name||': failed second page beyond preview');
  execute format('select count(*)from(select id from public.customer_communications where %I=$1 and status in(''processing'',''sent'',''skipped'',''cancelled'')order by created_at desc,id offset 90 limit 30)q',column_name)into visible_count using target;
  perform pg_temp.record_summary_check(visible_count=23,column_name||': complete last history page');
  expected_total:=expected_total+189;
 end loop;
 later_legacy:=gen_random_uuid();insert into public.customer_communications(id,communication_type,reminder_stage,customer_id,invoice_id,recipient_email,scheduled_for,status,is_automatic,idempotency_key,created_at,sent_at,updated_at)values(later_legacy,'payment_confirmation','synthetic_summary',party,invoice,'summary@example.invalid','2026-09-01T12:00:00Z','sent',false,'summary-receipt:'||later_legacy,'2026-09-01T12:00:00Z',null,'2026-10-23T12:00:00.123457Z');expected_total:=expected_total+1;
 select id into selected from public.customer_communications where invoice_id=invoice and status='sent'order by coalesce(sent_at,updated_at)desc,id limit 1;
 perform pg_temp.record_summary_check(selected=later_legacy,'legacy receipt can win without hiding another communication family');
 perform pg_temp.record_summary_check('2026-10-23T12:00:00.123457Z'::timestamptz>'2026-10-23T12:00:00.123456Z'::timestamptz,'native timestamps preserve sub-millisecond ordering');
 perform pg_temp.record_summary_check(date_trunc('milliseconds','2026-10-23T12:00:00.123457Z'::timestamptz)=date_trunc('milliseconds','2026-10-23T12:00:00.123456Z'::timestamptz),'millisecond-only ordering would lose the observed distinction');
 select jsonb_agg(to_jsonb(c)order by id)into queue_before from public.customer_communications c where customer_id=party;
 select jsonb_build_object('invoice',(select to_jsonb(i)from public.invoices i where id=invoice),'quote',(select to_jsonb(q)from public.quotes q where id=quote))into source_before;
 foreach role_name in array array['owner','admin','estimator','payroll_admin','crew','customer','property_manager','none','disabled','separated']loop
  actor:=gen_random_uuid();insert into auth.users(id,email,raw_user_meta_data)values(actor,'summary-'||actor||'@example.invalid','{"role":"owner"}');update public.profiles set status=case when role_name='disabled'then 'disabled'else 'active'end where id=actor;insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(actor,'Synthetic summary reader',true,'active');
  if role_name='separated'then update public.employee_records set is_active=false,employment_status='separated'where auth_user_id=actor;end if;
  if role_name<>'none'then insert into public.user_roles(user_id,role_id)select actor,id from public.roles where name=case when role_name in('disabled','separated')then 'owner'else role_name end;end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','user_metadata',jsonb_build_object('role','owner'))::text,true);perform set_config('role','authenticated',true);
  select count(*)into visible_count from public.customer_communications where customer_id=party;select id into selected from public.customer_communications where invoice_id=invoice and status='sent'order by coalesce(sent_at,updated_at)desc,id limit 1;
  perform set_config('role','none',true);
  perform pg_temp.record_summary_check(visible_count=case when role_name in('owner','admin','estimator','payroll_admin')then expected_total else 0 end,'native scoped summary visibility: '||role_name);
  perform pg_temp.record_summary_check(selected is not distinct from case when role_name in('owner','admin','estimator','payroll_admin')then later_legacy else null end,'native last-sent access: '||role_name);
 end loop;
 denied:=false;perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"anon"}',true);perform set_config('role','anon',true);begin select count(*)into visible_count from public.customer_communications where customer_id=party;denied:=visible_count=0;exception when insufficient_privilege then denied:=true;end;perform set_config('role','none',true);perform pg_temp.record_summary_check(denied,'anonymous summary enumeration denied');
 perform pg_temp.record_summary_check((select jsonb_agg(to_jsonb(c)order by id)from public.customer_communications c where customer_id=party)=queue_before,'summary reads preserve every queue row and provider identity');
 perform pg_temp.record_summary_check(jsonb_build_object('invoice',(select to_jsonb(i)from public.invoices i where id=invoice),'quote',(select to_jsonb(q)from public.quotes q where id=quote))=source_before,'source status and financial records unchanged');
 perform pg_temp.record_summary_check((select to_jsonb(s)from public.communication_settings s where singleton)=settings_before,'all global defaults stay exact and OFF');
 perform pg_temp.record_summary_check(jsonb_build_object('outbound',(select count(*)from app_private.outbound_deliveries),'email',(select count(*)from public.email_events),'payments',(select count(*)from public.payments))=history_before,'no payment, delivery or email side effect');
end $test$;
select jsonb_build_object('assertions',(select jsonb_agg(label order by label)from pg_temp.record_summary_assertions),'sendingSwitchesStayedOff',(select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton))as verification;
