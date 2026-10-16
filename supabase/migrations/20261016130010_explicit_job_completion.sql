-- PR09: billing preparation never implies field completion. No historical
-- completion, closeout, appointment, invoice or payment rows are backfilled.
alter table public.jobs add column completion_revision integer not null default 1 check (completion_revision>0);

create function app_private.guard_job_completion()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user='authenticated' then
    if tg_op='INSERT' then
      if new.completed_at is not null or new.completed_by_user_id is not null
        or new.status in ('completed','completed_pending_review','ready_to_invoice') then
        raise exception 'Use the explicit work completion or crew closeout action.' using errcode='42501';
      end if;
    elsif new.completed_at is distinct from old.completed_at or new.completed_by_user_id is distinct from old.completed_by_user_id
      or (new.status is distinct from old.status and new.status in ('completed','completed_pending_review','ready_to_invoice')) then
      raise exception 'Use the explicit work completion or crew closeout action.' using errcode='42501';
    end if;
  end if;
  if tg_op='UPDATE' then
    new.completion_revision := old.completion_revision + case when
      (to_jsonb(new)-'updated_at'-'completion_revision') is distinct from (to_jsonb(old)-'updated_at'-'completion_revision') then 1 else 0 end;
  else new.completion_revision := 1;
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_job_completion() from public,anon,authenticated,service_role;
create trigger jobs_completion_boundary before insert or update on public.jobs
  for each row execute function app_private.guard_job_completion();

create table app_private.job_completion_requests(
  request_id uuid primary key, actor_user_id uuid not null, job_id uuid not null,
  input_json jsonb not null, result_json jsonb not null, created_at timestamptz not null default now()
);
alter table app_private.job_completion_requests enable row level security;
revoke all on app_private.job_completion_requests from public,anon,authenticated,service_role;

-- Read only the completion context; crew callers receive no billing information.
create function app_private.job_completion_context(p_job_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  with visits as (
    select e.id,'event'::text as kind,e.edit_revision::text as version,e.title,e.starts_at,e.ends_at
    from public.schedule_events e where e.job_id=p_job_id and e.event_type='job'
      and e.status in ('scheduled','confirmed','in_progress')
    union all
    select a.id,'appointment',extract(epoch from a.updated_at)::text,'Work visit',a.starts_at,a.ends_at
    from public.appointments a where a.job_id=p_job_id and a.appointment_type in ('job','maintenance')
      and a.status in ('scheduled','confirmed','in_progress')
      and not exists(select 1 from public.schedule_events e where e.source_appointment_id=a.id)
  )
  select jsonb_build_object('job_id',j.id,'revision',j.completion_revision,'status',j.status,
    'completed_at',j.completed_at,'future_count',(select count(*) from visits where starts_at>clock_timestamp()),
    'has_invoice',case when app_private.has_staff_role() then exists(select 1 from public.invoices where job_id=j.id) else null end,
    'closeout_status',(select status from public.job_closeouts where job_id=j.id),
    'visits',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'title',title,'starts_at',starts_at,'ends_at',ends_at) order by starts_at,kind,id) from visits),'[]'),
    'snapshot',jsonb_build_object(
      'visits',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'version',version) order by kind,id) from visits),'[]'),
      'closeout',(select jsonb_build_object('id',id,'status',status,'version',extract(epoch from updated_at)::text) from public.job_closeouts where job_id=j.id),
      'checklist',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version',extract(epoch from updated_at)::text) order by id) from public.job_closeout_checklist_items where job_id=j.id),'[]'),
      'scope_items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version',extract(epoch from updated_at)::text) order by id) from public.job_closeout_scope_items where job_id=j.id),'[]')
    ))
  from public.jobs j where j.id=p_job_id;
$$;
revoke all on function app_private.job_completion_context(uuid) from public,anon,authenticated,service_role;

create function public.get_job_completion_context(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not app_private.effective_platform_access(auth.uid()) or not (
    app_private.has_staff_role() or exists(select 1 from public.jobs where id=p_job_id and assigned_crew_user_id=auth.uid())
  ) then raise exception 'You do not have access to this work completion record.' using errcode='42501'; end if;
  return app_private.job_completion_context(p_job_id);
end;
$$;
revoke all on function public.get_job_completion_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_job_completion_context(uuid) to authenticated;

create function app_private.lock_job_completion(
  p_job_id uuid,p_expected_revision integer,p_expected_snapshot jsonb,p_confirm_future boolean,p_office boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.jobs%rowtype; v_context jsonb;
begin
  if auth.uid() is null or not app_private.effective_platform_access(auth.uid())
    or (p_office and not app_private.has_staff_role()) then
    raise exception 'You no longer have permission to complete this work.' using errcode='42501';
  end if;
  select * into v_job from public.jobs where id=p_job_id for update;
  if v_job.id is null or v_job.archived_at is not null then
    raise exception 'This work order is unavailable. Refresh the record.' using errcode='23514';
  end if;
  if not p_office and v_job.assigned_crew_user_id is distinct from auth.uid() and not app_private.has_staff_role() then
    raise exception 'This work order is not assigned to this account.' using errcode='42501';
  end if;
  perform 1 from public.schedule_events where job_id=p_job_id and event_type='job' order by id for update;
  perform 1 from public.appointments where job_id=p_job_id and appointment_type in ('job','maintenance') order by id for update;
  perform 1 from public.job_closeouts where job_id=p_job_id for update;
  perform 1 from public.job_closeout_checklist_items where job_id=p_job_id order by id for update;
  perform 1 from public.job_closeout_scope_items where job_id=p_job_id order by id for update;
  v_context := app_private.job_completion_context(p_job_id);
  if p_expected_revision is null or v_job.completion_revision<>p_expected_revision
    or p_expected_snapshot is null or (v_context->'snapshot') is distinct from p_expected_snapshot then
    raise exception 'This work order or its visits changed. Your entries are still here. Refresh and review the latest record before completing work.' using errcode='40001';
  end if;
  if (v_context->>'future_count')::integer>0 and not coalesce(p_confirm_future,false) then
    raise exception 'Future visits remain. Confirm that all remaining visits are finished before completing this job.' using errcode='23514';
  end if;
  if not app_private.effective_platform_access(auth.uid()) or (p_office and not app_private.has_staff_role())
    or (not p_office and v_job.assigned_crew_user_id is distinct from auth.uid() and not app_private.has_staff_role()) then
    raise exception 'You no longer have permission to complete this work.' using errcode='42501';
  end if;
  return v_context;
end;
$$;
revoke all on function app_private.lock_job_completion(uuid,integer,jsonb,boolean,boolean) from public,anon,authenticated,service_role;

create function app_private.finish_job_visits(p_job_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_event record; v_count integer:=0; v_changed integer;
begin
  for v_event in update public.schedule_events set status='completed' where job_id=p_job_id and event_type='job'
    and status in ('scheduled','confirmed','in_progress') returning id loop
    perform app_private.queue_google_calendar_schedule_event(v_event.id,'work_explicitly_completed');
    v_count:=v_count+1;
  end loop;
  update public.appointments a set status='completed' where job_id=p_job_id and appointment_type in ('job','maintenance')
    and status in ('scheduled','confirmed','in_progress')
    and not exists(select 1 from public.schedule_events e where e.source_appointment_id=a.id);
  get diagnostics v_changed=row_count;
  update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),last_error=null,
    processing_started_at=null,skip_reason='Work was explicitly completed.'
    where status='pending' and communication_type in ('work_confirmation','work_reminder') and (
      job_id=p_job_id or schedule_event_id in(select id from public.schedule_events where job_id=p_job_id and event_type='job')
      or appointment_id in(select id from public.appointments where job_id=p_job_id and appointment_type in ('job','maintenance'))
    );
  return v_count+v_changed;
end;
$$;
revoke all on function app_private.finish_job_visits(uuid) from public,anon,authenticated,service_role;

create function public.complete_job_work(p_request_id uuid,p_job_id uuid,p_expected_revision integer,
  p_expected_snapshot jsonb,p_confirm_future boolean default false,p_mode text default 'complete',p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare v_input jsonb; v_previous app_private.job_completion_requests%rowtype; v_context jsonb;
  v_job public.jobs%rowtype; v_invoice jsonb; v_result jsonb; v_count integer; v_was_complete boolean;
begin
  if auth.uid() is null or not app_private.has_staff_role() then
    raise exception 'Only active office staff may complete work.' using errcode='42501';
  end if;
  if p_request_id is null or p_mode is null or p_mode not in ('complete','complete_and_invoice') or length(p_reason)>1000 then
    raise exception 'Review the completion action and note before continuing.' using errcode='22023';
  end if;
  v_input:=jsonb_build_object('job_id',p_job_id,'revision',p_expected_revision,'snapshot',p_expected_snapshot,
    'confirm_future',coalesce(p_confirm_future,false),'mode',p_mode,'reason',nullif(btrim(p_reason),''));
  -- Same request lock as PR04, acquired before the job, including combined work.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,43664));
  select * into v_previous from app_private.job_completion_requests where request_id=p_request_id;
  if found then
    if not app_private.has_staff_role() then raise exception 'Office access is disabled.' using errcode='42501'; end if;
    if v_previous.actor_user_id<>auth.uid() or v_previous.input_json<>v_input then
      raise exception 'This saved completion request belongs to different details. Review the work order.' using errcode='23514';
    end if;
    if not exists(select 1 from public.jobs where id=p_job_id) then
      raise exception 'The completed work order is unavailable. Review its history.' using errcode='23514';
    end if;
    v_result:=v_previous.result_json||jsonb_build_object('replayed',true);
    if p_mode='complete_and_invoice' then
      select jsonb_build_object('invoice_status',status) into v_invoice from public.invoices where id=(v_result->>'invoice_id')::uuid;
      if v_invoice is null then raise exception 'The invoice from this completion was deleted. Review billing history.' using errcode='23514'; end if;
      v_result:=v_result||v_invoice;
    end if;
    return v_result;
  end if;
  v_context:=app_private.lock_job_completion(p_job_id,p_expected_revision,p_expected_snapshot,p_confirm_future,true);
  select * into v_job from public.jobs where id=p_job_id;
  if v_job.status not in ('accepted','scheduled','in_progress','completed','completed_pending_review','ready_to_invoice','invoiced','paid')
    or v_context->>'closeout_status'='returned' then
    raise exception 'Resolve the work order or returned closeout before completing it.' using errcode='23514';
  end if;
  if p_mode='complete_and_invoice' then
    v_invoice:=public.generate_job_invoice(p_request_id,p_job_id,null,null);
    if v_invoice->>'invoice_status'='void' then
      raise exception 'Review the voided invoice first. You can complete work separately without changing that invoice.' using errcode='23514';
    end if;
  end if;
  v_was_complete:=v_job.completed_at is not null;
  if v_was_complete and jsonb_array_length(v_context->'visits')=0 then v_count:=0;
  else v_count:=app_private.finish_job_visits(p_job_id); end if;
  if not v_was_complete or v_count>0 then
    update public.jobs set status=case when status in ('completed_pending_review','ready_to_invoice','invoiced','paid') then status else 'completed' end,
      completed_at=coalesce(completed_at,clock_timestamp()),completed_by_user_id=coalesce(completed_by_user_id,auth.uid()) where id=p_job_id;
    insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
      values(auth.uid(),'job',p_job_id,'job_work_completed',jsonb_build_object('request_id',p_request_id,'mode',p_mode,
        'from_status',v_job.status,'closed_visit_count',v_count,'confirmed_future',coalesce(p_confirm_future,false),
        'closeout_status_retained',v_context->>'closeout_status','reason',nullif(btrim(p_reason),'')));
  end if;
  v_result:=jsonb_build_object('job_id',p_job_id,'job_completed',true,'already_completed',v_was_complete and v_count=0,
    'closed_visit_count',v_count,'replayed',false,'context',app_private.job_completion_context(p_job_id))||
    case when p_mode='complete_and_invoice' then v_invoice||jsonb_build_object('job_completed',true) else '{}'::jsonb end;
  if not app_private.has_staff_role() then raise exception 'Office access is disabled.' using errcode='42501'; end if;
  insert into app_private.job_completion_requests(request_id,actor_user_id,job_id,input_json,result_json)
    values(p_request_id,auth.uid(),p_job_id,v_input,v_result);
  return v_result;
end;
$$;
revoke all on function public.complete_job_work(uuid,uuid,integer,jsonb,boolean,text,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_job_work(uuid,uuid,integer,jsonb,boolean,text,text) to authenticated;

-- Keep the existing crew requirements and review states. Save/submit/visit
-- completion now share one transaction; a rejected submission saves nothing.
create function public.save_job_closeout_draft(p_job_id uuid,p_payload jsonb,p_expected_revision integer,p_expected_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
begin
  -- Draft saves do not close future visits; confirmation is only for submission.
  perform app_private.lock_job_completion(p_job_id,p_expected_revision,p_expected_snapshot,true,false);
  perform public.save_assigned_job_closeout(p_job_id,p_payload);
  return jsonb_build_object('context',app_private.job_completion_context(p_job_id));
end;
$$;
revoke all on function public.save_job_closeout_draft(uuid,jsonb,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_job_closeout_draft(uuid,jsonb,integer,jsonb) to authenticated;

create function public.submit_job_closeout_atomic(p_request_id uuid,p_job_id uuid,p_payload jsonb,
  p_expected_revision integer,p_expected_snapshot jsonb,p_confirm_future boolean default false)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare v_input jsonb; v_previous app_private.job_completion_requests%rowtype; v_result jsonb; v_count integer; v_original_completed_by uuid;
begin
  if auth.uid() is null or not app_private.effective_platform_access(auth.uid()) or not (
    app_private.has_staff_role() or exists(select 1 from public.jobs where id=p_job_id and assigned_crew_user_id=auth.uid())
  ) then raise exception 'This work order is not assigned or access is disabled.' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'Refresh the closeout before submitting.' using errcode='22023'; end if;
  v_input:=jsonb_build_object('mode','crew_closeout','job_id',p_job_id,'payload',p_payload,'revision',p_expected_revision,
    'snapshot',p_expected_snapshot,'confirm_future',coalesce(p_confirm_future,false));
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,43664));
  select * into v_previous from app_private.job_completion_requests where request_id=p_request_id;
  if found then
    if not app_private.effective_platform_access(auth.uid()) or not (app_private.has_staff_role()
      or exists(select 1 from public.jobs where id=p_job_id and assigned_crew_user_id=auth.uid())) then
      raise exception 'This work order is no longer assigned or access is disabled.' using errcode='42501'; end if;
    if v_previous.actor_user_id<>auth.uid() or v_previous.input_json<>v_input then
      raise exception 'This saved closeout request belongs to different details.' using errcode='23514';
    end if;
    return v_previous.result_json||jsonb_build_object('replayed',true);
  end if;
  perform app_private.lock_job_completion(p_job_id,p_expected_revision,p_expected_snapshot,p_confirm_future,false);
  select completed_by_user_id into v_original_completed_by from public.jobs where id=p_job_id;
  perform public.save_assigned_job_closeout(p_job_id,p_payload);
  v_result:=public.submit_assigned_job_closeout(p_job_id);
  if v_original_completed_by is not null then
    update public.jobs set completed_by_user_id=v_original_completed_by where id=p_job_id and completed_by_user_id is distinct from v_original_completed_by;
  end if;
  v_count:=app_private.finish_job_visits(p_job_id);
  v_result:=v_result||jsonb_build_object('job_id',p_job_id,'closed_visit_count',v_count,'replayed',false,
    'context',app_private.job_completion_context(p_job_id));
  if not app_private.effective_platform_access(auth.uid()) or not (app_private.has_staff_role() or exists(select 1 from public.jobs where id=p_job_id and assigned_crew_user_id=auth.uid())) then
    raise exception 'This work order is no longer assigned or access is disabled.' using errcode='42501'; end if;
  insert into app_private.job_completion_requests(request_id,actor_user_id,job_id,input_json,result_json)
    values(p_request_id,auth.uid(),p_job_id,v_input,v_result);
  return v_result;
end;
$$;
revoke all on function public.submit_job_closeout_atomic(uuid,uuid,jsonb,integer,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.submit_job_closeout_atomic(uuid,uuid,jsonb,integer,jsonb,boolean) to authenticated;
revoke all on function public.save_assigned_job_closeout(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.submit_assigned_job_closeout(uuid) from public,anon,authenticated,service_role;
revoke all on function public.complete_completed_job_schedule(uuid) from public,anon,authenticated,service_role;

-- Replace the reviewed generation implementation with draft-only behavior.
create or replace function public.generate_job_invoice(p_request_id uuid, p_job_id uuid default null,
  p_quote_id uuid default null, p_manual jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  actor uuid := auth.uid();
  input_json jsonb := jsonb_build_object('job_id',p_job_id,'quote_id',p_quote_id,'manual',p_manual);
  previous app_private.invoice_generation_requests%rowtype;
  job public.jobs%rowtype;
  quote public.quotes%rowtype;
  existing public.invoices%rowtype;
  co public.change_orders%rowtype;
  line record;
  new_job boolean := false;
  resolved_job uuid;
  source_quote uuid;
  source_lines jsonb;
  header jsonb;
  new_id uuid;
  subtotal bigint;
  tax bigint := 0;
  co_subtotal bigint;
  additions integer := 0;
  addition_lines integer := 0;
  next_sort integer;
  before_status text;
  result jsonb;
  requirement uuid;
  billing_contact uuid;
begin
  if actor is null or not app_private.has_staff_role() then
    raise exception 'Only active office staff may generate invoices.' using errcode = '42501';
  end if;
  if p_request_id is null or (p_job_id is null) = (p_quote_id is null)
    or (p_manual is not null and (p_job_id is null or jsonb_typeof(p_manual) <> 'object')) then
    raise exception 'Choose one work order or approved quote and retry the saved request.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 43664));
  if not app_private.has_staff_role() then raise exception 'Office access is disabled.' using errcode='42501'; end if;
  select * into previous from app_private.invoice_generation_requests where request_id = p_request_id;
  if found then
    if previous.actor_user_id <> actor or previous.input_json <> input_json then
      raise exception 'This saved request belongs to different details. Open the work order to review its invoice before continuing.' using errcode = '23514';
    end if;
    select * into existing from public.invoices where id = previous.invoice_id;
    if not found then
      raise exception 'The invoice from this saved request was deleted. Review the work order before starting another request.' using errcode = '23514';
    end if;
    return previous.result_json || jsonb_build_object('replayed',true,'invoice_status',existing.status);
  end if;

  resolved_job := p_job_id;
  if p_quote_id is not null then
    select coalesce(q.job_id,(select j.id from public.jobs j where j.source_quote_id=q.id)) into resolved_job
      from public.quotes q where q.id=p_quote_id;
  end if;
  -- Existing work order first, then quote, then additions, then new invoice.
  if resolved_job is not null then
    select * into job from public.jobs where id=resolved_job for update;
    if not found then raise exception 'Work order not found.' using errcode='23514'; end if;
  end if;
  source_quote := coalesce(p_quote_id,job.source_quote_id);
  if source_quote is not null then
    select * into quote from public.quotes where id=source_quote for update;
    if not found or (p_manual is null and quote.status <> 'approved') then
      raise exception 'Approve the source quote before generating its invoice.' using errcode='23514';
    end if;
    if p_quote_id is not null and resolved_job is null then
      -- A competing quote command may have linked a job while we waited.
      select coalesce(quote.job_id,(select j.id from public.jobs j where j.source_quote_id=quote.id)) into resolved_job;
      if resolved_job is null then
        if quote.service_location_id is null then raise exception 'Add a service location to the approved quote first.' using errcode='23514'; end if;
        insert into public.jobs(customer_id,organization_id,property_manager_contact_id,onsite_contact_id,service_location_id,
          source_quote_id,status,service_type,priority,requested_scope,debris_handling,debris_handling_notes,
          recurring_service_plan_id,recurring_occurrence_id,recurring_authorization_source)
        values(quote.customer_id,quote.organization_id,coalesce(quote.approval_contact_id,quote.recipient_contact_id),quote.onsite_contact_id,
          quote.service_location_id,quote.id,'accepted','other','normal',
          coalesce(nullif(concat_ws(E'\n\n',quote.customer_message,(select string_agg(coalesce(nullif(li.description,''),li.name),E'\n\n' order by li.sort_order,li.id)
            from public.quote_line_items li where li.quote_id=quote.id)),''),'Approved quote scope pending work order details.'),
          quote.debris_handling,quote.debris_handling_notes,quote.recurring_service_plan_id,quote.recurring_occurrence_id,
          case when quote.recurring_occurrence_id is not null then 'approved_renewal_quote' end)
        returning * into job;
        resolved_job := job.id;
        new_job := true;
      else
        select * into job from public.jobs where id=resolved_job for update;
      end if;
    end if;
    if quote.job_id is not null and quote.job_id <> job.id
      or job.source_quote_id is not null and job.source_quote_id <> quote.id
      or quote.customer_id is distinct from job.customer_id or quote.organization_id is distinct from job.organization_id
      or (quote.service_location_id is not null and quote.service_location_id is distinct from job.service_location_id) then
      raise exception 'The source quote does not match this work order and contracting party.' using errcode='23514';
    end if;
  end if;
  if job.id is null then raise exception 'Work order not found.' using errcode='23514'; end if;

  -- Preserve first-invoice lookup, including voids and historical duplicates.
  select * into existing from public.invoices where job_id=job.id order by created_at,id limit 1;
  if found then
    if existing.customer_id is distinct from job.customer_id or existing.organization_id is distinct from job.organization_id then
      raise exception 'The existing invoice belongs to another contracting party. Review its billing history.' using errcode='23514';
    end if;
    result := jsonb_build_object('invoice_id',existing.id,'job_id',job.id,'existing',true,'replayed',false,
      'invoice_status',existing.status,'job_completed',false,'added_change_order_count',0);
  else
    if p_quote_id is not null then
      if job.archived_at is not null and not (job.website_submission_id is not null and job.lead_disposition='archived'
        and job.status in ('new_lead','estimate_scheduled','quoted')) then
        raise exception 'Restore the archived work order before generating an invoice.' using errcode='23514';
      end if;
      if job.status in ('new_lead','estimate_scheduled','quoted') then
        update public.jobs set status='accepted',source_quote_id=quote.id,archived_at=null,archived_by_user_id=null,lead_disposition='active'
          where id=job.id returning * into job;
      elsif job.source_quote_id is null then
        update public.jobs set source_quote_id=quote.id where id=job.id returning * into job;
      end if;
      update public.quotes set job_id=job.id where id=quote.id;
      update public.jobs set debris_handling=quote.debris_handling,debris_handling_notes=quote.debris_handling_notes,
        recurring_service_plan_id=quote.recurring_service_plan_id,recurring_occurrence_id=quote.recurring_occurrence_id,
        recurring_authorization_source=case when quote.recurring_occurrence_id is not null then 'approved_renewal_quote' end
        where id=job.id returning * into job;
      update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),last_error=null,
        processing_started_at=null,skip_reason='Quote was approved and converted to a work order.'
        where quote_id=quote.id and status='pending';
    end if;
    if job.status not in ('accepted','scheduled','in_progress','completed','completed_pending_review','ready_to_invoice') then
      raise exception 'This work order is not available for draft invoicing.' using errcode='23514';
    end if;
    if job.recurring_service_plan_id is not null and not exists(select 1 from public.recurring_service_plans p
      where p.id=job.recurring_service_plan_id and p.customer_id is not distinct from job.customer_id and p.organization_id is not distinct from job.organization_id) then
      raise exception 'The recurring service plan does not match this work order.' using errcode='23514';
    end if;
    if job.recurring_occurrence_id is not null and not exists(select 1 from public.recurring_service_occurrences o
      where o.id=job.recurring_occurrence_id and o.recurring_plan_id=job.recurring_service_plan_id and o.service_location_id=job.service_location_id
        and (o.work_order_id is null or o.work_order_id=job.id)) then
      raise exception 'The recurring service visit does not match this work order.' using errcode='23514';
    end if;
    before_status := job.status;
    -- Lock every unbilled addition, including ones being approved concurrently.
    -- New additions reference the locked job and wait until this command commits.
    perform id from public.change_orders where job_id=job.id and invoice_id is null order by id for update;
    if p_manual is null then
      if source_quote is not null then
        select jsonb_agg(jsonb_build_object('name',li.name,'description',li.description,'service_category_id',li.service_category_id,
          'material_id',li.material_id,'quantity',li.quantity,'unit_price_cents',li.unit_price_cents,'total_cents',li.total_cents) order by li.sort_order,li.id)
          into source_lines from public.quote_line_items li where li.quote_id=quote.id;
        tax := quote.tax_cents;
        if quote.subtotal_cents <> coalesce((select sum(li.total_cents) from public.quote_line_items li where li.quote_id=quote.id),0)
          or quote.total_cents::bigint <> quote.subtotal_cents::bigint+quote.tax_cents then
          raise exception 'Review the source quote totals before generating an invoice.' using errcode='23514';
        end if;
      end if;
      source_lines := coalesce(source_lines,jsonb_build_array(jsonb_build_object('name',coalesce(nullif(replace(job.service_type,'_',' '),''),'Completed service'),
        'description',job.requested_scope,'quantity',1,'unit_price_cents',0,'total_cents',0)));
      billing_contact := coalesce(quote.billing_contact_id,quote.approval_contact_id,quote.recipient_contact_id,job.property_manager_contact_id);
      header := jsonb_build_object('tax_cents',tax,'due_at',((current_timestamp at time zone 'America/New_York')::date+15)+time '17:00' at time zone 'UTC');
    else
      if (p_manual->>'customer_id')::uuid is distinct from job.customer_id or (p_manual->>'organization_id')::uuid is distinct from job.organization_id then
        raise exception 'Selected work order does not belong to the selected contracting party.' using errcode='23514';
      end if;
      source_lines := p_manual->'lines';
      if jsonb_array_length(source_lines)=0 or length(coalesce(p_manual->>'notes',''))>20000 then
        raise exception 'Add invoice lines and review the note length.' using errcode='22023';
      end if;
      billing_contact := job.property_manager_contact_id;
      -- Custom invoice lines remain custom; source quote cannot set their prices.
      header := jsonb_build_object('tax_cents',0,'due_at',(p_manual->>'due_at')::timestamptz);
    end if;
    header := header || jsonb_build_object('customer_id',job.customer_id,'organization_id',job.organization_id,'job_id',job.id,
      'quote_id',case when p_manual is null then source_quote end,'service_location_id',job.service_location_id,
      'billing_contact_id',billing_contact,'accounts_payable_contact_id',billing_contact,
      'recurring_service_plan_id',job.recurring_service_plan_id,'recurring_occurrence_id',job.recurring_occurrence_id);
    new_id := (public.create_invoice_draft(header,source_lines)->>'id')::uuid;
    next_sort := jsonb_array_length(source_lines);
    -- Use only locked, approved, unbilled additions with matching source parties.
    for co in select * from public.change_orders where job_id=job.id and invoice_id is null and status='approved' order by created_at,id loop
      if co.customer_id is distinct from job.customer_id or co.organization_id is distinct from job.organization_id
        or (co.service_location_id is not null and co.service_location_id is distinct from job.service_location_id)
        or (co.source_quote_id is not null and co.source_quote_id is distinct from source_quote) then
        raise exception 'An approved addition does not match this work order. Review it before invoicing.' using errcode='23514';
      end if;
      select coalesce(sum(amount_cents),0) into co_subtotal from public.change_order_line_items where change_order_id=co.id;
      if co_subtotal <> co.subtotal_cents or co.total_cents::bigint <> co_subtotal+co.tax_cents+co.fee_cents
        or exists(select 1 from public.change_order_line_items where change_order_id=co.id and amount_cents<>round(quantity*unit_price_cents)) then
        raise exception 'Review the approved addition quantities and totals before invoicing.' using errcode='23514';
      end if;
      for line in select * from public.change_order_line_items where change_order_id=co.id order by sort_order,id loop
        -- Never silently mark an addition billed if its lines are on another invoice.
        if exists(select 1 from public.invoice_line_items where source_change_order_line_item_id=line.id) then
          raise exception 'An approved addition is already linked to another invoice. Review its billing history.' using errcode='23514';
        end if;
        insert into public.invoice_line_items(invoice_id,name,description,service_category_id,material_id,quantity,unit_price_cents,total_cents,sort_order,source_change_order_line_item_id)
          values(new_id,line.title,line.description,line.service_category_id,line.material_id,line.quantity,line.unit_price_cents,line.amount_cents,next_sort,line.id);
        next_sort := next_sort+1; addition_lines := addition_lines+1;
      end loop;
      if co.fee_cents>0 then
        insert into public.invoice_line_items(invoice_id,name,description,quantity,unit_price_cents,total_cents,sort_order)
          values(new_id,'Additional work fee',co.change_order_number||' · '||co.title,1,co.fee_cents,co.fee_cents,next_sort);
        next_sort := next_sort+1;
      end if;
      tax := tax+co.tax_cents;
      update public.change_orders set invoice_id=new_id where id=co.id;
      additions := additions+1;
    end loop;
    select sum(total_cents)::bigint into subtotal from public.invoice_line_items where invoice_id=new_id;
    if subtotal+tax>2147483647 then raise exception 'Invoice total is too large.' using errcode='22023'; end if;
    -- A zero-price draft is still a draft; invoice creation is not a payment.
    update public.invoices set subtotal_cents=subtotal::integer,tax_cents=tax::integer,total_cents=(subtotal+tax)::integer,
      balance_due_cents=(subtotal+tax)::integer,status='draft',paid_at=null where id=new_id;
    if p_manual is not null and nullif(btrim(p_manual->>'notes'),'') is not null then
      insert into public.notes(customer_id,job_id,service_location_id,author_user_id,visibility,body)
        values(job.customer_id,job.id,job.service_location_id,actor,'internal','Invoice note: '||(p_manual->>'notes'));
    end if;
    -- PR09: preparing paperwork does not complete work or its future visits.
    if new_job then
      insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
        values(actor,'job',job.id,'work_order_created',jsonb_build_object('source_quote_id',quote.id));
    end if;
    if p_quote_id is not null then
      -- Preserve the existing approved-quote material-plan copy atomically.
      for line in select li.*,m.default_unit from public.quote_line_items li join public.material_catalog m on m.id=li.material_id where li.quote_id=quote.id loop
        select id into requirement from public.quote_material_requirements where quote_id=quote.id and quote_line_item_id=line.id;
        if requirement is null then
          insert into public.quote_material_requirements(quote_id,quote_line_item_id,material_id,planned_quantity,unit,is_estimated,notes)
            values(quote.id,line.id,line.material_id,line.quantity,line.default_unit,true,'Copied from approved quote; review before reserving inventory.') returning id into requirement;
        end if;
        insert into public.job_material_requirements(job_id,material_id,source_quote_requirement_id,planned_quantity,unit,is_estimated,notes)
          values(job.id,line.material_id,requirement,line.quantity,line.default_unit,true,'Copied from approved quote; no stock was used or reserved automatically.')
          on conflict(job_id,source_quote_requirement_id) do update set material_id=excluded.material_id,planned_quantity=excluded.planned_quantity,unit=excluded.unit,is_estimated=excluded.is_estimated,notes=excluded.notes;
      end loop;
      if quote.recurring_occurrence_id is not null then
        update public.recurring_service_occurrences set status='approved',work_order_id=job.id,renewal_quote_id=quote.id where id=quote.recurring_occurrence_id;
      end if;
    end if;
    insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json) values
      (actor,'staff','invoice',new_id,'invoice_draft_created',jsonb_build_object('source_quote_id',source_quote,'generation_request_id',p_request_id,'total_cents',subtotal+tax)),
      (actor,'staff','job',job.id,'invoice_draft_created_from_job',jsonb_build_object('invoice_id',new_id,'job_status_before',before_status,'job_status_after',job.status,'generation_request_id',p_request_id));
    update public.activity_log set organization_id=job.organization_id,action_category='invoices',record_label='Draft invoice',
      summary='A draft invoice was created.',destination_path='/admin/invoices/'||new_id::text
      where subject_id=new_id and event_type='invoice_draft_created';
    if additions>0 then
      insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
        values(actor,'invoice',new_id,'approved_change_orders_added',jsonb_build_object('line_count',addition_lines,'change_order_count',additions));
    end if;
    result := jsonb_build_object('invoice_id',new_id,'job_id',job.id,'existing',false,'replayed',false,'invoice_status','draft',
      'job_completed',false,'added_change_order_count',additions);
  end if;
  if not app_private.has_staff_role() then raise exception 'Office access is disabled.' using errcode='42501'; end if;
  insert into app_private.invoice_generation_requests(request_id,actor_user_id,input_json,job_id,invoice_id,result_json)
    values(p_request_id,actor,input_json,job.id,(result->>'invoice_id')::uuid,result);
  return result;
end;
$$;

-- Office review and completion use the same parent-first lock order.
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

  perform 1 from public.jobs where id=p_job_id for update;
  select * into target_closeout
  from public.job_closeouts
  where job_id = p_job_id
  for update;

  if target_closeout.id is null then
    raise exception 'Closeout not found.';
  end if;

  if not app_private.has_staff_role() then raise exception 'Office access is disabled.' using errcode='42501'; end if;

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

-- Keep the PR08 transactional contract; guard work added after completion.
create or replace function app_private.save_schedule_event_locked(
  p_event_id uuid, p_expected_revision integer, p_event jsonb, p_employee_ids uuid[],
  p_override_reason text, p_allow_conflicts boolean, p_exclude uuid[], p_mode text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old public.schedule_events%rowtype; v_new public.schedule_events%rowtype;
  v_old_ids uuid[]; v_initial_job uuid; v_request uuid; v_replay public.schedule_events%rowtype; v_job public.jobs%rowtype; v_ids uuid[]; v_warnings integer := 0;
begin
  if auth.uid() is null or not app_private.has_schedule_estimator_role() then
    raise exception 'Sign in with schedule management access.' using errcode = '42501';
  end if;
  if p_event is null or jsonb_typeof(p_event) <> 'object' or p_mode not in ('details','time','status') then
    raise exception 'The visit could not be read. Refresh the calendar.' using errcode = '22023';
  end if;
  -- The browser keeps this creation identity through uncertain responses.
  -- A retry acknowledges the saved visit and never replays crew/history edits.
  if p_event_id is null and p_mode='details' then
    v_request := nullif(p_event->>'request_id','')::uuid;
    if v_request is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_request::text,8081));
      select * into v_replay from public.schedule_events where id=v_request;
      if v_replay.id is not null then
        if v_replay.created_by_user_id is distinct from auth.uid()
          or not app_private.can_manage_schedule_event_type(v_replay.event_type) then
          raise exception 'This visit cannot be acknowledged by this account.' using errcode='42501';
        end if;
        return jsonb_build_object('id',v_replay.id,'job_id',v_replay.job_id,'edit_revision',v_replay.edit_revision,'warning_count',0,'replayed',true);
      end if;
    end if;
  end if;
  select job_id into v_initial_job from public.schedule_events where id = p_event_id;
  -- Job before event everywhere, and sorted parents when relinking a visit.
  perform 1 from public.jobs where id in (v_initial_job, nullif(p_event->>'job_id','')::uuid) order by id for update;
  if p_event_id is not null then
    select * into v_old from public.schedule_events where id = p_event_id for update;
    if v_old.id is null then raise exception 'Visit not found.' using errcode = 'P0002'; end if;
    if v_old.job_id is distinct from v_initial_job or p_expected_revision is null or v_old.edit_revision <> p_expected_revision then
      raise exception 'This schedule changed since you opened it. Your entries are still here. Refresh and review the latest schedule before saving.' using errcode = '40001';
    end if;
    if not app_private.can_manage_schedule_event_type(v_old.event_type) then
      raise exception 'You do not have permission to edit this visit.' using errcode = '42501';
    end if;
    v_new := v_old;
  else
    if p_mode <> 'details' then raise exception 'Choose an existing visit.' using errcode = '22023'; end if;
    v_new.id := coalesce(v_request,gen_random_uuid()); v_new.created_by_user_id := auth.uid();
    v_new.status := 'scheduled'; v_new.all_day := false;
    v_new.work_session_group_id := coalesce(nullif(p_event->>'work_session_group_id','')::uuid,gen_random_uuid());
  end if;
  if p_mode = 'details' then
    v_new.title := nullif(btrim(p_event->>'title'),'');
    v_new.description := nullif(p_event->>'description','');
    v_new.event_type := p_event->>'event_type'; v_new.status := p_event->>'status';
    v_new.job_id := nullif(p_event->>'job_id','')::uuid;
    v_new.starts_at := (p_event->>'starts_at')::timestamptz;
    v_new.ends_at := nullif(p_event->>'ends_at','')::timestamptz;
    v_new.all_day := coalesce((p_event->>'all_day')::boolean,false);
    v_new.location_label := nullif(p_event->>'location_label','');
    v_new.calendar_notes := nullif(p_event->>'calendar_notes','');
  elsif p_mode = 'time' then
    if v_old.status not in ('scheduled','confirmed','in_progress') then
      raise exception 'This visit is no longer active. Refresh the calendar.' using errcode = '40001';
    end if;
    v_new.starts_at := (p_event->>'starts_at')::timestamptz;
    v_new.ends_at := (p_event->>'ends_at')::timestamptz; v_new.all_day := false;
  else v_new.status := p_event->>'status';
  end if;
  if not coalesce(app_private.can_manage_schedule_event_type(v_new.event_type),false) then
    raise exception 'You do not have permission to schedule this visit type.' using errcode = '42501';
  end if;
  if v_new.title is null or length(v_new.title) > 140 or v_new.starts_at is null
    or (v_new.ends_at is not null and v_new.ends_at <= v_new.starts_at)
    or length(v_new.description)>5000 or length(v_new.location_label)>240
    or length(v_new.calendar_notes) > 1000 or length(p_override_reason) > 600 then
    raise exception 'Review the visit title, dates, times and notes.' using errcode = '22023';
  end if;
  if v_old.lead_intake_job_id is not null and v_new.job_id is distinct from v_old.job_id then
    raise exception 'A website estimate must stay linked to its original lead.' using errcode = '23514';
  end if;
  if v_new.job_id is not null then
    select * into v_job from public.jobs where id = v_new.job_id;
    if v_job.id is null or v_job.archived_at is not null or v_job.status in ('cancelled','lost') then
      raise exception 'Choose an available work order.' using errcode = '23514';
    end if;
    if v_new.event_type='job' and v_new.status in ('scheduled','confirmed','in_progress')
      and v_job.completed_at is not null and v_job.status in ('completed','completed_pending_review','ready_to_invoice','invoiced','paid') then
      raise exception 'Work is already complete. Review or reopen the work order before scheduling more visits.' using errcode='23514';
    end if;
    if not exists(select 1 from public.service_locations l where l.id = v_job.service_location_id and l.archived_at is null
      and ((v_job.customer_id is not null and l.customer_id = v_job.customer_id and l.organization_id is null)
        or (v_job.organization_id is not null and l.organization_id = v_job.organization_id and l.customer_id is null))) then
      raise exception 'The work order property needs review before scheduling.' using errcode = '23514';
    end if;
    if v_old.source_customer_id is not null and v_job.customer_id is distinct from v_old.source_customer_id
      or v_old.source_organization_id is not null and v_job.organization_id is distinct from v_old.source_organization_id then
      raise exception 'The selected work order belongs to another customer.' using errcode = '23514';
    end if;
    v_new.service_location_id := v_job.service_location_id;
  elsif v_old.job_id is not null then v_new.service_location_id := null;
  end if;
  if p_mode = 'details' then v_ids := app_private.normalize_schedule_employees(p_employee_ids);
  else select coalesce(array_agg(employee_id order by employee_id), '{}') into v_ids
    from public.schedule_event_assignments where event_id = p_event_id;
  end if;
  select coalesce(array_agg(employee_id order by employee_id),'{}') into v_old_ids
    from public.schedule_event_assignments where event_id=p_event_id;
  if v_new.status in ('scheduled','confirmed','in_progress') or (p_mode='details' and v_ids is distinct from v_old_ids) then
    v_warnings := app_private.validate_schedule_crew(v_ids,v_new.event_type,
      case when v_new.status in ('scheduled','confirmed','in_progress') then v_new.starts_at else null end,
      case when v_new.status in ('scheduled','confirmed','in_progress') then v_new.ends_at else null end,
      coalesce(p_exclude,'{}') || v_new.id,p_override_reason,p_allow_conflicts);
  end if;
  -- Recheck live authorization after waiting for parent/event/employee locks.
  if not app_private.can_manage_schedule_event_type(v_new.event_type) then
    raise exception 'You no longer have permission to save this visit.' using errcode = '42501';
  end if;
  if p_event_id is null then
    insert into public.schedule_events(id,job_id,service_location_id,title,description,event_type,status,
      starts_at,ends_at,all_day,location_label,calendar_notes,created_by_user_id,work_session_group_id)
    values(v_new.id,v_new.job_id,v_new.service_location_id,v_new.title,v_new.description,v_new.event_type,v_new.status,
      v_new.starts_at,v_new.ends_at,v_new.all_day,v_new.location_label,v_new.calendar_notes,auth.uid(),v_new.work_session_group_id);
  else
    update public.schedule_events set job_id=v_new.job_id, service_location_id=v_new.service_location_id,
      title=v_new.title,description=v_new.description,event_type=v_new.event_type,status=v_new.status,
      starts_at=v_new.starts_at,ends_at=v_new.ends_at,all_day=v_new.all_day,
      location_label=v_new.location_label,calendar_notes=v_new.calendar_notes where id=v_new.id;
  end if;
  if p_mode = 'details' then
    delete from public.schedule_event_assignments where event_id=v_new.id;
    insert into public.schedule_event_assignments(event_id,employee_id,assignment_role)
      select v_new.id,x,case when v_new.event_type='estimate' then 'estimator' else 'assigned' end from unnest(v_ids) as x;
  end if;
  if v_old.event_type='job' then perform app_private.refresh_job_schedule(v_old.job_id); end if;
  if v_new.event_type='job' then perform app_private.refresh_job_schedule(v_new.job_id);
  elsif v_new.event_type='estimate' and v_new.status in ('scheduled','confirmed','in_progress') then
    update public.jobs set status='estimate_scheduled' where id=v_new.job_id and status='new_lead';
  end if;
  insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
    values(auth.uid(),'schedule_event',v_new.id,case when p_event_id is null then 'schedule_event_created' else 'schedule_event_updated' end,
      jsonb_build_object('mode',p_mode,'from_revision',v_old.edit_revision,
        'from_start',v_old.starts_at,'to_start',v_new.starts_at,'from_status',v_old.status,'to_status',v_new.status,
        'assigned_employee_ids',to_jsonb(v_ids),'override_reason',nullif(btrim(p_override_reason),''),'warning_count',v_warnings));
  perform app_private.queue_google_calendar_schedule_event(v_new.id,'atomic_schedule_saved');
  return (select jsonb_build_object('id',id,'job_id',job_id,'edit_revision',edit_revision,'warning_count',v_warnings)
    from public.schedule_events where id=v_new.id);
end;
$$;

-- Billing remains separately filterable while uncompleted work stays active.
create or replace view public.job_operations_index
with (security_invoker = true)
as
with job_facts as (
  select
    job.id,
    job.customer_id,
    job.organization_id,
    job.service_location_id,
    job.assigned_crew_user_id,
    job.source_quote_id,
    job.status as job_status,
    job.priority,
    job.service_type,
    job.requested_scope,
    job.updated_at,
    job.created_at,
    customer.display_name as customer_name,
    organization.name as organization_name,
    coalesce(organization.name, customer.display_name, 'Contracting party missing') as contracting_party_name,
    location.street,
    location.city,
    location.state,
    location.postal_code,
    crew.full_name as assigned_crew_name,
    crew.email as assigned_crew_email,
    appointment.id as appointment_id,
    appointment.status as appointment_status,
    appointment.starts_at as appointment_starts_at,
    appointment.ends_at as appointment_ends_at,
    quote.id as quote_id,
    quote.quote_number,
    quote.status as quote_status,
    quote.total_cents as quote_total_cents_unmasked,
    quote.first_line_name as quote_first_line_name,
    quote.line_names as quote_line_names,
    invoice.id as invoice_id,
    invoice.invoice_number,
    invoice.status as invoice_status,
    invoice.total_cents as invoice_total_cents_unmasked,
    invoice.balance_due_cents as invoice_balance_due_cents_unmasked,
    invoice.due_at as invoice_due_at,
    coalesce(change_orders.unbilled_count, 0)::integer as approved_unbilled_change_order_count,
    coalesce(communications.failed_count, 0)::integer as failed_communication_count,
    cancelled_appointment.has_cancelled_appointment,
    case
      when job.service_type is null or job.service_type = 'other' then
        coalesce(
          nullif(quote.first_line_name, ''),
          nullif(pg_catalog.left(pg_catalog.split_part(job.requested_scope, E'\n', 1), 72), ''),
          'Field service work'
        )
      else pg_catalog.initcap(pg_catalog.replace(job.service_type, '_', ' '))
    end as display_title
  from public.jobs as job
  left join public.customers as customer on customer.id = job.customer_id
  left join public.organizations as organization on organization.id = job.organization_id
  left join public.service_locations as location on location.id = job.service_location_id
  left join public.profiles as crew on crew.id = job.assigned_crew_user_id
  left join lateral (
    select
      candidate.id,
      candidate.status,
      candidate.starts_at,
      candidate.ends_at
    from public.schedule_events as candidate
    where candidate.job_id = job.id
      and candidate.event_type = 'job'
      and candidate.status in ('scheduled', 'confirmed', 'in_progress')
    order by
      (candidate.status = 'in_progress') desc,
      (candidate.ends_at is null or candidate.ends_at >= pg_catalog.now()) desc,
      candidate.starts_at,
      candidate.created_at
    limit 1
  ) as appointment on true
  left join lateral (
    select
      candidate.id,
      candidate.quote_number,
      candidate.status,
      candidate.total_cents,
      line_summary.first_line_name,
      line_summary.line_names
    from public.quotes as candidate
    left join lateral (
      select
        (pg_catalog.array_agg(line.name order by line.sort_order, line.created_at))[1] as first_line_name,
        pg_catalog.string_agg(line.name, ' ' order by line.sort_order, line.created_at) as line_names
      from public.quote_line_items as line
      where line.quote_id = candidate.id
    ) as line_summary on true
    where candidate.id = job.source_quote_id or candidate.job_id = job.id
    order by (candidate.id = job.source_quote_id) desc, (candidate.status = 'approved') desc, candidate.created_at desc
    limit 1
  ) as quote on true
  left join lateral (
    select
      candidate.id,
      candidate.invoice_number,
      candidate.status,
      candidate.total_cents,
      candidate.balance_due_cents,
      candidate.due_at
    from public.invoices as candidate
    where candidate.job_id = job.id and candidate.status <> 'void'
    order by candidate.created_at, candidate.id
    limit 1
  ) as invoice on true
  left join lateral (
    select pg_catalog.count(*)::integer as unbilled_count
    from public.change_orders as change_order
    where change_order.job_id = job.id
      and change_order.status = 'approved'
      and change_order.invoice_id is null
  ) as change_orders on true
  left join lateral (
    select pg_catalog.count(*)::integer as failed_count
    from public.customer_communications as communication
    left join public.appointments as related_appointment on related_appointment.id = communication.appointment_id
    left join public.schedule_events as related_event on related_event.id = communication.schedule_event_id
    where communication.status = 'failed'
      and (communication.job_id = job.id or related_appointment.job_id = job.id or related_event.job_id = job.id)
  ) as communications on true
  left join lateral (
    select true as has_cancelled_appointment
    from public.schedule_events as cancelled
    where cancelled.job_id = job.id
      and cancelled.event_type = 'job'
      and cancelled.status = 'cancelled'
    limit 1
  ) as cancelled_appointment on true
), derived as (
  select
    job_facts.*,
    case
      when job_status in ('cancelled', 'lost') then 'cancelled'
      when job_status = 'returned_for_correction' then 'needs_attention'
      when job_status = 'in_progress' then 'in_progress'
      when job_status in ('accepted','scheduled') and appointment_starts_at is not null and appointment_starts_at <= pg_catalog.now() then 'in_progress'
      when job_status in ('accepted','scheduled') and appointment_starts_at is not null then 'scheduled'
      when job_status in ('accepted','scheduled') then 'to_be_scheduled'
      when invoice_status = 'paid' or job_status = 'paid' then 'paid'
      when invoice_status in ('sent','partially_paid','overdue') or job_status = 'invoiced' then 'invoiced'
      when job_status in ('completed','completed_pending_review','ready_to_invoice') then 'work_complete'
      when appointment_starts_at is not null and appointment_starts_at <= pg_catalog.now() then 'in_progress'
      when appointment_starts_at is not null then 'scheduled'
      else 'to_be_scheduled'
    end as operational_state
  from job_facts
)
select
  derived.id,
  derived.customer_id,
  derived.organization_id,
  derived.service_location_id,
  derived.assigned_crew_user_id,
  derived.source_quote_id,
  derived.job_status,
  derived.operational_state,
  derived.priority,
  derived.service_type,
  derived.display_title,
  derived.requested_scope,
  derived.contracting_party_name,
  derived.customer_name,
  derived.organization_name,
  derived.street,
  derived.city,
  derived.state,
  derived.postal_code,
  derived.assigned_crew_name,
  derived.assigned_crew_email,
  derived.appointment_id,
  derived.appointment_status,
  derived.appointment_starts_at,
  derived.appointment_ends_at,
  (derived.appointment_starts_at at time zone 'America/New_York')::date as appointment_local_date,
  derived.quote_id,
  derived.quote_number,
  derived.quote_status,
  case when app_private.has_financial_reporting_role() then derived.quote_total_cents_unmasked else null end as quote_total_cents,
  derived.invoice_id,
  derived.invoice_number,
  derived.invoice_status,
  case when app_private.has_financial_reporting_role() then derived.invoice_total_cents_unmasked else null end as invoice_total_cents,
  case when app_private.has_financial_reporting_role() then derived.invoice_balance_due_cents_unmasked else null end as invoice_balance_due_cents,
  derived.invoice_due_at,
  derived.approved_unbilled_change_order_count,
  derived.failed_communication_count,
  coalesce(derived.has_cancelled_appointment, false) as has_cancelled_appointment,
  coalesce((
    derived.job_status = 'returned_for_correction'
    or derived.customer_id is null and derived.organization_id is null
    or derived.service_location_id is null
    or derived.failed_communication_count > 0
    or derived.approved_unbilled_change_order_count > 0
    or derived.invoice_status = 'overdue'
    or (
      coalesce(derived.has_cancelled_appointment, false)
      and derived.operational_state in ('to_be_scheduled', 'scheduled', 'in_progress')
      and derived.appointment_id is null
    )
  ), false) as needs_attention,
  (derived.appointment_starts_at at time zone 'America/New_York')::date = (pg_catalog.now() at time zone 'America/New_York')::date as is_today,
  (
    derived.invoice_status in ('draft', 'sent', 'partially_paid', 'overdue')
    or derived.job_status in ('completed', 'completed_pending_review', 'ready_to_invoice') and derived.invoice_id is null
    or derived.approved_unbilled_change_order_count > 0
  ) as is_billing,
  (
    derived.job_status in ('completed', 'completed_pending_review', 'ready_to_invoice')
    and derived.invoice_id is null
  ) as awaiting_invoice,
  case
    when derived.operational_state = 'in_progress' then 10
    when (derived.appointment_starts_at at time zone 'America/New_York')::date = (pg_catalog.now() at time zone 'America/New_York')::date then 20
    when derived.appointment_starts_at < pg_catalog.now() then 30
    when derived.job_status = 'returned_for_correction' then 35
    when derived.operational_state = 'to_be_scheduled' then 40
    when derived.operational_state = 'scheduled' then 50
    when derived.job_status in ('completed', 'completed_pending_review', 'ready_to_invoice') and derived.invoice_id is null then 60
    else 90
  end as action_rank,
  pg_catalog.lower(pg_catalog.concat_ws(
    ' ',
    derived.contracting_party_name,
    derived.street,
    derived.city,
    derived.state,
    derived.postal_code,
    derived.display_title,
    derived.service_type,
    derived.requested_scope,
    derived.quote_number,
    derived.quote_line_names,
    derived.invoice_number
  )) as search_text,
  derived.updated_at,
  derived.created_at
from derived;

comment on view public.job_operations_index is
  'RLS-aware operations read model using normalized daily job work sessions.';

revoke all on table public.job_operations_index from public, anon;
grant select on table public.job_operations_index to authenticated, service_role;

notify pgrst, 'reload schema';
