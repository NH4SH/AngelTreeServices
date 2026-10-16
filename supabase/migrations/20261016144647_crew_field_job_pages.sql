-- PR11: caller-scoped read model only. No writes, policy changes or backfill.
create or replace function public.read_crew_job_page(
  p_scope text default 'today', p_date date default (now() at time zone 'America/New_York')::date,
  p_limit integer default 25, p_cursor jsonb default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  day_start timestamptz; day_end timestamptz; anchor_at timestamptz; anchor_id uuid; result jsonb;
begin
  if auth.uid() is null or not public.has_effective_platform_access() then
    raise exception 'Active platform access required.' using errcode='42501';
  end if;
  if p_scope is null or p_scope not in ('dashboard','today','upcoming','active','unscheduled','history','needs_photos','ready_to_complete')
      or p_date is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid field page request.' using errcode='22023';
  end if;
  day_start := p_date::timestamp at time zone 'America/New_York';
  day_end := (p_date+1)::timestamp at time zone 'America/New_York';
  if p_cursor is not null then
    if jsonb_typeof(p_cursor)<>'object' or p_cursor->>'scope' is distinct from p_scope
        or p_cursor->>'date' is distinct from p_date::text or p_cursor->>'v' is distinct from '1'
        or p_cursor->>'at' is null or p_cursor->>'id' is null then
      raise exception 'Invalid field page cursor.' using errcode='22023';
    end if;
    anchor_at := (p_cursor->>'at')::timestamptz;
    anchor_id := (p_cursor->>'id')::uuid;
    if not isfinite(anchor_at) then raise exception 'Invalid field page cursor.' using errcode='22023'; end if;
  end if;
  with source_jobs as materialized (
    select j.* from public.jobs j where p_scope<>'history' and j.archived_at is null and j.completed_at is null
      and j.status in ('accepted','scheduled','in_progress','returned_for_correction','completed_pending_review','ready_to_invoice')
    union all
    select j.* from public.jobs j where p_scope='history' and j.archived_at is null
      and j.status in ('accepted','scheduled','in_progress','returned_for_correction','completed_pending_review','ready_to_invoice','completed','invoiced','paid')
      and (j.completed_at is not null or j.status in ('completed','invoiced','paid'))
  ), candidates as materialized (
    select j.id,j.customer_id,j.organization_id,j.service_location_id,j.assigned_crew_user_id,
      j.status,j.service_type,j.priority,j.requested_scope,j.created_at,j.updated_at,j.completed_at,
      (j.completed_at is not null or j.status in ('completed','invoiced','paid')) closed,
      case when p_scope='history' then j.scheduled_start_at else coalesce(visit.starts_at,case when not coalesce(visits.any_visit,false) then j.scheduled_start_at end) end work_start,
      case when p_scope='history' then j.scheduled_end_at else coalesce(visit.ends_at,case when not coalesce(visits.any_visit,false) then j.scheduled_end_at end) end work_end,
      coalesce(visits.any_visit,false) any_visit,
      coalesce(photo_flags.has_before,false) has_before,coalesce(photo_flags.has_after,false) has_after,
      coalesce(future_visit.upcoming,false) has_future_visit
    from source_jobs j
    -- Bounded lateral probes keep RLS evaluation on this job's indexed rows.
    -- EXISTS alternatives otherwise build global RLS-filtered hashes repeatedly.
    left join lateral (
      select true any_visit from public.schedule_events e
      where p_scope<>'history' and e.job_id=j.id and e.event_type='job' limit 1
    ) visits on true
    left join lateral (
      select bool_or(ph.photo_type='before') has_before,bool_or(ph.photo_type='after') has_after
      from public.job_photos ph where p_scope in ('dashboard','needs_photos') and ph.job_id=j.id
    ) photo_flags on true
    left join lateral (
      select true upcoming from public.schedule_events e where p_scope in ('dashboard','upcoming')
        and e.job_id=j.id and e.event_type='job' and e.status in ('scheduled','confirmed','in_progress')
        and e.starts_at>=day_end limit 1
    ) future_visit on true
    left join lateral (
      select e.starts_at,e.ends_at from public.schedule_events e
      where p_scope<>'history' and e.job_id=j.id and e.event_type='job' and e.status in ('scheduled','confirmed','in_progress')
        and (case when p_scope in ('today','dashboard') then
          e.starts_at<day_end and coalesce(e.ends_at,e.starts_at+interval '1 microsecond')>day_start
          when p_scope='upcoming' then e.starts_at>=day_end else true end)
      order by (coalesce(e.ends_at,e.starts_at+interval '1 microsecond')<=day_start),e.starts_at,e.id limit 1
    ) visit on true

  ), classified as materialized (
    select c.*,case when closed then coalesce(completed_at,updated_at,created_at) else coalesce(work_start,created_at) end sort_at,
      work_start<day_end and coalesce(work_end,work_start+interval '1 microsecond')>day_start is_today,
      (has_future_visit or (not any_visit and work_start>=day_end)) is_upcoming
    from candidates c
  ), matching as materialized (
    select c.* from classified c where case
      when p_scope in ('today','dashboard') then coalesce(is_today,false)
      when p_scope='upcoming' then coalesce(is_upcoming,false)
      when p_scope='unscheduled' then work_start is null
      when p_scope='needs_photos' then not has_before or not has_after
      when p_scope='ready_to_complete' then status in ('in_progress','returned_for_correction')
      else true end
  ), limited as materialized (
    select * from matching where anchor_id is null or
      case when p_scope='history' then (sort_at,id)<(anchor_at,anchor_id) else (sort_at,id)>(anchor_at,anchor_id) end
    order by case when p_scope='history' then sort_at end desc,
      case when p_scope<>'history' then sort_at end asc,
      case when p_scope='history' then id end desc,case when p_scope<>'history' then id end asc
    limit p_limit+1
  ), numbered as (
    select *,row_number() over(order by case when p_scope='history' then sort_at end desc,
      case when p_scope<>'history' then sort_at end asc,
      case when p_scope='history' then id end desc,case when p_scope<>'history' then id end asc) n from limited
  ), page as materialized (select * from numbered where n<=p_limit)
  select jsonb_build_object('total',(select count(*) from matching),'counts',case when p_scope='dashboard' then
    (select jsonb_build_object('upcoming',count(*) filter(where is_upcoming),
      'needs_photos',count(*) filter(where not has_before or not has_after),
      'ready_to_complete',count(*) filter(where status in ('in_progress','returned_for_correction'))) from classified) else null end,
    'next_cursor',case when (select count(*) from limited)>p_limit then
      (select jsonb_build_object('v',1,'scope',p_scope,'date',p_date,'at',sort_at,'id',id) from page order by n desc limit 1) else null end,
    'jobs',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'assigned_crew_user_id',p.assigned_crew_user_id,'status',p.status,'service_type',p.service_type,
      'priority',p.priority,'requested_scope',p.requested_scope,'scheduled_start_at',p.work_start,'scheduled_end_at',p.work_end,
      'completed_at',p.completed_at,'created_at',p.created_at,'updated_at',p.updated_at,
      'customers',(select jsonb_build_object('id',c.id,'display_name',c.display_name,'phone',c.phone) from public.customers c where c.id=p.customer_id),
      'organizations',(select jsonb_build_object('id',o.id,'name',o.name,'billing_phone',o.billing_phone) from public.organizations o where o.id=p.organization_id),
      'service_locations',(select jsonb_build_object('id',l.id,'label',l.label,'street',l.street,'city',l.city,'state',l.state,'postal_code',l.postal_code) from public.service_locations l where l.id=p.service_location_id),
      'photo_counts',coalesce((select jsonb_object_agg(x.photo_type,x.n) from
        (select ph.photo_type,count(*) n from public.job_photos ph where ph.job_id=p.id group by ph.photo_type) x),'{}'::jsonb)
    ) order by p.n) from page p),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function public.read_crew_job_page(text,date,integer,jsonb) from public,anon,service_role;
grant execute on function public.read_crew_job_page(text,date,integer,jsonb) to authenticated;
comment on function public.read_crew_job_page(text,date,integer,jsonb) is
  'Read-only, caller-RLS field pages with Eastern work-visit windows, compact photo counts and bound keyset cursors.';
notify pgrst,'reload schema';
