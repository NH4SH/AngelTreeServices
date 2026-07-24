create or replace function public.restore_voided_invoice(
  p_invoice_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_invoice public.invoices%rowtype;
  paid_principal integer;
  restored_status text;
  new_balance integer;
begin
  if caller_id is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may restore voided invoices.' using errcode = '42501';
  end if;

  select *
  into target_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;

  if target_invoice.status <> 'void' then
    raise exception 'Only a voided invoice can be restored.' using errcode = '23505';
  end if;

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

  new_balance := greatest(0, target_invoice.total_cents - paid_principal);
  restored_status := case
    when new_balance = 0 then 'paid'
    when paid_principal > 0 then 'partially_paid'
    when target_invoice.due_at is not null and target_invoice.due_at < now() then 'overdue'
    when target_invoice.sent_at is not null then 'sent'
    else 'draft'
  end;

  update public.invoices i
  set balance_due_cents = new_balance,
      paid_at = case
        when new_balance = 0 then coalesce(i.paid_at, now())
        else null
      end,
      status = restored_status
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
    'invoice_unvoided',
    jsonb_build_object(
      'balance_due_cents', new_balance,
      'restored_status', restored_status
    )
  );

  return restored_status;
end;
$$;

revoke all on function public.restore_voided_invoice(uuid)
  from public, anon;
grant execute on function public.restore_voided_invoice(uuid)
  to authenticated, service_role;
