-- Reviewed office sending uses the established outbox; no provider I/O occurs in SQL.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

create table app_private.change_order_send_requests (
 request_id uuid primary key, actor_user_id uuid not null,
 change_order_id uuid references public.change_orders(id) on delete set null,
 reviewed_revision integer not null check(reviewed_revision>=0), additional_copy boolean not null,
 delivery_id uuid not null references app_private.outbound_deliveries(id),
 receipt jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create index change_order_send_requests_target on app_private.change_order_send_requests(change_order_id);
create index change_order_send_requests_delivery on app_private.change_order_send_requests(delivery_id);
alter table app_private.change_order_send_requests enable row level security;
create policy "No direct send request access" on app_private.change_order_send_requests as restrictive for all to public using(false) with check(false);
revoke all on app_private.change_order_send_requests from public,anon,authenticated,service_role;

-- Opt in only new requests. Existing frozen snapshots retain their exact shape.
do $snapshot$
declare f text:=pg_get_functiondef('app_private.email_source_snapshot(jsonb)'::regprocedure);
 anchor text:='  return result;';
begin
 if (length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected source snapshot preimage';end if;
 execute replace(f,anchor,$body$  if c->>'change_order_send_version'='1' and result?'change_order' then
    result:=jsonb_set(result,'{change_order}',(result->'change_order')-'edit_revision');
    result:=result||jsonb_build_object('change_order_approval_contact',(select jsonb_build_object('id',oc.id,'name',oc.full_name,'email',lower(btrim(oc.email)),'active',oc.is_active,'organization_id',oc.organization_id)
      from public.change_orders send_co join public.organization_contacts oc on oc.id=send_co.approval_contact_id where send_co.id=(c->>'change_order_id')::uuid));
  end if;
  return result;$body$);
end $snapshot$;

create function app_private.change_order_send_context(p_id uuid,p_actor uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('kind','change_order','email_type','change_order','actor_id',p_actor,
  'quote_ids',case when c.source_quote_id is null then '[]'::jsonb else jsonb_build_array(c.source_quote_id)end,
  'invoice_id',null,'change_order_id',c.id,'job_id',c.job_id,'customer_id',c.customer_id,'organization_id',c.organization_id,
  'communication_id',null,'schedule_event_id',null,'appointment_id',null,'payment_id',null,
  'expected_versions','{}'::jsonb,'portal_tokens','[]'::jsonb,'change_order_send_version',1)
 from public.change_orders c where c.id=p_id;
$$;
revoke all on function app_private.change_order_send_context(uuid,uuid) from public,anon,authenticated,service_role;

create function app_private.review_change_order_send_source(p_id uuid,p_revision integer,p_actor uuid) returns public.change_orders
language plpgsql security invoker set search_path='' as $$
declare c public.change_orders%rowtype; parent uuid;
begin
 if p_actor is null or not app_private.email_staff(p_actor)then raise exception 'Active office access is required.'using errcode='42501';end if;
 if p_id is null or p_revision is null or p_revision<0 then raise exception 'Reload this addition before sending.'using errcode='22023';end if;
 select job_id into parent from public.change_orders where id=p_id;
 if parent is not null then perform id from public.jobs where id=parent for update;end if;
 select * into c from public.change_orders where id=p_id for update;
 if not found or c.job_id is distinct from parent or c.edit_revision<>p_revision then raise exception 'This addition changed. Review the current record before sending.'using errcode='PT409';end if;
 if not app_private.email_staff(p_actor)then raise exception 'Active office access is required.'using errcode='42501';end if;
 if c.status not in('ready_to_send','sent')or c.approved_at is not null or c.invoice_id is not null or(c.expires_at is not null and c.expires_at<=now())then
  raise exception 'This addition is not open for an approval email. Review its current status.'using errcode='23514';end if;
 if (c.customer_id is null)=(c.organization_id is null)then raise exception 'Review the contracting party before sending.'using errcode='23514';end if;
 if parent is not null and not exists(select 1 from public.jobs j where j.id=parent and j.customer_id is not distinct from c.customer_id and j.organization_id is not distinct from c.organization_id and j.service_location_id is not distinct from c.service_location_id)then
  raise exception 'Review the work order and contracting party before sending.'using errcode='23514';end if;
 perform id from public.customers where id=c.customer_id for share;
 perform id from public.organizations where id=c.organization_id for share;
 perform id from public.organization_contacts where id=c.approval_contact_id for share;
 if c.customer_id is not null and not exists(select 1 from public.customers where id=c.customer_id and status='active')or
  c.organization_id is not null and not exists(select 1 from public.organizations where id=c.organization_id and status='active')or
  c.approval_contact_id is not null and not exists(select 1 from public.organization_contacts where id=c.approval_contact_id and organization_id=c.organization_id and is_active)then
  raise exception 'Choose an active customer and approval contact before sending.'using errcode='23514';end if;
 if not exists(select 1 from public.change_order_line_items where change_order_id=c.id)or c.subtotal_cents<>(select coalesce(sum(amount_cents),0)from public.change_order_line_items where change_order_id=c.id)then
  raise exception 'Review the line items and total before sending.'using errcode='23514';end if;
 return c;
end $$;
revoke all on function app_private.review_change_order_send_source(uuid,integer,uuid) from public,anon,authenticated,service_role;

create function public.get_change_order_send_source(p_change_order_id uuid,p_expected_revision integer,p_actor_id uuid)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare c public.change_orders%rowtype;ctx jsonb;doc jsonb;
begin
 perform app_private.email_server_only();
 c:=app_private.review_change_order_send_source(p_change_order_id,p_expected_revision,p_actor_id);
 ctx:=app_private.change_order_send_context(c.id,p_actor_id);
 doc:=jsonb_build_object('id',c.id,'change_order_number',c.change_order_number,'title',c.title,'status',c.status,'edit_revision',c.edit_revision,
  'total_cents',c.total_cents,'original_approved_amount_cents',c.original_approved_amount_cents,
  'customers',(select jsonb_build_object('display_name',display_name,'email',email)from public.customers where id=c.customer_id),
  'organizations',(select jsonb_build_object('name',name,'billing_email',billing_email)from public.organizations where id=c.organization_id),
  'approval_contact',(select jsonb_build_object('full_name',full_name,'email',email,'is_active',is_active)from public.organization_contacts where id=c.approval_contact_id));
 return jsonb_build_object('order',doc,'context',ctx,'snapshot',app_private.email_source_snapshot(ctx));
end $$;

create function public.get_change_order_send_request(p_request_id uuid,p_change_order_id uuid,p_expected_revision integer,p_actor_id uuid,p_additional_copy boolean default false)returns jsonb
language plpgsql security definer set search_path='' as $$
declare r app_private.change_order_send_requests%rowtype;c public.change_orders%rowtype;
begin
 perform app_private.email_server_only();
 if p_actor_id is null or not app_private.email_staff(p_actor_id)then raise exception 'Active office access is required.'using errcode='42501';end if;
 if p_request_id is null or p_change_order_id is null or p_expected_revision is null or p_expected_revision<0 or p_additional_copy is null then raise exception 'Reload this addition before sending.'using errcode='22023';end if;
 select * into r from app_private.change_order_send_requests where request_id=p_request_id;
 if not found then return null;end if;
 if r.actor_user_id<>p_actor_id or r.receipt->>'id'<>p_change_order_id::text or r.reviewed_revision<>p_expected_revision or r.additional_copy<>p_additional_copy then
  raise exception 'This request belongs to another email action. Review Delivery review before continuing.'using errcode='22023';end if;
 select * into c from public.change_orders where id=r.change_order_id;
 if not found then raise exception 'The earlier addition was removed. Review its delivery history.'using errcode='23514';end if;
 return r.receipt||jsonb_build_object('replayed',true,'current_revision',c.edit_revision,'current_status',c.status);
end $$;

create function public.prepare_change_order_send(p_request_id uuid,p_change_order_id uuid,p_expected_revision integer,p_actor_id uuid,
 p_additional_copy boolean,p_payload jsonb,p_portal_token_id uuid,p_expected_snapshot jsonb)returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare c public.change_orders%rowtype;ctx jsonb;snap jsonb;ack jsonb;saved jsonb;d app_private.outbound_deliveries%rowtype;
begin
 perform app_private.email_server_only();
 if p_request_id is null then raise exception 'Reload this addition before sending.'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('change-order-send/'||p_request_id::text,0));
 ack:=public.get_change_order_send_request(p_request_id,p_change_order_id,p_expected_revision,p_actor_id,p_additional_copy);
 if ack is not null then return ack;end if;
 c:=app_private.review_change_order_send_source(p_change_order_id,p_expected_revision,p_actor_id);
 ctx:=app_private.change_order_send_context(c.id,p_actor_id)||jsonb_build_object('portal_tokens',jsonb_build_array(jsonb_build_object('kind','change_order','id',p_portal_token_id)));
 snap:=app_private.email_source_snapshot(ctx);
 if p_expected_snapshot is null or p_expected_snapshot<>snap then raise exception 'The email details changed. Review the current record before sending.'using errcode='PT409';end if;
 perform id from public.change_order_portal_tokens where id=p_portal_token_id for share;
 if not exists(select 1 from public.change_order_portal_tokens t where t.id=p_portal_token_id and t.change_order_id=c.id and t.customer_id is not distinct from c.customer_id and t.organization_id is not distinct from c.organization_id and t.intended_contact_id is not distinct from c.approval_contact_id and t.revoked_at is null and(t.expires_at is null or t.expires_at>now()))then
  raise exception 'The customer link no longer matches the approval contact. Review Link controls and regenerate it before sending.'using errcode='23514';end if;
 if jsonb_typeof(p_payload->'cc')is distinct from 'array' or jsonb_array_length(p_payload->'cc')<>0 or not app_private.email_source_eligible(ctx,p_payload)then
  raise exception 'Review the customer email and approval contact before sending.'using errcode='23514';end if;
 -- A new UUID, edit or recipient must never bypass an unresolved provider outcome.
 if exists(select 1 from app_private.outbound_deliveries x where x.context->>'kind'='change_order'and x.context->>'change_order_id'=c.id::text and
  (x.state in('dispatching','unknown')or x.state='accepted'and x.repair_state<>'complete'))then
  raise exception 'An earlier approval email needs Delivery review. Check or repair it before sending another.'using errcode='23514';end if;
 if not p_additional_copy then
  -- Include pre-upgrade saved deliveries without rewriting their snapshots or keys.
  select * into d from app_private.outbound_deliveries x where x.context->>'kind'='change_order'and x.context->>'change_order_id'=c.id::text
   and x.payload->'to'=p_payload->'to'and x.payload->'cc'=p_payload->'cc'
   and (jsonb_set(x.source_snapshot,'{change_order}',(x.source_snapshot->'change_order')-'edit_revision')-'change_order_approval_contact')=(snap-'change_order_approval_contact')
   and (x.context->>'change_order_send_version' is distinct from '1' or x.source_snapshot->'change_order_approval_contact'=snap->'change_order_approval_contact')
   order by case when x.state='accepted'then 0 else 1 end,x.created_at limit 1;
  if not found and c.status='sent'then raise exception 'Review the current version and confirm an additional approval email.'using errcode='23514';end if;
 else
  if c.status<>'sent'then raise exception 'Send the first approval email before requesting an additional copy.'using errcode='23514';end if;
  ctx:=ctx||jsonb_build_object('confirmed_copy',true,'copy_request_id',p_request_id);
 end if;
 if d.id is null then
  saved:=public.prepare_outbound_delivery('change-order-send/'||p_request_id::text,p_payload,ctx,p_expected_snapshot);
  if coalesce((saved->>'conflict')::boolean,true)then raise exception 'The earlier saved email differs. Review its delivery before sending.'using errcode='23514';end if;
  select * into strict d from app_private.outbound_deliveries where id=(saved->>'id')::uuid;
 end if;
 if not app_private.email_staff(p_actor_id)then raise exception 'Active office access is required.'using errcode='42501';end if;
 ack:=jsonb_build_object('request_id',p_request_id,'id',c.id,'reviewed_revision',p_expected_revision,'delivery_id',d.id,
  'job_id',c.job_id,'organization_id',c.organization_id,'current_revision',c.edit_revision,'current_status',c.status,'additional_copy',p_additional_copy,'replayed',false);
 if not exists(select 1 from app_private.change_order_send_requests where delivery_id=d.id)then
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)values(p_actor_id,'staff','change_order',c.id,
   'change_order_email_prepared',jsonb_build_object('outbound_delivery_id',d.id,'request_id',p_request_id,'reviewed_revision',p_expected_revision,'additional_copy',p_additional_copy,'email_sent',false));
 end if;
 insert into app_private.change_order_send_requests(request_id,actor_user_id,change_order_id,reviewed_revision,additional_copy,delivery_id,receipt)
  values(p_request_id,p_actor_id,c.id,p_expected_revision,p_additional_copy,d.id,ack);
 if not app_private.email_staff(p_actor_id)then raise exception 'Active office access is required.'using errcode='42501';end if;
 return ack;
end $$;

revoke all on function public.get_change_order_send_source(uuid,integer,uuid)from public,anon,authenticated,service_role;
revoke all on function public.get_change_order_send_request(uuid,uuid,integer,uuid,boolean)from public,anon,authenticated,service_role;
revoke all on function public.prepare_change_order_send(uuid,uuid,integer,uuid,boolean,jsonb,uuid,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.get_change_order_send_source(uuid,integer,uuid)to service_role;
grant execute on function public.get_change_order_send_request(uuid,uuid,integer,uuid,boolean)to service_role;
grant execute on function public.prepare_change_order_send(uuid,uuid,integer,uuid,boolean,jsonb,uuid,jsonb)to service_role;
notify pgrst,'reload schema';
commit;
