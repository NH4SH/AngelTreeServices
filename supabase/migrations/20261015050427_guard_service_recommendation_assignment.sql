-- Separate follow-up finding: confirmed NULL-assignee rejection bypass.
-- Reuse the established active-account-aware assignment predicate, including
-- durable employee and work-session assignments. No recommendation redesign.
begin;
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
  if not (app_private.has_staff_role() or app_private.is_assigned_to_job(p_job_id)) then
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
revoke all on function public.submit_crew_service_recommendation(uuid,text,text,text,text) from public, anon;
grant execute on function public.submit_crew_service_recommendation(uuid,text,text,text,text) to authenticated, service_role;
commit;
