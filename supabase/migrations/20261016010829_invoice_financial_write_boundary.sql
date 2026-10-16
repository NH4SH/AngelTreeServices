-- PR03 continuation: financial writes are commands, never staff table patches.
-- Existing PR02 live-access predicates and the guarded void/restore stay authoritative.
-- No historical invoice/payment data is rewritten by this migration.

create function app_private.invoice_paid_principal(p_invoice_id uuid) returns bigint
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(greatest(0::bigint, p.amount_cents::bigint
    - greatest(0, p.refunded_principal_cents)::bigint
    - case when p.dispute_status = 'lost' then greatest(0, p.disputed_principal_cents)::bigint else 0 end)), 0)::bigint
  from public.payments p where p.invoice_id = p_invoice_id and p.status = 'succeeded';
$$;
revoke all on function app_private.invoice_paid_principal(uuid) from public, anon, authenticated, service_role;

-- Match the existing delivery/payment state resolver, including unsent prepayments.
create function app_private.invoice_payment_status(p_status text, p_balance bigint, p_paid bigint,
  p_sent_at timestamptz, p_due_at timestamptz) returns text
language sql stable security invoker set search_path = '' as $$
  select case
    when p_status = 'void' then 'void'
    when p_balance = 0 then 'paid'
    when p_sent_at is null and p_status in ('draft', 'paid') then 'draft'
    when p_paid > 0 then 'partially_paid'
    when p_status = 'overdue' or p_due_at < now() then 'overdue'
    else 'sent' end;
$$;
revoke all on function app_private.invoice_payment_status(text,bigint,bigint,timestamptz,timestamptz) from public, anon, authenticated, service_role;

-- Called only by the whitelisted commands below. Never accept provenance or a
-- caller-provided line parent; those belong to the source/change-order workflows.
create function app_private.validate_invoice_lines(p_lines jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; quantity_value numeric; price_value bigint; amount_value bigint; subtotal bigint := 0;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 1000 then
    raise exception 'Provide a valid invoice line list.' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_lines) loop
    quantity_value := (item->>'quantity')::numeric;
    price_value := (item->>'unit_price_cents')::bigint;
    amount_value := (item->>'total_cents')::bigint;
    if jsonb_typeof(item) <> 'object' or nullif(btrim(item->>'name'), '') is null
      or quantity_value is null or quantity_value <= 0 or quantity_value > 99999999.99
      or quantity_value <> round(quantity_value, 2)
      or price_value is null or price_value < 0 or price_value > 2147483647
      or amount_value is null or amount_value <> round(quantity_value * price_value)
      or amount_value < 0 or amount_value > 2147483647
      or (item->>'unit_price_cents')::numeric <> price_value
      or (item->>'total_cents')::numeric <> amount_value then
      raise exception 'Review invoice line quantities and amounts.' using errcode = '22023';
    end if;
    subtotal := subtotal + amount_value;
  end loop;
  if subtotal > 2147483647 then raise exception 'Invoice total is too large.' using errcode = '22023'; end if;
  return subtotal::integer;
end;
$$;
revoke all on function app_private.validate_invoice_lines(jsonb) from public, anon, authenticated, service_role;

create function public.create_invoice_draft(p_header jsonb, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  header public.invoices%rowtype;
  new_id uuid;
  subtotal integer;
  tax integer;
begin
  if auth.uid() is null or not app_private.has_staff_role() then
    raise exception 'Only active staff may create invoices.' using errcode = '42501';
  end if;
  if p_header is null or jsonb_typeof(p_header) <> 'object' then
    raise exception 'Invoice details are required.' using errcode = '22023';
  end if;
  select * into header from jsonb_populate_record(null::public.invoices, p_header);
  subtotal := app_private.validate_invoice_lines(p_lines);
  tax := coalesce(header.tax_cents, 0);
  if tax < 0 or subtotal::bigint + tax > 2147483647 then
    raise exception 'Review the invoice tax and total.' using errcode = '22023';
  end if;
  if (header.customer_id is null) = (header.organization_id is null) then
    raise exception 'Choose one customer or organization.' using errcode = '22023';
  end if;
  if header.job_id is not null and not exists(select 1 from public.jobs j where j.id = header.job_id
    and j.customer_id is not distinct from header.customer_id and j.organization_id is not distinct from header.organization_id) then
    raise exception 'The work order belongs to another customer or organization.' using errcode = '23514';
  end if;
  if (header.recurring_service_plan_id is not null or header.recurring_occurrence_id is not null)
    and not exists(select 1 from public.jobs j where j.id = header.job_id
      and j.recurring_service_plan_id is not distinct from header.recurring_service_plan_id
      and j.recurring_occurrence_id is not distinct from header.recurring_occurrence_id) then
    raise exception 'Recurring service references must match the work order.' using errcode = '23514';
  end if;
  if header.quote_id is not null and not exists(select 1 from public.quotes q where q.id = header.quote_id
    and q.customer_id is not distinct from header.customer_id and q.organization_id is not distinct from header.organization_id
    and (q.job_id is null or q.job_id = header.job_id)) then
    raise exception 'The source quote does not match this invoice.' using errcode = '23514';
  end if;
  if header.service_location_id is not null and not exists(select 1 from public.service_locations l where l.id = header.service_location_id
    and l.customer_id is not distinct from header.customer_id and l.organization_id is not distinct from header.organization_id) then
    raise exception 'The service location belongs to another customer or organization.' using errcode = '23514';
  end if;
  if exists(select 1 from unnest(array[header.billing_contact_id,header.accounts_payable_contact_id]) c(id)
    where c.id is not null and not exists(select 1 from public.organization_contacts oc
      where oc.id = c.id and oc.organization_id = header.organization_id and oc.is_active)) then
    raise exception 'Choose an active billing contact for this organization.' using errcode = '23514';
  end if;
  -- Only these fields are copied. Status, balance, timestamps, identity and
  -- provenance supplied in p_header/p_lines cannot become financial authority.
  insert into public.invoices(job_id, quote_id, customer_id, organization_id, service_location_id,
    billing_contact_id, accounts_payable_contact_id, recurring_service_plan_id, recurring_occurrence_id,
    purchase_order_reference, payment_terms, invoice_number, due_at, status,
    subtotal_cents, tax_cents, total_cents, balance_due_cents)
  values(header.job_id, header.quote_id, header.customer_id, header.organization_id, header.service_location_id,
    header.billing_contact_id, header.accounts_payable_contact_id, header.recurring_service_plan_id, header.recurring_occurrence_id,
    header.purchase_order_reference, header.payment_terms, header.invoice_number, header.due_at, 'draft',
    subtotal, tax, subtotal + tax, subtotal + tax) returning id into new_id;
  insert into public.invoice_line_items(invoice_id,name,description,service_category_id,material_id,quantity,unit_price_cents,total_cents,sort_order)
    select new_id, item->>'name', item->>'description', (item->>'service_category_id')::uuid, (item->>'material_id')::uuid,
      (item->>'quantity')::numeric, (item->>'unit_price_cents')::integer, (item->>'total_cents')::integer, ordinal::integer - 1
    from jsonb_array_elements(p_lines) with ordinality lines(item,ordinal);
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
    values(auth.uid(),'staff','invoice',new_id,'invoice_created',jsonb_build_object('total_cents',subtotal + tax));
  return jsonb_build_object('id',new_id);
end;
$$;
revoke all on function public.create_invoice_draft(jsonb,jsonb) from public, anon, service_role;
grant execute on function public.create_invoice_draft(jsonb,jsonb) to authenticated;

create function public.save_invoice_details(p_invoice_id uuid, p_expected_updated_at timestamptz,
  p_due_at timestamptz, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.invoices%rowtype;
  subtotal integer;
  paid bigint;
  item jsonb;
  line_id uuid;
  retained uuid[] := '{}'::uuid[];
  saved_at timestamptz;
begin
  if auth.uid() is null or not app_private.has_staff_role() then
    raise exception 'Only active staff may edit invoices.' using errcode = '42501';
  end if;
  select * into target from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  if target.status in ('paid','void') then
    raise exception 'Paid and void invoices are locked from regular editing.' using errcode = '23514';
  end if;
  if p_expected_updated_at is null or target.updated_at is distinct from p_expected_updated_at then
    raise exception 'This invoice changed since you opened it. Reload before saving.' using errcode = '40001';
  end if;
  if exists(select 1 from app_private.invoice_void_leases l where l.invoice_id = target.id and l.expires_at > clock_timestamp())
    or exists(select 1 from public.invoice_checkout_sessions s where s.invoice_id = target.id and s.status in ('creating','open','processing'))
    or exists(select 1 from public.payments p where p.invoice_id = target.id and p.status = 'pending') then
    raise exception 'A payment checkout is in progress. Review it before changing invoice amounts.' using errcode = '23514';
  end if;
  subtotal := app_private.validate_invoice_lines(p_lines);
  if jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one invoice line before saving.' using errcode = '22023'; end if;
  paid := app_private.invoice_paid_principal(target.id);
  if subtotal < paid then
    raise exception 'Invoice total cannot be less than its recorded net payments.' using errcode = '23514';
  end if;
  -- All IDs must already belong to this invoice. Reject duplicates/foreign IDs
  -- before any write rather than silently treating them as new lines.
  for item in select value from jsonb_array_elements(p_lines) loop
    line_id := nullif(item->>'id','')::uuid;
    if line_id is not null then
      if line_id = any(retained) or not exists(select 1 from public.invoice_line_items l where l.id = line_id and l.invoice_id = target.id) then
        raise exception 'An invoice line changed or belongs to another invoice. Reload before saving.' using errcode = '23514';
      end if;
      retained := array_append(retained,line_id);
    end if;
  end loop;
  delete from public.invoice_line_items where invoice_id = target.id and not(id = any(retained));
  retained := '{}'::uuid[];
  for item in select value from jsonb_array_elements(p_lines) loop
    line_id := nullif(item->>'id','')::uuid;
    if line_id is null then
      insert into public.invoice_line_items(invoice_id,name,description,service_category_id,quantity,unit_price_cents,total_cents,sort_order)
        values(target.id,item->>'name',item->>'description',(item->>'service_category_id')::uuid,
          (item->>'quantity')::numeric,(item->>'unit_price_cents')::integer,(item->>'total_cents')::integer,cardinality(retained))
        returning id into line_id;
    else
      -- Keep material/source-change-order references and creation metadata.
      update public.invoice_line_items set name = item->>'name', description = item->>'description',
        service_category_id = (item->>'service_category_id')::uuid, quantity = (item->>'quantity')::numeric,
        unit_price_cents = (item->>'unit_price_cents')::integer, total_cents = (item->>'total_cents')::integer,
        sort_order = cardinality(retained) where id = line_id and invoice_id = target.id;
    end if;
    retained := array_append(retained,line_id);
  end loop;
  -- The existing editor sets tax to zero. Preserve that policy; compute every
  -- derived field here from the locked invoice and current successful ledger.
  update public.invoices set subtotal_cents = subtotal, tax_cents = 0, total_cents = subtotal,
    due_at = p_due_at, balance_due_cents = subtotal - paid,
    status = app_private.invoice_payment_status(target.status,subtotal - paid,paid,target.sent_at,p_due_at),
    paid_at = case when subtotal = paid then coalesce(target.paid_at,clock_timestamp()) else null end
    where id = target.id returning updated_at into saved_at;
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,
    organization_id,action_category,record_label,summary,destination_path,changes_json,metadata_json)
    values(auth.uid(),'staff','invoice',target.id,'invoice_updated',target.organization_id,'invoices',
      coalesce(target.invoice_number,'Invoice'),'Invoice details and line items were updated.',
      '/admin/invoices/' || target.id::text,
      jsonb_build_object('due_at',jsonb_build_object('before',target.due_at,'after',p_due_at),
        'total_cents',jsonb_build_object('before',target.total_cents,'after',subtotal)), '{}'::jsonb);
  return jsonb_build_object('id',target.id,'updated_at',saved_at,'line_ids',to_jsonb(retained));
end;
$$;
revoke all on function public.save_invoice_details(uuid,timestamptz,timestamptz,jsonb) from public, anon, service_role;
grant execute on function public.save_invoice_details(uuid,timestamptz,timestamptz,jsonb) to authenticated;

-- One locked read/derive/write operation replaces the application's separate
-- invoice read + payment sum + header update. No caller supplies a balance.
create function public.reconcile_invoice_balance(p_invoice_id uuid) returns jsonb
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
  return jsonb_build_object('balance_due_cents',balance,'paid_cents',paid,'status',resolved);
end;
$$;
revoke all on function public.reconcile_invoice_balance(uuid) from public, anon;
grant execute on function public.reconcile_invoice_balance(uuid) to authenticated, service_role;

-- Keep email delivery and manual delivery distinct. Manual marking keeps the
-- existing owner/admin permission; email delivery retains active internal staff.
create function public.record_invoice_delivery(p_invoice_id uuid, p_manual boolean default false) returns boolean
language plpgsql security definer set search_path = '' as $$
declare target public.invoices%rowtype;
begin
  if auth.uid() is null or not app_private.has_staff_role()
    or p_manual is null or (p_manual and not app_private.has_platform_admin_role()) then
    raise exception 'This account cannot record invoice delivery.' using errcode = '42501';
  end if;
  select * into target from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  if target.status = 'void' or (p_manual and target.sent_at is not null) then
    raise exception 'Only an eligible, non-void invoice can be marked sent.' using errcode = '23514';
  end if;
  update public.invoices set sent_at = clock_timestamp() where id = target.id;
  perform public.reconcile_invoice_balance(target.id);
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
    values(auth.uid(),'staff','invoice',target.id,case when p_manual then 'invoice_marked_sent_manually' else 'invoice_delivery_recorded' end,'{}'::jsonb);
  return true;
end;
$$;
revoke all on function public.record_invoice_delivery(uuid,boolean) from public, anon, service_role;
grant execute on function public.record_invoice_delivery(uuid,boolean) to authenticated;

-- Preserve approved-addition provenance/idempotency and its live staff gate.
-- Derive the remaining balance from money already recorded on an unsent draft.
create or replace function public.attach_approved_change_orders_to_invoice(p_invoice_id uuid)
returns table (added_line_count integer, added_change_order_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.invoices%rowtype;
  line_count integer := 0;
  order_count integer := 0;
  net_paid bigint;
begin
  if not app_private.has_staff_role() then
    raise exception 'Only staff can add approved change orders to invoices.';
  end if;
  select * into target from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if target.status <> 'draft' then
    raise exception 'Only a draft invoice can be updated. Create a supplemental draft for later approved work.';
  end if;

  if exists(select 1 from public.invoice_checkout_sessions s where s.invoice_id = target.id and s.status in ('creating','open','processing'))
    or exists(select 1 from public.payments p where p.invoice_id = target.id and p.status = 'pending') then
    raise exception 'Review the payment checkout before adding invoice charges.' using errcode = '23514';
  end if;
  net_paid := app_private.invoice_paid_principal(target.id);
  insert into public.invoice_line_items (
    invoice_id, name, description, service_category_id, material_id, quantity,
    unit_price_cents, total_cents, sort_order, source_change_order_line_item_id
  )
  select target.id, li.title, li.description, li.service_category_id, li.material_id,
    li.quantity, li.unit_price_cents, li.amount_cents,
    1000 + pg_catalog.row_number() over (order by co.created_at, li.sort_order)::integer,
    li.id
  from public.change_orders co
  join public.change_order_line_items li on li.change_order_id = co.id
  where co.job_id = target.job_id
    and co.status = 'approved'
    and co.invoice_id is null
  on conflict (source_change_order_line_item_id) where source_change_order_line_item_id is not null do nothing;
  get diagnostics line_count = row_count;

  update public.change_orders co
  set invoice_id = target.id
  where co.job_id = target.job_id
    and co.status = 'approved'
    and co.invoice_id is null
    and not exists (
      select 1 from public.change_order_line_items li
      where li.change_order_id = co.id
        and not exists (
          select 1 from public.invoice_line_items ili
          where ili.invoice_id = target.id and ili.source_change_order_line_item_id = li.id
        )
    );
  get diagnostics order_count = row_count;

  update public.invoices i set
    subtotal_cents = totals.total_cents,
    total_cents = totals.total_cents + i.tax_cents,
    balance_due_cents = greatest(0, totals.total_cents::bigint + i.tax_cents - net_paid)::integer,
    status = app_private.invoice_payment_status(i.status, greatest(0,totals.total_cents::bigint + i.tax_cents - net_paid), net_paid, i.sent_at, i.due_at),
    paid_at = case when totals.total_cents::bigint + i.tax_cents <= net_paid then coalesce(i.paid_at,clock_timestamp()) else null end
  from (
    select invoice_id, coalesce(pg_catalog.sum(total_cents), 0)::integer as total_cents
    from public.invoice_line_items where invoice_id = target.id group by invoice_id
  ) totals
  where i.id = target.id and i.id = totals.invoice_id;

  insert into public.activity_log (actor_user_id, subject_type, subject_id, event_type, metadata_json)
  select (select auth.uid()), 'invoice', target.id, 'approved_change_orders_added',
    pg_catalog.jsonb_build_object('line_count', line_count, 'change_order_count', order_count)
  where line_count > 0;

  return query select line_count, order_count;
end;
$$;

notify pgrst,'reload schema';
