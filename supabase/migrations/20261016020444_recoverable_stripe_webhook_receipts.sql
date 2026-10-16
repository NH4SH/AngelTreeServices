-- PR06: a receipt exists independently of a process. Only owned, live attempts
-- can apply work or declare completion. No provider payload/customer PII is saved.
alter table public.stripe_webhook_events
  add column state text not null default 'pending' check(state in ('pending','processing','failed','review','completed')),
  add column phase text not null default 'pending' check(phase in ('pending','effects_ready','completed')),
  add column owner_token uuid,
  add column lease_expires_at timestamptz,
  add column attempts integer not null default 0 check(attempts >= 0),
  add column attempt_limit integer not null default 12 check(attempt_limit > 0),
  add column last_problem text,
  add column event_object_id text,
  add column event_created_at timestamptz,
  add column livemode boolean,
  add column invoice_id uuid references public.invoices(id) on delete restrict,
  add column financial_applied_at timestamptz,
  add column communications_synced boolean not null default false,
  add column last_attempt_at timestamptz,
  add column manual_retry_requested_at timestamptz;
-- Historical completion remains authoritative. Incomplete historical receipts
-- stay pending and may be reclaimed; never fabricate a completion marker.
update public.stripe_webhook_events set state='completed',phase='completed' where processed_at is not null;
create index stripe_webhook_recovery_idx on public.stripe_webhook_events(state,lease_expires_at,received_at) where processed_at is null;
revoke insert,update,delete on public.stripe_webhook_events from service_role;
grant select on public.stripe_webhook_events to service_role;

alter table public.admin_notifications
  add column stripe_event_id text references public.stripe_webhook_events(event_id) on delete restrict,
  add column stripe_email_state text check(stripe_email_state in ('queued','submitting','accepted','failed','skipped','review')),
  add column stripe_email_attempt_token uuid,
  add column stripe_email_started_at timestamptz,
  add column stripe_email_to text,
  add column stripe_email_provider_id text,
  add column stripe_email_problem text;
create index admin_notifications_stripe_event_idx on public.admin_notifications(stripe_event_id) where stripe_event_id is not null;

-- A committed semantic effect freezes its recipient set. Another event for the
-- same payment cannot retroactively notify newly added staff. Legacy effects are
-- repaired once; new activity + inbox + this marker commit in the same apply.
create table app_private.stripe_webhook_effects (
  effect_key text primary key,
  activity_id uuid not null references public.activity_log(id) on delete restrict,
  first_event_id text not null references public.stripe_webhook_events(event_id) on delete restrict
);
alter table app_private.stripe_webhook_effects enable row level security;
revoke all on app_private.stripe_webhook_effects from public,anon,authenticated,service_role;
create index stripe_effect_activity_idx on app_private.stripe_webhook_effects(activity_id);
create index stripe_effect_receipt_idx on app_private.stripe_webhook_effects(first_event_id);

create function public.claim_stripe_webhook(p_event_id text,p_event_type text,p_object_id text,p_created_at timestamptz,p_livemode boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.stripe_webhook_events%rowtype; token uuid := gen_random_uuid();
begin
  if current_setting('role',true) <> 'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
  if p_event_id !~ '^evt_[A-Za-z0-9_]+$' or length(p_event_id)>255 or p_event_type is null or length(p_event_type)>160
    or p_object_id is null or length(p_object_id)>255 or p_created_at is null or p_livemode is null then
    raise exception 'Invalid receipt identity.' using errcode='22023';
  end if;
  insert into public.stripe_webhook_events(event_id,event_type,event_object_id,event_created_at,livemode)
    values(p_event_id,p_event_type,p_object_id,p_created_at,p_livemode) on conflict(event_id) do nothing;
  select * into receipt from public.stripe_webhook_events where event_id=p_event_id for update;
  if receipt.event_type is distinct from p_event_type
    or (receipt.event_object_id is not null and receipt.event_object_id is distinct from p_object_id)
    or (receipt.event_created_at is not null and receipt.event_created_at is distinct from p_created_at)
    or (receipt.livemode is not null and receipt.livemode is distinct from p_livemode) then
    raise exception 'Receipt identity conflict.' using errcode='23514';
  end if;
  if receipt.processed_at is not null then return jsonb_build_object('status','completed'); end if;
  if receipt.state='processing' and receipt.lease_expires_at>clock_timestamp() then return jsonb_build_object('status','busy'); end if;
  if receipt.attempts>=receipt.attempt_limit then
    update public.stripe_webhook_events set state='review',owner_token=null,lease_expires_at=null,last_problem='attempt_limit' where event_id=p_event_id;
    return jsonb_build_object('status','review');
  end if;
  update public.stripe_webhook_events set state='processing',owner_token=token,lease_expires_at=clock_timestamp()+interval '2 minutes',
    attempts=attempts+1,last_attempt_at=clock_timestamp(),last_problem=null,
    event_object_id=p_object_id,event_created_at=p_created_at,livemode=p_livemode where event_id=p_event_id;
  return jsonb_build_object('status','claimed','token',token,'phase',receipt.phase,'invoice_id',receipt.invoice_id,'communications_synced',receipt.communications_synced);
end; $$;
revoke all on function public.claim_stripe_webhook(text,text,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.claim_stripe_webhook(text,text,text,timestamptz,boolean) to service_role;

create function app_private.lock_stripe_webhook(p_event_id text,p_token uuid) returns public.stripe_webhook_events
language plpgsql security invoker set search_path='' as $$
declare receipt public.stripe_webhook_events%rowtype;
begin
  select * into receipt from public.stripe_webhook_events where event_id=p_event_id for update;
  if not found or receipt.owner_token is distinct from p_token or receipt.state<>'processing'
    or receipt.lease_expires_at is null or receipt.lease_expires_at<=clock_timestamp() then
    raise exception 'Webhook ownership expired or changed.' using errcode='55P03';
  end if;
  return receipt;
end; $$;
revoke all on function app_private.lock_stripe_webhook(text,uuid) from public,anon,authenticated,service_role;

-- Operational activity + inbox rows are one replay-safe durable effect. Existing
-- semantic keys match the old notification pipeline, including legacy repair.
create function app_private.stripe_webhook_activity(p_event_id text,p_key text,p_kind text,p_invoice uuid,
  p_title text,p_summary text,p_metadata jsonb,p_notify boolean default true) returns void
language plpgsql security invoker set search_path='' as $$
declare activity uuid; target public.invoices%rowtype;
begin
  if exists(select 1 from app_private.stripe_webhook_effects where effect_key=p_key) then return; end if;
  select * into target from public.invoices where id=p_invoice;
  insert into public.activity_log(subject_type,subject_id,event_type,actor_type,action_category,summary,record_label,
    destination_path,organization_id,metadata_json,idempotency_key)
    values('invoice',p_invoice,p_kind,case when p_notify then 'portal' else 'system' end,'payments',p_summary,'Invoice payment',
      '/admin/invoices/'||p_invoice::text,target.organization_id,p_metadata,p_key)
    on conflict(idempotency_key) where idempotency_key is not null do nothing returning id into activity;
  if activity is null then select id into activity from public.activity_log where idempotency_key=p_key; end if;
  if not p_notify then
    insert into app_private.stripe_webhook_effects values(p_key,activity,p_event_id);
    return;
  end if;
  insert into public.admin_notifications as existing(activity_id,recipient_user_id,organization_id,category,title,body,destination_path,
    stripe_event_id,stripe_email_state,email_status)
    select activity,p.id,target.organization_id,'payments',p_title,p_summary,'/admin/invoices/'||p_invoice::text,p_event_id,
      case when pref.payment_email_enabled=false then 'skipped' else 'queued' end,
      case when pref.payment_email_enabled=false then 'skipped' else 'pending' end
    from public.profiles p left join public.admin_notification_preferences pref on pref.user_id=p.id
    where app_private.effective_platform_access(p.id) and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
      where ur.user_id=p.id and r.name in ('owner','admin'))
    on conflict(activity_id,recipient_user_id) do update set
      stripe_event_id=coalesce(existing.stripe_event_id,excluded.stripe_event_id),
      stripe_email_state=coalesce(existing.stripe_email_state,case existing.email_status when 'sent' then 'accepted' when 'skipped' then 'skipped' when 'failed' then 'failed' else 'review' end),
      stripe_email_problem=case when existing.stripe_email_state is null and existing.email_status='pending' then 'legacy_delivery_uncertain' else existing.stripe_email_problem end,
      email_status=case when existing.stripe_email_state is null and existing.email_status='pending' then 'failed' else existing.email_status end;
  insert into app_private.stripe_webhook_effects values(p_key,activity,p_event_id);
end; $$;
revoke all on function app_private.stripe_webhook_activity(text,text,text,uuid,text,text,jsonb,boolean) from public,anon,authenticated,service_role;

create function public.apply_stripe_webhook(p_event_id text,p_token uuid,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  receipt public.stripe_webhook_events%rowtype;
  checkout public.invoice_checkout_sessions%rowtype;
  payment public.payments%rowtype;
  invoice public.invoices%rowtype;
  operation text := p_evidence->>'operation';
  result jsonb;
  resolved_status text;
  refund_gross integer;
  refund_principal integer;
  refund_surcharge integer;
  matches integer;
  notification_key text;
begin
  if current_setting('role',true)<>'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
  receipt:=app_private.lock_stripe_webhook(p_event_id,p_token);
  if receipt.phase='effects_ready' then return jsonb_build_object('invoice_id',receipt.invoice_id); end if;
  if operation is null or operation not in ('ignored','pending','succeeded','failed','expired','refund','dispute') then raise exception 'Invalid webhook operation.' using errcode='22023'; end if;
  if operation='ignored' then
    update public.stripe_webhook_events set phase='effects_ready',financial_applied_at=clock_timestamp(),communications_synced=true where event_id=p_event_id;
    return jsonb_build_object('ignored',true);
  end if;
  if operation in ('refund','dispute') then
    select count(*) into matches from public.payments where provider='stripe' and provider_charge_id=p_evidence->>'charge_id';
    if matches>1 then raise exception 'Conflicting Stripe charge bindings require review.' using errcode='23514'; end if;
    select * into payment from public.payments where provider='stripe' and provider_charge_id=p_evidence->>'charge_id';
    if not found then raise exception 'Stripe payment not ready.' using errcode='P0002'; end if;
    select * into invoice from public.invoices where id=payment.invoice_id for update;
    select * into payment from public.payments where id=payment.id for update;
    if (operation='refund' and receipt.event_object_id is distinct from p_evidence->>'charge_id')
      or (operation='dispute' and receipt.event_object_id is distinct from p_evidence->>'dispute_id') then
      raise exception 'Provider object mismatch.' using errcode='23514';
    end if;
    if (operation='dispute' and lower(payment.currency) is distinct from lower(p_evidence->>'currency'))
      or (p_evidence->>'intent_id' is not null and payment.provider_payment_id is not null and payment.provider_payment_id<>p_evidence->>'intent_id') then
      raise exception 'Payment provider binding mismatch.' using errcode='23514';
    end if;
  else
    select * into checkout from public.invoice_checkout_sessions where id=(p_evidence->>'reservation_id')::uuid;
    if not found then raise exception 'Checkout reservation not ready.' using errcode='P0002'; end if;
    select * into invoice from public.invoices where id=checkout.invoice_id for update;
    select * into checkout from public.invoice_checkout_sessions where id=checkout.id for update;
    if checkout.invoice_id is distinct from (p_evidence->>'invoice_id')::uuid
      or checkout.customer_id is distinct from invoice.customer_id or checkout.organization_id is distinct from invoice.organization_id
      or checkout.total_charge_cents is distinct from (p_evidence->>'amount_cents')::integer
      or lower(checkout.currency) is distinct from lower(p_evidence->>'currency')
      or receipt.event_object_id is distinct from coalesce(p_evidence->>'session_id',p_evidence->>'intent_id')
      or (checkout.stripe_checkout_session_id is not null and checkout.stripe_checkout_session_id is distinct from p_evidence->>'session_id')
      or (checkout.stripe_payment_intent_id is not null and checkout.stripe_payment_intent_id is distinct from p_evidence->>'intent_id')
      or ((p_evidence->>'session_id') is null and (checkout.payment_channel<>'card' or checkout.stripe_confirmation_token_id is null)) then
      raise exception 'Webhook does not match its invoice reservation.' using errcode='23514';
    end if;
    -- Waiting for an invoice must not extend an expired claim's authority.
    perform app_private.lock_stripe_webhook(p_event_id,p_token);
    if operation='expired' then
      update public.invoice_checkout_sessions set status='expired' where id=checkout.id and status in ('creating','open');
    else
      select count(*) into matches from public.payments p where p.provider='stripe' and
        ((p_evidence->>'session_id' is not null and p.provider_checkout_session_id=p_evidence->>'session_id')
          or (p_evidence->>'intent_id' is not null and p.provider_payment_id=p_evidence->>'intent_id'));
      if matches>1 then raise exception 'Conflicting Stripe payment identities require review.' using errcode='23514'; end if;
      select * into payment from public.payments p where p.provider='stripe' and
        ((p_evidence->>'session_id' is not null and p.provider_checkout_session_id=p_evidence->>'session_id')
          or (p_evidence->>'intent_id' is not null and p.provider_payment_id=p_evidence->>'intent_id')) for update;
      if found and (payment.invoice_id<>invoice.id or payment.customer_id is distinct from checkout.customer_id
        or payment.organization_id is distinct from checkout.organization_id or payment.amount_cents<>checkout.invoice_principal_cents
        or payment.total_collected_cents<>checkout.total_charge_cents or lower(payment.currency)<>lower(checkout.currency)
        or (payment.provider_payment_id is not null and payment.provider_payment_id is distinct from p_evidence->>'intent_id')
        or (payment.provider_charge_id is not null and p_evidence->>'charge_id' is not null and payment.provider_charge_id<>p_evidence->>'charge_id')) then
        raise exception 'Stripe payment binding changed.' using errcode='23514';
      end if;
      resolved_status:=case when payment.status in ('succeeded','refunded') then payment.status else operation end;
      if payment.id is null then
        insert into public.payments(invoice_id,customer_id,organization_id,amount_cents,total_collected_cents,surcharge_cents,currency,
          payment_method,provider,provider_checkout_session_id,provider_payment_id,status,submitted_at)
          values(invoice.id,checkout.customer_id,checkout.organization_id,checkout.invoice_principal_cents,checkout.total_charge_cents,checkout.surcharge_cents,lower(checkout.currency),
            checkout.payment_channel,'stripe',p_evidence->>'session_id',p_evidence->>'intent_id',resolved_status,
            coalesce(checkout.submitted_at,receipt.event_created_at)) returning * into payment;
      end if;
      update public.payments set status=resolved_status, provider_payment_id=coalesce(provider_payment_id,p_evidence->>'intent_id'),
        provider_charge_id=coalesce(provider_charge_id,p_evidence->>'charge_id'),
        card_brand=coalesce(p_evidence->>'card_brand',card_brand,checkout.card_brand),
        card_funding_type=coalesce(p_evidence->>'card_funding_type',card_funding_type,checkout.card_funding_type),
        stripe_fee_cents=coalesce((p_evidence->>'fee_cents')::integer,stripe_fee_cents),
        net_received_cents=coalesce((p_evidence->>'net_cents')::integer,net_received_cents),
        authorized_at=case when resolved_status in ('succeeded','pending') then coalesce(authorized_at,receipt.event_created_at) else authorized_at end,
        paid_at=case when resolved_status in ('succeeded','refunded') then coalesce(paid_at,receipt.event_created_at) else paid_at end,
        succeeded_at=case when resolved_status in ('succeeded','refunded') then coalesce(succeeded_at,receipt.event_created_at) else succeeded_at end,
        failed_at=case when resolved_status='failed' then coalesce(failed_at,receipt.event_created_at) when resolved_status='succeeded' then null else failed_at end
        where id=payment.id returning * into payment;
      update public.invoice_checkout_sessions set
        status=case when resolved_status in ('succeeded','refunded') then 'completed'
          when status in ('creating','open','processing') then case when resolved_status='pending' then 'processing' else 'failed' end else status end,
        stripe_payment_intent_id=coalesce(stripe_payment_intent_id,p_evidence->>'intent_id'),
        submitted_at=coalesce(submitted_at,receipt.event_created_at),
        authorized_at=case when resolved_status in ('succeeded','refunded','pending') then coalesce(authorized_at,receipt.event_created_at) else authorized_at end,
        completed_at=case when resolved_status in ('succeeded','refunded') then coalesce(completed_at,receipt.event_created_at) else completed_at end,
        failed_at=case when resolved_status='failed' then coalesce(failed_at,receipt.event_created_at) else failed_at end,
        processing_expires_at=case when resolved_status in ('succeeded','refunded','failed') then null else processing_expires_at end
        where id=checkout.id;
    end if;
  end if;

  -- A replay never demotes received money. A lower refund snapshot can mean a
  -- stale read OR a failed/cancelled refund; neither may be silently acknowledged.
  -- Keep the receipt recoverable until fresh evidence agrees, or an operator
  -- investigates it. Refund lifecycle corrections remain separate PR07 work.
  if operation='refund' or (operation='succeeded' and p_evidence->>'refund_gross_cents' is not null) then
    if operation='refund' and (payment.total_collected_cents is distinct from (p_evidence->>'amount_cents')::integer
      or lower(payment.currency) is distinct from lower(p_evidence->>'currency')) then raise exception 'Refund binding mismatch.' using errcode='23514'; end if;
    refund_gross:=(p_evidence->>'refund_gross_cents')::integer;
    if refund_gross is null or refund_gross<0 or refund_gross>payment.total_collected_cents then
      raise exception 'Invalid refund amount.' using errcode='23514';
    end if;
    if refund_gross<payment.refunded_principal_cents+payment.refunded_surcharge_cents then
      raise exception 'Refund snapshot decreased; reconcile refund lifecycle before completion.' using errcode='23514', detail='refund_snapshot_conflict';
    end if;
    refund_principal:=least(payment.amount_cents,floor((refund_gross::numeric*payment.amount_cents+floor(payment.total_collected_cents::numeric/2))/payment.total_collected_cents)::integer);
    refund_surcharge:=least(payment.surcharge_cents,refund_gross-refund_principal);
    update public.payments set refunded_principal_cents=refund_principal,refunded_surcharge_cents=refund_surcharge,
      refunded_at=case when refund_gross>0 then coalesce(refunded_at,receipt.event_created_at) else refunded_at end,
      status=case when refund_gross>=total_collected_cents then 'refunded' else status end where id=payment.id returning * into payment;
  end if;
  if operation='dispute' then
    perform public.reconcile_stripe_dispute(p_evidence->>'charge_id',p_evidence->>'dispute_id',
      p_evidence->>'dispute_status',(p_evidence->>'dispute_amount_cents')::integer,receipt.event_type,receipt.event_created_at);
  end if;
  result:=public.reconcile_invoice_balance(invoice.id);
  if (result->>'balance_due_cents')::integer=0 then
    update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),processing_started_at=null,
      skip_reason='Invoice was paid in full.' where invoice_id=invoice.id and status='pending';
  end if;
  if operation='succeeded' and payment.status in ('succeeded','refunded') then
    perform app_private.stripe_webhook_activity(p_event_id,'stripe-payment:'||payment.id::text||':reconciled','stripe_payment_reconciled',invoice.id,
      'Payment reconciled','Stripe payment and invoice balance were reconciled.',jsonb_build_object('payment_id',payment.id,'invoice_principal_cents',payment.amount_cents),false);
    notification_key:=case when p_evidence->>'session_id' is not null then 'stripe-checkout:'||checkout.id::text||':payment-succeeded' else 'stripe-payment-intent:'||checkout.id::text||':succeeded' end;
    perform app_private.stripe_webhook_activity(p_event_id,notification_key,'customer_payment_succeeded',invoice.id,
      'Customer payment received','A customer payment was successfully recorded.',jsonb_build_object('amount_cents',payment.amount_cents,'payment_channel',payment.payment_method));
  elsif operation='pending' and payment.status='pending' and checkout.payment_channel='ach' then
    perform app_private.stripe_webhook_activity(p_event_id,'stripe-checkout:'||checkout.id::text||':payment-processing','customer_bank_payment_processing',invoice.id,
      'Bank payment is processing','A customer submitted a bank payment that is still processing. The invoice remains open until Stripe confirms it.','{}'::jsonb);
  elsif operation='failed' and payment.status='failed' then
    notification_key:=case when p_evidence->>'session_id' is not null then 'stripe-checkout:'||checkout.id::text||':payment-failed' else 'stripe-payment-intent:'||checkout.id::text||':failed' end;
    perform app_private.stripe_webhook_activity(p_event_id,notification_key,'customer_payment_failed',invoice.id,
      'Customer payment needs attention','A customer payment did not complete. The invoice balance was not reduced.','{}'::jsonb);
  elsif operation='refund' then
    perform app_private.stripe_webhook_activity(p_event_id,'stripe-charge:'||(p_evidence->>'charge_id')||':refunded:'||refund_gross::text,'customer_payment_refunded',invoice.id,
      'Payment refund recorded','A Stripe refund changed the invoice balance.',jsonb_build_object('refunded_cents',refund_gross));
  elsif operation='dispute' then
    perform app_private.stripe_webhook_activity(p_event_id,'stripe-dispute:'||(p_evidence->>'dispute_id')||':'||receipt.event_type||':'||(p_evidence->>'dispute_status'),
      case when receipt.event_type='charge.dispute.created' then 'customer_payment_disputed' else 'customer_payment_dispute_updated' end,invoice.id,
      'Payment dispute updated','A Stripe payment dispute was reconciled.',jsonb_build_object('dispute_status',p_evidence->>'dispute_status'));
  end if;
  perform app_private.lock_stripe_webhook(p_event_id,p_token);
  update public.stripe_webhook_events set phase='effects_ready',invoice_id=invoice.id,financial_applied_at=clock_timestamp() where event_id=p_event_id;
  return jsonb_build_object('invoice_id',invoice.id);
end; $$;
revoke all on function public.apply_stripe_webhook(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_stripe_webhook(text,uuid,jsonb) to service_role;

create function public.fail_stripe_webhook(p_event_id text,p_token uuid,p_problem text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true)<>'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
  update public.stripe_webhook_events set state=case when attempts>=attempt_limit then 'review' else 'failed' end,
    owner_token=null,lease_expires_at=null,last_problem=case when p_problem ~ '^[a-z_]{1,80}$' then p_problem else 'processing_failed' end
    where event_id=p_event_id and owner_token=p_token and state='processing' and lease_expires_at>clock_timestamp();
  return found;
end; $$;
revoke all on function public.fail_stripe_webhook(text,uuid,text) from public,anon,authenticated;
grant execute on function public.fail_stripe_webhook(text,uuid,text) to service_role;

-- A provider submission is reserved once, before HTTP. A crash/timeout after this
-- point becomes a visible exception; replay must not resend an uncertain email.
create function public.begin_stripe_notification_email(p_event_id text,p_token uuid,p_notification uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare notification public.admin_notifications%rowtype; recipient public.profiles%rowtype;
begin
  if current_setting('role',true)<>'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
  perform app_private.lock_stripe_webhook(p_event_id,p_token);
  select * into notification from public.admin_notifications where id=p_notification and stripe_event_id=p_event_id for update;
  if not found then raise exception 'Notification not found.' using errcode='P0002'; end if;
  if notification.stripe_email_state='submitting' then
    update public.admin_notifications set stripe_email_state='review',email_status='failed',stripe_email_problem='delivery_uncertain' where id=p_notification;
    return jsonb_build_object('status','review');
  end if;
  if notification.stripe_email_state<>'queued' then return jsonb_build_object('status','done'); end if;
  select * into recipient from public.profiles where id=notification.recipient_user_id;
  if not app_private.effective_platform_access(recipient.id) or recipient.email is null
    or not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=recipient.id and r.name in ('owner','admin'))
    or exists(select 1 from public.admin_notification_preferences pref where pref.user_id=recipient.id and not pref.payment_email_enabled) then
    update public.admin_notifications set stripe_email_state='skipped',email_status='skipped' where id=p_notification;
    return jsonb_build_object('status','done');
  end if;
  update public.admin_notifications set stripe_email_state='submitting',stripe_email_attempt_token=p_token,
    stripe_email_started_at=clock_timestamp(),stripe_email_to=recipient.email,email_attempted_at=clock_timestamp() where id=p_notification;
  return jsonb_build_object('status','send','to',recipient.email,'title',notification.title,'body',notification.body,
    'destination',notification.destination_path,'invoice_id',(select invoice_id from public.stripe_webhook_events where event_id=p_event_id));
end; $$;
revoke all on function public.begin_stripe_notification_email(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_stripe_notification_email(text,uuid,uuid) to service_role;

create function public.finish_stripe_notification_email(p_notification uuid,p_attempt_token uuid,p_outcome text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true)<>'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
  if p_outcome not in ('accepted','failed','review','skipped') then raise exception 'Invalid outcome.' using errcode='22023'; end if;
  if p_outcome='accepted' and nullif(p_provider_id,'') is null then raise exception 'Acceptance evidence required.' using errcode='22023'; end if;
  -- Positive evidence from the sole reserved attempt remains recordable after a
  -- receipt lease expires. It cannot finish a new owner's receipt or resend.
  update public.admin_notifications set stripe_email_state=p_outcome,
    stripe_email_provider_id=p_provider_id,stripe_email_problem=case when p_outcome='review' then 'delivery_uncertain' when p_outcome='failed' then 'delivery_not_accepted' else null end,
    email_status=case when p_outcome='accepted' then 'sent' when p_outcome='skipped' then 'skipped' else 'failed' end
    where id=p_notification and stripe_email_attempt_token=p_attempt_token and stripe_email_state in ('submitting','review');
  return found;
end; $$;
revoke all on function public.finish_stripe_notification_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_stripe_notification_email(uuid,uuid,text,text) to service_role;

create function public.mark_stripe_webhook_sync(p_event_id text,p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true)<>'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
  perform app_private.lock_stripe_webhook(p_event_id,p_token);
  update public.stripe_webhook_events set communications_synced=true where event_id=p_event_id and phase='effects_ready';
  return found;
end; $$;
revoke all on function public.mark_stripe_webhook_sync(text,uuid) from public,anon,authenticated;
grant execute on function public.mark_stripe_webhook_sync(text,uuid) to service_role;

create function public.complete_stripe_webhook(p_event_id text,p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare receipt public.stripe_webhook_events%rowtype;
begin
  if current_setting('role',true)<>'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
  receipt:=app_private.lock_stripe_webhook(p_event_id,p_token);
  if receipt.phase<>'effects_ready' or not receipt.communications_synced or exists(select 1 from public.admin_notifications where stripe_event_id=p_event_id and stripe_email_state in ('queued','submitting')) then
    raise exception 'Webhook has unfinished work.' using errcode='23514';
  end if;
  update public.stripe_webhook_events set state='completed',phase='completed',processed_at=clock_timestamp(),owner_token=null,lease_expires_at=null,
    last_problem=case when exists(select 1 from public.admin_notifications where stripe_event_id=p_event_id and stripe_email_state='review') then 'notification_review' when exists(select 1 from public.admin_notifications where stripe_event_id=p_event_id and stripe_email_state='failed') then 'notification_email_failed' else null end where event_id=p_event_id;
  return true;
end; $$;
revoke all on function public.complete_stripe_webhook(text,uuid) from public,anon,authenticated;
grant execute on function public.complete_stripe_webhook(text,uuid) to service_role;

create function public.request_stripe_webhook_retry(p_event_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt public.stripe_webhook_events%rowtype;
begin
  if auth.uid() is null or not app_private.has_platform_admin_role() then raise exception 'Only active owners/admins may recover webhooks.' using errcode='42501'; end if;
  select * into receipt from public.stripe_webhook_events where event_id=p_event_id for update;
  if not found then raise exception 'Receipt not found.' using errcode='P0002'; end if;
  if receipt.processed_at is not null then raise exception 'This receipt is already complete.' using errcode='23514'; end if;
  if receipt.state='processing' and receipt.lease_expires_at>clock_timestamp() then raise exception 'Receipt is already processing.' using errcode='55P03'; end if;
  update public.stripe_webhook_events set attempt_limit=greatest(attempt_limit,attempts+1),manual_retry_requested_at=clock_timestamp() where event_id=p_event_id;
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
    values(auth.uid(),'staff','stripe_webhook',coalesce(receipt.invoice_id,auth.uid()),'stripe_webhook_retry_requested',jsonb_build_object('event_id',p_event_id));
  return jsonb_build_object('event_id',receipt.event_id,'event_type',receipt.event_type,'object_id',receipt.event_object_id,
    'created_at',receipt.event_created_at,'livemode',receipt.livemode,'phase',receipt.phase,'invoice_id',receipt.invoice_id);
end; $$;
revoke all on function public.request_stripe_webhook_retry(text) from public,anon,service_role;
grant execute on function public.request_stripe_webhook_retry(text) to authenticated;

create function public.get_stripe_webhook_recovery() returns table(event_id text,event_type text,state text,phase text,attempts integer,
  lease_active boolean,last_problem text,received_at timestamptz,processed_at timestamptz,invoice_id uuid,email_review_count bigint,email_failed_count bigint)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not app_private.has_platform_admin_role() then raise exception 'Only active owners/admins may inspect webhook recovery.' using errcode='42501'; end if;
  return query select e.event_id,e.event_type,e.state,e.phase,e.attempts,coalesce(e.lease_expires_at>clock_timestamp(),false),
    e.last_problem,e.received_at,e.processed_at,e.invoice_id,
    (select count(*) from public.admin_notifications n where n.stripe_event_id=e.event_id and n.stripe_email_state='review'),
    (select count(*) from public.admin_notifications n where n.stripe_event_id=e.event_id and n.stripe_email_state='failed')
    from public.stripe_webhook_events e order by (e.processed_at is null) desc,e.received_at desc limit 100;
end; $$;
revoke all on function public.get_stripe_webhook_recovery() from public,anon,service_role;
grant execute on function public.get_stripe_webhook_recovery() to authenticated;
notify pgrst,'reload schema';
