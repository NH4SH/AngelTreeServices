-- PR13: one server-only transaction owns the complete website request.
-- Existing rows remain compatible; no inferred backfill or automatic mail replay.
alter table public.jobs
  add column website_submission_payload_hash text check (website_submission_payload_hash ~ '^[0-9a-f]{64}$'),
  add column notification_attempt_id uuid,
  add column notification_started_at timestamptz,
  add column notification_outcome text check (notification_outcome in ('pending','sending','accepted','rejected','unknown','not_attempted')),
  add constraint website_notice_attempt_consistent check (
    case when notification_outcome is null or notification_outcome='pending'
      then notification_attempt_id is null and notification_started_at is null
      else notification_attempt_id is not null and notification_started_at is not null end
  );

create function app_private.guard_website_intake_state()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (tg_op='INSERT' and (new.website_submission_payload_hash is not null or new.notification_outcome is not null or new.notification_attempt_id is not null or new.notification_started_at is not null))
    or (tg_op='UPDATE' and (new.website_submission_payload_hash is distinct from old.website_submission_payload_hash
      or new.notification_outcome is distinct from old.notification_outcome or new.notification_attempt_id is distinct from old.notification_attempt_id
      or new.notification_started_at is distinct from old.notification_started_at)) then
    if current_user not in ('service_role','postgres','supabase_admin') or auth.uid() is not null then
      raise exception 'Website intake state is server-managed' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function app_private.guard_website_intake_state() from public,anon,authenticated;
create trigger guard_website_intake_state before insert or update on public.jobs
  for each row execute function app_private.guard_website_intake_state();

create function public.submit_website_lead(p_submission jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s jsonb := p_submission;
  v_submission text := s->>'submissionId';
  v_fingerprint text := s->>'requestFingerprint';
  v_hash text;
  v_existing public.jobs%rowtype;
  v_source uuid;
  v_customer uuid;
  v_org uuid;
  v_contact uuid;
  v_location uuid;
  v_job uuid;
  v_duplicate uuid;
  v_summary text;
  v_note text;
  k text;
begin
  if current_user <> 'service_role' or auth.uid() is not null then
    raise exception 'Server-only command' using errcode='42501';
  end if;
  if jsonb_typeof(s) is distinct from 'object' or octet_length(s::text)>32000
    or nullif(btrim(v_submission),'') is null or length(v_submission)>120
    or v_fingerprint is null or v_fingerprint !~ '^[0-9a-f]{64}$'
    or coalesce(length(s->>'name'),0) not between 2 and 120
    or coalesce(s->>'phone','') !~ '^\+[0-9]{10,15}$'
    or coalesce(length(s->>'address'),0) not between 5 and 300
    or coalesce(length(s->>'projectDetails'),0) not between 5 and 3000
    or (s->>'customerType') is null or (s->>'customerType') not in ('residential','commercial')
    or (s->>'serviceType') is null or (s->>'serviceType') not in ('other','landscaping','lawn_care','emergency')
    or coalesce(s->>'serviceLabel','') not in ('Tree Care','Landscaping','Lawn Care','Storm Cleanup','Multiple Services / Not Sure Yet')
    or coalesce(s->>'customerTypeLabel','') not in ('Homeowner','Commercial / Property Management')
    or coalesce(s->>'propertyScope','') not in ('','1 property','2 to 5 properties','6+ properties','Recurring service')
    or coalesce(s->>'preferredContactMethod','') not in ('','phone','email','text')
    or jsonb_typeof(s->'addressParts') is distinct from 'object'
    or coalesce(length(s#>>'{addressParts,street}'),0) not between 1 and 300
    or coalesce(length(s#>>'{addressParts,city}'),0) not between 1 and 300
    or coalesce(s#>>'{addressParts,state}','') !~ '^[A-Z]{2}$'
    or jsonb_typeof(s#>'{addressParts,needsConfirmation}') is distinct from 'boolean'
    or jsonb_typeof(s->'hazardPresent') is distinct from 'boolean'
    or jsonb_typeof(s->'updatesOptIn') is distinct from 'boolean'
  then raise exception 'Invalid website request' using errcode='22023'; end if;
  foreach k in array array['email','commercialName','firstName','lastName','preferredAppointmentTiming','pageUrl','referrer','utmSource','utmMedium','utmCampaign','utmTerm','utmContent'] loop
    if s->k is not null and jsonb_typeof(s->k) not in ('string','null') then
      raise exception 'Invalid website request' using errcode='22023';
    end if;
    if length(s->>k) > (case when k in ('pageUrl','referrer') then 500 when k='email' then 254 else 160 end) then
      raise exception 'Invalid website request' using errcode='22023';
    end if;
  end loop;
  if (s->>'email') is not null and (s->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid website request' using errcode='22023';
  end if;
  -- Server arrival time changes on a genuine response-loss retry.
  v_hash := encode(sha256(convert_to((s-'submittedAt')::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(13,hashtext(v_submission));
  select * into v_existing from public.jobs where website_submission_id=v_submission;
  if found then
    if v_existing.website_submission_payload_hash is not null and v_existing.website_submission_payload_hash<>v_hash then
      raise exception 'Submission ID already used for a different request' using errcode='23505';
    end if;
    return jsonb_build_object('job_id',v_existing.id,'created',false,'duplicate_mode','replayed','submission_id',v_submission);
  end if;
  -- Separate submissions still create separate leads. This lock only makes the
  -- existing 30-minute possible-duplicate warning deterministic under races.
  perform pg_advisory_xact_lock(14,hashtext(v_fingerprint));
  select id into v_duplicate from public.jobs
    where website_request_fingerprint=v_fingerprint and submitted_at>=statement_timestamp()-interval '30 minutes'
    order by submitted_at desc,id limit 1;
  insert into public.lead_sources(name,source_type,is_active) values('Website','website',true)
    on conflict(name) do nothing;
  select id into strict v_source from public.lead_sources where name='Website';

  if s->>'customerType'='commercial' and nullif(s->>'commercialName','') is not null then
    insert into public.organizations(name,organization_type,billing_email,billing_phone,billing_address,notes)
      values(s->>'commercialName','property_manager',s->>'email',s->>'phone',s->>'address','Created automatically from the public website lead form.') returning id into v_org;
    insert into public.organization_contacts(organization_id,full_name,email,phone,role_title,preferred_contact_method,contact_roles,notes,receives_invoices,receives_job_updates)
      values(v_org,s->>'name',s->>'email',s->>'phone','Website contact',nullif(s->>'preferredContactMethod',''),array['website_lead'],
        case when nullif(s->>'preferredAppointmentTiming','') is not null then 'Preferred timing: '||(s->>'preferredAppointmentTiming') end,false,true) returning id into v_contact;
  else
    insert into public.customers(display_name,primary_contact_name,customer_type,email,phone,billing_address,lead_source_id,lead_campaign)
      values(s->>'name',s->>'name',s->>'customerType',s->>'email',s->>'phone',s->>'address',v_source,s->>'utmCampaign') returning id into v_customer;
  end if;
  insert into public.service_locations(customer_id,organization_id,label,street,city,state,postal_code,service_notes)
    values(v_customer,v_org,'Website request',s#>>'{addressParts,street}',s#>>'{addressParts,city}',s#>>'{addressParts,state}',s#>>'{addressParts,postalCode}',
      case when (s#>>'{addressParts,needsConfirmation}')::boolean then 'Confirm the submitted address before scheduling.' end) returning id into v_location;
  v_summary := concat_ws(' ','Submitted through the public website.','Requested service: '||(s->>'serviceLabel')||'.',
    case when v_duplicate is not null then 'Likely duplicate of website lead '||v_duplicate||'; review before creating duplicate work.' end,
    case when nullif(s->>'commercialName','') is not null then 'Company / HOA / property: '||(s->>'commercialName')||'.' end,
    case when nullif(s->>'propertyScope','') is not null then 'Property scope: '||(s->>'propertyScope')||'.' end,
    case when nullif(s->>'preferredContactMethod','') is not null then 'Preferred contact method: '||(s->>'preferredContactMethod')||'.' end,
    case when nullif(s->>'preferredAppointmentTiming','') is not null then 'Preferred timing: '||(s->>'preferredAppointmentTiming')||'.' end,
    case when (s->>'hazardPresent')::boolean then 'Customer indicated an immediate hazard or blocked access.' end,
    case when (s#>>'{addressParts,needsConfirmation}')::boolean then 'Address needs office confirmation before scheduling.' end,
    case when (s->>'updatesOptIn')::boolean then 'Customer opted in to seasonal tips, reminders, and scheduling updates.' end);
  insert into public.jobs(customer_id,organization_id,property_manager_contact_id,onsite_contact_id,service_location_id,lead_source_id,lead_campaign,
    website_submission_id,website_submission_payload_hash,website_request_fingerprint,duplicate_of_job_id,source_detail,source_page_url,source_referrer_url,
    utm_source,utm_medium,utm_campaign,utm_term,utm_content,preferred_contact_method,preferred_appointment_timing,submitted_at,notification_status,notification_outcome,
    status,service_type,priority,requested_scope,internal_notes)
  values(v_customer,v_org,v_contact,v_contact,v_location,v_source,s->>'utmCampaign',v_submission,v_hash,v_fingerprint,v_duplicate,'public_contact_form',s->>'pageUrl',s->>'referrer',
    s->>'utmSource',s->>'utmMedium',s->>'utmCampaign',s->>'utmTerm',s->>'utmContent',nullif(s->>'preferredContactMethod',''),s->>'preferredAppointmentTiming',statement_timestamp(),'pending','pending',
    'new_lead',s->>'serviceType',case when (s->>'hazardPresent')::boolean or s->>'serviceType'='emergency' then 'urgent' else 'normal' end,s->>'projectDetails',v_summary) returning id into v_job;
  v_note := concat_ws(E'\n','Website request from '||(s->>'name')||'.','Request type: '||(s->>'customerTypeLabel')||'.',
    case when v_duplicate is not null then 'Potential duplicate of lead '||v_duplicate||'.' end,
    case when (s->>'hazardPresent')::boolean then 'Customer indicated an immediate hazard or blocked access.' end,
    'Submitted address: '||(s->>'address')||'.','Project details: '||(s->>'projectDetails'));
  insert into public.notes(customer_id,service_location_id,job_id,visibility,body) values(v_customer,v_location,v_job,'internal',v_note);
  insert into public.activity_log(subject_type,subject_id,event_type,metadata_json)
  values('job',v_job,'website_lead_received',jsonb_build_object(
    'source','website','source_detail','public_contact_form','submission_id',v_submission,'first_name',s->'firstName','last_name',s->'lastName',
    'duplicate_of_job_id',v_duplicate,'page_url',s->'pageUrl','referrer',s->'referrer','service_requested',s->'serviceLabel','request_type',s->'customerTypeLabel',
    'organization_name',s->'commercialName','organization_id',v_org,'preferred_contact_method',s->'preferredContactMethod','preferred_appointment_timing',s->'preferredAppointmentTiming',
    'hazard_present',s->'hazardPresent','updates_opt_in',s->'updatesOptIn','utm_source',s->'utmSource','utm_medium',s->'utmMedium','utm_campaign',s->'utmCampaign','utm_term',s->'utmTerm','utm_content',s->'utmContent'));
  return jsonb_build_object('job_id',v_job,'created',true,'duplicate_mode',case when v_duplicate is not null then 'likely_duplicate' end,'submission_id',v_submission);
end $$;

-- A one-shot, durable handoff, not a retry worker. An interrupted/ambiguous
-- attempt requires reconciliation in PR14; it must never be blindly resent.
create function public.claim_website_lead_notification(p_job_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare j public.jobs%rowtype; a uuid;
begin
  if current_user<>'service_role' or auth.uid() is not null then raise exception 'Server-only command' using errcode='42501'; end if;
  select * into j from public.jobs where id=p_job_id for update;
  if not found or j.website_submission_payload_hash is null or j.notification_outcome is distinct from 'pending' or j.notification_attempt_id is not null then return null; end if;
  a:=gen_random_uuid();
  update public.jobs set notification_attempt_id=a,notification_started_at=clock_timestamp(),notification_outcome='sending' where id=p_job_id;
  insert into public.activity_log(subject_type,subject_id,event_type,metadata_json)
    values('job',p_job_id,'website_lead_notification_started',jsonb_build_object('attempt_id',a,'source','website'));
  return a;
end $$;

create function public.finish_website_lead_notification(p_job_id uuid,p_attempt_id uuid,p_outcome text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.jobs%rowtype; v_status text;
begin
  if current_user<>'service_role' or auth.uid() is not null then raise exception 'Server-only command' using errcode='42501'; end if;
  if p_outcome is null or p_outcome not in ('accepted','rejected','unknown','not_attempted') then raise exception 'Invalid notice outcome' using errcode='22023'; end if;
  select * into j from public.jobs where id=p_job_id for update;
  if not found or p_attempt_id is null or j.notification_attempt_id is distinct from p_attempt_id then return false; end if;
  if j.notification_outcome=p_outcome then return true; end if;
  if j.notification_outcome is distinct from 'sending' then return false; end if;
  v_status:=case p_outcome when 'accepted' then 'sent' when 'not_attempted' then 'skipped' else 'failed' end;
  update public.jobs set notification_outcome=p_outcome,notification_status=v_status,
    notification_error=case p_outcome when 'unknown' then 'Delivery needs review before any retry.' when 'rejected' then 'Provider rejected the office notice.' when 'not_attempted' then 'Office notice was not attempted. Review email configuration.' end where id=p_job_id;
  insert into public.activity_log(subject_type,subject_id,event_type,metadata_json)
    values('job',p_job_id,case when p_outcome='accepted' then 'website_lead_notification_sent' else 'website_lead_notification_failed' end,
      jsonb_build_object('source','website','source_detail','public_contact_form','attempt_id',p_attempt_id,'notification_status',v_status,'notification_outcome',p_outcome));
  return true;
end $$;

revoke all on function public.submit_website_lead(jsonb) from public,anon,authenticated;
revoke all on function public.claim_website_lead_notification(uuid) from public,anon,authenticated;
revoke all on function public.finish_website_lead_notification(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.submit_website_lead(jsonb) to service_role;
grant execute on function public.claim_website_lead_notification(uuid) to service_role;
grant execute on function public.finish_website_lead_notification(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
