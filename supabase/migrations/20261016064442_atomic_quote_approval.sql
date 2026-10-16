-- Quote acceptance is one transaction. Existing records and history are retained.
alter table public.quotes add column approved_from_revision integer
  check (approved_from_revision is null or approved_from_revision > 0);

create function app_private.approve_quote_locked(p_quote_id uuid,p_expected_revision integer,p_token_hash text default null)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  q public.quotes%rowtype;j public.jobs%rowtype;t public.quote_portal_tokens%rowtype;
  initial_job uuid;resolved_job uuid;created_job boolean:=false;was_approved boolean;
  accepted_at timestamptz;actor uuid:=auth.uid();actor_kind text;
  line record;requirement uuid;source_lines jsonb;subtotal integer;
begin
  -- Public wrappers authorize staff or the service-only customer-token path.
  -- Keep the same job -> quote parent order as PR04 generation and PR05 editing.
  select coalesce(job_id,(select id from public.jobs where source_quote_id=p_quote_id)) into initial_job
    from public.quotes where id=p_quote_id;
  if initial_job is not null then
    select * into j from public.jobs where id=initial_job for update;
    if not found then raise exception 'The linked work order is unavailable. Refresh the quote.' using errcode='40001';end if;
  end if;
  select * into q from public.quotes where id=p_quote_id for update;
  if not found then raise exception 'Quote not found or unavailable.' using errcode='P0002';end if;
  actor_kind:=case when p_token_hash is null then 'staff' else 'portal' end;
  if p_token_hash is null and (actor is null or not app_private.has_staff_role()) then
    raise exception 'Only active office staff may approve quotes.' using errcode='42501';end if;
  if p_token_hash is not null then
    select * into t from public.quote_portal_tokens where token_hash=p_token_hash and quote_id=q.id for update;
    if not found or t.revoked_at is not null or (t.expires_at is not null and t.expires_at<=clock_timestamp()) then
      raise exception 'This quote link is unavailable or expired. Contact Angel Tree Services.' using errcode='42501';end if;
  end if;
  -- Replay a committed approval without rewriting operational work, material
  -- plans, approval timestamps or history. The first displayed version survives
  -- response loss; a current approved page can also recover the same result.
  if q.status='approved' and q.approved_from_revision is not null then
    if p_expected_revision is null or p_expected_revision not in(q.approved_from_revision,q.edit_revision) then
      raise exception 'This proposal changed. Refresh and review the saved proposal before approving.' using errcode='40001';end if;
    if not exists(select 1 from public.jobs x where x.id=q.job_id and x.source_quote_id=q.id
      and x.customer_id is not distinct from q.customer_id and x.organization_id is not distinct from q.organization_id
      and x.service_location_id is not distinct from q.service_location_id) then
      raise exception 'The approved quote and work order need review. Contact the office.' using errcode='23514';end if;
    if p_token_hash is not null then update public.quote_portal_tokens set used_at=coalesce(used_at,q.approved_at) where id=t.id and used_at is null;end if;
    return jsonb_build_object('job_id',q.job_id,'created_job',false,'replayed',true,'edit_revision',q.edit_revision,'approved_at',q.approved_at);
  end if;
  if p_expected_revision is null or q.edit_revision<>p_expected_revision then
    raise exception 'This proposal changed. Refresh and review the saved proposal before approving.' using errcode='40001';end if;
  if q.status not in('draft','sent','change_requested','approved') then
    raise exception 'Only an open quote can be approved.' using errcode='23514';end if;
  was_approved:=q.status='approved';
  if was_approved and p_token_hash is not null then
    raise exception 'This proposal is already approved. Contact the office if its work order needs review.' using errcode='23514';end if;
  select coalesce(q.job_id,(select id from public.jobs where source_quote_id=q.id)) into resolved_job;
  if resolved_job is distinct from initial_job then
    -- Never acquire a newly discovered existing job after holding the quote:
    -- another command may hold that job while waiting for this quote.
    raise exception 'The linked work order changed. Refresh the quote and try again.' using errcode='40001';end if;
  perform app_private.validate_quote_header(q,true);
  if q.service_location_id is null then raise exception 'Add a service location before approving this quote.' using errcode='23514';end if;
  if not was_approved and exists(select 1 from public.invoices where quote_id=q.id) then
    raise exception 'This quote already has billing history. Review it before approval.' using errcode='23514';end if;
  select coalesce(jsonb_agg(jsonb_build_object('name',name,'quantity',quantity,'unit_price_cents',unit_price_cents,'total_cents',total_cents) order by sort_order,id),'[]'::jsonb)
    into source_lines from public.quote_line_items where quote_id=q.id;
  subtotal:=app_private.validate_invoice_lines(source_lines);
  if q.subtotal_cents<>subtotal or q.tax_cents<0 or q.total_cents::bigint<>subtotal::bigint+q.tax_cents then
    raise exception 'Quote lines and totals do not agree. Review the quote before approval.' using errcode='23514';end if;
  if initial_job is null then
    insert into public.jobs(customer_id,organization_id,property_manager_contact_id,onsite_contact_id,service_location_id,
      source_quote_id,status,service_type,priority,requested_scope,debris_handling,debris_handling_notes,
      recurring_service_plan_id,recurring_occurrence_id,recurring_authorization_source)
    values(q.customer_id,q.organization_id,coalesce(q.approval_contact_id,q.recipient_contact_id),q.onsite_contact_id,q.service_location_id,
      q.id,'accepted','other','normal',
      coalesce(nullif(concat_ws(E'\n\n',q.customer_message,(select string_agg(coalesce(nullif(description,''),name),E'\n\n' order by sort_order,id) from public.quote_line_items where quote_id=q.id)),''),'Approved quote scope pending work order details.'),
      q.debris_handling,q.debris_handling_notes,q.recurring_service_plan_id,q.recurring_occurrence_id,
      case when q.recurring_occurrence_id is not null then 'approved_renewal_quote' end) returning * into j;
    created_job:=true;
  else
    if j.source_quote_id is not null and j.source_quote_id<>q.id
      or j.customer_id is distinct from q.customer_id or j.organization_id is distinct from q.organization_id
      or j.service_location_id is distinct from q.service_location_id then
      raise exception 'The work order no longer matches this quote and contracting party.' using errcode='23514';end if;
    if j.status not in('new_lead','estimate_scheduled','quoted','accepted','scheduled','in_progress','returned_for_correction',
      'completed_pending_review','ready_to_invoice','completed','invoiced','paid') then
      raise exception 'The work order is cancelled, lost, or unavailable for approval.' using errcode='23514';end if;
    if j.archived_at is not null and not (j.website_submission_id is not null and j.lead_disposition='archived'
      and j.status in('new_lead','estimate_scheduled','quoted')) then
      raise exception 'The work order is archived. Restore it before approving this quote.' using errcode='23514';end if;
    -- The incumbent inactive-lead trigger checks OLD disposition. Restore first
    -- without changing status, then accept, while retaining this transaction.
    if j.archived_at is not null then
      update public.jobs set archived_at=null,archived_by_user_id=null,lead_disposition='active' where id=j.id returning * into j;
    end if;
    update public.jobs set source_quote_id=q.id,
      status=case when status in('new_lead','estimate_scheduled','quoted') then 'accepted' else status end,
      debris_handling=q.debris_handling,debris_handling_notes=q.debris_handling_notes,
      recurring_service_plan_id=q.recurring_service_plan_id,recurring_occurrence_id=q.recurring_occurrence_id,
      recurring_authorization_source=case when q.recurring_occurrence_id is not null then 'approved_renewal_quote' end
      where id=j.id returning * into j;
  end if;
  for line in select li.*,m.default_unit from public.quote_line_items li join public.material_catalog m on m.id=li.material_id where li.quote_id=q.id order by li.sort_order,li.id loop
    if (select count(*) from public.quote_material_requirements where quote_id=q.id and quote_line_item_id=line.id)>1 then
      raise exception 'This quote line has duplicate material plans. Review those plans before approval.' using errcode='23514';end if;
    select id into requirement from public.quote_material_requirements where quote_id=q.id and quote_line_item_id=line.id for update;
    if requirement is null then
      insert into public.quote_material_requirements(quote_id,quote_line_item_id,material_id,planned_quantity,unit,is_estimated,notes)
        values(q.id,line.id,line.material_id,line.quantity,line.default_unit,true,'Copied from the approved quote line. Review before reserving inventory.') returning id into requirement;
    end if;
    insert into public.job_material_requirements(job_id,material_id,source_quote_requirement_id,planned_quantity,unit,is_estimated,notes)
      values(j.id,line.material_id,requirement,line.quantity,line.default_unit,true,'Copied from approved quote; no stock was used or reserved automatically.')
      on conflict(job_id,source_quote_requirement_id) do update set material_id=excluded.material_id,planned_quantity=excluded.planned_quantity,unit=excluded.unit,is_estimated=excluded.is_estimated,notes=excluded.notes;
  end loop;
  if q.recurring_occurrence_id is not null then
    update public.recurring_service_occurrences set status='approved',work_order_id=j.id,renewal_quote_id=q.id where id=q.recurring_occurrence_id;
  end if;
  accepted_at:=case when was_approved then coalesce(q.approved_at,clock_timestamp()) else clock_timestamp() end;
  update public.quotes set status='approved',approved_at=accepted_at,job_id=j.id,approved_from_revision=q.edit_revision where id=q.id;
  if p_token_hash is not null then update public.quote_portal_tokens set used_at=coalesce(used_at,accepted_at) where id=t.id;end if;
  update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),last_error=null,
    processing_started_at=null,skip_reason='Quote was approved and converted to a work order.' where quote_id=q.id and status='pending';
  if created_job then
    insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
      values(actor,actor_kind,'job',j.id,'work_order_created',jsonb_build_object('source_quote_id',q.id));
  end if;
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
    values(actor,actor_kind,'quote',q.id,case when was_approved then 'quote_approval_repaired' else 'quote_approved' end,
      jsonb_build_object('work_order_created',created_job,'job_id',j.id,'approved_from_revision',q.edit_revision));
  return jsonb_build_object('job_id',j.id,'created_job',created_job,'replayed',false,
    'edit_revision',(select edit_revision from public.quotes where id=q.id),'approved_at',accepted_at);
end; $$;
revoke all on function app_private.approve_quote_locked(uuid,integer,text) from public,anon,authenticated,service_role;

create function public.approve_quote(p_quote_id uuid,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
begin
  if auth.uid() is null or not app_private.has_staff_role() then raise exception 'Only active office staff may approve quotes.' using errcode='42501';end if;
  return app_private.approve_quote_locked(p_quote_id,p_expected_revision);
end; $$;
revoke all on function public.approve_quote(uuid,integer) from public,anon,service_role;
grant execute on function public.approve_quote(uuid,integer) to authenticated;

create function public.approve_quote_by_portal(p_token_hash text,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare quote_id uuid;
begin
  if current_setting('role',true)<>'service_role' or auth.uid() is not null then
    raise exception 'Customer approval requires the trusted quote-link endpoint.' using errcode='42501';end if;
  if p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' then raise exception 'This quote link is unavailable.' using errcode='42501';end if;
  select t.quote_id into quote_id from public.quote_portal_tokens t where t.token_hash=p_token_hash;
  if quote_id is null then raise exception 'This quote link is unavailable.' using errcode='42501';end if;
  return app_private.approve_quote_locked(quote_id,p_expected_revision,p_token_hash);
end; $$;
revoke all on function public.approve_quote_by_portal(text,integer) from public,anon,authenticated;
grant execute on function public.approve_quote_by_portal(text,integer) to service_role;

-- Invoker gates distinguish direct Data API writes from reviewed definer
-- commands. No user-settable session flag can authorize acceptance/source links.
-- Existing trusted server/maintenance writers and PR04 generation are preserved.
create function app_private.quote_approval_write_gate() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user not in('postgres','supabase_admin','service_role') then
    if tg_table_name='quotes' then
      if new.status='approved' and old.status<>'approved'
        or new.approved_from_revision is distinct from old.approved_from_revision
        or (new.approved_at is distinct from old.approved_at and (old.status='approved' or new.approved_at is not null))
        or (old.status='approved' and new.job_id is distinct from old.job_id) then
        raise exception 'Approve quotes through the approval action.' using errcode='42501';end if;
    else
      if tg_op='INSERT' then
        if new.source_quote_id is not null then raise exception 'Link approved quote work through the approval action.' using errcode='42501';end if;
      elsif new.source_quote_id is distinct from old.source_quote_id then
        raise exception 'Link approved quote work through the approval action.' using errcode='42501';
      end if;
    end if;
  end if;
  return new;
end; $$;
revoke all on function app_private.quote_approval_write_gate() from public,anon,authenticated,service_role;
create trigger quote_approval_write_gate before update on public.quotes for each row execute function app_private.quote_approval_write_gate();
create trigger job_quote_source_write_gate before insert or update on public.jobs for each row execute function app_private.quote_approval_write_gate();
notify pgrst,'reload schema';
