-- Security remediation for F-01 and F-03.
-- Browser roles retain the reads required by the application, but privileged
-- role and payment mutations are performed only by narrowly authorized RPCs.

create table if not exists public.role_assignment_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  target_user_id uuid not null references public.profiles(id) on delete restrict,
  previous_roles text[] not null default '{}',
  assigned_roles text[] not null default '{}',
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists role_assignment_events_target_created_idx
  on public.role_assignment_events(target_user_id, created_at desc);

alter table public.role_assignment_events enable row level security;

drop policy if exists "Platform admins read role assignment events" on public.role_assignment_events;
create policy "Platform admins read role assignment events"
  on public.role_assignment_events
  for select
  to authenticated
  using (app_private.has_platform_admin_role());

revoke all on table public.role_assignment_events from public, anon, authenticated;
grant select on table public.role_assignment_events to authenticated;
grant all on table public.role_assignment_events to service_role;

drop policy if exists "Staff can manage roles" on public.roles;
drop policy if exists "Staff can manage user roles" on public.user_roles;

drop policy if exists "Platform admins can read roles" on public.roles;
create policy "Platform admins can read roles"
  on public.roles
  for select
  to authenticated
  using (app_private.has_platform_admin_role());

drop policy if exists "Platform admins can read role assignments" on public.user_roles;
create policy "Platform admins can read role assignments"
  on public.user_roles
  for select
  to authenticated
  using (app_private.has_platform_admin_role());

revoke all on table public.roles from public, anon, authenticated;
revoke all on table public.user_roles from public, anon, authenticated;
grant select on table public.roles to authenticated;
grant select on table public.user_roles to authenticated;
grant all on table public.roles to service_role;
grant all on table public.user_roles to service_role;

create or replace function public.replace_platform_user_roles(
  p_target_user_id uuid,
  p_role_names text[],
  p_reason text default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_is_owner boolean;
  caller_is_admin boolean;
  target_is_owner boolean;
  canonical_roles text[];
  prior_roles text[];
  missing_roles text[];
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_target_user_id is null or p_target_user_id = caller_id then
    raise exception 'Users cannot change their own platform roles.' using errcode = '42501';
  end if;

  select
    coalesce(bool_or(r.name = 'owner'), false),
    coalesce(bool_or(r.name = 'admin'), false)
  into caller_is_owner, caller_is_admin
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = caller_id;

  if not caller_is_owner and not caller_is_admin then
    raise exception 'Only an owner or admin may manage platform roles.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_target_user_id) then
    raise exception 'The selected platform account does not exist.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::text[])
  into canonical_roles
  from unnest(coalesce(p_role_names, '{}'::text[])) as requested(value)
  where value = any(array['owner', 'admin', 'payroll_admin', 'estimator', 'crew', 'customer', 'property_manager']);

  if cardinality(canonical_roles) = 0 then
    raise exception 'At least one valid platform role is required.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::text[])
  into missing_roles
  from unnest(coalesce(p_role_names, '{}'::text[])) as requested(value)
  where not (value = any(array['owner', 'admin', 'payroll_admin', 'estimator', 'crew', 'customer', 'property_manager']));

  if cardinality(missing_roles) > 0 then
    raise exception 'One or more requested platform roles are not supported.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('platform-role-management'));

  select
    coalesce(array_agg(r.name order by r.name), '{}'::text[]),
    coalesce(bool_or(r.name = 'owner'), false)
  into prior_roles, target_is_owner
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_target_user_id;

  if not caller_is_owner and (target_is_owner or 'owner' = any(canonical_roles)) then
    raise exception 'Admins cannot assign or modify the owner role.' using errcode = '42501';
  end if;

  if target_is_owner and not ('owner' = any(canonical_roles)) and not exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where r.name = 'owner'
      and ur.user_id <> p_target_user_id
  ) then
    raise exception 'The final owner role cannot be removed.' using errcode = '23514';
  end if;

  delete from public.user_roles ur
  using public.roles r
  where ur.role_id = r.id
    and ur.user_id = p_target_user_id
    and not (r.name = any(canonical_roles));

  insert into public.user_roles (user_id, role_id)
  select p_target_user_id, r.id
  from public.roles r
  where r.name = any(canonical_roles)
  on conflict (user_id, role_id) do nothing;

  if prior_roles is distinct from canonical_roles then
    insert into public.role_assignment_events (
      actor_user_id,
      target_user_id,
      previous_roles,
      assigned_roles,
      reason
    ) values (
      caller_id,
      p_target_user_id,
      prior_roles,
      canonical_roles,
      nullif(pg_catalog.left(pg_catalog.btrim(p_reason), 600), '')
    );
  end if;

  return canonical_roles;
end;
$$;

revoke all on function public.replace_platform_user_roles(uuid, text[], text) from public, anon;
grant execute on function public.replace_platform_user_roles(uuid, text[], text) to authenticated, service_role;

drop policy if exists "Staff can manage payments" on public.payments;
drop policy if exists "Financial staff read payments" on public.payments;
create policy "Financial staff read payments"
  on public.payments
  for select
  to authenticated
  using (app_private.has_staff_role());

revoke all on table public.payments from public, anon, authenticated;
grant select on table public.payments to authenticated;
grant all on table public.payments to service_role;

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
    when paid_principal > 0 then 'partially_paid'
    when target.status = 'draft' then 'draft'
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
    when paid_principal > 0 then 'partially_paid'
    when target_invoice.due_at is not null and target_invoice.due_at < now() then 'overdue'
    when target_invoice.status = 'draft' then 'draft'
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

revoke all on function public.record_manual_invoice_payment(uuid, integer, timestamptz, text, text, text)
  from public, anon;
revoke all on function public.cancel_manual_invoice_payment(uuid, uuid, text)
  from public, anon;
grant execute on function public.record_manual_invoice_payment(uuid, integer, timestamptz, text, text, text)
  to authenticated, service_role;
grant execute on function public.cancel_manual_invoice_payment(uuid, uuid, text)
  to authenticated, service_role;

-- Public access requests are accepted only through the rate-limited server
-- action. Requesters retain read access to their own request after sign-in.
drop policy if exists "Public can submit employee access requests" on public.employee_access_requests;
revoke insert on table public.employee_access_requests from anon, authenticated;
