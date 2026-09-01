-- Preserve estimate scheduling behavior while removing the unused row variable
-- reported by plpgsql_check.
create or replace function public.schedule_party_estimate(
  p_source_request_key uuid,
  p_customer_id uuid,
  p_organization_id uuid,
  p_contact_id uuid,
  p_service_location_id uuid,
  p_contact_name text,
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
  resolved_event_id uuid;
  resolved_end_at timestamptz := coalesce(p_ends_at, p_starts_at + interval '1 hour');
  location_owner_valid boolean := false;
  inserted_event boolean := false;
begin
  if acting_user_id is null or not app_private.has_platform_admin_role() then
    raise exception using errcode = '42501', message = 'Only owners and admins can schedule estimates from customer records.';
  end if;

  if p_source_request_key is null
    or (p_customer_id is null) = (p_organization_id is null)
    or p_service_location_id is null
    or p_starts_at is null
    or resolved_end_at <= p_starts_at
  then
    raise exception using errcode = '22023', message = 'Choose one customer or organization, a property, and a valid estimate time.';
  end if;

  if nullif(pg_catalog.btrim(p_contact_name), '') is null
    or (nullif(pg_catalog.btrim(p_phone), '') is null and nullif(pg_catalog.btrim(p_email), '') is null)
    or nullif(pg_catalog.btrim(p_street), '') is null
    or nullif(pg_catalog.btrim(p_city), '') is null
    or pg_catalog.length(pg_catalog.btrim(p_state)) <> 2
    or nullif(pg_catalog.btrim(p_requested_scope), '') is null
    or nullif(pg_catalog.btrim(p_event_title), '') is null
  then
    raise exception using errcode = '22023', message = 'Contact, property, work request, title, and estimate time are required.';
  end if;

  if p_customer_id is not null then
    update public.customers as customer
    set
      primary_contact_name = pg_catalog.left(pg_catalog.btrim(p_contact_name), 180),
      phone = nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
      email = nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), '')
    where customer.id = p_customer_id
      and customer.archived_at is null;
    if not found then
      raise exception using errcode = 'P0002', message = 'Customer not found or unavailable.';
    end if;
  else
    perform 1
    from public.organizations as organization
    where organization.id = p_organization_id
      and organization.archived_at is null
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Organization not found or unavailable.';
    end if;

    if p_contact_id is not null then
      update public.organization_contacts as contact
      set
        full_name = pg_catalog.left(pg_catalog.btrim(p_contact_name), 180),
        phone = nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
        email = nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), '')
      where contact.id = p_contact_id
        and contact.organization_id = p_organization_id
        and contact.is_active = true;
      if not found then
        raise exception using errcode = '23503', message = 'Choose an active contact for this organization.';
      end if;
    else
      update public.organizations as organization
      set
        billing_phone = nullif(pg_catalog.left(pg_catalog.btrim(p_phone), 50), ''),
        billing_email = nullif(pg_catalog.left(pg_catalog.lower(pg_catalog.btrim(p_email)), 254), '')
      where organization.id = p_organization_id;
    end if;
  end if;

  select (
    (p_customer_id is not null and location.customer_id = p_customer_id and location.organization_id is null)
    or
    (p_organization_id is not null and location.organization_id = p_organization_id and location.customer_id is null)
  )
  into location_owner_valid
  from public.service_locations as location
  where location.id = p_service_location_id
    and location.archived_at is null
  for update;

  if not coalesce(location_owner_valid, false) then
    raise exception using errcode = '23503', message = 'Choose a service location belonging to this customer or organization.';
  end if;

  update public.service_locations as location
  set
    street = pg_catalog.left(pg_catalog.btrim(p_street), 240),
    city = pg_catalog.left(pg_catalog.btrim(p_city), 120),
    state = pg_catalog.upper(pg_catalog.left(pg_catalog.btrim(p_state), 2)),
    postal_code = nullif(pg_catalog.left(pg_catalog.btrim(p_postal_code), 20), ''),
    access_notes = nullif(pg_catalog.left(pg_catalog.btrim(p_access_notes), 2000), ''),
    service_notes = nullif(pg_catalog.left(pg_catalog.btrim(p_service_notes), 2000), '')
  where location.id = p_service_location_id;

  insert into public.schedule_events as current_event (
    job_id,
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
    created_by_user_id,
    source_customer_id,
    source_organization_id,
    source_contact_id,
    source_service_type,
    source_request_key
  )
  values (
    null,
    p_service_location_id,
    pg_catalog.left(pg_catalog.btrim(p_event_title), 140),
    pg_catalog.left(pg_catalog.btrim(p_requested_scope), 5000),
    'estimate',
    'scheduled',
    p_starts_at,
    resolved_end_at,
    false,
    pg_catalog.left(
      pg_catalog.concat_ws(', ', p_street, p_city, p_state, p_postal_code),
      240
    ),
    nullif(pg_catalog.left(pg_catalog.btrim(p_calendar_notes), 1000), ''),
    acting_user_id,
    p_customer_id,
    p_organization_id,
    p_contact_id,
    nullif(pg_catalog.left(pg_catalog.btrim(p_service_type), 80), ''),
    p_source_request_key
  )
  on conflict (source_request_key) where source_request_key is not null
  do update set
    service_location_id = excluded.service_location_id,
    title = excluded.title,
    description = excluded.description,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    location_label = excluded.location_label,
    calendar_notes = excluded.calendar_notes,
    source_customer_id = excluded.source_customer_id,
    source_organization_id = excluded.source_organization_id,
    source_contact_id = excluded.source_contact_id,
    source_service_type = excluded.source_service_type
  returning current_event.id, (current_event.xmax = 0)
  into resolved_event_id, inserted_event;

  delete from public.schedule_event_assignments as assignment
  where assignment.event_id = resolved_event_id;

  if p_assigned_user_id is not null then
    insert into public.schedule_event_assignments(event_id, user_id, assignment_role)
    values (resolved_event_id, p_assigned_user_id, 'estimator');
  end if;

  event_id := resolved_event_id;
  event_created := inserted_event;
  return next;
end;
$$;
