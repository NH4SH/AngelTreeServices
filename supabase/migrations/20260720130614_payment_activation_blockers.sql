-- Payment activation hardening. Payments remain feature-flagged off; this
-- migration only strengthens reservation and reconciliation behavior.

alter table public.invoice_checkout_sessions
  add column if not exists processing_expires_at timestamptz;

drop index if exists public.invoice_checkout_sessions_one_active_invoice_key;
create unique index invoice_checkout_sessions_one_active_invoice_key
  on public.invoice_checkout_sessions(invoice_id)
  where status in ('creating', 'open', 'processing');

create index if not exists invoice_checkout_sessions_stale_card_idx
  on public.invoice_checkout_sessions(processing_expires_at, invoice_id)
  where payment_channel = 'card' and status in ('creating', 'open', 'processing');

comment on column public.invoice_checkout_sessions.processing_expires_at is
  'Local deadline for retrying an abandoned card authentication attempt. Stripe status is checked before expiry.';

alter table public.payments
  add column if not exists provider_dispute_id text,
  add column if not exists disputed_gross_cents integer not null default 0,
  add column if not exists disputed_principal_cents integer not null default 0,
  add column if not exists disputed_surcharge_cents integer not null default 0,
  add column if not exists dispute_event_created_at timestamptz,
  add column if not exists dispute_closed_at timestamptz,
  add column if not exists dispute_principal_restored_at timestamptz;

alter table public.payments
  drop constraint if exists payments_disputed_gross_valid,
  drop constraint if exists payments_disputed_principal_valid,
  drop constraint if exists payments_disputed_surcharge_valid;

alter table public.payments
  add constraint payments_disputed_gross_valid check (
    disputed_gross_cents >= 0 and disputed_gross_cents <= total_collected_cents
  ),
  add constraint payments_disputed_principal_valid check (
    disputed_principal_cents >= 0 and disputed_principal_cents <= amount_cents
  ),
  add constraint payments_disputed_surcharge_valid check (
    disputed_surcharge_cents >= 0 and disputed_surcharge_cents <= surcharge_cents
  );

create unique index if not exists payments_stripe_dispute_id_key
  on public.payments(provider_dispute_id)
  where provider = 'stripe' and provider_dispute_id is not null;

comment on column public.payments.disputed_principal_cents is
  'Invoice-principal portion of the disputed gross amount. It reduces paid principal only when dispute_status is lost.';
comment on column public.payments.disputed_surcharge_cents is
  'Surcharge portion of the disputed gross amount; never restored as invoice principal.';

create or replace function public.reconcile_stripe_dispute(
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
  should_ignore boolean;
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
    -- The webhook route converts this into a retryable response. Its event-ledger
    -- claim is released so a success event can create the payment before retry.
    raise exception 'Stripe dispute arrived before its payment record.' using errcode = 'P0002';
  end if;

  prior_status := target.dispute_status;
  should_ignore :=
    (prior_status in ('won', 'lost') and prior_status is distinct from p_dispute_status)
    or (
      target.dispute_event_created_at is not null
      and p_event_created_at < target.dispute_event_created_at
    );

  if should_ignore then
    return query select target.id, target.invoice_id, false, false;
    return;
  end if;

  bounded_gross := greatest(0, least(p_disputed_gross_cents, target.total_collected_cents));
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

revoke all on function public.reconcile_stripe_dispute(text, text, text, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reconcile_stripe_dispute(text, text, text, integer, text, timestamptz)
  to service_role;
