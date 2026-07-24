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

  select *
  into target_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;

  if target_invoice.status = 'void' then
    raise exception 'Restore the invoice before restoring its payment.' using errcode = '23514';
  end if;

  select *
  into target_payment
  from public.payments p
  where p.id = p_payment_id
    and p.invoice_id = p_invoice_id
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
  where p.invoice_id = target_invoice.id
    and p.status = 'succeeded';

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
    when paid_principal > 0 then 'partially_paid'
    when target_invoice.status = 'draft' then 'draft'
    when target_invoice.status = 'overdue'
      or (target_invoice.due_at is not null and target_invoice.due_at < now()) then 'overdue'
    else 'sent'
  end;

  update public.invoices i
  set balance_due_cents = new_balance,
      paid_at = case when new_balance = 0 then coalesce(i.paid_at, now()) else null end,
      status = new_status
  where i.id = target_invoice.id;

  insert into public.activity_log (
    actor_user_id,
    subject_type,
    subject_id,
    event_type,
    metadata_json
  )
  values (
    caller_id,
    'invoice',
    target_invoice.id,
    'manual_payment_restored',
    jsonb_build_object(
      'payment_id', target_payment.id,
      'amount_cents', target_payment.amount_cents
    )
  );
end;
$$;

revoke all on function public.restore_cancelled_manual_invoice_payment(uuid, uuid)
  from public, anon;
grant execute on function public.restore_cancelled_manual_invoice_payment(uuid, uuid)
  to authenticated, service_role;
