-- Rollback-only synthetic inputs and existing queue contract checks.
-- Worker error responses are controlled by the JS acceptance adapter.
begin;
set local lock_timeout='3s';
set local statement_timeout='45s';
create temporary table appointment_queue_assertions(label text);
create temporary table appointment_queue_fixtures(label text,kind text,tables jsonb);
create function pg_temp.appointment_queue_check(ok boolean,label text)returns void language plpgsql as $$begin
  if ok is distinct from true then raise exception 'Appointment queue assertion failed: %',label;end if;
  insert into pg_temp.appointment_queue_assertions values(label);
end $$;
do $test$
declare party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();job uuid:=gen_random_uuid();visit uuid;unrelated uuid;
  kind text;visit_type text;label text;column_name text;source_table text;scenario text;queue_id uuid;
  source jsonb;queue_rows jsonb;protected_rows jsonb;settings jsonb;tables jsonb;denied boolean;n bigint;i integer:=0;
  starts timestamptz:=date_trunc('hour',clock_timestamp())+interval '7 days';
begin
  perform pg_temp.appointment_queue_check((select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton),'sending and appointment notices start OFF');
  -- Enabled planner inputs only in exported JSON; no hosted setting is changed.
  select to_jsonb(s)||jsonb_build_object('automated_sending_enabled',true,'appointment_change_notices_enabled',false,
    'estimate_confirmation_enabled',true,'estimate_reminder_enabled',true,'work_confirmation_enabled',true,'work_reminder_enabled',true,
    'quote_follow_up_enabled',false,'invoice_reminder_enabled',false,'payment_confirmation_enabled',false,'updated_at','2000-01-01T00:00:00.000Z') into settings
    from public.communication_settings s where singleton;
  insert into public.customers(id,display_name,email)values(party,'Synthetic queue customer','queue-'||party||'@example.invalid');
  insert into public.service_locations(id,customer_id,street,city,state)values(site,party,'123 Synthetic Lane','Fredericksburg','VA');
  insert into public.jobs(id,customer_id,service_location_id,status,service_type,requested_scope)values(job,party,site,'new_lead','other','Synthetic queue reconciliation');
  foreach kind in array array['schedule_event','appointment']loop
    column_name:=case kind when 'schedule_event'then 'schedule_event_id'else 'appointment_id'end;
    source_table:=case kind when 'schedule_event'then 'schedule_events'else 'appointments'end;
    foreach visit_type in array case kind when 'schedule_event'then array['estimate','job','maintenance','emergency']else array['estimate','job','maintenance']end loop
      i:=i+1;starts:=starts+interval '1 day';visit:=gen_random_uuid();unrelated:=gen_random_uuid();label:=kind||'-'||visit_type;
      if kind='schedule_event'then
        insert into public.schedule_events(id,job_id,service_location_id,title,event_type,status,starts_at,ends_at)
          values(visit,job,site,'Synthetic queue visit',visit_type,'scheduled',starts,starts+interval '1 hour'),
            (unrelated,job,site,'Synthetic unrelated visit','estimate','scheduled',starts+interval '2 hours',starts+interval '3 hours');
      else
        insert into public.appointments(id,job_id,service_location_id,appointment_type,status,starts_at,ends_at)
          values(visit,job,site,visit_type,'scheduled',starts,starts+interval '1 hour'),
            (unrelated,job,site,'estimate','scheduled',starts+interval '2 hours',starts+interval '3 hours');
      end if;
      execute format('select to_jsonb(v)||jsonb_build_object(''jobs'',to_jsonb(j)||jsonb_build_object(''customers'',to_jsonb(c),''organizations'',null)) from public.%I v join public.jobs j on j.id=v.job_id join public.customers c on c.id=j.customer_id where v.id=$1',source_table)into source using visit;
      foreach scenario in array array['obsolete','legacy','current','sent','processing','failed','cancelled','unrelated']loop
        queue_id:=gen_random_uuid();
        execute format('insert into public.customer_communications(id,communication_type,reminder_stage,customer_id,job_id,%I,recipient_source,recipient_email,scheduled_for,source_version,status,is_automatic,idempotency_key)values($1,$2,$3,$4,$5,$6,''customer'',$7,$8,$9,$10,true,$11)',column_name)
          using queue_id,case when visit_type='estimate'then 'estimate_reminder'else 'work_reminder'end,scenario,party,job,
            case when scenario='unrelated'then unrelated else visit end,'queue-'||party||'@example.invalid',starts-interval '24 hours',
            case when scenario='legacy'then null when scenario='current'then starts else starts-interval '1 day'end,
            case when scenario in('sent','processing','failed','cancelled')then scenario else 'pending'end,'synthetic-queue/'||queue_id;
      end loop;
      execute format('select jsonb_agg(to_jsonb(c)order by id)from public.customer_communications c where %I=any($1)',column_name)into queue_rows using array[visit,unrelated];
      tables:=jsonb_build_object('communication_settings',jsonb_build_array(settings),'customer_communications',queue_rows,'schedule_events','[]'::jsonb,'appointments','[]'::jsonb)
        ||jsonb_build_object(source_table,jsonb_build_array(source));
      insert into appointment_queue_fixtures values(label,kind,tables);
      -- A cancelled statement rolls back its tentative cleanup completely.
      begin
        execute format('update public.customer_communications set status=''cancelled''where %I=$1 and status=''pending''and(source_version is null or source_version<>$2)',column_name)using visit,starts;
        raise sqlstate '57014' using message='Synthetic cancelled cleanup';
      exception when sqlstate '57014'then null;end;
      execute format('select jsonb_agg(to_jsonb(c)order by id)from public.customer_communications c where %I=any($1)',column_name)into protected_rows using array[visit,unrelated];
      perform pg_temp.appointment_queue_check(protected_rows=queue_rows,label||': cancelled cleanup rolls back without losing pending or accepted rows');
      denied:=false;
      perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"anon"}',true);perform set_config('role','anon',true);
      begin
        execute format('update public.customer_communications set status=''cancelled''where %I=$1',column_name)using visit;
        get diagnostics n=row_count;denied:=n=0;
      exception when insufficient_privilege then denied:=true;end;
      perform set_config('role','none',true);
      perform pg_temp.appointment_queue_check(denied,label||': anonymous callers cannot cancel reminders');
      perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
      execute format('update public.customer_communications set status=''cancelled'',cancelled_at=clock_timestamp(),skip_reason=''The appointment was rescheduled. A current reminder replaces this one.''where %I=$1 and status=''pending''and(source_version is null or source_version<>$2)',column_name)using visit,starts;
      get diagnostics n=row_count;
      perform set_config('role','none',true);
      perform pg_temp.appointment_queue_check(n=2,label||': service cleanup cancels exactly the obsolete and legacy pending rows');
      execute format('select jsonb_agg(to_jsonb(c)order by id)from public.customer_communications c where %I=any($1)and reminder_stage not in(''obsolete'',''legacy'')',column_name)into protected_rows using array[visit,unrelated];
      perform pg_temp.appointment_queue_check(protected_rows=(select jsonb_agg(x order by x->>'id')from jsonb_array_elements(queue_rows)x where x->>'reminder_stage'not in('obsolete','legacy')),label||': current, nonpending and unrelated history is unchanged');
      execute format('update public.customer_communications set status=''cancelled''where %I=$1 and status=''pending''and(source_version is null or source_version<>$2)',column_name)using visit,starts;
      get diagnostics n=row_count;
      perform pg_temp.appointment_queue_check(n=0,label||': repeated cleanup legitimately affects zero rows');
      queue_id:=gen_random_uuid();
      insert into public.customer_communications(id,communication_type,reminder_stage,customer_id,job_id,recipient_source,recipient_email,scheduled_for,idempotency_key)
        values(queue_id,'estimate_reminder','synthetic_unique',party,job,'customer','queue-'||party||'@example.invalid',starts,'synthetic-stable/'||visit);
      insert into public.customer_communications(communication_type,reminder_stage,customer_id,job_id,recipient_source,recipient_email,scheduled_for,idempotency_key)
        values('estimate_reminder','synthetic_unique',party,job,'customer','queue-'||party||'@example.invalid',starts,'synthetic-stable/'||visit)on conflict(idempotency_key)do nothing;
      get diagnostics n=row_count;
      perform pg_temp.appointment_queue_check(n=0 and(select count(*)=1 from public.customer_communications where idempotency_key='synthetic-stable/'||visit),label||': stable queue identity cannot create a second reminder');
      perform pg_temp.appointment_queue_check(not exists(select 1 from public.email_events where related_job_id=job)and not exists(select 1 from app_private.outbound_deliveries where context->>'job_id'=job::text),label||': preparing queue rows creates no provider acceptance or outbound delivery');
    end loop;
  end loop;
  perform pg_temp.appointment_queue_check((select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton),'sending and appointment notices remain OFF');
end $test$;
select jsonb_build_object('syntheticOnly',true,'rolledBack',true,'assertions',(select jsonb_agg(label order by label)from appointment_queue_assertions),
  'fixtures',(select jsonb_agg(to_jsonb(f)order by label)from appointment_queue_fixtures f))verification;
rollback;
