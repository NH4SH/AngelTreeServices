begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';

-- Preserve the existing operational semantics, financial masking and caller RLS.
-- Ordinary paging/counts need archive metadata, but not expanded text search's
-- additional customer, invoice, quote and contact joins.
create view public.job_operations_list_index
with (security_invoker = true)
as
select operation.*, job.archived_at, job.archived_by_user_id
from public.job_operations_index operation
join public.jobs job on job.id = operation.id;

revoke all on table public.job_operations_list_index from public, anon;
grant select on table public.job_operations_list_index to authenticated, service_role;
comment on view public.job_operations_list_index is
  'Caller-RLS operations list with archive metadata; expanded text search remains in job_operations_search_index.';
notify pgrst, 'reload schema';
commit;
