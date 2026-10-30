-- Test-only exact actual102 function preimages for the separate accounting-ready fixture.
-- Source catalog SHA256: e1fc2edb923564e425953c767da788c18ec18f39f98e041cd55bc7b92e658dcd
-- No authority/provider fixtures or successful transport stubs.

-- app_private.invoice_paid_principal prosrc MD5: 3e59fe5b8fea0f3c50db10b97bb232d7
CREATE OR REPLACE FUNCTION app_private.invoice_paid_principal(p_invoice_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(sum(greatest(0::bigint, p.amount_cents::bigint
    - greatest(0, p.refunded_principal_cents)::bigint
    - case when p.dispute_status = 'lost' then greatest(0, p.disputed_principal_cents)::bigint else 0 end)), 0)::bigint
  from public.payments p where p.invoice_id = p_invoice_id and p.status = 'succeeded';
$function$
;
revoke all on function app_private.invoice_paid_principal(p_invoice_id uuid) from public,anon,authenticated,service_role;

-- app_private.invoice_payment_status prosrc MD5: 4c2b454a94bc8ac77770234b48649f58
CREATE OR REPLACE FUNCTION app_private.invoice_payment_status(p_status text, p_balance bigint, p_paid bigint, p_sent_at timestamp with time zone, p_due_at timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case
    when p_status = 'void' then 'void'
    when p_balance = 0 then 'paid'
    when p_sent_at is null and p_status in ('draft', 'paid') then 'draft'
    when p_paid > 0 then 'partially_paid'
    when p_status = 'overdue' or p_due_at < now() then 'overdue'
    else 'sent' end;
$function$
;
revoke all on function app_private.invoice_payment_status(p_status text, p_balance bigint, p_paid bigint, p_sent_at timestamp with time zone, p_due_at timestamp with time zone) from public,anon,authenticated,service_role;

-- public.reconcile_invoice_balance prosrc MD5: bd81a9152acbf05e2819f09f790556b8
CREATE OR REPLACE FUNCTION public.reconcile_invoice_balance(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.invoices%rowtype; paid bigint; balance integer; resolved text;
begin
  if not ((auth.uid() is not null and app_private.has_staff_role())
    or (auth.uid() is null and current_setting('role',true) = 'service_role')) then
    raise exception 'Invoice reconciliation is not available to this account.' using errcode = '42501';
  end if;
  select * into target from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  paid := app_private.invoice_paid_principal(target.id);
  balance := greatest(0,target.total_cents::bigint - paid)::integer;
  resolved := app_private.invoice_payment_status(target.status,balance,paid,target.sent_at,target.due_at);
  update public.invoices set balance_due_cents = balance, status = resolved,
    paid_at = case when balance = 0 then coalesce(target.paid_at,clock_timestamp()) else null end where id = target.id;
  if balance=0 then
    update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),processing_started_at=null,
      skip_reason='Invoice was paid in full.' where invoice_id=target.id and status='pending';
  end if;
  return jsonb_build_object('balance_due_cents',balance,'paid_cents',paid,'status',resolved);
end;
$function$
;
revoke all on function public.reconcile_invoice_balance(p_invoice_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_invoice_balance(p_invoice_id uuid) to authenticated,service_role;

-- app_private.reconcile_outbound_delivery prosrc MD5: 746505d8ff356dff9428e185e426df9d
CREATE OR REPLACE FUNCTION app_private.reconcile_outbound_delivery(p_delivery uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d app_private.outbound_deliveries%rowtype; q public.quotes%rowtype; i public.invoices%rowtype; q_id uuid; paid bigint; balance integer; resolved text;
begin
  select * into d from app_private.outbound_deliveries where id=p_delivery for update;
  if d.state<>'accepted' then return false;end if;
  -- Receipt/history is repaired even when the source changed. Never overwrite a
  -- newer quote, terminal invoice, schedule or financial source with old intent.
  insert into public.email_events(outbound_delivery_id,related_customer_id,related_job_id,related_quote_id,related_invoice_id,related_change_order_id,related_organization_id,
    related_schedule_event_id,related_appointment_id,related_payment_id,related_communication_id,recipient_email,subject,email_type,status,provider_message_id,sent_by_user_id,sent_at,delivery_status,delivery_status_at)
  values(d.id,nullif(d.context->>'customer_id','')::uuid,nullif(d.context->>'job_id','')::uuid,nullif(d.context#>>'{quote_ids,0}','')::uuid,nullif(d.context->>'invoice_id','')::uuid,
    nullif(d.context->>'change_order_id','')::uuid,nullif(d.context->>'organization_id','')::uuid,nullif(d.context->>'schedule_event_id','')::uuid,nullif(d.context->>'appointment_id','')::uuid,
    nullif(d.context->>'payment_id','')::uuid,nullif(d.context->>'communication_id','')::uuid,d.payload#>>'{to,0}',d.payload->>'subject',d.context->>'email_type','sent',d.provider_message_id,d.actor_id,d.accepted_at,d.delivery_status,d.last_event_at)
  on conflict(outbound_delivery_id) where outbound_delivery_id is not null do update set status='sent',provider_message_id=excluded.provider_message_id,
    error_message=null,sent_at=excluded.sent_at,delivery_status=excluded.delivery_status,delivery_status_at=excluded.delivery_status_at;
  if d.repair_state='complete' then return true;end if;
  if d.source_snapshot<>app_private.email_source_snapshot(d.context) or exists(select 1 from public.customer_communications cm where cm.id=nullif(d.context->>'communication_id','')::uuid and (cm.status in ('cancelled','skipped') or jsonb_build_object('attempt_count',cm.attempt_count,'processing_started_at',cm.processing_started_at,'status',cm.status) is distinct from d.active_communication_claim)) then
    update app_private.outbound_deliveries set repair_state='source_changed',problem_code='source_changed_after_dispatch',updated_at=clock_timestamp() where id=d.id;
    return false;
  end if;
  if d.context->>'kind'='quote' then
    for q_id in select value::uuid from jsonb_array_elements_text(d.context->'quote_ids') order by 1 loop
      select * into q from public.quotes where quotes.id=q_id;
      if q.status in ('approved','declined','expired','cancelled') then raise exception 'Closed quote cannot be marked sent' using errcode='23514';end if;
      update public.quotes set status='sent',sent_at=coalesce(sent_at,d.accepted_at),sent_method='crm_email',sent_by_user_id=d.actor_id where quotes.id=q_id;
      if q.recurring_occurrence_id is not null then
        update public.recurring_service_occurrences set status='quote_sent' where recurring_service_occurrences.id=q.recurring_occurrence_id and status in ('upcoming','review_needed','quote_draft','quote_sent');
      end if;
      insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
        values(d.actor_id,'system','quote',q_id,'quote_sent',jsonb_build_object('outbound_delivery_id',d.id,'provider_message_id',d.provider_message_id,'delivery_method','crm_email'));
    end loop;
  elsif d.context->>'kind'='invoice' then
    select * into i from public.invoices where invoices.id=(d.context->>'invoice_id')::uuid;
    if i.status='void' then raise exception 'Void invoice cannot be marked sent' using errcode='23514';end if;
    -- Same PR03/07 principal and derived-state helpers; no line/payment mutation.
    paid:=app_private.invoice_paid_principal(i.id);balance:=greatest(0,i.total_cents::bigint-paid)::integer;
    resolved:=app_private.invoice_payment_status(i.status,balance,paid,coalesce(i.sent_at,d.accepted_at),i.due_at);
    update public.invoices set sent_at=coalesce(sent_at,d.accepted_at),balance_due_cents=balance,status=resolved,
      paid_at=case when balance=0 then coalesce(paid_at,clock_timestamp()) else null end where invoices.id=i.id;
    insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
      values(d.actor_id,'system','invoice',i.id,'invoice_sent',jsonb_build_object('outbound_delivery_id',d.id,'provider_message_id',d.provider_message_id,'delivery_method','crm_email'));
  elsif d.context->>'kind'='change_order' then
    update public.change_orders set status='sent',sent_at=coalesce(sent_at,d.accepted_at) where change_orders.id=(d.context->>'change_order_id')::uuid and status in ('ready_to_send','sent');
    insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
      values(d.actor_id,'system','change_order',(d.context->>'change_order_id')::uuid,'change_order_sent',jsonb_build_object('outbound_delivery_id',d.id,'delivery_method','crm_email'));
  end if;
  if d.context->>'communication_id' is not null then
    update public.customer_communications set status='sent',sent_at=coalesce(sent_at,d.accepted_at),provider_message_id=d.provider_message_id,processing_started_at=null,last_error=null,skip_reason=null
      where customer_communications.id=(d.context->>'communication_id')::uuid;
  end if;
  update app_private.outbound_deliveries set repair_state='complete',followup_sync_pending=(d.context->>'kind' in ('quote','invoice')),problem_code=null,updated_at=clock_timestamp() where outbound_deliveries.id=d.id;
  return true;
end $function$
;
revoke all on function app_private.reconcile_outbound_delivery(p_delivery uuid) from public,anon,authenticated,service_role;

