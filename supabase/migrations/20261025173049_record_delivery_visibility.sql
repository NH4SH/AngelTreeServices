-- Read-only record visibility. Frozen bodies and delivery commands stay private.
begin;
create index outbound_deliveries_record_context on app_private.outbound_deliveries using gin (context jsonb_path_ops);

-- Only this private, metadata-only reader crosses the existing private outbox
-- boundary. Stored access is checked again here, never from editable JWT claims.
create function app_private.read_record_delivery_requests(p_record_type text,p_record_id uuid,p_page integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare scope jsonb; result jsonb;
begin
 if auth.uid() is null or not app_private.email_staff(auth.uid()) then
  raise exception 'Delivery review is not available to this account' using errcode='42501';
 end if;
 if p_record_type is null or p_record_type not in ('quote','invoice','change_order') or p_record_id is null
    or p_page is null or p_page<1 or p_page>71582788 then
  raise exception 'Invalid record delivery scope or page' using errcode='22023';
 end if;
 if not (case p_record_type
  when 'quote' then exists(select 1 from public.quotes where id=p_record_id)
  when 'invoice' then exists(select 1 from public.invoices where id=p_record_id)
  when 'change_order' then exists(select 1 from public.change_orders where id=p_record_id) end) then
  raise exception 'Record is not available' using errcode='42501';
 end if;
 scope:=case p_record_type when 'quote' then jsonb_build_object('quote_ids',jsonb_build_array(p_record_id::text))
  when 'invoice' then jsonb_build_object('invoice_id',p_record_id::text)
  else jsonb_build_object('change_order_id',p_record_id::text) end;
 -- One statement/snapshot supplies exact count, clamped page and stable rows.
 -- Containment matches every quote in a multi-proposal request, not only [0].
 with scoped as materialized (
  select d.id,d.payload->>'subject' subject,d.payload#>>'{to,0}' recipient,
   d.state,d.delivery_status,d.repair_state,d.followup_sync_pending,
   d.attempt_count,d.created_at,d.first_dispatched_at,d.last_dispatched_at,d.accepted_at,
   d.provider_message_id
  from app_private.outbound_deliveries d where d.context @> scope and (
   d.state in ('prepared','dispatching','unknown') or d.followup_sync_pending or
   (d.repair_state<>'acknowledged' and (d.repair_state<>'complete' or d.state in ('rejected','not_attempted')
    or d.delivery_status in ('delayed','failed','bounced','complained','suppressed')))
  )
 ), totals as (select count(*) total from scoped), position as (
  select total,least(p_page,greatest(1,ceil(total::numeric/30)::integer)) page from totals
 )
 select jsonb_build_object('record_type',p_record_type,'record_id',p_record_id,'total',position.total,'page',position.page,
  'deliveries',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id asc),'[]'::jsonb) from (
   select * from scoped order by created_at desc,id asc limit 30 offset (position.page-1)*30
  )r)) into result from position;
 return result;
end $$;
revoke all on function app_private.read_record_delivery_requests(text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function app_private.read_record_delivery_requests(text,uuid,integer) to authenticated;

-- The exposed endpoint is invoker: source visibility is checked under the
-- caller's actual RLS before invoking the narrowly projected private reader.
create function public.list_record_delivery_requests(p_record_type text,p_record_id uuid,p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_record_type is null or p_record_type not in ('quote','invoice','change_order') or p_record_id is null
    or p_page is null or p_page<1 or p_page>71582788 then
  raise exception 'Invalid record delivery scope or page' using errcode='22023';
 end if;
 if not (case p_record_type
  when 'quote' then exists(select 1 from public.quotes where id=p_record_id)
  when 'invoice' then exists(select 1 from public.invoices where id=p_record_id)
  when 'change_order' then exists(select 1 from public.change_orders where id=p_record_id) end) then
  raise exception 'Record is not available' using errcode='42501';
 end if;
 return app_private.read_record_delivery_requests(p_record_type,p_record_id,p_page);
end $$;
revoke all on function public.list_record_delivery_requests(text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_record_delivery_requests(text,uuid,integer) to authenticated;
comment on function public.list_record_delivery_requests(text,uuid,integer) is 'Read-only staff metadata for one RLS-visible record; never prepares, sends or authorizes retry.';
commit;
