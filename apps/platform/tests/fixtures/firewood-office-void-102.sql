-- Exact retained actual102 function definitions. Source metadata SHA256: 045c60d55b4a8287b6202766e428676ddc6b77dab9b627a411eaf52f27aa8be3

-- Fixture only: no production installation. Functions are not success stubs.

create table app_private.invoice_void_leases(invoice_id uuid primary key references public.invoices(id)on delete cascade,token uuid not null,actor_user_id uuid not null,expires_at timestamptz not null,finalizing boolean not null default false,purpose text not null default'void'check(purpose in('void','review','restore')));
alter table app_private.invoice_void_leases enable row level security;revoke all on app_private.invoice_void_leases from public,anon,authenticated,service_role;
create table public.customer_communications(id uuid primary key default gen_random_uuid(),invoice_id uuid references public.invoices(id),status text,cancelled_at timestamptz,last_error text,processing_started_at timestamptz,skip_reason text);

-- app_private.guard_invoice_collection definition SHA256 deaaa52c2066c7045339a5c7aefdf62b68d565bb19e4d9ccc46172e35b445531

CREATE OR REPLACE FUNCTION app_private.guard_invoice_collection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function app_private.guard_invoice_collection() from public,anon,authenticated,service_role;

-- app_private.guard_invoice_initial_state definition SHA256 3d649edae9c2a698da49fc0e381c80f97ba59aeaaf676bdfb9652a0c90ec2622

CREATE OR REPLACE FUNCTION app_private.guard_invoice_initial_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status = 'void' then
    raise exception 'Create an invoice before using the invoice void workflow.' using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function app_private.guard_invoice_initial_state() from public,anon,authenticated,service_role;

-- app_private.guard_invoice_void_status definition SHA256 78402dde29237949a4067e77d139a3a0b71acbea68699278e653b6463815ae3e

CREATE OR REPLACE FUNCTION app_private.guard_invoice_void_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function app_private.guard_invoice_void_status() from public,anon,authenticated,service_role;

-- app_private.guard_locked_invoice_lines definition SHA256 6e01534cd2d6e362c94066cceb6234a3b3a442e55c0d3d83bb3db4c6d177b1a6

CREATE OR REPLACE FUNCTION app_private.guard_locked_invoice_lines()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function app_private.guard_locked_invoice_lines() from public,anon,authenticated,service_role;

-- public.begin_invoice_void definition SHA256 8dfe8cbfd1efa3a316473b36d6012e685cc84b2a3f1c9b89536f228e389743c5

CREATE OR REPLACE FUNCTION public.begin_invoice_void(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function public.begin_invoice_void(p_invoice_id uuid) from public,anon,authenticated,service_role;

grant execute on function public.begin_invoice_void(p_invoice_id uuid)to authenticated;

-- public.finalize_invoice_void definition SHA256 a37614a72898b675638dcb2745c58151d6fcaca4996bd68cacd06a31e96db9c3

CREATE OR REPLACE FUNCTION public.finalize_invoice_void(p_invoice_id uuid, p_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function public.finalize_invoice_void(p_invoice_id uuid, p_token uuid) from public,anon,authenticated,service_role;

grant execute on function public.finalize_invoice_void(p_invoice_id uuid, p_token uuid)to authenticated;

-- public.release_invoice_void definition SHA256 ada353b34c63accb2cdf92a2e901866f233f638a041b727e00d3fa0b7d3c940d

CREATE OR REPLACE FUNCTION public.release_invoice_void(p_invoice_id uuid, p_token uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not app_private.has_platform_admin_role() then
    raise exception 'Only an owner or admin may release invoice void leases.' using errcode = '42501';
  end if;
  perform 1 from public.invoices where id = p_invoice_id for update;
  delete from app_private.invoice_void_leases where invoice_id = p_invoice_id and token = p_token and actor_user_id = auth.uid();
end;
$function$;

revoke all on function public.release_invoice_void(p_invoice_id uuid, p_token uuid) from public,anon,authenticated,service_role;

grant execute on function public.release_invoice_void(p_invoice_id uuid, p_token uuid)to authenticated;

create trigger invoice_collection_payments before insert or update on public.payments for each row execute function app_private.guard_invoice_collection();
create trigger invoice_collection_checkouts before insert or update on public.invoice_checkout_sessions for each row execute function app_private.guard_invoice_collection();
create trigger invoice_void_status_gate before update on public.invoices for each row execute function app_private.guard_invoice_void_status();
create trigger invoice_initial_state_gate before insert on public.invoices for each row execute function app_private.guard_invoice_initial_state();
create trigger invoice_locked_lines_gate before insert or update or delete on public.invoice_line_items for each row execute function app_private.guard_locked_invoice_lines();
