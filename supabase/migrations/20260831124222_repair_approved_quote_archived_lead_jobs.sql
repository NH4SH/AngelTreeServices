-- Restore website-intake rows that were archived after quote creation but later
-- became the linked work order for an approved quote. Manually archived active
-- work orders and closed/lost leads are intentionally excluded.
update public.jobs as job
set
  archived_at = null,
  archived_by_user_id = null,
  lead_disposition = 'active'
from public.quotes as quote
where quote.job_id = job.id
  and quote.status = 'approved'
  and job.website_submission_id is not null
  and job.lead_disposition = 'archived'
  and job.archived_at is not null
  and job.status in ('new_lead', 'estimate_scheduled', 'quoted')
  and (job.source_quote_id is null or job.source_quote_id = quote.id)
  and not exists (
    select 1
    from public.jobs as other_job
    where other_job.source_quote_id = quote.id
      and other_job.id <> job.id
  );

-- Run separately because prevent_inactive_lead_conversion deliberately blocks a
-- status transition while the old lead disposition is archived.
update public.jobs as job
set
  status = 'accepted',
  source_quote_id = coalesce(job.source_quote_id, quote.id)
from public.quotes as quote
where quote.job_id = job.id
  and quote.status = 'approved'
  and job.website_submission_id is not null
  and job.lead_disposition = 'active'
  and job.archived_at is null
  and job.status in ('new_lead', 'estimate_scheduled', 'quoted')
  and (job.source_quote_id is null or job.source_quote_id = quote.id)
  and not exists (
    select 1
    from public.jobs as other_job
    where other_job.source_quote_id = quote.id
      and other_job.id <> job.id
  );
