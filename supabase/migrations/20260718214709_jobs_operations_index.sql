-- Compact, RLS-aware read model for the admin jobs workspace. The view keeps
-- operational state derived from appointments and billing state without
-- rewriting historical job records.

create index if not exists appointments_job_work_current_idx
  on public.appointments (job_id, updated_at desc, created_at desc)
  where appointment_type in ('job', 'maintenance')
    and status in ('scheduled', 'confirmed', 'in_progress');

create index if not exists invoices_job_primary_idx
  on public.invoices (job_id, created_at, id)
  where status <> 'void';

create index if not exists change_orders_job_unbilled_approved_idx
  on public.change_orders (job_id, created_at desc)
  where status = 'approved' and invoice_id is null;

create or replace view public.job_operations_index
with (security_invoker = true)
as
with job_facts as (
  select
    job.id,
    job.customer_id,
    job.organization_id,
    job.service_location_id,
    job.assigned_crew_user_id,
    job.source_quote_id,
    job.status as job_status,
    job.priority,
    job.service_type,
    job.requested_scope,
    job.updated_at,
    job.created_at,
    customer.display_name as customer_name,
    organization.name as organization_name,
    coalesce(organization.name, customer.display_name, 'Contracting party missing') as contracting_party_name,
    location.street,
    location.city,
    location.state,
    location.postal_code,
    crew.full_name as assigned_crew_name,
    crew.email as assigned_crew_email,
    appointment.id as appointment_id,
    appointment.status as appointment_status,
    appointment.starts_at as appointment_starts_at,
    appointment.ends_at as appointment_ends_at,
    quote.id as quote_id,
    quote.quote_number,
    quote.status as quote_status,
    quote.total_cents as quote_total_cents_unmasked,
    quote.first_line_name as quote_first_line_name,
    quote.line_names as quote_line_names,
    invoice.id as invoice_id,
    invoice.invoice_number,
    invoice.status as invoice_status,
    invoice.total_cents as invoice_total_cents_unmasked,
    invoice.balance_due_cents as invoice_balance_due_cents_unmasked,
    invoice.due_at as invoice_due_at,
    coalesce(change_orders.unbilled_count, 0)::integer as approved_unbilled_change_order_count,
    coalesce(communications.failed_count, 0)::integer as failed_communication_count,
    cancelled_appointment.has_cancelled_appointment,
    case
      when job.service_type is null or job.service_type = 'other' then
        coalesce(
          nullif(quote.first_line_name, ''),
          nullif(pg_catalog.left(pg_catalog.split_part(job.requested_scope, E'\n', 1), 72), ''),
          'Field service work'
        )
      else pg_catalog.initcap(pg_catalog.replace(job.service_type, '_', ' '))
    end as display_title
  from public.jobs as job
  left join public.customers as customer on customer.id = job.customer_id
  left join public.organizations as organization on organization.id = job.organization_id
  left join public.service_locations as location on location.id = job.service_location_id
  left join public.profiles as crew on crew.id = job.assigned_crew_user_id
  left join lateral (
    select
      candidate.id,
      candidate.status,
      candidate.starts_at,
      candidate.ends_at
    from public.appointments as candidate
    where candidate.job_id = job.id
      and candidate.appointment_type in ('job', 'maintenance')
      and candidate.status in ('scheduled', 'confirmed', 'in_progress')
    order by candidate.updated_at desc, candidate.created_at desc
    limit 1
  ) as appointment on true
  left join lateral (
    select
      candidate.id,
      candidate.quote_number,
      candidate.status,
      candidate.total_cents,
      line_summary.first_line_name,
      line_summary.line_names
    from public.quotes as candidate
    left join lateral (
      select
        (pg_catalog.array_agg(line.name order by line.sort_order, line.created_at))[1] as first_line_name,
        pg_catalog.string_agg(line.name, ' ' order by line.sort_order, line.created_at) as line_names
      from public.quote_line_items as line
      where line.quote_id = candidate.id
    ) as line_summary on true
    where candidate.id = job.source_quote_id or candidate.job_id = job.id
    order by (candidate.id = job.source_quote_id) desc, (candidate.status = 'approved') desc, candidate.created_at desc
    limit 1
  ) as quote on true
  left join lateral (
    select
      candidate.id,
      candidate.invoice_number,
      candidate.status,
      candidate.total_cents,
      candidate.balance_due_cents,
      candidate.due_at
    from public.invoices as candidate
    where candidate.job_id = job.id and candidate.status <> 'void'
    order by candidate.created_at, candidate.id
    limit 1
  ) as invoice on true
  left join lateral (
    select pg_catalog.count(*)::integer as unbilled_count
    from public.change_orders as change_order
    where change_order.job_id = job.id
      and change_order.status = 'approved'
      and change_order.invoice_id is null
  ) as change_orders on true
  left join lateral (
    select pg_catalog.count(*)::integer as failed_count
    from public.customer_communications as communication
    left join public.appointments as related_appointment on related_appointment.id = communication.appointment_id
    where communication.status = 'failed'
      and (communication.job_id = job.id or related_appointment.job_id = job.id)
  ) as communications on true
  left join lateral (
    select true as has_cancelled_appointment
    from public.appointments as cancelled
    where cancelled.job_id = job.id
      and cancelled.appointment_type in ('job', 'maintenance')
      and cancelled.status = 'cancelled'
    limit 1
  ) as cancelled_appointment on true
), derived as (
  select
    job_facts.*,
    case
      when invoice_status = 'paid' or job_status = 'paid' then 'paid'
      when invoice_status in ('sent', 'partially_paid', 'overdue') or job_status = 'invoiced' then 'invoiced'
      when job_status in ('cancelled', 'lost') then 'cancelled'
      when job_status in ('completed', 'completed_pending_review', 'ready_to_invoice') then 'work_complete'
      when job_status = 'returned_for_correction' then 'needs_attention'
      when job_status = 'in_progress' or appointment_status = 'in_progress' then 'in_progress'
      when appointment_starts_at is not null and appointment_starts_at <= pg_catalog.now() then 'in_progress'
      when appointment_starts_at is not null then 'scheduled'
      else 'to_be_scheduled'
    end as operational_state
  from job_facts
)
select
  derived.id,
  derived.customer_id,
  derived.organization_id,
  derived.service_location_id,
  derived.assigned_crew_user_id,
  derived.source_quote_id,
  derived.job_status,
  derived.operational_state,
  derived.priority,
  derived.service_type,
  derived.display_title,
  derived.requested_scope,
  derived.contracting_party_name,
  derived.customer_name,
  derived.organization_name,
  derived.street,
  derived.city,
  derived.state,
  derived.postal_code,
  derived.assigned_crew_name,
  derived.assigned_crew_email,
  derived.appointment_id,
  derived.appointment_status,
  derived.appointment_starts_at,
  derived.appointment_ends_at,
  (derived.appointment_starts_at at time zone 'America/New_York')::date as appointment_local_date,
  derived.quote_id,
  derived.quote_number,
  derived.quote_status,
  case when app_private.has_financial_reporting_role() then derived.quote_total_cents_unmasked else null end as quote_total_cents,
  derived.invoice_id,
  derived.invoice_number,
  derived.invoice_status,
  case when app_private.has_financial_reporting_role() then derived.invoice_total_cents_unmasked else null end as invoice_total_cents,
  case when app_private.has_financial_reporting_role() then derived.invoice_balance_due_cents_unmasked else null end as invoice_balance_due_cents,
  derived.invoice_due_at,
  derived.approved_unbilled_change_order_count,
  derived.failed_communication_count,
  coalesce(derived.has_cancelled_appointment, false) as has_cancelled_appointment,
  coalesce((
    derived.job_status = 'returned_for_correction'
    or derived.customer_id is null and derived.organization_id is null
    or derived.service_location_id is null
    or derived.failed_communication_count > 0
    or derived.approved_unbilled_change_order_count > 0
    or derived.invoice_status = 'overdue'
    or (
      coalesce(derived.has_cancelled_appointment, false)
      and derived.operational_state in ('to_be_scheduled', 'scheduled', 'in_progress')
      and derived.appointment_id is null
    )
  ), false) as needs_attention,
  (derived.appointment_starts_at at time zone 'America/New_York')::date = (pg_catalog.now() at time zone 'America/New_York')::date as is_today,
  (
    derived.invoice_status in ('draft', 'sent', 'partially_paid', 'overdue')
    or derived.job_status in ('completed', 'completed_pending_review', 'ready_to_invoice') and derived.invoice_id is null
    or derived.approved_unbilled_change_order_count > 0
  ) as is_billing,
  (
    derived.job_status in ('completed', 'completed_pending_review', 'ready_to_invoice')
    and derived.invoice_id is null
  ) as awaiting_invoice,
  case
    when derived.operational_state = 'in_progress' then 10
    when (derived.appointment_starts_at at time zone 'America/New_York')::date = (pg_catalog.now() at time zone 'America/New_York')::date then 20
    when derived.appointment_starts_at < pg_catalog.now() then 30
    when derived.job_status = 'returned_for_correction' then 35
    when derived.operational_state = 'to_be_scheduled' then 40
    when derived.operational_state = 'scheduled' then 50
    when derived.job_status in ('completed', 'completed_pending_review', 'ready_to_invoice') and derived.invoice_id is null then 60
    else 90
  end as action_rank,
  pg_catalog.lower(pg_catalog.concat_ws(
    ' ',
    derived.contracting_party_name,
    derived.street,
    derived.city,
    derived.state,
    derived.postal_code,
    derived.display_title,
    derived.service_type,
    derived.requested_scope,
    derived.quote_number,
    derived.quote_line_names,
    derived.invoice_number
  )) as search_text,
  derived.updated_at,
  derived.created_at
from derived;

comment on view public.job_operations_index is
  'RLS-aware operations read model for URL-filtered, paginated admin job lists.';

revoke all on table public.job_operations_index from public, anon;
grant select on table public.job_operations_index to authenticated, service_role;
