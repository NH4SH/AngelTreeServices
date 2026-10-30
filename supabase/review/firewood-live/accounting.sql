-- REVIEW-ONLY, local synthetic accounting repair. No installer/activation authority.
-- Apply after boundary.sql + office-workflows.sql inside the owned rehearsal.
-- Issuance is accepted-invoice commitment, never a delivery or email receipt.
do $$begin
 if current_setting('ats.firewood_live_review',true)is distinct from'isolated-synthetic-only'
 or to_regclass('app_private.firewood_live_order_workflows')is null
 or to_regclass('app_private.firewood_live_cancellation_credits')is not null or exists(select 1 from app_private.firewood_live_handoffs)then
 raise exception 'Fresh isolated Firewood accounting review required.'using errcode='42501';end if;
end $$;
alter table app_private.firewood_live_handoffs add column issued_at timestamptz;
-- Existing candidate rows require separately reviewed evidence reconciliation.
-- Installation admits no historical backfill or invented delivery timestamp.
alter table app_private.firewood_live_handoffs alter column issued_at set default clock_timestamp(),alter column issued_at set not null;
alter table app_private.firewood_live_handoffs add constraint firewood_live_credit_binding unique(invoice_id,source_id,order_id,principal_cents);
create table app_private.firewood_live_cancellation_credits(
 id uuid primary key default gen_random_uuid(),invoice_id uuid not null unique references public.invoices(id)on delete restrict,
 source_id text not null,order_id uuid not null,amount_cents integer not null check(amount_cents>0),
 actor_id uuid not null references auth.users(id),reason text not null check(length(btrim(reason))between 1 and 500),
 request_id uuid not null unique,ledger_hash text not null check(ledger_hash~'^[a-f0-9]{64}$'),workflow_revision integer not null check(workflow_revision>0),
 created_at timestamptz not null default clock_timestamp(),foreign key(invoice_id,source_id,order_id,amount_cents)references app_private.firewood_live_handoffs(invoice_id,source_id,order_id,principal_cents)on delete restrict
);
alter table app_private.firewood_live_cancellation_credits enable row level security;
revoke all on app_private.firewood_live_cancellation_credits from public,anon,authenticated,service_role;
create function app_private.firewood_live_accounting(p_invoice uuid)returns jsonb language sql stable security invoker set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('issued_at',h.issued_at,'original_principal_cents',i.total_cents,
 'raw_balance_due_cents',greatest(0,i.total_cents::bigint-app_private.invoice_paid_principal(i.id)),
 'credited_principal_cents',coalesce(c.amount_cents,0),'collectible_balance_cents',greatest(0,i.total_cents::bigint-app_private.invoice_paid_principal(i.id)-coalesce(c.amount_cents,0)),
 'credit_id',c.id)from app_private.firewood_live_handoffs h join public.invoices i on i.id=h.invoice_id
 left join app_private.firewood_live_cancellation_credits c on c.invoice_id=i.id where i.id=p_invoice;
$$;
create function app_private.guard_firewood_live_accounting_history()returns trigger language plpgsql security invoker set search_path='' as $$begin
 if TG_TABLE_NAME='firewood_live_cancellation_credits'then raise exception 'Cancellation credit history is immutable.'using errcode='23514';end if;
 if TG_OP='DELETE'or new.issued_at is distinct from old.issued_at then raise exception 'Invoice issuance history is immutable.'using errcode='23514';end if;return new;
end $$;
create trigger firewood_live_issuance_immutable before update or delete on app_private.firewood_live_handoffs for each row execute function app_private.guard_firewood_live_accounting_history();
create trigger firewood_live_credit_immutable before update or delete on app_private.firewood_live_cancellation_credits for each row execute function app_private.guard_firewood_live_accounting_history();
-- A credit is not a void, payment or refund. Only the scoped reconciler may
-- derive its cached invoice balance/status; no API role gets column writes.
do $$begin if(select md5(pg_get_constraintdef(oid,true))from pg_constraint where conrelid='public.invoices'::regclass and conname='invoices_status_check')is distinct from'd5bc6f853e92c29c83a2552736ec5f9a'then raise exception 'Original invoice status policy changed; review required.';end if;end $$;
alter table public.invoices drop constraint invoices_status_check;
alter table public.invoices add constraint invoices_status_check check(status in('draft','sent','partially_paid','paid','void','overdue','credited'));
create function app_private.reconcile_firewood_live_accounting(p_invoice uuid)returns jsonb language plpgsql security invoker set search_path='' as $$
declare i public.invoices%rowtype;h app_private.firewood_live_handoffs%rowtype;c app_private.firewood_live_cancellation_credits%rowtype;paid bigint;balance integer;resolved text;begin
 select *into strict i from public.invoices where id=p_invoice for update;
 select *into strict h from app_private.firewood_live_handoffs where invoice_id=p_invoice;
 select *into c from app_private.firewood_live_cancellation_credits where invoice_id=p_invoice;
 paid:=app_private.invoice_paid_principal(p_invoice);balance:=greatest(0,i.total_cents::bigint-coalesce(c.amount_cents,0)-paid)::integer;
 if i.status='void'then resolved:='void';
 elsif c.id is not null then resolved:='credited';
 elsif balance=0 then resolved:='paid';
 elsif paid>0 then resolved:='partially_paid';
 elsif i.status='overdue'or i.due_at<now()then resolved:='overdue';else resolved:='sent';end if;
 update public.invoices set balance_due_cents=balance,status=resolved,
 paid_at=case when c.id is null and balance=0 then coalesce(i.paid_at,clock_timestamp())else null end where id=p_invoice;
 if balance=0 then update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),processing_started_at=null,
 skip_reason=case when c.id is null then'Invoice was paid in full.'else'Invoice balance closed by an audited cancellation credit.'end
 where invoice_id=p_invoice and status='pending';end if;
 return jsonb_build_object('balance_due_cents',balance,'paid_cents',paid,'status',resolved);
end $$;
create function app_private.guard_firewood_live_accounting_invoice()returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb;begin
 a:=app_private.firewood_live_accounting(new.id);
 if new.status='credited'and(a is null or a->>'credit_id'is null or(a->>'credited_principal_cents')::bigint<>new.total_cents or new.balance_due_cents<>0 or new.paid_at is not null)then raise exception 'Audited cancellation credit required.'using errcode='23514';end if;
 if a is not null and (new.balance_due_cents is distinct from old.balance_due_cents or new.status is distinct from old.status)then
  if new.balance_due_cents<>(a->>'collectible_balance_cents')::bigint then raise exception 'Firewood accounting balance requires reconciliation.'using errcode='23514';end if;
  if a->>'credit_id'is not null and new.status not in('credited','void')then raise exception 'Credited invoice cannot reopen collection.'using errcode='23514';end if;
 end if;return new;
end $$;
create trigger firewood_live_accounting_invoice before update on public.invoices for each row execute function app_private.guard_firewood_live_accounting_invoice();
create function app_private.guard_firewood_live_initial_credit()returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='credited'then raise exception 'A draft cannot start with a cancellation credit.'using errcode='23514';end if;return new;end $$;
create trigger firewood_live_initial_credit before insert on public.invoices for each row execute function app_private.guard_firewood_live_initial_credit();
create function app_private.guard_firewood_live_manual_collection()returns trigger language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.invoices where id=new.invoice_id for update;
 if new.provider='manual'and exists(select 1 from app_private.firewood_live_order_workflows where invoice_id=new.invoice_id and state<>'active')then raise exception 'Cancellation hold blocks new manual collection.'using errcode='23514';end if;return new;end $$;
create trigger firewood_live_manual_collection before insert on public.payments for each row execute function app_private.guard_firewood_live_manual_collection();

-- SOURCE-PINNED ORIGINAL DISPATCH public.reconcile_invoice_balance(p_invoice_id uuid)
do $$begin if(select md5(prosrc)from pg_proc where oid='public.reconcile_invoice_balance(uuid)'::regprocedure)<>'bd81a9152acbf05e2819f09f790556b8'then raise exception 'Original invoice reconciliation changed; review required.';end if;end $$;
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
  if exists(select 1 from app_private.firewood_live_handoffs where invoice_id=target.id) then
    return app_private.reconcile_firewood_live_accounting(target.id);
  end if;
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

-- SOURCE-PINNED ORIGINAL DISPATCH app_private.reconcile_outbound_delivery(p_delivery uuid)
do $$begin if(select md5(prosrc)from pg_proc where oid='app_private.reconcile_outbound_delivery(uuid)'::regprocedure)<>'746505d8ff356dff9428e185e426df9d'then raise exception 'Original delivery reconciliation changed; review required.';end if;end $$;
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
    if exists(select 1 from app_private.firewood_live_handoffs where invoice_id=i.id)then
      update public.invoices set sent_at=coalesce(sent_at,d.accepted_at)where id=i.id;
      perform public.reconcile_invoice_balance(i.id);
    else
    -- Same PR03/07 principal and derived-state helpers; no line/payment mutation.
    paid:=app_private.invoice_paid_principal(i.id);balance:=greatest(0,i.total_cents::bigint-paid)::integer;
    resolved:=app_private.invoice_payment_status(i.status,balance,paid,coalesce(i.sent_at,d.accepted_at),i.due_at);
    update public.invoices set sent_at=coalesce(sent_at,d.accepted_at),balance_due_cents=balance,status=resolved,
      paid_at=case when balance=0 then coalesce(paid_at,clock_timestamp()) else null end where invoices.id=i.id;
    end if;
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

create or replace function app_private.firewood_live_workflow_money(p_invoice uuid)returns jsonb language plpgsql security invoker set search_path='' set timezone='UTC' as $$
declare raw jsonb;valid boolean;pending boolean;refund_pending boolean;review boolean;gross bigint;refunded bigint;principal bigint;fee bigint;begin
 select jsonb_build_object('invoice',to_jsonb(i),'accounting',app_private.firewood_live_accounting(i.id),'payments',coalesce((select jsonb_agg(to_jsonb(p)order by p.id)from public.payments p where p.invoice_id=i.id),'[]'::jsonb),'attempts',coalesce((select jsonb_agg(to_jsonb(c)order by c.id)from public.invoice_checkout_sessions c where c.invoice_id=i.id),'[]'::jsonb),'refunds',coalesce((select jsonb_agg(to_jsonb(f)order by f.refund_id)from app_private.stripe_refund_observations f join public.payments p on p.id=f.payment_id where p.invoice_id=i.id),'[]'::jsonb),'workflow',app_private.firewood_live_workflow_json(i.id),'original_paid_evidence',(select original_paid_evidence from app_private.firewood_live_handoffs where invoice_id=i.id))into raw from public.invoices i where i.id=p_invoice;
 if raw is null then raise exception 'Firewood invoice not found.'using errcode='P0002';end if;
 select not exists(select 1 from public.payments p where p.invoice_id=p_invoice and(p.status is null or p.status not in('pending','succeeded','failed','cancelled','refunded')or p.currency is distinct from'usd'or p.amount_cents is null or p.amount_cents<0 or p.surcharge_cents is null or p.surcharge_cents<0 or p.total_collected_cents is distinct from p.amount_cents+p.surcharge_cents or p.refunded_principal_cents is null or p.refunded_surcharge_cents is null or p.refunded_principal_cents<0 or p.refunded_surcharge_cents<0 or p.refunded_principal_cents>p.amount_cents or p.refunded_surcharge_cents>p.surcharge_cents))
 and not exists(select 1 from public.invoice_checkout_sessions c where c.invoice_id=p_invoice and(c.status is null or c.status not in('creating','open','processing','completed','expired','cancelled','failed')))
 and not exists(select 1 from app_private.stripe_refund_observations f join public.payments p on p.id=f.payment_id where p.invoice_id=p_invoice and(f.currency is distinct from'usd'or f.status is null or f.status not in('pending','requires_action','succeeded','failed','canceled')or f.amount_cents is null or f.amount_cents<1 or f.amount_cents>p.total_collected_cents))into valid;
 select exists(select 1 from public.payments where invoice_id=p_invoice and status='pending')or exists(select 1 from public.invoice_checkout_sessions where invoice_id=p_invoice and status in('creating','open','processing'))into pending;
 select exists(select 1 from app_private.stripe_refund_observations f join public.payments p on p.id=f.payment_id where p.invoice_id=p_invoice and f.status in('pending','requires_action'))into refund_pending;
 select exists(select 1 from public.payments where invoice_id=p_invoice and(dispute_status is not null or(status in('failed','cancelled')and succeeded_at is not null)))or exists(select 1 from app_private.firewood_live_handoffs h join public.payments p on p.invoice_id=h.invoice_id where h.invoice_id=p_invoice and h.original_paid_evidence is not null and p.status='failed')into review;
 select coalesce(sum(total_collected_cents::bigint)filter(where status in('succeeded','refunded')or succeeded_at is not null),0),coalesce(sum(refunded_principal_cents::bigint+refunded_surcharge_cents::bigint),0),coalesce(sum(amount_cents::bigint)filter(where status in('succeeded','refunded')or succeeded_at is not null),0),coalesce(sum(surcharge_cents::bigint)filter(where status in('succeeded','refunded')or succeeded_at is not null),0)into gross,refunded,principal,fee from public.payments where invoice_id=p_invoice;
 if refunded>gross or gross<0 then valid:=false;end if;
 if exists(select 1 from public.payments p where p.invoice_id=p_invoice and coalesce((select sum(f.amount_cents)from app_private.stripe_refund_observations f where f.payment_id=p.id and f.status in('pending','requires_action','succeeded')),0)>p.total_collected_cents)then valid:=false;end if;
 if exists(select 1 from public.invoices i where i.id=p_invoice and(i.total_cents is null or i.total_cents<1 or i.balance_due_cents is null or i.balance_due_cents<>(app_private.firewood_live_accounting(i.id)->>'collectible_balance_cents')::bigint))then valid:=false;end if;
 if exists(select 1 from public.invoice_checkout_sessions c where c.invoice_id=p_invoice and c.status='completed'and not exists(select 1 from public.payments p where p.invoice_id=c.invoice_id and(p.status in('succeeded','refunded')or p.succeeded_at is not null)and p.provider='stripe'and((c.stripe_payment_intent_id is not null and p.provider_payment_id=c.stripe_payment_intent_id)or(c.stripe_checkout_session_id is not null and p.provider_checkout_session_id=c.stripe_checkout_session_id))))then valid:=false;end if;
 if exists(select 1 from public.payments p where p.invoice_id=p_invoice and p.provider='stripe'and p.refunded_principal_cents+p.refunded_surcharge_cents<>coalesce((select sum(f.amount_cents)from app_private.stripe_refund_observations f where f.payment_id=p.id and f.status='succeeded'),0))then valid:=false;end if;
 return jsonb_build_object('accounting',app_private.firewood_live_accounting(p_invoice),'ledger_hash',encode(sha256(convert_to(raw::text,'UTF8')),'hex'),'invoice_status',raw#>'{invoice,status}','payment_count',(select count(*)from public.payments where invoice_id=p_invoice),'attempt_count',(select count(*)from public.invoice_checkout_sessions where invoice_id=p_invoice),'no_money_history',not exists(select 1 from public.payments where invoice_id=p_invoice)and not exists(select 1 from public.invoice_checkout_sessions where invoice_id=p_invoice)and not exists(select 1 from app_private.firewood_live_handoffs where invoice_id=p_invoice and original_paid_evidence is not null),'verified',valid,'payment_pending',pending,'refund_pending',refund_pending,'review_required',review or not valid,'collected_principal_cents',case when valid then principal else null end,'surcharge_collected_cents',case when valid then fee else null end,'balance_due_cents',case when valid then(raw#>>'{invoice,balance_due_cents}')::bigint else null end,'collected_gross_cents',case when valid then gross else null end,'refunded_gross_cents',case when valid then refunded else null end,'retained_gross_cents',case when valid then gross-refunded else null end);
end $$;

create function app_private.firewood_live_credit_blockers(p_invoice uuid)returns jsonb language plpgsql security invoker set search_path='' as $$
declare w app_private.firewood_live_order_workflows%rowtype;m jsonb;begin
 select *into w from app_private.firewood_live_order_workflows where invoice_id=p_invoice;
 if w.invoice_id is null or w.state<>'cancellation_requested'or w.refund_eligibility<>'full'then return jsonb_build_array('full_refund_cancellation_required');end if;
 if exists(select 1 from app_private.firewood_live_cancellation_credits where invoice_id=p_invoice)then return jsonb_build_array('credit_already_recorded');end if;
 m:=app_private.firewood_live_workflow_money(p_invoice);
 if m->'verified'is distinct from'true'::jsonb or m->'review_required'='true'::jsonb then return jsonb_build_array('payment_review');end if;
 if m->'payment_pending'='true'::jsonb or m->'refund_pending'='true'::jsonb then return jsonb_build_array('payment_or_refund_pending');end if;
 if(m->>'retained_gross_cents')::bigint<>0 then return jsonb_build_array('refund_required');end if;
 if (m->>'balance_due_cents')::bigint<=0 then return jsonb_build_array('no_balance_to_credit');end if;
 if m->'no_money_history'='true'::jsonb then return jsonb_build_array('use_clean_cancellation');end if;
 if exists(select 1 from public.invoice_checkout_sessions s where s.invoice_id=p_invoice and
 (s.status not in('completed','expired','cancelled','failed')or s.void_reconciled_token is null or not exists(
 select 1 from app_private.invoice_void_leases l where l.invoice_id=p_invoice and l.token=s.void_reconciled_token
 and l.actor_user_id=auth.uid()and l.purpose in('review','void')and l.expires_at>clock_timestamp())))then return jsonb_build_array('checkout_closure_review_required');end if;
 return '[]'::jsonb;
end $$;
create function public.credit_firewood_live_cancellation(p_invoice uuid,p_revision integer,p_ledger_hash text,p_request_id uuid,p_reason text)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$
declare actor uuid;payload jsonb;replay jsonb;h app_private.firewood_live_handoffs%rowtype;w app_private.firewood_live_order_workflows%rowtype;m jsonb;credit uuid;result jsonb;begin
 actor:=app_private.firewood_live_office_actor();payload:=jsonb_build_object('invoice_id',p_invoice,'revision',p_revision,'ledger_hash',p_ledger_hash,'reason',p_reason);
 replay:=app_private.firewood_live_office_replay(actor,p_request_id,'cancellation_credited',payload);if replay is not null then return replay;end if;
 if p_reason is null or length(btrim(p_reason))not between 1 and 500 then raise exception 'Credit reason required.'using errcode='22023';end if;
 select *into strict h from app_private.firewood_live_handoffs where invoice_id=p_invoice;
 perform 1 from public.invoices where id=p_invoice for update;
 replay:=app_private.firewood_live_office_replay(actor,p_request_id,'cancellation_credited',payload);if replay is not null then return replay;end if;
 select *into strict w from app_private.firewood_live_order_workflows where invoice_id=p_invoice for update;
 if p_revision is null or w.revision<>p_revision or w.state<>'cancellation_requested'then raise exception 'Cancellation review changed.'using errcode='40001';end if;
 m:=app_private.firewood_live_workflow_money(p_invoice);
 if p_ledger_hash is distinct from m->>'ledger_hash'then raise exception 'Financial review changed.'using errcode='40001';end if;
 if app_private.firewood_live_credit_blockers(p_invoice)<>'[]'::jsonb then raise exception 'Refund, payment or checkout closure review required before credit.'using errcode='23514';end if;
 insert into app_private.firewood_live_cancellation_credits(invoice_id,source_id,order_id,amount_cents,actor_id,reason,request_id,ledger_hash,workflow_revision)
 values(p_invoice,h.source_id,h.order_id,h.principal_cents,actor,btrim(p_reason),p_request_id,p_ledger_hash,w.revision+1)returning id into credit;
 perform public.reconcile_invoice_balance(p_invoice);
 update app_private.firewood_live_order_workflows set revision=revision+1 where invoice_id=p_invoice;
 insert into app_private.firewood_live_office_events(order_id,invoice_id,revision,operation,actor_id,details)
 values(h.order_id,p_invoice,w.revision+1,'cancellation_credited',actor,jsonb_build_object('credit_id',credit,'credited_principal_cents',h.principal_cents,'reason',btrim(p_reason),'ledger_hash',p_ledger_hash,'refund_executed',false,'payment_recorded',false,'customer_email_sent',false));
 insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)values(actor,'invoice',p_invoice,'firewood_cancellation_credit_recorded',jsonb_build_object('credit_id',credit,'amount_cents',h.principal_cents,'request_id',p_request_id));
 result:=jsonb_build_object('order_id',h.order_id,'invoice_id',p_invoice,'accounting',app_private.firewood_live_accounting(p_invoice))||app_private.firewood_live_workflow_json(p_invoice);
 return app_private.firewood_live_office_ack(actor,p_request_id,'cancellation_credited',payload,result);
end $$;

create or replace function app_private.guard_firewood_live_office_history()returns trigger language plpgsql security invoker set search_path='' set timezone='UTC' as $$begin
 if TG_OP='DELETE'or TG_TABLE_NAME in('firewood_live_office_events','firewood_live_office_receipts')then raise exception 'Firewood office history is immutable.'using errcode='23514';end if;
 if TG_TABLE_NAME='firewood_live_office_requests'then
  if(old.source_id,old.order_id,old.reference,old.draft,old.draft_hash,old.created_at)is distinct from(new.source_id,new.order_id,new.reference,new.draft,new.draft_hash,new.created_at)or new.revision<>old.revision+1
   or not((old.status='pending'and new.status in('approved','revoked'))or(old.status='approved'and new.status='revoked'))
   or(old.approval_id is not null and old.approval_id is distinct from new.approval_id)then raise exception 'Firewood office draft is immutable.'using errcode='23514';end if;
 elsif TG_TABLE_NAME='firewood_live_order_workflows'then
  if(old.invoice_id,old.source_id,old.order_id)is distinct from(new.invoice_id,new.source_id,new.order_id)or new.revision<>old.revision+1
   or(old.state='cancelled')or(old.state='cancellation_requested'and new.state not in('cancelled','cancellation_requested'))
   or(old.state<>'active'and(old.delivery_window_start,old.delivery_window_end,old.delivery_evidence,old.cancellation_reason_code,old.cancellation_reason,old.requested_at,old.requested_by,old.refund_eligibility)is distinct from(new.delivery_window_start,new.delivery_window_end,new.delivery_evidence,new.cancellation_reason_code,new.cancellation_reason,new.requested_at,new.requested_by,new.refund_eligibility))
   then raise exception 'Firewood cancellation history is immutable.'using errcode='23514';end if;
 end if;return new;
end $$;

create or replace function public.inspect_firewood_live_office(p_order uuid)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$
declare h app_private.firewood_live_handoffs%rowtype;r app_private.firewood_live_office_requests%rowtype;lifecycle jsonb;money jsonb;decision text;events jsonb;order_data jsonb;price jsonb;begin
 perform app_private.firewood_live_office_actor();select *into h from app_private.firewood_live_handoffs where order_id=p_order;
 select *into r from app_private.firewood_live_office_requests where order_id=p_order;
 if h.invoice_id is null and r.order_id is null then raise exception 'Firewood order not found.'using errcode='P0002';end if;
 if h.invoice_id is not null then
  perform 1 from public.invoices where id=h.invoice_id for share;
  lifecycle:=app_private.firewood_live_workflow_json(h.invoice_id);money:=app_private.firewood_live_workflow_money(h.invoice_id);decision:=app_private.firewood_live_cancellation_disposition(money,lifecycle->>'refund_eligibility');
  order_data:=jsonb_build_object('order_id',h.order_id,'reference',h.reference,'invoice_id',h.invoice_id,'invoice_number',(select invoice_number from public.invoices where id=h.invoice_id),'principal_cents',h.principal_cents,'wood_cents',h.payload#>'{order,wood_cents}','stacking_cents',h.payload#>'{order,stacking_cents}','quantity',h.payload#>'{order,quantity}','stacking',h.payload#>'{order,stacking}','contact',h.payload#>'{order,contact}','terms_version',h.payload#>'{order,terms,version}');
 else order_data:=jsonb_build_object('order_id',r.order_id,'reference',r.reference,'invoice_id',null,'invoice_number',null,'principal_cents',null,'wood_cents',null,'stacking_cents',null,'quantity',r.draft->'quantity','stacking',r.draft->'stacking','contact',r.draft->'contact','terms_version','firewood-household-live-2026-10-29-v1');end if;
 if r.order_id is not null then price:=app_private.firewood_live_office_price_receipt(p_order);end if;
 select coalesce(jsonb_agg(jsonb_build_object('revision',e.revision,'operation',e.operation,'actor_id',e.actor_id,'details',e.details,'created_at',e.created_at)order by e.created_at,e.id),'[]'::jsonb)into events from(select *from app_private.firewood_live_office_events where order_id=p_order order by created_at desc,id desc limit 20)e;
 return jsonb_build_object('order',order_data,'price_request',price,'lifecycle',lifecycle,'financial',money,'financial_disposition',decision,'can_confirm',coalesce(lifecycle->>'state'='cancellation_requested'and decision in('no_refund_due','refund_complete'),false),'confirmation_blockers',case when lifecycle is null or lifecycle->>'state'<>'cancellation_requested'then jsonb_build_array('cancellation_not_requested')when decision not in('no_refund_due','refund_complete')then jsonb_build_array(decision)else'[]'::jsonb end,'can_credit',coalesce(h.invoice_id is not null and app_private.firewood_live_credit_blockers(h.invoice_id)='[]'::jsonb,false),'credit_blockers',case when h.invoice_id is null then jsonb_build_array('invoice_not_accepted')else app_private.firewood_live_credit_blockers(h.invoice_id)end,'events',events);
end $$;

create or replace function public.read_firewood_live_handoff(p_source text,p_order uuid,p_invoice uuid,p_hash text)returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' as $$
declare r app_private.firewood_live_handoffs%rowtype;i public.invoices%rowtype;result jsonb;
begin
 perform app_private.firewood_live_handoff_source(p_source);select * into strict r from app_private.firewood_live_handoffs where source_id=p_source and order_id=p_order;
 select * into strict i from public.invoices where id=r.invoice_id for share;
 if r.invoice_id<>p_invoice or r.payload->>'snapshot_hash'<>p_hash or i.customer_id<>r.customer_id or i.total_cents<>r.principal_cents or i.automatic_reminders_enabled then raise exception 'Firewood invoice requires review.'using errcode='23514';end if;
 select jsonb_build_object('invoice',to_jsonb(i),'accounting',app_private.firewood_live_accounting(i.id),'payments',coalesce((select jsonb_agg(to_jsonb(p)order by p.id)from public.payments p where p.invoice_id=i.id),'[]'::jsonb),'attempts',coalesce((select jsonb_agg(to_jsonb(a)order by a.id)from public.invoice_checkout_sessions a where a.invoice_id=i.id),'[]'::jsonb),'refunds',coalesce((select jsonb_agg(jsonb_build_object('refund_id',f.refund_id,'payment_id',f.payment_id,'amount_cents',f.amount_cents,'currency',f.currency,'status',f.status)order by f.refund_id)from app_private.stripe_refund_observations f join public.payments p on p.id=f.payment_id where p.invoice_id=i.id),'[]'::jsonb),'original_paid_evidence',r.original_paid_evidence,'workflow',jsonb_build_object('state',coalesce(w.state,'active'),'revision',coalesce(w.revision,0),'collection_held',coalesce(w.state,'active')<>'active','fulfillment_held',coalesce(w.state,'active')<>'active')) into result from(select 1)anchor left join app_private.firewood_live_order_workflows w on w.invoice_id=i.id;
 return result||jsonb_build_object('ledger_hash',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
end $$;

create or replace function public.record_firewood_live_handoff_observation(p_source text,p_order uuid,p_invoice uuid,p_hash text,p_ledger_hash text,p_financial jsonb)returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r app_private.firewood_live_handoffs%rowtype;i public.invoices%rowtype;h text;current_ledger jsonb;
begin
 perform app_private.firewood_live_handoff_source(p_source);select * into strict r from app_private.firewood_live_handoffs where source_id=p_source and order_id=p_order;
 select * into strict i from public.invoices where id=r.invoice_id for share;select * into strict r from app_private.firewood_live_handoffs where source_id=p_source and order_id=p_order for update;
 if r.invoice_id<>p_invoice or r.payload->>'snapshot_hash'<>p_hash or p_financial#>'{totals,invoice_principal_cents}'is distinct from to_jsonb(i.total_cents)or p_financial#>'{totals,balance_due_cents}'is distinct from(app_private.firewood_live_accounting(i.id)->'raw_balance_due_cents')or p_financial->'accounting'is distinct from app_private.firewood_live_accounting(i.id)then raise exception 'Financial observation changed.'using errcode='40001';end if;
 current_ledger:=public.read_firewood_live_handoff(p_source,p_order,p_invoice,p_hash);
 if current_ledger->>'ledger_hash'is distinct from p_ledger_hash then raise exception 'Financial observation changed.'using errcode='40001';end if;
 h:=encode(sha256(convert_to(p_financial::text,'UTF8')),'hex');
 if r.observation_hash is distinct from h then update app_private.firewood_live_handoffs set observation_revision=observation_revision+1,observation_hash=h,observation=p_financial where source_id=p_source and order_id=p_order returning * into r;
 insert into app_private.firewood_live_handoff_observations(source_id,order_id,revision,snapshot)values(p_source,p_order,r.observation_revision,p_financial);end if;
 return jsonb_build_object('observation_revision',r.observation_revision,'financial',p_financial);
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where(n.nspname='app_private'and p.proname in('firewood_live_accounting','guard_firewood_live_accounting_history','reconcile_firewood_live_accounting','guard_firewood_live_accounting_invoice','guard_firewood_live_initial_credit','guard_firewood_live_manual_collection','firewood_live_credit_blockers'))
 or(n.nspname='public'and p.proname='credit_firewood_live_cancellation')loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);end loop;
end $$;
grant execute on function public.credit_firewood_live_cancellation(uuid,integer,text,uuid,text)to authenticated;
notify pgrst,'reload schema';
