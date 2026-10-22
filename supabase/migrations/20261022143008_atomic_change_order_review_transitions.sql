-- Office review and cancellation are version-bound, atomic, and safely retryable.
begin;
set local lock_timeout='3s';set local statement_timeout='20s';
create table app_private.change_order_workflow_requests(
 request_id uuid primary key,actor_user_id uuid not null,input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),
 change_order_id uuid references public.change_orders(id) on delete set null,receipt jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index change_order_workflow_requests_target on app_private.change_order_workflow_requests(change_order_id);
alter table app_private.change_order_workflow_requests enable row level security;
create policy "No direct workflow request access" on app_private.change_order_workflow_requests as restrictive for all to public using(false)with check(false);
revoke all on app_private.change_order_workflow_requests from public,anon,authenticated,service_role;

create function app_private.guard_change_order_workflow_authority()returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user in('authenticated','anon')then
  if tg_op='INSERT'then
   if new.status<>'draft' or new.internally_reviewed_at is not null or new.internally_reviewed_by_user_id is not null or new.cancelled_at is not null then
    raise exception 'Use the reviewed workflow action to change this addition.'using errcode='42501';end if;
  elsif new.status is distinct from old.status or
   jsonb_build_array(new.internally_reviewed_at,new.internally_reviewed_by_user_id,new.cancelled_at) is distinct from
   jsonb_build_array(old.internally_reviewed_at,old.internally_reviewed_by_user_id,old.cancelled_at)then
   raise exception 'Use the reviewed workflow action to change this addition.'using errcode='42501';
  end if;
 end if;return new;
end $$;
revoke all on function app_private.guard_change_order_workflow_authority()from public,anon,authenticated,service_role;
create trigger change_order_workflow_authority before insert or update on public.change_orders for each row execute function app_private.guard_change_order_workflow_authority();

create function app_private.invalidate_change_order_internal_review()returns trigger
language plpgsql security definer set search_path='' as $$
declare parent uuid;j uuid;changed boolean:=false;
begin
 if tg_table_name='change_orders'then
  if old.status='ready_to_send'and new.status=old.status and
   jsonb_build_array(new.title,new.reason,new.customer_description,new.customer_notes,new.internal_notes,new.requested_by_contact_id,new.approval_contact_id,
    new.subtotal_cents,new.tax_cents,new.fee_cents,new.total_cents,new.expires_at,new.schedule_impact,new.job_id,new.source_quote_id,new.customer_id,new.organization_id,new.service_location_id)
   is distinct from jsonb_build_array(old.title,old.reason,old.customer_description,old.customer_notes,old.internal_notes,old.requested_by_contact_id,old.approval_contact_id,
    old.subtotal_cents,old.tax_cents,old.fee_cents,old.total_cents,old.expires_at,old.schedule_impact,old.job_id,old.source_quote_id,old.customer_id,old.organization_id,old.service_location_id)then
   new.status:='pending_internal_review';new.internally_reviewed_at:=null;new.internally_reviewed_by_user_id:=null;parent:=new.id;j:=new.job_id;changed:=true;
  end if;
 else
  if tg_op='UPDATE'and(to_jsonb(new)-array['updated_at'])is not distinct from(to_jsonb(old)-array['updated_at'])then return null;end if;
  parent:=case when tg_op='DELETE'then old.change_order_id else new.change_order_id end;
  update public.change_orders set status='pending_internal_review',internally_reviewed_at=null,internally_reviewed_by_user_id=null
   where id=parent and status='ready_to_send'returning job_id into j;changed:=found;
 end if;
 if changed then
  if current_setting('role',true)='authenticated'and not app_private.has_staff_role()then raise exception 'Active office access is required.'using errcode='42501';end if;
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
   values(auth.uid(),case when auth.uid()is null then 'system'else 'staff'end,'change_order',parent,'change_order_internal_review_invalidated',jsonb_build_object('job_id',j,'changed_part',case when tg_table_name='change_orders'then 'details'else 'lines'end));
 end if;
 if tg_table_name='change_orders'then return new;else return null;end if;
end $$;
revoke all on function app_private.invalidate_change_order_internal_review()from public,anon,authenticated,service_role;
-- Authority checks run first; system invalidation precedes the final revision trigger.
create trigger change_order_workflow_invalidation before update on public.change_orders for each row execute function app_private.invalidate_change_order_internal_review();
create trigger change_order_review_line_invalidation after insert or update or delete on public.change_order_line_items for each row execute function app_private.invalidate_change_order_internal_review();

create function public.transition_change_order_workflow(p_request_id uuid,p_change_order_id uuid,p_expected_revision integer,p_intent text)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare actor uuid:=auth.uid();previous app_private.change_order_workflow_requests%rowtype;co public.change_orders%rowtype;parent uuid;
 fingerprint text;allowed text[];next_status text;event text;ack jsonb;
begin
 if actor is null or not app_private.has_staff_role()then raise exception 'Only active office staff may change this workflow.'using errcode='42501';end if;
 if p_request_id is null or p_change_order_id is null or p_expected_revision is null or p_expected_revision<0 or p_intent is null or p_intent<>all(array['request_review','approve_internal','return_clarification','cancel'])then
  raise exception 'Reload this record before choosing a workflow action.'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('change-order-workflow/'||p_request_id::text,0));
 if not app_private.has_staff_role()then raise exception 'Only active office staff may change this workflow.'using errcode='42501';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('id',p_change_order_id,'revision',p_expected_revision,'intent',p_intent)::text,'UTF8')),'hex');
 select * into previous from app_private.change_order_workflow_requests where request_id=p_request_id;
 if found then
  if previous.actor_user_id<>actor or previous.input_hash<>fingerprint then raise exception 'This workflow request was used for another action. Review the history before continuing.'using errcode='22023';end if;
  select * into co from public.change_orders where id=previous.change_order_id;
  if not found then raise exception 'The earlier record was removed. Review its history before continuing.'using errcode='23514';end if;
  return previous.receipt||jsonb_build_object('replayed',true,'current_revision',co.edit_revision,'current_status',co.status);
 end if;
 select job_id into parent from public.change_orders where id=p_change_order_id;
 if parent is not null then perform id from public.jobs where id=parent for update;end if;
 select * into co from public.change_orders where id=p_change_order_id for update;
 if not found or co.job_id is distinct from parent or co.edit_revision<>p_expected_revision then raise exception 'This addition changed. Review the current record before choosing that action.'using errcode='PT409';end if;
 if not app_private.has_staff_role()then raise exception 'Only active office staff may change this workflow.'using errcode='42501';end if;
 if co.approved_at is not null or co.invoice_id is not null then raise exception 'Approved or billed additions cannot use this workflow action.'using errcode='PT409';end if;
 case p_intent
 when 'request_review'then allowed:=array['draft','change_requested'];next_status:='pending_internal_review';event:='change_order_review_requested';
 when 'approve_internal'then allowed:=array['draft','pending_internal_review','change_requested'];next_status:='ready_to_send';event:='change_order_internally_approved';
 when 'return_clarification'then allowed:=array['pending_internal_review','ready_to_send'];next_status:='draft';event:='change_order_returned_for_clarification';
 when 'cancel'then allowed:=array['draft','pending_internal_review','ready_to_send','sent','change_requested'];next_status:='cancelled';event:='change_order_cancelled';
 end case;
 if not(co.status=any(allowed))then raise exception 'That action is no longer available. Review the current record.'using errcode='PT409';end if;
 if p_intent='approve_internal'and(not exists(select 1 from public.change_order_line_items where change_order_id=co.id)or co.subtotal_cents<>(select coalesce(sum(amount_cents),0)from public.change_order_line_items where change_order_id=co.id))then
  raise exception 'Review the line items and total before approving internally.'using errcode='23514';end if;
 update public.change_orders set status=next_status,
  internally_reviewed_at=case when p_intent='approve_internal'then clock_timestamp()when p_intent='return_clarification'then null else internally_reviewed_at end,
  internally_reviewed_by_user_id=case when p_intent='approve_internal'then actor when p_intent='return_clarification'then null else internally_reviewed_by_user_id end,
  cancelled_at=case when p_intent='cancel'then clock_timestamp()else cancelled_at end where id=co.id;
 insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
  values(actor,'change_order',co.id,event,jsonb_build_object('job_id',co.job_id,'request_id',p_request_id,'previous_status',co.status,'reviewed_revision',p_expected_revision));
 if not app_private.has_staff_role()then raise exception 'Only active office staff may change this workflow.'using errcode='42501';end if;
 select jsonb_build_object('request_id',p_request_id,'id',id,'job_id',job_id,'organization_id',organization_id,'reviewed_revision',p_expected_revision,'intent',p_intent,
  'from_status',co.status,'to_status',status,'edit_revision',edit_revision,'current_revision',edit_revision,'current_status',status,'replayed',false)into ack from public.change_orders where id=co.id;
 insert into app_private.change_order_workflow_requests(request_id,actor_user_id,input_hash,change_order_id,receipt)values(p_request_id,actor,fingerprint,co.id,ack);
 return ack;
end $$;
revoke all on function public.transition_change_order_workflow(uuid,uuid,integer,text)from public,anon,authenticated,service_role;
grant execute on function public.transition_change_order_workflow(uuid,uuid,integer,text)to authenticated;
notify pgrst,'reload schema';
commit;
