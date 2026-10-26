-- PR14: total ordering for the existing read-only Delivery review queues.
-- Page sizes, filters, role checks, payload projection, function signatures and
-- recovery commands are unchanged. Numbered pages reflect the current queue;
-- this is not a frozen snapshot across concurrent inserts or state changes.

create index outbound_deliveries_queue_order on app_private.outbound_deliveries(created_at desc,id desc);
create index outbound_deliveries_attention_order on app_private.outbound_deliveries(created_at desc,id desc)
 where repair_state<>'complete' or followup_sync_pending or delivery_status in ('bounced','complained','failed','suppressed');
create index customer_source_events_pending_order on app_private.customer_source_events(event_order,id)
 where prepared_activity_id is null;

create or replace function public.list_outbound_deliveries(p_all boolean default false,p_id uuid default null,p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not app_private.email_staff(auth.uid()) then raise exception 'Delivery review is not available to this account' using errcode='42501';end if;
  return jsonb_build_object('total',(select count(*) from app_private.outbound_deliveries where (p_id is null or id=p_id) and (p_all or p_id is not null or repair_state<>'complete' or followup_sync_pending or delivery_status in ('bounced','complained','failed','suppressed'))),'deliveries',(select coalesce(jsonb_agg(r order by r.created_at desc,r.id desc),'[]') from (
    select id,context->>'kind' kind,context->>'email_type' email_type,context->>'job_id' job_id,context->>'invoice_id' invoice_id,
      context#>>'{quote_ids,0}' quote_id,context->>'change_order_id' change_order_id,payload#>>'{to,0}' recipient,payload->>'subject' subject,
      state,delivery_status,provider_message_id,attempt_count,first_dispatched_at,lease_expires_at,repair_state,problem_code,followup_sync_pending,created_at,
      (first_dispatched_at is null or first_dispatched_at>now()-interval '23 hours') retry_window_open
      from app_private.outbound_deliveries where (p_id is null or id=p_id) and (p_all or p_id is not null or repair_state<>'complete' or followup_sync_pending or delivery_status in ('bounced','complained','failed','suppressed'))
      order by created_at desc,id desc limit 50 offset (greatest(1,coalesce(p_page,1))-1)*50) r),
    'pending_office_notices',(select coalesce(jsonb_agg(r order by r.submitted_at desc,r.id desc),'[]') from(select j.id,coalesce(o.name,cu.display_name,'Website request') name,s.job_id is not null recoverable,j.notification_outcome,j.notification_status,j.submitted_at
      from public.jobs j left join app_private.website_lead_submissions s on s.job_id=j.id left join public.customers cu on cu.id=j.customer_id left join public.organizations o on o.id=j.organization_id
      where j.website_submission_id is not null and j.notification_status in ('pending','failed') and coalesce(cardinality(s.notice_delivery_ids),0)=0 and j.lead_disposition='active'
      order by j.submitted_at desc,j.id desc limit 20) r),
    'legacy_attempts',(select coalesce(jsonb_agg(r order by r.created_at desc,r.id desc),'[]') from(select id,recipient_email recipient,subject,provider_message_id,related_quote_id quote_id,related_invoice_id invoice_id,created_at from public.email_events where outbound_delivery_id is null and status='failed' and error_message='provider_outcome_unknown' order by created_at desc,id desc limit 20) r),
    'unmatched_events',(select count(*) from app_private.outbound_provider_events where disposition in ('unmatched','quarantined')));
end $$;

create or replace function public.list_pending_customer_source_events(p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not app_private.email_staff(auth.uid(),true) then raise exception 'Administrator review required' using errcode='42501';end if;
 return jsonb_build_object('total',(select count(*) from app_private.customer_source_events where prepared_activity_id is null),
 'events',(select coalesce(jsonb_agg(r order by r.event_order,r.id),'[]') from(select id,event_order,event->>'title' title,event->>'destination_path' destination_path,created_at,preparation_problem
  from app_private.customer_source_events where prepared_activity_id is null order by event_order,id limit 20 offset (greatest(1,least(10000,coalesce(p_page,1)))-1)*20) r));
end $$;

-- CREATE OR REPLACE retains each function's existing owner and EXECUTE ACL.
-- No new function/table access, historical backfill or sender is introduced.
notify pgrst,'reload schema';
