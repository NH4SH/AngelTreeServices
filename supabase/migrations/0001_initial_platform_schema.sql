-- Angel Tree Services Phase 2 platform foundation.
-- This migration creates the core relational model and enables Row Level Security.
-- It intentionally inserts no real customer data.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  user_type text not null default 'customer' check (user_type in ('owner', 'admin', 'estimator', 'crew', 'customer', 'property_manager')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_type text not null default 'property_manager' check (organization_type in ('property_manager', 'hoa', 'commercial', 'other')),
  billing_email text,
  billing_phone text,
  billing_address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source_type text not null default 'manual' check (source_type in ('website', 'phone', 'referral', 'google', 'social', 'repeat_customer', 'manual', 'other')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  lead_source_id uuid references public.lead_sources(id) on delete set null,
  display_name text not null,
  customer_type text not null default 'residential' check (customer_type in ('residential', 'commercial', 'property_manager', 'hoa')),
  primary_contact_name text,
  email text,
  phone text,
  billing_address text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_locations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  label text,
  street text not null,
  city text not null,
  state text not null default 'VA',
  postal_code text,
  access_notes text,
  gate_code text,
  service_notes text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_location_id uuid not null references public.service_locations(id) on delete restrict,
  lead_source_id uuid references public.lead_sources(id) on delete set null,
  assigned_crew_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'new_lead' check (
    status in (
      'new_lead',
      'estimate_scheduled',
      'quoted',
      'accepted',
      'scheduled',
      'in_progress',
      'completed',
      'invoiced',
      'paid',
      'lost',
      'cancelled'
    )
  ),
  service_type text,
  requested_scope text,
  internal_notes text,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  completed_at timestamptz,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  uploaded_by_user_id uuid references public.profiles(id) on delete set null,
  photo_type text not null default 'job' check (photo_type in ('before', 'after', 'customer_upload', 'estimate', 'job', 'issue')),
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  service_location_id uuid references public.service_locations(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  author_user_id uuid references public.profiles(id) on delete set null,
  visibility text not null default 'internal' check (visibility in ('internal', 'customer_visible', 'crew_visible')),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_has_subject check (
    customer_id is not null
    or service_location_id is not null
    or job_id is not null
  )
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'change_requested', 'expired', 'declined', 'cancelled')),
  quote_number text unique,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  customer_message text,
  approved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  name text not null,
  description text,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  quote_id uuid references public.quotes(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'sent', 'partially_paid', 'paid', 'void', 'overdue')),
  invoice_number text unique,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  balance_due_cents integer not null default 0 check (balance_due_cents >= 0),
  due_at timestamptz,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  name text not null,
  description text,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  payment_method text,
  provider text,
  provider_payment_id text,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded', 'cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  service_location_id uuid not null references public.service_locations(id) on delete restrict,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  appointment_type text not null default 'estimate' check (appointment_type in ('estimate', 'job', 'follow_up', 'maintenance', 'other')),
  status text not null default 'scheduled' check (status in ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  calendar_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  role_title text,
  receives_invoices boolean not null default false,
  receives_job_updates boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  subject_type text not null,
  subject_id uuid not null,
  event_type text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger roles_set_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger lead_sources_set_updated_at before update on public.lead_sources for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger service_locations_set_updated_at before update on public.service_locations for each row execute function public.set_updated_at();
create trigger jobs_set_updated_at before update on public.jobs for each row execute function public.set_updated_at();
create trigger job_photos_set_updated_at before update on public.job_photos for each row execute function public.set_updated_at();
create trigger notes_set_updated_at before update on public.notes for each row execute function public.set_updated_at();
create trigger quotes_set_updated_at before update on public.quotes for each row execute function public.set_updated_at();
create trigger quote_line_items_set_updated_at before update on public.quote_line_items for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices for each row execute function public.set_updated_at();
create trigger invoice_line_items_set_updated_at before update on public.invoice_line_items for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger appointments_set_updated_at before update on public.appointments for each row execute function public.set_updated_at();
create trigger organization_contacts_set_updated_at before update on public.organization_contacts for each row execute function public.set_updated_at();

create index customers_organization_id_idx on public.customers(organization_id);
create index customers_lead_source_id_idx on public.customers(lead_source_id);
create index service_locations_customer_id_idx on public.service_locations(customer_id);
create index jobs_customer_id_idx on public.jobs(customer_id);
create index jobs_service_location_id_idx on public.jobs(service_location_id);
create index jobs_status_idx on public.jobs(status);
create index job_photos_job_id_idx on public.job_photos(job_id);
create index notes_job_id_idx on public.notes(job_id);
create index quotes_job_id_idx on public.quotes(job_id);
create index quote_line_items_quote_id_idx on public.quote_line_items(quote_id);
create index invoices_customer_id_idx on public.invoices(customer_id);
create index invoices_job_id_idx on public.invoices(job_id);
create index invoice_line_items_invoice_id_idx on public.invoice_line_items(invoice_id);
create index payments_invoice_id_idx on public.payments(invoice_id);
create index appointments_job_id_idx on public.appointments(job_id);
create index organization_contacts_organization_id_idx on public.organization_contacts(organization_id);
create index activity_log_subject_idx on public.activity_log(subject_type, subject_id);

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.organizations enable row level security;
alter table public.lead_sources enable row level security;
alter table public.customers enable row level security;
alter table public.service_locations enable row level security;
alter table public.jobs enable row level security;
alter table public.job_photos enable row level security;
alter table public.notes enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.payments enable row level security;
alter table public.appointments enable row level security;
alter table public.organization_contacts enable row level security;
alter table public.activity_log enable row level security;

create or replace function public.has_staff_role()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name in ('owner', 'admin', 'estimator')
  );
$$;

-- Conservative starter policies:
-- - Users can read only their own profile.
-- - Staff CRM access is closed until roles are explicitly created and assigned by a service role or SQL admin.
-- Future policies should add customer portal access, crew assigned-job access, and organization contact scoping.

create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "Staff can manage profiles"
  on public.profiles
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage roles"
  on public.roles
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage user roles"
  on public.user_roles
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage organizations"
  on public.organizations
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage lead sources"
  on public.lead_sources
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage customers"
  on public.customers
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage service locations"
  on public.service_locations
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage jobs"
  on public.jobs
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage job photos"
  on public.job_photos
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage notes"
  on public.notes
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage quotes"
  on public.quotes
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage quote line items"
  on public.quote_line_items
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage invoices"
  on public.invoices
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage invoice line items"
  on public.invoice_line_items
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage payments"
  on public.payments
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage appointments"
  on public.appointments
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can manage organization contacts"
  on public.organization_contacts
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

create policy "Staff can read activity log"
  on public.activity_log
  for select
  to authenticated
  using (public.has_staff_role());

create policy "Staff can create activity log entries"
  on public.activity_log
  for insert
  to authenticated
  with check (public.has_staff_role());
