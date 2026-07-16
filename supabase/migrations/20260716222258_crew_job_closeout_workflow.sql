-- Mobile crew job closeout and office review workflow.
--
-- Closeouts are private operational records. Crew access is limited to the
-- work order assigned to auth.uid(); office roles retain the existing staff
-- access model. Pricing remains in quote/invoice tables and is never copied
-- into the crew-facing scope snapshot.

alter table public.jobs
  drop constraint if exists jobs_status_check;

alter table public.jobs
  add constraint jobs_status_check check (
    status in (
      'new_lead',
      'estimate_scheduled',
      'quoted',
      'accepted',
      'scheduled',
      'in_progress',
      'returned_for_correction',
      'completed_pending_review',
      'ready_to_invoice',
      'completed',
      'invoiced',
      'paid',
      'lost',
      'cancelled'
    )
  );

alter table public.jobs
  add column if not exists started_at timestamptz,
  add column if not exists started_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists completed_by_user_id uuid references public.profiles(id) on delete set null;

alter policy "Crew can read visible notes for assigned jobs" on public.notes
  using (
    visibility in ('crew_visible', 'customer_visible')
    and exists (
      select 1 from public.jobs
      where jobs.id = notes.job_id
        and jobs.assigned_crew_user_id = (select auth.uid())
    )
  );

alter table public.job_photos
  drop constraint if exists job_photos_photo_type_check;

alter table public.job_photos
  add constraint job_photos_photo_type_check check (
    photo_type in (
      'before', 'during', 'after', 'customer_upload', 'estimate', 'job',
      'issue', 'completion', 'equipment_access'
    )
  );

create table public.job_closeouts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  status text not null default 'draft' check (
    status in ('draft', 'submitted', 'returned', 'approved', 'ready_to_invoice')
  ),
  crew_internal_notes text,
  customer_summary text,
  incident_occurred boolean,
  incident_description text,
  additional_work_requested boolean,
  additional_work_description text,
  acknowledgment_status text check (
    acknowledgment_status is null
    or acknowledgment_status in ('acknowledged', 'customer_not_present', 'customer_declined')
  ),
  acknowledgment_name text,
  acknowledged_at timestamptz,
  acknowledgment_collected_by_user_id uuid references public.profiles(id) on delete set null,
  has_scope_exception boolean not null default false,
  has_incident boolean not null default false,
  has_additional_work boolean not null default false,
  submitted_at timestamptz,
  submitted_by_user_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  review_notes text,
  reopened_at timestamptz,
  reopened_by_user_id uuid references public.profiles(id) on delete set null,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_closeout_checklist_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  item_key text not null,
  label text not null,
  sort_order integer not null default 0,
  is_required boolean not null default true,
  allow_not_applicable boolean not null default false,
  completion_status text not null default 'pending' check (
    completion_status in ('pending', 'complete', 'not_applicable')
  ),
  explanation text,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, item_key)
);

create table public.job_closeout_scope_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  source_key text not null,
  quote_line_item_id uuid references public.quote_line_items(id) on delete set null,
  title text not null,
  description text,
  sort_order integer not null default 0,
  completion_state text check (
    completion_state is null
    or completion_state in ('completed', 'partially_completed', 'not_completed', 'change_required')
  ),
  exception_note text,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, source_key)
);

create table public.job_closeout_submissions (
  id uuid primary key default gen_random_uuid(),
  closeout_id uuid not null references public.job_closeouts(id) on delete cascade,
  revision_number integer not null,
  submitted_by_user_id uuid references public.profiles(id) on delete set null,
  snapshot_json jsonb not null,
  submitted_at timestamptz not null default now(),
  unique (closeout_id, revision_number)
);

create trigger job_closeouts_set_updated_at
  before update on public.job_closeouts
  for each row execute function public.set_updated_at();

create trigger job_closeout_checklist_items_set_updated_at
  before update on public.job_closeout_checklist_items
  for each row execute function public.set_updated_at();

create trigger job_closeout_scope_items_set_updated_at
  before update on public.job_closeout_scope_items
  for each row execute function public.set_updated_at();

create index job_closeouts_status_idx on public.job_closeouts(status, submitted_at desc);
create index job_closeout_checklist_job_idx on public.job_closeout_checklist_items(job_id, sort_order);
create index job_closeout_scope_job_idx on public.job_closeout_scope_items(job_id, sort_order);
create index job_closeout_submissions_closeout_idx on public.job_closeout_submissions(closeout_id, revision_number desc);
create index jobs_closeout_queue_idx on public.jobs(status, completed_at desc)
  where status in ('completed_pending_review', 'ready_to_invoice', 'returned_for_correction');

create or replace function app_private.seed_job_closeout(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_job public.jobs%rowtype;
begin
  select * into source_job from public.jobs where id = p_job_id;
  if source_job.id is null then
    return;
  end if;

  insert into public.job_closeouts (job_id)
  values (p_job_id)
  on conflict (job_id) do nothing;

  insert into public.job_closeout_checklist_items
    (job_id, item_key, label, sort_order, is_required, allow_not_applicable)
  values
    (p_job_id, 'scope_completed', 'Approved scope completed', 10, true, false),
    (p_job_id, 'work_area_cleaned', 'Work area cleaned', 20, true, false),
    (p_job_id, 'debris_handled', 'Brush and debris handled as quoted', 30, true, true),
    (p_job_id, 'wood_handled', 'Wood handled as quoted', 40, true, true),
    (p_job_id, 'tools_removed', 'Equipment and tools removed', 50, true, false),
    (p_job_id, 'property_checked', 'Property checked for visible damage', 60, true, false),
    (p_job_id, 'gates_restored', 'Gates and fences returned to prior condition', 70, true, true),
    (p_job_id, 'customer_notified', 'Customer notified that work is complete', 80, true, true),
    (p_job_id, 'after_photos', 'After photos uploaded', 90, true, false),
    (p_job_id, 'crew_notes', 'Crew completion notes completed', 100, true, false)
  on conflict (job_id, item_key) do nothing;

  insert into public.job_closeout_scope_items
    (job_id, source_key, quote_line_item_id, title, description, sort_order)
  select
    p_job_id,
    quote_line.id::text,
    quote_line.id,
    quote_line.name,
    quote_line.description,
    quote_line.sort_order
  from public.quote_line_items quote_line
  where quote_line.quote_id = source_job.source_quote_id
  on conflict (job_id, source_key) do nothing;

  if not exists (select 1 from public.job_closeout_scope_items where job_id = p_job_id) then
    insert into public.job_closeout_scope_items
      (job_id, source_key, title, description, sort_order)
    values (
      p_job_id,
      'job-scope',
      coalesce(nullif(replace(source_job.service_type, '_', ' '), ''), 'Approved work'),
      source_job.requested_scope,
      0
    )
    on conflict (job_id, source_key) do nothing;
  end if;
end;
$$;

revoke all on function app_private.seed_job_closeout(uuid) from public, anon, authenticated, service_role;

create or replace function app_private.seed_job_closeout_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.seed_job_closeout(new.id);
  return new;
end;
$$;

revoke all on function app_private.seed_job_closeout_trigger() from public, anon, authenticated, service_role;

create trigger jobs_seed_closeout
  after insert or update of source_quote_id on public.jobs
  for each row execute function app_private.seed_job_closeout_trigger();

do $$
declare
  job_row record;
begin
  for job_row in select id from public.jobs loop
    perform app_private.seed_job_closeout(job_row.id);
  end loop;
end $$;

create or replace function public.start_assigned_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_user_id uuid := (select auth.uid());
  target_job public.jobs%rowtype;
begin
  if acting_user_id is null then
    raise exception 'Sign in before starting work.';
  end if;

  select * into target_job from public.jobs where id = p_job_id for update;
  if target_job.id is null then
    raise exception 'Work order not found.';
  end if;
  if target_job.assigned_crew_user_id is distinct from acting_user_id
     and not app_private.has_staff_role() then
    raise exception 'This work order is not assigned to this crew account.';
  end if;
  if target_job.status <> 'scheduled' then
    raise exception 'Only a scheduled work order can be started.';
  end if;
  if exists (
    select 1 from public.time_entries
    where user_id = acting_user_id
      and status = 'active'
      and clock_out_at is null
      and job_id is distinct from p_job_id
  ) then
    raise exception 'Clock out of the current timer before starting another job.';
  end if;

  update public.jobs
  set status = 'in_progress',
      started_at = coalesce(started_at, now()),
      started_by_user_id = coalesce(started_by_user_id, acting_user_id)
  where id = p_job_id;

  insert into public.activity_log
    (actor_user_id, subject_type, subject_id, event_type, metadata_json)
  values (acting_user_id, 'job', p_job_id, 'work_started', '{}'::jsonb);

  return jsonb_build_object('status', 'in_progress');
end;
$$;

revoke all on function public.start_assigned_job(uuid) from public, anon, authenticated, service_role;
grant execute on function public.start_assigned_job(uuid) to authenticated, service_role;

create or replace function public.save_assigned_job_closeout(p_job_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_user_id uuid := (select auth.uid());
  target_closeout public.job_closeouts%rowtype;
begin
  if acting_user_id is null then
    raise exception 'Sign in before saving this closeout.';
  end if;
  if not exists (
    select 1 from public.jobs
    where id = p_job_id
      and (assigned_crew_user_id = acting_user_id or app_private.has_staff_role())
  ) then
    raise exception 'This work order is not assigned to this crew account.';
  end if;

  perform app_private.seed_job_closeout(p_job_id);
  select * into target_closeout from public.job_closeouts where job_id = p_job_id for update;
  if target_closeout.status not in ('draft', 'returned') then
    raise exception 'This closeout is locked. Ask the office to reopen it before making changes.';
  end if;

  update public.job_closeouts
  set crew_internal_notes = nullif(left(trim(coalesce(p_payload ->> 'crew_internal_notes', '')), 5000), ''),
      customer_summary = nullif(left(trim(coalesce(p_payload ->> 'customer_summary', '')), 5000), ''),
      incident_occurred = case when p_payload ? 'incident_occurred' then (p_payload ->> 'incident_occurred')::boolean else null end,
      incident_description = nullif(left(trim(coalesce(p_payload ->> 'incident_description', '')), 5000), ''),
      additional_work_requested = case when p_payload ? 'additional_work_requested' then (p_payload ->> 'additional_work_requested')::boolean else null end,
      additional_work_description = nullif(left(trim(coalesce(p_payload ->> 'additional_work_description', '')), 5000), ''),
      acknowledgment_status = nullif(p_payload ->> 'acknowledgment_status', ''),
      acknowledgment_name = nullif(left(trim(coalesce(p_payload ->> 'acknowledgment_name', '')), 200), ''),
      acknowledged_at = case
        when p_payload ->> 'acknowledgment_status' = 'acknowledged' then coalesce(acknowledged_at, now())
        else null
      end,
      acknowledgment_collected_by_user_id = case
        when p_payload ->> 'acknowledgment_status' = 'acknowledged' then acting_user_id
        else null
      end
  where job_id = p_job_id;

  update public.job_closeout_checklist_items checklist
  set completion_status = payload_item.completion_status,
      explanation = nullif(left(trim(coalesce(payload_item.explanation, '')), 1000), ''),
      updated_by_user_id = acting_user_id
  from jsonb_to_recordset(coalesce(p_payload -> 'checklist', '[]'::jsonb))
    as payload_item(id uuid, completion_status text, explanation text)
  where checklist.id = payload_item.id
    and checklist.job_id = p_job_id
    and payload_item.completion_status in ('pending', 'complete', 'not_applicable')
    and (payload_item.completion_status <> 'not_applicable' or checklist.allow_not_applicable);

  update public.job_closeout_scope_items scope_item
  set completion_state = nullif(payload_item.completion_state, ''),
      exception_note = nullif(left(trim(coalesce(payload_item.exception_note, '')), 2000), ''),
      updated_by_user_id = acting_user_id
  from jsonb_to_recordset(coalesce(p_payload -> 'scope_items', '[]'::jsonb))
    as payload_item(id uuid, completion_state text, exception_note text)
  where scope_item.id = payload_item.id
    and scope_item.job_id = p_job_id
    and (payload_item.completion_state is null or payload_item.completion_state in ('completed', 'partially_completed', 'not_completed', 'change_required'));

  insert into public.activity_log
    (actor_user_id, subject_type, subject_id, event_type, metadata_json)
  values (acting_user_id, 'job', p_job_id, 'closeout_draft_updated', '{}'::jsonb);

  return jsonb_build_object('status', 'saved');
end;
$$;

revoke all on function public.save_assigned_job_closeout(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_assigned_job_closeout(uuid, jsonb) to authenticated, service_role;

create or replace function public.submit_assigned_job_closeout(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_user_id uuid := (select auth.uid());
  target_closeout public.job_closeouts%rowtype;
  next_revision integer;
  scope_exception boolean;
begin
  if acting_user_id is null then
    raise exception 'Sign in before submitting this closeout.';
  end if;
  if not exists (
    select 1 from public.jobs
    where id = p_job_id
      and status in ('in_progress', 'returned_for_correction')
      and (assigned_crew_user_id = acting_user_id or app_private.has_staff_role())
  ) then
    raise exception 'This work order is not assigned or is not ready for closeout.';
  end if;

  select * into target_closeout from public.job_closeouts where job_id = p_job_id for update;
  if target_closeout.status not in ('draft', 'returned') then
    raise exception 'This closeout has already been submitted.';
  end if;
  if exists (
    select 1 from public.job_closeout_checklist_items
    where job_id = p_job_id
      and is_required
      and (
        completion_status = 'pending'
        or (completion_status = 'not_applicable' and nullif(trim(explanation), '') is null)
      )
  ) then
    raise exception 'Complete every required checklist item. Add a reason for anything marked not applicable.';
  end if;
  if not exists (
    select 1 from public.job_photos
    where job_id = p_job_id and photo_type in ('after', 'completion')
  ) then
    raise exception 'Upload at least one after or completion photo before submitting.';
  end if;
  if exists (
    select 1 from public.job_closeout_scope_items
    where job_id = p_job_id
      and (
        completion_state is null
        or (completion_state <> 'completed' and nullif(trim(exception_note), '') is null)
      )
  ) then
    raise exception 'Mark every scope item and explain anything not fully completed.';
  end if;
  if target_closeout.incident_occurred is null then
    raise exception 'Answer the incident question before submitting.';
  end if;
  if target_closeout.incident_occurred
     and nullif(trim(target_closeout.incident_description), '') is null then
    raise exception 'Describe the incident before submitting.';
  end if;
  if target_closeout.incident_occurred
     and not exists (select 1 from public.job_photos where job_id = p_job_id and photo_type = 'issue') then
    raise exception 'Upload an issue photo to support the incident report.';
  end if;
  if target_closeout.additional_work_requested is null then
    raise exception 'Answer whether the customer requested additional work.';
  end if;
  if target_closeout.additional_work_requested
     and nullif(trim(target_closeout.additional_work_description), '') is null then
    raise exception 'Describe the additional work request before submitting.';
  end if;
  if target_closeout.acknowledgment_status is null then
    raise exception 'Choose a customer acknowledgment status.';
  end if;
  if target_closeout.acknowledgment_status = 'acknowledged'
     and nullif(trim(target_closeout.acknowledgment_name), '') is null then
    raise exception 'Enter the customer name for acknowledgment.';
  end if;

  select exists (
    select 1 from public.job_closeout_scope_items
    where job_id = p_job_id and completion_state <> 'completed'
  ) into scope_exception;

  update public.job_closeouts
  set status = 'submitted',
      has_scope_exception = scope_exception,
      has_incident = incident_occurred,
      has_additional_work = additional_work_requested,
      submitted_at = now(),
      submitted_by_user_id = acting_user_id
  where id = target_closeout.id;

  select coalesce(max(revision_number), 0) + 1
  into next_revision
  from public.job_closeout_submissions
  where closeout_id = target_closeout.id;

  insert into public.job_closeout_submissions
    (closeout_id, revision_number, submitted_by_user_id, snapshot_json)
  select
    target_closeout.id,
    next_revision,
    acting_user_id,
    jsonb_build_object(
      'closeout', to_jsonb(closeout_row),
      'checklist', coalesce((select jsonb_agg(to_jsonb(checklist_row) order by sort_order) from public.job_closeout_checklist_items checklist_row where job_id = p_job_id), '[]'::jsonb),
      'scope_items', coalesce((select jsonb_agg(to_jsonb(scope_row) order by sort_order) from public.job_closeout_scope_items scope_row where job_id = p_job_id), '[]'::jsonb)
    )
  from public.job_closeouts closeout_row
  where closeout_row.id = target_closeout.id;

  update public.jobs
  set status = 'completed_pending_review',
      completed_at = coalesce(completed_at, now()),
      completed_by_user_id = acting_user_id
  where id = p_job_id;

  insert into public.activity_log
    (actor_user_id, subject_type, subject_id, event_type, metadata_json)
  values (
    acting_user_id,
    'job',
    p_job_id,
    'closeout_submitted',
    jsonb_build_object(
      'revision', next_revision,
      'scope_exception', scope_exception,
      'incident', target_closeout.incident_occurred,
      'additional_work_requested', target_closeout.additional_work_requested
    )
  );

  if target_closeout.incident_occurred then
    insert into public.activity_log
      (actor_user_id, subject_type, subject_id, event_type, metadata_json)
    values (acting_user_id, 'job', p_job_id, 'incident_reported', '{}'::jsonb);
  end if;

  if target_closeout.additional_work_requested then
    insert into public.activity_log
      (actor_user_id, subject_type, subject_id, event_type, metadata_json)
    values (acting_user_id, 'job', p_job_id, 'additional_work_requested', '{}'::jsonb);
  end if;

  return jsonb_build_object(
    'status', 'submitted',
    'revision', next_revision,
    'active_timer_exists', exists (
      select 1 from public.time_entries
      where user_id = acting_user_id and job_id = p_job_id and status = 'active' and clock_out_at is null
    )
  );
end;
$$;

revoke all on function public.submit_assigned_job_closeout(uuid) from public, anon, authenticated, service_role;
grant execute on function public.submit_assigned_job_closeout(uuid) to authenticated, service_role;

create or replace function public.review_job_closeout(p_job_id uuid, p_action text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_user_id uuid := (select auth.uid());
  target_closeout public.job_closeouts%rowtype;
  next_closeout_status text;
  next_job_status text;
  activity_event text;
  success_message text;
  clean_reason text := nullif(left(trim(coalesce(p_reason, '')), 2000), '');
begin
  if acting_user_id is null or not app_private.has_staff_role() then
    raise exception 'Only authorized office staff can review job closeouts.';
  end if;

  select * into target_closeout
  from public.job_closeouts
  where job_id = p_job_id
  for update;

  if target_closeout.id is null then
    raise exception 'Closeout not found.';
  end if;

  if p_action = 'approve' and target_closeout.status = 'submitted' then
    next_closeout_status := 'approved';
    next_job_status := 'completed_pending_review';
    activity_event := 'closeout_approved';
    success_message := 'Closeout approved. Review invoice readiness next.';
  elsif p_action = 'ready' and target_closeout.status = 'approved' then
    next_closeout_status := 'ready_to_invoice';
    next_job_status := 'ready_to_invoice';
    activity_event := 'work_order_ready_to_invoice';
    success_message := 'Work order marked ready to invoice.';
  elsif p_action = 'return' and target_closeout.status = 'submitted' then
    if clean_reason is null then
      raise exception 'Enter a reason before returning the closeout.';
    end if;
    next_closeout_status := 'returned';
    next_job_status := 'returned_for_correction';
    activity_event := 'closeout_returned';
    success_message := 'Closeout returned to crew for correction.';
  elsif p_action = 'reopen' and target_closeout.status in ('approved', 'ready_to_invoice') then
    if clean_reason is null then
      raise exception 'Enter a reason before reopening the closeout.';
    end if;
    next_closeout_status := 'returned';
    next_job_status := 'returned_for_correction';
    activity_event := 'closeout_reopened';
    success_message := 'Closeout reopened and returned to crew.';
  else
    raise exception 'That closeout review transition is not allowed.';
  end if;

  update public.job_closeouts
  set status = next_closeout_status,
      reviewed_at = case when p_action in ('approve', 'ready') then coalesce(reviewed_at, now()) else reviewed_at end,
      reviewed_by_user_id = case when p_action in ('approve', 'ready') then coalesce(reviewed_by_user_id, acting_user_id) else reviewed_by_user_id end,
      review_notes = case when p_action in ('approve', 'return', 'reopen') then clean_reason else review_notes end,
      reopened_at = case when p_action in ('return', 'reopen') then now() else reopened_at end,
      reopened_by_user_id = case when p_action in ('return', 'reopen') then acting_user_id else reopened_by_user_id end,
      reopen_reason = case when p_action in ('return', 'reopen') then clean_reason else reopen_reason end
  where id = target_closeout.id;

  update public.jobs set status = next_job_status where id = p_job_id;

  insert into public.activity_log
    (actor_user_id, subject_type, subject_id, event_type, metadata_json)
  values (
    acting_user_id,
    'job',
    p_job_id,
    activity_event,
    jsonb_build_object(
      'reason', clean_reason,
      'has_scope_exception', target_closeout.has_scope_exception,
      'has_incident', target_closeout.has_incident,
      'has_additional_work', target_closeout.has_additional_work
    )
  );

  return jsonb_build_object('status', next_closeout_status, 'message', success_message);
end;
$$;

revoke all on function public.review_job_closeout(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.review_job_closeout(uuid, text, text) to authenticated, service_role;

alter table public.job_closeouts enable row level security;
alter table public.job_closeout_checklist_items enable row level security;
alter table public.job_closeout_scope_items enable row level security;
alter table public.job_closeout_submissions enable row level security;

grant select, insert, update, delete on public.job_closeouts to authenticated, service_role;
grant select, insert, update, delete on public.job_closeout_checklist_items to authenticated, service_role;
grant select, insert, update, delete on public.job_closeout_scope_items to authenticated, service_role;
grant select, insert, update, delete on public.job_closeout_submissions to authenticated, service_role;

create policy "Office can manage job closeouts" on public.job_closeouts
  for all to authenticated
  using (app_private.has_staff_role())
  with check (app_private.has_staff_role());

create policy "Crew can read assigned job closeouts" on public.job_closeouts
  for select to authenticated
  using (exists (
    select 1 from public.jobs
    where jobs.id = job_closeouts.job_id
      and jobs.assigned_crew_user_id = (select auth.uid())
  ));

create policy "Office can manage closeout checklist" on public.job_closeout_checklist_items
  for all to authenticated
  using (app_private.has_staff_role())
  with check (app_private.has_staff_role());

create policy "Crew can read assigned closeout checklist" on public.job_closeout_checklist_items
  for select to authenticated
  using (exists (
    select 1 from public.jobs
    where jobs.id = job_closeout_checklist_items.job_id
      and jobs.assigned_crew_user_id = (select auth.uid())
  ));

create policy "Office can manage closeout scope items" on public.job_closeout_scope_items
  for all to authenticated
  using (app_private.has_staff_role())
  with check (app_private.has_staff_role());

create policy "Crew can read assigned closeout scope items" on public.job_closeout_scope_items
  for select to authenticated
  using (exists (
    select 1 from public.jobs
    where jobs.id = job_closeout_scope_items.job_id
      and jobs.assigned_crew_user_id = (select auth.uid())
  ));

create policy "Office can read closeout submissions" on public.job_closeout_submissions
  for select to authenticated
  using (app_private.has_staff_role());

create policy "Crew can read assigned closeout submissions" on public.job_closeout_submissions
  for select to authenticated
  using (exists (
    select 1
    from public.job_closeouts
    join public.jobs on jobs.id = job_closeouts.job_id
    where job_closeouts.id = job_closeout_submissions.closeout_id
      and jobs.assigned_crew_user_id = (select auth.uid())
  ));

create policy "Crew can log assigned job photo activity" on public.activity_log
  for insert to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and subject_type = 'job'
    and event_type = 'job_photo_uploaded'
    and exists (
      select 1 from public.jobs
      where jobs.id = activity_log.subject_id
        and jobs.assigned_crew_user_id = (select auth.uid())
    )
  );

comment on table public.job_closeouts is
  'Private crew closeout draft and office review state. Never expose through customer portal policies.';
comment on table public.job_closeout_submissions is
  'Immutable closeout submission snapshots retained across explicit office reopen cycles.';
