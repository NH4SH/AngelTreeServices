-- Business reporting and estimated job-profitability inputs.
--
-- This migration deliberately stores explicit classifications and direct-cost
-- inputs. It does not infer historical service categories, invent wage rates,
-- or expose a broad public reporting RPC.

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  category_key text not null unique,
  label text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.service_categories (category_key, label, sort_order)
values
  ('tree_removal', 'Tree removal', 10),
  ('tree_pruning', 'Tree pruning', 20),
  ('stump_grinding', 'Stump grinding', 30),
  ('storm_cleanup', 'Storm cleanup', 40),
  ('emergency_service', 'Emergency service', 50),
  ('cabling_bracing', 'Cabling / bracing', 60),
  ('tree_health', 'Tree health / arborist consultation', 70),
  ('lot_clearing', 'Lot clearing', 80),
  ('brush_removal', 'Brush removal', 90),
  ('landscaping', 'Landscaping', 100),
  ('mulch', 'Mulch', 110),
  ('lawn_care', 'Lawn care', 120),
  ('other', 'Other', 900)
on conflict (category_key) do nothing;

insert into public.lead_sources (name, source_type)
values
  ('Google search', 'google'),
  ('Google Business Profile', 'google'),
  ('Website form', 'website'),
  ('Phone call', 'phone'),
  ('Repeat customer', 'repeat_customer'),
  ('Customer referral', 'referral'),
  ('HOA', 'referral'),
  ('Facebook', 'social'),
  ('Instagram', 'social'),
  ('Nextdoor', 'social'),
  ('Truck / signage', 'other'),
  ('Yard sign', 'other'),
  ('Direct mail', 'other'),
  ('Commercial relationship', 'referral'),
  ('Insurance referral', 'referral'),
  ('Other', 'other')
on conflict (name) do nothing;

alter table public.quote_line_items
  add column service_category_id uuid references public.service_categories(id) on delete set null;

alter table public.invoice_line_items
  add column service_category_id uuid references public.service_categories(id) on delete set null;

alter table public.quotes
  add column estimator_user_id uuid references public.profiles(id) on delete set null;

alter table public.customers
  add column lead_campaign text;

alter table public.jobs
  add column lead_campaign text;

create table public.reporting_settings (
  singleton_key boolean primary key default true check (singleton_key),
  business_timezone text not null default 'America/New_York',
  draft_quote_stale_days integer not null default 3 check (draft_quote_stale_days > 0),
  sent_quote_stale_days integer not null default 7 check (sent_quote_stale_days > 0),
  lead_stale_business_days integer not null default 1 check (lead_stale_business_days > 0),
  default_labor_burden_percent numeric(6,3) check (
    default_labor_burden_percent is null
    or default_labor_burden_percent between 0 and 500
  ),
  blended_labor_cost_cents integer check (
    blended_labor_cost_cents is null or blended_labor_cost_cents >= 0
  ),
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.reporting_settings (singleton_key)
values (true)
on conflict (singleton_key) do nothing;

create table public.employee_labor_cost_rates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee_records(id) on delete restrict,
  hourly_cost_cents integer not null check (hourly_cost_cents >= 0),
  burden_percent numeric(6,3) check (burden_percent is null or burden_percent between 0 and 500),
  effective_from date not null,
  effective_to date,
  notes text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_labor_rate_date_order check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint employee_labor_rate_start_unique unique (employee_id, effective_from)
);

create table public.job_cost_entries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  category text not null check (category in (
    'materials', 'disposal', 'subcontractor', 'equipment_rental', 'crane',
    'fuel', 'permit', 'travel', 'other'
  )),
  description text not null,
  vendor_name text,
  amount_cents integer not null check (amount_cents >= 0),
  incurred_on date not null default current_date,
  notes text,
  receipt_storage_path text,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  submitted_by_user_id uuid not null references public.profiles(id) on delete restrict,
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  supersedes_cost_id uuid references public.job_cost_entries(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_cost_review_consistency check (
    (review_status = 'pending' and reviewed_at is null and reviewed_by_user_id is null)
    or (review_status in ('approved', 'rejected') and reviewed_at is not null and reviewed_by_user_id is not null)
  ),
  constraint job_cost_correction_note check (
    supersedes_cost_id is null or nullif(btrim(notes), '') is not null
  )
);

create table public.job_equipment_usage (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  asset_id uuid not null references public.equipment_assets(id) on delete restrict,
  usage_date date not null default current_date,
  usage_hours numeric(10,2) check (usage_hours is null or usage_hours >= 0),
  usage_days numeric(10,2) check (usage_days is null or usage_days >= 0),
  hourly_cost_cents_snapshot integer check (hourly_cost_cents_snapshot is null or hourly_cost_cents_snapshot >= 0),
  daily_cost_cents_snapshot integer check (daily_cost_cents_snapshot is null or daily_cost_cents_snapshot >= 0),
  calculated_cost_cents integer not null default 0 check (calculated_cost_cents >= 0),
  notes text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_equipment_usage_amount check (usage_hours is not null or usage_days is not null)
);

alter table public.equipment_asset_costs
  add column internal_hourly_cost_cents integer check (
    internal_hourly_cost_cents is null or internal_hourly_cost_cents >= 0
  ),
  add column internal_daily_cost_cents integer check (
    internal_daily_cost_cents is null or internal_daily_cost_cents >= 0
  );

create trigger service_categories_set_updated_at before update on public.service_categories
  for each row execute function public.set_updated_at();
create trigger reporting_settings_set_updated_at before update on public.reporting_settings
  for each row execute function public.set_updated_at();
create trigger employee_labor_cost_rates_set_updated_at before update on public.employee_labor_cost_rates
  for each row execute function public.set_updated_at();
create trigger job_cost_entries_set_updated_at before update on public.job_cost_entries
  for each row execute function public.set_updated_at();
create trigger job_equipment_usage_set_updated_at before update on public.job_equipment_usage
  for each row execute function public.set_updated_at();

create index quotes_created_status_idx on public.quotes(created_at, status);
create index quotes_sent_status_idx on public.quotes(sent_at, status) where sent_at is not null;
create index quotes_approved_status_idx on public.quotes(approved_at, status) where approved_at is not null;
create index quotes_estimator_idx on public.quotes(estimator_user_id, created_at desc);
create index quote_line_items_category_idx on public.quote_line_items(service_category_id, quote_id);
create index invoice_line_items_category_idx on public.invoice_line_items(service_category_id, invoice_id);
create index invoices_created_status_idx on public.invoices(created_at, status);
create index invoices_due_status_idx on public.invoices(due_at, status) where due_at is not null;
create index invoices_paid_idx on public.invoices(paid_at) where paid_at is not null;
create index payments_paid_status_idx on public.payments(paid_at, status) where paid_at is not null;
create index jobs_created_status_idx on public.jobs(created_at, status);
create index jobs_completed_status_idx on public.jobs(completed_at, status) where completed_at is not null;
create index jobs_lead_source_idx on public.jobs(lead_source_id, created_at desc);
create index jobs_assigned_crew_idx on public.jobs(assigned_crew_user_id, created_at desc);
create index service_locations_area_idx on public.service_locations(state, city, postal_code);
create index time_entries_job_clock_idx on public.time_entries(job_id, clock_in_at);
create index time_entries_user_clock_idx on public.time_entries(user_id, clock_in_at);
create index employee_labor_rates_effective_idx on public.employee_labor_cost_rates(employee_id, effective_from desc, effective_to);
create index job_cost_entries_job_status_idx on public.job_cost_entries(job_id, review_status, incurred_on desc) where archived_at is null;
create index job_cost_entries_date_idx on public.job_cost_entries(incurred_on, category) where archived_at is null;
create index job_equipment_usage_job_idx on public.job_equipment_usage(job_id, usage_date desc);
create index equipment_maintenance_reporting_idx on public.equipment_maintenance_records(completed_at, status, asset_id) where completed_at is not null;

create or replace function app_private.has_financial_reporting_role()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin')
  );
$$;

create or replace function app_private.can_submit_job_cost(p_job_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select app_private.has_financial_reporting_role()
    or exists (
      select 1
      from public.jobs job
      where job.id = p_job_id
        and job.assigned_crew_user_id = (select auth.uid())
    );
$$;

revoke all on function app_private.has_financial_reporting_role() from public, anon, authenticated, service_role;
revoke all on function app_private.can_submit_job_cost(uuid) from public, anon, authenticated, service_role;
grant execute on function app_private.has_financial_reporting_role() to authenticated, service_role;
grant execute on function app_private.can_submit_job_cost(uuid) to authenticated, service_role;

alter table public.service_categories enable row level security;
alter table public.reporting_settings enable row level security;
alter table public.employee_labor_cost_rates enable row level security;
alter table public.job_cost_entries enable row level security;
alter table public.job_equipment_usage enable row level security;

grant select on public.service_categories to authenticated, service_role;
grant insert, update on public.service_categories to authenticated, service_role;
grant select, update on public.reporting_settings to authenticated, service_role;
grant select, insert, update on public.employee_labor_cost_rates to authenticated, service_role;
grant select, insert, update on public.job_cost_entries to authenticated, service_role;
grant select, insert, update on public.job_equipment_usage to authenticated, service_role;

create policy "Staff read service categories" on public.service_categories for select to authenticated
  using (app_private.has_staff_role());
create policy "Admins manage service categories" on public.service_categories for all to authenticated
  using (app_private.has_platform_admin_role()) with check (app_private.has_platform_admin_role());

create policy "Staff read reporting settings" on public.reporting_settings for select to authenticated
  using (app_private.has_staff_role());
create policy "Admins update reporting settings" on public.reporting_settings for update to authenticated
  using (app_private.has_platform_admin_role()) with check (app_private.has_platform_admin_role());

create policy "Financial roles manage labor cost rates" on public.employee_labor_cost_rates for all to authenticated
  using (app_private.has_financial_reporting_role()) with check (app_private.has_financial_reporting_role());

create policy "Financial roles manage job costs" on public.job_cost_entries for all to authenticated
  using (app_private.has_financial_reporting_role()) with check (app_private.has_financial_reporting_role());
create policy "Crew read own submitted costs" on public.job_cost_entries for select to authenticated
  using (submitted_by_user_id = (select auth.uid()));
create policy "Assigned crew submit pending costs" on public.job_cost_entries for insert to authenticated
  with check (
    submitted_by_user_id = (select auth.uid())
    and review_status = 'pending'
    and reviewed_by_user_id is null
    and reviewed_at is null
    and app_private.can_submit_job_cost(job_id)
  );

create policy "Financial roles manage equipment usage" on public.job_equipment_usage for all to authenticated
  using (app_private.has_financial_reporting_role()) with check (app_private.has_financial_reporting_role());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-cost-receipts',
  'job-cost-receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function app_private.can_access_job_cost_receipt(object_name text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select app_private.has_financial_reporting_role()
    or exists (
      select 1
      from public.job_cost_entries cost
      where cost.receipt_storage_path = object_name
        and cost.submitted_by_user_id = (select auth.uid())
    );
$$;

create or replace function app_private.can_upload_job_cost_receipt(object_name text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and split_part(object_name, '/', 2) = (select auth.uid())::text
    then app_private.can_submit_job_cost(split_part(object_name, '/', 1)::uuid)
    else false
  end;
$$;

revoke all on function app_private.can_access_job_cost_receipt(text) from public, anon, authenticated, service_role;
revoke all on function app_private.can_upload_job_cost_receipt(text) from public, anon, authenticated, service_role;
grant execute on function app_private.can_access_job_cost_receipt(text) to authenticated, service_role;
grant execute on function app_private.can_upload_job_cost_receipt(text) to authenticated, service_role;

create policy "Authorized users read job cost receipts" on storage.objects for select to authenticated
  using (bucket_id = 'job-cost-receipts' and app_private.can_access_job_cost_receipt(name));
create policy "Authorized users upload job cost receipts" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-cost-receipts'
    and app_private.can_upload_job_cost_receipt(name)
  );
create policy "Authorized users remove job cost receipts" on storage.objects for delete to authenticated
  using (
    bucket_id = 'job-cost-receipts'
    and (
      app_private.has_financial_reporting_role()
      or split_part(name, '/', 2) = (select auth.uid())::text
    )
  );

comment on table public.service_categories is 'Explicit service classifications for reporting; null line-item categories remain uncategorized.';
comment on table public.employee_labor_cost_rates is 'Restricted historical operational labor cost rates used only for estimated job profitability.';
comment on table public.job_cost_entries is 'Private direct job costs. Crew submissions remain pending until financial review.';
comment on table public.reporting_settings is 'Owner-controlled business timezone, stalled-work thresholds, and optional estimated-cost defaults.';
