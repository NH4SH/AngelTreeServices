-- Recurring services, recommendations, and staff follow-up operations.
--
-- Plans are templates. Occurrences are immutable cycle boundaries. No function
-- sends email, creates future work orders in bulk, or changes historical jobs.

create table public.service_recommendations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  organization_contact_id uuid references public.organization_contacts(id) on delete set null,
  service_location_id uuid not null references public.service_locations(id) on delete restrict,
  service_category_id uuid references public.service_categories(id) on delete set null,
  source_job_id uuid references public.jobs(id) on delete set null,
  source_closeout_id uuid references public.job_closeouts(id) on delete set null,
  title text not null,
  customer_recommendation text not null,
  internal_notes text,
  recommended_timeframe text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  estimated_value_cents integer check (estimated_value_cents is null or estimated_value_cents >= 0),
  origin text not null default 'office' check (origin in ('crew', 'office', 'estimate', 'closeout', 'inspection', 'customer_request')),
  status text not null default 'recommended' check (status in (
    'recommended', 'pending_office_review', 'follow_up_scheduled', 'quote_planned',
    'quote_created', 'accepted', 'declined', 'deferred', 'completed', 'cancelled'
  )),
  related_quote_id uuid references public.quotes(id) on delete set null,
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_recommendation_has_owner check (customer_id is not null or organization_id is not null)
);

create table public.recurring_service_plans (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  service_category_id uuid references public.service_categories(id) on delete set null,
  source_quote_id uuid references public.quotes(id) on delete set null,
  source_job_id uuid references public.jobs(id) on delete set null,
  source_recommendation_id uuid references public.service_recommendations(id) on delete set null,
  plan_name text not null,
  service_description text not null,
  recurrence_pattern text not null check (recurrence_pattern in (
    'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'twice_yearly',
    'annually', 'custom_days', 'custom_months', 'seasonal_manual'
  )),
  custom_interval_count integer check (custom_interval_count is null or custom_interval_count between 1 and 3650),
  preferred_service_window text,
  planning_window_days integer not null default 60 check (planning_window_days between 0 and 365),
  quote_lead_days integer not null default 45 check (quote_lead_days between 0 and 365),
  reminder_lead_days integer not null default 30 check (reminder_lead_days between 0 and 365),
  authorization_mode text not null default 'quote_required' check (authorization_mode in ('quote_required', 'staff_review', 'existing_agreement')),
  agreement_reference text,
  authorization_start_date date,
  authorization_end_date date,
  authorized_contact_id uuid references public.organization_contacts(id) on delete set null,
  approval_contact_id uuid references public.organization_contacts(id) on delete set null,
  billing_contact_id uuid references public.organization_contacts(id) on delete set null,
  default_onsite_contact_id uuid references public.organization_contacts(id) on delete set null,
  default_payment_terms text,
  approved_price_cents integer check (approved_price_cents is null or approved_price_cents >= 0),
  pricing_rule text,
  estimated_duration_minutes integer check (estimated_duration_minutes is null or estimated_duration_minutes > 0),
  preferred_crew_user_id uuid references public.profiles(id) on delete set null,
  standard_scope jsonb not null default '[]'::jsonb,
  material_requirements jsonb not null default '[]'::jsonb,
  equipment_requirements jsonb not null default '[]'::jsonb,
  season_start_month smallint check (season_start_month is null or season_start_month between 1 and 12),
  season_end_month smallint check (season_end_month is null or season_end_month between 1 and 12),
  weather_reschedule_allowed boolean not null default true,
  customer_notes text,
  internal_notes text,
  state text not null default 'active' check (state in ('active', 'paused', 'cancelled', 'expired')),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_plan_has_one_owner check ((customer_id is null) <> (organization_id is null)),
  constraint recurring_plan_custom_interval check (
    recurrence_pattern not in ('custom_days', 'custom_months') or custom_interval_count is not null
  ),
  constraint recurring_plan_authorization_dates check (
    authorization_end_date is null or authorization_start_date is null or authorization_end_date >= authorization_start_date
  )
);

create table public.recurring_plan_locations (
  id uuid primary key default gen_random_uuid(),
  recurring_plan_id uuid not null references public.recurring_service_plans(id) on delete cascade,
  service_location_id uuid not null references public.service_locations(id) on delete restrict,
  onsite_contact_id uuid references public.organization_contacts(id) on delete set null,
  next_review_date date,
  next_service_due_date date not null,
  preferred_service_window text,
  property_notes text,
  access_instructions text,
  state text not null default 'active' check (state in ('active', 'paused', 'removed')),
  paused_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_plan_location_unique unique (recurring_plan_id, service_location_id)
);

create table public.recurring_service_occurrences (
  id uuid primary key default gen_random_uuid(),
  recurring_plan_id uuid not null references public.recurring_service_plans(id) on delete restrict,
  recurring_plan_location_id uuid not null references public.recurring_plan_locations(id) on delete restrict,
  service_location_id uuid not null references public.service_locations(id) on delete restrict,
  occurrence_key text not null unique,
  target_service_date date not null,
  target_window_start date,
  target_window_end date,
  status text not null default 'review_needed' check (status in (
    'upcoming', 'review_needed', 'quote_draft', 'quote_sent', 'approved', 'scheduled',
    'completed', 'skipped', 'declined', 'cancelled'
  )),
  prior_quote_id uuid references public.quotes(id) on delete set null,
  prior_work_order_id uuid references public.jobs(id) on delete set null,
  renewal_quote_id uuid references public.quotes(id) on delete set null,
  work_order_id uuid references public.jobs(id) on delete set null,
  assigned_estimator_user_id uuid references public.profiles(id) on delete set null,
  authorization_mode_snapshot text not null,
  authorization_reference_snapshot text,
  approved_price_cents_snapshot integer check (approved_price_cents_snapshot is null or approved_price_cents_snapshot >= 0),
  pricing_review_status text not null default 'required' check (pricing_review_status in ('required', 'reviewed', 'not_applicable')),
  review_notes text,
  skip_reason text,
  generated_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_occurrence_window_order check (
    target_window_end is null or target_window_start is null or target_window_end >= target_window_start
  )
);

create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  organization_contact_id uuid references public.organization_contacts(id) on delete set null,
  service_location_id uuid references public.service_locations(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  change_order_id uuid references public.change_orders(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  recurring_plan_id uuid references public.recurring_service_plans(id) on delete set null,
  recurring_occurrence_id uuid references public.recurring_service_occurrences(id) on delete set null,
  recommendation_id uuid references public.service_recommendations(id) on delete set null,
  title text not null,
  description text,
  task_type text not null default 'other' check (task_type in (
    'call_customer', 'schedule_estimate', 'prepare_quote', 'follow_up_quote',
    'schedule_approved_work', 'collect_information', 'request_payment', 'renew_service',
    'property_inspection', 'customer_callback', 'internal_review', 'other'
  )),
  due_at timestamptz not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'completed', 'cancelled')),
  completed_at timestamptz,
  completed_by_user_id uuid references public.profiles(id) on delete set null,
  snoozed_until timestamptz,
  notes text,
  dedupe_key text unique,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_up_has_subject check (
    customer_id is not null or organization_id is not null or service_location_id is not null
    or quote_id is not null or change_order_id is not null or job_id is not null
    or invoice_id is not null or recurring_plan_id is not null or recommendation_id is not null
  )
);

create table public.recurring_service_settings (
  singleton_key boolean primary key default true check (singleton_key),
  default_planning_window_days integer not null default 60 check (default_planning_window_days between 0 and 365),
  default_quote_lead_days integer not null default 45 check (default_quote_lead_days between 0 and 365),
  default_reminder_lead_days integer not null default 30 check (default_reminder_lead_days between 0 and 365),
  overdue_escalation_days integer not null default 7 check (overdue_escalation_days between 0 and 365),
  business_timezone text not null default 'America/New_York',
  automated_generation_enabled boolean not null default false,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.recurring_service_settings (singleton_key) values (true) on conflict do nothing;

alter table public.quotes
  add column if not exists recurring_service_plan_id uuid references public.recurring_service_plans(id) on delete set null,
  add column if not exists recurring_occurrence_id uuid references public.recurring_service_occurrences(id) on delete set null,
  add column if not exists source_recommendation_id uuid references public.service_recommendations(id) on delete set null,
  add column if not exists renewal_source_quote_id uuid references public.quotes(id) on delete set null,
  add column if not exists pricing_reviewed_at timestamptz,
  add column if not exists pricing_reviewed_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.jobs
  add column if not exists recurring_service_plan_id uuid references public.recurring_service_plans(id) on delete set null,
  add column if not exists recurring_occurrence_id uuid references public.recurring_service_occurrences(id) on delete set null,
  add column if not exists recurring_authorization_source text;

alter table public.invoices
  add column if not exists recurring_service_plan_id uuid references public.recurring_service_plans(id) on delete set null,
  add column if not exists recurring_occurrence_id uuid references public.recurring_service_occurrences(id) on delete set null;

alter table public.schedule_events
  add column if not exists recurring_occurrence_id uuid references public.recurring_service_occurrences(id) on delete set null;

alter table public.job_closeouts
  add column if not exists future_work_recommended boolean,
  add column if not exists future_work_description text,
  add column if not exists future_work_timeframe text;

create unique index quotes_recurring_occurrence_unique_idx on public.quotes(recurring_occurrence_id)
  where recurring_occurrence_id is not null;
create unique index quotes_source_recommendation_unique_idx on public.quotes(source_recommendation_id)
  where source_recommendation_id is not null;
create unique index jobs_recurring_occurrence_unique_idx on public.jobs(recurring_occurrence_id)
  where recurring_occurrence_id is not null;
create index follow_up_tasks_queue_idx on public.follow_up_tasks(status, due_at, priority);
create index follow_up_tasks_customer_idx on public.follow_up_tasks(customer_id, status);
create index follow_up_tasks_organization_idx on public.follow_up_tasks(organization_id, status);
create index service_recommendations_review_idx on public.service_recommendations(status, created_at);
create index service_recommendations_location_idx on public.service_recommendations(service_location_id, status);
create index recurring_plans_owner_idx on public.recurring_service_plans(customer_id, organization_id, state);
create index recurring_plan_locations_due_idx on public.recurring_plan_locations(state, next_service_due_date);
create index recurring_occurrences_queue_idx on public.recurring_service_occurrences(status, target_service_date);
create index recurring_occurrences_plan_idx on public.recurring_service_occurrences(recurring_plan_id, target_service_date desc);

create or replace function app_private.validate_recurring_plan_contacts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is null and (
    new.authorized_contact_id is not null or new.approval_contact_id is not null
    or new.billing_contact_id is not null or new.default_onsite_contact_id is not null
  ) then
    raise exception 'Organization contacts require an organization-owned recurring plan.';
  end if;
  if new.organization_id is not null and exists (
    select 1 from public.organization_contacts c
    where c.id = any(array[
      new.authorized_contact_id, new.approval_contact_id,
      new.billing_contact_id, new.default_onsite_contact_id
    ]::uuid[])
      and (c.organization_id is distinct from new.organization_id or not c.is_active)
  ) then
    raise exception 'Every recurring-plan contact must be active and belong to the plan organization.';
  end if;
  return new;
end;
$$;

create or replace function app_private.validate_recurring_plan_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_customer_id uuid;
  plan_organization_id uuid;
  location_customer_id uuid;
  location_organization_id uuid;
begin
  select customer_id, organization_id into plan_customer_id, plan_organization_id
  from public.recurring_service_plans where id = new.recurring_plan_id;
  select customer_id, organization_id into location_customer_id, location_organization_id
  from public.service_locations where id = new.service_location_id;

  if plan_customer_id is not null and location_customer_id is distinct from plan_customer_id then
    raise exception 'The service location must belong to the recurring plan customer.';
  end if;
  if plan_organization_id is not null and location_organization_id is distinct from plan_organization_id then
    raise exception 'The service location must belong to the recurring plan organization.';
  end if;
  if new.onsite_contact_id is not null and not exists (
    select 1 from public.organization_contacts c
    where c.id = new.onsite_contact_id
      and c.organization_id = plan_organization_id
      and c.is_active
  ) then
    raise exception 'The onsite contact must be active and belong to the plan organization.';
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_recurring_plan_contacts() from public, anon, authenticated, service_role;
revoke all on function app_private.validate_recurring_plan_location() from public, anon, authenticated, service_role;

create trigger service_recommendations_set_updated_at before update on public.service_recommendations
  for each row execute function public.set_updated_at();
create trigger recurring_service_plans_validate_contacts before insert or update on public.recurring_service_plans
  for each row execute function app_private.validate_recurring_plan_contacts();
create trigger recurring_service_plans_set_updated_at before update on public.recurring_service_plans
  for each row execute function public.set_updated_at();
create trigger recurring_plan_locations_validate before insert or update on public.recurring_plan_locations
  for each row execute function app_private.validate_recurring_plan_location();
create trigger recurring_plan_locations_set_updated_at before update on public.recurring_plan_locations
  for each row execute function public.set_updated_at();
create trigger recurring_service_occurrences_set_updated_at before update on public.recurring_service_occurrences
  for each row execute function public.set_updated_at();
create trigger follow_up_tasks_set_updated_at before update on public.follow_up_tasks
  for each row execute function public.set_updated_at();
create trigger recurring_service_settings_set_updated_at before update on public.recurring_service_settings
  for each row execute function public.set_updated_at();

alter table public.service_recommendations enable row level security;
alter table public.recurring_service_plans enable row level security;
alter table public.recurring_plan_locations enable row level security;
alter table public.recurring_service_occurrences enable row level security;
alter table public.follow_up_tasks enable row level security;
alter table public.recurring_service_settings enable row level security;

revoke all on table public.service_recommendations, public.recurring_service_plans,
  public.recurring_plan_locations, public.recurring_service_occurrences,
  public.follow_up_tasks, public.recurring_service_settings from anon;
grant select, insert, update on table public.service_recommendations,
  public.recurring_service_plans, public.recurring_plan_locations,
  public.recurring_service_occurrences, public.follow_up_tasks to authenticated;
grant all on table public.service_recommendations, public.recurring_service_plans,
  public.recurring_plan_locations, public.recurring_service_occurrences,
  public.follow_up_tasks to service_role;
grant select, update on table public.recurring_service_settings to authenticated, service_role;
grant insert, update on table public.recurring_service_settings to service_role;

create policy "Staff manage service recommendations" on public.service_recommendations
  for all to authenticated using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Staff manage recurring plans" on public.recurring_service_plans
  for all to authenticated using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Staff manage recurring plan locations" on public.recurring_plan_locations
  for all to authenticated using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Staff manage recurring occurrences" on public.recurring_service_occurrences
  for all to authenticated using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Staff manage follow up tasks" on public.follow_up_tasks
  for all to authenticated using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Staff read recurring settings" on public.recurring_service_settings
  for select to authenticated using (app_private.has_staff_role());
create policy "Admins manage recurring settings" on public.recurring_service_settings
  for all to authenticated using (app_private.has_platform_admin_role()) with check (app_private.has_platform_admin_role());

create or replace function app_private.next_recurring_service_date(
  p_current_date date,
  p_pattern text,
  p_custom_interval_count integer default null
)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_pattern
    when 'weekly' then p_current_date + 7
    when 'biweekly' then p_current_date + 14
    when 'monthly' then (p_current_date + interval '1 month')::date
    when 'bimonthly' then (p_current_date + interval '2 months')::date
    when 'quarterly' then (p_current_date + interval '3 months')::date
    when 'twice_yearly' then (p_current_date + interval '6 months')::date
    when 'annually' then (p_current_date + interval '1 year')::date
    when 'custom_days' then p_current_date + pg_catalog.coalesce(p_custom_interval_count, 1)
    when 'custom_months' then (p_current_date + pg_catalog.make_interval(months => pg_catalog.coalesce(p_custom_interval_count, 1)))::date
    else p_current_date
  end;
$$;

create or replace function public.generate_due_recurring_occurrences(p_limit integer default 100)
returns table (created_count integer, existing_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  row_item record;
  generated_id uuid;
  inserted_rows integer := 0;
  existing_rows integer := 0;
  acting_user_id uuid := (select auth.uid());
  generation_enabled boolean;
  business_timezone text;
  business_date date;
begin
  if acting_user_id is not null and not app_private.has_staff_role() then
    raise exception 'Only staff or the service worker can generate recurring occurrences.';
  end if;
  select automated_generation_enabled, recurring_service_settings.business_timezone
    into generation_enabled, business_timezone
  from public.recurring_service_settings where singleton_key;
  business_date := pg_catalog.timezone(
    pg_catalog.coalesce(business_timezone, 'America/New_York'),
    pg_catalog.now()
  )::date;
  if acting_user_id is null and not pg_catalog.coalesce(generation_enabled, false) then
    return query select 0, 0;
    return;
  end if;

  for row_item in
    select p.*, l.id as location_row_id, l.service_location_id, l.next_service_due_date,
      l.next_review_date, l.state as location_state
    from public.recurring_service_plans p
    join public.recurring_plan_locations l on l.recurring_plan_id = p.id
    join public.service_locations sl on sl.id = l.service_location_id
    left join public.customers c on c.id = p.customer_id
    left join public.organizations o on o.id = p.organization_id
    where p.state = 'active'
      and l.state = 'active'
      and (c.id is null or c.status = 'active')
      and (o.id is null or o.status = 'active')
      and l.next_service_due_date <= business_date + p.planning_window_days
    order by l.next_service_due_date
    limit pg_catalog.greatest(1, pg_catalog.least(p_limit, 500))
    for update of l skip locked
  loop
    insert into public.recurring_service_occurrences (
      recurring_plan_id, recurring_plan_location_id, service_location_id,
      occurrence_key, target_service_date, target_window_start, target_window_end,
      status, prior_quote_id, prior_work_order_id, authorization_mode_snapshot,
      authorization_reference_snapshot, approved_price_cents_snapshot,
      pricing_review_status, created_by_user_id
    ) values (
      row_item.id, row_item.location_row_id, row_item.service_location_id,
      row_item.id::text || ':' || row_item.service_location_id::text || ':' || row_item.next_service_due_date::text,
      row_item.next_service_due_date, row_item.next_service_due_date, row_item.next_service_due_date,
      'review_needed', row_item.source_quote_id, row_item.source_job_id,
      row_item.authorization_mode, row_item.agreement_reference, row_item.approved_price_cents,
      case when row_item.authorization_mode = 'existing_agreement' then 'not_applicable' else 'required' end,
      acting_user_id
    )
    on conflict (occurrence_key) do nothing
    returning id into generated_id;

    if generated_id is null then
      existing_rows := existing_rows + 1;
    else
      inserted_rows := inserted_rows + 1;
      insert into public.follow_up_tasks (
        customer_id, organization_id, service_location_id, recurring_plan_id,
        recurring_occurrence_id, title, description, task_type, due_at, priority,
        assigned_to_user_id, dedupe_key, created_by_user_id
      ) values (
        row_item.customer_id, row_item.organization_id, row_item.service_location_id, row_item.id,
        generated_id, 'Review renewal: ' || row_item.plan_name,
        'Review scope, contacts, property status, and current pricing before creating work.',
        'renew_service', (pg_catalog.greatest(business_date, row_item.next_service_due_date - row_item.quote_lead_days)::timestamp at time zone pg_catalog.coalesce(business_timezone, 'America/New_York')),
        'normal', null,
        'renewal-review:' || generated_id::text, acting_user_id
      ) on conflict (dedupe_key) do nothing;
      insert into public.activity_log (actor_user_id, subject_type, subject_id, event_type, metadata_json)
      values (acting_user_id, 'recurring_occurrence', generated_id, 'renewal_opportunity_created',
        pg_catalog.jsonb_build_object('plan_id', row_item.id, 'service_location_id', row_item.service_location_id));
    end if;
    generated_id := null;
  end loop;

  return query select inserted_rows, existing_rows;
end;
$$;

create or replace function public.close_recurring_occurrence(
  p_occurrence_id uuid,
  p_status text,
  p_reason text default null
)
returns table (occurrence_id uuid, next_service_due_date date)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target record;
  next_date date;
begin
  if not app_private.has_staff_role() then raise exception 'Only staff can close recurring occurrences.'; end if;
  if p_status not in ('completed', 'skipped', 'cancelled') then raise exception 'Choose a valid closing status.'; end if;
  if p_status in ('skipped', 'cancelled') and pg_catalog.btrim(pg_catalog.coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required.';
  end if;

  select o.*, p.recurrence_pattern, p.custom_interval_count, p.source_recommendation_id
  into target
  from public.recurring_service_occurrences o
  join public.recurring_service_plans p on p.id = o.recurring_plan_id
  where o.id = p_occurrence_id for update of o;
  if not found then raise exception 'Recurring occurrence not found.'; end if;
  if target.status in ('completed', 'skipped', 'cancelled') then
    return query select target.id, (select l.next_service_due_date from public.recurring_plan_locations l where l.id = target.recurring_plan_location_id);
    return;
  end if;

  next_date := case when target.recurrence_pattern = 'seasonal_manual' then target.target_service_date
    else app_private.next_recurring_service_date(target.target_service_date, target.recurrence_pattern, target.custom_interval_count) end;

  update public.recurring_service_occurrences set
    status = p_status,
    completed_at = case when p_status = 'completed' then pg_catalog.now() else null end,
    skip_reason = case when p_status in ('skipped', 'cancelled') then pg_catalog.left(pg_catalog.btrim(p_reason), 1000) else null end
  where id = p_occurrence_id;

  if target.recurrence_pattern <> 'seasonal_manual' then
    update public.recurring_plan_locations set
      next_service_due_date = next_date,
      next_review_date = next_date - (select planning_window_days from public.recurring_service_plans where id = target.recurring_plan_id)
    where id = target.recurring_plan_location_id and next_service_due_date <= target.target_service_date;
  end if;

  update public.follow_up_tasks set status = 'completed', completed_at = pg_catalog.now(), completed_by_user_id = (select auth.uid())
  where recurring_occurrence_id = p_occurrence_id and status not in ('completed', 'cancelled');
  if p_status = 'completed' and target.source_recommendation_id is not null then
    update public.service_recommendations
    set status = 'completed', reviewed_at = pg_catalog.now(), reviewed_by_user_id = (select auth.uid())
    where id = target.source_recommendation_id and status not in ('declined', 'cancelled');
  end if;
  insert into public.activity_log (actor_user_id, subject_type, subject_id, event_type, metadata_json)
  values ((select auth.uid()), 'recurring_occurrence', p_occurrence_id, 'recurring_occurrence_' || p_status,
    pg_catalog.jsonb_build_object('reason_recorded', p_reason is not null));
  return query select p_occurrence_id, next_date;
end;
$$;

create or replace function public.submit_crew_service_recommendation(
  p_job_id uuid,
  p_title text,
  p_description text,
  p_timeframe text default null,
  p_internal_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_user_id uuid := (select auth.uid());
  target public.jobs%rowtype;
  recommendation_id uuid;
begin
  if acting_user_id is null then raise exception 'Sign in before submitting a recommendation.'; end if;
  select * into target from public.jobs where id = p_job_id;
  if not found then raise exception 'Work order not found.'; end if;
  if target.assigned_crew_user_id <> acting_user_id and not app_private.has_staff_role() then
    raise exception 'This work order is not assigned to this crew account.';
  end if;
  if pg_catalog.btrim(pg_catalog.coalesce(p_title, '')) = '' or pg_catalog.btrim(pg_catalog.coalesce(p_description, '')) = '' then
    raise exception 'Title and recommendation are required.';
  end if;

  insert into public.service_recommendations (
    customer_id, organization_id, service_location_id, source_job_id, title,
    customer_recommendation, internal_notes, recommended_timeframe, origin,
    status, created_by_user_id
  ) values (
    target.customer_id, target.organization_id, target.service_location_id, target.id,
    pg_catalog.left(pg_catalog.btrim(p_title), 180), pg_catalog.left(pg_catalog.btrim(p_description), 5000),
    pg_catalog.nullif(pg_catalog.left(pg_catalog.btrim(pg_catalog.coalesce(p_internal_notes, '')), 5000), ''),
    pg_catalog.nullif(pg_catalog.left(pg_catalog.btrim(pg_catalog.coalesce(p_timeframe, '')), 240), ''),
    'crew', 'pending_office_review', acting_user_id
  ) returning id into recommendation_id;

  insert into public.activity_log (actor_user_id, subject_type, subject_id, event_type, metadata_json)
  values (acting_user_id, 'service_recommendation', recommendation_id, 'recommendation_submitted',
    pg_catalog.jsonb_build_object('job_id', p_job_id, 'origin', 'crew'));
  return recommendation_id;
end;
$$;

revoke all on function app_private.next_recurring_service_date(date, text, integer) from public, anon, authenticated;
revoke all on function public.generate_due_recurring_occurrences(integer) from public, anon;
revoke all on function public.close_recurring_occurrence(uuid, text, text) from public, anon;
revoke all on function public.submit_crew_service_recommendation(uuid, text, text, text, text) from public, anon;
grant execute on function public.generate_due_recurring_occurrences(integer) to authenticated, service_role;
grant execute on function public.close_recurring_occurrence(uuid, text, text) to authenticated, service_role;
grant execute on function public.submit_crew_service_recommendation(uuid, text, text, text, text) to authenticated;
