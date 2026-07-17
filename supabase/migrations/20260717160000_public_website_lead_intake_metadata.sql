-- Track public website lead-intake metadata directly on legacy lead jobs so
-- retries, attribution, and notification outcomes stay attached to the CRM
-- record staff already use.

alter table public.jobs
  add column if not exists website_submission_id text,
  add column if not exists website_request_fingerprint text,
  add column if not exists duplicate_of_job_id uuid references public.jobs(id) on delete set null,
  add column if not exists source_detail text,
  add column if not exists source_page_url text,
  add column if not exists source_referrer_url text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term text,
  add column if not exists utm_content text,
  add column if not exists preferred_contact_method text,
  add column if not exists preferred_appointment_timing text,
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'failed', 'skipped')),
  add column if not exists notification_error text;

create unique index if not exists jobs_website_submission_id_unique_idx
  on public.jobs(website_submission_id)
  where website_submission_id is not null;

create index if not exists jobs_website_request_fingerprint_idx
  on public.jobs(website_request_fingerprint, submitted_at desc)
  where website_request_fingerprint is not null;

create index if not exists jobs_source_detail_submitted_idx
  on public.jobs(source_detail, submitted_at desc)
  where source_detail is not null;
