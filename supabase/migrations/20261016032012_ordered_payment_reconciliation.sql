-- PR07: ordered provider observations, authoritative refund objects and stable
-- manual attempts. No historical money is rewritten at migration time.
create table app_private.stripe_invoice_observations (
  invoice_id uuid primary key references public.invoices(id) on delete restrict,
  revision bigint not null default 1,
  event_id text not null references public.stripe_webhook_events(event_id) on delete restrict,
  owner_token uuid not null,
  snapshot_token uuid not null
);
alter table app_private.stripe_invoice_observations enable row level security;
revoke all on app_private.stripe_invoice_observations from public,anon,authenticated,service_role;
create index stripe_observation_event_idx on app_private.stripe_invoice_observations(event_id);

create table app_private.stripe_refund_observations (
  refund_id text primary key,
  payment_id uuid not null references public.payments(id) on delete restrict,
  amount_cents integer not null check(amount_cents>0),
  currency text not null,
  status text not null check(status in ('pending','requires_action','succeeded','failed','canceled')),
  provider_created_at timestamptz not null,
  observed_at timestamptz not null default clock_timestamp(),
  event_id text not null references public.stripe_webhook_events(event_id) on delete restrict
);
alter table app_private.stripe_refund_observations enable row level security;
revoke all on app_private.stripe_refund_observations from public,anon,authenticated,service_role;
create index stripe_refund_payment_idx on app_private.stripe_refund_observations(payment_id);
create index stripe_refund_event_idx on app_private.stripe_refund_observations(event_id);

-- Issue BEFORE the authoritative provider reads. A later observation fences an
-- earlier caller even if that caller's receipt still has a live lease. No HTTP
-- request runs while holding a database transaction or invoice lock.
create function public.prepare_stripe_webhook_snapshot(p_event_id text,p_token uuid,p_evidence jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare receipt public.stripe_webhook_events%rowtype; target uuid; token uuid:=gen_random_uuid(); matches integer;
begin
  if current_setting('role',true)<>'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
  receipt:=app_private.lock_stripe_webhook(p_event_id,p_token);
  if receipt.phase<>'pending' then raise exception 'Financial work is already applied.' using errcode='23514'; end if;
  if p_evidence->>'operation' in ('refund','dispute') then
    select count(*),min(p.invoice_id::text)::uuid into matches,target from public.payments p
      where p.provider='stripe' and p.provider_charge_id=p_evidence->>'charge_id';
    if matches<>1 then raise exception 'Stripe charge binding is missing or ambiguous.' using errcode='23514'; end if;
  else
    select c.invoice_id into target from public.invoice_checkout_sessions c where c.id=(p_evidence->>'reservation_id')::uuid;
  end if;
  if target is null then raise exception 'Invoice binding is unavailable.' using errcode='P0002'; end if;
  perform 1 from public.invoices where id=target for update;
  if not found then raise exception 'Invoice not found.' using errcode='P0002'; end if;
  perform app_private.lock_stripe_webhook(p_event_id,p_token);
  insert into app_private.stripe_invoice_observations as prior(invoice_id,event_id,owner_token,snapshot_token)
    values(target,p_event_id,p_token,token) on conflict(invoice_id) do update set
    revision=prior.revision+1,event_id=excluded.event_id,owner_token=excluded.owner_token,snapshot_token=excluded.snapshot_token;
  return token;
end; $$;
revoke all on function public.prepare_stripe_webhook_snapshot(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_stripe_webhook_snapshot(text,uuid,jsonb) to service_role;

create function app_private.assert_stripe_snapshot(p_invoice uuid,p_event text,p_owner uuid,p_snapshot uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if p_snapshot is null or not exists(select 1 from app_private.stripe_invoice_observations o
    where o.invoice_id=p_invoice and o.event_id=p_event and o.owner_token=p_owner and o.snapshot_token=p_snapshot) then
    raise exception 'A newer provider observation superseded this attempt. Retry with fresh evidence.' using errcode='40001',detail='provider_snapshot_superseded';
  end if;
end; $$;
revoke all on function app_private.assert_stripe_snapshot(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;

-- Called inside the invoice-first, owned webhook transaction. The caller supplies
-- every page of current refund objects. Missing previously observed IDs cannot
-- erase money; failed/canceled/pending statuses are not completed refunds.
create function app_private.apply_stripe_refund_snapshot(p_payment uuid,p_event text,p_refunds jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare payment public.payments%rowtype; item jsonb; prior app_private.stripe_refund_observations%rowtype;
  gross bigint; principal integer; surcharge integer; fingerprint text;
begin
  select * into payment from public.payments where id=p_payment;
  if not found or payment.provider<>'stripe' or payment.status not in ('succeeded','refunded') then
    raise exception 'Received Stripe payment is not ready.' using errcode='23514'; end if;
  if p_refunds is null or jsonb_typeof(p_refunds)<>'array' or jsonb_array_length(p_refunds)>1000 then
    raise exception 'A complete refund observation is required.' using errcode='22023'; end if;
  if exists(select 1 from app_private.stripe_refund_observations r where r.payment_id=p_payment
    and not exists(select 1 from jsonb_array_elements(p_refunds) i where i->>'id'=r.refund_id)) then
    raise exception 'Refund observation omitted a known refund.' using errcode='23514'; end if;
  if (select count(*)<>count(distinct i->>'id') from jsonb_array_elements(p_refunds) i) then
    raise exception 'Duplicate refund identifiers.' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_refunds) loop
    if item->>'id' is null or item->>'id' !~ '^(re|pyr)_[A-Za-z0-9_]+$'
      or item->>'charge_id' is distinct from payment.provider_charge_id
      or (item->>'intent_id' is not null and item->>'intent_id' is distinct from payment.provider_payment_id)
      or item->>'currency' is distinct from lower(payment.currency)
      or item->>'status' is null or item->>'status' not in ('pending','requires_action','succeeded','failed','canceled')
      or (item->>'amount_cents')::numeric is null or (item->>'amount_cents')::numeric<>(item->>'amount_cents')::integer
      or (item->>'amount_cents')::integer<=0 or (item->>'amount_cents')::integer>payment.total_collected_cents
      or (item->>'created_at')::timestamptz is null then
      raise exception 'Refund binding or amount is invalid.' using errcode='23514'; end if;
    select * into prior from app_private.stripe_refund_observations where refund_id=item->>'id';
    if found and (prior.payment_id<>p_payment or prior.amount_cents<>(item->>'amount_cents')::integer
      or prior.currency<>item->>'currency' or prior.provider_created_at<>(item->>'created_at')::timestamptz) then
      raise exception 'Refund identity changed.' using errcode='23514'; end if;
    insert into app_private.stripe_refund_observations(refund_id,payment_id,amount_cents,currency,status,provider_created_at,event_id)
      values(item->>'id',p_payment,(item->>'amount_cents')::integer,item->>'currency',item->>'status',(item->>'created_at')::timestamptz,p_event)
      on conflict(refund_id) do update set status=excluded.status,observed_at=clock_timestamp(),event_id=excluded.event_id;
  end loop;
  select coalesce(sum(r.amount_cents) filter(where r.status='succeeded'),0),
    md5(coalesce(string_agg(r.refund_id||':'||r.status,',' order by r.refund_id),'')) into gross,fingerprint
    from app_private.stripe_refund_observations r where r.payment_id=p_payment;
  if gross>payment.total_collected_cents then raise exception 'Refund total exceeds collected money.' using errcode='23514'; end if;
  principal:=least(payment.amount_cents,floor((gross::numeric*payment.amount_cents+floor(payment.total_collected_cents::numeric/2))/payment.total_collected_cents)::integer);
  surcharge:=least(payment.surcharge_cents,gross::integer-principal);
  update public.payments set refunded_principal_cents=principal,refunded_surcharge_cents=surcharge,
    refunded_at=case when gross>0 then coalesce(refunded_at,clock_timestamp()) else refunded_at end,
    status=case when gross=total_collected_cents then 'refunded' else 'succeeded' end where id=p_payment;
  return jsonb_build_object('gross',gross,'fingerprint',fingerprint);
end; $$;
revoke all on function app_private.apply_stripe_refund_snapshot(uuid,text,jsonb) from public,anon,authenticated,service_role;

create table app_private.manual_payment_requests (
  request_id uuid primary key,
  actor_id uuid not null,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  request_data jsonb,
  state text not null check(state in ('recorded','abandoned')),
  check((state='recorded' and payment_id is not null and request_data is not null) or (state='abandoned' and payment_id is null)),
  created_at timestamptz not null default clock_timestamp()
);
alter table app_private.manual_payment_requests enable row level security;
revoke all on app_private.manual_payment_requests from public,anon,authenticated,service_role;
create index manual_request_invoice_idx on app_private.manual_payment_requests(invoice_id);
create index manual_request_payment_idx on app_private.manual_payment_requests(payment_id);

create function public.record_manual_invoice_payment_request(p_request_id uuid,p_invoice_id uuid,p_amount_cents integer,
  p_paid_at timestamptz,p_method text,p_reference text default null,p_notes text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); target public.invoices%rowtype; prior app_private.manual_payment_requests%rowtype;
  payload jsonb; payment uuid; balance bigint; result jsonb;
begin
  if caller is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an active owner or admin may record manual payments.' using errcode='42501'; end if;
  if p_request_id is null or p_invoice_id is null or p_amount_cents is null or p_amount_cents<=0 or p_paid_at is null
    or p_method is null or p_method not in ('check','cash','ach','other') then
    raise exception 'A request ID, invoice, positive amount, date and supported method are required.' using errcode='22023'; end if;
  payload:=jsonb_build_object('amount',p_amount_cents,'paid_at',p_paid_at,'method',p_method,
    'reference',nullif(left(btrim(p_reference),160),''),'notes',nullif(left(btrim(p_notes),1000),''));
  select * into target from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode='P0002'; end if;
  select * into prior from app_private.manual_payment_requests where request_id=p_request_id for update;
  if found then
    if prior.state='abandoned' then raise exception 'This payment attempt was closed without recording money.' using errcode='23514'; end if;
    if prior.actor_id<>caller or prior.invoice_id<>p_invoice_id or prior.request_data<>payload then
      raise exception 'This payment attempt belongs to different details. Recover the original attempt before recording another.' using errcode='23514'; end if;
    return jsonb_build_object('payment_id',prior.payment_id,'replayed',true,'payment_status',(select status from public.payments where id=prior.payment_id),
      'balance_due_cents',target.balance_due_cents);
  end if;
  balance:=greatest(0,target.total_cents::bigint-app_private.invoice_paid_principal(target.id));
  if target.status='void' or balance<=0 or p_amount_cents>balance then
    raise exception 'This payment exceeds the current balance or the invoice cannot accept payment.' using errcode='23514'; end if;
  insert into public.payments(invoice_id,customer_id,organization_id,amount_cents,total_collected_cents,currency,
    payment_method,provider,status,paid_at,succeeded_at,reference,notes)
    values(target.id,target.customer_id,target.organization_id,p_amount_cents,p_amount_cents,'usd',p_method,'manual','succeeded',p_paid_at,p_paid_at,
      payload->>'reference',payload->>'notes') returning id into payment;
  insert into app_private.manual_payment_requests(request_id,actor_id,invoice_id,payment_id,request_data,state)
    values(p_request_id,caller,target.id,payment,payload,'recorded');
  result:=public.reconcile_invoice_balance(target.id);
  if (result->>'balance_due_cents')::integer=0 then
    update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),processing_started_at=null,
      skip_reason='Invoice was paid in full.' where invoice_id=target.id and status='pending';
  end if;
  insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
    values(caller,'invoice',target.id,'manual_payment_recorded',jsonb_build_object('payment_id',payment,'amount_cents',p_amount_cents,'method',p_method,'request_id',p_request_id));
  return result||jsonb_build_object('payment_id',payment,'payment_status','succeeded','replayed',false);
end; $$;
revoke all on function public.record_manual_invoice_payment_request(uuid,uuid,integer,timestamptz,text,text,text) from public,anon,service_role;
grant execute on function public.record_manual_invoice_payment_request(uuid,uuid,integer,timestamptz,text,text,text) to authenticated;
-- Old clients must supply a stable request identity through the new command.
-- Never synthesize a key from amount/reference: identical installments are valid.
revoke all on function public.record_manual_invoice_payment(uuid,integer,timestamptz,text,text,text) from authenticated,service_role;

-- Resolve uncertainty before allowing edited details/new identities. If no
-- payment committed, retain a tombstone so a delayed original request cannot
-- arrive later and create a second payment after the user changes the form.
create function public.resolve_manual_invoice_payment_request(p_request_id uuid,p_invoice_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior app_private.manual_payment_requests%rowtype;
begin
  if auth.uid() is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an active owner or admin may recover a payment attempt.' using errcode='42501'; end if;
  if p_request_id is null or p_invoice_id is null then raise exception 'Payment attempt is required.' using errcode='22023'; end if;
  perform 1 from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode='P0002'; end if;
  select * into prior from app_private.manual_payment_requests where request_id=p_request_id for update;
  if found then
    if prior.actor_id<>auth.uid() or prior.invoice_id<>p_invoice_id then raise exception 'Payment attempt belongs to another record.' using errcode='42501'; end if;
    return jsonb_build_object('state',prior.state,'payment_id',prior.payment_id,
      'payment_status',(select status from public.payments where id=prior.payment_id));
  end if;
  insert into app_private.manual_payment_requests(request_id,actor_id,invoice_id,state) values(p_request_id,auth.uid(),p_invoice_id,'abandoned');
  return jsonb_build_object('state','abandoned','payment_id',null);
end; $$;
revoke all on function public.resolve_manual_invoice_payment_request(uuid,uuid) from public,anon,service_role;
grant execute on function public.resolve_manual_invoice_payment_request(uuid,uuid) to authenticated;

create or replace function public.reconcile_invoice_balance(p_invoice_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
$$;
revoke all on function public.reconcile_invoice_balance(uuid) from public, anon;
grant execute on function public.reconcile_invoice_balance(uuid) to authenticated, service_role;


-- DERIVED COMMANDS: preserve existing provider allocation/audit and correction contracts.
create function app_private.apply_stripe_dispute_snapshot(
  p_charge_id text,
  p_dispute_id text,
  p_dispute_status text,
  p_disputed_gross_cents integer,
  p_event_type text,
  p_event_created_at timestamptz
)
returns table (
  payment_id uuid,
  invoice_id uuid,
  changed boolean,
  invoice_balance_changed boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.payments%rowtype;
  bounded_gross integer;
  principal_part integer;
  surcharge_part integer;
  prior_status text;

begin
  if p_charge_id is null or p_dispute_id is null then
    raise exception 'Stripe dispute is missing provider identifiers.' using errcode = '22023';
  end if;
  if p_dispute_status not in (
    'warning_needs_response', 'warning_under_review', 'warning_closed',
    'needs_response', 'under_review', 'won', 'lost'
  ) then
    raise exception 'Stripe dispute status is not supported.' using errcode = '22023';
  end if;

  select payment.*
  into target
  from public.payments as payment
  where payment.provider = 'stripe'
    and payment.provider_charge_id = p_charge_id
  for update;

  if not found then
    -- Leave the receipt recoverable until its payment is available.
    raise exception 'Stripe dispute arrived before its payment record.' using errcode = 'P0002';
  end if;

  prior_status := target.dispute_status;
  if p_disputed_gross_cents is null or p_disputed_gross_cents<0 or p_disputed_gross_cents>target.total_collected_cents
    or (target.provider_dispute_id is not null and target.provider_dispute_id<>p_dispute_id) then
    raise exception 'Dispute amount or identity changed.' using errcode='23514'; end if;
  bounded_gross := p_disputed_gross_cents;
  if bounded_gross = target.total_collected_cents then
    principal_part := target.amount_cents;
    surcharge_part := target.surcharge_cents;
  else
    principal_part := least(
      target.amount_cents,
      floor(
        (bounded_gross::numeric * target.amount_cents + floor(target.total_collected_cents::numeric / 2))
        / target.total_collected_cents
      )::integer
    );
    surcharge_part := least(target.surcharge_cents, bounded_gross - principal_part);
  end if;

  if target.provider_dispute_id = p_dispute_id
    and target.dispute_status = p_dispute_status
    and target.disputed_gross_cents = bounded_gross
    and target.disputed_principal_cents = principal_part
    and target.disputed_surcharge_cents = surcharge_part then
    return query select target.id, target.invoice_id, false, false;
    return;
  end if;

  update public.payments as payment
  set
    provider_dispute_id = p_dispute_id,
    dispute_status = p_dispute_status,
    disputed_at = coalesce(payment.disputed_at, now()),
    disputed_gross_cents = bounded_gross,
    disputed_principal_cents = principal_part,
    disputed_surcharge_cents = surcharge_part,
    dispute_event_created_at = greatest(
      coalesce(payment.dispute_event_created_at, p_event_created_at),
      p_event_created_at
    ),
    dispute_closed_at = case
      when p_dispute_status in ('won', 'lost', 'warning_closed') then coalesce(payment.dispute_closed_at, now())
      else payment.dispute_closed_at
    end,
    -- A lost dispute restores only principal through balance reconciliation.
    -- This timestamp is audit metadata; the derived balance prevents double application.
    dispute_principal_restored_at = case
      when p_dispute_status = 'lost' then coalesce(payment.dispute_principal_restored_at, now())
      else payment.dispute_principal_restored_at
    end
  where payment.id = target.id;

  insert into public.activity_log (
    subject_type,
    subject_id,
    event_type,
    metadata_json
  ) values (
    'invoice',
    target.invoice_id,
    case
      when p_dispute_status = 'lost' then 'stripe_dispute_lost'
      when p_dispute_status = 'won' then 'stripe_dispute_won'
      when p_event_type = 'charge.dispute.created' then 'stripe_dispute_opened'
      else 'stripe_dispute_updated'
    end,
    jsonb_build_object(
      'dispute_id', p_dispute_id,
      'dispute_status', p_dispute_status,
      'payment_id', target.id,
      'disputed_gross_cents', bounded_gross,
      'disputed_principal_cents', principal_part,
      'disputed_surcharge_cents', surcharge_part
    )
  );

  return query select
    target.id,
    target.invoice_id,
    true,
    coalesce(prior_status = 'lost', false) is distinct from (p_dispute_status = 'lost');
end;
$$;

revoke all on function app_private.apply_stripe_dispute_snapshot(text,text,text,integer,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.reconcile_stripe_dispute(text,text,text,integer,text,timestamptz) from service_role;

create or replace function public.apply_stripe_webhook(p_event_id text,p_token uuid,p_evidence jsonb) returns jsonb
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
  refund_snapshot jsonb;
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
    perform app_private.assert_stripe_snapshot(invoice.id,p_event_id,p_token,(p_evidence->>'snapshot_token')::uuid);
    select * into payment from public.payments where id=payment.id for update;
    if (operation='refund' and receipt.event_object_id is distinct from coalesce(p_evidence->>'refund_id',p_evidence->>'charge_id'))
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
    perform app_private.assert_stripe_snapshot(invoice.id,p_event_id,p_token,(p_evidence->>'snapshot_token')::uuid);
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

  -- Complete current refund objects were fetched after the observation fence.
  if operation in ('refund','succeeded') then
    if operation='refund' and (payment.total_collected_cents is distinct from (p_evidence->>'amount_cents')::integer
      or lower(payment.currency) is distinct from lower(p_evidence->>'currency')) then raise exception 'Refund binding mismatch.' using errcode='23514'; end if;
    refund_snapshot:=app_private.apply_stripe_refund_snapshot(payment.id,p_event_id,p_evidence->'refunds');
    refund_gross:=(refund_snapshot->>'gross')::integer;
    select * into payment from public.payments where id=payment.id;
  end if;
  if operation='dispute' then
    perform app_private.apply_stripe_dispute_snapshot(p_evidence->>'charge_id',p_evidence->>'dispute_id',
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
    perform app_private.stripe_webhook_activity(p_event_id,'stripe-refund-snapshot:'||payment.id::text||':'||(refund_snapshot->>'fingerprint'),'customer_payment_refunded',invoice.id,
      'Refund status updated','Stripe refund status and the invoice balance were reconciled.',jsonb_build_object('refunded_cents',refund_gross));
  elsif operation='dispute' then
    -- One office update per authoritative dispute status, independent of which
    -- event type delivered it. Preserve PR06's already committed legacy effects.
    if not exists(select 1 from app_private.stripe_webhook_effects e where e.effect_key in (
      'stripe-dispute:'||(p_evidence->>'dispute_id')||':charge.dispute.created:'||(p_evidence->>'dispute_status'),
      'stripe-dispute:'||(p_evidence->>'dispute_id')||':charge.dispute.closed:'||(p_evidence->>'dispute_status'))) then
      perform app_private.stripe_webhook_activity(p_event_id,'stripe-dispute:'||(p_evidence->>'dispute_id')||':'||(p_evidence->>'dispute_status'),
        'customer_payment_dispute_updated',invoice.id,'Payment dispute updated','A Stripe payment dispute was reconciled.',jsonb_build_object('dispute_status',p_evidence->>'dispute_status'));
    end if;
  end if;
  perform app_private.assert_stripe_snapshot(invoice.id,p_event_id,p_token,(p_evidence->>'snapshot_token')::uuid);
  perform app_private.lock_stripe_webhook(p_event_id,p_token);
  update public.stripe_webhook_events set phase='effects_ready',invoice_id=invoice.id,financial_applied_at=clock_timestamp() where event_id=p_event_id;
  return jsonb_build_object('invoice_id',invoice.id);
end; $$;
revoke all on function public.apply_stripe_webhook(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_stripe_webhook(text,uuid,jsonb) to service_role;


create or replace function public.cancel_manual_invoice_payment(
  p_invoice_id uuid,
  p_payment_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_invoice public.invoices%rowtype;
  target_payment public.payments%rowtype;
begin
  if caller_id is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may correct manual payments.' using errcode = '42501';
  end if;

  select * into target_invoice from public.invoices i where i.id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;

  select * into target_payment
  from public.payments p
  where p.id = p_payment_id and p.invoice_id = p_invoice_id
  for update;
  if not found then raise exception 'Payment not found.' using errcode = 'P0002'; end if;
  if target_payment.provider <> 'manual' then
    raise exception 'Provider payments cannot be changed through the manual correction workflow.' using errcode = '42501';
  end if;
  if target_payment.status <> 'succeeded' then
    raise exception 'This manual payment has already been corrected.' using errcode = '23505';
  end if;

  update public.payments p set status = 'cancelled' where p.id = target_payment.id;

  perform public.reconcile_invoice_balance(target_invoice.id);

  insert into public.activity_log (actor_user_id, subject_type, subject_id, event_type, metadata_json)
  values (caller_id, 'invoice', target_invoice.id, 'manual_payment_cancelled',
    jsonb_build_object(
      'payment_id', target_payment.id,
      'amount_cents', target_payment.amount_cents,
      'reason', nullif(pg_catalog.left(pg_catalog.btrim(p_reason), 600), '')
    ));
end;
$$;

create or replace function public.restore_cancelled_manual_invoice_payment(
  p_invoice_id uuid,
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_invoice public.invoices%rowtype;
  target_payment public.payments%rowtype;
  paid_principal bigint;
  restored_principal integer;
begin
  if caller_id is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may restore manual payments.' using errcode = '42501';
  end if;

  select * into target_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;
  if target_invoice.status = 'void' then
    raise exception 'Restore the invoice before restoring its payment.' using errcode = '23514';
  end if;

  select * into target_payment
  from public.payments p
  where p.id = p_payment_id and p.invoice_id = p_invoice_id
  for update;

  if not found then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;
  if target_payment.provider <> 'manual' then
    raise exception 'Provider payments cannot be changed through the manual correction workflow.' using errcode = '42501';
  end if;
  if target_payment.status <> 'cancelled' then
    raise exception 'Only a cancelled manual payment can be restored.' using errcode = '23505';
  end if;

  restored_principal := greatest(
    0,
    target_payment.amount_cents
      - least(target_payment.amount_cents, target_payment.refunded_principal_cents)
      - case
          when target_payment.dispute_status = 'lost'
            then least(target_payment.amount_cents, target_payment.disputed_principal_cents)
          else 0
        end
  );

  paid_principal := app_private.invoice_paid_principal(target_invoice.id);

  if paid_principal + restored_principal > target_invoice.total_cents then
    raise exception 'Restoring this payment would exceed the current invoice total.' using errcode = '23514';
  end if;

  update public.payments p
  set status = 'succeeded'
  where p.id = target_payment.id;

  perform public.reconcile_invoice_balance(target_invoice.id);

  insert into public.activity_log (actor_user_id, subject_type, subject_id, event_type, metadata_json)
  values (
    caller_id,
    'invoice',
    target_invoice.id,
    'manual_payment_restored',
    jsonb_build_object('payment_id', target_payment.id, 'amount_cents', target_payment.amount_cents)
  );
end;
$$;


create or replace function public.begin_stripe_notification_email(p_event_id text,p_token uuid,p_notification uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare notification public.admin_notifications%rowtype; recipient public.profiles%rowtype;
begin
  if current_setting('role',true)<>'service_role' then raise exception 'Server only.' using errcode='42501'; end if;
  perform app_private.lock_stripe_webhook(p_event_id,p_token);
  select * into notification from public.admin_notifications where id=p_notification and stripe_event_id=p_event_id for update;
  if not found then
    -- Recipient/Auth deletion may cascade an inbox row after it was read. There
    -- is then nothing to send. A real row owned by another receipt is still a
    -- binding error, never permission to submit that other notification.
    if exists(select 1 from public.admin_notifications where id=p_notification) then
      raise exception 'Notification belongs to another receipt.' using errcode='23514'; end if;
    return jsonb_build_object('status','gone');
  end if;
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


notify pgrst,'reload schema';
