-- Bind customer approval to the valid capability and the exact document reviewed.
-- Reuse the existing atomic scope/financial command and durable source-event handoff.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
create table app_private.change_order_approval_requests (
 request_id uuid primary key,
 change_order_id uuid not null references public.change_orders(id) on delete cascade,
 token_id uuid not null references public.change_order_portal_tokens(id) on delete cascade,
 expected_updated_at timestamptz not null,
 review_hash text not null check(review_hash ~ '^[a-f0-9]{64}$'),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 receipt jsonb not null,
 approved_at timestamptz not null default clock_timestamp()
);
create index change_order_approval_requests_order on app_private.change_order_approval_requests(change_order_id);
create index change_order_approval_requests_token on app_private.change_order_approval_requests(token_id);
alter table app_private.change_order_approval_requests enable row level security;
revoke all on app_private.change_order_approval_requests from public,anon,authenticated,service_role;

-- One statement snapshot supplies both the visible document and its reviewed hash.
-- No internal costs, notes, crew context, encrypted capabilities or email addresses.
create function app_private.change_order_portal_document(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',c.id,'job_id',c.job_id,'customer_id',c.customer_id,'organization_id',c.organization_id,
  'change_order_number',c.change_order_number,'title',c.title,'status',c.status,'updated_at',c.updated_at,'expires_at',c.expires_at,
  'customer_description',c.customer_description,'reason',c.reason,'customer_notes',c.customer_notes,
  'original_approved_amount_cents',c.original_approved_amount_cents,'total_cents',c.total_cents,
  'approval_contact_id',c.approval_contact_id,
  'customers',case when p.id is not null then jsonb_build_object('display_name',p.display_name) end,
  'organizations',case when o.id is not null then jsonb_build_object('name',o.name) end,
  'approval_contact',case when oc.id is not null then jsonb_build_object('full_name',oc.full_name) end,
  'service_locations',jsonb_build_object('label',l.label,'street',l.street,'city',l.city,'state',l.state,'postal_code',l.postal_code),
  'change_order_line_items',(select coalesce(jsonb_agg(jsonb_build_object('id',li.id,'title',li.title,'description',li.description,
    'quantity',li.quantity,'unit',li.unit,'unit_price_cents',li.unit_price_cents,'amount_cents',li.amount_cents,'sort_order',li.sort_order) order by li.sort_order,li.id),'[]')
    from public.change_order_line_items li where li.change_order_id=c.id))
 from public.change_orders c left join public.customers p on p.id=c.customer_id left join public.organizations o on o.id=c.organization_id
 left join public.service_locations l on l.id=c.service_location_id left join public.organization_contacts oc on oc.id=c.approval_contact_id
 where c.id=p_id;
$$;
create function public.get_change_order_portal_review(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare doc jsonb;
begin
 perform app_private.email_server_only();
 if p_token_hash is null or p_token_hash!~'^[a-f0-9]{64}$' then return null;end if;
 select app_private.change_order_portal_document(c.id) into doc from public.change_order_portal_tokens t join public.change_orders c on c.id=t.change_order_id
 where t.token_hash=p_token_hash and t.revoked_at is null and (t.expires_at is null or t.expires_at>statement_timestamp())
  and t.customer_id is not distinct from c.customer_id and t.organization_id is not distinct from c.organization_id
  and (t.intended_contact_id is null or exists(select 1 from public.organization_contacts oc where oc.id=t.intended_contact_id and oc.id=c.approval_contact_id and oc.organization_id=c.organization_id and oc.is_active));
 if doc is null then return null;end if;
 return doc||jsonb_build_object('review_hash',encode(sha256(convert_to(doc::text,'UTF8')),'hex'));
end $$;

create function public.approve_change_order_by_portal(p_request_id uuid,p_token_hash text,p_expected_updated_at timestamptz,p_review_hash text,p_approver_name text) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare co public.change_orders%rowtype;t public.change_order_portal_tokens%rowtype;old_request app_private.change_order_approval_requests%rowtype;
 co_id uuid;parent uuid;doc jsonb;name text:=btrim(coalesce(p_approver_name,''));ph text;result record;event_id uuid;ack jsonb;
begin
 perform app_private.email_server_only();
 if p_request_id is null or p_expected_updated_at is null or not isfinite(p_expected_updated_at) or p_review_hash is null or p_review_hash!~'^[a-f0-9]{64}$'
  or length(name) not between 1 and 160 then raise exception 'Refresh and review this additional work before approving.' using errcode='22023';end if;
 if p_token_hash is null or p_token_hash!~'^[a-f0-9]{64}$' then raise exception 'This change order link is unavailable.' using errcode='42501';end if;
 ph:=encode(sha256(convert_to(name,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('change-order-approval/'||p_request_id::text,0));
 select change_order_id into co_id from public.change_order_portal_tokens where token_hash=p_token_hash;
 if co_id is null then raise exception 'This change order link is unavailable.' using errcode='42501';end if;
 select job_id into parent from public.change_orders where id=co_id;
 if parent is not null then perform 1 from public.jobs where id=parent for update;end if;
 select * into co from public.change_orders where id=co_id for update;
 if not found or co.job_id is distinct from parent then raise exception 'The addition changed. Refresh and review it.' using errcode='PT409';end if;
 select * into t from public.change_order_portal_tokens where token_hash=p_token_hash and change_order_id=co.id for update;
 if not found or t.revoked_at is not null or (t.expires_at is not null and t.expires_at<=clock_timestamp())
  or t.customer_id is distinct from co.customer_id or t.organization_id is distinct from co.organization_id
  or (t.intended_contact_id is not null and not exists(select 1 from public.organization_contacts oc where oc.id=t.intended_contact_id and oc.id=co.approval_contact_id and oc.organization_id=co.organization_id and oc.is_active)) then
  raise exception 'This change order link is unavailable.' using errcode='42501';end if;
 select * into old_request from app_private.change_order_approval_requests where request_id=p_request_id;
 if found then
  if old_request.change_order_id<>co.id or old_request.token_id<>t.id or old_request.expected_updated_at<>p_expected_updated_at
   or old_request.review_hash<>p_review_hash or old_request.payload_hash<>ph then raise exception 'This approval request was already used for different details.' using errcode='22023';end if;
  return old_request.receipt||jsonb_build_object('replayed',true);
 end if;
 if co.updated_at<>p_expected_updated_at then raise exception 'The additional work changed. Refresh and review it before approving.' using errcode='PT409';end if;
 doc:=app_private.change_order_portal_document(co.id);
 if encode(sha256(convert_to(doc::text,'UTF8')),'hex')<>p_review_hash then raise exception 'The additional work changed. Refresh and review it before approving.' using errcode='PT409';end if;
 if co.status<>'sent' or (co.expires_at is not null and co.expires_at<=clock_timestamp()) then raise exception 'This addition is not awaiting approval. Contact our office for the current version.' using errcode='23514';end if;
 if not exists(select 1 from public.change_order_line_items where change_order_id=co.id)
  or co.subtotal_cents<>(select coalesce(sum(amount_cents),0) from public.change_order_line_items where change_order_id=co.id) then
  raise exception 'This addition is still being updated. Refresh and review it before approving.' using errcode='PT409';end if;
 if not exists(select 1 from public.jobs j where j.id=parent and j.archived_at is null and j.status not in ('cancelled','lost')) then
  raise exception 'Please contact our office before approving this additional work.' using errcode='23514';end if;
 -- The established command still owns scope copies, totals and approval audit.
 select * into strict result from public.approve_change_order(co.id,name,co.approval_contact_id,'portal',null,null);
 select id into strict event_id from app_private.customer_source_events where source_key='change-order:'||co.id||':portal-approved';
 update public.change_order_portal_tokens set used_at=coalesce(used_at,clock_timestamp()) where id=t.id;
 ack:=jsonb_build_object('change_order_id',co.id,'job_id',co.job_id,'newly_approved',result.newly_approved,
  'applied_scope_count',result.applied_scope_count,'source_event_id',event_id,'replayed',false);
 insert into app_private.change_order_approval_requests(request_id,change_order_id,token_id,expected_updated_at,review_hash,payload_hash,receipt)
 values(p_request_id,co.id,t.id,p_expected_updated_at,p_review_hash,ph,ack);
 return ack;
end $$;

-- Parent serialization closes header/line edits racing approval. Trusted database
-- maintenance/restore retains its existing privileges; app roles cannot edit closed scope.
create function app_private.guard_change_order_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare co public.change_orders%rowtype;parent_id uuid;
begin
 if current_setting('role',true)='none' and auth.uid() is null then if tg_op='DELETE' then return old;else return new;end if;end if;
 if tg_table_name='change_orders' then
  if old.status='approved' and (to_jsonb(old)-array['updated_at','applied_to_job_at','invoice_id','invoiced_at']) is distinct from
   (to_jsonb(new)-array['updated_at','applied_to_job_at','invoice_id','invoiced_at']) then
   raise exception 'Approved additional work is locked. Create a separate addition for further changes.' using errcode='23514';end if;
  return new;
 end if;
 if tg_op='UPDATE' and new.change_order_id is distinct from old.change_order_id then raise exception 'A line cannot move between additions.' using errcode='23514';end if;
 parent_id:=case when tg_op='DELETE' then old.change_order_id else new.change_order_id end;
 select * into co from public.change_orders where change_orders.id=parent_id for update;
 if not found and tg_op='DELETE' then return old;end if;
 if not found or co.status in ('approved','declined','cancelled','expired') then raise exception 'This addition is closed for editing.' using errcode='23514';end if;
 if current_setting('role',true)='authenticated' and not app_private.has_staff_role() then raise exception 'Office access required.' using errcode='42501';end if;
 update public.change_orders set updated_at=clock_timestamp() where change_orders.id=parent_id;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger change_order_review_boundary before update on public.change_orders for each row execute function app_private.guard_change_order_review();
create trigger change_order_line_review_boundary before insert or update or delete on public.change_order_line_items for each row execute function app_private.guard_change_order_review();

revoke all on function app_private.change_order_portal_document(uuid),app_private.guard_change_order_review() from public,anon,authenticated,service_role;
revoke all on function public.get_change_order_portal_review(text),public.approve_change_order_by_portal(uuid,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.get_change_order_portal_review(text),public.approve_change_order_by_portal(uuid,text,timestamptz,text,text) to service_role;
notify pgrst,'reload schema';
commit;
