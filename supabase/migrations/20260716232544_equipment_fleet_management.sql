-- Equipment, vehicle, inspection, assignment, and maintenance tracking.
--
-- Fleet records are private operational data. Staff manage the full record;
-- crew use narrow RPCs that expose only equipment assigned to their account.
-- Purchase costs remain in a separate admin-only table.

create table public.equipment_assets (
  id uuid primary key default gen_random_uuid(),
  asset_number text not null,
  name text not null,
  category text not null check (category in (
    'vehicle', 'chipper', 'stump_grinder', 'skid_steer', 'crane',
    'aerial_lift', 'trailer', 'chainsaw', 'climbing_gear', 'rigging_gear',
    'ppe', 'landscaping_equipment', 'lawn_care_equipment', 'other'
  )),
  manufacturer text,
  model text,
  model_year integer check (model_year is null or model_year between 1900 and 2200),
  serial_number text,
  vin text,
  license_plate text,
  ownership_type text check (ownership_type is null or ownership_type in ('owned', 'leased', 'rented', 'other')),
  purchase_date date,
  status text not null default 'available' check (status in (
    'available', 'assigned', 'in_use', 'maintenance_due', 'out_of_service',
    'awaiting_parts', 'repair_scheduled', 'retired'
  )),
  current_mileage numeric(12,2) check (current_mileage is null or current_mileage >= 0),
  current_hours numeric(12,2) check (current_hours is null or current_hours >= 0),
  location_label text,
  assigned_employee_id uuid references public.profiles(id) on delete set null,
  photo_storage_path text,
  safety_class text,
  ppe_required text,
  inspection_template_key text,
  inspection_interval_days integer check (inspection_interval_days is null or inspection_interval_days > 0),
  next_inspection_due_at timestamptz,
  admin_notes text,
  is_active boolean not null default true,
  archived_at timestamptz,
  archived_by_user_id uuid references public.profiles(id) on delete set null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.equipment_asset_costs (
  asset_id uuid primary key references public.equipment_assets(id) on delete cascade,
  purchase_price_cents bigint check (purchase_price_cents is null or purchase_price_cents >= 0),
  replacement_value_cents bigint check (replacement_value_cents is null or replacement_value_cents >= 0),
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.equipment_readings (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.equipment_assets(id) on delete restrict,
  reading_type text not null check (reading_type in ('mileage', 'hours')),
  reading_value numeric(12,2) not null check (reading_value >= 0),
  recorded_at timestamptz not null default now(),
  recorded_by_user_id uuid references public.profiles(id) on delete set null,
  correction_reason text,
  supersedes_reading_id uuid references public.equipment_readings(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'inspection', 'maintenance', 'closeout')),
  created_at timestamptz not null default now(),
  constraint equipment_reading_correction_reason check (
    supersedes_reading_id is null or nullif(btrim(correction_reason), '') is not null
  )
);

create table public.equipment_assignments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.equipment_assets(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  schedule_event_id uuid references public.schedule_events(id) on delete set null,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  notes text,
  conflict_override_reason text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  returned_at timestamptz,
  returned_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_assignment_time_order check (ends_at is null or ends_at > starts_at),
  constraint equipment_assignment_subject check (
    job_id is not null or schedule_event_id is not null or assigned_user_id is not null
  )
);

create table public.equipment_maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.equipment_assets(id) on delete cascade,
  title text not null,
  maintenance_type text not null default 'preventive' check (maintenance_type in ('preventive', 'inspection', 'repair', 'registration', 'other')),
  interval_days integer check (interval_days is null or interval_days > 0),
  interval_miles numeric(12,2) check (interval_miles is null or interval_miles > 0),
  interval_hours numeric(12,2) check (interval_hours is null or interval_hours > 0),
  last_completed_at timestamptz,
  last_completed_mileage numeric(12,2),
  last_completed_hours numeric(12,2),
  next_due_at timestamptz,
  next_due_mileage numeric(12,2),
  next_due_hours numeric(12,2),
  instructions text,
  is_active boolean not null default true,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_maintenance_schedule_interval check (
    interval_days is not null or interval_miles is not null or interval_hours is not null or next_due_at is not null
  )
);

create table public.equipment_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.equipment_assets(id) on delete restrict,
  schedule_id uuid references public.equipment_maintenance_schedules(id) on delete set null,
  schedule_event_id uuid references public.schedule_events(id) on delete set null,
  maintenance_type text not null default 'preventive' check (maintenance_type in ('preventive', 'inspection', 'repair', 'registration', 'other')),
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  title text not null,
  description text,
  vendor_name text,
  scheduled_for timestamptz,
  completed_at timestamptz,
  mileage_at_service numeric(12,2),
  hours_at_service numeric(12,2),
  cost_cents bigint check (cost_cents is null or cost_cents >= 0),
  completed_by_user_id uuid references public.profiles(id) on delete set null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.equipment_problem_reports (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.equipment_assets(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  assignment_id uuid references public.equipment_assignments(id) on delete set null,
  severity text not null default 'attention' check (severity in ('attention', 'unsafe', 'critical')),
  status text not null default 'open' check (status in ('open', 'triaged', 'repair_scheduled', 'resolved', 'dismissed')),
  title text not null,
  description text not null,
  equipment_stopped boolean not null default false,
  photo_storage_path text,
  reported_by_user_id uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolved_by_user_id uuid references public.profiles(id) on delete set null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.equipment_inspections (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.equipment_assets(id) on delete restrict,
  assignment_id uuid references public.equipment_assignments(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  template_key text not null,
  template_version integer not null default 1,
  responses_json jsonb not null default '{}'::jsonb,
  overall_result text not null check (overall_result in ('passed', 'passed_with_attention', 'failed')),
  notes text,
  mileage numeric(12,2),
  hours numeric(12,2),
  inspected_by_user_id uuid references public.profiles(id) on delete set null,
  inspected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.equipment_documents (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.equipment_assets(id) on delete restrict,
  document_type text not null check (document_type in ('registration', 'insurance', 'inspection', 'manual', 'warranty', 'receipt', 'photo', 'other')),
  title text not null,
  storage_path text not null,
  expires_at timestamptz,
  uploaded_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.equipment_status_history (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.equipment_assets(id) on delete restrict,
  previous_status text,
  next_status text not null,
  reason text,
  changed_by_user_id uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create trigger equipment_assets_set_updated_at before update on public.equipment_assets
  for each row execute function public.set_updated_at();
create trigger equipment_asset_costs_set_updated_at before update on public.equipment_asset_costs
  for each row execute function public.set_updated_at();
create trigger equipment_assignments_set_updated_at before update on public.equipment_assignments
  for each row execute function public.set_updated_at();
create trigger equipment_maintenance_schedules_set_updated_at before update on public.equipment_maintenance_schedules
  for each row execute function public.set_updated_at();
create trigger equipment_maintenance_records_set_updated_at before update on public.equipment_maintenance_records
  for each row execute function public.set_updated_at();
create trigger equipment_problem_reports_set_updated_at before update on public.equipment_problem_reports
  for each row execute function public.set_updated_at();
create trigger equipment_documents_set_updated_at before update on public.equipment_documents
  for each row execute function public.set_updated_at();

create unique index equipment_assets_asset_number_active_uidx
  on public.equipment_assets(lower(asset_number)) where archived_at is null;
create index equipment_assets_serial_idx on public.equipment_assets(lower(serial_number)) where serial_number is not null;
create index equipment_assets_vin_idx on public.equipment_assets(lower(vin)) where vin is not null;
create index equipment_assets_plate_idx on public.equipment_assets(lower(license_plate)) where license_plate is not null;
create index equipment_assets_status_idx on public.equipment_assets(status, is_active);
create index equipment_readings_asset_idx on public.equipment_readings(asset_id, reading_type, recorded_at desc);
create index equipment_assignments_asset_time_idx on public.equipment_assignments(asset_id, starts_at, ends_at);
create index equipment_assignments_user_time_idx on public.equipment_assignments(assigned_user_id, starts_at, ends_at);
create index equipment_assignments_job_idx on public.equipment_assignments(job_id);
create index equipment_assignments_event_idx on public.equipment_assignments(schedule_event_id);
create index equipment_maintenance_due_idx on public.equipment_maintenance_schedules(next_due_at) where is_active;
create index equipment_maintenance_records_asset_idx on public.equipment_maintenance_records(asset_id, scheduled_for desc);
create index equipment_problem_reports_queue_idx on public.equipment_problem_reports(status, severity, created_at desc);
create index equipment_inspections_asset_idx on public.equipment_inspections(asset_id, inspected_at desc);
create index equipment_documents_expiry_idx on public.equipment_documents(expires_at) where expires_at is not null;
create index equipment_status_history_asset_idx on public.equipment_status_history(asset_id, changed_at desc);

alter table public.equipment_assets enable row level security;
alter table public.equipment_asset_costs enable row level security;
alter table public.equipment_readings enable row level security;
alter table public.equipment_assignments enable row level security;
alter table public.equipment_maintenance_schedules enable row level security;
alter table public.equipment_maintenance_records enable row level security;
alter table public.equipment_problem_reports enable row level security;
alter table public.equipment_inspections enable row level security;
alter table public.equipment_documents enable row level security;
alter table public.equipment_status_history enable row level security;

grant select, insert, update on public.equipment_assets to authenticated, service_role;
grant select, insert on public.equipment_readings to authenticated, service_role;
grant select, insert, update on public.equipment_assignments to authenticated, service_role;
grant select, insert, update on public.equipment_maintenance_schedules to authenticated, service_role;
grant select, insert, update on public.equipment_maintenance_records to authenticated, service_role;
grant select, insert, update on public.equipment_problem_reports to authenticated, service_role;
grant select, insert on public.equipment_inspections to authenticated, service_role;
grant select, insert, update on public.equipment_documents to authenticated, service_role;
grant select, insert on public.equipment_status_history to authenticated, service_role;
grant select, insert, update on public.equipment_asset_costs to authenticated, service_role;

create policy "Staff manage equipment assets" on public.equipment_assets for all to authenticated
  using (app_private.has_staff_role()) with check (app_private.has_staff_role());
create policy "Admins manage equipment costs" on public.equipment_asset_costs for all to authenticated
  using (app_private.has_platform_admin_role()) with check (app_private.has_platform_admin_role());

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'equipment_readings', 'equipment_assignments', 'equipment_maintenance_schedules',
    'equipment_maintenance_records', 'equipment_problem_reports', 'equipment_inspections',
    'equipment_documents', 'equipment_status_history'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (app_private.has_staff_role()) with check (app_private.has_staff_role())',
      'Staff manage ' || table_name, table_name
    );
  end loop;
end $$;

create or replace function app_private.can_use_assigned_equipment(p_asset_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select app_private.has_staff_role() or exists (
    select 1
    from public.equipment_assignments assignment
    where assignment.asset_id = p_asset_id
      and assignment.assigned_user_id = (select auth.uid())
      and assignment.starts_at <= now()
      and coalesce(assignment.ends_at, now() + interval '1 day') >= now()
      and assignment.returned_at is null
  );
$$;
revoke all on function app_private.can_use_assigned_equipment(uuid) from public, anon, authenticated, service_role;

create or replace function public.get_my_assigned_equipment()
returns table (
  assignment_id uuid, asset_id uuid, asset_number text, asset_name text, category text,
  status text, manufacturer text, model text, photo_storage_path text, safety_class text,
  ppe_required text, inspection_template_key text, next_inspection_due_at timestamptz,
  job_id uuid, schedule_event_id uuid, starts_at timestamptz, ends_at timestamptz,
  assignment_notes text
)
language sql
security definer
set search_path = ''
stable
as $$
  select assignment.id, asset.id, asset.asset_number, asset.name, asset.category,
    asset.status, asset.manufacturer, asset.model, asset.photo_storage_path,
    asset.safety_class, asset.ppe_required, asset.inspection_template_key,
    asset.next_inspection_due_at, assignment.job_id, assignment.schedule_event_id,
    assignment.starts_at, assignment.ends_at, assignment.notes
  from public.equipment_assignments assignment
  join public.equipment_assets asset on asset.id = assignment.asset_id
  where assignment.assigned_user_id = (select auth.uid())
    and assignment.returned_at is null
    and assignment.starts_at <= now() + interval '14 days'
    and coalesce(assignment.ends_at, now() + interval '30 days') >= now() - interval '1 day'
    and asset.is_active
  order by assignment.starts_at, asset.name;
$$;
revoke all on function public.get_my_assigned_equipment() from public, anon, authenticated, service_role;
grant execute on function public.get_my_assigned_equipment() to authenticated, service_role;

create or replace function public.submit_assigned_equipment_inspection(
  p_asset_id uuid,
  p_assignment_id uuid,
  p_template_key text,
  p_responses jsonb,
  p_overall_result text,
  p_notes text default null,
  p_mileage numeric default null,
  p_hours numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare inspection_id uuid; next_due timestamptz; old_status text;
begin
  if (select auth.uid()) is null or not app_private.can_use_assigned_equipment(p_asset_id) then
    raise exception 'This equipment is not assigned to your account.';
  end if;
  if p_overall_result not in ('passed', 'passed_with_attention', 'failed') then
    raise exception 'Choose a valid inspection result.';
  end if;
  if p_assignment_id is not null and not exists (
    select 1 from public.equipment_assignments
    where id = p_assignment_id and asset_id = p_asset_id
      and (assigned_user_id = (select auth.uid()) or app_private.has_staff_role())
  ) then
    raise exception 'The assignment does not match this equipment.';
  end if;

  select status into old_status from public.equipment_assets where id = p_asset_id for update;

  insert into public.equipment_inspections (
    asset_id, assignment_id, job_id, template_key, responses_json,
    overall_result, notes, mileage, hours, inspected_by_user_id
  )
  select p_asset_id, p_assignment_id, assignment.job_id, p_template_key,
    coalesce(p_responses, '{}'::jsonb), p_overall_result, nullif(btrim(p_notes), ''),
    p_mileage, p_hours, (select auth.uid())
  from (select null::uuid as job_id) fallback
  left join public.equipment_assignments assignment on assignment.id = p_assignment_id
  returning id into inspection_id;

  if p_mileage is not null then
    insert into public.equipment_readings (asset_id, reading_type, reading_value, recorded_by_user_id, source)
    values (p_asset_id, 'mileage', p_mileage, (select auth.uid()), 'inspection');
    update public.equipment_assets set current_mileage = greatest(coalesce(current_mileage, 0), p_mileage) where id = p_asset_id;
  end if;
  if p_hours is not null then
    insert into public.equipment_readings (asset_id, reading_type, reading_value, recorded_by_user_id, source)
    values (p_asset_id, 'hours', p_hours, (select auth.uid()), 'inspection');
    update public.equipment_assets set current_hours = greatest(coalesce(current_hours, 0), p_hours) where id = p_asset_id;
  end if;

  select now() + make_interval(days => inspection_interval_days) into next_due
  from public.equipment_assets where id = p_asset_id;
  update public.equipment_assets
  set next_inspection_due_at = case when p_overall_result = 'failed' then next_inspection_due_at else coalesce(next_due, next_inspection_due_at) end,
      status = case when p_overall_result = 'failed' then 'out_of_service' else status end
  where id = p_asset_id;

  if p_overall_result = 'failed' then
    insert into public.equipment_problem_reports (
      asset_id, assignment_id, title, description, severity, equipment_stopped, reported_by_user_id
    ) values (
      p_asset_id, p_assignment_id, 'Failed equipment inspection',
      coalesce(nullif(btrim(p_notes), ''), 'Inspection failed. Review responses before returning equipment to service.'),
      'unsafe', true, (select auth.uid())
    );
    insert into public.equipment_status_history (asset_id, previous_status, next_status, reason, changed_by_user_id)
    values (p_asset_id, old_status, 'out_of_service', 'Failed equipment inspection', (select auth.uid()));
  end if;
  return inspection_id;
end;
$$;
revoke all on function public.submit_assigned_equipment_inspection(uuid, uuid, text, jsonb, text, text, numeric, numeric) from public, anon, authenticated, service_role;
grant execute on function public.submit_assigned_equipment_inspection(uuid, uuid, text, jsonb, text, text, numeric, numeric) to authenticated, service_role;

create or replace function public.report_assigned_equipment_problem(
  p_asset_id uuid,
  p_assignment_id uuid,
  p_title text,
  p_description text,
  p_severity text,
  p_equipment_stopped boolean default false,
  p_photo_storage_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare report_id uuid; old_status text;
begin
  if (select auth.uid()) is null or not app_private.can_use_assigned_equipment(p_asset_id) then
    raise exception 'This equipment is not assigned to your account.';
  end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_description), '') is null then
    raise exception 'Problem title and description are required.';
  end if;
  if p_severity not in ('attention', 'unsafe', 'critical') then
    raise exception 'Choose a valid problem severity.';
  end if;
  if p_assignment_id is not null and not exists (
    select 1 from public.equipment_assignments
    where id = p_assignment_id and asset_id = p_asset_id
      and (assigned_user_id = (select auth.uid()) or app_private.has_staff_role())
  ) then
    raise exception 'The assignment does not match this equipment.';
  end if;
  select status into old_status from public.equipment_assets where id = p_asset_id for update;
  insert into public.equipment_problem_reports (
    asset_id, assignment_id, job_id, title, description, severity,
    equipment_stopped, photo_storage_path, reported_by_user_id
  )
  select p_asset_id, p_assignment_id, assignment.job_id, left(btrim(p_title), 160),
    left(btrim(p_description), 2000), p_severity, p_equipment_stopped,
    nullif(btrim(p_photo_storage_path), ''), (select auth.uid())
  from (select null::uuid as job_id) fallback
  left join public.equipment_assignments assignment on assignment.id = p_assignment_id
  returning id into report_id;
  if p_severity in ('unsafe', 'critical') or p_equipment_stopped then
    update public.equipment_assets set status = 'out_of_service' where id = p_asset_id;
    insert into public.equipment_status_history (asset_id, previous_status, next_status, reason, changed_by_user_id)
    values (p_asset_id, old_status, 'out_of_service', 'Crew problem report: ' || left(btrim(p_title), 160), (select auth.uid()));
  end if;
  return report_id;
end;
$$;
revoke all on function public.report_assigned_equipment_problem(uuid, uuid, text, text, text, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.report_assigned_equipment_problem(uuid, uuid, text, text, text, boolean, text) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'equipment-files', 'equipment-files', false, 15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set public = false;

create or replace function app_private.can_upload_equipment_path(p_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
declare asset_id uuid;
begin
  asset_id := ((storage.foldername(p_name))[1])::uuid;
  return app_private.can_use_assigned_equipment(asset_id);
exception when others then
  return false;
end;
$$;
revoke all on function app_private.can_upload_equipment_path(text) from public, anon, authenticated, service_role;

create policy "Staff can read equipment files" on storage.objects for select to authenticated
  using (bucket_id = 'equipment-files' and app_private.has_staff_role());
create policy "Staff can upload equipment files" on storage.objects for insert to authenticated
  with check (bucket_id = 'equipment-files' and app_private.has_staff_role());
create policy "Staff can update equipment files" on storage.objects for update to authenticated
  using (bucket_id = 'equipment-files' and app_private.has_staff_role())
  with check (bucket_id = 'equipment-files' and app_private.has_staff_role());
create policy "Assigned crew can upload equipment problem photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'equipment-files'
    and app_private.can_upload_equipment_path(name)
  );

comment on table public.equipment_readings is 'Append-only mileage and hour history. Corrections insert a new row with a reason.';
comment on table public.equipment_asset_costs is 'Admin-only equipment purchase and replacement costs; deliberately separated from crew-safe asset data.';
comment on table public.equipment_assignments is 'Date-ranged equipment assignments to a job, schedule event, and/or employee.';
