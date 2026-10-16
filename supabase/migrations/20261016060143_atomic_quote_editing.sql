-- PR05 phase 1: install before publishing the coordinated quote callers.
-- Historical quotes/lines are retained; revisions start at one on existing rows.
alter table public.quotes add column edit_revision integer not null default 1,
  add column last_edited_by_user_id uuid references public.profiles(id) on delete set null,
  add column last_edited_at timestamptz;

create function app_private.quote_edit_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.status in ('approved','declined','expired','cancelled') and new.status<>old.status then
    raise exception 'This quote is closed. Create a duplicate draft for a new proposal.' using errcode='23514';
  end if;
  if new.job_id is distinct from old.job_id and new.job_id is not null then
    if old.status in ('approved','declined','expired','cancelled') and old.job_id is not null
      or not exists(select 1 from public.jobs j where j.id=new.job_id
        and j.customer_id is not distinct from new.customer_id and j.organization_id is not distinct from new.organization_id
        and (new.service_location_id is null or j.service_location_id=new.service_location_id)) then
      raise exception 'The work order does not match this quote.' using errcode='23514';
    end if;
  end if;
  if new.edit_revision<>old.edit_revision or
    (to_jsonb(new)-array['updated_at','edit_revision','last_edited_at','last_edited_by_user_id','first_viewed_at','last_viewed_at','view_count','archived_at','archived_by_user_id','automatic_follow_ups_enabled'])
      is distinct from
    (to_jsonb(old)-array['updated_at','edit_revision','last_edited_at','last_edited_by_user_id','first_viewed_at','last_viewed_at','view_count','archived_at','archived_by_user_id','automatic_follow_ups_enabled']) then
    new.edit_revision:=old.edit_revision+1;
    new.last_edited_at:=clock_timestamp(); new.last_edited_by_user_id:=auth.uid();
  else
    new.last_edited_at:=old.last_edited_at;new.last_edited_by_user_id:=old.last_edited_by_user_id;
  end if;
  return new;
end; $$;
revoke all on function app_private.quote_edit_revision() from public,anon,authenticated,service_role;
create trigger quote_edit_revision before update on public.quotes for each row execute function app_private.quote_edit_revision();

-- PR04's parent-lock trigger runs before each child mutation. Record that change
-- in the parent version too, including trusted source writers outside this editor.
create function app_private.quote_line_edit_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op<>'INSERT' then update public.quotes set edit_revision=edit_revision+1 where id=old.quote_id;end if;
  if tg_op='INSERT' or (tg_op='UPDATE' and new.quote_id is distinct from old.quote_id) then
    update public.quotes set edit_revision=edit_revision+1 where id=new.quote_id;
  end if;
  return null;
end; $$;
revoke all on function app_private.quote_line_edit_revision() from public,anon,authenticated,service_role;
create trigger quote_line_edit_revision after insert or update or delete on public.quote_line_items for each row execute function app_private.quote_line_edit_revision();

create function app_private.validate_quote_header(h public.quotes,p_require_contacts boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if (h.customer_id is null)=(h.organization_id is null) then raise exception 'Choose one customer or organization.' using errcode='22023';end if;
  if h.customer_id is not null then
    perform id from public.customers where id=h.customer_id and status='active' for share;
  else
    perform id from public.organizations where id=h.organization_id and status='active' for share;
  end if;
  if not found then raise exception 'The selected contracting party is not active.' using errcode='23514';end if;
  if h.job_id is not null and not exists(select 1 from public.jobs j where j.id=h.job_id
    and j.customer_id is not distinct from h.customer_id and j.organization_id is not distinct from h.organization_id
    and j.service_location_id is not distinct from h.service_location_id) then
    raise exception 'The work order and service location must belong to this contracting party.' using errcode='23514';end if;
  if h.service_location_id is not null then
    perform id from public.service_locations where id=h.service_location_id and customer_id is not distinct from h.customer_id
      and organization_id is not distinct from h.organization_id for share;
    if not found then raise exception 'Choose a service location belonging to this contracting party.' using errcode='23514';end if;
  elsif h.source_recommendation_id is null then
    raise exception 'Choose a service location or link a work order.' using errcode='23514';
  end if;
  if h.estimate_schedule_event_id is not null and not exists(select 1 from public.schedule_events s where s.id=h.estimate_schedule_event_id
    and s.event_type='estimate' and (s.service_location_id is null or s.service_location_id=h.service_location_id)) then
    raise exception 'The estimate event and service location do not match.' using errcode='23514';end if;
  if h.organization_id is not null and p_require_contacts and (h.recipient_contact_id is null or h.approval_contact_id is null) then
    raise exception 'Choose a recipient and approval contact for this organization.' using errcode='23514';end if;
  perform id from public.organization_contacts where id=any(array[h.recipient_contact_id,h.approval_contact_id,h.onsite_contact_id,h.billing_contact_id]) order by id for share;
  if exists(select 1 from unnest(array[h.recipient_contact_id,h.approval_contact_id,h.onsite_contact_id,h.billing_contact_id]) c(id)
    where c.id is not null and not exists(select 1 from public.organization_contacts oc where oc.id=c.id and oc.organization_id=h.organization_id and oc.is_active)) then
    raise exception 'Choose active contacts belonging to this organization.' using errcode='23514';end if;
  if h.recurring_service_plan_id is not null and not exists(select 1 from public.recurring_service_plans p where p.id=h.recurring_service_plan_id
    and p.customer_id is not distinct from h.customer_id and p.organization_id is not distinct from h.organization_id) then
    raise exception 'The recurring plan does not match this contracting party.' using errcode='23514';end if;
  if h.recurring_occurrence_id is not null and not exists(select 1 from public.recurring_service_occurrences o where o.id=h.recurring_occurrence_id
    and o.recurring_plan_id=h.recurring_service_plan_id and o.service_location_id=h.service_location_id) then
    raise exception 'The recurring visit does not match this quote.' using errcode='23514';end if;
  if h.source_recommendation_id is not null and not exists(select 1 from public.service_recommendations r where r.id=h.source_recommendation_id
    and r.customer_id is not distinct from h.customer_id and r.organization_id is not distinct from h.organization_id
    and (r.service_location_id is null or r.service_location_id=h.service_location_id)) then
    raise exception 'The recommendation does not match this quote.' using errcode='23514';end if;
  if h.renewal_source_quote_id is not null and not exists(select 1 from public.quotes q where q.id=h.renewal_source_quote_id
    and q.customer_id is not distinct from h.customer_id and q.organization_id is not distinct from h.organization_id) then
    raise exception 'The renewal source belongs to another contracting party.' using errcode='23514';end if;
end; $$;
revoke all on function app_private.validate_quote_header(public.quotes,boolean) from public,anon,authenticated,service_role;

create function public.create_quote_draft(p_header jsonb,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare h public.quotes%rowtype; subtotal integer; new_id uuid;tax integer;ids uuid[];
begin
  if auth.uid() is null or not app_private.has_staff_role() then raise exception 'Only active office staff may create quotes.' using errcode='42501';end if;
  if p_header is null or jsonb_typeof(p_header)<>'object' then raise exception 'Quote details are required.' using errcode='22023';end if;
  select * into h from jsonb_populate_record(null::public.quotes,p_header);
  if h.job_id is not null then
    perform id from public.jobs where id=h.job_id for update;
    h.service_location_id:=coalesce(h.service_location_id,(select service_location_id from public.jobs where id=h.job_id));
  end if;
  perform app_private.validate_quote_header(h,false);
  if nullif(p_header->>'source_lead_job_id','') is not null and not exists(select 1 from public.jobs j
    where j.id=(p_header->>'source_lead_job_id')::uuid and j.id=h.job_id and j.website_submission_id is not null) then
    raise exception 'The originating website lead no longer matches this quote.' using errcode='23514';end if;
  subtotal:=app_private.validate_invoice_lines(p_lines);tax:=coalesce(h.tax_cents,0);
  if tax<0 or subtotal::bigint+tax>2147483647 then raise exception 'Review the quote tax and total.' using errcode='22023';end if;
  insert into public.quotes(job_id,customer_id,organization_id,service_location_id,estimate_schedule_event_id,estimator_user_id,
    recipient_contact_id,approval_contact_id,onsite_contact_id,billing_contact_id,purchase_order_reference,payment_terms,
    customer_message,debris_handling,debris_handling_notes,expires_at,status,subtotal_cents,tax_cents,total_cents,
    recurring_service_plan_id,recurring_occurrence_id,source_recommendation_id,renewal_source_quote_id)
  values(h.job_id,h.customer_id,h.organization_id,h.service_location_id,h.estimate_schedule_event_id,auth.uid(),
    h.recipient_contact_id,h.approval_contact_id,h.onsite_contact_id,h.billing_contact_id,h.purchase_order_reference,h.payment_terms,
    h.customer_message,h.debris_handling,h.debris_handling_notes,h.expires_at,'draft',subtotal,tax,subtotal+tax,
    h.recurring_service_plan_id,h.recurring_occurrence_id,h.source_recommendation_id,h.renewal_source_quote_id) returning id into new_id;
  insert into public.quote_line_items(quote_id,name,description,service_category_id,material_id,quantity,unit_price_cents,total_cents,sort_order)
    select new_id,item->>'name',item->>'description',(item->>'service_category_id')::uuid,(item->>'material_id')::uuid,
      (item->>'quantity')::numeric,(item->>'unit_price_cents')::integer,(item->>'total_cents')::integer,ordinal::integer-1
    from jsonb_array_elements(p_lines) with ordinality lines(item,ordinal);
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
    values(auth.uid(),'staff','quote',new_id,'quote_created',jsonb_build_object('service_location_id',h.service_location_id,'total_cents',subtotal+tax,'source_lead_job_id',p_header->>'source_lead_job_id'));
  select array_agg(id order by sort_order) into ids from public.quote_line_items where quote_id=new_id;
  return jsonb_build_object('id',new_id,'edit_revision',(select edit_revision from public.quotes where id=new_id),'line_ids',coalesce(to_jsonb(ids),'[]'::jsonb));
end; $$;
revoke all on function public.create_quote_draft(jsonb,jsonb) from public,anon,service_role;
grant execute on function public.create_quote_draft(jsonb,jsonb) to authenticated;

create function public.save_quote_details(p_quote_id uuid,p_expected_revision integer,p_header jsonb,p_lines jsonb,p_confirm_party_change boolean default false) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare target public.quotes%rowtype;h public.quotes%rowtype;original_job uuid;subtotal integer;item jsonb;line_id uuid;
  kept uuid[]:='{}'::uuid[];saved uuid[]:='{}'::uuid[];party_changed boolean;result jsonb;
begin
  if auth.uid() is null or not app_private.has_staff_role() then raise exception 'Only active office staff may edit quotes.' using errcode='42501';end if;
  if p_header is null or jsonb_typeof(p_header)<>'object' then raise exception 'Quote details are required.' using errcode='22023';end if;
  select * into target from public.quotes where id=p_quote_id;
  if not found then raise exception 'Quote not found.' using errcode='P0002';end if;
  original_job:=target.job_id;
  -- Same parent order as PR04. Validate again after the quote lock is obtained.
  perform j.id from public.jobs j where j.id in(original_job,case when p_header?'job_id' then (p_header->>'job_id')::uuid else original_job end) order by j.id for update;
  select * into target from public.quotes where id=p_quote_id for update;
  if not found then raise exception 'Quote not found.' using errcode='P0002';end if;
  if original_job is distinct from target.job_id then raise exception 'The linked work order changed. Reload the quote before saving.' using errcode='40001';end if;
  if p_expected_revision is null or target.edit_revision<>p_expected_revision then
    return jsonb_build_object('conflict',true,'current_revision',target.edit_revision,'current_total_cents',target.total_cents,
      'current_status',target.status,'changed_at',target.last_edited_at,
      'changed_by',coalesce((select nullif(full_name,'') from public.profiles where id=target.last_edited_by_user_id),'Another editor'));
  end if;
  if target.status not in('draft','sent','change_requested') or exists(select 1 from public.invoices where quote_id=target.id)
    or exists(select 1 from public.jobs j where j.source_quote_id=target.id and j.status not in('new_lead','estimate_scheduled','quoted'))
    or exists(select 1 from public.change_orders where source_quote_id=target.id and status='approved') then
    raise exception 'This quote is approved, closed, or already used for work or billing. Use a change order or duplicate draft.' using errcode='23514';end if;
  select * into h from jsonb_populate_record(target,p_header);
  -- Source/pricing-review/approval/delivery identity is never taken from input.
  h.recurring_service_plan_id:=target.recurring_service_plan_id;h.recurring_occurrence_id:=target.recurring_occurrence_id;
  h.source_recommendation_id:=target.source_recommendation_id;h.renewal_source_quote_id:=target.renewal_source_quote_id;
  if h.job_id is not null then h.service_location_id:=coalesce(h.service_location_id,(select service_location_id from public.jobs where id=h.job_id));end if;
  perform app_private.validate_quote_header(h,true);
  party_changed:=h.customer_id is distinct from target.customer_id or h.organization_id is distinct from target.organization_id;
  if party_changed and not coalesce(p_confirm_party_change,false) then raise exception 'Confirm the contracting-party change before saving.' using errcode='23514';end if;
  if party_changed and (target.recurring_service_plan_id is not null or target.source_recommendation_id is not null
    or exists(select 1 from public.change_orders where source_quote_id=target.id)) then
    raise exception 'This quote has linked source records. Keep its contracting party or create a separate draft.' using errcode='23514';end if;
  subtotal:=app_private.validate_invoice_lines(p_lines);
  for item in select value from jsonb_array_elements(p_lines) loop
    line_id:=nullif(item->>'id','')::uuid;
    if line_id is not null then
      if line_id=any(kept) or not exists(select 1 from public.quote_line_items where id=line_id and quote_id=target.id) then
        raise exception 'A quote line changed or belongs to another quote. Reload before saving.' using errcode='23514';end if;
      kept:=array_append(kept,line_id);
      if item?'material_id' and exists(select 1 from public.quote_line_items l join public.quote_material_requirements m on m.quote_line_item_id=l.id
        where l.id=line_id and l.material_id is distinct from (item->>'material_id')::uuid) then
        raise exception 'This line has a material plan. Review that plan before changing its linked material.' using errcode='23514';end if;
    end if;
  end loop;
  if exists(select 1 from public.quote_line_items l where l.quote_id=target.id and not(l.id=any(kept)) and
    (exists(select 1 from public.quote_material_requirements m where m.quote_line_item_id=l.id)
    or exists(select 1 from public.job_closeout_scope_items s where s.quote_line_item_id=l.id))) then
    raise exception 'A removed line is still used by a material plan or work scope. Review that record before removing the line.' using errcode='23514';end if;
  delete from public.quote_line_items where quote_id=target.id and not(id=any(kept));
  for item in select value from jsonb_array_elements(p_lines) loop
    line_id:=nullif(item->>'id','')::uuid;
    if line_id is null then
      insert into public.quote_line_items(quote_id,name,description,service_category_id,material_id,quantity,unit_price_cents,total_cents,sort_order)
        values(target.id,item->>'name',item->>'description',(item->>'service_category_id')::uuid,(item->>'material_id')::uuid,
          (item->>'quantity')::numeric,(item->>'unit_price_cents')::integer,(item->>'total_cents')::integer,cardinality(saved)) returning id into line_id;
    else
      update public.quote_line_items set name=item->>'name',description=item->>'description',
        service_category_id=case when item?'service_category_id' then (item->>'service_category_id')::uuid else service_category_id end,
        material_id=case when item?'material_id' then (item->>'material_id')::uuid else material_id end,
        quantity=(item->>'quantity')::numeric,unit_price_cents=(item->>'unit_price_cents')::integer,
        total_cents=(item->>'total_cents')::integer,sort_order=cardinality(saved) where id=line_id and quote_id=target.id;
    end if;
    saved:=array_append(saved,line_id);
  end loop;
  update public.quotes set job_id=h.job_id,customer_id=h.customer_id,organization_id=h.organization_id,service_location_id=h.service_location_id,
    estimate_schedule_event_id=h.estimate_schedule_event_id,recipient_contact_id=h.recipient_contact_id,approval_contact_id=h.approval_contact_id,
    onsite_contact_id=h.onsite_contact_id,billing_contact_id=h.billing_contact_id,purchase_order_reference=h.purchase_order_reference,payment_terms=h.payment_terms,
    customer_message=h.customer_message,debris_handling=h.debris_handling,debris_handling_notes=h.debris_handling_notes,expires_at=h.expires_at,
    subtotal_cents=subtotal,tax_cents=0,total_cents=subtotal,
    pricing_reviewed_at=case when target.recurring_occurrence_id is not null then clock_timestamp() else pricing_reviewed_at end,
    pricing_reviewed_by_user_id=case when target.recurring_occurrence_id is not null then auth.uid() else pricing_reviewed_by_user_id end
    where id=target.id;
  if target.recurring_occurrence_id is not null then
    update public.recurring_service_occurrences set pricing_review_status='reviewed' where id=target.recurring_occurrence_id;
  end if;
  if party_changed then
    insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
      values(auth.uid(),'staff','quote',target.id,'quote_contracting_party_changed',jsonb_build_object('previous_customer_id',target.customer_id,
        'previous_organization_id',target.organization_id,'customer_id',h.customer_id,'organization_id',h.organization_id));
  end if;
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,organization_id,action_category,summary,destination_path,changes_json,metadata_json)
    values(auth.uid(),'staff','quote',target.id,'quote_updated',h.organization_id,'quotes','Quote details and line items were updated.',
      '/admin/quotes/'||target.id::text,jsonb_build_object('customer_message',jsonb_build_object('before',target.customer_message,'after',h.customer_message),
        'expires_at',jsonb_build_object('before',target.expires_at,'after',h.expires_at),'service_location_id',jsonb_build_object('before',target.service_location_id,'after',h.service_location_id),
        'total_cents',jsonb_build_object('before',target.total_cents,'after',subtotal)),jsonb_build_object('previous_revision',target.edit_revision));
  select jsonb_build_object('id',id,'edit_revision',edit_revision,'updated_at',updated_at,'line_ids',to_jsonb(saved)) into result from public.quotes where id=target.id;
  return result;
end; $$;
revoke all on function public.save_quote_details(uuid,integer,jsonb,jsonb,boolean) from public,anon,service_role;
grant execute on function public.save_quote_details(uuid,integer,jsonb,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
