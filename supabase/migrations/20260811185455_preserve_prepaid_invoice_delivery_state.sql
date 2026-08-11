-- Preserve delivery state when owners/admins record or correct payments before
-- an invoice is sent. Financial state and delivery state remain independent:
-- unsent partial prepayments stay draft, while full payment is always paid.

create or replace function public.record_manual_invoice_payment(
  p_invoice_id uuid,
  p_amount_cents integer,
  p_paid_at timestamptz,
  p_method text,
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target public.invoices%rowtype;
  payment_id uuid;
  paid_principal integer;
  new_balance integer;
  new_status text;
begin
  if caller_id is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may record manual payments.' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_paid_at is null then
    raise exception 'A positive payment amount and valid payment date are required.' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('check', 'cash', 'ach', 'other') then
    raise exception 'The manual payment method is not supported.' using errcode = '22023';
  end if;

  select * into target
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;
  if target.status in ('paid', 'void') or target.balance_due_cents <= 0 then
    raise exception 'This invoice cannot accept a manual payment.' using errcode = '23514';
  end if;
  if p_amount_cents > target.balance_due_cents then
    raise exception 'Manual payment exceeds the invoice balance.' using errcode = '23514';
  end if;

  insert into public.payments (
    invoice_id, customer_id, organization_id, amount_cents, total_collected_cents,
    currency, payment_method, provider, status, paid_at, succeeded_at, reference, notes
  ) values (
    target.id, target.customer_id, target.organization_id, p_amount_cents, p_amount_cents,
    'usd', p_method, 'manual', 'succeeded', p_paid_at, p_paid_at,
    nullif(pg_catalog.left(pg_catalog.btrim(p_reference), 160), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(p_notes), 1000), '')
  ) returning id into payment_id;

  select coalesce(sum(greatest(0, p.amount_cents
    - least(p.amount_cents, p.refunded_principal_cents)
    - case when p.dispute_status = 'lost' then least(p.amount_cents, p.disputed_principal_cents) else 0 end)), 0)::integer
  into paid_principal
  from public.payments p
  where p.invoice_id = target.id and p.status = 'succeeded';

  new_balance := greatest(0, target.total_cents - paid_principal);
  new_status := case
    when new_balance = 0 then 'paid'
    when target.sent_at is null and target.status in ('draft', 'paid') then 'draft'
    when paid_principal > 0 then 'partially_paid'
    when target.status = 'overdue' or (target.due_at is not null and target.due_at < now()) then 'overdue'
    else 'sent'
  end;

  update public.invoices i
  set balance_due_cents = new_balance,
      paid_at = case when new_balance = 0 then coalesce(i.paid_at, now()) else null end,
      status = new_status
  where i.id = target.id;

  insert into public.activity_log (actor_user_id, subject_type, subject_id, event_type, metadata_json)
  values (caller_id, 'invoice', target.id, 'manual_payment_recorded',
    jsonb_build_object('payment_id', payment_id, 'amount_cents', p_amount_cents, 'method', p_method));

  return payment_id;
end;
$$;

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
  paid_principal integer;
  new_balance integer;
  new_status text;
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

  select coalesce(sum(greatest(0, p.amount_cents
    - least(p.amount_cents, p.refunded_principal_cents)
    - case when p.dispute_status = 'lost' then least(p.amount_cents, p.disputed_principal_cents) else 0 end)), 0)::integer
  into paid_principal
  from public.payments p
  where p.invoice_id = target_invoice.id and p.status = 'succeeded';

  new_balance := greatest(0, target_invoice.total_cents - paid_principal);
  new_status := case
    when target_invoice.status = 'void' then 'void'
    when new_balance = 0 then 'paid'
    when target_invoice.sent_at is null and target_invoice.status in ('draft', 'paid') then 'draft'
    when paid_principal > 0 then 'partially_paid'
    when target_invoice.status = 'overdue'
      or (target_invoice.due_at is not null and target_invoice.due_at < now()) then 'overdue'
    else 'sent'
  end;

  update public.invoices i
  set balance_due_cents = new_balance,
      paid_at = case when new_balance = 0 then coalesce(i.paid_at, now()) else null end,
      status = new_status
  where i.id = target_invoice.id;

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
  paid_principal integer;
  restored_principal integer;
  new_balance integer;
  new_status text;
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

  select coalesce(sum(greatest(
    0,
    p.amount_cents
      - least(p.amount_cents, p.refunded_principal_cents)
      - case
          when p.dispute_status = 'lost'
            then least(p.amount_cents, p.disputed_principal_cents)
          else 0
        end
  )), 0)::integer
  into paid_principal
  from public.payments p
  where p.invoice_id = target_invoice.id and p.status = 'succeeded';

  if paid_principal + restored_principal > target_invoice.total_cents then
    raise exception 'Restoring this payment would exceed the current invoice total.' using errcode = '23514';
  end if;

  update public.payments p
  set status = 'succeeded'
  where p.id = target_payment.id;

  paid_principal := paid_principal + restored_principal;
  new_balance := greatest(0, target_invoice.total_cents - paid_principal);
  new_status := case
    when new_balance = 0 then 'paid'
    when target_invoice.sent_at is null and target_invoice.status in ('draft', 'paid') then 'draft'
    when paid_principal > 0 then 'partially_paid'
    when target_invoice.status = 'overdue'
      or (target_invoice.due_at is not null and target_invoice.due_at < now()) then 'overdue'
    else 'sent'
  end;

  update public.invoices i
  set balance_due_cents = new_balance,
      paid_at = case when new_balance = 0 then coalesce(i.paid_at, now()) else null end,
      status = new_status
  where i.id = target_invoice.id;

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

revoke all on function public.record_manual_invoice_payment(uuid, integer, timestamptz, text, text, text)
  from public, anon;
revoke all on function public.cancel_manual_invoice_payment(uuid, uuid, text)
  from public, anon;
revoke all on function public.restore_cancelled_manual_invoice_payment(uuid, uuid)
  from public, anon;
grant execute on function public.record_manual_invoice_payment(uuid, integer, timestamptz, text, text, text)
  to authenticated, service_role;
grant execute on function public.cancel_manual_invoice_payment(uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.restore_cancelled_manual_invoice_payment(uuid, uuid)
  to authenticated, service_role;

comment on function public.record_manual_invoice_payment(uuid, integer, timestamptz, text, text, text) is
  'Records an owner/admin manual invoice payment while preserving unsent draft delivery state.';
