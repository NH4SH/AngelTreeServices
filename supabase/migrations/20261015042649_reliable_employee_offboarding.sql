-- PR02: account/employment revocation, retaining roles and historical assignments.
-- Reviewed live definitions matched the repository baseline on 2026-10-15.
-- Additive only. Do not apply without the migration reconciliation/review process.
begin;
create or replace function app_private.effective_platform_access(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = p_user_id and p.status = 'active')
    and not exists (select 1 from public.employee_records e where e.auth_user_id = p_user_id
      and (not e.is_active or e.employment_status in ('inactive', 'separated') or e.archived_at is not null));
$$;
revoke all on function app_private.effective_platform_access(uuid) from public, anon, authenticated;

-- The exposed function accepts no target ID and reveals only the caller's state.
create or replace function public.has_effective_platform_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.effective_platform_access((select auth.uid()));
$$;
revoke all on function public.has_effective_platform_access() from public, anon;
grant execute on function public.has_effective_platform_access() to authenticated;

CREATE OR REPLACE FUNCTION app_private.can_access_job_cost_receipt(object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $$
  select app_private.effective_platform_access((select auth.uid())) and (select app_private.has_financial_reporting_role()
    or exists (
      select 1
      from public.job_cost_entries cost
      where cost.receipt_storage_path = object_name
        and cost.submitted_by_user_id = (select auth.uid())
    ));
$$;

CREATE OR REPLACE FUNCTION app_private.can_submit_job_cost(p_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $$
  select app_private.effective_platform_access((select auth.uid())) and (select app_private.has_financial_reporting_role()
    or exists (
      select 1
      from public.jobs job
      where job.id = p_job_id
        and job.assigned_crew_user_id = (select auth.uid())
    ));
$$;

CREATE OR REPLACE FUNCTION app_private.can_use_assigned_equipment(p_asset_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $$
  select app_private.effective_platform_access((select auth.uid())) and (select app_private.has_staff_role() or exists (
    select 1
    from public.equipment_assignments assignment
    where assignment.asset_id = p_asset_id
      and assignment.assigned_user_id = (select auth.uid())
      and assignment.starts_at <= now()
      and coalesce(assignment.ends_at, now() + interval '1 day') >= now()
      and assignment.returned_at is null
  ));
$$;

CREATE OR REPLACE FUNCTION app_private.has_financial_reporting_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $$
  select app_private.effective_platform_access((select auth.uid())) and (select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin')
  ));
$$;

CREATE OR REPLACE FUNCTION app_private.has_platform_admin_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $$
  select app_private.effective_platform_access((select auth.uid())) and (select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin')
  ));
$$;

CREATE OR REPLACE FUNCTION app_private.has_schedule_admin_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $$
  select app_private.effective_platform_access((select auth.uid())) and (select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin')
  ));
$$;

CREATE OR REPLACE FUNCTION app_private.has_schedule_crew_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $$
  select app_private.effective_platform_access((select auth.uid())) and (select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin', 'estimator', 'crew')
  ));
$$;

CREATE OR REPLACE FUNCTION app_private.has_schedule_estimator_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $$
  select app_private.effective_platform_access((select auth.uid())) and (select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin', 'estimator')
  ));
$$;

CREATE OR REPLACE FUNCTION app_private.has_staff_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $$
  select app_private.effective_platform_access((select auth.uid())) and (select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin', 'estimator')
  ));
$$;

CREATE OR REPLACE FUNCTION app_private.has_time_clock_eligible_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $$
  select app_private.effective_platform_access((select auth.uid())) and (select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin', 'estimator', 'crew')
  ));
$$;

CREATE OR REPLACE FUNCTION app_private.has_time_clock_review_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $$
  select app_private.effective_platform_access((select auth.uid())) and (select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name in ('owner', 'admin', 'payroll_admin')
  ));
$$;

CREATE OR REPLACE FUNCTION app_private.is_assigned_to_job(_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $$
  select app_private.effective_platform_access((select auth.uid())) and (select exists (
    select 1
    from public.jobs as job
    where job.id = _job_id
      and (
        job.assigned_crew_user_id = (select auth.uid())
        or exists (
          select 1
          from public.employee_records as employee
          where employee.id = job.assigned_crew_employee_id
            and employee.auth_user_id = (select auth.uid())
            and employee.is_active = true
            and employee.archived_at is null
        )
        or exists (
          select 1
          from public.schedule_events as event
          join public.schedule_event_assignments as assignment on assignment.event_id = event.id
          left join public.employee_records as employee on employee.id = assignment.employee_id
          where event.job_id = job.id
            and event.event_type = 'job'
            and event.status <> 'cancelled'
            and (
              assignment.user_id = (select auth.uid())
              or (
                employee.auth_user_id = (select auth.uid())
                and employee.is_active = true
                and employee.archived_at is null
              )
            )
        )
      )
  ));
$$;

CREATE OR REPLACE FUNCTION app_private.is_schedule_event_assignee(_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $$
  select app_private.effective_platform_access((select auth.uid())) and (select exists (
    select 1
    from public.schedule_event_assignments sea
    where sea.event_id = _event_id
      and sea.user_id = (select auth.uid())
  ));
$$;

CREATE OR REPLACE FUNCTION app_private.current_employee_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  select id from public.employee_records where app_private.effective_platform_access((select auth.uid())) and auth_user_id = (select auth.uid()) and archived_at is null limit 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_assigned_equipment()
 RETURNS TABLE(assignment_id uuid, asset_id uuid, asset_number text, asset_name text, category text, status text, manufacturer text, model text, photo_storage_path text, safety_class text, ppe_required text, inspection_template_key text, next_inspection_due_at timestamp with time zone, job_id uuid, schedule_event_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, assignment_notes text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  select assignment.id, asset.id, asset.asset_number, asset.name, asset.category,
    asset.status, asset.manufacturer, asset.model, asset.photo_storage_path,
    asset.safety_class, asset.ppe_required, asset.inspection_template_key,
    asset.next_inspection_due_at, assignment.job_id, assignment.schedule_event_id,
    assignment.starts_at, assignment.ends_at, assignment.notes
  from public.equipment_assignments assignment
  join public.equipment_assets asset on asset.id = assignment.asset_id
  where app_private.effective_platform_access((select auth.uid())) and assignment.assigned_user_id = (select auth.uid())
    and assignment.returned_at is null
    and assignment.starts_at <= now() + interval '14 days'
    and coalesce(assignment.ends_at, now() + interval '30 days') >= now() - interval '1 day'
    and asset.is_active
  order by assignment.starts_at, asset.name;
$$;

CREATE OR REPLACE FUNCTION public.get_crew_change_order_scope(p_job_id uuid)
 RETURNS TABLE(change_order_id uuid, change_order_number text, title text, description text, sort_order integer, approved_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  select co.id, co.change_order_number, scope.title, scope.description, scope.sort_order, co.approved_at
  from public.change_orders co
  join public.job_change_order_scope_items scope on scope.change_order_id = co.id
  join public.jobs j on j.id = co.job_id
  where app_private.effective_platform_access((select auth.uid())) and co.job_id = p_job_id
    and co.status = 'approved'
    and (
      app_private.has_staff_role()
      or j.assigned_crew_user_id = (select auth.uid())
    )
  order by co.approved_at, scope.sort_order;
$$;

CREATE OR REPLACE FUNCTION public.start_assigned_job(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  acting_user_id uuid := (select auth.uid());
  target_job public.jobs%rowtype;
begin
  if not app_private.effective_platform_access((select auth.uid())) then
    raise exception 'Platform access is disabled.' using errcode = '42501';
  end if;
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

CREATE OR REPLACE FUNCTION public.save_assigned_job_closeout(p_job_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  acting_user_id uuid := (select auth.uid());
  target_closeout public.job_closeouts%rowtype;
begin
  if not app_private.effective_platform_access((select auth.uid())) then
    raise exception 'Platform access is disabled.' using errcode = '42501';
  end if;
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

CREATE OR REPLACE FUNCTION public.submit_assigned_job_closeout(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  acting_user_id uuid := (select auth.uid());
  target_closeout public.job_closeouts%rowtype;
  next_revision integer;
  scope_exception boolean;
begin
  if not app_private.effective_platform_access((select auth.uid())) then
    raise exception 'Platform access is disabled.' using errcode = '42501';
  end if;
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

CREATE OR REPLACE FUNCTION public.submit_crew_service_recommendation(p_job_id uuid, p_title text, p_description text, p_timeframe text DEFAULT NULL::text, p_internal_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  acting_user_id uuid := (select auth.uid());
  target public.jobs%rowtype;
  recommendation_id uuid;
begin
  if not app_private.effective_platform_access((select auth.uid())) then
    raise exception 'Platform access is disabled.' using errcode = '42501';
  end if;
  if acting_user_id is null then raise exception 'Sign in before submitting a recommendation.'; end if;
  select * into target from public.jobs where id = p_job_id;
  if not found then raise exception 'Work order not found.'; end if;
  if target.assigned_crew_user_id <> acting_user_id and not app_private.has_staff_role() then
    raise exception 'This work order is not assigned to this crew account.';
  end if;
  if pg_catalog.btrim(coalesce(p_title, '')) = '' or pg_catalog.btrim(coalesce(p_description, '')) = '' then
    raise exception 'Title and recommendation are required.';
  end if;

  insert into public.service_recommendations (
    customer_id, organization_id, service_location_id, source_job_id, title,
    customer_recommendation, internal_notes, recommended_timeframe, origin,
    status, created_by_user_id
  ) values (
    target.customer_id, target.organization_id, target.service_location_id, target.id,
    pg_catalog.left(pg_catalog.btrim(p_title), 180), pg_catalog.left(pg_catalog.btrim(p_description), 5000),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_internal_notes, '')), 5000), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_timeframe, '')), 240), ''),
    'crew', 'pending_office_review', acting_user_id
  ) returning id into recommendation_id;

  insert into public.activity_log (actor_user_id, subject_type, subject_id, event_type, metadata_json)
  values (acting_user_id, 'service_recommendation', recommendation_id, 'recommendation_submitted',
    pg_catalog.jsonb_build_object('job_id', p_job_id, 'origin', 'crew'));
  return recommendation_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.replace_platform_user_roles(p_target_user_id uuid, p_role_names text[], p_reason text DEFAULT NULL::text)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  caller_id uuid := auth.uid();
  caller_is_owner boolean;
  caller_is_admin boolean;
  target_is_owner boolean;
  canonical_roles text[];
  prior_roles text[];
  missing_roles text[];
begin
  perform pg_advisory_xact_lock(hashtext('platform-role-management'));
  if not app_private.effective_platform_access(caller_id) or not app_private.effective_platform_access(p_target_user_id) then
    raise exception 'Reactivate the account before changing roles.' using errcode = '42501';
  end if;
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_target_user_id is null or p_target_user_id = caller_id then
    raise exception 'Users cannot change their own platform roles.' using errcode = '42501';
  end if;

  select
    coalesce(bool_or(r.name = 'owner'), false),
    coalesce(bool_or(r.name = 'admin'), false)
  into caller_is_owner, caller_is_admin
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = caller_id;

  if not caller_is_owner and not caller_is_admin then
    raise exception 'Only an owner or admin may manage platform roles.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_target_user_id) then
    raise exception 'The selected platform account does not exist.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::text[])
  into canonical_roles
  from unnest(coalesce(p_role_names, '{}'::text[])) as requested(value)
  where value = any(array['owner', 'admin', 'payroll_admin', 'estimator', 'crew', 'customer', 'property_manager']);

  if cardinality(canonical_roles) = 0 then
    raise exception 'At least one valid platform role is required.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::text[])
  into missing_roles
  from unnest(coalesce(p_role_names, '{}'::text[])) as requested(value)
  where not (value = any(array['owner', 'admin', 'payroll_admin', 'estimator', 'crew', 'customer', 'property_manager']));

  if cardinality(missing_roles) > 0 then
    raise exception 'One or more requested platform roles are not supported.' using errcode = '22023';
  end if;



  select
    coalesce(array_agg(r.name order by r.name), '{}'::text[]),
    coalesce(bool_or(r.name = 'owner'), false)
  into prior_roles, target_is_owner
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_target_user_id;

  if not caller_is_owner and (target_is_owner or 'owner' = any(canonical_roles)) then
    raise exception 'Admins cannot assign or modify the owner role.' using errcode = '42501';
  end if;

  if target_is_owner and not ('owner' = any(canonical_roles)) and not exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where r.name = 'owner'
      and ur.user_id <> p_target_user_id
      and app_private.effective_platform_access(ur.user_id)
  ) then
    raise exception 'The final owner role cannot be removed.' using errcode = '23514';
  end if;

  delete from public.user_roles ur
  using public.roles r
  where ur.role_id = r.id
    and ur.user_id = p_target_user_id
    and not (r.name = any(canonical_roles));

  insert into public.user_roles (user_id, role_id)
  select p_target_user_id, r.id
  from public.roles r
  where r.name = any(canonical_roles)
  on conflict (user_id, role_id) do nothing;

  if prior_roles is distinct from canonical_roles then
    insert into public.role_assignment_events (
      actor_user_id,
      target_user_id,
      previous_roles,
      assigned_roles,
      reason
    ) values (
      caller_id,
      p_target_user_id,
      prior_roles,
      canonical_roles,
      nullif(pg_catalog.left(pg_catalog.btrim(p_reason), 600), '')
    );
  end if;

  return canonical_roles;
end;
$$;

-- Restrictive policies AND with every existing permissive policy. Service workers
-- retain their existing bypass role; anonymous/public capabilities are unchanged.

create policy "Effective platform access required" on public.activity_log
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.admin_notification_preferences
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.admin_notifications
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.appointments
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.change_order_line_items
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.change_order_portal_tokens
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.change_orders
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.communication_settings
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.contracting_party_review_items
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.credential_types
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.customer_communications
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.customer_deliveries
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.customers
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.disposal_records
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.documents
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.email_events
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.employee_access_requests
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.employee_acknowledgments
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.employee_credentials
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.employee_documents
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.employee_emergency_contacts
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.employee_labor_cost_rates
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.employee_onboarding_items
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.employee_private_records
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.employee_program_files
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.employee_records
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.employee_requests
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.employee_separation_items
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.equipment_asset_costs
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.equipment_assets
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.equipment_assignments
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.equipment_documents
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.equipment_inspections
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.equipment_maintenance_records
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.equipment_maintenance_schedules
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.equipment_problem_reports
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.equipment_readings
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.equipment_status_history
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.follow_up_tasks
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.inventory_locations
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.inventory_reservations
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.inventory_transaction_costs
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.inventory_transactions
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.invoice_line_items
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.invoice_portal_tokens
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.invoices
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.job_change_order_scope_items
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.job_closeout_checklist_items
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.job_closeout_scope_items
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.job_closeout_submissions
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.job_closeouts
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.job_cost_entries
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.job_equipment_usage
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.job_material_requirements
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.job_photos
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.jobs
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.lead_sources
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.material_catalog
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.material_cost_settings
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.material_loads
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.material_purchase_items
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.material_purchases
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.notes
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.onboarding_templates
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.organization_contacts
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.organizations
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.pay_periods
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.payments
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.portal_view_events
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.production_batch_inputs
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.production_batch_outputs
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.production_batches
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.profiles
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.qualification_requirements
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.quote_line_items
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.quote_material_requirements
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.quote_portal_tokens
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.quotes
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.record_deletion_audit
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.recurring_plan_locations
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.recurring_service_occurrences
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.recurring_service_plans
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.recurring_service_settings
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.reporting_settings
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.role_assignment_events
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.roles
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.safety_meeting_attendees
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.safety_meetings
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.schedule_event_assignments
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.schedule_events
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.service_categories
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.service_locations
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.service_recommendations
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.stockpile_measurements
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.system_health_checks
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.system_health_components
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.system_health_incidents
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.time_clock_permissions
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.time_entries
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.time_entry_adjustments
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.time_entry_approvals
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.training_attendees
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.training_sessions
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on public.user_roles
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

create policy "Effective platform access required" on storage.objects
  as restrictive for all to authenticated
  using ((select public.has_effective_platform_access()))
  with check ((select public.has_effective_platform_access()));

-- Lifecycle state is a command, not an unrestricted table edit. These invoker
-- triggers distinguish caller DML from the narrowly granted definer command.
create or replace function app_private.guard_employee_access_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Auth's profile-sync trigger is a definer too: it may not silently attach
  -- an inactive record and revoke a final owner's access as an email side effect.
  if new.auth_user_id is not null and (tg_op = 'INSERT' or new.auth_user_id is distinct from old.auth_user_id)
    and (not new.is_active or new.archived_at is not null or new.employment_status in ('inactive','separated')) then
    raise exception 'Link an active employee before using the lifecycle command.' using errcode = '42501';
  end if;
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.auth_user_id is not null and (not new.is_active or new.archived_at is not null or new.employment_status in ('inactive','separated')) then
        raise exception 'Link an active employee before using the lifecycle command.' using errcode = '42501';
      end if;
    elsif new.is_active is distinct from old.is_active
       or new.archived_at is distinct from old.archived_at
       or ((new.employment_status in ('inactive','separated')) is distinct from (old.employment_status in ('inactive','separated')))
       or (old.auth_user_id is not null and new.auth_user_id is distinct from old.auth_user_id)
       or (new.auth_user_id is distinct from old.auth_user_id and
           (not new.is_active or new.archived_at is not null or new.employment_status in ('inactive','separated'))) then
      raise exception 'Use the employee access command to offboard or reactivate; account links cannot be detached.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_employee_access_fields() from public, anon, authenticated;
create trigger guard_employee_access_fields before insert or update on public.employee_records
for each row execute function app_private.guard_employee_access_fields();

create or replace function app_private.guard_profile_access_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      raise exception 'Profiles are provisioned by Auth.' using errcode = '42501';
    end if;
    if new.id is distinct from old.id or new.status is distinct from old.status or new.user_type is distinct from old.user_type then
      -- Preserve initial access approval (pending -> active). A disabled account
      -- can only be restored by the employee lifecycle command.
      if not app_private.has_platform_admin_role() or new.id = (select auth.uid())
        or old.status = 'disabled' or new.status <> 'active' then
        raise exception 'Use the privileged employee access command for lifecycle changes.' using errcode = '42501';
      end if;
      if new.id is distinct from old.id then
        raise exception 'Profile identity cannot change.' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_profile_access_fields() from public, anon, authenticated;
create trigger guard_profile_access_fields before insert or update on public.profiles
for each row execute function app_private.guard_profile_access_fields();
-- History and identity cannot be removed to evade the active-employment check.
revoke delete on public.profiles, public.employee_records from authenticated;

create or replace function public.set_employee_access_status(
  p_employee_id uuid, p_status text, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  employee public.employee_records%rowtype;
  previous_state jsonb;
  result_state jsonb;
  target_owner boolean;
  caller_owner boolean;
  disabling boolean;
  profile_status text;
  clock_enabled boolean;
begin
  -- Same serialization boundary as replace_platform_user_roles. Check caller
  -- AFTER acquiring it so a concurrent separation cannot authorize a stale role.
  perform pg_advisory_xact_lock(hashtext('platform-role-management'));
  if caller_id is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an active owner or admin can change employee access.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active','onboarding','seasonal','leave','inactive','separated','archived')
    or nullif(btrim(p_reason),'') is null then
    raise exception 'Choose a valid status and provide a reason.' using errcode = '22023';
  end if;
  select * into employee from public.employee_records where id = p_employee_id for update;
  if not found then raise exception 'Employee not found.' using errcode = 'P0002'; end if;
  if employee.auth_user_id = caller_id then
    raise exception 'You cannot change your own employee access.' using errcode = '42501';
  end if;
  select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=caller_id and r.name='owner') into caller_owner;
  select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=employee.auth_user_id and r.name='owner') into target_owner;
  if target_owner and not caller_owner then
    raise exception 'Only an owner can change another owner access.' using errcode = '42501';
  end if;
  disabling := p_status in ('inactive','separated','archived');
  if disabling and target_owner and not exists(
    select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
    where r.name='owner' and ur.user_id<>employee.auth_user_id
      and app_private.effective_platform_access(ur.user_id)
  ) then
    raise exception 'The final effective owner cannot be disabled.' using errcode = '23514';
  end if;
  if employee.auth_user_id is not null then
    select status into profile_status from public.profiles where id=employee.auth_user_id for update;
    if not found then raise exception 'Linked profile is missing; no access state was changed.' using errcode = '23503'; end if;
    select is_enabled into clock_enabled from public.time_clock_permissions where user_id=employee.auth_user_id for update;
  end if;
  previous_state := jsonb_build_object('employment_status',employee.employment_status,'is_active',employee.is_active,
    'archived_at',employee.archived_at,'profile_status',profile_status,'time_clock_enabled',clock_enabled);
  update public.employee_records set
    employment_status=case when p_status='archived' then 'inactive' else p_status end,
    is_active=not disabling,
    archived_at=case when p_status='archived' then coalesce(employee.archived_at,now()) when disabling then employee.archived_at else null end,
    archived_by_user_id=case when p_status='archived' then coalesce(employee.archived_by_user_id,caller_id) when disabling then employee.archived_by_user_id else null end,
    separation_date=case when disabling then coalesce(employee.separation_date,(now() at time zone 'America/New_York')::date) else null end,
    separation_reason=case when disabling then left(btrim(p_reason),1000) else null end
  where id=p_employee_id;
  if employee.auth_user_id is not null then
    update public.profiles set status=case when disabling then 'disabled' else 'active' end where id=employee.auth_user_id;
    -- Reactivation deliberately does not enable time capture; payroll permissions
    -- need explicit review. Retained roles/assignments become effective again.
    insert into public.time_clock_permissions(user_id,is_enabled,notes,created_by_user_id)
      values(employee.auth_user_id,false,'Employee access transition; time-clock review required.',caller_id)
      on conflict(user_id) do update set is_enabled=false,notes=excluded.notes;
  end if;
  if disabling then
    insert into public.employee_separation_items(employee_id,item_key,label)
    select p_employee_id, key, label from (values
      ('platform_access','Platform access disabled'),('equipment_returned','Equipment and PPE returned'),
      ('keys_cards','Keys and cards returned'),('future_schedule','Future schedule reviewed'),
      ('final_time','Final time entries reviewed'),('documents_archived','Documents archived')
    ) as items(key,label) on conflict(employee_id,item_key) do nothing;
  end if;
  result_state := jsonb_build_object('employment_status',case when p_status='archived' then 'inactive' else p_status end,
    'is_active',not disabling,'archived',(select archived_at is not null from public.employee_records where id=p_employee_id),'profile_status',case when employee.auth_user_id is null then null when disabling then 'disabled' else 'active' end,
    'time_clock_enabled',false,'roles_retained',true,'session_cleanup','not_attempted');
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
    values(caller_id,case when caller_owner then 'owner' else 'admin' end,'employee',p_employee_id,case when disabling then 'employee_marked_inactive' else 'employee_access_reactivated' end,
      jsonb_build_object('previous_state',previous_state,'resulting_state',result_state,'reason',left(btrim(p_reason),1000),
        'session_cleanup','not_attempted','session_cleanup_reason','Database authorization is authoritative; provider sessions are retained.'));
  return result_state;
end;
$$;
revoke all on function public.set_employee_access_status(uuid,text,text) from public, anon;
grant execute on function public.set_employee_access_status(uuid,text,text) to authenticated;
-- Preserve narrow entry-point ACLs, including on unexpected missing-function drift.
revoke all on function app_private.can_access_job_cost_receipt(text) from public, anon, authenticated;
grant execute on function app_private.can_access_job_cost_receipt(text) to authenticated, service_role;
revoke all on function app_private.can_submit_job_cost(uuid) from public, anon, authenticated;
grant execute on function app_private.can_submit_job_cost(uuid) to authenticated, service_role;
revoke all on function app_private.can_use_assigned_equipment(uuid) from public, anon, authenticated;
revoke all on function app_private.has_financial_reporting_role() from public, anon, authenticated;
grant execute on function app_private.has_financial_reporting_role() to authenticated, service_role;
revoke all on function app_private.has_platform_admin_role() from public, anon, authenticated;
grant execute on function app_private.has_platform_admin_role() to authenticated, service_role;
revoke all on function app_private.has_schedule_admin_role() from public, anon, authenticated;
grant execute on function app_private.has_schedule_admin_role() to authenticated, service_role;
revoke all on function app_private.has_schedule_crew_role() from public, anon, authenticated;
grant execute on function app_private.has_schedule_crew_role() to authenticated, service_role;
revoke all on function app_private.has_schedule_estimator_role() from public, anon, authenticated;
grant execute on function app_private.has_schedule_estimator_role() to authenticated, service_role;
revoke all on function app_private.has_staff_role() from public, anon, authenticated;
grant execute on function app_private.has_staff_role() to authenticated, service_role;
revoke all on function app_private.has_time_clock_eligible_role() from public, anon, authenticated;
grant execute on function app_private.has_time_clock_eligible_role() to authenticated, service_role;
revoke all on function app_private.has_time_clock_review_role() from public, anon, authenticated;
grant execute on function app_private.has_time_clock_review_role() to authenticated, service_role;
revoke all on function app_private.is_assigned_to_job(uuid) from public, anon, authenticated;
grant execute on function app_private.is_assigned_to_job(uuid) to authenticated, service_role;
revoke all on function app_private.is_schedule_event_assignee(uuid) from public, anon, authenticated;
grant execute on function app_private.is_schedule_event_assignee(uuid) to authenticated, service_role;
revoke all on function app_private.current_employee_id() from public, anon, authenticated;
revoke all on function public.get_my_assigned_equipment() from public, anon, authenticated;
grant execute on function public.get_my_assigned_equipment() to authenticated, service_role;
revoke all on function public.get_crew_change_order_scope(uuid) from public, anon, authenticated;
grant execute on function public.get_crew_change_order_scope(uuid) to authenticated, service_role;
revoke all on function public.start_assigned_job(uuid) from public, anon, authenticated;
grant execute on function public.start_assigned_job(uuid) to authenticated, service_role;
revoke all on function public.save_assigned_job_closeout(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_assigned_job_closeout(uuid, jsonb) to authenticated, service_role;
revoke all on function public.submit_assigned_job_closeout(uuid) from public, anon, authenticated;
grant execute on function public.submit_assigned_job_closeout(uuid) to authenticated, service_role;
revoke all on function public.submit_crew_service_recommendation(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_crew_service_recommendation(uuid, text, text, text, text) to authenticated, service_role;
revoke all on function public.replace_platform_user_roles(uuid, text[], text) from public, anon, authenticated;
grant execute on function public.replace_platform_user_roles(uuid, text[], text) to authenticated, service_role;
commit;
