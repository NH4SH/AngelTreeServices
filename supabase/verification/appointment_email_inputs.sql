-- Rollback-only synthetic appointment email inputs. No provider or persistent setting change.
begin;
set local lock_timeout='3s';
set local statement_timeout='45s';
create temporary table appointment_email_fixtures(label text,template text,input jsonb);
create temporary table appointment_email_assertions(label text);
create function pg_temp.appointment_email_check(ok boolean,label text)returns void language plpgsql as $$begin
  if ok is distinct from true then raise exception 'Appointment email assertion failed: %',label;end if;
  insert into pg_temp.appointment_email_assertions values(label);
end $$;
do $test$
declare party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();job uuid:=gen_random_uuid();visit uuid;second_visit uuid;
  source_type text;scenario text;notice_id uuid;notice jsonb;input jsonb;confirmation boolean;zone text;
  starts timestamptz:=date_trunc('hour',clock_timestamp())+interval '10 days';
begin
  perform pg_temp.appointment_email_check((select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton),'staging/local automatic sending and appointment notices start OFF');
  select business_timezone into zone from public.communication_settings where singleton;
  insert into public.customers(id,display_name,email)values(party,'Synthetic appointment homeowner','appointment-'||party||'@example.invalid');
  insert into public.service_locations(id,customer_id,street,city,state)values(site,party,'123 Synthetic Lane','Fredericksburg','VA');
  insert into public.jobs(id,customer_id,service_location_id,status,service_type,requested_scope)values(job,party,site,'new_lead','other','Synthetic appointment email scope');
  foreach source_type in array array['estimate','job']loop
    visit:=gen_random_uuid();
    insert into public.schedule_events(id,job_id,service_location_id,title,event_type,status,starts_at,ends_at,calendar_notes)
      values(visit,job,site,'Synthetic email visit',source_type,'scheduled',starts,starts+interval '1 hour','PRIVATE INTERNAL NOTE');
    select jsonb_build_object('customerName',c.display_name,'communicationLabel',case source_type when 'estimate'then 'estimate'else 'work appointment'end,
      'startsAt',v.starts_at,'endsAt',v.ends_at,'timezone',zone,'location',concat_ws(', ',l.street,l.city,l.state))into input
      from public.schedule_events v join public.customers c on c.id=party join public.service_locations l on l.id=v.service_location_id where v.id=visit;
    foreach confirmation in array array[true,false]loop
      insert into appointment_email_fixtures values(source_type||case when confirmation then '-confirmation'else '-reminder'end,'appointmentCommunicationTemplate',input||jsonb_build_object('isConfirmation',confirmation));
    end loop;
    if source_type='job'then
      second_visit:=gen_random_uuid();
      insert into public.schedule_events(id,job_id,service_location_id,title,event_type,status,starts_at,ends_at)
        values(second_visit,job,site,'Synthetic second day','job','scheduled',starts+interval '1 day',starts+interval '27 hours');
      insert into appointment_email_fixtures select 'multi-day','appointmentCommunicationTemplate',input||jsonb_build_object('isConfirmation',true,'workSessions',
        (select jsonb_agg(jsonb_build_object('startsAt',starts_at,'endsAt',ends_at)order by starts_at)from public.schedule_events where id=any(array[visit,second_visit])));
    end if;
  end loop;
  visit:=gen_random_uuid();
  insert into public.schedule_events(id,job_id,service_location_id,title,event_type,status,starts_at,ends_at)
    values(visit,job,site,'Synthetic open-ended visit','estimate','scheduled',starts,null);
  insert into appointment_email_fixtures select 'open-ended','appointmentCommunicationTemplate',jsonb_build_object('customerName',c.display_name,'communicationLabel','estimate','isConfirmation',false,
    'startsAt',v.starts_at,'endsAt',v.ends_at,'timezone',zone,'location',concat_ws(', ',l.street,l.city,l.state))
    from public.schedule_events v join public.customers c on c.id=party join public.service_locations l on l.id=v.service_location_id where v.id=visit;
  perform pg_temp.appointment_email_check((select count(*)=6 from appointment_email_fixtures)and not exists(select 1 from public.customer_communications where customer_id=party),'six stored visit inputs create no notice while sending is OFF');
  -- These flags are visible only inside this transaction and are rolled back.
  update public.communication_settings set automated_sending_enabled=true,appointment_change_notices_enabled=true where singleton;
  foreach scenario in array array['estimate-changed','estimate-cancelled','job-changed','job-cancelled','reinstated']loop
    source_type:=case when scenario like 'estimate-%'then 'estimate'else 'job'end;visit:=gen_random_uuid();
    insert into public.schedule_events(id,job_id,service_location_id,title,event_type,status,starts_at,ends_at,calendar_notes)
      values(visit,job,site,'Synthetic changed visit',source_type,case when scenario='reinstated'then 'cancelled'else 'scheduled'end,starts,starts+interval '1 hour','PRIVATE INTERNAL NOTE');
    if scenario like '%-cancelled'then update public.schedule_events set status='cancelled'where id=visit;
    else update public.schedule_events set status='scheduled',starts_at=starts+interval '2 days',ends_at=starts+interval '49 hours'where id=visit;end if;
    select id into notice_id from public.customer_communications where schedule_event_id=visit and status='pending';
    update public.customer_communications set scheduled_for=clock_timestamp()-interval '1 minute'where id=notice_id;
    perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
    notice:=public.get_appointment_change_notice(notice_id);
    perform set_config('role','none',true);
    perform pg_temp.appointment_email_check(notice->>'status'='ready',scenario||': native service lookup returns the current eligible visit notice');
    perform pg_temp.appointment_email_check(notice::text not like '%PRIVATE INTERNAL NOTE%',scenario||': customer notice excludes internal notes');
    insert into appointment_email_fixtures values(scenario,'appointmentChangeTemplate',jsonb_build_object('customerName','Synthetic appointment homeowner','timezone',zone,
      'location',concat_ws(', ',notice#>>'{location,street}',notice#>>'{location,city}',notice#>>'{location,state}'),
      'kind',notice->>'kind','before',notice->'before','after',notice->'after'));
  end loop;
end $test$;
select jsonb_build_object('syntheticOnly',true,'rolledBack',true,'assertions',(select jsonb_agg(label order by label)from appointment_email_assertions),
  'fixtures',(select jsonb_agg(to_jsonb(f)order by label)from appointment_email_fixtures f))verification;
rollback;
