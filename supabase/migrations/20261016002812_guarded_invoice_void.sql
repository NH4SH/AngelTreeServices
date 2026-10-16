-- PR03: guarded invoice void and payment-checkout review.
-- Remote provider requests never run inside a database transaction.
-- UPDATE triggers fail fast on a contested parent to avoid child -> parent
-- deadlocks with existing invoice-first manual correction commands. Retry the
-- complete operation; never treat lock_not_available as successful evidence.
create table app_private.invoice_void_leases (
  invoice_id uuid primary key references public.invoices(id) on delete cascade,
  token uuid not null,
  actor_user_id uuid not null,
  expires_at timestamptz not null,
  finalizing boolean not null default false,
  purpose text not null default 'void' check (purpose in ('void', 'review', 'restore'))
);
alter table app_private.invoice_void_leases enable row level security;
revoke all on app_private.invoice_void_leases from public, anon, authenticated, service_role;

alter table public.invoice_checkout_sessions add column void_reconciled_token uuid;

-- Every reservation writer (ACH, card, webhook, cleanup) takes the same parent
-- row lock. The lease blocks new collection; existing payment evidence remains
-- writable until finalization so a webhook can make the final check fail closed.
create function app_private.guard_invoice_collection() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  invoice_status text;
  target_invoice public.invoices%rowtype;
  lease_active boolean;
  review_metadata_only boolean;
begin
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    raise exception 'Payment invoice binding is immutable.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    select * into target_invoice from public.invoices i where i.id = new.invoice_id for update nowait;
  else
    select * into target_invoice from public.invoices i where i.id = new.invoice_id for update;
  end if;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  invoice_status := target_invoice.status;
  if tg_table_name = 'payments' then
  if invoice_status = 'void' and (new.status in ('pending', 'succeeded', 'refunded')
      or new.refunded_principal_cents > 0 or new.refunded_surcharge_cents > 0 or new.dispute_status is not null or new.disputed_gross_cents > 0) then
      -- Never discard real provider money. Preserve the evidence and flag the
      -- conflict for staff; new collection remains blocked on the void invoice.
      insert into public.activity_log(actor_user_id, subject_type, subject_id, event_type, metadata_json, idempotency_key)
        values(null, 'invoice', new.invoice_id, 'invoice_void_payment_conflict',
          jsonb_build_object('payment_id', new.id, 'payment_status', new.status),
          'void-payment-conflict:' || new.id::text || ':' || new.status)
        on conflict (idempotency_key) where idempotency_key is not null do nothing;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.void_reconciled_token is not distinct from old.void_reconciled_token
    and (new.status is distinct from old.status or new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
      or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
      or new.submitted_at is distinct from old.submitted_at or new.total_charge_cents is distinct from old.total_charge_cents
      or new.currency is distinct from old.currency or new.payment_channel is distinct from old.payment_channel) then
    new.void_reconciled_token := null;
  end if;
  if new.void_reconciled_token is not null and (tg_op = 'INSERT' or new.void_reconciled_token is distinct from old.void_reconciled_token)
    and not exists (select 1 from app_private.invoice_void_leases l where l.invoice_id = new.invoice_id
      and l.token = new.void_reconciled_token and l.purpose in ('void', 'review') and l.expires_at > clock_timestamp()) then
    raise exception 'Checkout review ownership changed. Retry.' using errcode = '55P03';
  end if;
  if invoice_status = 'void' and (new.status in ('creating', 'open') or (tg_op = 'INSERT' and new.status in ('processing', 'completed'))) then
    raise exception 'Void invoices cannot collect payment.' using errcode = '23514';
  end if;
  select exists (select 1 from app_private.invoice_void_leases l
    where l.invoice_id = new.invoice_id and l.expires_at > clock_timestamp()) into lease_active;
  -- A review may save a positively verified missing provider reference without
  -- creating/reopening collection. Amount, party, status and all other fields
  -- must remain unchanged. Only the server can write this table.
  review_metadata_only := tg_op = 'UPDATE' and new.status = old.status
    and (to_jsonb(new) - array['stripe_checkout_session_id','stripe_payment_intent_id','updated_at'])
      = (to_jsonb(old) - array['stripe_checkout_session_id','stripe_payment_intent_id','updated_at'])
    and exists(select 1 from app_private.invoice_void_leases l where l.invoice_id = new.invoice_id
      and l.purpose = 'review' and l.expires_at > clock_timestamp());
  if new.status in ('creating', 'open') and not review_metadata_only then
    if invoice_status not in ('sent', 'overdue', 'partially_paid') or lease_active then
      raise exception 'Invoice collection is unavailable.' using errcode = '23514';
    end if;
    if new.customer_id is distinct from target_invoice.customer_id
      or new.organization_id is distinct from target_invoice.organization_id
      or new.invoice_principal_cents <> greatest(0, target_invoice.total_cents - (
        select coalesce(sum(greatest(0, p.amount_cents - greatest(0, p.refunded_principal_cents)
          - case when p.dispute_status = 'lost' then greatest(0, p.disputed_principal_cents) else 0 end)), 0)
        from public.payments p where p.invoice_id = new.invoice_id and p.status = 'succeeded'))
      or exists (select 1 from public.payments p where p.invoice_id = new.invoice_id and p.status = 'pending') then
      raise exception 'Invoice balance or billing party changed. Review before paying.' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and old.status not in ('creating', 'open') then
      raise exception 'A closed reservation cannot be reopened.' using errcode = '23514';
    end if;
  elsif tg_op = 'INSERT' and new.status in ('processing', 'completed') and lease_active then
    raise exception 'Invoice collection is unavailable.' using errcode = '23514';
  end if;
  if new.status in ('expired', 'cancelled') and new.void_reconciled_token is not null then
    insert into public.activity_log(actor_user_id, actor_type, subject_type, subject_id, event_type, metadata_json, idempotency_key)
      select l.actor_user_id, 'staff', 'invoice', new.invoice_id, 'invoice_checkout_reviewed',
        jsonb_build_object('checkout_id', new.id, 'checkout_status', new.status),
        'checkout-reviewed:' || new.id::text || ':' || new.status
      from app_private.invoice_void_leases l where l.invoice_id = new.invoice_id
        and l.token = new.void_reconciled_token and l.purpose = 'review' and l.expires_at > clock_timestamp()
      on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_invoice_collection() from public, anon, authenticated, service_role;
create trigger invoice_checkout_void_gate before insert or update on public.invoice_checkout_sessions
for each row execute function app_private.guard_invoice_collection();
create trigger invoice_payment_void_gate before insert or update on public.payments
for each row execute function app_private.guard_invoice_collection();

-- Direct status updates cannot bypass checkout reconciliation and its audit.
create function app_private.guard_invoice_void_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'void' and new.status <> 'void' and not exists (
    select 1 from app_private.invoice_void_leases l where l.invoice_id = old.id and l.purpose = 'restore'
      and l.actor_user_id = auth.uid() and l.expires_at > clock_timestamp()
  ) then
    raise exception 'Use the authenticated invoice restore workflow.' using errcode = '42501';
  end if;
  if (old.status in ('paid', 'void') or exists (
    select 1 from app_private.invoice_void_leases l where l.invoice_id = old.id and l.expires_at > clock_timestamp()
  )) and (new.total_cents is distinct from old.total_cents or new.subtotal_cents is distinct from old.subtotal_cents
    or new.tax_cents is distinct from old.tax_cents or new.customer_id is distinct from old.customer_id
    or new.organization_id is distinct from old.organization_id or new.job_id is distinct from old.job_id
    or new.quote_id is distinct from old.quote_id) then
    raise exception 'This invoice is locked for financial changes.' using errcode = '23514';
  end if;
  if new.status = 'void' and old.status is distinct from 'void' then
    if not exists (select 1 from app_private.invoice_void_leases l where l.invoice_id = new.id
      and l.finalizing and l.purpose = 'void' and l.actor_user_id = auth.uid() and l.expires_at > clock_timestamp()) then
      raise exception 'Use the authenticated invoice void workflow.' using errcode = '42501';
    end if;
    if exists (select 1 from public.payments p where p.invoice_id = new.id and (p.status in ('pending', 'succeeded', 'refunded') or p.refunded_principal_cents > 0 or p.refunded_surcharge_cents > 0 or p.dispute_status is not null or p.disputed_gross_cents > 0))
      or exists (select 1 from public.invoice_checkout_sessions s where s.invoice_id = new.id and s.status in ('creating', 'open', 'processing', 'completed')) then
      raise exception 'Invoice has payment activity requiring reconciliation.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_invoice_void_status() from public, anon, authenticated, service_role;
create trigger invoice_void_status_gate before update on public.invoices
for each row execute function app_private.guard_invoice_void_status();

create function public.begin_invoice_void(p_invoice_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.invoices%rowtype;
  lease_token uuid := gen_random_uuid();
begin
  if auth.uid() is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may void invoices.' using errcode = '42501';
  end if;
  select * into target from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  if target.status = 'void' then return jsonb_build_object('already_void', true); end if;
  if target.status not in ('draft', 'sent', 'overdue') then
    raise exception 'Invoice status does not permit voiding.' using errcode = '23514';
  end if;
  -- A successful record blocks even if refunded/disputed: void is not the
  -- workflow for rewriting an invoice with a money history.
  if exists (select 1 from public.payments p where p.invoice_id = target.id and (p.status in ('pending', 'succeeded', 'refunded') or p.refunded_principal_cents > 0 or p.refunded_surcharge_cents > 0 or p.dispute_status is not null or p.disputed_gross_cents > 0))
    or exists (select 1 from public.invoice_checkout_sessions s where s.invoice_id = target.id and s.status in ('creating', 'processing', 'completed')) then
    raise exception 'Invoice has payment activity requiring reconciliation.' using errcode = '23514';
  end if;
  if exists (select 1 from app_private.invoice_void_leases l where l.invoice_id = target.id and l.expires_at > clock_timestamp()) then
    raise exception 'Invoice void is already in progress.' using errcode = '55P03';
  end if;
  insert into app_private.invoice_void_leases(invoice_id, token, actor_user_id, expires_at)
    values(target.id, lease_token, auth.uid(), clock_timestamp() + interval '2 minutes')
  on conflict (invoice_id) do update set token = excluded.token, actor_user_id = excluded.actor_user_id,
    expires_at = excluded.expires_at, finalizing = false, purpose = 'void';
  return jsonb_build_object('already_void', false, 'token', lease_token);
end;
$$;

create function public.finalize_invoice_void(p_invoice_id uuid, p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  target public.invoices%rowtype;
begin
  if auth.uid() is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may void invoices.' using errcode = '42501';
  end if;
  select * into target from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  if target.status = 'void' then return true; end if;
  if not exists(select 1 from app_private.invoice_void_leases l where l.invoice_id = target.id
    and l.token = p_token and l.purpose = 'void' and l.actor_user_id = auth.uid() and l.expires_at > clock_timestamp()) then
    raise exception 'Invoice void lease expired or changed. Retry.' using errcode = '55P03';
  end if;
  if target.status not in ('draft', 'sent', 'overdue') then
    raise exception 'Invoice status changed. Reload before voiding.' using errcode = '23514';
  end if;
  if exists (select 1 from public.payments p where p.invoice_id = target.id and (p.status in ('pending', 'succeeded', 'refunded') or p.refunded_principal_cents > 0 or p.refunded_surcharge_cents > 0 or p.dispute_status is not null or p.disputed_gross_cents > 0))
    or exists (select 1 from public.invoice_checkout_sessions s where s.invoice_id = target.id and s.status in ('creating', 'open', 'processing', 'completed')) then
    raise exception 'Invoice has payment activity requiring reconciliation.' using errcode = '23514';
  end if;
  if exists (select 1 from public.invoice_checkout_sessions s where s.invoice_id = target.id
    and s.void_reconciled_token is distinct from p_token) then
    raise exception 'Every checkout must be reconciled under this void lease.' using errcode = '23514';
  end if;
  update app_private.invoice_void_leases set finalizing = true where invoice_id = target.id and token = p_token;
  update public.invoices set status = 'void' where id = target.id;
  update public.customer_communications set status = 'cancelled', cancelled_at = clock_timestamp(),
    last_error = null, processing_started_at = null, skip_reason = 'Invoice was voided.'
    where invoice_id = target.id and status = 'pending';
  insert into public.activity_log(actor_user_id, actor_type, subject_type, subject_id, event_type, metadata_json)
    values(auth.uid(), 'staff', 'invoice', target.id, 'invoice_voided', '{}'::jsonb);
  delete from app_private.invoice_void_leases where invoice_id = target.id and token = p_token;
  return true;
end;
$$;

create function public.release_invoice_void(p_invoice_id uuid, p_token uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may release invoice void leases.' using errcode = '42501';
  end if;
  perform 1 from public.invoices where id = p_invoice_id for update;
  delete from app_private.invoice_void_leases where invoice_id = p_invoice_id and token = p_token and actor_user_id = auth.uid();
end;
$$;
revoke all on function public.begin_invoice_void(uuid) from public, anon, service_role;
revoke all on function public.finalize_invoice_void(uuid, uuid) from public, anon, service_role;
revoke all on function public.release_invoice_void(uuid, uuid) from public, anon, service_role;
grant execute on function public.begin_invoice_void(uuid) to authenticated;
grant execute on function public.finalize_invoice_void(uuid, uuid) to authenticated;
grant execute on function public.release_invoice_void(uuid, uuid) to authenticated;

-- Guard direct creation of void headers too; duplicate/generation commands still
-- create drafts. State changes require the audited commands below.
create function app_private.guard_invoice_initial_state() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'void' then
    raise exception 'Create an invoice before using the invoice void workflow.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_invoice_initial_state() from public, anon, authenticated, service_role;
create trigger invoice_initial_void_gate before insert on public.invoices
for each row execute function app_private.guard_invoice_initial_state();

-- Lines cannot be moved between invoices or changed on a paid/void document.
-- A parent lock also fences concurrent line editing during a void operation.
create function app_private.guard_locked_invoice_lines() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target_id uuid;
  target_status text;
begin
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    raise exception 'Invoice line ownership cannot change.' using errcode = '23514';
  end if;
  target_id := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  select status into target_status from public.invoices where id = target_id for update nowait;
  if target_status in ('paid', 'void') or exists (
    select 1 from app_private.invoice_void_leases l where l.invoice_id = target_id and l.expires_at > clock_timestamp()
  ) then
    raise exception 'This invoice is locked for financial changes.' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.guard_locked_invoice_lines() from public, anon, authenticated, service_role;
create trigger invoice_locked_line_gate before insert or update or delete on public.invoice_line_items
for each row execute function app_private.guard_locked_invoice_lines();

-- Review can close verified unpaid remote objects even when a legacy reservation
-- says creating/processing. It cannot finalize a void or erase payment evidence.
create function public.begin_invoice_checkout_review(p_invoice_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  lease_token uuid := gen_random_uuid();
begin
  if auth.uid() is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may review payment checkouts.' using errcode = '42501';
  end if;
  perform 1 from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  if exists(select 1 from app_private.invoice_void_leases l where l.invoice_id = p_invoice_id and l.expires_at > clock_timestamp()) then
    raise exception 'An invoice operation is already in progress. Retry shortly.' using errcode = '55P03';
  end if;
  insert into app_private.invoice_void_leases(invoice_id, token, actor_user_id, expires_at, purpose)
    values(p_invoice_id, lease_token, auth.uid(), clock_timestamp() + interval '2 minutes', 'review')
    on conflict (invoice_id) do update set token = excluded.token, actor_user_id = excluded.actor_user_id,
      expires_at = excluded.expires_at, purpose = 'review', finalizing = false;
  return jsonb_build_object('token', lease_token);
end;
$$;

create function public.check_invoice_checkout_lease(p_invoice_id uuid, p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may review payment checkouts.' using errcode = '42501';
  end if;
  if not exists(select 1 from app_private.invoice_void_leases l where l.invoice_id = p_invoice_id
    and l.token = p_token and l.actor_user_id = auth.uid() and l.purpose in ('void', 'review')
    and l.expires_at > clock_timestamp()) then
    raise exception 'Invoice operation expired or ownership changed. Retry.' using errcode = '55P03';
  end if;
  return true;
end;
$$;

create function public.get_invoice_checkout_review(p_invoice_id uuid)
returns table(id uuid, payment_channel text, status text, provider_reference text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may review payment checkouts.' using errcode = '42501';
  end if;
  return query select s.id, s.payment_channel, s.status,
    coalesce(s.stripe_checkout_session_id, s.stripe_payment_intent_id)
    from public.invoice_checkout_sessions s where s.invoice_id = p_invoice_id order by s.created_at desc;
end;
$$;
revoke all on function public.begin_invoice_checkout_review(uuid) from public, anon, service_role;
revoke all on function public.check_invoice_checkout_lease(uuid, uuid) from public, anon, service_role;
revoke all on function public.get_invoice_checkout_review(uuid) from public, anon, service_role;
grant execute on function public.begin_invoice_checkout_review(uuid) to authenticated;
grant execute on function public.check_invoice_checkout_lease(uuid, uuid) to authenticated;
grant execute on function public.get_invoice_checkout_review(uuid) to authenticated;

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

  insert into app_private.invoice_void_leases(invoice_id, token, actor_user_id, expires_at, purpose)
    values(target_invoice.id, gen_random_uuid(), caller_id, clock_timestamp() + interval '2 minutes', 'restore')
    on conflict (invoice_id) do update set token = excluded.token, actor_user_id = excluded.actor_user_id,
      expires_at = excluded.expires_at, purpose = 'restore', finalizing = false;

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

  delete from app_private.invoice_void_leases where invoice_id = target_invoice.id and purpose = 'restore';
  return restored_status;
end;
$$;


comment on table app_private.invoice_void_leases is 'Owned invoice void/review fences. Remote uncertainty is reconciled, never cleared by age alone.';
