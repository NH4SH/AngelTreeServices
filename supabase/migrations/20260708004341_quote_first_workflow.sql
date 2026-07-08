-- Quote-first workflow support.
--
-- Quotes can now be drafted before a work order exists. Existing job-linked
-- quotes keep their links, and approved quotes can create exactly one source
-- job/work order.

alter table public.quotes
  alter column job_id drop not null;

alter table public.quotes
  add column if not exists service_location_id uuid references public.service_locations(id) on delete set null,
  add column if not exists estimate_schedule_event_id uuid references public.schedule_events(id) on delete set null,
  add column if not exists sent_at timestamptz;

update public.quotes q
set service_location_id = j.service_location_id
from public.jobs j
where q.job_id = j.id
  and q.service_location_id is null;

create index if not exists quotes_customer_id_idx on public.quotes(customer_id);
create index if not exists quotes_service_location_id_idx on public.quotes(service_location_id);
create index if not exists quotes_estimate_schedule_event_id_idx on public.quotes(estimate_schedule_event_id);
create index if not exists quotes_sent_at_idx on public.quotes(sent_at);

alter table public.jobs
  add column if not exists source_quote_id uuid references public.quotes(id) on delete set null;

create unique index if not exists jobs_source_quote_id_unique_idx
  on public.jobs(source_quote_id)
  where source_quote_id is not null;
