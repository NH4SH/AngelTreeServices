-- Shared CRM search and reversible record lifecycle support.

alter table public.customers
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references public.profiles(id) on delete set null;
alter table public.organizations
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references public.profiles(id) on delete set null;
alter table public.service_locations
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references public.profiles(id) on delete set null;
alter table public.jobs
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references public.profiles(id) on delete set null;
alter table public.quotes
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references public.profiles(id) on delete set null;
alter table public.invoices
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references public.profiles(id) on delete set null;

-- Split broad staff policies so DELETE is reserved for the owner role. Existing
-- crew SELECT policies continue to apply independently.
do $policies$
declare
  target_table text;
  policy_label text;
begin
  foreach target_table in array array['organizations', 'customers', 'service_locations', 'jobs', 'quotes', 'invoices']
  loop
    policy_label := case target_table
      when 'service_locations' then 'service locations'
      else replace(target_table, '_', ' ')
    end;
    execute format('drop policy if exists %I on public.%I', 'Staff can manage ' || policy_label, target_table);
    execute format('drop policy if exists %I on public.%I', 'Staff can read ' || policy_label, target_table);
    execute format('drop policy if exists %I on public.%I', 'Staff can create ' || policy_label, target_table);
    execute format('drop policy if exists %I on public.%I', 'Staff can update ' || policy_label, target_table);
    execute format('drop policy if exists %I on public.%I', 'Owners can delete ' || policy_label, target_table);
    execute format('create policy %I on public.%I for select to authenticated using (app_private.has_staff_role())', 'Staff can read ' || policy_label, target_table);
    execute format('create policy %I on public.%I for insert to authenticated with check (app_private.has_staff_role())', 'Staff can create ' || policy_label, target_table);
    execute format('create policy %I on public.%I for update to authenticated using (app_private.has_staff_role()) with check (app_private.has_staff_role())', 'Staff can update ' || policy_label, target_table);
    execute format($policy$
      create policy %I on public.%I for delete to authenticated using (
        exists (
          select 1 from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          where ur.user_id = (select auth.uid()) and r.name = 'owner'
        )
      )
    $policy$, 'Owners can delete ' || policy_label, target_table);
  end loop;
end
$policies$;

create index if not exists customers_archived_idx on public.customers(archived_at, created_at desc);
create index if not exists organizations_archived_idx on public.organizations(archived_at, name);
create index if not exists service_locations_archived_idx on public.service_locations(archived_at, city, street);
create index if not exists jobs_archived_idx on public.jobs(archived_at, updated_at desc);
create index if not exists quotes_archived_idx on public.quotes(archived_at, updated_at desc);
create index if not exists invoices_archived_idx on public.invoices(archived_at, updated_at desc);

create table if not exists public.record_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  record_type text not null check (record_type in ('customer', 'organization', 'service_location', 'job', 'quote', 'invoice')),
  record_id uuid not null,
  action text not null check (action in ('permanent_delete_attempt', 'permanent_delete_blocked', 'permanent_delete_success')),
  reason text,
  dependency_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists record_deletion_audit_record_idx
  on public.record_deletion_audit(record_type, record_id, created_at desc);
create index if not exists record_deletion_audit_actor_idx
  on public.record_deletion_audit(actor_user_id, created_at desc);

alter table public.record_deletion_audit enable row level security;
revoke all on table public.record_deletion_audit from public, anon;
grant select, insert on table public.record_deletion_audit to authenticated, service_role;

drop policy if exists "Owners and admins read deletion audit" on public.record_deletion_audit;
create policy "Owners and admins read deletion audit"
  on public.record_deletion_audit for select to authenticated
  using (app_private.has_platform_admin_role());

drop policy if exists "Owners record deletion audit" on public.record_deletion_audit;
create policy "Owners record deletion audit"
  on public.record_deletion_audit for insert to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid()) and r.name = 'owner'
    )
  );

create or replace view public.admin_record_search
with (security_invoker = true)
as
select
  'customer'::text as record_type,
  customer.id as record_id,
  customer.status,
  null::integer as amount_cents,
  customer.archived_at,
  customer.created_at,
  null::text as source_type,
  lower(concat_ws(' ',
    customer.id::text,
    customer.display_name,
    customer.primary_contact_name,
    customer.phone,
    regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g'),
    customer.email,
    customer.billing_address,
    locations.search_text
  )) as search_text
from public.customers customer
left join lateral (
  select string_agg(concat_ws(' ', location.label, location.street, location.city, location.state, location.postal_code), ' ') as search_text
  from public.service_locations location
  where location.customer_id = customer.id
) locations on true

union all

select
  'organization', organization.id, organization.status, null::integer,
  organization.archived_at, organization.created_at, null::text,
  lower(concat_ws(' ',
    organization.id::text,
    organization.name,
    organization.billing_phone,
    regexp_replace(coalesce(organization.billing_phone, ''), '[^0-9]', '', 'g'),
    organization.billing_email,
    organization.billing_address,
    locations.search_text
  ))
from public.organizations organization
left join lateral (
  select string_agg(concat_ws(' ', location.label, location.street, location.city, location.state, location.postal_code), ' ') as search_text
  from public.service_locations location
  where location.organization_id = organization.id
) locations on true

union all

select
  'service_location', location.id,
  case when location.archived_at is null then 'active' else 'archived' end,
  null::integer, location.archived_at, location.created_at, null::text,
  lower(concat_ws(' ',
    location.id::text,
    customer.display_name,
    customer.phone,
    regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g'),
    organization.name,
    location.label,
    location.street,
    location.city,
    location.state,
    location.postal_code
  ))
from public.service_locations location
left join public.customers customer on customer.id = location.customer_id
left join public.organizations organization on organization.id = location.organization_id

union all

select
  'job', job.id, job.status, job.projected_value_cents,
  job.archived_at, job.created_at, lead_source.source_type,
  lower(concat_ws(' ',
    job.id::text,
    customer.display_name,
    customer.phone,
    regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g'),
    customer.email,
    organization.name,
    organization.billing_phone,
    regexp_replace(coalesce(organization.billing_phone, ''), '[^0-9]', '', 'g'),
    organization.billing_email,
    location.street,
    location.city,
    location.state,
    location.postal_code,
    job.service_type,
    job.requested_scope,
    job.status,
    crew.full_name,
    crew.email
  ))
from public.jobs job
left join public.customers customer on customer.id = job.customer_id
left join public.organizations organization on organization.id = job.organization_id
left join public.service_locations location on location.id = job.service_location_id
left join public.profiles crew on crew.id = job.assigned_crew_user_id
left join public.lead_sources lead_source on lead_source.id = job.lead_source_id

union all

select
  'quote', quote.id, quote.status, quote.total_cents,
  quote.archived_at, quote.created_at, null::text,
  lower(concat_ws(' ',
    quote.id::text,
    quote.quote_number,
    quote.status,
    quote.total_cents::text,
    (quote.total_cents::numeric / 100)::text,
    customer.display_name,
    customer.phone,
    regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g'),
    customer.email,
    organization.name,
    organization.billing_phone,
    organization.billing_email,
    location.street,
    location.city,
    location.state,
    location.postal_code,
    quote.job_id::text,
    job.service_type,
    job.requested_scope
  ))
from public.quotes quote
left join public.customers customer on customer.id = quote.customer_id
left join public.organizations organization on organization.id = quote.organization_id
left join public.service_locations location on location.id = quote.service_location_id
left join public.jobs job on job.id = quote.job_id

union all

select
  'invoice', invoice.id, invoice.status, invoice.total_cents,
  invoice.archived_at, invoice.created_at, null::text,
  lower(concat_ws(' ',
    invoice.id::text,
    invoice.invoice_number,
    invoice.status,
    invoice.total_cents::text,
    (invoice.total_cents::numeric / 100)::text,
    invoice.balance_due_cents::text,
    customer.display_name,
    customer.phone,
    regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g'),
    customer.email,
    customer.billing_address,
    organization.name,
    organization.billing_phone,
    organization.billing_email,
    organization.billing_address,
    location.street,
    location.city,
    location.state,
    location.postal_code,
    invoice.job_id::text,
    job.service_type,
    job.requested_scope,
    invoice.quote_id::text,
    quote.quote_number
  ))
from public.invoices invoice
left join public.customers customer on customer.id = invoice.customer_id
left join public.organizations organization on organization.id = invoice.organization_id
left join public.service_locations location on location.id = invoice.service_location_id
left join public.jobs job on job.id = invoice.job_id
left join public.quotes quote on quote.id = invoice.quote_id

union all

select
  'schedule_event', event.id, event.status, null::integer,
  job.archived_at, event.created_at, event.event_type,
  lower(concat_ws(' ',
    event.id::text,
    event.title,
    event.event_type,
    event.status,
    event.location_label,
    customer.display_name,
    customer.phone,
    organization.name,
    location.street,
    location.city,
    location.state,
    location.postal_code,
    job.service_type,
    job.requested_scope
  ))
from public.schedule_events event
left join public.jobs job on job.id = event.job_id
left join public.customers customer on customer.id = job.customer_id
left join public.organizations organization on organization.id = job.organization_id
left join public.service_locations location on location.id = event.service_location_id

union all

select
  'appointment', appointment.id, appointment.status, null::integer,
  job.archived_at, appointment.created_at, appointment.appointment_type,
  lower(concat_ws(' ',
    appointment.id::text,
    appointment.calendar_notes,
    appointment.appointment_type,
    appointment.status,
    customer.display_name,
    customer.phone,
    organization.name,
    location.street,
    location.city,
    location.state,
    location.postal_code,
    job.service_type,
    job.requested_scope
  ))
from public.appointments appointment
left join public.jobs job on job.id = appointment.job_id
left join public.customers customer on customer.id = job.customer_id
left join public.organizations organization on organization.id = job.organization_id
left join public.service_locations location on location.id = appointment.service_location_id;

revoke all on table public.admin_record_search from public, anon;
grant select on table public.admin_record_search to authenticated, service_role;

create or replace view public.job_operations_search_index
with (security_invoker = true)
as
select operation.*, job.archived_at, job.archived_by_user_id, search.search_text as expanded_search_text
from public.job_operations_index operation
join public.jobs job on job.id = operation.id
join public.admin_record_search search on search.record_type = 'job' and search.record_id = operation.id;

revoke all on table public.job_operations_search_index from public, anon;
grant select on table public.job_operations_search_index to authenticated, service_role;
