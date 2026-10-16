-- PR04: one durable command for work-order/approved-quote invoice generation.
-- No historical rows are rewritten. Multiple explicitly created invoices remain legal.
create table app_private.invoice_generation_requests (
  request_id uuid primary key,
  actor_user_id uuid not null,
  input_json jsonb not null,
  job_id uuid not null,
  invoice_id uuid not null,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);
alter table app_private.invoice_generation_requests enable row level security;
revoke all on app_private.invoice_generation_requests from public, anon, authenticated, service_role;

-- Child edits must participate in the same parent lock as generation. Without
-- this, a header lock alone does not serialize an UPDATE/DELETE of existing lines.
create function app_private.lock_billing_source_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_parent uuid; new_parent uuid;
begin
  if tg_table_name = 'quote_line_items' then
    if tg_op <> 'INSERT' then old_parent := old.quote_id; end if;
    if tg_op <> 'DELETE' then new_parent := new.quote_id; end if;
    perform q.id from public.quotes q where q.id in (old_parent,new_parent) order by q.id for update;
  else
    if tg_op <> 'INSERT' then old_parent := old.change_order_id; end if;
    if tg_op <> 'DELETE' then new_parent := new.change_order_id; end if;
    perform c.id from public.change_orders c where c.id in (old_parent,new_parent) order by c.id for update;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.lock_billing_source_parent() from public, anon, authenticated, service_role;
create trigger quote_line_billing_parent_lock before insert or update or delete on public.quote_line_items
  for each row execute function app_private.lock_billing_source_parent();
create trigger change_order_line_billing_parent_lock before insert or update or delete on public.change_order_line_items
  for each row execute function app_private.lock_billing_source_parent();

create function public.generate_job_invoice(p_request_id uuid, p_job_id uuid default null,
  p_quote_id uuid default null, p_manual jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  actor uuid := auth.uid();
  input_json jsonb := jsonb_build_object('job_id',p_job_id,'quote_id',p_quote_id,'manual',p_manual);
  previous app_private.invoice_generation_requests%rowtype;
  job public.jobs%rowtype;
  quote public.quotes%rowtype;
  existing public.invoices%rowtype;
  co public.change_orders%rowtype;
  line record;
  new_job boolean := false;
  resolved_job uuid;
  source_quote uuid;
  source_lines jsonb;
  header jsonb;
  new_id uuid;
  subtotal bigint;
  tax bigint := 0;
  co_subtotal bigint;
  additions integer := 0;
  addition_lines integer := 0;
  next_sort integer;
  before_status text;
  result jsonb;
  requirement uuid;
  billing_contact uuid;
begin
  if actor is null or not app_private.has_staff_role() then
    raise exception 'Only active office staff may generate invoices.' using errcode = '42501';
  end if;
  if p_request_id is null or (p_job_id is null) = (p_quote_id is null)
    or (p_manual is not null and (p_job_id is null or jsonb_typeof(p_manual) <> 'object')) then
    raise exception 'Choose one work order or approved quote and retry the saved request.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 43664));
  select * into previous from app_private.invoice_generation_requests where request_id = p_request_id;
  if found then
    if previous.actor_user_id <> actor or previous.input_json <> input_json then
      raise exception 'This saved request belongs to different details. Open the work order to review its invoice before continuing.' using errcode = '23514';
    end if;
    select * into existing from public.invoices where id = previous.invoice_id;
    if not found then
      raise exception 'The invoice from this saved request was deleted. Review the work order before starting another request.' using errcode = '23514';
    end if;
    return previous.result_json || jsonb_build_object('replayed',true,'invoice_status',existing.status);
  end if;

  resolved_job := p_job_id;
  if p_quote_id is not null then
    select coalesce(q.job_id,(select j.id from public.jobs j where j.source_quote_id=q.id)) into resolved_job
      from public.quotes q where q.id=p_quote_id;
  end if;
  -- Existing work order first, then quote, then additions, then new invoice.
  if resolved_job is not null then
    select * into job from public.jobs where id=resolved_job for update;
    if not found then raise exception 'Work order not found.' using errcode='23514'; end if;
  end if;
  source_quote := coalesce(p_quote_id,job.source_quote_id);
  if source_quote is not null then
    select * into quote from public.quotes where id=source_quote for update;
    if not found or (p_manual is null and quote.status <> 'approved') then
      raise exception 'Approve the source quote before generating its invoice.' using errcode='23514';
    end if;
    if p_quote_id is not null and resolved_job is null then
      -- A competing quote command may have linked a job while we waited.
      select coalesce(quote.job_id,(select j.id from public.jobs j where j.source_quote_id=quote.id)) into resolved_job;
      if resolved_job is null then
        if quote.service_location_id is null then raise exception 'Add a service location to the approved quote first.' using errcode='23514'; end if;
        insert into public.jobs(customer_id,organization_id,property_manager_contact_id,onsite_contact_id,service_location_id,
          source_quote_id,status,service_type,priority,requested_scope,debris_handling,debris_handling_notes,
          recurring_service_plan_id,recurring_occurrence_id,recurring_authorization_source)
        values(quote.customer_id,quote.organization_id,coalesce(quote.approval_contact_id,quote.recipient_contact_id),quote.onsite_contact_id,
          quote.service_location_id,quote.id,'accepted','other','normal',
          coalesce(nullif(concat_ws(E'\n\n',quote.customer_message,(select string_agg(coalesce(nullif(li.description,''),li.name),E'\n\n' order by li.sort_order,li.id)
            from public.quote_line_items li where li.quote_id=quote.id)),''),'Approved quote scope pending work order details.'),
          quote.debris_handling,quote.debris_handling_notes,quote.recurring_service_plan_id,quote.recurring_occurrence_id,
          case when quote.recurring_occurrence_id is not null then 'approved_renewal_quote' end)
        returning * into job;
        resolved_job := job.id;
        new_job := true;
      else
        select * into job from public.jobs where id=resolved_job for update;
      end if;
    end if;
    if quote.job_id is not null and quote.job_id <> job.id
      or job.source_quote_id is not null and job.source_quote_id <> quote.id
      or quote.customer_id is distinct from job.customer_id or quote.organization_id is distinct from job.organization_id
      or (quote.service_location_id is not null and quote.service_location_id is distinct from job.service_location_id) then
      raise exception 'The source quote does not match this work order and contracting party.' using errcode='23514';
    end if;
  end if;
  if job.id is null then raise exception 'Work order not found.' using errcode='23514'; end if;

  -- Preserve first-invoice lookup, including voids and historical duplicates.
  select * into existing from public.invoices where job_id=job.id order by created_at,id limit 1;
  if found then
    if existing.customer_id is distinct from job.customer_id or existing.organization_id is distinct from job.organization_id then
      raise exception 'The existing invoice belongs to another contracting party. Review its billing history.' using errcode='23514';
    end if;
    result := jsonb_build_object('invoice_id',existing.id,'job_id',job.id,'existing',true,'replayed',false,
      'invoice_status',existing.status,'job_completed',false,'added_change_order_count',0);
  else
    if p_quote_id is not null then
      if job.archived_at is not null and not (job.website_submission_id is not null and job.lead_disposition='archived'
        and job.status in ('new_lead','estimate_scheduled','quoted')) then
        raise exception 'Restore the archived work order before generating an invoice.' using errcode='23514';
      end if;
      if job.status in ('new_lead','estimate_scheduled','quoted') then
        update public.jobs set status='accepted',source_quote_id=quote.id,archived_at=null,archived_by_user_id=null,lead_disposition='active'
          where id=job.id returning * into job;
      elsif job.source_quote_id is null then
        update public.jobs set source_quote_id=quote.id where id=job.id returning * into job;
      end if;
      update public.quotes set job_id=job.id where id=quote.id;
      update public.jobs set debris_handling=quote.debris_handling,debris_handling_notes=quote.debris_handling_notes,
        recurring_service_plan_id=quote.recurring_service_plan_id,recurring_occurrence_id=quote.recurring_occurrence_id,
        recurring_authorization_source=case when quote.recurring_occurrence_id is not null then 'approved_renewal_quote' end
        where id=job.id returning * into job;
      update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),last_error=null,
        processing_started_at=null,skip_reason='Quote was approved and converted to a work order.'
        where quote_id=quote.id and status='pending';
    end if;
    if job.status not in ('accepted','scheduled','in_progress','completed','completed_pending_review','ready_to_invoice') then
      raise exception 'This work order is not available for draft invoicing.' using errcode='23514';
    end if;
    if job.recurring_service_plan_id is not null and not exists(select 1 from public.recurring_service_plans p
      where p.id=job.recurring_service_plan_id and p.customer_id is not distinct from job.customer_id and p.organization_id is not distinct from job.organization_id) then
      raise exception 'The recurring service plan does not match this work order.' using errcode='23514';
    end if;
    if job.recurring_occurrence_id is not null and not exists(select 1 from public.recurring_service_occurrences o
      where o.id=job.recurring_occurrence_id and o.recurring_plan_id=job.recurring_service_plan_id and o.service_location_id=job.service_location_id
        and (o.work_order_id is null or o.work_order_id=job.id)) then
      raise exception 'The recurring service visit does not match this work order.' using errcode='23514';
    end if;
    before_status := job.status;
    -- Lock every unbilled addition, including ones being approved concurrently.
    -- New additions reference the locked job and wait until this command commits.
    perform id from public.change_orders where job_id=job.id and invoice_id is null order by id for update;
    if p_manual is null then
      if source_quote is not null then
        select jsonb_agg(jsonb_build_object('name',li.name,'description',li.description,'service_category_id',li.service_category_id,
          'material_id',li.material_id,'quantity',li.quantity,'unit_price_cents',li.unit_price_cents,'total_cents',li.total_cents) order by li.sort_order,li.id)
          into source_lines from public.quote_line_items li where li.quote_id=quote.id;
        tax := quote.tax_cents;
        if quote.subtotal_cents <> coalesce((select sum(li.total_cents) from public.quote_line_items li where li.quote_id=quote.id),0)
          or quote.total_cents::bigint <> quote.subtotal_cents::bigint+quote.tax_cents then
          raise exception 'Review the source quote totals before generating an invoice.' using errcode='23514';
        end if;
      end if;
      source_lines := coalesce(source_lines,jsonb_build_array(jsonb_build_object('name',coalesce(nullif(replace(job.service_type,'_',' '),''),'Completed service'),
        'description',job.requested_scope,'quantity',1,'unit_price_cents',0,'total_cents',0)));
      billing_contact := coalesce(quote.billing_contact_id,quote.approval_contact_id,quote.recipient_contact_id,job.property_manager_contact_id);
      header := jsonb_build_object('tax_cents',tax,'due_at',((current_timestamp at time zone 'America/New_York')::date+15)+time '17:00' at time zone 'UTC');
    else
      if (p_manual->>'customer_id')::uuid is distinct from job.customer_id or (p_manual->>'organization_id')::uuid is distinct from job.organization_id then
        raise exception 'Selected work order does not belong to the selected contracting party.' using errcode='23514';
      end if;
      source_lines := p_manual->'lines';
      if jsonb_array_length(source_lines)=0 or length(coalesce(p_manual->>'notes',''))>20000 then
        raise exception 'Add invoice lines and review the note length.' using errcode='22023';
      end if;
      billing_contact := job.property_manager_contact_id;
      -- Custom invoice lines remain custom; source quote cannot set their prices.
      header := jsonb_build_object('tax_cents',0,'due_at',(p_manual->>'due_at')::timestamptz);
    end if;
    header := header || jsonb_build_object('customer_id',job.customer_id,'organization_id',job.organization_id,'job_id',job.id,
      'quote_id',case when p_manual is null then source_quote end,'service_location_id',job.service_location_id,
      'billing_contact_id',billing_contact,'accounts_payable_contact_id',billing_contact,
      'recurring_service_plan_id',job.recurring_service_plan_id,'recurring_occurrence_id',job.recurring_occurrence_id);
    new_id := (public.create_invoice_draft(header,source_lines)->>'id')::uuid;
    next_sort := jsonb_array_length(source_lines);
    -- Use only locked, approved, unbilled additions with matching source parties.
    for co in select * from public.change_orders where job_id=job.id and invoice_id is null and status='approved' order by created_at,id loop
      if co.customer_id is distinct from job.customer_id or co.organization_id is distinct from job.organization_id
        or (co.service_location_id is not null and co.service_location_id is distinct from job.service_location_id)
        or (co.source_quote_id is not null and co.source_quote_id is distinct from source_quote) then
        raise exception 'An approved addition does not match this work order. Review it before invoicing.' using errcode='23514';
      end if;
      select coalesce(sum(amount_cents),0) into co_subtotal from public.change_order_line_items where change_order_id=co.id;
      if co_subtotal <> co.subtotal_cents or co.total_cents::bigint <> co_subtotal+co.tax_cents+co.fee_cents
        or exists(select 1 from public.change_order_line_items where change_order_id=co.id and amount_cents<>round(quantity*unit_price_cents)) then
        raise exception 'Review the approved addition quantities and totals before invoicing.' using errcode='23514';
      end if;
      for line in select * from public.change_order_line_items where change_order_id=co.id order by sort_order,id loop
        -- Never silently mark an addition billed if its lines are on another invoice.
        if exists(select 1 from public.invoice_line_items where source_change_order_line_item_id=line.id) then
          raise exception 'An approved addition is already linked to another invoice. Review its billing history.' using errcode='23514';
        end if;
        insert into public.invoice_line_items(invoice_id,name,description,service_category_id,material_id,quantity,unit_price_cents,total_cents,sort_order,source_change_order_line_item_id)
          values(new_id,line.title,line.description,line.service_category_id,line.material_id,line.quantity,line.unit_price_cents,line.amount_cents,next_sort,line.id);
        next_sort := next_sort+1; addition_lines := addition_lines+1;
      end loop;
      if co.fee_cents>0 then
        insert into public.invoice_line_items(invoice_id,name,description,quantity,unit_price_cents,total_cents,sort_order)
          values(new_id,'Additional work fee',co.change_order_number||' · '||co.title,1,co.fee_cents,co.fee_cents,next_sort);
        next_sort := next_sort+1;
      end if;
      tax := tax+co.tax_cents;
      update public.change_orders set invoice_id=new_id where id=co.id;
      additions := additions+1;
    end loop;
    select sum(total_cents)::bigint into subtotal from public.invoice_line_items where invoice_id=new_id;
    if subtotal+tax>2147483647 then raise exception 'Invoice total is too large.' using errcode='22023'; end if;
    -- A zero-price draft is still a draft; invoice creation is not a payment.
    update public.invoices set subtotal_cents=subtotal::integer,tax_cents=tax::integer,total_cents=(subtotal+tax)::integer,
      balance_due_cents=(subtotal+tax)::integer,status='draft',paid_at=null where id=new_id;
    if p_manual is not null and nullif(btrim(p_manual->>'notes'),'') is not null then
      insert into public.notes(customer_id,job_id,service_location_id,author_user_id,visibility,body)
        values(job.customer_id,job.id,job.service_location_id,actor,'internal','Invoice note: '||(p_manual->>'notes'));
    end if;
    -- Existing product behavior is retained atomically. PR09 remains a separate
    -- product decision about separating invoice creation from field completion.
    update public.jobs set status='completed',completed_at=coalesce(completed_at,clock_timestamp()),completed_by_user_id=coalesce(completed_by_user_id,actor)
      where id=job.id;
    update public.schedule_events set status='completed' where job_id=job.id and status in ('scheduled','confirmed','in_progress');
    if new_job then
      insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
        values(actor,'job',job.id,'work_order_created',jsonb_build_object('source_quote_id',quote.id));
    end if;
    if p_quote_id is not null then
      -- Preserve the existing approved-quote material-plan copy atomically.
      for line in select li.*,m.default_unit from public.quote_line_items li join public.material_catalog m on m.id=li.material_id where li.quote_id=quote.id loop
        select id into requirement from public.quote_material_requirements where quote_id=quote.id and quote_line_item_id=line.id;
        if requirement is null then
          insert into public.quote_material_requirements(quote_id,quote_line_item_id,material_id,planned_quantity,unit,is_estimated,notes)
            values(quote.id,line.id,line.material_id,line.quantity,line.default_unit,true,'Copied from approved quote; review before reserving inventory.') returning id into requirement;
        end if;
        insert into public.job_material_requirements(job_id,material_id,source_quote_requirement_id,planned_quantity,unit,is_estimated,notes)
          values(job.id,line.material_id,requirement,line.quantity,line.default_unit,true,'Copied from approved quote; no stock was used or reserved automatically.')
          on conflict(job_id,source_quote_requirement_id) do update set material_id=excluded.material_id,planned_quantity=excluded.planned_quantity,unit=excluded.unit,is_estimated=excluded.is_estimated,notes=excluded.notes;
      end loop;
      if quote.recurring_occurrence_id is not null then
        update public.recurring_service_occurrences set status='approved',work_order_id=job.id,renewal_quote_id=quote.id where id=quote.recurring_occurrence_id;
      end if;
    end if;
    insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json) values
      (actor,'staff','invoice',new_id,'invoice_draft_created',jsonb_build_object('source_quote_id',source_quote,'generation_request_id',p_request_id,'total_cents',subtotal+tax)),
      (actor,'staff','job',job.id,'invoice_draft_created_from_job',jsonb_build_object('invoice_id',new_id,'job_status_before',before_status,'job_status_after','completed','generation_request_id',p_request_id));
    if before_status<>'completed' then
      insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
        values(actor,'job',job.id,'job_completed_from_invoice',jsonb_build_object('invoice_id',new_id,'from_status',before_status,'to_status','completed'));
    end if;
    update public.activity_log set organization_id=job.organization_id,action_category='invoices',record_label='Draft invoice',
      summary='A draft invoice was created.',destination_path='/admin/invoices/'||new_id::text
      where subject_id=new_id and event_type='invoice_draft_created';
    if additions>0 then
      insert into public.activity_log(actor_user_id,subject_type,subject_id,event_type,metadata_json)
        values(actor,'invoice',new_id,'approved_change_orders_added',jsonb_build_object('line_count',addition_lines,'change_order_count',additions));
    end if;
    result := jsonb_build_object('invoice_id',new_id,'job_id',job.id,'existing',false,'replayed',false,'invoice_status','draft',
      'job_completed',true,'added_change_order_count',additions);
  end if;
  insert into app_private.invoice_generation_requests(request_id,actor_user_id,input_json,job_id,invoice_id,result_json)
    values(p_request_id,actor,input_json,job.id,(result->>'invoice_id')::uuid,result);
  return result;
end;
$$;
revoke all on function public.generate_job_invoice(uuid,uuid,uuid,jsonb) from public, anon, service_role;
grant execute on function public.generate_job_invoice(uuid,uuid,uuid,jsonb) to authenticated;
-- The existing audit hardening revokes direct authenticated INSERT. Give the
-- invoker approval transaction only this narrow, server-derived audit writer.
create function app_private.record_change_order_approval(p_change_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.change_orders%rowtype;
begin
  if (auth.uid() is null and current_setting('role',true)<>'service_role')
    or (auth.uid() is not null and not app_private.has_staff_role()) then
    raise exception 'Only active office staff or the validated portal workflow may record approval.' using errcode='42501';
  end if;
  select * into target from public.change_orders where id=p_change_order;
  if not found or target.status<>'approved' or target.approved_at is null then
    raise exception 'Record the addition approval before its history.' using errcode='23514';
  end if;
  insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json,idempotency_key)
    values(coalesce(auth.uid(),target.approval_recorded_by_user_id),case when auth.uid() is null then 'portal' else 'staff' end,
      'change_order',target.id,'change_order_approved',jsonb_build_object('approval_method',target.approval_method,'job_id',target.job_id),
      'change_order:'||target.id::text||':approved') on conflict(idempotency_key) where idempotency_key is not null do nothing;
end;
$$;
revoke all on function app_private.record_change_order_approval(uuid) from public, anon;
grant execute on function app_private.record_change_order_approval(uuid) to authenticated, service_role;

-- Keep the existing invoker authorization, approval, scope and audit behavior.
create or replace function public.approve_change_order(
  p_change_order_id uuid,
  p_approved_by_name text,
  p_approved_by_contact_id uuid default null,
  p_approval_method text default 'portal',
  p_recorded_by_user_id uuid default null,
  p_approval_notes text default null
)
returns table (change_order_id uuid, job_id uuid, newly_approved boolean, applied_scope_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.change_orders%rowtype;
  locked_job uuid;
  was_new boolean := false;
  inserted_count integer := 0;
  approved_time timestamptz := pg_catalog.now();
begin
  if (select auth.uid()) is not null and not app_private.has_staff_role() then
    raise exception 'Only staff or a validated portal workflow can approve a change order.';
  end if;
  if p_approval_method not in ('portal', 'phone', 'email', 'in_person', 'signed_paper', 'other') then
    raise exception 'Choose a valid approval method.';
  end if;
  if pg_catalog.btrim(coalesce(p_approved_by_name, '')) = '' then
    raise exception 'Approver name is required.';
  end if;

  -- Match invoice generation: job first, then change order. Recheck the
  -- parent after waiting so a concurrent reassignment cannot bypass the lock.
  select c.job_id into locked_job from public.change_orders c where c.id=p_change_order_id;
  perform j.id from public.jobs j where j.id=locked_job for update;
  select * into target from public.change_orders
  where id = p_change_order_id
  for update;
  if found and target.job_id is distinct from locked_job then
    raise exception 'The addition changed work orders. Refresh and retry.' using errcode='40001';
  end if;
  if not found then raise exception 'Change order not found.'; end if;
  if target.job_id is null then raise exception 'Link a work order before approval.'; end if;
  if target.status in ('declined', 'cancelled', 'expired') then
    raise exception 'This change order is closed.';
  end if;

  was_new := target.approved_at is null;
  if was_new then
    update public.change_orders set
      status = 'approved',
      approved_at = approved_time,
      approved_by_name = pg_catalog.left(pg_catalog.btrim(p_approved_by_name), 160),
      approved_by_contact_id = p_approved_by_contact_id,
      approval_method = p_approval_method,
      approval_recorded_by_user_id = p_recorded_by_user_id,
      approval_notes = nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_approval_notes, '')), 2000), '')
    where id = p_change_order_id;
  end if;

  insert into public.job_change_order_scope_items (
    job_id, change_order_id, change_order_line_item_id, title, description, sort_order
  )
  select target.job_id, li.change_order_id, li.id, li.title, li.description, li.sort_order
  from public.change_order_line_items li
  where li.change_order_id = p_change_order_id
  on conflict (change_order_line_item_id) do nothing;
  get diagnostics inserted_count = row_count;

  update public.change_orders
  set applied_to_job_at = coalesce(applied_to_job_at, approved_time)
  where id = p_change_order_id;

  update public.jobs j
  set projected_value_cents =
    coalesce((select q.total_cents from public.quotes q where q.id = j.source_quote_id and q.status = 'approved'), 0)
    + coalesce((select pg_catalog.sum(co.total_cents) from public.change_orders co where co.job_id = j.id and co.status = 'approved'), 0)
  where j.id = target.job_id;

  if was_new then
    perform app_private.record_change_order_approval(p_change_order_id);
  end if;

  return query select p_change_order_id, target.job_id, was_new, inserted_count;
end;
$$;

notify pgrst,'reload schema';
