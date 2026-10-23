begin;

-- Existing service-role cleanup, bounded by sources rather than one HTTP call
-- per visit. No definer rights, sender, status reset, or change to eligibility.
create function public.cancel_obsolete_visit_reminders(p_source_kind text, p_sources jsonb)
returns jsonb language plpgsql security invoker
set search_path = '' set lock_timeout = '2s' as $$
declare expected integer;seen integer:=0;cancelled integer;source record;
begin
  if current_setting('role',true)<>'service_role' or auth.uid() is not null then
    raise exception 'Server-only command' using errcode='42501';
  end if;
  if p_source_kind is null or p_source_kind not in ('schedule_event','appointment')
    or jsonb_typeof(p_sources) is distinct from 'array' then
    raise exception 'Invalid visit cleanup batch' using errcode='22023';
  end if;
  expected:=jsonb_array_length(p_sources);
  if expected<1 or expected>200 then raise exception 'Invalid visit cleanup batch size' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(p_sources)x where jsonb_typeof(x) is distinct from 'object'
    or jsonb_typeof(x->'id') is distinct from 'string' or jsonb_typeof(x->'source_version') is distinct from 'string') then
    raise exception 'Invalid visit cleanup source' using errcode='22023';
  end if;
  if (select count(distinct x.id) from jsonb_to_recordset(p_sources)as x(id uuid,source_version timestamptz))<>expected
    or exists(select 1 from jsonb_to_recordset(p_sources)as x(id uuid,source_version timestamptz)
      where x.id is null or x.source_version is null or not isfinite(x.source_version)) then
    raise exception 'Invalid or duplicate visit cleanup source' using errcode='22023';
  end if;

  -- Match the shared visit -> queue lock order. SHARE permits concurrent cleanup
  -- but prevents a reschedule from changing a source while it is reconciled.
  if p_source_kind='schedule_event' then
    for source in select v.id,v.starts_at,x.source_version from public.schedule_events v
      join jsonb_to_recordset(p_sources)as x(id uuid,source_version timestamptz)on x.id=v.id
      order by v.id for share of v loop
      if source.starts_at is distinct from source.source_version then
        raise exception 'Visit changed; retry reminder preparation' using errcode='40001';end if;
      seen:=seen+1;
    end loop;
  else
    for source in select v.id,v.starts_at,x.source_version from public.appointments v
      join jsonb_to_recordset(p_sources)as x(id uuid,source_version timestamptz)on x.id=v.id
      order by v.id for share of v loop
      if source.starts_at is distinct from source.source_version then
        raise exception 'Visit changed; retry reminder preparation' using errcode='40001';end if;
      seen:=seen+1;
    end loop;
  end if;
  if seen<>expected then raise exception 'Visit unavailable; retry reminder preparation' using errcode='40001';end if;

  if p_source_kind='schedule_event' then
    with targets as materialized(
      select c.id from public.customer_communications c
      join jsonb_to_recordset(p_sources)as x(id uuid,source_version timestamptz)on c.schedule_event_id=x.id
      where c.status='pending'and(c.source_version is null or c.source_version<>x.source_version)
      order by c.id for update of c
    )update public.customer_communications c set status='cancelled',cancelled_at=clock_timestamp(),
      skip_reason='The appointment was rescheduled. A current reminder replaces this one.'
      from targets t where c.id=t.id and c.status='pending';
  else
    with targets as materialized(
      select c.id from public.customer_communications c
      join jsonb_to_recordset(p_sources)as x(id uuid,source_version timestamptz)on c.appointment_id=x.id
      where c.status='pending'and(c.source_version is null or c.source_version<>x.source_version)
      order by c.id for update of c
    )update public.customer_communications c set status='cancelled',cancelled_at=clock_timestamp(),
      skip_reason='The appointment was rescheduled. A current reminder replaces this one.'
      from targets t where c.id=t.id and c.status='pending';
  end if;
  get diagnostics cancelled=row_count;
  return jsonb_build_object('processed',seen,'cancelled',cancelled);
end $$;
alter function public.cancel_obsolete_visit_reminders(text,jsonb) owner to postgres;
revoke all on function public.cancel_obsolete_visit_reminders(text,jsonb) from public,anon,authenticated;
grant execute on function public.cancel_obsolete_visit_reminders(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
