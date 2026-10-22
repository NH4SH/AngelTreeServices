-- Bind documented office approval to the exact reviewed version and durable request.
begin;
set local lock_timeout='3s';set local statement_timeout='20s';
create table app_private.change_order_manual_approval_requests(
 request_id uuid primary key,actor_user_id uuid not null,input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),
 change_order_id uuid references public.change_orders(id) on delete set null,receipt jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index change_order_manual_approval_requests_target on app_private.change_order_manual_approval_requests(change_order_id);
alter table app_private.change_order_manual_approval_requests enable row level security;
create policy "No direct manual approval request access" on app_private.change_order_manual_approval_requests as restrictive for all to public using(false) with check(false);
revoke all on app_private.change_order_manual_approval_requests from public,anon,authenticated,service_role;

-- Invoker is deliberate: direct Data API writers are authenticated; the guarded
-- command runs as its owner. Existing service-only portal and maintenance paths remain intact.
create function app_private.guard_change_order_approval_authority() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user in('authenticated','anon') then
  if tg_op='INSERT' then
   if new.status='approved' or new.approved_at is not null or new.approved_by_name is not null or new.approved_by_contact_id is not null
    or new.approval_recorded_by_user_id is not null or new.approval_method is not null or new.approval_notes is not null or new.applied_to_job_at is not null then
    raise exception 'Use the reviewed approval action to record customer authorization.' using errcode='42501';end if;
  elsif (new.status='approved' and new.status is distinct from old.status) or
   jsonb_build_array(new.approved_at,new.approved_by_name,new.approved_by_contact_id,new.approval_recorded_by_user_id,new.approval_method,new.approval_notes,new.applied_to_job_at)
    is distinct from jsonb_build_array(old.approved_at,old.approved_by_name,old.approved_by_contact_id,old.approval_recorded_by_user_id,old.approval_method,old.approval_notes,old.applied_to_job_at) then
   raise exception 'Use the reviewed approval action to record customer authorization.' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function app_private.guard_change_order_approval_authority() from public,anon,authenticated,service_role;
create trigger change_order_approval_authority before insert or update on public.change_orders for each row execute function app_private.guard_change_order_approval_authority();

create function public.record_change_order_manual_approval(p_request_id uuid,p_change_order_id uuid,p_expected_revision integer,p_approval jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare actor uuid:=auth.uid();previous app_private.change_order_manual_approval_requests%rowtype;co public.change_orders%rowtype;
 parent uuid;j public.jobs%rowtype;fingerprint text;name text;method text;notes text;contact uuid;result record;ack jsonb;
begin
 if actor is null or not app_private.has_staff_role() then raise exception 'Only active office staff may record approval.' using errcode='42501';end if;
 if p_request_id is null or p_change_order_id is null or p_expected_revision is null or p_expected_revision<0 or p_approval is null or jsonb_typeof(p_approval)<>'object'
  or exists(select 1 from jsonb_object_keys(p_approval) k where k<>all(array['name','method','notes','contact_id'])) then
  raise exception 'Review the approval details before recording authorization.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('change-order-manual-approval/'||p_request_id::text,0));
 if not app_private.has_staff_role() then raise exception 'Only active office staff may record approval.' using errcode='42501';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('id',p_change_order_id,'revision',p_expected_revision,'approval',p_approval)::text,'UTF8')),'hex');
 select * into previous from app_private.change_order_manual_approval_requests where request_id=p_request_id;
 if found then
  if previous.actor_user_id<>actor or previous.input_hash<>fingerprint then raise exception 'This approval request was used with different details. Review the approval history before continuing.' using errcode='22023';end if;
  select * into co from public.change_orders where id=previous.change_order_id;
  if not found then raise exception 'The earlier approval record was removed. Review its history before continuing.' using errcode='23514';end if;
  return previous.receipt||jsonb_build_object('replayed',true,'current_revision',co.edit_revision,'current_status',co.status);
 end if;
 name:=btrim(p_approval->>'name');method:=p_approval->>'method';notes:=btrim(p_approval->>'notes');contact:=nullif(p_approval->>'contact_id','')::uuid;
 if name is null or name='' or length(name)>160 or notes is null or notes='' or length(notes)>2000 or method is null or method<>all(array['phone','email','in_person','signed_paper','other']) then
  raise exception 'Approver name, authorization method, and documentation notes are required.' using errcode='22023';end if;
 select job_id into parent from public.change_orders where id=p_change_order_id;
 select * into j from public.jobs where id=parent for update;
 select * into co from public.change_orders where id=p_change_order_id for update;
 if not found or co.job_id is distinct from parent or co.edit_revision<>p_expected_revision then raise exception 'This addition changed. Your approval details are still here; review the current record before approving.' using errcode='PT409';end if;
 if not app_private.has_staff_role() then raise exception 'Only active office staff may record approval.' using errcode='42501';end if;
 if co.status not in('draft','pending_internal_review','ready_to_send','sent','change_requested') or co.approved_at is not null or co.invoice_id is not null then
  raise exception 'This addition is already approved, closed or billed. Review its history before recording approval.' using errcode='PT409';end if;
 if j.id is null or co.customer_id is distinct from j.customer_id or co.organization_id is distinct from j.organization_id or co.service_location_id is distinct from j.service_location_id then
  raise exception 'Review the work order, contracting party and property before approval.' using errcode='23514';end if;
 if contact is not null then
  perform c.id from public.organization_contacts c where c.id=contact and c.organization_id=co.organization_id and c.is_active for share;
  if not found then raise exception 'Choose an active approval contact belonging to this organization.' using errcode='23514';end if;
 end if;
 if not exists(select 1 from public.change_order_line_items where change_order_id=co.id) or co.subtotal_cents<>(select coalesce(sum(amount_cents),0)from public.change_order_line_items where change_order_id=co.id) then
  raise exception 'Review the line items and total before approval.' using errcode='23514';end if;
 -- Reuse the existing scope, job-value, audit and source-event transaction.
 select * into strict result from public.approve_change_order(co.id,name,contact,method,actor,notes);
 if not app_private.has_staff_role() then raise exception 'Only active office staff may record approval.' using errcode='42501';end if;
 select jsonb_build_object('request_id',p_request_id,'id',id,'job_id',job_id,'organization_id',organization_id,'reviewed_revision',p_expected_revision,
  'edit_revision',edit_revision,'current_revision',edit_revision,'current_status',status,'newly_approved',result.newly_approved,'applied_scope_count',result.applied_scope_count,'replayed',false)
 into ack from public.change_orders where id=co.id;
 insert into app_private.change_order_manual_approval_requests(request_id,actor_user_id,input_hash,change_order_id,receipt)values(p_request_id,actor,fingerprint,co.id,ack);
 return ack;
end $$;
revoke all on function public.record_change_order_manual_approval(uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_change_order_manual_approval(uuid,uuid,integer,jsonb) to authenticated;
-- Authenticated callers must use the revision-bound command. Its owner and the
-- existing service-only portal command may still invoke the original transaction.
revoke execute on function public.approve_change_order(uuid,text,uuid,text,uuid,text) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
