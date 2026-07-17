-- Employee onboarding, operational qualifications, training, and safety records.
-- Employee records are deliberately separate from auth profiles so historical
-- employment and compliance history survives access changes or auth deletion.

create table public.employee_records (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references public.profiles(id) on delete set null,
  access_request_id uuid references public.employee_access_requests(id) on delete set null,
  legal_name text,
  preferred_name text,
  employee_number text,
  contact_email text,
  contact_phone text,
  home_address text,
  hire_date date,
  employment_status text not null default 'applicant' check (employment_status in ('applicant', 'onboarding', 'active', 'seasonal', 'leave', 'inactive', 'separated')),
  employment_type text check (employment_type is null or employment_type in ('permanent', 'seasonal', 'temporary', 'contractor', 'other')),
  job_title text,
  department text,
  crew_name text,
  supervisor_employee_id uuid references public.employee_records(id) on delete set null,
  preferred_language text,
  operational_notes text,
  profile_photo_storage_path text,
  is_supervisor boolean not null default false,
  is_active boolean not null default true,
  separation_date date,
  separation_reason text,
  manual_review_required boolean not null default false,
  archived_at timestamptz,
  archived_by_user_id uuid references public.profiles(id) on delete set null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_private_records (
  employee_id uuid primary key references public.employee_records(id) on delete restrict,
  private_hr_notes text,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index employee_records_number_uidx on public.employee_records(lower(employee_number)) where employee_number is not null and archived_at is null;
create index employee_records_contact_email_idx on public.employee_records(lower(contact_email));
create index employee_records_status_idx on public.employee_records(employment_status, is_active);
create index employee_records_supervisor_idx on public.employee_records(supervisor_employee_id);

create table public.employee_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee_records(id) on delete restrict,
  full_name text not null,
  relationship text,
  phone text not null,
  alternate_phone text,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique,
  label text not null,
  description text,
  sort_order integer not null default 0,
  is_required boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_onboarding_items (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee_records(id) on delete restrict,
  template_id uuid references public.onboarding_templates(id) on delete set null,
  item_key text not null,
  label text not null,
  sort_order integer not null default 0,
  completion_status text not null default 'incomplete' check (completion_status in ('incomplete', 'complete', 'not_applicable')),
  notes text,
  completed_at timestamptz,
  completed_by_user_id uuid references public.profiles(id) on delete set null,
  reopened_at timestamptz,
  reopened_by_user_id uuid references public.profiles(id) on delete set null,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, item_key)
);

create table public.credential_types (
  id uuid primary key default gen_random_uuid(),
  type_key text not null unique,
  label text not null,
  default_warning_days integer not null default 30 check (default_warning_days >= 0),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_credentials (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee_records(id) on delete restrict,
  credential_type_id uuid not null references public.credential_types(id) on delete restrict,
  credential_number text,
  issuing_organization text,
  issue_date date,
  expiration_date date,
  status text not null default 'pending_verification' check (status in ('pending_verification', 'active', 'suspended', 'revoked', 'not_required')),
  verified_at timestamptz,
  verified_by_user_id uuid references public.profiles(id) on delete set null,
  document_id uuid,
  notes text,
  archived_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.qualification_requirements (
  id uuid primary key default gen_random_uuid(),
  requirement_scope text not null check (requirement_scope in ('platform_role', 'job_assignment_role', 'equipment_category')),
  scope_value text not null,
  credential_type_id uuid not null references public.credential_types(id) on delete restrict,
  warning_only boolean not null default true,
  is_active boolean not null default true,
  notes text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requirement_scope, scope_value, credential_type_id)
);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  training_type text not null,
  provider_or_instructor text,
  starts_at timestamptz not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  location_label text,
  refresher_due_at timestamptz,
  instructor_notes text,
  document_version text,
  archived_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_attendees (
  id uuid primary key default gen_random_uuid(),
  training_session_id uuid not null references public.training_sessions(id) on delete restrict,
  employee_id uuid not null references public.employee_records(id) on delete restrict,
  result text not null default 'incomplete' check (result in ('completed', 'passed', 'failed', 'incomplete')),
  score numeric(6,2),
  attendee_notes text,
  acknowledged_at timestamptz,
  acknowledgment_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (training_session_id, employee_id)
);

create table public.safety_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic_key text,
  starts_at timestamptz not null,
  location_label text,
  leader_name text,
  subject_matter text,
  meeting_notes text,
  follow_up_actions text,
  document_version text,
  archived_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.safety_meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  safety_meeting_id uuid not null references public.safety_meetings(id) on delete restrict,
  employee_id uuid not null references public.employee_records(id) on delete restrict,
  attendance_status text not null default 'present' check (attendance_status in ('present', 'absent', 'excused')),
  acknowledged_at timestamptz,
  acknowledgment_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (safety_meeting_id, employee_id)
);

create table public.employee_program_files (
  id uuid primary key default gen_random_uuid(),
  training_session_id uuid references public.training_sessions(id) on delete restrict,
  safety_meeting_id uuid references public.safety_meetings(id) on delete restrict,
  file_kind text not null default 'attachment' check (file_kind in ('attachment', 'photo')),
  title text not null,
  storage_path text not null unique,
  mime_type text,
  file_size_bytes bigint,
  uploaded_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(training_session_id, safety_meeting_id) = 1)
);

create table public.employee_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee_records(id) on delete restrict,
  subject_type text not null check (subject_type in ('onboarding_item', 'training_session', 'safety_meeting', 'employee_document')),
  subject_id uuid not null,
  subject_version text not null default '1',
  acknowledgment_name text not null,
  acknowledgment_method text not null default 'typed_name' check (acknowledgment_method in ('typed_name', 'employee_account')),
  acknowledged_by_auth_user_id uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (employee_id, subject_type, subject_id, subject_version)
);

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee_records(id) on delete restrict,
  document_type text not null,
  title text not null,
  storage_path text not null unique,
  mime_type text,
  file_size_bytes bigint,
  issue_date date,
  expiration_date date,
  access_classification text not null default 'admin_only' check (access_classification in ('employee_visible', 'supervisor_visible', 'admin_only', 'owner_only')),
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  review_notes text,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  notes text,
  uploaded_by_user_id uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employee_credentials
  add constraint employee_credentials_document_id_fkey foreign key (document_id) references public.employee_documents(id) on delete set null;

create table public.employee_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee_records(id) on delete restrict,
  request_type text not null check (request_type in ('profile_correction', 'credential_renewal', 'training_request', 'document_review', 'other')),
  title text not null,
  details text not null,
  related_credential_id uuid references public.employee_credentials(id) on delete set null,
  related_document_id uuid references public.employee_documents(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'completed')),
  review_notes text,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  submitted_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_separation_items (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employee_records(id) on delete restrict,
  item_key text not null,
  label text not null,
  completion_status text not null default 'incomplete' check (completion_status in ('incomplete', 'complete', 'not_applicable')),
  notes text,
  completed_at timestamptz,
  completed_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, item_key)
);

-- Updated-at triggers and lookup indexes.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'employee_records', 'employee_private_records', 'employee_emergency_contacts', 'onboarding_templates',
    'employee_onboarding_items', 'credential_types', 'employee_credentials',
    'qualification_requirements', 'training_sessions', 'training_attendees',
    'safety_meetings', 'safety_meeting_attendees', 'employee_program_files', 'employee_documents',
    'employee_requests', 'employee_separation_items'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
  end loop;
end $$;

create index employee_emergency_contacts_employee_idx on public.employee_emergency_contacts(employee_id);
create index employee_onboarding_employee_idx on public.employee_onboarding_items(employee_id, sort_order);
create index employee_credentials_employee_idx on public.employee_credentials(employee_id, expiration_date);
create index employee_credentials_expiration_idx on public.employee_credentials(expiration_date) where archived_at is null;
create index training_sessions_starts_idx on public.training_sessions(starts_at desc);
create index training_attendees_employee_idx on public.training_attendees(employee_id, training_session_id);
create index safety_meetings_starts_idx on public.safety_meetings(starts_at desc);
create index safety_attendees_employee_idx on public.safety_meeting_attendees(employee_id, safety_meeting_id);
create index employee_program_files_training_idx on public.employee_program_files(training_session_id) where training_session_id is not null;
create index employee_program_files_safety_idx on public.employee_program_files(safety_meeting_id) where safety_meeting_id is not null;
create index employee_documents_employee_idx on public.employee_documents(employee_id, expiration_date);
create index employee_documents_review_idx on public.employee_documents(review_status, expiration_date) where archived_at is null;
create index employee_requests_queue_idx on public.employee_requests(status, created_at desc);
create index employee_acknowledgments_employee_idx on public.employee_acknowledgments(employee_id, acknowledged_at desc);

insert into public.onboarding_templates (item_key, label, sort_order) values
  ('employee_information', 'Employee information completed', 10),
  ('emergency_contact', 'Emergency contact completed', 20),
  ('platform_account', 'Platform account approved', 30),
  ('role_assigned', 'Role assigned', 40),
  ('policies_acknowledged', 'Company policies acknowledged', 50),
  ('safety_orientation', 'Safety orientation completed', 60),
  ('ppe_issued', 'PPE issued', 70),
  ('equipment_orientation', 'Equipment orientation completed', 80),
  ('time_clock_training', 'Time-clock training completed', 90),
  ('schedule_crew', 'Schedule and crew assigned', 100),
  ('licenses_reviewed', 'Required licenses or certifications reviewed', 110),
  ('documents_uploaded', 'Required documents uploaded', 120),
  ('supervisor_signoff', 'Supervisor sign-off completed', 130)
on conflict (item_key) do update set label = excluded.label, sort_order = excluded.sort_order;

insert into public.credential_types (type_key, label, default_warning_days) values
  ('isa_arborist', 'ISA Certified Arborist', 90), ('isa_tree_worker', 'ISA Tree Worker', 90),
  ('cdl', 'Commercial driver license', 60), ('drivers_license', 'Driver license', 60),
  ('dot_medical', 'DOT medical card', 60), ('first_aid', 'First aid', 30),
  ('cpr', 'CPR', 30), ('aerial_lift', 'Aerial-lift training', 30),
  ('chainsaw', 'Chainsaw training', 30), ('chipper', 'Chipper training', 30),
  ('crane', 'Crane qualification', 60), ('pesticide', 'Pesticide/applicator credential', 90),
  ('traffic_control', 'Traffic-control training', 30), ('climbing_rescue', 'Climbing and rescue training', 30),
  ('equipment_specific', 'Equipment-specific qualification', 30), ('other', 'Other qualification', 30)
on conflict (type_key) do update set label = excluded.label;

create or replace function app_private.seed_employee_onboarding(p_employee_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.employee_onboarding_items (employee_id, template_id, item_key, label, sort_order)
  select p_employee_id, template.id, template.item_key, template.label, template.sort_order
  from public.onboarding_templates template where template.is_active
  on conflict (employee_id, item_key) do nothing;
$$;
revoke all on function app_private.seed_employee_onboarding(uuid) from public, anon, authenticated, service_role;

create or replace function app_private.employee_record_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin perform app_private.seed_employee_onboarding(new.id); return new; end;
$$;
revoke all on function app_private.employee_record_after_insert() from public, anon, authenticated, service_role;
create trigger employee_records_seed_onboarding after insert on public.employee_records for each row execute function app_private.employee_record_after_insert();

create or replace function app_private.sync_employee_from_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.employee_records set auth_user_id = new.id, manual_review_required = true
  where id = (
    select employee.id from public.employee_records employee
    where employee.auth_user_id is null and employee.contact_email is not null
      and lower(employee.contact_email) = lower(new.email) and employee.archived_at is null
    order by employee.created_at limit 1
  );
  if not found and new.user_type in ('owner', 'admin', 'estimator', 'crew') then
    insert into public.employee_records (auth_user_id, legal_name, preferred_name, contact_email, contact_phone, employment_status, manual_review_required)
    values (new.id, new.full_name, new.full_name, new.email, new.phone, case when new.status = 'active' then 'active' else 'onboarding' end, true)
    on conflict (auth_user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function app_private.sync_employee_from_profile() from public, anon, authenticated, service_role;
create trigger profiles_sync_employee_record after insert or update of email on public.profiles for each row execute function app_private.sync_employee_from_profile();

insert into public.employee_records (auth_user_id, legal_name, preferred_name, contact_email, contact_phone, employment_status, manual_review_required)
select profile.id, profile.full_name, profile.full_name, profile.email, profile.phone,
  case when profile.status = 'active' then 'active' else 'onboarding' end, true
from public.profiles profile
where exists (
  select 1 from public.user_roles user_role join public.roles role on role.id = user_role.role_id
  where user_role.user_id = profile.id and role.name in ('owner', 'admin', 'payroll_admin', 'estimator', 'crew')
)
on conflict (auth_user_id) do nothing;

do $$ declare employee_row record; begin
  for employee_row in select id from public.employee_records loop perform app_private.seed_employee_onboarding(employee_row.id); end loop;
end $$;

-- RLS: direct table access is staff-only. Employee self-service uses narrow RPCs.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'employee_records', 'employee_private_records', 'employee_emergency_contacts', 'onboarding_templates',
    'employee_onboarding_items', 'credential_types', 'employee_credentials',
    'qualification_requirements', 'training_sessions', 'training_attendees',
    'safety_meetings', 'safety_meeting_attendees', 'employee_program_files', 'employee_acknowledgments',
    'employee_documents', 'employee_requests', 'employee_separation_items'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select, insert, update on public.%I to authenticated, service_role', table_name);
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'employee_records', 'employee_emergency_contacts', 'onboarding_templates',
    'employee_onboarding_items', 'credential_types', 'employee_credentials',
    'qualification_requirements', 'training_sessions', 'training_attendees',
    'safety_meetings', 'safety_meeting_attendees', 'employee_program_files', 'employee_acknowledgments',
    'employee_requests', 'employee_separation_items'
  ] loop
    execute format('create policy %I on public.%I for all to authenticated using (app_private.has_staff_role()) with check (app_private.has_staff_role())', 'Staff manage ' || table_name, table_name);
  end loop;
end $$;

create policy "Admins manage private employee notes" on public.employee_private_records for all to authenticated
  using (app_private.has_platform_admin_role()) with check (app_private.has_platform_admin_role());

create policy "Admins manage all employee documents" on public.employee_documents for all to authenticated
  using (app_private.has_platform_admin_role()) with check (app_private.has_platform_admin_role());
create policy "Operational staff read non-owner employee documents" on public.employee_documents for select to authenticated
  using (app_private.has_staff_role() and access_classification in ('employee_visible', 'supervisor_visible'));
create policy "Operational staff create non-owner employee documents" on public.employee_documents for insert to authenticated
  with check (app_private.has_staff_role() and access_classification in ('employee_visible', 'supervisor_visible'));
create policy "Operational staff update non-owner employee documents" on public.employee_documents for update to authenticated
  using (app_private.has_staff_role() and access_classification in ('employee_visible', 'supervisor_visible'))
  with check (app_private.has_staff_role() and access_classification in ('employee_visible', 'supervisor_visible'));

create or replace function app_private.current_employee_id()
returns uuid language sql security definer set search_path = '' stable as $$
  select id from public.employee_records where auth_user_id = (select auth.uid()) and archived_at is null limit 1;
$$;
revoke all on function app_private.current_employee_id() from public, anon, authenticated, service_role;

create or replace function app_private.supervises_employee(p_employee_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  with supervisor as (
    select id, crew_name, is_supervisor from public.employee_records
    where id = app_private.current_employee_id() and archived_at is null
  )
  select exists (
    select 1 from supervisor join public.employee_records employee
      on employee.id = p_employee_id and employee.archived_at is null
    where supervisor.is_supervisor and (
      employee.supervisor_employee_id = supervisor.id
      or (supervisor.crew_name is not null and employee.crew_name = supervisor.crew_name)
    )
  );
$$;
revoke all on function app_private.supervises_employee(uuid) from public, anon, authenticated, service_role;
grant execute on function app_private.supervises_employee(uuid) to authenticated, service_role;

create policy "Supervisors read team operational documents" on public.employee_documents for select to authenticated
  using (access_classification in ('employee_visible', 'supervisor_visible') and app_private.supervises_employee(employee_id));

create or replace function public.get_my_employee_self_service()
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object(
    'employee', jsonb_build_object(
      'id', employee.id, 'legal_name', employee.legal_name, 'preferred_name', employee.preferred_name,
      'employee_number', employee.employee_number, 'contact_email', employee.contact_email,
      'contact_phone', employee.contact_phone, 'home_address', employee.home_address,
      'hire_date', employee.hire_date, 'employment_status', employee.employment_status,
      'job_title', employee.job_title, 'department', employee.department, 'crew_name', employee.crew_name,
      'preferred_language', employee.preferred_language, 'is_supervisor', employee.is_supervisor
    ),
    'onboarding', coalesce((select jsonb_agg(jsonb_build_object('id', item.id, 'label', item.label, 'status', item.completion_status, 'notes', item.notes) order by item.sort_order) from public.employee_onboarding_items item where item.employee_id = employee.id), '[]'::jsonb),
    'credentials', coalesce((select jsonb_agg(jsonb_build_object('id', credential.id, 'type', credential_type.label, 'issue_date', credential.issue_date, 'expiration_date', credential.expiration_date, 'status', credential.status, 'verified_at', credential.verified_at) order by credential_type.label) from public.employee_credentials credential join public.credential_types credential_type on credential_type.id = credential.credential_type_id where credential.employee_id = employee.id and credential.archived_at is null), '[]'::jsonb),
    'training', coalesce((select jsonb_agg(jsonb_build_object('id', session.id, 'title', session.title, 'starts_at', session.starts_at, 'result', attendee.result, 'refresher_due_at', session.refresher_due_at, 'document_version', session.document_version, 'acknowledged_at', (select acknowledgment.acknowledged_at from public.employee_acknowledgments acknowledgment where acknowledgment.employee_id = employee.id and acknowledgment.subject_type = 'training_session' and acknowledgment.subject_id = session.id and acknowledgment.subject_version = coalesce(nullif(session.document_version, ''), session.id::text) limit 1)) order by session.starts_at desc) from public.training_attendees attendee join public.training_sessions session on session.id = attendee.training_session_id where attendee.employee_id = employee.id and session.archived_at is null), '[]'::jsonb),
    'safety_meetings', coalesce((select jsonb_agg(jsonb_build_object('id', meeting.id, 'title', meeting.title, 'starts_at', meeting.starts_at, 'attendance_status', attendee.attendance_status, 'acknowledged_at', (select acknowledgment.acknowledged_at from public.employee_acknowledgments acknowledgment where acknowledgment.employee_id = employee.id and acknowledgment.subject_type = 'safety_meeting' and acknowledgment.subject_id = meeting.id and acknowledgment.subject_version = coalesce(nullif(meeting.document_version, ''), meeting.id::text) limit 1), 'document_version', meeting.document_version) order by meeting.starts_at desc) from public.safety_meeting_attendees attendee join public.safety_meetings meeting on meeting.id = attendee.safety_meeting_id where attendee.employee_id = employee.id and meeting.archived_at is null), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', document.id, 'title', document.title, 'document_type', document.document_type, 'expiration_date', document.expiration_date, 'review_status', document.review_status, 'storage_path', document.storage_path) order by document.created_at desc) from public.employee_documents document where document.employee_id = employee.id and document.access_classification = 'employee_visible' and document.archived_at is null), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', request.id, 'request_type', request.request_type, 'title', request.title, 'status', request.status, 'review_notes', request.review_notes, 'created_at', request.created_at) order by request.created_at desc) from public.employee_requests request where request.employee_id = employee.id), '[]'::jsonb),
    'issued_equipment', coalesce((select jsonb_agg(jsonb_build_object('assignment_id', assignment.id, 'asset_id', asset.id, 'asset_number', asset.asset_number, 'name', asset.name, 'category', asset.category, 'condition', assignment.notes, 'assigned_at', assignment.starts_at, 'expected_return_at', assignment.ends_at, 'returned_at', assignment.returned_at) order by assignment.starts_at desc) from public.equipment_assignments assignment join public.equipment_assets asset on asset.id = assignment.asset_id where assignment.assigned_user_id = employee.auth_user_id), '[]'::jsonb)
  ) from public.employee_records employee where employee.id = app_private.current_employee_id();
$$;
revoke all on function public.get_my_employee_self_service() from public, anon, authenticated, service_role;
grant execute on function public.get_my_employee_self_service() to authenticated, service_role;

create or replace function public.get_my_supervised_team()
returns jsonb language sql security definer set search_path = '' stable as $$
  with supervisor as (
    select id, crew_name, is_supervisor from public.employee_records
    where id = app_private.current_employee_id() and archived_at is null
  )
  select jsonb_build_object(
    'is_supervisor', coalesce((select is_supervisor from supervisor), false),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', employee.id, 'preferred_name', employee.preferred_name, 'legal_name', employee.legal_name,
        'job_title', employee.job_title, 'crew_name', employee.crew_name, 'employment_status', employee.employment_status,
        'onboarding_progress', coalesce((select round(100.0 * count(*) filter (where item.completion_status <> 'incomplete') / nullif(count(*), 0)) from public.employee_onboarding_items item where item.employee_id = employee.id), 0),
        'credentials', coalesce((select jsonb_agg(jsonb_build_object('label', credential_type.label, 'status', credential.status, 'expiration_date', credential.expiration_date) order by credential_type.label) from public.employee_credentials credential join public.credential_types credential_type on credential_type.id = credential.credential_type_id where credential.employee_id = employee.id and credential.archived_at is null), '[]'::jsonb),
        'training_count', (select count(*) from public.training_attendees attendee where attendee.employee_id = employee.id),
        'pending_safety_acknowledgments', (select count(*) from public.safety_meeting_attendees attendee where attendee.employee_id = employee.id and attendee.attendance_status = 'present' and attendee.acknowledged_at is null)
      ) order by coalesce(employee.preferred_name, employee.legal_name))
      from public.employee_records employee cross join supervisor
      where supervisor.is_supervisor and employee.id <> supervisor.id and employee.archived_at is null
        and (employee.supervisor_employee_id = supervisor.id or (supervisor.crew_name is not null and employee.crew_name = supervisor.crew_name))
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.get_my_supervised_team() from public, anon, authenticated, service_role;
grant execute on function public.get_my_supervised_team() to authenticated, service_role;

create or replace function public.submit_my_employee_request(p_request_type text, p_title text, p_details text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare employee_id uuid := app_private.current_employee_id(); request_id uuid;
begin
  if employee_id is null then raise exception 'No employee record is linked to this account.'; end if;
  if p_request_type not in ('profile_correction', 'credential_renewal', 'training_request', 'document_review', 'other') then raise exception 'Choose a valid request type.'; end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_details), '') is null then raise exception 'Request title and details are required.'; end if;
  insert into public.employee_requests (employee_id, request_type, title, details, submitted_by_user_id)
  values (employee_id, p_request_type, left(btrim(p_title), 180), left(btrim(p_details), 3000), (select auth.uid())) returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.submit_my_employee_request(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.submit_my_employee_request(text, text, text) to authenticated, service_role;

create or replace function public.acknowledge_my_employee_item(p_subject_type text, p_subject_id uuid, p_subject_version text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare current_employee_id uuid := app_private.current_employee_id(); acknowledgment_id uuid;
begin
  if current_employee_id is null then raise exception 'No employee record is linked to this account.'; end if;
  if p_subject_type not in ('onboarding_item', 'training_session', 'safety_meeting', 'employee_document') then raise exception 'Choose a valid acknowledgment subject.'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Type your name to acknowledge this item.'; end if;
  if p_subject_type = 'onboarding_item' and not exists (select 1 from public.employee_onboarding_items where employee_id = current_employee_id and id = p_subject_id) then raise exception 'Onboarding item is not assigned to this employee.'; end if;
  if p_subject_type = 'training_session' and not exists (select 1 from public.training_attendees where employee_id = current_employee_id and training_session_id = p_subject_id) then raise exception 'Training is not assigned to this employee.'; end if;
  if p_subject_type = 'safety_meeting' and not exists (select 1 from public.safety_meeting_attendees where employee_id = current_employee_id and safety_meeting_id = p_subject_id) then raise exception 'Safety meeting is not assigned to this employee.'; end if;
  if p_subject_type = 'employee_document' and not exists (select 1 from public.employee_documents where employee_id = current_employee_id and id = p_subject_id and access_classification = 'employee_visible') then raise exception 'Document is not available to this employee.'; end if;
  insert into public.employee_acknowledgments (employee_id, subject_type, subject_id, subject_version, acknowledgment_name, acknowledgment_method, acknowledged_by_auth_user_id)
  values (current_employee_id, p_subject_type, p_subject_id, coalesce(nullif(p_subject_version, ''), '1'), left(btrim(p_name), 180), 'employee_account', (select auth.uid()))
  on conflict (employee_id, subject_type, subject_id, subject_version) do nothing
  returning id into acknowledgment_id;
  if acknowledgment_id is null then
    select id into acknowledgment_id from public.employee_acknowledgments
    where employee_id = current_employee_id and subject_type = p_subject_type and subject_id = p_subject_id
      and subject_version = coalesce(nullif(p_subject_version, ''), '1');
  end if;
  if p_subject_type = 'training_session' then update public.training_attendees set acknowledged_at = now(), acknowledgment_name = left(btrim(p_name), 180) where employee_id = current_employee_id and training_session_id = p_subject_id; end if;
  if p_subject_type = 'safety_meeting' then update public.safety_meeting_attendees set acknowledged_at = now(), acknowledgment_name = left(btrim(p_name), 180) where employee_id = current_employee_id and safety_meeting_id = p_subject_id; end if;
  return acknowledgment_id;
end;
$$;
revoke all on function public.acknowledge_my_employee_item(text, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.acknowledge_my_employee_item(text, uuid, text, text) to authenticated, service_role;

create or replace function public.submit_my_employee_document(
  p_document_type text, p_title text, p_storage_path text, p_mime_type text,
  p_file_size_bytes bigint, p_issue_date date default null, p_expiration_date date default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare current_employee_id uuid := app_private.current_employee_id(); document_id uuid;
begin
  if current_employee_id is null then raise exception 'No employee record is linked to this account.'; end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_storage_path), '') is null then raise exception 'Document title and file are required.'; end if;
  if split_part(p_storage_path, '/', 1) <> current_employee_id::text then raise exception 'Document path does not match this employee.'; end if;
  insert into public.employee_documents (employee_id, document_type, title, storage_path, mime_type, file_size_bytes, issue_date, expiration_date, access_classification, review_status, uploaded_by_user_id)
  values (current_employee_id, left(btrim(p_document_type), 80), left(btrim(p_title), 180), p_storage_path, p_mime_type, p_file_size_bytes, p_issue_date, p_expiration_date, 'employee_visible', 'pending', (select auth.uid()))
  returning id into document_id;
  return document_id;
end;
$$;
revoke all on function public.submit_my_employee_document(text, text, text, text, bigint, date, date) from public, anon, authenticated, service_role;
grant execute on function public.submit_my_employee_document(text, text, text, text, bigint, date, date) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-files', 'employee-files', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-program-files', 'employee-program-files', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false;

create or replace function app_private.can_upload_employee_path(p_name text)
returns boolean language plpgsql security definer set search_path = '' stable as $$
declare employee_id uuid;
begin
  employee_id := ((storage.foldername(p_name))[1])::uuid;
  return app_private.has_staff_role() or employee_id = app_private.current_employee_id();
exception when others then return false;
end;
$$;
revoke all on function app_private.can_upload_employee_path(text) from public, anon, authenticated, service_role;
grant execute on function app_private.can_upload_employee_path(text) to authenticated, service_role;

create or replace function app_private.can_read_employee_path(p_name text)
returns boolean language plpgsql security definer set search_path = '' stable as $$
declare current_employee_id uuid := app_private.current_employee_id();
begin
  if app_private.has_platform_admin_role() then return true; end if;
  if app_private.has_staff_role() and (storage.foldername(p_name))[2] = 'profile' then return true; end if;
  return exists (
    select 1 from public.employee_documents document
    where document.storage_path = p_name and document.archived_at is null and (
      (app_private.has_staff_role() and document.access_classification in ('employee_visible', 'supervisor_visible'))
      or (document.employee_id = current_employee_id and document.access_classification = 'employee_visible')
      or (document.access_classification in ('employee_visible', 'supervisor_visible') and app_private.supervises_employee(document.employee_id))
    )
  );
end;
$$;
revoke all on function app_private.can_read_employee_path(text) from public, anon, authenticated, service_role;
grant execute on function app_private.can_read_employee_path(text) to authenticated, service_role;

create policy "Authorized users read employee files" on storage.objects for select to authenticated using (bucket_id = 'employee-files' and app_private.can_read_employee_path(name));
create policy "Staff upload employee files" on storage.objects for insert to authenticated with check (bucket_id = 'employee-files' and app_private.has_staff_role());
create policy "Employees upload their own review files" on storage.objects for insert to authenticated with check (bucket_id = 'employee-files' and app_private.can_upload_employee_path(name));
create policy "Staff read employee program files" on storage.objects for select to authenticated using (bucket_id = 'employee-program-files' and app_private.has_staff_role());
create policy "Staff upload employee program files" on storage.objects for insert to authenticated with check (bucket_id = 'employee-program-files' and app_private.has_staff_role());

comment on table public.employee_records is 'Operational employment record linked optionally to an auth profile. Auth deletion must not remove this record.';
comment on table public.employee_acknowledgments is 'Append-only acknowledgment history by subject version; not a legal waiver.';
comment on table public.qualification_requirements is 'Configurable operational warning mapping, not a legal compliance determination engine.';
comment on table public.employee_program_files is 'Operational training and safety attachments only. Sensitive HR documents belong in employee_documents.';
