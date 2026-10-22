-- Atomic office draft saves; approval, scope, invoices and delivery retain their commands.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
alter table public.change_orders add column edit_revision integer not null default 0 check(edit_revision>=0);
-- Last BEFORE trigger: approved-scope guards see the unchanged caller revision.
-- Every header update (including the existing line touch) invalidates stale editors.
create function app_private.change_order_edit_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then new.edit_revision:=0;else new.edit_revision:=old.edit_revision+1;end if;
 return new;
end $$;
revoke all on function app_private.change_order_edit_revision() from public,anon,authenticated,service_role;
create trigger zz_change_order_edit_revision before insert or update on public.change_orders for each row execute function app_private.change_order_edit_revision();

-- The existing review guard touches parents for app roles. Maintenance/restore
-- deliberately bypasses that guard, but must still invalidate a loaded editor.
create function app_private.change_order_maintenance_line_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare parents uuid[];
begin
 if current_setting('role',true)='none' and auth.uid() is null then
  parents:=case when tg_op='INSERT' then array[new.change_order_id] when tg_op='DELETE' then array[old.change_order_id] else array[old.change_order_id,new.change_order_id] end;
  perform c.id from public.change_orders c where c.id=any(parents) order by c.id for update;
  update public.change_orders set updated_at=clock_timestamp() where id=any(parents);
 end if;
 return null;
end $$;
revoke all on function app_private.change_order_maintenance_line_revision() from public,anon,authenticated,service_role;
create trigger change_order_maintenance_line_revision after insert or update or delete on public.change_order_line_items for each row execute function app_private.change_order_maintenance_line_revision();

create table app_private.change_order_draft_requests(
 request_id uuid primary key, actor_user_id uuid not null, input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),
 change_order_id uuid not null references public.change_orders(id) on delete cascade,
 receipt jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create index change_order_draft_requests_order on app_private.change_order_draft_requests(change_order_id);
alter table app_private.change_order_draft_requests enable row level security;
create policy "No direct draft request access" on app_private.change_order_draft_requests as restrictive for all to public using(false) with check(false);
revoke all on app_private.change_order_draft_requests from public,anon,authenticated,service_role;

create function public.save_change_order_draft(p_request_id uuid,p_change_order_id uuid,p_expected_revision integer,p_header jsonb,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare actor uuid:=auth.uid();previous app_private.change_order_draft_requests%rowtype;
 target public.change_orders%rowtype;h public.change_orders%rowtype;j public.jobs%rowtype;q public.quotes%rowtype;closeout public.job_closeouts%rowtype;
 fingerprint text;parent uuid;creating boolean:=p_change_order_id is null;costs boolean;item jsonb;line_id uuid;kept uuid[]:='{}';saved uuid[]:='{}';
 quantity numeric;price numeric;amount numeric;subtotal bigint:=0;tax bigint;fee bigint;result jsonb;allowed text[];
begin
 if actor is null or not app_private.has_staff_role() then raise exception 'Only active office staff may save additional work.' using errcode='42501';end if;
 if p_request_id is null or p_header is null or jsonb_typeof(p_header)<>'object' or p_lines is null or jsonb_typeof(p_lines)<>'array'
  or jsonb_array_length(p_lines) not between 1 and 200 then raise exception 'Review the additional-work details and line items.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('change-order-draft/'||p_request_id::text,0));
 if not app_private.has_staff_role() then raise exception 'Only active office staff may save additional work.' using errcode='42501';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('id',p_change_order_id,'revision',p_expected_revision,'header',p_header,'lines',p_lines)::text,'UTF8')),'hex');
 select * into previous from app_private.change_order_draft_requests where request_id=p_request_id;
 if found then
  if previous.actor_user_id<>actor or previous.input_hash<>fingerprint then raise exception 'This save request was already used with different details. Review the saved record before continuing.' using errcode='22023';end if;
  select * into target from public.change_orders where id=previous.change_order_id;
  if not found then raise exception 'The saved addition is no longer available. Review its history before continuing.' using errcode='23514';end if;
  return previous.receipt||jsonb_build_object('replayed',true,'current_revision',target.edit_revision,'current_status',target.status);
 end if;
 allowed:=array['title','reason','customer_description','customer_notes','internal_notes','requested_by_contact_id','approval_contact_id','tax_cents','fee_cents','expires_at','schedule_impact'];
 if creating then allowed:=allowed||array['job_id','source_quote_id','source_closeout_id','submit_for_review'];end if;
 if exists(select 1 from jsonb_object_keys(p_header) k where not(k=any(allowed))) then raise exception 'This editor cannot change approval, source or billing records.' using errcode='22023';end if;
 if creating then
  if p_expected_revision is not null then raise exception 'Review the new draft request.' using errcode='22023';end if;
  parent:=nullif(p_header->>'job_id','')::uuid;
 else
  select job_id into parent from public.change_orders where id=p_change_order_id;
 end if;
 select * into j from public.jobs where id=parent for update;
 if not found then raise exception 'Choose an available work order before saving additional work.' using errcode='23514';end if;
 if creating then
  select * into h from jsonb_populate_record(null::public.change_orders,p_header);
  h.id:=gen_random_uuid();h.job_id:=j.id;h.customer_id:=j.customer_id;h.organization_id:=j.organization_id;h.service_location_id:=j.service_location_id;
  h.source_quote_id:=coalesce(h.source_quote_id,j.source_quote_id);
  if h.source_quote_id is not null then
   select * into q from public.quotes where id=h.source_quote_id for share;
   if not found or (q.job_id is not null and q.job_id<>j.id) or q.customer_id is distinct from j.customer_id or q.organization_id is distinct from j.organization_id then
    raise exception 'The source quote does not belong to this work order and contracting party.' using errcode='23514';end if;
  end if;
  if h.source_closeout_id is not null then
   select * into closeout from public.job_closeouts where id=h.source_closeout_id for update;
   if not found or closeout.job_id<>j.id or closeout.change_order_id is not null then raise exception 'This closeout is unavailable or already linked to additional work.' using errcode='23514';end if;
   h.internal_notes:=nullif(concat_ws(E'\n\n',nullif(h.internal_notes,''),
    case when nullif(closeout.additional_work_description,'') is not null then 'Crew additional-work request:'||E'\n'||closeout.additional_work_description end,
    case when nullif(closeout.crew_internal_notes,'') is not null then 'Crew internal notes:'||E'\n'||closeout.crew_internal_notes end,
    case when nullif(closeout.incident_description,'') is not null then 'Related exception:'||E'\n'||closeout.incident_description end),'');
  end if;
 else
  select * into target from public.change_orders where id=p_change_order_id for update;
  if not found or target.job_id is distinct from parent then raise exception 'The work order changed. Reload before saving.' using errcode='PT409';end if;
  if p_expected_revision is null or target.edit_revision<>p_expected_revision then raise exception 'Someone changed this addition. Your entries are still here; review the current record before saving again.' using errcode='PT409';end if;
  if target.status not in('draft','pending_internal_review','ready_to_send','sent','change_requested') or target.approved_at is not null or target.invoice_id is not null then
   raise exception 'This addition is approved, closed or already used for billing. Review it before making further changes.' using errcode='23514';end if;
  select * into h from jsonb_populate_record(target,p_header);
 end if;
 if not app_private.has_staff_role() then raise exception 'Only active office staff may save additional work.' using errcode='42501';end if;
 costs:=app_private.has_financial_reporting_role();
 if (h.customer_id is null)=(h.organization_id is null) or h.customer_id is distinct from j.customer_id or h.organization_id is distinct from j.organization_id
  or h.service_location_id is distinct from j.service_location_id then raise exception 'The addition and service location must match the work order contracting party.' using errcode='23514';end if;
 if nullif(btrim(h.title),'') is null or length(h.title)>180 or length(h.reason)>1000 or length(h.customer_description)>5000 or length(h.customer_notes)>3000
  or (not creating and length(h.internal_notes)>5000) or (creating and length(p_header->>'internal_notes')>5000) then raise exception 'Review the title and note lengths before saving.' using errcode='22023';end if;
 if h.expires_at is not null and not isfinite(h.expires_at) then raise exception 'Choose a valid expiry date.' using errcode='22023';end if;
 if h.schedule_impact is not null and (jsonb_typeof(h.schedule_impact)<>'object' or exists(select 1 from jsonb_each(h.schedule_impact) x where
  x.key<>all(array['scheduled_date','estimated_duration','assigned_crew','equipment','materials','permits','subcontractors']) or jsonb_typeof(x.value)<>'boolean')) then
  raise exception 'Review the coordination options.' using errcode='22023';end if;
 perform id from public.organization_contacts where id=any(array[h.requested_by_contact_id,h.approval_contact_id]) order by id for share;
 if exists(select 1 from unnest(array[h.requested_by_contact_id,h.approval_contact_id]) x(id) where x.id is not null and not exists(
  select 1 from public.organization_contacts c where c.id=x.id and c.organization_id=h.organization_id and c.is_active)) then
  raise exception 'Choose active contacts belonging to this organization.' using errcode='23514';end if;
 for item in select value from jsonb_array_elements(p_lines) loop
  if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_object_keys(item) k where k<>all(array['id','title','description','quantity','unit','unit_price_cents','amount_cents','service_category_id','material_id','internal_cost_estimate_cents','sort_order'])) then
   raise exception 'Review the additional-work line items.' using errcode='22023';end if;
  quantity:=(item->>'quantity')::numeric;price:=(item->>'unit_price_cents')::numeric;amount:=(item->>'amount_cents')::numeric;
  if nullif(btrim(item->>'title'),'') is null or length(item->>'title')>180 or length(item->>'description')>5000 or length(item->>'unit')>40
   or quantity is null or quantity not between 0.01 and 99999999.99 or round(quantity,2)<>quantity
   or price is null or price not between 0 and 2147483647 or trunc(price)<>price
   or amount is null or amount not between 0 and 2147483647 or amount<>round(quantity*price) then raise exception 'Review line quantities, prices and totals before saving.' using errcode='22023';end if;
  if item?'internal_cost_estimate_cents' and not costs then raise exception 'Internal cost estimates require financial access.' using errcode='42501';end if;
  if item->>'internal_cost_estimate_cents' is not null and ((item->>'internal_cost_estimate_cents')::numeric not between 0 and 2147483647 or trunc((item->>'internal_cost_estimate_cents')::numeric)<>(item->>'internal_cost_estimate_cents')::numeric) then
   raise exception 'Review internal cost estimates.' using errcode='22023';end if;
  subtotal:=subtotal+amount::bigint;
  line_id:=nullif(item->>'id','')::uuid;
  if line_id is not null then
   if creating or line_id=any(kept) or not exists(select 1 from public.change_order_line_items where id=line_id and change_order_id=target.id) then
    raise exception 'A line changed or belongs to another addition. Reload before saving.' using errcode='23514';end if;
   kept:=array_append(kept,line_id);
   if exists(select 1 from public.job_material_requirements m join public.change_order_line_items l on l.id=m.source_change_order_line_item_id
    where l.id=line_id and l.material_id is distinct from nullif(item->>'material_id','')::uuid) then
    raise exception 'Review the material plan before changing this line reference.' using errcode='23514';end if;
  end if;
 end loop;
 tax:=coalesce(h.tax_cents,0);fee:=coalesce(h.fee_cents,0);
 if tax<0 or fee<0 or subtotal+tax+fee>2147483647 then raise exception 'Review the tax, fees and total before saving.' using errcode='22023';end if;
 if creating then
  if p_header?'submit_for_review' and jsonb_typeof(p_header->'submit_for_review')<>'boolean' then raise exception 'Review the draft submission option.' using errcode='22023';end if;
  insert into public.change_orders(id,change_order_number,job_id,source_quote_id,source_closeout_id,customer_id,organization_id,service_location_id,created_by_user_id,
   title,reason,customer_description,customer_notes,internal_notes,requested_by_contact_id,approval_contact_id,status,subtotal_cents,tax_cents,fee_cents,total_cents,original_approved_amount_cents,expires_at,schedule_impact)
  values(h.id,'',j.id,h.source_quote_id,h.source_closeout_id,h.customer_id,h.organization_id,h.service_location_id,actor,h.title,h.reason,h.customer_description,h.customer_notes,h.internal_notes,
   h.requested_by_contact_id,h.approval_contact_id,case when coalesce((p_header->>'submit_for_review')::boolean,false) then 'pending_internal_review' else 'draft' end,
   subtotal,tax,fee,subtotal+tax+fee,coalesce(q.total_cents,0),h.expires_at,coalesce(h.schedule_impact,'{}'));
 else
  if exists(select 1 from public.change_order_line_items l where l.change_order_id=target.id and not(l.id=any(kept)) and
   (exists(select 1 from public.job_change_order_scope_items s where s.change_order_line_item_id=l.id)
    or exists(select 1 from public.invoice_line_items i where i.source_change_order_line_item_id=l.id)
    or exists(select 1 from public.job_material_requirements m where m.source_change_order_line_item_id=l.id))) then
   raise exception 'A removed line is still used by work, billing or a material plan. Review that record first.' using errcode='23514';end if;
  update public.change_orders set title=h.title,reason=h.reason,customer_description=h.customer_description,customer_notes=h.customer_notes,internal_notes=h.internal_notes,
   requested_by_contact_id=h.requested_by_contact_id,approval_contact_id=h.approval_contact_id,subtotal_cents=subtotal,tax_cents=tax,fee_cents=fee,total_cents=subtotal+tax+fee,expires_at=h.expires_at,schedule_impact=coalesce(h.schedule_impact,'{}') where id=h.id;
  delete from public.change_order_line_items where change_order_id=h.id and not(id=any(kept));
 end if;
 for item in select value from jsonb_array_elements(p_lines) loop
  line_id:=nullif(item->>'id','')::uuid;
  if line_id is null then
   insert into public.change_order_line_items(change_order_id,title,description,quantity,unit,unit_price_cents,amount_cents,service_category_id,material_id,internal_cost_estimate_cents,sort_order)
   values(h.id,item->>'title',item->>'description',(item->>'quantity')::numeric,item->>'unit',(item->>'unit_price_cents')::integer,(item->>'amount_cents')::integer,
    nullif(item->>'service_category_id','')::uuid,nullif(item->>'material_id','')::uuid,(item->>'internal_cost_estimate_cents')::integer,cardinality(saved)) returning id into line_id;
  else
   update public.change_order_line_items set title=item->>'title',description=item->>'description',quantity=(item->>'quantity')::numeric,unit=item->>'unit',unit_price_cents=(item->>'unit_price_cents')::integer,
    amount_cents=(item->>'amount_cents')::integer,service_category_id=nullif(item->>'service_category_id','')::uuid,material_id=nullif(item->>'material_id','')::uuid,
    internal_cost_estimate_cents=case when costs and item?'internal_cost_estimate_cents' then (item->>'internal_cost_estimate_cents')::integer else internal_cost_estimate_cents end,sort_order=cardinality(saved)
   where id=line_id and change_order_id=h.id;
  end if;
  saved:=array_append(saved,line_id);
 end loop;
 if creating and h.source_closeout_id is not null then update public.job_closeouts set change_order_id=h.id where id=h.source_closeout_id;end if;
 insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
 values(actor,'change_order',h.id,case when creating then 'change_order_created' else 'change_order_edited' end,jsonb_build_object('job_id',j.id,'request_id',p_request_id,'previous_revision',target.edit_revision));
 select jsonb_build_object('request_id',p_request_id,'id',id,'job_id',job_id,'organization_id',organization_id,'edit_revision',edit_revision,'updated_at',updated_at,
  'line_ids',to_jsonb(saved),'replayed',false,'current_revision',edit_revision,'current_status',status) into result from public.change_orders where id=h.id;
 insert into app_private.change_order_draft_requests(request_id,actor_user_id,input_hash,change_order_id,receipt) values(p_request_id,actor,fingerprint,h.id,result);
 return result;
end $$;
revoke all on function public.save_change_order_draft(uuid,uuid,integer,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_change_order_draft(uuid,uuid,integer,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
