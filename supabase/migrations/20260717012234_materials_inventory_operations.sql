-- Materials, disposal, stock, and inventory operations.
--
-- Inventory uses an immutable movement ledger. Stock is calculated from source
-- and destination movements; reservations reduce available stock but never
-- change on-hand stock. Internal costs are isolated from crew-visible records.

alter table public.quote_line_items
  add column material_id uuid;

alter table public.invoice_line_items
  add column material_id uuid;

alter table public.quotes
  add column debris_handling text check (debris_handling is null or debris_handling in (
    'haul_all', 'leave_wood', 'leave_chips', 'leave_wood_and_chips', 'partial_haul', 'other'
  )),
  add column debris_handling_notes text;

alter table public.jobs
  add column debris_handling text check (debris_handling is null or debris_handling in (
    'haul_all', 'leave_wood', 'leave_chips', 'leave_wood_and_chips', 'partial_haul', 'other'
  )),
  add column debris_handling_notes text;

create table public.material_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in (
    'mulch', 'chips', 'logs', 'green_waste', 'stump_grindings', 'soil', 'gravel',
    'seed_sod', 'plants', 'fertilizer', 'chemical', 'fuel', 'hardware',
    'ppe_consumable', 'disposal', 'subcontracted', 'other'
  )),
  sku text,
  description text,
  default_unit text not null check (default_unit in (
    'each', 'bag', 'bundle', 'pallet', 'cubic_yard', 'ton', 'pound', 'gallon',
    'quart', 'load', 'truck_load', 'trailer_load', 'hour', 'linear_foot',
    'square_foot', 'acre'
  )),
  stock_tracked boolean not null default true,
  is_billable boolean not null default false,
  default_price_cents integer check (default_price_cents is null or default_price_cents >= 0),
  preferred_vendor_organization_id uuid references public.organizations(id) on delete set null,
  reorder_threshold numeric(14,3) check (reorder_threshold is null or reorder_threshold >= 0),
  notes text,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_catalog_name_unique unique nulls not distinct (name, sku)
);

alter table public.quote_line_items
  add constraint quote_line_items_material_id_fkey foreign key (material_id) references public.material_catalog(id) on delete set null;

alter table public.invoice_line_items
  add constraint invoice_line_items_material_id_fkey foreign key (material_id) references public.material_catalog(id) on delete set null;

create table public.material_cost_settings (
  material_id uuid primary key references public.material_catalog(id) on delete cascade,
  internal_unit_cost_cents integer check (internal_unit_cost_cents is null or internal_unit_cost_cents >= 0),
  costing_method text not null default 'snapshot_at_use' check (costing_method = 'snapshot_at_use'),
  pricing_notes text,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location_type text not null default 'yard' check (location_type in (
    'yard', 'warehouse', 'truck', 'trailer', 'job_site', 'vendor', 'disposal_facility',
    'customer', 'donation_site', 'stockpile', 'other'
  )),
  address text,
  equipment_asset_id uuid references public.equipment_assets(id) on delete set null,
  notes text,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.material_catalog(id) on delete restrict,
  transaction_type text not null check (transaction_type in (
    'receive', 'produce', 'transfer', 'reserve', 'release', 'load', 'job_use',
    'delivery', 'disposal', 'donation', 'return', 'adjustment', 'loss', 'sale', 'reversal'
  )),
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (unit in (
    'each', 'bag', 'bundle', 'pallet', 'cubic_yard', 'ton', 'pound', 'gallon',
    'quart', 'load', 'truck_load', 'trailer_load', 'hour', 'linear_foot',
    'square_foot', 'acre'
  )),
  source_location_id uuid references public.inventory_locations(id) on delete restrict,
  destination_location_id uuid references public.inventory_locations(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  service_location_id uuid references public.service_locations(id) on delete set null,
  vendor_organization_id uuid references public.organizations(id) on delete set null,
  equipment_asset_id uuid references public.equipment_assets(id) on delete set null,
  occurred_at timestamptz not null default now(),
  is_estimated boolean not null default false,
  notes text,
  attachment_storage_path text,
  idempotency_key text not null,
  reversal_of_transaction_id uuid references public.inventory_transactions(id) on delete restrict,
  negative_override_reason text,
  negative_override_authorized_by uuid references public.profiles(id) on delete set null,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_transaction_locations check (
    source_location_id is not null or destination_location_id is not null
  ),
  constraint inventory_transaction_distinct_locations check (
    source_location_id is null or destination_location_id is null or source_location_id <> destination_location_id
  ),
  constraint inventory_transaction_reversal check (
    (transaction_type = 'reversal' and reversal_of_transaction_id is not null)
    or (transaction_type <> 'reversal' and reversal_of_transaction_id is null)
  ),
  constraint inventory_transaction_idempotency unique (created_by_user_id, idempotency_key)
);

create table public.inventory_transaction_costs (
  transaction_id uuid primary key references public.inventory_transactions(id) on delete restrict,
  unit_cost_cents_snapshot integer check (unit_cost_cents_snapshot is null or unit_cost_cents_snapshot >= 0),
  direct_cost_cents integer check (direct_cost_cents is null or direct_cost_cents >= 0),
  costing_status text not null default 'pending' check (costing_status in ('pending', 'approved', 'rejected', 'not_applicable')),
  job_cost_entry_id uuid references public.job_cost_entries(id) on delete set null,
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quote_material_requirements (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  quote_line_item_id uuid references public.quote_line_items(id) on delete set null,
  material_id uuid not null references public.material_catalog(id) on delete restrict,
  planned_quantity numeric(14,3) not null check (planned_quantity > 0),
  unit text not null,
  is_estimated boolean not null default false,
  notes text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_material_requirements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  material_id uuid not null references public.material_catalog(id) on delete restrict,
  source_quote_requirement_id uuid references public.quote_material_requirements(id) on delete set null,
  planned_quantity numeric(14,3) not null check (planned_quantity > 0),
  unit text not null,
  is_estimated boolean not null default false,
  notes text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_material_requirement_source_unique unique (job_id, source_quote_requirement_id)
);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.material_catalog(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete cascade,
  job_material_requirement_id uuid references public.job_material_requirements(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  status text not null default 'active' check (status in ('active', 'fulfilled', 'released', 'cancelled')),
  expected_available_at timestamptz,
  notes text,
  released_reason text,
  released_at timestamptz,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.material_purchases (
  id uuid primary key default gen_random_uuid(),
  vendor_organization_id uuid references public.organizations(id) on delete set null,
  vendor_name text,
  purchase_date date not null default current_date,
  purchase_order_reference text,
  taxes_fees_cents integer not null default 0 check (taxes_fees_cents >= 0),
  delivery_charge_cents integer not null default 0 check (delivery_charge_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  receipt_storage_path text,
  received_location_id uuid references public.inventory_locations(id) on delete restrict,
  received_by_user_id uuid references public.profiles(id) on delete set null,
  notes text,
  idempotency_key text not null,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_purchase_idempotency unique (created_by_user_id, idempotency_key)
);

create table public.material_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.material_purchases(id) on delete cascade,
  material_id uuid not null references public.material_catalog(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  inventory_transaction_id uuid references public.inventory_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.disposal_records (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete restrict,
  material_id uuid references public.material_catalog(id) on delete set null,
  source_location_id uuid references public.inventory_locations(id) on delete set null,
  destination_type text not null check (destination_type in (
    'landfill', 'transfer_station', 'recycling', 'yard', 'chipdrop', 'donation',
    'community_garden', 'municipal_partner', 'customer', 'other'
  )),
  destination_name text not null,
  destination_organization_id uuid references public.organizations(id) on delete set null,
  quantity numeric(14,3),
  unit text,
  is_estimated boolean not null default true,
  status text not null default 'planned' check (status in ('planned', 'loaded', 'departed', 'arrived', 'completed', 'cancelled')),
  driver_user_id uuid references public.profiles(id) on delete set null,
  vehicle_asset_id uuid references public.equipment_assets(id) on delete set null,
  trailer_asset_id uuid references public.equipment_assets(id) on delete set null,
  loaded_at timestamptz,
  departed_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  fee_cents integer check (fee_cents is null or fee_cents >= 0),
  ticket_reference text,
  receipt_storage_path text,
  notes text,
  idempotency_key text not null,
  inventory_transaction_id uuid references public.inventory_transactions(id) on delete set null,
  job_cost_entry_id uuid references public.job_cost_entries(id) on delete set null,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint disposal_record_idempotency unique (created_by_user_id, idempotency_key)
);

create table public.material_loads (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete restrict,
  material_id uuid not null references public.material_catalog(id) on delete restrict,
  source_location_id uuid references public.inventory_locations(id) on delete set null,
  destination_location_id uuid references public.inventory_locations(id) on delete set null,
  destination_type text not null default 'job_site' check (destination_type in (
    'job_site', 'customer', 'chipdrop', 'donation', 'community_garden', 'municipal_partner', 'yard', 'disposal', 'other'
  )),
  destination_name text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  is_estimated boolean not null default true,
  vehicle_asset_id uuid references public.equipment_assets(id) on delete set null,
  trailer_asset_id uuid references public.equipment_assets(id) on delete set null,
  chipper_asset_id uuid references public.equipment_assets(id) on delete set null,
  driver_user_id uuid references public.profiles(id) on delete set null,
  departed_at timestamptz,
  arrived_at timestamptz,
  proof_storage_path text,
  notes text,
  inventory_transaction_id uuid references public.inventory_transactions(id) on delete set null,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_load_transaction_unique unique (inventory_transaction_id)
);

create table public.customer_deliveries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_location_id uuid references public.service_locations(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  material_id uuid not null references public.material_catalog(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  delivery_window_start timestamptz,
  delivery_window_end timestamptz,
  delivered_at timestamptz,
  vehicle_asset_id uuid references public.equipment_assets(id) on delete set null,
  trailer_asset_id uuid references public.equipment_assets(id) on delete set null,
  driver_user_id uuid references public.profiles(id) on delete set null,
  delivery_instructions text,
  customer_visible_notes text,
  internal_notes text,
  proof_storage_path text,
  acknowledgment_name text,
  status text not null default 'planned' check (status in ('planned', 'scheduled', 'out_for_delivery', 'delivered', 'cancelled')),
  idempotency_key text not null,
  inventory_transaction_id uuid references public.inventory_transactions(id) on delete set null,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_delivery_idempotency unique (created_by_user_id, idempotency_key)
);

create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  product_material_id uuid not null references public.material_catalog(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'curing', 'ready', 'completed', 'cancelled')),
  color text,
  dye_product text,
  dye_amount numeric(14,3),
  dye_unit text,
  processed_at timestamptz,
  ready_at timestamptz,
  moisture_weather_notes text,
  estimated_output_quantity numeric(14,3),
  output_unit text,
  direct_cost_cents integer check (direct_cost_cents is null or direct_cost_cents >= 0),
  cost_per_unit_cents integer check (cost_per_unit_cents is null or cost_per_unit_cents >= 0),
  quality_notes text,
  equipment_asset_id uuid references public.equipment_assets(id) on delete set null,
  labor_hours numeric(10,2) check (labor_hours is null or labor_hours >= 0),
  attachment_storage_path text,
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.production_batch_inputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  material_id uuid not null references public.material_catalog(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  inventory_transaction_id uuid references public.inventory_transactions(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.production_batch_outputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  material_id uuid not null references public.material_catalog(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  is_estimated boolean not null default true,
  inventory_transaction_id uuid references public.inventory_transactions(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.stockpile_measurements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.material_catalog(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  measured_at timestamptz not null default now(),
  quantity numeric(14,3) not null check (quantity >= 0),
  unit text not null,
  measurement_method text not null default 'visual_estimate' check (measurement_method in (
    'visual_estimate', 'dimensions_estimate', 'scale_weight', 'metered', 'counted', 'other'
  )),
  is_estimated boolean not null default true,
  notes text,
  photo_storage_path text,
  measured_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create trigger material_catalog_set_updated_at before update on public.material_catalog
  for each row execute function public.set_updated_at();
create trigger material_cost_settings_set_updated_at before update on public.material_cost_settings
  for each row execute function public.set_updated_at();
create trigger inventory_locations_set_updated_at before update on public.inventory_locations
  for each row execute function public.set_updated_at();
create trigger inventory_transaction_costs_set_updated_at before update on public.inventory_transaction_costs
  for each row execute function public.set_updated_at();
create trigger quote_material_requirements_set_updated_at before update on public.quote_material_requirements
  for each row execute function public.set_updated_at();
create trigger job_material_requirements_set_updated_at before update on public.job_material_requirements
  for each row execute function public.set_updated_at();
create trigger inventory_reservations_set_updated_at before update on public.inventory_reservations
  for each row execute function public.set_updated_at();
create trigger material_purchases_set_updated_at before update on public.material_purchases
  for each row execute function public.set_updated_at();
create trigger material_purchase_items_set_updated_at before update on public.material_purchase_items
  for each row execute function public.set_updated_at();
create trigger disposal_records_set_updated_at before update on public.disposal_records
  for each row execute function public.set_updated_at();
create trigger material_loads_set_updated_at before update on public.material_loads
  for each row execute function public.set_updated_at();
create trigger customer_deliveries_set_updated_at before update on public.customer_deliveries
  for each row execute function public.set_updated_at();
create trigger production_batches_set_updated_at before update on public.production_batches
  for each row execute function public.set_updated_at();

create or replace function app_private.prevent_inventory_transaction_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Inventory history is immutable. Add a reversal transaction instead.';
end;
$$;

create trigger inventory_transactions_immutable
before update or delete on public.inventory_transactions
for each row execute function app_private.prevent_inventory_transaction_mutation();

create or replace function app_private.enforce_inventory_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tracked boolean;
  on_hand numeric(14,3);
  is_authorized boolean;
begin
  select material.stock_tracked into tracked
  from public.material_catalog material
  where material.id = new.material_id;

  if new.transaction_type = 'reversal' then
    if not exists (
      select 1 from public.inventory_transactions original
      where original.id = new.reversal_of_transaction_id
        and original.material_id = new.material_id
        and not exists (
          select 1 from public.inventory_transactions prior_reversal
          where prior_reversal.reversal_of_transaction_id = original.id
        )
    ) then
      raise exception 'The original transaction is missing, mismatched, or already reversed.';
    end if;
  end if;

  if tracked and new.source_location_id is not null then
    select coalesce(sum(delta), 0) into on_hand
    from (
      select case
        when tx.destination_location_id = new.source_location_id then tx.quantity
        when tx.source_location_id = new.source_location_id then -tx.quantity
        else 0
      end as delta
      from public.inventory_transactions tx
      where tx.material_id = new.material_id
        and (tx.source_location_id = new.source_location_id or tx.destination_location_id = new.source_location_id)
    ) movements;

    if on_hand < new.quantity then
      select app_private.has_financial_reporting_role() into is_authorized;
      if not coalesce(is_authorized, false) or nullif(btrim(new.negative_override_reason), '') is null then
        raise exception 'This movement would make stock negative. An authorized override and reason are required.';
      end if;
      new.negative_override_authorized_by := (select auth.uid());
    end if;
  end if;

  return new;
end;
$$;

create trigger inventory_transactions_validate
before insert on public.inventory_transactions
for each row execute function app_private.enforce_inventory_transaction();

create or replace function app_private.snapshot_inventory_transaction_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_cost integer;
begin
  if new.transaction_type <> 'job_use' or new.job_id is null then
    return new;
  end if;

  select costs.internal_unit_cost_cents into unit_cost
  from public.material_cost_settings costs
  where costs.material_id = new.material_id;

  insert into public.inventory_transaction_costs (
    transaction_id,
    unit_cost_cents_snapshot,
    direct_cost_cents,
    costing_status
  ) values (
    new.id,
    unit_cost,
    case when unit_cost is null then null else round(new.quantity * unit_cost)::integer end,
    'pending'
  ) on conflict (transaction_id) do nothing;

  return new;
end;
$$;

create trigger inventory_transactions_snapshot_cost
after insert on public.inventory_transactions
for each row execute function app_private.snapshot_inventory_transaction_cost();

create or replace function app_private.consume_inventory_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation record;
  remaining numeric(14,3);
  leftover numeric(14,3);
begin
  if new.transaction_type not in ('load', 'job_use')
    or new.job_id is null
    or new.source_location_id is null then
    return new;
  end if;

  remaining := new.quantity;
  for reservation in
    select * from public.inventory_reservations active_reservation
    where active_reservation.status = 'active'
      and active_reservation.job_id = new.job_id
      and active_reservation.material_id = new.material_id
      and active_reservation.location_id = new.source_location_id
    order by active_reservation.created_at
    for update
  loop
    exit when remaining <= 0;
    if remaining >= reservation.quantity then
      update public.inventory_reservations
      set status = 'fulfilled', released_at = new.occurred_at,
          released_reason = 'Fulfilled by inventory transaction ' || new.id::text,
          updated_by_user_id = new.created_by_user_id
      where id = reservation.id;
      remaining := remaining - reservation.quantity;
    else
      leftover := reservation.quantity - remaining;
      update public.inventory_reservations
      set status = 'fulfilled', released_at = new.occurred_at,
          released_reason = 'Partially fulfilled by inventory transaction ' || new.id::text,
          updated_by_user_id = new.created_by_user_id
      where id = reservation.id;
      insert into public.inventory_reservations (
        material_id, location_id, job_id, job_material_requirement_id, quantity, unit,
        status, expected_available_at, notes, created_by_user_id, updated_by_user_id
      ) values (
        reservation.material_id, reservation.location_id, reservation.job_id,
        reservation.job_material_requirement_id, leftover, reservation.unit, 'active',
        reservation.expected_available_at,
        coalesce(reservation.notes, '') || case when reservation.notes is null then '' else E'\n' end ||
          'Remaining quantity after partial fulfillment of reservation ' || reservation.id::text,
        reservation.created_by_user_id, new.created_by_user_id
      );
      remaining := 0;
    end if;
  end loop;
  return new;
end;
$$;

create trigger inventory_transactions_consume_reservation
after insert on public.inventory_transactions
for each row execute function app_private.consume_inventory_reservation();

create or replace function app_private.release_cancelled_job_reservations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'lost') and old.status is distinct from new.status then
    update public.inventory_reservations
    set status = 'cancelled', released_at = now(),
        released_reason = 'Work order status changed to ' || new.status,
        updated_by_user_id = (select auth.uid())
    where job_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;

create trigger jobs_release_inventory_reservations
after update of status on public.jobs
for each row execute function app_private.release_cancelled_job_reservations();

create or replace view public.material_stock_balances
with (security_invoker = true)
as
with movement_rows as (
  select material_id, destination_location_id as location_id, quantity as delta, occurred_at
  from public.inventory_transactions
  where destination_location_id is not null
  union all
  select material_id, source_location_id as location_id, -quantity as delta, occurred_at
  from public.inventory_transactions
  where source_location_id is not null
), reservations as (
  select material_id, location_id, sum(quantity) as reserved_quantity
  from public.inventory_reservations
  where status = 'active'
  group by material_id, location_id
)
select
  material_id,
  location_id,
  sum(delta)::numeric(14,3) as on_hand_quantity,
  coalesce(max(reservations.reserved_quantity), 0)::numeric(14,3) as reserved_quantity,
  (sum(delta) - coalesce(max(reservations.reserved_quantity), 0))::numeric(14,3) as available_quantity,
  max(occurred_at) as latest_transaction_at
from movement_rows
left join reservations using (material_id, location_id)
group by material_id, location_id;

create index material_catalog_category_active_idx on public.material_catalog(category, is_active) where archived_at is null;
create index inventory_locations_type_active_idx on public.inventory_locations(location_type, is_active) where archived_at is null;
create index inventory_transactions_material_date_idx on public.inventory_transactions(material_id, occurred_at desc);
create index inventory_transactions_job_date_idx on public.inventory_transactions(job_id, occurred_at desc) where job_id is not null;
create index inventory_transactions_source_idx on public.inventory_transactions(source_location_id, material_id, occurred_at) where source_location_id is not null;
create index inventory_transactions_destination_idx on public.inventory_transactions(destination_location_id, material_id, occurred_at) where destination_location_id is not null;
create unique index inventory_transactions_one_reversal_idx on public.inventory_transactions(reversal_of_transaction_id) where reversal_of_transaction_id is not null;
create index quote_material_requirements_quote_idx on public.quote_material_requirements(quote_id, material_id);
create index job_material_requirements_job_idx on public.job_material_requirements(job_id, material_id);
create index inventory_reservations_active_idx on public.inventory_reservations(material_id, location_id, job_id) where status = 'active';
create index material_purchases_date_idx on public.material_purchases(purchase_date desc);
create index disposal_records_job_status_idx on public.disposal_records(job_id, status, created_at desc);
create index material_loads_job_date_idx on public.material_loads(job_id, created_at desc);
create index customer_deliveries_status_window_idx on public.customer_deliveries(status, delivery_window_start);
create index production_batches_status_idx on public.production_batches(status, created_at desc);
create index stockpile_measurements_material_location_idx on public.stockpile_measurements(material_id, location_id, measured_at desc);

alter table public.material_catalog enable row level security;
alter table public.material_cost_settings enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.inventory_transaction_costs enable row level security;
alter table public.quote_material_requirements enable row level security;
alter table public.job_material_requirements enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.material_purchases enable row level security;
alter table public.material_purchase_items enable row level security;
alter table public.disposal_records enable row level security;
alter table public.material_loads enable row level security;
alter table public.customer_deliveries enable row level security;
alter table public.production_batches enable row level security;
alter table public.production_batch_inputs enable row level security;
alter table public.production_batch_outputs enable row level security;
alter table public.stockpile_measurements enable row level security;

grant select, insert, update on public.material_catalog to authenticated, service_role;
grant select, insert, update on public.material_cost_settings to authenticated, service_role;
grant select, insert, update on public.inventory_locations to authenticated, service_role;
grant select, insert on public.inventory_transactions to authenticated, service_role;
grant select, insert, update on public.inventory_transaction_costs to authenticated, service_role;
grant select, insert, update on public.quote_material_requirements to authenticated, service_role;
grant select, insert, update on public.job_material_requirements to authenticated, service_role;
grant select, insert, update on public.inventory_reservations to authenticated, service_role;
grant select, insert, update on public.material_purchases to authenticated, service_role;
grant select, insert, update on public.material_purchase_items to authenticated, service_role;
grant select, insert, update on public.disposal_records to authenticated, service_role;
grant select, insert, update on public.material_loads to authenticated, service_role;
grant select, insert, update on public.customer_deliveries to authenticated, service_role;
grant select, insert, update on public.production_batches to authenticated, service_role;
grant select, insert on public.production_batch_inputs to authenticated, service_role;
grant select, insert on public.production_batch_outputs to authenticated, service_role;
grant select, insert on public.stockpile_measurements to authenticated, service_role;
grant select on public.material_stock_balances to authenticated, service_role;

create policy "Platform users read material catalog" on public.material_catalog for select to authenticated
  using (app_private.has_staff_role() or app_private.has_schedule_crew_role());
create policy "Staff manage material catalog" on public.material_catalog for all to authenticated
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Financial roles manage material costs" on public.material_cost_settings for all to authenticated
  using (app_private.has_financial_reporting_role()) with check (app_private.has_financial_reporting_role());
create policy "Platform users read inventory locations" on public.inventory_locations for select to authenticated
  using (app_private.has_staff_role() or app_private.has_schedule_crew_role());
create policy "Staff manage inventory locations" on public.inventory_locations for all to authenticated
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Staff read inventory transactions" on public.inventory_transactions for select to authenticated
  using (app_private.has_staff_role());
create policy "Assigned crew read job inventory transactions" on public.inventory_transactions for select to authenticated
  using (
    created_by_user_id = (select auth.uid())
    and exists (select 1 from public.jobs job where job.id = job_id and job.assigned_crew_user_id = (select auth.uid()))
  );
create policy "Staff insert inventory transactions" on public.inventory_transactions for insert to authenticated
  with check (app_private.has_staff_role() and created_by_user_id = (select auth.uid()));
create policy "Assigned crew insert field inventory transactions" on public.inventory_transactions for insert to authenticated
  with check (
    created_by_user_id = (select auth.uid())
    and transaction_type in ('load', 'job_use', 'return', 'delivery', 'disposal', 'donation')
    and negative_override_reason is null
    and negative_override_authorized_by is null
    and job_id is not null
    and exists (select 1 from public.jobs job where job.id = job_id and job.assigned_crew_user_id = (select auth.uid()))
  );
create policy "Financial roles manage transaction costs" on public.inventory_transaction_costs for all to authenticated
  using (app_private.has_financial_reporting_role()) with check (app_private.has_financial_reporting_role());
create policy "Staff manage quote material plans" on public.quote_material_requirements for all to authenticated
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Staff manage job material plans" on public.job_material_requirements for all to authenticated
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Assigned crew read job material plans" on public.job_material_requirements for select to authenticated
  using (exists (select 1 from public.jobs job where job.id = job_id and job.assigned_crew_user_id = (select auth.uid())));
create policy "Staff manage inventory reservations" on public.inventory_reservations for all to authenticated
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Assigned crew read job reservations" on public.inventory_reservations for select to authenticated
  using (exists (select 1 from public.jobs job where job.id = job_id and job.assigned_crew_user_id = (select auth.uid())));
create policy "Financial roles manage material purchases" on public.material_purchases for all to authenticated
  using (app_private.has_financial_reporting_role()) with check (app_private.has_financial_reporting_role());
create policy "Financial roles manage material purchase items" on public.material_purchase_items for all to authenticated
  using (app_private.has_financial_reporting_role()) with check (app_private.has_financial_reporting_role());
create policy "Financial roles manage disposal records" on public.disposal_records for all to authenticated
  using (app_private.has_financial_reporting_role()) with check (app_private.has_financial_reporting_role());
create policy "Staff add disposal records without costs" on public.disposal_records for insert to authenticated
  with check (app_private.has_staff_role() and fee_cents is null and created_by_user_id = (select auth.uid()));
create policy "Staff read disposal records without costs" on public.disposal_records for select to authenticated
  using (app_private.has_staff_role() and fee_cents is null);
create policy "Assigned crew read disposal records" on public.disposal_records for select to authenticated
  using (fee_cents is null and created_by_user_id = (select auth.uid()) and exists (select 1 from public.jobs job where job.id = job_id and job.assigned_crew_user_id = (select auth.uid())));
create policy "Assigned crew add disposal records" on public.disposal_records for insert to authenticated
  with check (created_by_user_id = (select auth.uid()) and fee_cents is null and job_id is not null and exists (select 1 from public.jobs job where job.id = job_id and job.assigned_crew_user_id = (select auth.uid())));
create policy "Staff manage material loads" on public.material_loads for all to authenticated
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Assigned crew read own material loads" on public.material_loads for select to authenticated
  using (created_by_user_id = (select auth.uid()) and exists (select 1 from public.jobs job where job.id = job_id and job.assigned_crew_user_id = (select auth.uid())));
create policy "Assigned crew add material loads" on public.material_loads for insert to authenticated
  with check (created_by_user_id = (select auth.uid()) and job_id is not null and exists (select 1 from public.jobs job where job.id = job_id and job.assigned_crew_user_id = (select auth.uid())));
create policy "Staff manage customer deliveries" on public.customer_deliveries for all to authenticated
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Financial roles manage production batches" on public.production_batches for all to authenticated
  using (app_private.has_financial_reporting_role()) with check (app_private.has_financial_reporting_role());
create policy "Staff add production batches without costs" on public.production_batches for insert to authenticated
  with check (app_private.has_staff_role() and direct_cost_cents is null and cost_per_unit_cents is null and created_by_user_id = (select auth.uid()));
create policy "Staff read production batches without costs" on public.production_batches for select to authenticated
  using (app_private.has_staff_role() and direct_cost_cents is null and cost_per_unit_cents is null);
create policy "Staff update production batches without costs" on public.production_batches for update to authenticated
  using (app_private.has_staff_role() and direct_cost_cents is null and cost_per_unit_cents is null)
  with check (app_private.has_staff_role() and direct_cost_cents is null and cost_per_unit_cents is null);
create policy "Staff manage production inputs" on public.production_batch_inputs for all to authenticated
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Staff manage production outputs" on public.production_batch_outputs for all to authenticated
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Staff manage stockpile measurements" on public.stockpile_measurements for all to authenticated
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());

revoke all on function app_private.prevent_inventory_transaction_mutation() from public, anon, authenticated, service_role;
revoke all on function app_private.enforce_inventory_transaction() from public, anon, authenticated, service_role;
revoke all on function app_private.snapshot_inventory_transaction_cost() from public, anon, authenticated, service_role;
revoke all on function app_private.consume_inventory_reservation() from public, anon, authenticated, service_role;
revoke all on function app_private.release_cancelled_job_reservations() from public, anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'material-files', 'material-files', false, 15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set public = false;

create policy "Authenticated users upload own material files" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'material-files'
    and app_private.has_schedule_crew_role()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Financial roles read all material files" on storage.objects for select to authenticated
  using (bucket_id = 'material-files' and app_private.has_financial_reporting_role());
create policy "Staff read nonfinancial material files" on storage.objects for select to authenticated
  using (
    bucket_id = 'material-files'
    and app_private.has_staff_role()
    and (storage.foldername(name))[2] in ('movement', 'delivery', 'stockpile')
  );
create policy "Users read own material files" on storage.objects for select to authenticated
  using (
    bucket_id = 'material-files'
    and app_private.has_schedule_crew_role()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

comment on table public.inventory_transactions is 'Immutable inventory movement ledger. Corrections are reversal rows, never updates or deletes.';
comment on table public.inventory_transaction_costs is 'Restricted transaction cost snapshots. Material job cost is recognized at approved job use, not again at purchase.';
comment on view public.material_stock_balances is 'Derived on-hand, reserved, and available quantities by material and location. Bulk estimates remain labeled on source records.';
comment on column public.material_cost_settings.costing_method is 'Snapshot-at-use prevents old jobs from changing when current material costs are edited.';
