-- Local-only jobs index fixture. Run after creating owner and crew auth users:
-- psql ... -v owner_id='<uuid>' -v crew_id='<uuid>' -f this-file
-- Reset the local database after verification. Never run this in production.

\set ON_ERROR_STOP on

create temporary table index_fixture (scenario text primary key, job_id uuid, customer_id uuid, location_id uuid);

with customers as (
  insert into public.customers (display_name, customer_type, email, phone)
  select name, 'residential', lower(replace(name, ' ', '.')) || '@example.test', '540-555-0100'
  from (values
    ('Mark Mayer'), ('Lena Ortiz'), ('Harrison Family'), ('Oak Ridge HOA'), ('Victor Bell'),
    ('Dana Brooks'), ('Robert King'), ('Maya Patel'), ('Helen Turner'), ('Carl Young'), ('Nora Wilson')
  ) names(name)
  returning id, display_name
), locations as (
  insert into public.service_locations (customer_id, label, street, city, state, postal_code)
  select id, 'Primary service location',
    case display_name
      when 'Mark Mayer' then '8 Herrick Ct'
      when 'Lena Ortiz' then '6917 Bloomsbury Ln'
      when 'Harrison Family' then '2410 River Rd'
      when 'Oak Ridge HOA' then '9050 Chancellor Rd'
      when 'Victor Bell' then '112 King George Dr'
      when 'Dana Brooks' then '43 Caroline St'
      when 'Robert King' then '1800 Lafayette Blvd'
      when 'Maya Patel' then '720 Stafford Ave'
      when 'Helen Turner' then '31 Lee Hill School Dr'
      when 'Carl Young' then '510 Ferry Rd'
      else '77 Fall Hill Ave'
    end,
    case when display_name in ('Lena Ortiz', 'Maya Patel') then 'Stafford' else 'Fredericksburg' end,
    'VA', '22401'
  from customers
  returning id, customer_id
), paired as (
  select location.id as location_id, location.customer_id, customer.display_name,
    pg_catalog.row_number() over (order by customer.display_name) as row_number
  from locations location join customers customer on customer.id = location.customer_id
), scenarios as (
  select * from (values
    (1, 'unscheduled', 'accepted', 'tree_removal', E'Remove declining oak beside the garage.\nProtect the roof, driveway, and nearby ornamental maple.'),
    (2, 'today', 'scheduled', 'trimming', E'Prune mature maples over the driveway and remove deadwood.\nRaise canopy for vehicle clearance.'),
    (3, 'future', 'scheduled', 'stump_grinding', 'Grind three front-yard stumps below grade and rake the work area.'),
    (4, 'overdue_start', 'scheduled', 'tree_removal', 'Remove storm-damaged pine and clear the access lane.'),
    (5, 'persisted_progress', 'in_progress', 'emergency', 'Stabilize split oak and remove the hanging lead over the residence.'),
    (6, 'awaiting_invoice', 'completed', 'landscaping', 'Install mulch rings and complete seasonal bed cleanup.'),
    (7, 'draft_invoice', 'completed', 'tree_removal', 'Remove dead cypress and haul all debris.'),
    (8, 'sent_invoice', 'invoiced', 'trimming', 'Prune roadside oaks and clear signs and street lights.'),
    (9, 'paid', 'paid', 'lawn_care', 'Completed spring lawn restoration and seeding.'),
    (10, 'correction', 'returned_for_correction', 'tree_removal', 'Review completion photos and confirm rear-lot debris pickup.'),
    (11, 'cancelled_visit', 'accepted', 'other', E'Remove two declining trees and prune the remaining canopy.\nCoordinate access with the homeowner before arrival.')
  ) as value(row_number, scenario, status, service_type, scope)
), inserted as (
  insert into public.jobs (customer_id, service_location_id, assigned_crew_user_id, status, service_type, requested_scope, priority, projected_value_cents)
  select paired.customer_id, paired.location_id,
    case when scenarios.scenario in ('today', 'future', 'persisted_progress', 'sent_invoice') then :'crew_id'::uuid else null::uuid end,
    scenarios.status, scenarios.service_type, scenarios.scope,
    case scenarios.scenario when 'persisted_progress' then 'emergency' when 'correction' then 'urgent' else 'normal' end,
    100000 + scenarios.row_number * 25000
  from scenarios join paired using (row_number)
  returning id, customer_id, service_location_id, requested_scope
)
insert into index_fixture (scenario, job_id, customer_id, location_id)
select scenarios.scenario, inserted.id, inserted.customer_id, inserted.service_location_id
from inserted join scenarios on scenarios.scope = inserted.requested_scope;

insert into public.quotes (job_id, customer_id, service_location_id, status, quote_number, subtotal_cents, total_cents, approved_at)
select fixture.job_id, fixture.customer_id, fixture.location_id, 'approved', 'Q-IDX-' || upper(left(fixture.scenario, 8)), 100000, 100000, now()
from index_fixture fixture;

insert into public.quote_line_items (quote_id, name, description, quantity, unit_price_cents, total_cents, sort_order)
select quote.id,
  case fixture.scenario when 'cancelled_visit' then 'Tree removal and pruning' else initcap(replace(job.service_type, '_', ' ')) end,
  job.requested_scope, 1, quote.total_cents, quote.total_cents, 0
from public.quotes quote join index_fixture fixture on fixture.job_id = quote.job_id join public.jobs job on job.id = fixture.job_id;

update public.jobs job set source_quote_id = quote.id from public.quotes quote where quote.job_id = job.id;

insert into public.appointments (job_id, service_location_id, assigned_user_id, appointment_type, status, starts_at, ends_at)
select fixture.job_id, fixture.location_id,
  case when fixture.scenario in ('today', 'future', 'persisted_progress') then :'crew_id'::uuid else null::uuid end,
  'job', case fixture.scenario when 'persisted_progress' then 'in_progress' when 'cancelled_visit' then 'cancelled' else 'confirmed' end,
  case fixture.scenario when 'today' then now() + interval '2 hours' when 'future' then now() + interval '2 days' when 'overdue_start' then now() - interval '1 hour' when 'persisted_progress' then now() - interval '2 hours' when 'cancelled_visit' then now() + interval '1 day' end,
  case fixture.scenario when 'today' then now() + interval '6 hours' when 'future' then now() + interval '2 days 3 hours' when 'overdue_start' then now() + interval '2 hours' when 'persisted_progress' then now() + interval '2 hours' when 'cancelled_visit' then now() + interval '1 day 2 hours' end
from index_fixture fixture where fixture.scenario in ('today', 'future', 'overdue_start', 'persisted_progress', 'cancelled_visit');

insert into public.invoices (job_id, quote_id, customer_id, service_location_id, status, invoice_number, subtotal_cents, total_cents, balance_due_cents, due_at, paid_at)
select fixture.job_id, job.source_quote_id, fixture.customer_id, fixture.location_id,
  case fixture.scenario when 'draft_invoice' then 'draft' when 'sent_invoice' then 'sent' else 'paid' end,
  case fixture.scenario when 'draft_invoice' then 'INV-185' when 'sent_invoice' then 'INV-186' else 'INV-170' end,
  100000, 100000, case when fixture.scenario = 'paid' then 0 else 100000 end,
  case when fixture.scenario = 'sent_invoice' then now() - interval '2 days' else now() + interval '14 days' end,
  case when fixture.scenario = 'paid' then now() else null end
from index_fixture fixture join public.jobs job on job.id = fixture.job_id
where fixture.scenario in ('draft_invoice', 'sent_invoice', 'paid');

insert into public.change_orders (source_quote_id, job_id, customer_id, service_location_id, created_by_user_id, title, status, subtotal_cents, total_cents, approved_at)
select job.source_quote_id, fixture.job_id, fixture.customer_id, fixture.location_id, :'owner_id'::uuid, 'Additional limb removal', 'approved', 35000, 35000, now()
from index_fixture fixture join public.jobs job on job.id = fixture.job_id where fixture.scenario = 'awaiting_invoice';

insert into public.customer_communications (communication_type, reminder_stage, customer_id, job_id, recipient_email, scheduled_for, status, idempotency_key, created_by_user_id, last_error)
select 'work_reminder', 'manual', fixture.customer_id, fixture.job_id, 'customer@example.test', now(), 'failed', 'idx-failed-' || fixture.job_id, :'owner_id'::uuid, 'Local test delivery failure'
from index_fixture fixture where fixture.scenario = 'correction';

insert into public.jobs (customer_id, service_location_id, status, service_type, requested_scope, priority, projected_value_cents, created_at, updated_at)
select fixture.customer_id, fixture.location_id, 'paid', 'tree_removal', 'Historical completed tree service #' || series, 'normal', 50000,
  now() - (series || ' days')::interval, now() - (series || ' days')::interval
from index_fixture fixture cross join generate_series(1, 34) series where fixture.scenario = 'paid';

select operational_state, count(*) from public.job_operations_index group by operational_state order by operational_state;
select fixture.scenario, view_row.operational_state, view_row.display_title, view_row.invoice_status, view_row.needs_attention
from index_fixture fixture join public.job_operations_index view_row on view_row.id = fixture.job_id order by fixture.scenario;
