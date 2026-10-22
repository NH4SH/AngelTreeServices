-- Copy a reviewed source into one complete draft. No approvals, billing, links or delivery are copied.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
create table app_private.change_order_copy_requests(
 request_id uuid primary key,actor_user_id uuid not null,source_id uuid not null,source_revision integer not null check(source_revision>=0),
 change_order_id uuid references public.change_orders(id) on delete set null,receipt jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index change_order_copy_requests_target on app_private.change_order_copy_requests(change_order_id);
alter table app_private.change_order_copy_requests enable row level security;
create policy "No direct copy request access" on app_private.change_order_copy_requests as restrictive for all to public using(false) with check(false);
revoke all on app_private.change_order_copy_requests from public,anon,authenticated,service_role;

create function public.copy_change_order_draft(p_request_id uuid,p_source_id uuid,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare actor uuid:=auth.uid();previous app_private.change_order_copy_requests%rowtype;s public.change_orders%rowtype;target public.change_orders%rowtype;
 parent uuid;j public.jobs%rowtype;q public.quotes%rowtype;new_id uuid:=gen_random_uuid();subtotal bigint;line_count integer;result jsonb;
begin
 if actor is null or not app_private.has_staff_role() then raise exception 'Only active office staff may copy additional work.' using errcode='42501';end if;
 if p_request_id is null or p_source_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'Reload the additional-work record before copying it.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('change-order-copy/'||p_request_id::text,0));
 if not app_private.has_staff_role() then raise exception 'Only active office staff may copy additional work.' using errcode='42501';end if;
 select * into previous from app_private.change_order_copy_requests where request_id=p_request_id;
 if found then
  if previous.actor_user_id<>actor or previous.source_id<>p_source_id or previous.source_revision<>p_expected_revision then
   raise exception 'This copy request was already used for different details. Review the existing copy before continuing.' using errcode='22023';end if;
  select * into target from public.change_orders where id=previous.change_order_id;
  if not found then raise exception 'The earlier copy was removed. Review its history before starting another copy.' using errcode='23514';end if;
  return previous.receipt||jsonb_build_object('replayed',true,'current_revision',target.edit_revision,'current_status',target.status);
 end if;
 -- Same parent-before-addition order as editing, approval and invoicing.
 select job_id into parent from public.change_orders where id=p_source_id;
 if parent is not null then select * into j from public.jobs where id=parent for update;end if;
 select * into s from public.change_orders where id=p_source_id for update;
 if not found or s.job_id is distinct from parent then raise exception 'The source is unavailable or changed. Reload before copying it.' using errcode='PT409';end if;
 if s.edit_revision<>p_expected_revision then raise exception 'This addition changed. Review the current record before copying it.' using errcode='PT409';end if;
 if parent is not null and (j.id is null or j.customer_id is distinct from s.customer_id or j.organization_id is distinct from s.organization_id
  or j.service_location_id is distinct from s.service_location_id) then raise exception 'Review the work order and contracting party before copying this addition.' using errcode='23514';end if;
 -- Legacy quote-only additions remain copyable without inventing a work order.
 if parent is null then
  select * into q from public.quotes where id=s.source_quote_id;
  if not found or q.customer_id is distinct from s.customer_id or q.organization_id is distinct from s.organization_id then
   raise exception 'Review the source quote and contracting party before copying this addition.' using errcode='23514';end if;
 end if;
 perform c.id from public.organization_contacts c where c.id=any(array[s.requested_by_contact_id,s.approval_contact_id]) order by c.id for share;
 -- Retain active contacts only, as the previous copy action did; never transfer a contact from another party.
 if exists(select 1 from public.organization_contacts c where c.id=any(array[s.requested_by_contact_id,s.approval_contact_id]) and c.organization_id is distinct from s.organization_id) then
  raise exception 'Review the selected organization contacts before copying this addition.' using errcode='23514';end if;
 if not app_private.has_staff_role() then raise exception 'Only active office staff may copy additional work.' using errcode='42501';end if;
 select coalesce(sum(amount_cents),0),count(*) into subtotal,line_count from public.change_order_line_items where change_order_id=s.id;
 if subtotal<>s.subtotal_cents then raise exception 'The source totals do not match its lines. Review the source before copying it.' using errcode='23514';end if;
 insert into public.change_orders(id,change_order_number,source_quote_id,job_id,customer_id,organization_id,service_location_id,
  requested_by_contact_id,approval_contact_id,created_by_user_id,title,reason,customer_description,customer_notes,internal_notes,status,
  subtotal_cents,tax_cents,fee_cents,total_cents,original_approved_amount_cents,schedule_impact)
 values(new_id,'',s.source_quote_id,s.job_id,s.customer_id,s.organization_id,s.service_location_id,
  (select id from public.organization_contacts where id=s.requested_by_contact_id and is_active),
  (select id from public.organization_contacts where id=s.approval_contact_id and is_active),actor,left('Copy of '||s.title,180),s.reason,s.customer_description,s.customer_notes,s.internal_notes,'draft',
  s.subtotal_cents,s.tax_cents,s.fee_cents,s.total_cents,s.original_approved_amount_cents,s.schedule_impact);
 -- Explicit allowlist: fresh IDs and timestamps, no invoice/scope/material-plan linkage.
 -- Hidden cost values are preserved server-side, never accepted from or returned to the copying client.
 insert into public.change_order_line_items(change_order_id,title,description,quantity,unit,unit_price_cents,amount_cents,service_category_id,material_id,internal_cost_estimate_cents,sort_order)
 select new_id,title,description,quantity,unit,unit_price_cents,amount_cents,service_category_id,material_id,internal_cost_estimate_cents,sort_order
 from public.change_order_line_items where change_order_id=s.id order by sort_order,id;
 insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
 values(actor,'change_order',new_id,'change_order_duplicated',jsonb_build_object('source_change_order_id',s.id,'source_revision',s.edit_revision,'request_id',p_request_id));
 select jsonb_build_object('request_id',p_request_id,'source_id',s.id,'source_revision',s.edit_revision,'id',id,'job_id',job_id,'organization_id',organization_id,
  'edit_revision',edit_revision,'current_revision',edit_revision,'current_status',status,'line_count',line_count,'replayed',false) into result from public.change_orders where id=new_id;
 insert into app_private.change_order_copy_requests(request_id,actor_user_id,source_id,source_revision,change_order_id,receipt)
 values(p_request_id,actor,s.id,s.edit_revision,new_id,result);
 return result;
end $$;
revoke all on function public.copy_change_order_draft(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.copy_change_order_draft(uuid,uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
