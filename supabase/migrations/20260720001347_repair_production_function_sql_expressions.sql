-- Historical migrations were corrected after they had already been recorded
-- in production. Replace the live function definitions without changing their
-- signatures, security modes, search paths, grants, or workflow behavior.

do $repair$
declare
  target regprocedure;
  definition text;
begin
  foreach target in array array[
    'public.approve_change_order(uuid,text,uuid,text,uuid,text)'::regprocedure,
    'public.attach_approved_change_orders_to_invoice(uuid)'::regprocedure,
    'public.generate_due_recurring_occurrences(integer)'::regprocedure,
    'public.submit_crew_service_recommendation(uuid,text,text,text,text)'::regprocedure
  ] loop
    definition := pg_catalog.pg_get_functiondef(target);
    definition := pg_catalog.replace(definition, 'pg_catalog.coalesce', 'coalesce');
    definition := pg_catalog.replace(definition, 'pg_catalog.nullif', 'nullif');
    definition := pg_catalog.replace(definition, 'pg_catalog.least', 'least');
    definition := pg_catalog.replace(definition, 'pg_catalog.greatest', 'greatest');
    execute definition;
  end loop;
end;
$repair$;

create or replace function public.close_recurring_occurrence(
  p_occurrence_id uuid,
  p_status text,
  p_reason text default null
)
returns table (occurrence_id uuid, next_service_due_date date)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target record;
  next_date date;
begin
  if not app_private.has_staff_role() then raise exception 'Only staff can close recurring occurrences.'; end if;
  if p_status not in ('completed', 'skipped', 'cancelled') then raise exception 'Choose a valid closing status.'; end if;
  if p_status in ('skipped', 'cancelled') and pg_catalog.btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required.';
  end if;

  select o.*, p.recurrence_pattern, p.custom_interval_count, p.source_recommendation_id
  into target
  from public.recurring_service_occurrences o
  join public.recurring_service_plans p on p.id = o.recurring_plan_id
  where o.id = p_occurrence_id for update of o;
  if not found then raise exception 'Recurring occurrence not found.'; end if;
  if target.status in ('completed', 'skipped', 'cancelled') then
    return query select target.id, (select l.next_service_due_date from public.recurring_plan_locations l where l.id = target.recurring_plan_location_id);
    return;
  end if;

  next_date := case when target.recurrence_pattern = 'seasonal_manual' then target.target_service_date
    else app_private.next_recurring_service_date(target.target_service_date, target.recurrence_pattern, target.custom_interval_count) end;

  update public.recurring_service_occurrences set
    status = p_status,
    completed_at = case when p_status = 'completed' then pg_catalog.now() else null end,
    skip_reason = case when p_status in ('skipped', 'cancelled') then pg_catalog.left(pg_catalog.btrim(p_reason), 1000) else null end
  where id = p_occurrence_id;

  if target.recurrence_pattern <> 'seasonal_manual' then
    update public.recurring_plan_locations as rpl set
      next_service_due_date = next_date,
      next_review_date = next_date - (
        select rsp.planning_window_days
        from public.recurring_service_plans as rsp
        where rsp.id = target.recurring_plan_id
      )
    where rpl.id = target.recurring_plan_location_id
      and rpl.next_service_due_date <= target.target_service_date;
  end if;

  update public.follow_up_tasks set status = 'completed', completed_at = pg_catalog.now(), completed_by_user_id = (select auth.uid())
  where recurring_occurrence_id = p_occurrence_id and status not in ('completed', 'cancelled');
  if p_status = 'completed' and target.source_recommendation_id is not null then
    update public.service_recommendations
    set status = 'completed', reviewed_at = pg_catalog.now(), reviewed_by_user_id = (select auth.uid())
    where id = target.source_recommendation_id and status not in ('declined', 'cancelled');
  end if;
  insert into public.activity_log (actor_user_id, subject_type, subject_id, event_type, metadata_json)
  values ((select auth.uid()), 'recurring_occurrence', p_occurrence_id, 'recurring_occurrence_' || p_status,
    pg_catalog.jsonb_build_object('reason_recorded', p_reason is not null));
  return query select p_occurrence_id, next_date;
end;
$$;
