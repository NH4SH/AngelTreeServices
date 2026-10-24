-- New invoices only. Existing bindings, receipts, financial formulas and locks stay intact.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.invoices drop constraint invoices_document_terms_version_known;
alter table public.invoices add constraint invoices_document_terms_version_known
  check(document_terms_version in ('legacy-2026-10-22','firewood-household-2026-10-24'));

-- Invoker helper is private and has no direct API-role execution. Existing
-- authorized financial commands select the one approved family, never raw terms.
create function app_private.invoice_creation_terms(p_header jsonb,p_lines jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare location public.service_locations%rowtype; line jsonb; has_wood boolean:=false; quantity numeric;
begin
  if not (p_header ? 'invoice_intent') then return 'legacy-2026-10-22'; end if;
  if p_header->>'invoice_intent' is distinct from 'firewood_household'
    or p_header->'firewood_domestic_use' is distinct from 'true'::jsonb
    or nullif(p_header->>'customer_id','') is null
    or nullif(p_header->>'organization_id','') is not null
    or nullif(p_header->>'job_id','') is not null or nullif(p_header->>'quote_id','') is not null
    or nullif(p_header->>'recurring_service_plan_id','') is not null
    or nullif(p_header->>'recurring_occurrence_id','') is not null
    or coalesce((p_header->>'tax_cents')::bigint,0)<>0 then
    raise exception 'Confirm a standalone household-use firewood purchase before saving.' using errcode='23514';
  end if;
  select * into location from public.service_locations l
    where l.id=(p_header->>'service_location_id')::uuid
      and l.customer_id=(p_header->>'customer_id')::uuid and l.organization_id is null for share;
  if not found or upper(btrim(location.state)) is distinct from 'VA' or nullif(btrim(location.street),'') is null or nullif(btrim(location.city),'') is null then
    raise exception 'Choose a complete Virginia delivery address for this customer.' using errcode='23514';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'Review the firewood products and quantities.' using errcode='23514';
  end if;
  for line in select value from jsonb_array_elements(p_lines) loop
    quantity:=(line->>'quantity')::numeric;
    if line->>'name' is null or line->>'name' not in ('Firewood — full cord, delivered','Firewood — half cord, delivered','Firewood stacking')
      or quantity is null or quantity<1 or quantity>100 or quantity<>trunc(quantity)
      or nullif(line->>'material_id','') is not null or nullif(line->>'service_category_id','') is not null
      or length(coalesce(line->>'description',''))>12000 then
      raise exception 'Use full-cord, half-cord or stacking lines with whole quantities from 1 to 100.' using errcode='23514';
    end if;
    has_wood:=has_wood or line->>'name'<>'Firewood stacking';
  end loop;
  if not has_wood then raise exception 'Add a full-cord or half-cord line before optional stacking.' using errcode='23514'; end if;
  return 'firewood-household-2026-10-24';
end;
$$;
revoke all on function app_private.invoice_creation_terms(jsonb,jsonb) from public,anon,authenticated,service_role;

-- Source hashes and literal anchors make the small command changes fail closed
-- on an unexpected preimage. CREATE OR REPLACE retains original owners/ACLs/OIDs.
DO $patch$
declare target record; routine oid; source text; revised text;
begin
  routine:=to_regprocedure('public.create_invoice_draft(jsonb,jsonb)');
  if routine is null or (select md5(prosrc) from pg_proc where oid=routine)<>'bf670c022033606964c1b44b34703c46' then raise exception 'Unexpected Firewood command preimage: public.create_invoice_draft(jsonb,jsonb)'; end if;
  select pg_get_functiondef(routine) into revised;
  select prosrc into source from pg_proc where oid=routine;
  revised:=replace(revised,source,$body0$
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
    subtotal_cents, tax_cents, total_cents, balance_due_cents, document_terms_version)
  values(header.job_id, header.quote_id, header.customer_id, header.organization_id, header.service_location_id,
    header.billing_contact_id, header.accounts_payable_contact_id, header.recurring_service_plan_id, header.recurring_occurrence_id,
    header.purchase_order_reference, header.payment_terms, header.invoice_number, header.due_at, 'draft',
    subtotal, tax, subtotal + tax, subtotal + tax, app_private.invoice_creation_terms(p_header,p_lines)) returning id into new_id;
  insert into public.invoice_line_items(invoice_id,name,description,service_category_id,material_id,quantity,unit_price_cents,total_cents,sort_order)
    select new_id, item->>'name', item->>'description', (item->>'service_category_id')::uuid, (item->>'material_id')::uuid,
      (item->>'quantity')::numeric, (item->>'unit_price_cents')::integer, (item->>'total_cents')::integer, ordinal::integer - 1
    from jsonb_array_elements(p_lines) with ordinality lines(item,ordinal);
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
    values(auth.uid(),'staff','invoice',new_id,'invoice_created',jsonb_build_object('total_cents',subtotal + tax) || case when p_header->>'invoice_intent'='firewood_household' then jsonb_build_object('document_terms_version','firewood-household-2026-10-24','firewood_domestic_use_confirmed',true,'service_location_id',header.service_location_id,'order_taking_locality','Spotsylvania County, Virginia','tax_basis','domestic_fuel') else '{}'::jsonb end);
  return jsonb_build_object('id',new_id);
end;
$body0$);
  execute revised;
  if (select md5(prosrc) from pg_proc where oid=routine)<>'3302b39ffcd549d9d4f980725b78ef38' then raise exception 'Unexpected Firewood command result: public.create_invoice_draft(jsonb,jsonb)'; end if;
  routine:=to_regprocedure('public.save_invoice_details(uuid,timestamp with time zone,timestamp with time zone,jsonb)');
  if routine is null or (select md5(prosrc) from pg_proc where oid=routine)<>'daf61172054df582526801a1baf33632' then raise exception 'Unexpected Firewood command preimage: public.save_invoice_details(uuid,timestamp with time zone,timestamp with time zone,jsonb)'; end if;
  select pg_get_functiondef(routine) into revised;
  select prosrc into source from pg_proc where oid=routine;
  revised:=replace(revised,source,$body1$
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
    raise exception 'This invoice changed since you opened it. Reload before saving.' using errcode = 'PT409';
  end if;
  if exists(select 1 from app_private.invoice_void_leases l where l.invoice_id = target.id and l.expires_at > clock_timestamp())
    or exists(select 1 from public.invoice_checkout_sessions s where s.invoice_id = target.id and s.status in ('creating','open','processing'))
    or exists(select 1 from public.payments p where p.invoice_id = target.id and p.status = 'pending') then
    raise exception 'A payment checkout is in progress. Review it before changing invoice amounts.' using errcode = '23514';
  end if;
  subtotal := app_private.validate_invoice_lines(p_lines);
  if target.document_terms_version='firewood-household-2026-10-24' then
    perform app_private.invoice_creation_terms(to_jsonb(target)||jsonb_build_object('invoice_intent','firewood_household','firewood_domestic_use',true),p_lines);
  end if;
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
$body1$);
  execute revised;
  if (select md5(prosrc) from pg_proc where oid=routine)<>'301b4c23244e61680b63841fdda33514' then raise exception 'Unexpected Firewood command result: public.save_invoice_details(uuid,timestamp with time zone,timestamp with time zone,jsonb)'; end if;
  routine:=to_regprocedure('public.create_standalone_invoice(uuid,jsonb,jsonb,text,jsonb)');
  if routine is null or (select md5(prosrc) from pg_proc where oid=routine)<>'d5ea470468de2200c5bcdcf42913d8e6' then raise exception 'Unexpected Firewood command preimage: public.create_standalone_invoice(uuid,jsonb,jsonb,text,jsonb)'; end if;
  select pg_get_functiondef(routine) into revised;
  select prosrc into source from pg_proc where oid=routine;
  revised:=replace(revised,source,$body2$
declare
  actor uuid := auth.uid();
  fingerprint text;
  legacy_fingerprint text;
  legacy_retry boolean:=false;
  previous app_private.standalone_invoice_requests%rowtype;
  existing public.invoices%rowtype;
  customer_id uuid;
  organization_id uuid;
  location_id uuid;
  invoice_id uuid;
  new_customer jsonb := nullif(p_new_customer, 'null'::jsonb);
  name text;
  customer_email text;
  customer_phone text;
  contact_key text;
  street text;
  city text;
  state text;
  postal text;
  notes text := btrim(coalesce(p_notes,''));
  warning boolean := false;
  result jsonb;
begin
  if actor is null or not app_private.has_staff_role() then
    raise exception 'Only active office staff may create invoices.' using errcode='42501';
  end if;
  if p_request_id is null or p_header is null or jsonb_typeof(p_header)<>'object'
    or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0
    or length(notes)>20000 then
    raise exception 'Review the saved invoice request and its details.' using errcode='22023';
  end if;
  -- Serialize this command identity before creating a customer or invoice.
  -- Recheck live access after waiting; retained roles alone cannot authorize it.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 43665));
  if not app_private.has_staff_role() then
    raise exception 'Only active office staff may create invoices.' using errcode='42501';
  end if;
  if p_header->>'invoice_intent'='firewood_household' then
    legacy_fingerprint:=encode(sha256(convert_to(jsonb_build_object('header',p_header-array['invoice_intent','firewood_domestic_use','document_terms_version'],'lines',p_lines,'notes',notes,'new_customer',new_customer)::text,'UTF8')),'hex');
    p_header:=p_header||jsonb_build_object('document_terms_version','firewood-household-2026-10-24');
  end if;
  fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'header',p_header,'lines',p_lines,'notes',notes,'new_customer',new_customer)::text,'UTF8')),'hex');
  select * into previous from app_private.standalone_invoice_requests r where r.request_id=p_request_id;
  if found then
    if previous.actor_user_id<>actor or (previous.input_hash<>fingerprint and not coalesce(
      p_header->>'invoice_intent'='firewood_household' and previous.input_hash=legacy_fingerprint
      and exists(select 1 from public.invoices i where i.id=previous.invoice_id and i.document_terms_version='legacy-2026-10-22'),false)) then
      raise exception 'This saved request belongs to different details. Review the invoice already created before starting another request.' using errcode='23514';
    end if;
    select * into existing from public.invoices i where i.id=previous.invoice_id for share;
    if not found then
      raise exception 'The invoice from this saved request was deleted. Review its history before starting another request.' using errcode='23514';
    end if;
    legacy_retry:=previous.input_hash<>fingerprint;
    return previous.result_json || jsonb_build_object('replayed',true,'invoice_status',existing.status,
      'document_terms_version',existing.document_terms_version,'legacy_firewood_request',legacy_retry);
  end if;
  -- This endpoint never accepts work-order, source-quote, recurring, contact,
  -- financial-state or invoice-number overrides. Those keep their own commands.
  if p_header->>'job_id' is not null or p_header->>'quote_id' is not null then
    raise exception 'Use the work-order invoice command for linked work.' using errcode='22023';
  end if;
  perform app_private.validate_invoice_lines(p_lines);
  customer_id := nullif(p_header->>'customer_id','')::uuid;
  organization_id := nullif(p_header->>'organization_id','')::uuid;
  location_id := nullif(p_header->>'service_location_id','')::uuid;
  if new_customer is not null then
    if jsonb_typeof(new_customer)<>'object' or customer_id is not null or organization_id is not null or location_id is not null then
      raise exception 'Choose an existing party or enter one new customer.' using errcode='22023';
    end if;
    name := nullif(btrim(new_customer->>'name'),'');
    customer_email := nullif(lower(btrim(new_customer->>'email')),'');
    customer_phone := nullif(btrim(new_customer->>'phone'),'');
    street := nullif(btrim(new_customer->>'street'),'');
    city := nullif(btrim(new_customer->>'city'),'');
    state := upper(btrim(coalesce(new_customer->>'state','VA')));
    postal := nullif(btrim(new_customer->>'postal_code'),'');
    if name is null or (customer_email is null and customer_phone is null) or street is null or city is null or length(state)<>2 then
      raise exception 'Enter the customer name, a phone or email, and a complete service address.' using errcode='22023';
    end if;
    -- Two distinct submissions through this command must not race the existing
    -- duplicate-contact check. Always take optional contact locks in sorted order.
    for contact_key in select distinct k from unnest(array[
      case when customer_email is not null then 'email:'||customer_email end,
      case when customer_phone is not null then 'phone:'||customer_phone end]) k where k is not null order by k loop
      perform pg_advisory_xact_lock(hashtextextended(contact_key,43666));
    end loop;
    if exists(select 1 from public.customers c where (customer_email is not null and lower(c.email)=customer_email)
      or (customer_phone is not null and c.phone=customer_phone)) then
      raise exception 'A customer already uses that contact information. Select the existing customer instead.' using errcode='23514';
    end if;
    insert into public.customers(display_name,email,phone,billing_address,customer_type,status)
      values(name,customer_email,customer_phone,concat_ws(', ',street,city,state,postal),'residential','active') returning id into customer_id;
    insert into public.service_locations(customer_id,organization_id,label,street,city,state,postal_code)
      values(customer_id,null,'Primary service location',street,city,state,postal) returning id into location_id;
  end if;
  invoice_id := (public.create_invoice_draft(jsonb_build_object(
    'customer_id',customer_id,'organization_id',organization_id,'service_location_id',location_id,
    'tax_cents',0,'due_at',p_header->>'due_at')
      || case when p_header ? 'invoice_intent' then jsonb_build_object('invoice_intent',p_header->'invoice_intent','firewood_domestic_use',p_header->'firewood_domestic_use') else '{}'::jsonb end,p_lines)->>'id')::uuid;
  if notes<>'' then
    if customer_id is not null or location_id is not null then
      insert into public.notes(customer_id,job_id,service_location_id,author_user_id,visibility,body)
        values(customer_id,null,location_id,actor,'internal','Invoice note: '||notes);
    else
      -- Preserve organization-only notes guidance where there is no attachment target.
      warning := true;
    end if;
  end if;
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,
    organization_id,action_category,record_label,summary,destination_path,metadata_json)
    values(actor,'staff','invoice',invoice_id,'invoice_draft_created',organization_id,'invoices','Draft invoice',
      'A draft invoice was created.','/admin/invoices/'||invoice_id::text,
      jsonb_build_object('source_quote_id',null,'standalone',true));
  result := jsonb_build_object('request_id',p_request_id,'invoice_id',invoice_id,'customer_id',customer_id,
    'organization_id',organization_id,'service_location_id',location_id,'replayed',false,'invoice_status','draft','note_warning',warning,'document_terms_version',(select i.document_terms_version from public.invoices i where i.id=invoice_id));
  insert into app_private.standalone_invoice_requests(request_id,actor_user_id,input_hash,invoice_id,result_json)
    values(p_request_id,actor,fingerprint,invoice_id,result);
  return result;
end;
$body2$);
  execute revised;
  if (select md5(prosrc) from pg_proc where oid=routine)<>'ae68d87e023cea06377b260d3a21cb21' then raise exception 'Unexpected Firewood command result: public.create_standalone_invoice(uuid,jsonb,jsonb,text,jsonb)'; end if;
end
$patch$;
notify pgrst,'reload schema';
commit;
