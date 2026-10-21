-- PR04 follow-through: one standalone submission, including optional new party
-- and note, commits once. Existing draft and work-order commands are unchanged.
create table app_private.standalone_invoice_requests (
  request_id uuid primary key,
  actor_user_id uuid not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  invoice_id uuid not null,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);
alter table app_private.standalone_invoice_requests enable row level security;
create policy "No direct request access" on app_private.standalone_invoice_requests
  as restrictive for all to public using (false) with check (false);
revoke all on app_private.standalone_invoice_requests from public, anon, authenticated, service_role;

create function public.create_standalone_invoice(p_request_id uuid, p_header jsonb,
  p_lines jsonb, p_notes text default '', p_new_customer jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  actor uuid := auth.uid();
  fingerprint text;
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
  fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'header',p_header,'lines',p_lines,'notes',notes,'new_customer',new_customer)::text,'UTF8')),'hex');
  select * into previous from app_private.standalone_invoice_requests r where r.request_id=p_request_id;
  if found then
    if previous.actor_user_id<>actor or previous.input_hash<>fingerprint then
      raise exception 'This saved request belongs to different details. Review the invoice already created before starting another request.' using errcode='23514';
    end if;
    select * into existing from public.invoices i where i.id=previous.invoice_id for share;
    if not found then
      raise exception 'The invoice from this saved request was deleted. Review its history before starting another request.' using errcode='23514';
    end if;
    return previous.result_json || jsonb_build_object('replayed',true,'invoice_status',existing.status);
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
    'tax_cents',0,'due_at',p_header->>'due_at'),p_lines)->>'id')::uuid;
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
    'organization_id',organization_id,'service_location_id',location_id,'replayed',false,'invoice_status','draft','note_warning',warning);
  insert into app_private.standalone_invoice_requests(request_id,actor_user_id,input_hash,invoice_id,result_json)
    values(p_request_id,actor,fingerprint,invoice_id,result);
  return result;
end;
$$;
revoke all on function public.create_standalone_invoice(uuid,jsonb,jsonb,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_standalone_invoice(uuid,jsonb,jsonb,text,jsonb) to authenticated;
