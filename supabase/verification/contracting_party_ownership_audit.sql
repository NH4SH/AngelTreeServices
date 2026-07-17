-- Run in Supabase SQL Editor before applying
-- 20260717040930_contracting_party_integrity_and_review.sql.
-- This script is read-only and intentionally makes no ownership decisions.

select 'quotes' as table_name,
  count(*) filter (where customer_id is not null and organization_id is null) as individual_owned,
  count(*) filter (where customer_id is null and organization_id is not null) as organization_owned,
  count(*) filter (where customer_id is not null and organization_id is not null) as both_set,
  count(*) filter (where customer_id is null and organization_id is null) as neither_set
from public.quotes
union all
select 'jobs',
  count(*) filter (where customer_id is not null and organization_id is null),
  count(*) filter (where customer_id is null and organization_id is not null),
  count(*) filter (where customer_id is not null and organization_id is not null),
  count(*) filter (where customer_id is null and organization_id is null)
from public.jobs
union all
select 'invoices',
  count(*) filter (where customer_id is not null and organization_id is null),
  count(*) filter (where customer_id is null and organization_id is not null),
  count(*) filter (where customer_id is not null and organization_id is not null),
  count(*) filter (where customer_id is null and organization_id is null)
from public.invoices
union all
select 'change_orders',
  count(*) filter (where customer_id is not null and organization_id is null),
  count(*) filter (where customer_id is null and organization_id is not null),
  count(*) filter (where customer_id is not null and organization_id is not null),
  count(*) filter (where customer_id is null and organization_id is null)
from public.change_orders
union all
select 'service_locations',
  count(*) filter (where customer_id is not null and organization_id is null),
  count(*) filter (where customer_id is null and organization_id is not null),
  count(*) filter (where customer_id is not null and organization_id is not null),
  count(*) filter (where customer_id is null and organization_id is null)
from public.service_locations;

select 'quote' as record_type, id, customer_id, organization_id, legacy_customer_id
from public.quotes where (customer_id is null) = (organization_id is null) or legacy_customer_id is not null
union all
select 'job', id, customer_id, organization_id, legacy_customer_id
from public.jobs where (customer_id is null) = (organization_id is null) or legacy_customer_id is not null
union all
select 'invoice', id, customer_id, organization_id, legacy_customer_id
from public.invoices where (customer_id is null) = (organization_id is null) or legacy_customer_id is not null
order by record_type, id;

select invoice.id as invoice_id, invoice.customer_id, invoice.organization_id,
  job.id as job_id, job.customer_id as job_customer_id, job.organization_id as job_organization_id
from public.invoices invoice
join public.jobs job on job.id = invoice.job_id
where invoice.customer_id is distinct from job.customer_id
   or invoice.organization_id is distinct from job.organization_id;

select payment.id as payment_id, payment.invoice_id,
  payment.customer_id, payment.organization_id,
  invoice.customer_id as invoice_customer_id, invoice.organization_id as invoice_organization_id
from public.payments payment
join public.invoices invoice on invoice.id = payment.invoice_id
where payment.customer_id is distinct from invoice.customer_id
   or payment.organization_id is distinct from invoice.organization_id;
