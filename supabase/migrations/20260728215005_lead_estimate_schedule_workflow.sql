-- Schedule a website lead estimate as one atomic, retry-safe operation.
-- Historical events remain unchanged; only the dedicated lead workflow sets
-- lead_intake_job_id.

alter table public.schedule_events
  add column if not exists lead_intake_job_id uuid
    references public.jobs(id) on delete set null;

create unique index if not exists schedule_events_lead_intake_job_unique_idx
  on public.schedule_events(lead_intake_job_id)
  where lead_intake_job_id is not null;

create or replace function public.schedule_lead_estimate(
  p_lead_job_id uuid,
  p_contact_name text,
  p_organization_name text,
  p_phone text,
  p_email text,
  p_street text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_access_notes text,
  p_service_notes text,
  p_service_type text,
  p_requested_scope text,
  p_internal_notes text,
  p_preferred_contact_method text,
  p_preferred_appointment_timing text,
  p_event_title text,
  p_calendar_notes text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_assigned_user_id uuid
)
returns table (
  event_id uuid,
  event_created boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  acting_user_id uuid := (select auth.uid());
  target public.jobs%rowtype;
  existing_event_status text;
  resolved_contact_id uuid;
  resolved_event_id uuid;
  resolved_end_at timestamptz := coalesce(p_ends_at, p_starts_at + interval '1 hour');
  inserted_event boolean := false;
begin
  if acting_user_id is null or not app_private.has_platform_admin_role() then
    raise exception using errcode = '42501', message = 'Only owners and admins can schedule lead estimates.';
  end if;

  if p_starts_at is null or resolved_end_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'Enter a valid estimate start time.';
  end if;

  if nullif(pg_catalog.btrim(p_contact_name), '') is null
    or (nullif(pg_catalog.btrim(p_phone), '') is null and nullif(pg_catalog.btrim(p_email), '') is null)
    or nullif(pg_catalog.btrim(p_street), '') is null
    or nullif(pg_catalog.btrim(p_city), '') is null
    or pg_catalog.length(pg_catalog.btrim(p_state)) <> 2
    or nullif(pg_catalog.btrim(p_service_type), '') is null
    or nullif(pg_catalog.btrim(p_requested_scope), '') is null
    or nullif(pg_catalog.btrim(p_event_title), '') is null
  then
    raise exception using errcode = '22023', message = 'Contact, property, service, scope, title, and estimate time are required.';
  end if;

  select job.*
  into target
  from public.jobs as job
  where job.id = p_lead_job_id
    and job.website_submission_id is not null
    and job.archived_at is null
  for update;

  if target.id is null then
    raise exception using errcode = 'P0002', message = 'Website lead not found or no access.';
  end if;

  if target.status not in ('new_lead', 'estimate_scheduled') then
    raise exception using errcode = '22023', message = 'This lead has already moved beyond estimate scheduling.';
  end if;

  select event.status
  into existing_event_status
  from public.schedule_events as event
  where event.lead_intake_job_id = target.id
  for update;

  if existing_event_status in ('in_progress', 'completed') then
    raise exception using errcode = '22023', message = 'This estimate has already started or completed.';
  end if;

  if target.customer_id is not null then
    update public.customers as customer
    set
      display_name = pg_catalog.left(pg_catalog.btrim(p_contact_name), 180),
      primary_contact_name = pg_catalog.left(pg_catalog.btrim(p_contact_name), 180),
      phone = nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
      email = nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), '')
    where customer.id = target.customer_id;
  else
    update public.organizations as organization
    set
      name = coalesce(
        nullif(pg_catalog.left(pg_catalog.btrim(p_organization_name), 180), ''),
        organization.name
      ),
      billing_phone = nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
      billing_email = nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), '')
    where organization.id = target.organization_id;

    resolved_contact_id := coalesce(target.onsite_contact_id, target.property_manager_contact_id);
    if resolved_contact_id is null then
      insert into public.organization_contacts (
        organization_id,
        full_name,
        email,
        phone,
        role_title,
        preferred_contact_method,
        contact_roles,
        receives_invoices,
        receives_job_updates
      )
      values (
        target.organization_id,
        pg_catalog.left(pg_catalog.btrim(p_contact_name), 180),
        nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), ''),
        nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
        'Website contact',
        nullif(pg_catalog.left(pg_catalog.btrim(p_preferred_contact_method), 30), ''),
        array['website_lead'],
        false,
        true
      )
      returning id into resolved_contact_id;

      update public.jobs as job
      set
        onsite_contact_id = resolved_contact_id,
        property_manager_contact_id = resolved_contact_id
      where job.id = target.id;
    else
      update public.organization_contacts as contact
      set
        full_name = pg_catalog.left(pg_catalog.btrim(p_contact_name), 180),
        email = nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), ''),
        phone = nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
        preferred_contact_method = nullif(
          pg_catalog.left(pg_catalog.btrim(p_preferred_contact_method), 30),
          ''
        )
      where contact.id = resolved_contact_id
        and contact.organization_id = target.organization_id;
    end if;
  end if;

  update public.service_locations as location
  set
    street = pg_catalog.left(pg_catalog.btrim(p_street), 240),
    city = pg_catalog.left(pg_catalog.btrim(p_city), 120),
    state = pg_catalog.upper(pg_catalog.left(pg_catalog.btrim(p_state), 2)),
    postal_code = nullif(pg_catalog.left(pg_catalog.btrim(p_postal_code), 20), ''),
    access_notes = nullif(pg_catalog.left(pg_catalog.btrim(p_access_notes), 2000), ''),
    service_notes = nullif(pg_catalog.left(pg_catalog.btrim(p_service_notes), 2000), '')
  where location.id = target.service_location_id
    and (
      location.customer_id = target.customer_id
      or location.organization_id = target.organization_id
    );

  if not found then
    raise exception using errcode = '23503', message = 'The lead service location is no longer available.';
  end if;

  update public.jobs as job
  set
    service_type = pg_catalog.left(pg_catalog.btrim(p_service_type), 80),
    requested_scope = pg_catalog.left(pg_catalog.btrim(p_requested_scope), 5000),
    internal_notes = nullif(pg_catalog.left(pg_catalog.btrim(p_internal_notes), 5000), ''),
    preferred_contact_method = nullif(
      pg_catalog.left(pg_catalog.btrim(p_preferred_contact_method), 30),
      ''
    ),
    preferred_appointment_timing = nullif(
      pg_catalog.left(pg_catalog.btrim(p_preferred_appointment_timing), 180),
      ''
    ),
    status = 'estimate_scheduled'
  where job.id = target.id;

  insert into public.schedule_events as existing (
    job_id,
    lead_intake_job_id,
    service_location_id,
    title,
    description,
    event_type,
    status,
    starts_at,
    ends_at,
    all_day,
    location_label,
    calendar_notes,
    created_by_user_id
  )
  values (
    target.id,
    target.id,
    target.service_location_id,
    pg_catalog.left(pg_catalog.btrim(p_event_title), 140),
    pg_catalog.left(pg_catalog.btrim(p_requested_scope), 500),
    'estimate',
    'scheduled',
    p_starts_at,
    resolved_end_at,
    false,
    pg_catalog.left(
      pg_catalog.concat_ws(
        ', ',
        nullif(pg_catalog.btrim(p_street), ''),
        nullif(pg_catalog.btrim(p_city), ''),
        nullif(pg_catalog.btrim(p_state), ''),
        nullif(pg_catalog.btrim(p_postal_code), '')
      ),
      240
    ),
    nullif(pg_catalog.left(pg_catalog.btrim(p_calendar_notes), 1000), ''),
    acting_user_id
  )
  on conflict (lead_intake_job_id) where lead_intake_job_id is not null
  do update set
    job_id = excluded.job_id,
    service_location_id = excluded.service_location_id,
    title = excluded.title,
    description = excluded.description,
    status = case
      when existing.status = 'confirmed' then 'confirmed'
      else 'scheduled'
    end,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    all_day = false,
    location_label = excluded.location_label,
    calendar_notes = excluded.calendar_notes
  returning existing.id, (existing.xmax = 0)
  into resolved_event_id, inserted_event;

  delete from public.schedule_event_assignments as assignment
  where assignment.event_id = resolved_event_id;

  if p_assigned_user_id is not null then
    insert into public.schedule_event_assignments (event_id, user_id, assignment_role)
    values (resolved_event_id, p_assigned_user_id, 'estimator');
  end if;

  event_id := resolved_event_id;
  event_created := inserted_event;
  return next;
end;
$$;

revoke all on function public.schedule_lead_estimate(
  uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, timestamptz, timestamptz, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.schedule_lead_estimate(
  uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, timestamptz, timestamptz, uuid
) to authenticated;

comment on column public.schedule_events.lead_intake_job_id is
  'Stable idempotency and provenance link for an estimate scheduled directly from a website lead.';

comment on function public.schedule_lead_estimate(
  uuid, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, timestamptz, timestamptz, uuid
) is
  'Owner/admin-only atomic correction and retry-safe estimate scheduling for an existing website lead.';
