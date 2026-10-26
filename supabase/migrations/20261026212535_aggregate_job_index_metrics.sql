begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
create function public.get_job_index_metrics(p_filters jsonb, p_crew_job_ids uuid[] default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare target text; search_clause text; pattern text; result jsonb;
begin
 if p_filters is null or jsonb_typeof(p_filters)<>'object' or length(p_filters::text)>4000 or coalesce(cardinality(p_crew_job_ids),0)>10000 then
  raise exception 'Invalid job filters.' using errcode='22023';
 end if;
 pattern:=nullif(p_filters->>'searchPattern','');
 target:=case when pattern is null then 'job_operations_list_index' else 'job_operations_search_index' end;
 search_clause:=case when pattern is null then 'true' else 'expanded_search_text ilike $2' end;
 -- Only these two constant view names/clauses enter SQL. Every user value is bound.
 execute pg_catalog.format($q$
  with visible as materialized (
   select job_status,operational_state,is_today,awaiting_invoice,invoice_status from public.%I
   where (case when $1::boolean then archived_at is not null else archived_at is null end)
    and (%s) and ($3::text is null or city=$3) and ($4::text is null or priority=$4)
    and ($5::text is null or case when $5='none' then invoice_id is null when $5='unpaid' then invoice_status in ('draft','sent','partially_paid','overdue') else invoice_status=$5 end)
    and ($6::date is null or appointment_local_date=$6) and ($7::uuid[] is null or id=any($7))
  ) select jsonb_build_object(
   'toBeScheduled',count(*) filter(where job_status='accepted' and operational_state='to_be_scheduled'),
   'today',count(*) filter(where job_status in ('accepted','scheduled','in_progress','returned_for_correction','completed_pending_review','ready_to_invoice','completed') and is_today),
   'inProgress',count(*) filter(where job_status in ('accepted','scheduled','in_progress','returned_for_correction','completed_pending_review','ready_to_invoice','completed') and operational_state='in_progress'),
   'awaitingInvoice',count(*) filter(where awaiting_invoice),
   'unpaidInvoices',count(*) filter(where invoice_status in ('draft','sent','partially_paid','overdue'))
  ) from visible
 $q$,target,search_clause)
 into result using coalesce((p_filters->>'archived')::boolean,false),pattern,nullif(p_filters->>'city',''),nullif(p_filters->>'priority',''),nullif(p_filters->>'invoiceStatus',''),nullif(p_filters->>'scheduledDate','')::date,p_crew_job_ids;
 return result;
end;
$$;
revoke all on function public.get_job_index_metrics(jsonb,uuid[]) from public,anon,service_role;
grant execute on function public.get_job_index_metrics(jsonb,uuid[]) to authenticated;
comment on function public.get_job_index_metrics(jsonb,uuid[]) is 'Five existing operations summaries from one caller-RLS scan; operational-view filtering remains deliberately excluded.';
notify pgrst,'reload schema';
commit;
