-- Change orders and organization workflow parity.
--
-- Approved quote rows remain untouched. Additional scope is stored separately,
-- applied to work orders idempotently, and copied to invoices only through an
-- explicit staff action. Public portal reads continue through server-side token
-- lookup; anon receives no table privileges.

alter table public.organizations
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  add column if not exists payment_terms text,
  add column if not exists tax_exempt boolean not null default false,
  add column if not exists tax_reference text;

alter table public.organizations drop constraint if exists organizations_organization_type_check;
alter table public.organizations add constraint organizations_organization_type_check check (organization_type in (
  'property_manager', 'hoa', 'commercial', 'nonprofit', 'church', 'municipality',
  'general_contractor', 'apartment_community', 'real_estate', 'other'
));

alter table public.organization_contacts
  add column if not exists contact_roles text[] not null default '{}'::text[],
  add column if not exists preferred_contact_method text
    check (preferred_contact_method is null or preferred_contact_method in ('email', 'phone', 'text', 'other')),
  add column if not exists is_active boolean not null default true,
  add column if not exists notes text,
  add column if not exists service_location_id uuid references public.service_locations(id) on delete set null;

alter table public.service_locations alter column customer_id drop not null;
alter table public.service_locations drop constraint if exists service_locations_has_owner;
alter table public.service_locations add constraint service_locations_has_owner
  check (customer_id is not null or organization_id is not null);

alter table public.quotes
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists recipient_contact_id uuid references public.organization_contacts(id) on delete set null,
  add column if not exists approval_contact_id uuid references public.organization_contacts(id) on delete set null,
  add column if not exists purchase_order_reference text,
  add column if not exists payment_terms text;

alter table public.jobs
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists onsite_contact_id uuid references public.organization_contacts(id) on delete set null,
  add column if not exists property_manager_contact_id uuid references public.organization_contacts(id) on delete set null,
  add column if not exists projected_value_cents integer not null default 0
    check (projected_value_cents >= 0);

alter table public.invoices
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists service_location_id uuid references public.service_locations(id) on delete set null,
  add column if not exists billing_contact_id uuid references public.organization_contacts(id) on delete set null,
  add column if not exists accounts_payable_contact_id uuid references public.organization_contacts(id) on delete set null,
  add column if not exists purchase_order_reference text,
  add column if not exists payment_terms text;

update public.quotes q
set organization_id = c.organization_id
from public.customers c
where q.customer_id = c.id
  and q.organization_id is null
  and c.organization_id is not null;

update public.jobs j
set organization_id = c.organization_id
from public.customers c
where j.customer_id = c.id
  and j.organization_id is null
  and c.organization_id is not null;

update public.invoices i
set organization_id = c.organization_id,
    service_location_id = j.service_location_id
from public.customers c, public.jobs j
where i.customer_id = c.id
  and i.job_id = j.id
  and (i.organization_id is null or i.service_location_id is null);

update public.jobs j
set projected_value_cents = q.total_cents
from public.quotes q
where q.id = j.source_quote_id
  and q.status = 'approved'
  and j.projected_value_cents = 0;

create index if not exists quotes_organization_id_idx on public.quotes(organization_id);
create index if not exists jobs_organization_id_idx on public.jobs(organization_id);
create index if not exists invoices_organization_id_idx on public.invoices(organization_id);
create index if not exists organization_contacts_roles_idx on public.organization_contacts using gin(contact_roles);
create index if not exists organization_contacts_service_location_idx on public.organization_contacts(service_location_id);

create sequence if not exists public.change_order_number_seq;

create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  change_order_number text not null unique,
  source_quote_id uuid references public.quotes(id) on delete set null,
  job_id uuid references public.jobs(id) on delete restrict,
  source_closeout_id uuid references public.job_closeouts(id) on delete set null,
  customer_id uuid references public.customers(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  service_location_id uuid references public.service_locations(id) on delete restrict,
  requested_by_contact_id uuid references public.organization_contacts(id) on delete set null,
  approval_contact_id uuid references public.organization_contacts(id) on delete set null,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  internally_reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  approved_by_contact_id uuid references public.organization_contacts(id) on delete set null,
  approved_by_name text,
  approval_recorded_by_user_id uuid references public.profiles(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  title text not null,
  reason text,
  customer_description text,
  customer_notes text,
  internal_notes text,
  status text not null default 'draft' check (status in (
    'draft', 'pending_internal_review', 'ready_to_send', 'sent', 'approved',
    'declined', 'change_requested', 'cancelled', 'expired'
  )),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  fee_cents integer not null default 0 check (fee_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  original_approved_amount_cents integer not null default 0 check (original_approved_amount_cents >= 0),
  expires_at timestamptz,
  internally_reviewed_at timestamptz,
  sent_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  applied_to_job_at timestamptz,
  approval_method text check (approval_method is null or approval_method in ('portal', 'phone', 'email', 'in_person', 'signed_paper', 'other')),
  approval_notes text,
  schedule_impact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint change_order_has_source check (job_id is not null or source_quote_id is not null),
  constraint change_order_has_owner check (customer_id is not null or organization_id is not null),
  constraint change_order_total_matches check (total_cents = subtotal_cents + tax_cents + fee_cents)
);

create table public.change_order_line_items (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.change_orders(id) on delete cascade,
  service_category_id uuid references public.service_categories(id) on delete set null,
  material_id uuid references public.material_catalog(id) on delete set null,
  title text not null,
  description text,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit text,
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  internal_cost_estimate_cents integer check (internal_cost_estimate_cents is null or internal_cost_estimate_cents >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_change_order_scope_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  change_order_id uuid not null references public.change_orders(id) on delete restrict,
  change_order_line_item_id uuid not null references public.change_order_line_items(id) on delete restrict,
  title text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint job_change_order_scope_line_unique unique (change_order_line_item_id)
);

create table public.change_order_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  change_order_id uuid not null references public.change_orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  intended_contact_id uuid references public.organization_contacts(id) on delete set null,
  token_hash text not null unique,
  token_hint text,
  token_encrypted text,
  expires_at timestamptz,
  viewed_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoice_line_items
  add column if not exists source_change_order_line_item_id uuid
    references public.change_order_line_items(id) on delete set null;

alter table public.job_material_requirements
  add column if not exists source_change_order_line_item_id uuid
    references public.change_order_line_items(id) on delete set null;

alter table public.job_closeouts
  add column if not exists change_order_id uuid references public.change_orders(id) on delete set null;

alter table public.email_events
  add column if not exists related_change_order_id uuid references public.change_orders(id) on delete set null;

alter table public.email_events
  drop constraint if exists email_events_email_type_check;

alter table public.email_events
  add constraint email_events_email_type_check check (email_type in (
    'access_request_admin_notice', 'access_approved', 'access_rejected', 'lead_internal_notice',
    'quote', 'invoice', 'change_order', 'password_reset_admin_triggered',
    'estimate_confirmation', 'estimate_reminder', 'quote_follow_up', 'work_confirmation',
    'work_reminder', 'invoice_payment_reminder', 'overdue_invoice_reminder', 'payment_confirmation'
  ));

create index change_orders_job_idx on public.change_orders(job_id, created_at desc);
create index change_orders_quote_idx on public.change_orders(source_quote_id);
create unique index change_orders_source_closeout_unique_idx on public.change_orders(source_closeout_id)
  where source_closeout_id is not null;
create index change_orders_customer_idx on public.change_orders(customer_id);
create index change_orders_organization_idx on public.change_orders(organization_id);
create index change_orders_status_idx on public.change_orders(status, created_at desc);
create index change_order_line_items_order_idx on public.change_order_line_items(change_order_id, sort_order);
create index change_order_portal_tokens_order_idx on public.change_order_portal_tokens(change_order_id, created_at desc);
create index change_order_portal_tokens_active_idx on public.change_order_portal_tokens(change_order_id)
  where revoked_at is null;
create index job_change_order_scope_items_job_idx on public.job_change_order_scope_items(job_id, change_order_id, sort_order);
create unique index invoice_line_items_change_order_source_unique_idx
  on public.invoice_line_items(source_change_order_line_item_id)
  where source_change_order_line_item_id is not null;
create unique index job_material_requirements_change_order_source_unique_idx
  on public.job_material_requirements(job_id, source_change_order_line_item_id)
  where source_change_order_line_item_id is not null;
create index email_events_related_change_order_idx on public.email_events(related_change_order_id);

create trigger change_orders_set_updated_at before update on public.change_orders
  for each row execute function public.set_updated_at();
create trigger change_order_line_items_set_updated_at before update on public.change_order_line_items
  for each row execute function public.set_updated_at();
create trigger change_order_portal_tokens_set_updated_at before update on public.change_order_portal_tokens
  for each row execute function public.set_updated_at();

alter table public.change_orders enable row level security;
alter table public.change_order_line_items enable row level security;
alter table public.job_change_order_scope_items enable row level security;
alter table public.change_order_portal_tokens enable row level security;

revoke all on table public.change_orders from anon;
revoke all on table public.change_order_line_items from anon;
revoke all on table public.job_change_order_scope_items from anon;
revoke all on table public.change_order_portal_tokens from anon;
grant select, insert, update, delete on table public.change_orders to authenticated, service_role;
grant select, insert, update, delete on table public.change_order_line_items to authenticated, service_role;
grant select, insert, update, delete on table public.job_change_order_scope_items to authenticated, service_role;
grant select, insert, update, delete on table public.change_order_portal_tokens to authenticated, service_role;
grant usage, select on sequence public.change_order_number_seq to authenticated, service_role;

create policy "Staff can manage change orders" on public.change_orders
  for all to authenticated
  using (app_private.has_staff_role())
  with check (app_private.has_staff_role());
create policy "Staff can manage change order lines" on public.change_order_line_items
  for all to authenticated
  using (app_private.has_staff_role())
  with check (app_private.has_staff_role());
create policy "Staff can manage applied change order scope" on public.job_change_order_scope_items
  for all to authenticated
  using (app_private.has_staff_role())
  with check (app_private.has_staff_role());
create policy "Staff can manage change order portal tokens" on public.change_order_portal_tokens
  for all to authenticated
  using (app_private.has_staff_role())
  with check (app_private.has_staff_role());

create or replace function app_private.assign_change_order_number()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.change_order_number is null or pg_catalog.btrim(new.change_order_number) = '' then
    new.change_order_number := 'CO-' || pg_catalog.to_char(current_date, 'YYYY') || '-' ||
      pg_catalog.lpad(pg_catalog.nextval('public.change_order_number_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

create trigger assign_change_order_number
  before insert on public.change_orders
  for each row execute function app_private.assign_change_order_number();

create or replace function public.create_or_get_change_order_portal_token(
  p_change_order_id uuid,
  p_token_hash text,
  p_token_hint text,
  p_token_encrypted text,
  p_expires_at timestamptz
)
returns table (id uuid, token_encrypted text, expires_at timestamptz, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_token record;
  target record;
begin
  if not app_private.has_staff_role() then
    raise exception 'Only staff can manage change order portal links.';
  end if;

  select co.customer_id, co.organization_id, co.approval_contact_id
  into target
  from public.change_orders co
  where co.id = p_change_order_id
  for update;

  if not found then
    raise exception 'Change order not found or no access.';
  end if;

  select t.id, t.token_encrypted, t.expires_at
  into existing_token
  from public.change_order_portal_tokens t
  where t.change_order_id = p_change_order_id
    and t.revoked_at is null
    and (t.expires_at is null or t.expires_at > pg_catalog.now())
  order by t.created_at desc
  limit 1;

  if found then
    return query select existing_token.id, existing_token.token_encrypted, existing_token.expires_at, false;
    return;
  end if;

  return query
  with inserted as (
    insert into public.change_order_portal_tokens (
      change_order_id, customer_id, organization_id, intended_contact_id,
      token_hash, token_hint, token_encrypted, expires_at, created_by_user_id
    ) values (
      p_change_order_id, target.customer_id, target.organization_id, target.approval_contact_id,
      p_token_hash, p_token_hint, p_token_encrypted, p_expires_at, (select auth.uid())
    )
    returning change_order_portal_tokens.id,
      change_order_portal_tokens.token_encrypted,
      change_order_portal_tokens.expires_at
  )
  select inserted.id, inserted.token_encrypted, inserted.expires_at, true from inserted;
end;
$$;

create or replace function public.approve_change_order(
  p_change_order_id uuid,
  p_approved_by_name text,
  p_approved_by_contact_id uuid default null,
  p_approval_method text default 'portal',
  p_recorded_by_user_id uuid default null,
  p_approval_notes text default null
)
returns table (change_order_id uuid, job_id uuid, newly_approved boolean, applied_scope_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.change_orders%rowtype;
  was_new boolean := false;
  inserted_count integer := 0;
  approved_time timestamptz := pg_catalog.now();
begin
  if (select auth.uid()) is not null and not app_private.has_staff_role() then
    raise exception 'Only staff or a validated portal workflow can approve a change order.';
  end if;
  if p_approval_method not in ('portal', 'phone', 'email', 'in_person', 'signed_paper', 'other') then
    raise exception 'Choose a valid approval method.';
  end if;
  if pg_catalog.btrim(pg_catalog.coalesce(p_approved_by_name, '')) = '' then
    raise exception 'Approver name is required.';
  end if;

  select * into target from public.change_orders
  where id = p_change_order_id
  for update;
  if not found then raise exception 'Change order not found.'; end if;
  if target.job_id is null then raise exception 'Link a work order before approval.'; end if;
  if target.status in ('declined', 'cancelled', 'expired') then
    raise exception 'This change order is closed.';
  end if;

  was_new := target.approved_at is null;
  if was_new then
    update public.change_orders set
      status = 'approved',
      approved_at = approved_time,
      approved_by_name = pg_catalog.left(pg_catalog.btrim(p_approved_by_name), 160),
      approved_by_contact_id = p_approved_by_contact_id,
      approval_method = p_approval_method,
      approval_recorded_by_user_id = p_recorded_by_user_id,
      approval_notes = pg_catalog.nullif(pg_catalog.left(pg_catalog.btrim(pg_catalog.coalesce(p_approval_notes, '')), 2000), '')
    where id = p_change_order_id;
  end if;

  insert into public.job_change_order_scope_items (
    job_id, change_order_id, change_order_line_item_id, title, description, sort_order
  )
  select target.job_id, li.change_order_id, li.id, li.title, li.description, li.sort_order
  from public.change_order_line_items li
  where li.change_order_id = p_change_order_id
  on conflict (change_order_line_item_id) do nothing;
  get diagnostics inserted_count = row_count;

  update public.change_orders
  set applied_to_job_at = pg_catalog.coalesce(applied_to_job_at, approved_time)
  where id = p_change_order_id;

  update public.jobs j
  set projected_value_cents =
    pg_catalog.coalesce((select q.total_cents from public.quotes q where q.id = j.source_quote_id and q.status = 'approved'), 0)
    + pg_catalog.coalesce((select pg_catalog.sum(co.total_cents) from public.change_orders co where co.job_id = j.id and co.status = 'approved'), 0)
  where j.id = target.job_id;

  if was_new then
    insert into public.activity_log (actor_user_id, subject_type, subject_id, event_type, metadata_json)
    values (p_recorded_by_user_id, 'change_order', p_change_order_id, 'change_order_approved',
      pg_catalog.jsonb_build_object('approval_method', p_approval_method, 'job_id', target.job_id));
  end if;

  return query select p_change_order_id, target.job_id, was_new, inserted_count;
end;
$$;

create or replace function public.attach_approved_change_orders_to_invoice(p_invoice_id uuid)
returns table (added_line_count integer, added_change_order_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.invoices%rowtype;
  line_count integer := 0;
  order_count integer := 0;
begin
  if not app_private.has_staff_role() then
    raise exception 'Only staff can add approved change orders to invoices.';
  end if;
  select * into target from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if target.status <> 'draft' then
    raise exception 'Only a draft invoice can be updated. Create a supplemental draft for later approved work.';
  end if;

  insert into public.invoice_line_items (
    invoice_id, name, description, service_category_id, material_id, quantity,
    unit_price_cents, total_cents, sort_order, source_change_order_line_item_id
  )
  select target.id, li.title, li.description, li.service_category_id, li.material_id,
    li.quantity, li.unit_price_cents, li.amount_cents,
    1000 + pg_catalog.row_number() over (order by co.created_at, li.sort_order)::integer,
    li.id
  from public.change_orders co
  join public.change_order_line_items li on li.change_order_id = co.id
  where co.job_id = target.job_id
    and co.status = 'approved'
    and co.invoice_id is null
  on conflict (source_change_order_line_item_id) where source_change_order_line_item_id is not null do nothing;
  get diagnostics line_count = row_count;

  update public.change_orders co
  set invoice_id = target.id
  where co.job_id = target.job_id
    and co.status = 'approved'
    and co.invoice_id is null
    and not exists (
      select 1 from public.change_order_line_items li
      where li.change_order_id = co.id
        and not exists (
          select 1 from public.invoice_line_items ili
          where ili.invoice_id = target.id and ili.source_change_order_line_item_id = li.id
        )
    );
  get diagnostics order_count = row_count;

  update public.invoices i set
    subtotal_cents = totals.total_cents,
    total_cents = totals.total_cents + i.tax_cents,
    balance_due_cents = totals.total_cents + i.tax_cents
  from (
    select invoice_id, pg_catalog.coalesce(pg_catalog.sum(total_cents), 0)::integer as total_cents
    from public.invoice_line_items where invoice_id = target.id group by invoice_id
  ) totals
  where i.id = target.id and i.id = totals.invoice_id;

  insert into public.activity_log (actor_user_id, subject_type, subject_id, event_type, metadata_json)
  select (select auth.uid()), 'invoice', target.id, 'approved_change_orders_added',
    pg_catalog.jsonb_build_object('line_count', line_count, 'change_order_count', order_count)
  where line_count > 0;

  return query select line_count, order_count;
end;
$$;

create or replace function public.get_crew_change_order_scope(p_job_id uuid)
returns table (
  change_order_id uuid,
  change_order_number text,
  title text,
  description text,
  sort_order integer,
  approved_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select co.id, co.change_order_number, scope.title, scope.description, scope.sort_order, co.approved_at
  from public.change_orders co
  join public.job_change_order_scope_items scope on scope.change_order_id = co.id
  join public.jobs j on j.id = co.job_id
  where co.job_id = p_job_id
    and co.status = 'approved'
    and (
      app_private.has_staff_role()
      or j.assigned_crew_user_id = (select auth.uid())
    )
  order by co.approved_at, scope.sort_order;
$$;

revoke all on function public.create_or_get_change_order_portal_token(uuid, text, text, text, timestamptz) from public;
revoke all on function public.approve_change_order(uuid, text, uuid, text, uuid, text) from public;
revoke all on function public.attach_approved_change_orders_to_invoice(uuid) from public;
revoke all on function public.get_crew_change_order_scope(uuid) from public;
grant execute on function public.create_or_get_change_order_portal_token(uuid, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.approve_change_order(uuid, text, uuid, text, uuid, text) to authenticated, service_role;
grant execute on function public.attach_approved_change_orders_to_invoice(uuid) to authenticated, service_role;
grant execute on function public.get_crew_change_order_scope(uuid) to authenticated, service_role;

-- Trigger-only helper stays private.
revoke all on function app_private.assign_change_order_number() from public, anon, authenticated;
