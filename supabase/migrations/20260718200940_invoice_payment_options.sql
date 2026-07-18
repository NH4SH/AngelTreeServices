-- Invoice payment-method choices and provider accounting metadata.
-- Customer browsers use token-validated server routes; no public table access
-- or direct invoice mutation is introduced here.

alter table public.invoices
  add column if not exists payment_preference text,
  add column if not exists payment_preference_selected_at timestamptz;

alter table public.invoices
  drop constraint if exists invoices_payment_preference_check;
alter table public.invoices
  add constraint invoices_payment_preference_check check (
    payment_preference is null
    or payment_preference in ('ach', 'card', 'cash_check_pickup', 'check_mail')
  );

alter table public.payments
  add column if not exists surcharge_cents integer not null default 0,
  add column if not exists total_collected_cents integer,
  add column if not exists card_funding_type text,
  add column if not exists card_brand text,
  add column if not exists stripe_fee_cents integer,
  add column if not exists net_received_cents integer,
  add column if not exists refunded_principal_cents integer not null default 0,
  add column if not exists refunded_surcharge_cents integer not null default 0;

update public.payments
set total_collected_cents = amount_cents + surcharge_cents
where total_collected_cents is null;

alter table public.payments
  alter column total_collected_cents set not null,
  drop constraint if exists payments_surcharge_nonnegative,
  drop constraint if exists payments_total_collected_positive,
  drop constraint if exists payments_card_funding_type_check,
  drop constraint if exists payments_stripe_fee_nonnegative,
  drop constraint if exists payments_net_received_nonnegative,
  drop constraint if exists payments_refunded_principal_valid,
  drop constraint if exists payments_refunded_surcharge_valid;

alter table public.payments
  add constraint payments_surcharge_nonnegative check (surcharge_cents >= 0),
  add constraint payments_total_collected_positive check (total_collected_cents > 0),
  add constraint payments_card_funding_type_check check (
    card_funding_type is null or card_funding_type in ('credit', 'debit', 'prepaid', 'unknown')
  ),
  add constraint payments_stripe_fee_nonnegative check (stripe_fee_cents is null or stripe_fee_cents >= 0),
  add constraint payments_net_received_nonnegative check (net_received_cents is null or net_received_cents >= 0),
  add constraint payments_refunded_principal_valid check (
    refunded_principal_cents >= 0 and refunded_principal_cents <= amount_cents
  ),
  add constraint payments_refunded_surcharge_valid check (
    refunded_surcharge_cents >= 0 and refunded_surcharge_cents <= surcharge_cents
  );

alter table public.invoice_checkout_sessions
  add column if not exists invoice_principal_cents integer,
  add column if not exists surcharge_cents integer not null default 0,
  add column if not exists total_charge_cents integer,
  add column if not exists payment_channel text;

update public.invoice_checkout_sessions
set
  invoice_principal_cents = amount_cents,
  total_charge_cents = amount_cents + surcharge_cents,
  payment_channel = coalesce(payment_channel, 'card')
where invoice_principal_cents is null
   or total_charge_cents is null
   or payment_channel is null;

alter table public.invoice_checkout_sessions
  alter column invoice_principal_cents set not null,
  alter column total_charge_cents set not null,
  alter column payment_channel set not null,
  drop constraint if exists invoice_checkout_sessions_status_check,
  drop constraint if exists invoice_checkout_sessions_principal_positive,
  drop constraint if exists invoice_checkout_sessions_surcharge_nonnegative,
  drop constraint if exists invoice_checkout_sessions_total_matches,
  drop constraint if exists invoice_checkout_sessions_payment_channel_check;

alter table public.invoice_checkout_sessions
  add constraint invoice_checkout_sessions_status_check check (
    status in ('creating', 'open', 'processing', 'completed', 'expired', 'failed', 'cancelled')
  ),
  add constraint invoice_checkout_sessions_principal_positive check (invoice_principal_cents > 0),
  add constraint invoice_checkout_sessions_surcharge_nonnegative check (surcharge_cents >= 0),
  add constraint invoice_checkout_sessions_total_matches check (
    total_charge_cents = invoice_principal_cents + surcharge_cents
  ),
  add constraint invoice_checkout_sessions_payment_channel_check check (
    payment_channel in ('ach', 'card')
  );

alter table public.email_events
  drop constraint if exists email_events_email_type_check;
alter table public.email_events
  add constraint email_events_email_type_check check (email_type in (
    'access_request_admin_notice', 'access_approved', 'access_rejected', 'lead_internal_notice',
    'quote', 'invoice', 'change_order', 'password_reset_admin_triggered',
    'estimate_confirmation', 'estimate_reminder', 'quote_follow_up',
    'work_confirmation', 'work_reminder', 'invoice_payment_reminder',
    'overdue_invoice_reminder', 'payment_confirmation', 'payment_preference_notice'
  ));

create or replace function public.record_invoice_payment_preference(
  p_token_hash text,
  p_preference text
)
returns table (invoice_id uuid, preference_changed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.invoices%rowtype;
  paid_principal_cents bigint;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid invoice portal token.' using errcode = '22023';
  end if;

  if p_preference not in ('ach', 'card', 'cash_check_pickup', 'check_mail') then
    raise exception 'Unsupported payment preference.' using errcode = '22023';
  end if;

  select invoice.*
  into target
  from public.invoice_portal_tokens as token
  join public.invoices as invoice on invoice.id = token.invoice_id
  where token.token_hash = p_token_hash
    and token.revoked_at is null
    and (token.expires_at is null or token.expires_at > pg_catalog.now())
  for update of invoice;

  if target.id is null then
    raise exception 'Invoice link is unavailable.' using errcode = 'P0002';
  end if;

  if target.status not in ('sent', 'partially_paid', 'overdue') then
    raise exception 'Invoice is not available for payment.' using errcode = 'P0001';
  end if;

  select coalesce(pg_catalog.sum(payment.amount_cents), 0)
  into paid_principal_cents
  from public.payments as payment
  where payment.invoice_id = target.id
    and payment.status = 'succeeded';

  if target.total_cents - paid_principal_cents <= 0 then
    raise exception 'Invoice no longer has a balance due.' using errcode = 'P0001';
  end if;

  if target.payment_preference is not distinct from p_preference then
    return query select target.id, false;
    return;
  end if;

  update public.invoices as invoice
  set
    payment_preference = p_preference,
    payment_preference_selected_at = pg_catalog.now()
  where invoice.id = target.id;

  insert into public.activity_log (
    actor_user_id,
    subject_type,
    subject_id,
    event_type,
    metadata_json
  ) values (
    null,
    'invoice',
    target.id,
    'customer_selected_payment_preference',
    pg_catalog.jsonb_build_object(
      'invoice_number', target.invoice_number,
      'payment_preference', p_preference
    )
  );

  return query select target.id, true;
end;
$$;

comment on column public.payments.amount_cents is
  'Invoice principal credited by this payment; excludes any card surcharge.';
comment on column public.payments.total_collected_cents is
  'Total provider collection including surcharge, before refunds.';
comment on function public.record_invoice_payment_preference(text, text) is
  'Atomically records a payable invoice preference through an active portal token.';

revoke all on function public.record_invoice_payment_preference(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_invoice_payment_preference(text, text)
  to service_role;
