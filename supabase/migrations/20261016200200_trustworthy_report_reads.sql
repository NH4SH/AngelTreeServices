-- PR17: complete, selected-view report reads. No writes to business history,
-- feature flags, RLS policies or provider configuration. All projections retain
-- caller RLS, live role checks, explicit estimator scope and narrow DTOs.

create view app_private.report_quotes with (security_invoker=true) as
select q.id::text id, q.created_at at, q.customer_id customer_id,
 q.organization_id organization_id, array[q.estimator_user_id] employee_ids,
 coalesce(j.lead_source_id,c.lead_source_id) source_id, array(select distinct l.service_category_id from public.quote_line_items l where l.quote_id=q.id and l.service_category_id is not null) service_ids, q.status::text status,
 q.total_cents::numeric amount, jsonb_build_object('ageDays',greatest(0,extract(epoch from(now()-q.created_at))/86400),'staleDraft',(q.status='draft' and extract(epoch from(now()-q.created_at))/86400>(select draft_quote_stale_days from public.reporting_settings where singleton_key))::integer,'staleSent',(q.status='sent' and extract(epoch from(now()-coalesce(q.sent_at,q.created_at)))/86400>(select sent_quote_stale_days from public.reporting_settings where singleton_key))::integer,'quotedCents',q.total_cents,'eligible',(q.status not in ('draft','cancelled'))::integer,'approved',((q.status not in ('draft','cancelled')) and (q.status='approved' or q.approved_at is not null))::integer,'approvedCents',case when (q.status not in ('draft','cancelled')) and (q.status='approved' or q.approved_at is not null) then q.total_cents else 0 end,'declined',(q.status='declined')::integer,'sent',(q.sent_at is not null)::integer,'sendDays',case when q.sent_at is not null then greatest(0,extract(epoch from(q.sent_at-q.created_at))/86400) else 0 end,'approvalDays',case when q.sent_at is not null and q.approved_at is not null then greatest(0,extract(epoch from(q.approved_at-q.sent_at))/86400) else 0 end,'approvalTimed',(q.sent_at is not null and q.approved_at is not null)::integer) stats, jsonb_build_object('number',coalesce(q.quote_number,q.id::text),'party',coalesce(o.name,c.display_name,'Unknown account'),'estimator',coalesce(p.full_name,'Not assigned'),'status',q.status,'quotedCents',q.total_cents,'createdAt',q.created_at,'sentAt',q.sent_at,'approvedAt',q.approved_at,'href','/admin/quotes/'||q.id) cells, jsonb_build_object('status',q.status,'estimator',jsonb_build_object('key',coalesce(q.estimator_user_id::text,'unknown'),'label',coalesce(p.full_name,'Not assigned')),'source',jsonb_build_object('key',coalesce(ls.id::text,'unknown'),'label',coalesce(ls.name,'Not recorded'))) groups
from public.quotes q left join public.customers c on c.id=q.customer_id left join public.organizations o on o.id=q.organization_id left join public.profiles p on p.id=q.estimator_user_id left join public.jobs j on j.id=q.job_id left join public.lead_sources ls on ls.id=coalesce(j.lead_source_id,c.lead_source_id)
where (select app_private.has_staff_role()) and (q.archived_at is null and ((select app_private.has_financial_reporting_role()) or q.estimator_user_id=(select auth.uid())));
revoke all on app_private.report_quotes from public,anon,authenticated,service_role;
grant select on app_private.report_quotes to authenticated;

create view app_private.report_jobs with (security_invoker=true) as
select j.id::text id, j.created_at at, j.customer_id customer_id,
 j.organization_id organization_id, array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,
 j.lead_source_id source_id, array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids, j.status::text status,
 null::numeric::numeric amount, jsonb_build_object('leads',1,'newLeads',(j.status in ('new_lead','estimate_scheduled'))::integer,'ageDays',greatest(0,extract(epoch from(now()-j.created_at))/86400),'unscheduled',(j.status='accepted' and not exists(select 1 from public.schedule_events e where e.job_id=j.id and e.status<>'cancelled' and e.event_type='job'))::integer,'awaitingInvoice',(j.completed_at is not null and not exists(select 1 from public.invoices i where i.job_id=j.id and i.status not in ('draft','void')))::integer,'staleLead',(j.status in ('new_lead','estimate_scheduled') and ((greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),j.created_at)::date)/7)*5+(select count(*) from generate_series(1,greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),j.created_at)::date)%7) days(n) where extract(isodow from timezone((select business_timezone from public.reporting_settings where singleton_key),j.created_at)::date+days.n)<6))>(select lead_stale_business_days from public.reporting_settings where singleton_key))::integer) stats, jsonb_build_object('number',coalesce(j.service_type,'Work order'),'party',coalesce(o.name,c.display_name,'Unknown account'),'status',j.status,'createdAt',j.created_at,'completedAt',j.completed_at,'href','/admin/jobs/'||j.id) cells, jsonb_build_object('status',j.status,'source',jsonb_build_object('key',coalesce(ls.id::text,'unknown'),'label',coalesce(ls.name,'Not recorded')),'party',jsonb_build_object('key',coalesce('organization:'||o.id,'customer:'||c.id,'unknown'),'label',coalesce(o.name,c.display_name,'Unknown account')),'area',coalesce(sl.city||', '||sl.state||coalesce(' '||sl.postal_code,''),'Not recorded')) groups
from public.jobs j left join public.customers c on c.id=j.customer_id left join public.organizations o on o.id=j.organization_id left join public.lead_sources ls on ls.id=j.lead_source_id left join public.service_locations sl on sl.id=j.service_location_id
where (select app_private.has_financial_reporting_role()) and (j.archived_at is null and j.lead_disposition='active');
revoke all on app_private.report_jobs from public,anon,authenticated,service_role;
grant select on app_private.report_jobs to authenticated;

create view app_private.report_backlog with (security_invoker=true) as
select j.id::text id, j.created_at at, j.customer_id customer_id,
 j.organization_id organization_id, array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,
 j.lead_source_id source_id, array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids, j.status::text status,
 null::numeric::numeric amount, jsonb_build_object('leads',1,'newLeads',(j.status in ('new_lead','estimate_scheduled'))::integer,'ageDays',greatest(0,extract(epoch from(now()-j.created_at))/86400),'unscheduled',(j.status='accepted' and not exists(select 1 from public.schedule_events e where e.job_id=j.id and e.status<>'cancelled' and e.event_type='job'))::integer,'awaitingInvoice',(j.completed_at is not null and not exists(select 1 from public.invoices i where i.job_id=j.id and i.status not in ('draft','void')))::integer,'staleLead',(j.status in ('new_lead','estimate_scheduled') and ((greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),j.created_at)::date)/7)*5+(select count(*) from generate_series(1,greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),j.created_at)::date)%7) days(n) where extract(isodow from timezone((select business_timezone from public.reporting_settings where singleton_key),j.created_at)::date+days.n)<6))>(select lead_stale_business_days from public.reporting_settings where singleton_key))::integer) stats, jsonb_build_object('number',coalesce(j.service_type,'Work order'),'party',coalesce(o.name,c.display_name,'Unknown account'),'status',j.status,'createdAt',j.created_at,'completedAt',j.completed_at,'href','/admin/jobs/'||j.id) cells, jsonb_build_object('status',j.status,'source',jsonb_build_object('key',coalesce(ls.id::text,'unknown'),'label',coalesce(ls.name,'Not recorded')),'party',jsonb_build_object('key',coalesce('organization:'||o.id,'customer:'||c.id,'unknown'),'label',coalesce(o.name,c.display_name,'Unknown account')),'area',coalesce(sl.city||', '||sl.state||coalesce(' '||sl.postal_code,''),'Not recorded')) groups
from public.jobs j left join public.customers c on c.id=j.customer_id left join public.organizations o on o.id=j.organization_id left join public.lead_sources ls on ls.id=j.lead_source_id left join public.service_locations sl on sl.id=j.service_location_id
where (select app_private.has_financial_reporting_role()) and (j.archived_at is null and j.lead_disposition='active');
revoke all on app_private.report_backlog from public,anon,authenticated,service_role;
grant select on app_private.report_backlog to authenticated;

create view app_private.report_completed with (security_invoker=true) as
select j.id::text id, j.completed_at at, j.customer_id customer_id,
 j.organization_id organization_id, array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,
 j.lead_source_id source_id, array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids, j.status::text status,
 null::numeric::numeric amount, jsonb_build_object('leads',1,'newLeads',(j.status in ('new_lead','estimate_scheduled'))::integer,'ageDays',greatest(0,extract(epoch from(now()-j.created_at))/86400),'unscheduled',(j.status='accepted' and not exists(select 1 from public.schedule_events e where e.job_id=j.id and e.status<>'cancelled' and e.event_type='job'))::integer,'awaitingInvoice',(j.completed_at is not null and not exists(select 1 from public.invoices i where i.job_id=j.id and i.status not in ('draft','void')))::integer,'staleLead',(j.status in ('new_lead','estimate_scheduled') and ((greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),j.created_at)::date)/7)*5+(select count(*) from generate_series(1,greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),j.created_at)::date)%7) days(n) where extract(isodow from timezone((select business_timezone from public.reporting_settings where singleton_key),j.created_at)::date+days.n)<6))>(select lead_stale_business_days from public.reporting_settings where singleton_key))::integer) stats, jsonb_build_object('number',coalesce(j.service_type,'Work order'),'party',coalesce(o.name,c.display_name,'Unknown account'),'status',j.status,'createdAt',j.created_at,'completedAt',j.completed_at,'href','/admin/jobs/'||j.id) cells, jsonb_build_object('status',j.status,'source',jsonb_build_object('key',coalesce(ls.id::text,'unknown'),'label',coalesce(ls.name,'Not recorded')),'party',jsonb_build_object('key',coalesce('organization:'||o.id,'customer:'||c.id,'unknown'),'label',coalesce(o.name,c.display_name,'Unknown account')),'area',coalesce(sl.city||', '||sl.state||coalesce(' '||sl.postal_code,''),'Not recorded')) groups
from public.jobs j left join public.customers c on c.id=j.customer_id left join public.organizations o on o.id=j.organization_id left join public.lead_sources ls on ls.id=j.lead_source_id left join public.service_locations sl on sl.id=j.service_location_id
where (select app_private.has_financial_reporting_role()) and (j.completed_at is not null);
revoke all on app_private.report_completed from public,anon,authenticated,service_role;
grant select on app_private.report_completed to authenticated;

create view app_private.report_invoices with (security_invoker=true) as
select i.id::text id, i.created_at at, i.customer_id customer_id,
 i.organization_id organization_id, array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,
 coalesce(j.lead_source_id,c.lead_source_id) source_id, array(select distinct l.service_category_id from public.invoice_line_items l where l.invoice_id=i.id and l.service_category_id is not null) service_ids, i.status::text status,
 i.total_cents::numeric amount, jsonb_build_object('invoicedCents',case when i.status not in ('draft','void') then i.total_cents else 0 end,'issued',(i.status not in ('draft','void'))::integer,'draftCents',case when i.status='draft' then i.total_cents else 0 end,'balanceCents',case when i.status not in ('draft','paid','void') and i.balance_due_cents>0 then i.balance_due_cents else 0 end,'overdueCents',case when i.status not in ('draft','paid','void') and i.balance_due_cents>0 and greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),i.due_at)::date)>0 then i.balance_due_cents else 0 end,'paid',(i.paid_at is not null)::integer,'paymentDays',case when i.paid_at is not null then greatest(0,extract(epoch from(i.paid_at-i.created_at))/86400) else 0 end) stats, jsonb_build_object('number',coalesce(i.invoice_number,i.id::text),'party',coalesce(o.name,c.display_name,'Unknown account'),'status',i.status,'invoicedCents',i.total_cents,'balanceCents',i.balance_due_cents,'createdAt',i.created_at,'dueAt',i.due_at,'paidAt',i.paid_at,'archived',(i.archived_at is not null)::integer,'href','/admin/invoices/'||i.id) cells, jsonb_build_object('status',i.status,'source',jsonb_build_object('key',coalesce(ls.id::text,'unknown'),'label',coalesce(ls.name,'Not recorded')),'party',jsonb_build_object('key',coalesce('organization:'||o.id,'customer:'||c.id,'unknown'),'label',coalesce(o.name,c.display_name,'Unknown account')),'month',to_char(timezone((select business_timezone from public.reporting_settings where singleton_key),i.created_at),'YYYY-MM'),'aging',case when i.due_at is null then 'Due date missing' when greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),i.due_at)::date)=0 then 'Current / not due' when greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),i.due_at)::date)<=30 then '1–30 days' when greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),i.due_at)::date)<=60 then '31–60 days' when greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),i.due_at)::date)<=90 then '61–90 days' else 'More than 90 days' end) groups
from public.invoices i left join public.customers c on c.id=i.customer_id left join public.organizations o on o.id=i.organization_id left join public.jobs j on j.id=i.job_id left join public.lead_sources ls on ls.id=coalesce(j.lead_source_id,c.lead_source_id)
where (select app_private.has_financial_reporting_role()) and (i.status<>'void');
revoke all on app_private.report_invoices from public,anon,authenticated,service_role;
grant select on app_private.report_invoices to authenticated;

create view app_private.report_ar with (security_invoker=true) as
select i.id::text id, i.created_at at, i.customer_id customer_id,
 i.organization_id organization_id, array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,
 coalesce(j.lead_source_id,c.lead_source_id) source_id, array(select distinct l.service_category_id from public.invoice_line_items l where l.invoice_id=i.id and l.service_category_id is not null) service_ids, i.status::text status,
 i.total_cents::numeric amount, jsonb_build_object('invoicedCents',case when i.status not in ('draft','void') then i.total_cents else 0 end,'issued',(i.status not in ('draft','void'))::integer,'draftCents',case when i.status='draft' then i.total_cents else 0 end,'balanceCents',case when i.status not in ('draft','paid','void') and i.balance_due_cents>0 then i.balance_due_cents else 0 end,'overdueCents',case when i.status not in ('draft','paid','void') and i.balance_due_cents>0 and greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),i.due_at)::date)>0 then i.balance_due_cents else 0 end,'paid',(i.paid_at is not null)::integer,'paymentDays',case when i.paid_at is not null then greatest(0,extract(epoch from(i.paid_at-i.created_at))/86400) else 0 end) stats, jsonb_build_object('number',coalesce(i.invoice_number,i.id::text),'party',coalesce(o.name,c.display_name,'Unknown account'),'status',i.status,'invoicedCents',i.total_cents,'balanceCents',i.balance_due_cents,'createdAt',i.created_at,'dueAt',i.due_at,'paidAt',i.paid_at,'archived',(i.archived_at is not null)::integer,'href','/admin/invoices/'||i.id) cells, jsonb_build_object('status',i.status,'source',jsonb_build_object('key',coalesce(ls.id::text,'unknown'),'label',coalesce(ls.name,'Not recorded')),'party',jsonb_build_object('key',coalesce('organization:'||o.id,'customer:'||c.id,'unknown'),'label',coalesce(o.name,c.display_name,'Unknown account')),'month',to_char(timezone((select business_timezone from public.reporting_settings where singleton_key),i.created_at),'YYYY-MM'),'aging',case when i.due_at is null then 'Due date missing' when greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),i.due_at)::date)=0 then 'Current / not due' when greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),i.due_at)::date)<=30 then '1–30 days' when greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),i.due_at)::date)<=60 then '31–60 days' when greatest(0,timezone((select business_timezone from public.reporting_settings where singleton_key),now())::date-timezone((select business_timezone from public.reporting_settings where singleton_key),i.due_at)::date)<=90 then '61–90 days' else 'More than 90 days' end) groups
from public.invoices i left join public.customers c on c.id=i.customer_id left join public.organizations o on o.id=i.organization_id left join public.jobs j on j.id=i.job_id left join public.lead_sources ls on ls.id=coalesce(j.lead_source_id,c.lead_source_id)
where (select app_private.has_financial_reporting_role()) and (i.status not in ('draft','paid','void') and i.balance_due_cents>0);
revoke all on app_private.report_ar from public,anon,authenticated,service_role;
grant select on app_private.report_ar to authenticated;

create view app_private.report_payments with (security_invoker=true) as
select p.id::text id, p.paid_at at, i.customer_id customer_id,
 i.organization_id organization_id, array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,
 coalesce(j.lead_source_id,c.lead_source_id) source_id, array(select distinct l.service_category_id from public.invoice_line_items l where l.invoice_id=i.id and l.service_category_id is not null) service_ids, p.status::text status,
 case when p.status='refunded' then 0 else greatest(0,p.amount_cents::bigint-greatest(0,p.refunded_principal_cents)::bigint-case when p.dispute_status='lost' then greatest(0,p.disputed_principal_cents)::bigint else 0 end) end::numeric amount, jsonb_build_object('grossCents',p.amount_cents,'collectedCents',case when p.status='refunded' then 0 else greatest(0,p.amount_cents::bigint-greatest(0,p.refunded_principal_cents)::bigint-case when p.dispute_status='lost' then greatest(0,p.disputed_principal_cents)::bigint else 0 end) end,'adjustmentCents',p.amount_cents-(case when p.status='refunded' then 0 else greatest(0,p.amount_cents::bigint-greatest(0,p.refunded_principal_cents)::bigint-case when p.dispute_status='lost' then greatest(0,p.disputed_principal_cents)::bigint else 0 end) end)) stats, jsonb_build_object('number',coalesce(i.invoice_number,i.id::text),'party',coalesce(o.name,c.display_name,'Unknown account'),'method',coalesce(p.payment_method,p.provider,'Other'),'status',p.status,'grossCents',p.amount_cents,'adjustmentCents',p.amount_cents-(case when p.status='refunded' then 0 else greatest(0,p.amount_cents::bigint-greatest(0,p.refunded_principal_cents)::bigint-case when p.dispute_status='lost' then greatest(0,p.disputed_principal_cents)::bigint else 0 end) end),'collectedCents',case when p.status='refunded' then 0 else greatest(0,p.amount_cents::bigint-greatest(0,p.refunded_principal_cents)::bigint-case when p.dispute_status='lost' then greatest(0,p.disputed_principal_cents)::bigint else 0 end) end,'paidAt',p.paid_at,'href','/admin/invoices/'||i.id) cells, jsonb_build_object('method',coalesce(p.payment_method,p.provider,'Other'),'party',jsonb_build_object('key',coalesce('organization:'||o.id,'customer:'||c.id,'unknown'),'label',coalesce(o.name,c.display_name,'Unknown account'))) groups
from public.payments p join public.invoices i on i.id=p.invoice_id left join public.jobs j on j.id=i.job_id left join public.customers c on c.id=i.customer_id left join public.organizations o on o.id=i.organization_id left join public.lead_sources ls on ls.id=coalesce(j.lead_source_id,c.lead_source_id)
where (select app_private.has_financial_reporting_role()) and (p.status in ('succeeded','refunded') and p.paid_at is not null);
revoke all on app_private.report_payments from public,anon,authenticated,service_role;
grant select on app_private.report_payments to authenticated;

create view app_private.report_time with (security_invoker=true) as
select t.id::text id, t.clock_in_at at, j.customer_id customer_id,
 j.organization_id organization_id, array[t.user_id] employee_ids,
 j.lead_source_id source_id, array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids, t.status::text status,
 null::numeric::numeric amount, jsonb_build_object('approvedHours',case when approval.approval_status='approved' and t.clock_out_at is not null and t.status<>'void' then greatest(0,extract(epoch from(t.clock_out_at-t.clock_in_at))/3600-t.break_minutes::numeric/60) else 0 end,'jobHours',case when approval.approval_status='approved' and t.clock_out_at is not null and t.status<>'void' and t.job_id is not null then greatest(0,extract(epoch from(t.clock_out_at-t.clock_in_at))/3600-t.break_minutes::numeric/60) else 0 end,'nonJobHours',case when approval.approval_status='approved' and t.clock_out_at is not null and t.status<>'void' and t.job_id is null then greatest(0,extract(epoch from(t.clock_out_at-t.clock_in_at))/3600-t.break_minutes::numeric/60) else 0 end,'unapproved',(not coalesce((approval.approval_status='approved' and t.clock_out_at is not null and t.status<>'void'),false))::integer) stats, jsonb_build_object('employee',coalesce(p.full_name,'Employee'),'type',t.entry_type,'jobId',t.job_id,'clockIn',t.clock_in_at,'clockOut',t.clock_out_at,'hours',case when t.clock_out_at is not null then greatest(0,extract(epoch from(t.clock_out_at-t.clock_in_at))/3600-t.break_minutes::numeric/60) else null end,'review',coalesce(approval.approval_status,'unreviewed'),'href',case when t.job_id is not null then '/admin/jobs/'||t.job_id else '/admin/time' end) cells, jsonb_build_object('employee',jsonb_build_object('key',t.user_id::text,'label',coalesce(p.full_name,'Employee')),'type',t.entry_type) groups
from public.time_entries t left join public.jobs j on j.id=t.job_id left join public.profiles p on p.id=t.user_id left join lateral(select a.approval_status from public.time_entry_approvals a where a.time_entry_id=t.id order by a.approved_at desc,a.id desc limit 1) approval on true
where (select app_private.has_financial_reporting_role()) and (t.status<>'void');
revoke all on app_private.report_time from public,anon,authenticated,service_role;
grant select on app_private.report_time to authenticated;

create view app_private.report_schedule with (security_invoker=true) as
select e.id::text id, e.starts_at at, j.customer_id customer_id,
 j.organization_id organization_id, array(select coalesce(a.user_id,er.auth_user_id) from public.schedule_event_assignments a left join public.employee_records er on er.id=a.employee_id where a.event_id=e.id) employee_ids,
 j.lead_source_id source_id, array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids, e.status::text status,
 null::numeric::numeric amount, jsonb_build_object('scheduledHours',case when e.status<>'cancelled' and e.ends_at is not null then greatest(0,extract(epoch from(e.ends_at-e.starts_at))/3600) else 0 end,'completed',(e.status='completed')::integer,'cancelled',(e.status='cancelled')::integer) stats, jsonb_build_object('title',e.title,'type',e.event_type,'status',e.status,'startsAt',e.starts_at,'hours',case when e.ends_at is not null then greatest(0,extract(epoch from(e.ends_at-e.starts_at))/3600) else null end,'jobId',e.job_id,'href','/admin/schedule?date='||to_char(timezone((select business_timezone from public.reporting_settings where singleton_key),e.starts_at),'YYYY-MM-DD')||'&event='||e.id) cells, jsonb_build_object('type',e.event_type) groups
from public.schedule_events e left join public.jobs j on j.id=e.job_id
where (select app_private.has_financial_reporting_role()) and (true);
revoke all on app_private.report_schedule from public,anon,authenticated,service_role;
grant select on app_private.report_schedule to authenticated;

create view app_private.report_cost_inputs with(security_invoker=true) as
with recursive ancestry as (
 select c.job_id,c.id,c.supersedes_cost_id from public.job_cost_entries c
 where c.review_status='approved' and c.archived_at is null and c.supersedes_cost_id is not null
 union
 select a.job_id,a.id,c.supersedes_cost_id from ancestry a join public.job_cost_entries c on c.id=a.supersedes_cost_id and c.job_id=a.job_id where c.supersedes_cost_id is not null
)
select c.id,c.job_id,c.amount_cents,c.category,c.description,c.incurred_on,c.review_status,c.archived_at,c.created_at,
 not exists(select 1 from ancestry a where a.job_id=c.job_id and a.supersedes_cost_id=c.id) is_current
from public.job_cost_entries c where (select app_private.has_financial_reporting_role());
revoke all on app_private.report_cost_inputs from public,anon,authenticated,service_role;
grant select on app_private.report_cost_inputs to authenticated;

create view app_private.report_profit_inputs with (security_invoker=true) as
with recursive replaced_costs as (
 select c.job_id,c.id,c.supersedes_cost_id from public.job_cost_entries c
 where c.review_status='approved' and c.archived_at is null and c.supersedes_cost_id is not null
 union
 select r.job_id,r.id,c.supersedes_cost_id from replaced_costs r
 join public.job_cost_entries c on c.id=r.supersedes_cost_id and c.job_id=r.job_id
 where c.supersedes_cost_id is not null
), invoice_totals as (
 select i.job_id,count(*) invoice_count,sum(i.total_cents::bigint) billed_cents
 from public.invoices i where i.status not in ('draft','void') group by i.job_id
), payment_adjustments as (
 select i.job_id,sum(least(i.total_cents,coalesce(p.adjustment_cents,0))) adjustment_cents,
 count(*) filter(where p.gross_cents>i.total_cents) allocation_issue_count
 from public.invoices i left join (
  select p.invoice_id,sum(p.amount_cents::bigint) gross_cents,sum(p.amount_cents::bigint-(case when p.status='refunded' then 0 else greatest(0,p.amount_cents::bigint-greatest(0,p.refunded_principal_cents)::bigint-case when p.dispute_status='lost' then greatest(0,p.disputed_principal_cents)::bigint else 0 end) end)) adjustment_cents
  from public.payments p where p.status in ('succeeded','refunded') group by p.invoice_id
 ) p on p.invoice_id=i.id
 where i.status not in ('draft','void') group by i.job_id
), labor as (
 select t.job_id,
 coalesce(sum(case when approval.approval_status='approved' and t.clock_out_at is not null and t.status<>'void' then greatest(0,extract(epoch from(t.clock_out_at-t.clock_in_at))/3600-t.break_minutes::numeric/60) else 0 end),0) labor_hours,
 coalesce(sum(case when approval.approval_status='approved' and t.clock_out_at is not null and t.status<>'void' and rate.rate_count<=1 and coalesce(rate.hourly_cost_cents,s.blended_labor_cost_cents) is not null then round(greatest(0,extract(epoch from(t.clock_out_at-t.clock_in_at))/3600-t.break_minutes::numeric/60)*coalesce(rate.hourly_cost_cents,s.blended_labor_cost_cents,0)*(1+coalesce(rate.burden_percent,s.default_labor_burden_percent,0)/100)) else 0 end),0) labor_cents,
 count(*) filter(where not coalesce((approval.approval_status='approved' and t.clock_out_at is not null and t.status<>'void'),false)) unapproved_count,
 count(*) filter(where approval.approval_status='approved' and t.clock_out_at is not null and t.status<>'void' and rate.rate_count=0 and s.blended_labor_cost_cents is null) missing_rate_count,
 count(*) filter(where approval.approval_status='approved' and t.clock_out_at is not null and t.status<>'void' and rate.rate_count>1) overlapping_rate_count
 from public.time_entries t cross join public.reporting_settings s left join lateral(select a.approval_status from public.time_entry_approvals a where a.time_entry_id=t.id order by a.approved_at desc,a.id desc limit 1) approval on true
 left join lateral (
  select count(*) rate_count,max(r.hourly_cost_cents) hourly_cost_cents,max(r.burden_percent) burden_percent
  from public.employee_labor_cost_rates r join public.employee_records er on er.id=r.employee_id
  where er.auth_user_id=t.user_id and r.effective_from<=timezone(s.business_timezone,t.clock_in_at)::date
   and (r.effective_to is null or r.effective_to>=timezone(s.business_timezone,t.clock_in_at)::date)
 ) rate on true
 where t.job_id is not null and t.status<>'void' group by t.job_id
), costs as (
 select c.job_id,
 coalesce(sum(c.amount_cents::bigint) filter(where c.review_status='approved' and not exists(select 1 from replaced_costs r where r.job_id=c.job_id and r.supersedes_cost_id=c.id)),0) direct_cents,
 count(*) filter(where c.review_status='pending') pending_costs
 from public.job_cost_entries c where c.archived_at is null group by c.job_id
), equipment as (
 select u.job_id,sum(u.calculated_cost_cents::bigint) equipment_cents,
 count(*) filter(where (u.usage_hours>0 and u.hourly_cost_cents_snapshot is null) or (u.usage_days>0 and u.daily_cost_cents_snapshot is null)) missing_equipment_rates
 from public.job_equipment_usage u group by u.job_id
)
select j.id,coalesce(i.invoice_count,0) invoice_count,coalesce(i.billed_cents,0) billed_cents,
 least(coalesce(i.billed_cents,0),coalesce(p.adjustment_cents,0)) adjustment_cents,
 greatest(0,coalesce(i.billed_cents,0)-coalesce(p.adjustment_cents,0)) revenue_cents,
 coalesce(l.labor_hours,0) labor_hours,coalesce(l.labor_cents,0) labor_cents,
 coalesce(c.direct_cents,0) direct_cents,coalesce(e.equipment_cents,0) equipment_cents,
 array_remove(array[
  case when coalesce(i.invoice_count,0)=0 then 'Invoice missing' end,
  case when p.allocation_issue_count>0 then 'Payment allocation needs review' end,
  case when coalesce(l.labor_hours,0)=0 then 'Approved time missing' end,
  case when l.unapproved_count>0 then 'Time needs review' end,
  case when l.missing_rate_count>0 then 'Labor rate missing' end,
  case when l.overlapping_rate_count>0 then 'Overlapping labor rates' end,
  case when c.pending_costs>0 then 'Costs need review' end,
  case when e.missing_equipment_rates>0 then 'Equipment rate missing' end
 ],null) issues,coalesce(l.missing_rate_count,0)>0 or coalesce(l.overlapping_rate_count,0)>0 rate_issue
from public.jobs j left join invoice_totals i on i.job_id=j.id
left join payment_adjustments p on p.job_id=j.id left join labor l on l.job_id=j.id
left join costs c on c.job_id=j.id left join equipment e on e.job_id=j.id
where (select app_private.has_financial_reporting_role()) and j.completed_at is not null;
revoke all on app_private.report_profit_inputs from public,anon,authenticated,service_role;
grant select on app_private.report_profit_inputs to authenticated;

create view app_private.report_profitability with (security_invoker=true) as
select j.id::text id, j.completed_at at, j.customer_id customer_id,
 j.organization_id organization_id, array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,
 j.lead_source_id source_id, array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids, j.status::text status,
 null::numeric::numeric amount, jsonb_build_object('revenueCents',x.revenue_cents,'complete',(cardinality(x.issues)=0)::integer,'completeRevenueCents',case when cardinality(x.issues)=0 then x.revenue_cents else 0 end,'profitCents',case when cardinality(x.issues)=0 then x.revenue_cents-x.labor_cents-x.direct_cents-x.equipment_cents else 0 end,'laborHours',x.labor_hours,'knownLaborCents',case when x.rate_issue then 0 else x.labor_cents end,'directCents',x.direct_cents,'equipmentCents',x.equipment_cents,'adjustmentCents',x.adjustment_cents) stats, jsonb_build_object('number',coalesce(j.service_type,'Work order'),'party',coalesce(o.name,c.display_name,'Unknown account'),'completedAt',j.completed_at,'invoiceCount',x.invoice_count,'billedCents',x.billed_cents,'adjustmentCents',x.adjustment_cents,'revenueCents',x.revenue_cents,'laborHours',x.labor_hours,'laborCents',case when x.rate_issue then null else x.labor_cents end,'directCents',x.direct_cents,'equipmentCents',x.equipment_cents,'profitCents',case when cardinality(x.issues)=0 then x.revenue_cents-x.labor_cents-x.direct_cents-x.equipment_cents else null end,'margin',case when cardinality(x.issues)=0 and x.revenue_cents>0 then (x.revenue_cents-x.labor_cents-x.direct_cents-x.equipment_cents)::numeric/x.revenue_cents*100 else null end,'issues',case when cardinality(x.issues)=0 then 'Recorded inputs complete' else array_to_string(x.issues,'; ') end,'href','/admin/jobs/'||j.id) cells, jsonb_build_object('completeness',case when cardinality(x.issues)=0 then 'Recorded inputs complete' else 'Needs input review' end) groups
from public.jobs j left join public.customers c on c.id=j.customer_id left join public.organizations o on o.id=j.organization_id left join public.lead_sources ls on ls.id=j.lead_source_id left join public.service_locations sl on sl.id=j.service_location_id join app_private.report_profit_inputs x on x.id=j.id
where (select app_private.has_financial_reporting_role()) and (true);
revoke all on app_private.report_profitability from public,anon,authenticated,service_role;
grant select on app_private.report_profitability to authenticated;

create view app_private.report_customers with (security_invoker=true) as
select c.id::text id, c.created_at at, c.id customer_id,
 null::uuid organization_id, '{}'::uuid[] employee_ids,
 null::uuid source_id, '{}'::uuid[] service_ids, c.status::text status,
 null::numeric::numeric amount, '{}'::jsonb stats, jsonb_build_object('party',c.display_name,'status',c.status,'createdAt',c.created_at,'href','/admin/customers/'||c.id) cells, '{}'::jsonb groups
from public.customers c
where (select app_private.has_financial_reporting_role()) and (c.archived_at is null);
revoke all on app_private.report_customers from public,anon,authenticated,service_role;
grant select on app_private.report_customers to authenticated;

create view app_private.report_organizations with (security_invoker=true) as
select o.id::text id, o.created_at at, null::uuid customer_id,
 o.id organization_id, '{}'::uuid[] employee_ids,
 null::uuid source_id, '{}'::uuid[] service_ids, o.status::text status,
 null::numeric::numeric amount, '{}'::jsonb stats, jsonb_build_object('party',o.name,'status',o.status,'createdAt',o.created_at,'href','/admin/organizations/'||o.id) cells, '{}'::jsonb groups
from public.organizations o
where (select app_private.has_financial_reporting_role()) and (o.archived_at is null);
revoke all on app_private.report_organizations from public,anon,authenticated,service_role;
grant select on app_private.report_organizations to authenticated;

create view app_private.report_quote_lines with (security_invoker=true) as
select l.id::text id, q.created_at at, q.customer_id customer_id,
 q.organization_id organization_id, array[q.estimator_user_id] employee_ids,
 coalesce(j.lead_source_id,c.lead_source_id) source_id, array[l.service_category_id] service_ids, q.status::text status,
 l.total_cents::numeric amount, jsonb_build_object('quotedCents',l.total_cents,'categorizedCents',case when l.service_category_id is not null then l.total_cents else 0 end,'uncategorized',(l.service_category_id is null)::integer) stats, jsonb_build_object('number',coalesce(q.quote_number,q.id::text),'party',coalesce(o.name,c.display_name,'Unknown account'),'category',coalesce(sc.label,'Uncategorized'),'lineCents',l.total_cents,'href','/admin/quotes/'||q.id) cells, jsonb_build_object('category',jsonb_build_object('key',coalesce(sc.id::text,'unknown'),'label',coalesce(sc.label,'Uncategorized'))) groups
from public.quotes q left join public.customers c on c.id=q.customer_id left join public.organizations o on o.id=q.organization_id left join public.profiles p on p.id=q.estimator_user_id left join public.jobs j on j.id=q.job_id left join public.lead_sources ls on ls.id=coalesce(j.lead_source_id,c.lead_source_id) join public.quote_line_items l on l.quote_id=q.id left join public.service_categories sc on sc.id=l.service_category_id
where (select app_private.has_staff_role()) and (q.archived_at is null and ((select app_private.has_financial_reporting_role()) or q.estimator_user_id=(select auth.uid())));
revoke all on app_private.report_quote_lines from public,anon,authenticated,service_role;
grant select on app_private.report_quote_lines to authenticated;

create view app_private.report_invoice_lines with (security_invoker=true) as
select l.id::text id, i.created_at at, i.customer_id customer_id,
 i.organization_id organization_id, array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,
 coalesce(j.lead_source_id,c.lead_source_id) source_id, array[l.service_category_id] service_ids, i.status::text status,
 l.total_cents::numeric amount, jsonb_build_object('invoicedCents',l.total_cents,'categorizedCents',case when l.service_category_id is not null then l.total_cents else 0 end,'uncategorized',(l.service_category_id is null)::integer) stats, jsonb_build_object('number',coalesce(i.invoice_number,i.id::text),'party',coalesce(o.name,c.display_name,'Unknown account'),'category',coalesce(sc.label,'Uncategorized'),'lineCents',l.total_cents,'href','/admin/invoices/'||i.id) cells, jsonb_build_object('category',jsonb_build_object('key',coalesce(sc.id::text,'unknown'),'label',coalesce(sc.label,'Uncategorized'))) groups
from public.invoices i left join public.customers c on c.id=i.customer_id left join public.organizations o on o.id=i.organization_id left join public.jobs j on j.id=i.job_id left join public.lead_sources ls on ls.id=coalesce(j.lead_source_id,c.lead_source_id) join public.invoice_line_items l on l.invoice_id=i.id left join public.service_categories sc on sc.id=l.service_category_id
where (select app_private.has_financial_reporting_role()) and (i.status not in ('draft','void'));
revoke all on app_private.report_invoice_lines from public,anon,authenticated,service_role;
grant select on app_private.report_invoice_lines to authenticated;

create view app_private.report_rates with (security_invoker=true) as
select r.id::text id, r.effective_from::timestamp at time zone (select business_timezone from public.reporting_settings where singleton_key) at, null::uuid customer_id,
 null::uuid organization_id, array[er.auth_user_id] employee_ids,
 null::uuid source_id, '{}'::uuid[] service_ids, ''::text::text status,
 null::numeric::numeric amount, '{}'::jsonb stats, jsonb_build_object('employee',coalesce(er.preferred_name,er.legal_name,'Employee'),'effectiveFrom',r.effective_from,'effectiveTo',r.effective_to,'hourlyCents',r.hourly_cost_cents,'burden',r.burden_percent,'href','/admin/employees/'||er.id) cells, '{}'::jsonb groups
from public.employee_labor_cost_rates r join public.employee_records er on er.id=r.employee_id
where (select app_private.has_financial_reporting_role()) and (true);
revoke all on app_private.report_rates from public,anon,authenticated,service_role;
grant select on app_private.report_rates to authenticated;

create view app_private.report_costs with (security_invoker=true) as
select x.id::text id, x.incurred_on::timestamp at time zone (select business_timezone from public.reporting_settings where singleton_key) at, j.customer_id customer_id,
 j.organization_id organization_id, array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,
 j.lead_source_id source_id, array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids, x.review_status::text status,
 null::numeric::numeric amount, jsonb_build_object('materialCents',case when x.review_status='approved' and x.is_current and x.category='materials' then x.amount_cents else 0 end,'disposalCents',case when x.review_status='approved' and x.is_current and x.category='disposal' then x.amount_cents else 0 end) stats, jsonb_build_object('party',coalesce(o.name,c.display_name,'Unknown account'),'category',x.category,'description',x.description,'costCents',x.amount_cents,'status',x.review_status,'superseded',not x.is_current,'incurredOn',x.incurred_on,'href','/admin/jobs/'||j.id) cells, jsonb_build_object('category',x.category) groups
from public.jobs j left join public.customers c on c.id=j.customer_id left join public.organizations o on o.id=j.organization_id left join public.lead_sources ls on ls.id=j.lead_source_id left join public.service_locations sl on sl.id=j.service_location_id join app_private.report_cost_inputs x on x.job_id=j.id
where (select app_private.has_financial_reporting_role()) and (x.archived_at is null);
revoke all on app_private.report_costs from public,anon,authenticated,service_role;
grant select on app_private.report_costs to authenticated;

create view app_private.report_assets with (security_invoker=true) as
select a.id::text id, a.updated_at at, null::uuid customer_id,
 null::uuid organization_id, '{}'::uuid[] employee_ids,
 null::uuid source_id, '{}'::uuid[] service_ids, a.status::text status,
 null::numeric::numeric amount, jsonb_build_object('active',(a.is_active)::integer,'outOfService',(a.status in ('out_of_service','awaiting_parts','repair_scheduled'))::integer) stats, jsonb_build_object('asset',a.name,'number',a.asset_number,'category',a.category,'status',a.status,'href','/admin/equipment/'||a.id) cells, '{}'::jsonb groups
from public.equipment_assets a
where (select app_private.has_financial_reporting_role()) and (a.archived_at is null);
revoke all on app_private.report_assets from public,anon,authenticated,service_role;
grant select on app_private.report_assets to authenticated;

create view app_private.report_maintenance with (security_invoker=true) as
select x.id::text id, x.completed_at at, null::uuid customer_id,
 null::uuid organization_id, '{}'::uuid[] employee_ids,
 null::uuid source_id, '{}'::uuid[] service_ids, x.status::text status,
 null::numeric::numeric amount, jsonb_build_object('costCents',case when x.status='completed' then coalesce(x.cost_cents,0) else 0 end) stats, jsonb_build_object('type',x.maintenance_type,'status',x.status,'costCents',x.cost_cents,'date',x.completed_at)||jsonb_build_object('asset',a.name,'number',a.asset_number,'href','/admin/equipment/'||a.id) cells, jsonb_build_object('asset',jsonb_build_object('key',a.id::text,'label',a.name)) groups
from public.equipment_maintenance_records x join public.equipment_assets a on a.id=x.asset_id
where (select app_private.has_financial_reporting_role()) and (x.completed_at is not null);
revoke all on app_private.report_maintenance from public,anon,authenticated,service_role;
grant select on app_private.report_maintenance to authenticated;

create view app_private.report_problems with (security_invoker=true) as
select x.id::text id, x.created_at at, null::uuid customer_id,
 null::uuid organization_id, '{}'::uuid[] employee_ids,
 null::uuid source_id, '{}'::uuid[] service_ids, x.status::text status,
 null::numeric::numeric amount, jsonb_build_object('stopped',(x.equipment_stopped)::integer) stats, jsonb_build_object('type','Problem','status',x.status,'date',x.created_at,'detail',case when x.equipment_stopped then 'Equipment stopped' else x.severity end)||jsonb_build_object('asset',a.name,'number',a.asset_number,'href','/admin/equipment/'||a.id) cells, jsonb_build_object('asset',jsonb_build_object('key',a.id::text,'label',a.name)) groups
from public.equipment_problem_reports x join public.equipment_assets a on a.id=x.asset_id
where (select app_private.has_financial_reporting_role()) and (true);
revoke all on app_private.report_problems from public,anon,authenticated,service_role;
grant select on app_private.report_problems to authenticated;

create view app_private.report_inspections with (security_invoker=true) as
select x.id::text id, x.inspected_at at, null::uuid customer_id,
 null::uuid organization_id, '{}'::uuid[] employee_ids,
 null::uuid source_id, '{}'::uuid[] service_ids, x.overall_result::text status,
 null::numeric::numeric amount, jsonb_build_object('failed',(x.overall_result='failed')::integer) stats, jsonb_build_object('type','Inspection','status',x.overall_result,'date',x.inspected_at,'detail','Review inspection')||jsonb_build_object('asset',a.name,'number',a.asset_number,'href','/admin/equipment/'||a.id) cells, jsonb_build_object('asset',jsonb_build_object('key',a.id::text,'label',a.name)) groups
from public.equipment_inspections x join public.equipment_assets a on a.id=x.asset_id
where (select app_private.has_financial_reporting_role()) and (true);
revoke all on app_private.report_inspections from public,anon,authenticated,service_role;
grant select on app_private.report_inspections to authenticated;

create view app_private.report_movements with (security_invoker=true) as
select x.id::text id, x.occurred_at at, coalesce(x.customer_id,j.customer_id) customer_id,
 j.organization_id organization_id, array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,
 j.lead_source_id source_id, array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids, x.transaction_type::text status,
 null::numeric::numeric amount, jsonb_build_object('received',(x.transaction_type='receive')::integer,'used',(x.transaction_type='job_use')::integer,'corrections',(x.transaction_type in ('adjustment','loss','reversal'))::integer) stats, jsonb_build_object('material',m.name,'type',x.transaction_type,'quantity',x.quantity,'unit',x.unit,'estimated',x.is_estimated,'date',x.occurred_at,'href',case when j.id is not null then '/admin/jobs/'||j.id else '/admin/materials' end) cells, jsonb_build_object('material',jsonb_build_object('key',m.id::text,'label',m.name)) groups
from public.inventory_transactions x join public.material_catalog m on m.id=x.material_id left join public.jobs j on j.id=x.job_id
where (select app_private.has_financial_reporting_role()) and (true);
revoke all on app_private.report_movements from public,anon,authenticated,service_role;
grant select on app_private.report_movements to authenticated;

create view app_private.report_stock with (security_invoker=true) as
select x.material_id::text||':'||x.location_id::text::text id, x.latest_transaction_at at, null::uuid customer_id,
 null::uuid organization_id, '{}'::uuid[] employee_ids,
 null::uuid source_id, '{}'::uuid[] service_ids, ''::text::text status,
 null::numeric::numeric amount, '{}'::jsonb stats, jsonb_build_object('material',m.name,'locationId',x.location_id,'onHand',x.on_hand_quantity,'reserved',x.reserved_quantity,'available',x.available_quantity,'unit',m.default_unit,'date',x.latest_transaction_at,'href','/admin/materials') cells, '{}'::jsonb groups
from public.material_stock_balances x join public.material_catalog m on m.id=x.material_id
where (select app_private.has_financial_reporting_role()) and (true);
revoke all on app_private.report_stock from public,anon,authenticated,service_role;
grant select on app_private.report_stock to authenticated;

create view app_private.report_disposal with (security_invoker=true) as
select x.id::text id, x.created_at at, j.customer_id customer_id,
 j.organization_id organization_id, array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,
 j.lead_source_id source_id, array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids, x.status::text status,
 null::numeric::numeric amount, jsonb_build_object('loads',1) stats, jsonb_build_object('destination',x.destination_name,'type',x.destination_type,'quantity',x.quantity,'unit',x.unit,'estimated',x.is_estimated,'feeCents',x.fee_cents,'status',x.status)||jsonb_build_object('href','/admin/jobs/'||j.id) cells, '{}'::jsonb groups
from public.disposal_records x left join public.material_catalog m on m.id=x.material_id left join public.jobs j on j.id=x.job_id
where (select app_private.has_financial_reporting_role()) and (true);
revoke all on app_private.report_disposal from public,anon,authenticated,service_role;
grant select on app_private.report_disposal to authenticated;

create view app_private.report_production with (security_invoker=true) as
select x.id::text id, x.created_at at, null::uuid customer_id,
 null::uuid organization_id, '{}'::uuid[] employee_ids,
 null::uuid source_id, '{}'::uuid[] service_ids, x.status::text status,
 null::numeric::numeric amount, jsonb_build_object('batches',1) stats, jsonb_build_object('batch',x.batch_number,'material',m.name,'status',x.status,'quantity',x.estimated_output_quantity,'unit',x.output_unit,'directCents',x.direct_cost_cents)||jsonb_build_object('href','/admin/materials') cells, '{}'::jsonb groups
from public.production_batches x join public.material_catalog m on m.id=x.product_material_id
where (select app_private.has_financial_reporting_role()) and (true);
revoke all on app_private.report_production from public,anon,authenticated,service_role;
grant select on app_private.report_production to authenticated;

create view app_private.report_deliveries with (security_invoker=true) as
select x.id::text id, x.created_at at, j.customer_id customer_id,
 j.organization_id organization_id, array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,
 j.lead_source_id source_id, array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids, x.status::text status,
 null::numeric::numeric amount, jsonb_build_object('deliveries',1) stats, jsonb_build_object('material',m.name,'quantity',x.quantity,'unit',x.unit,'status',x.status,'date',x.delivered_at)||jsonb_build_object('href','/admin/jobs/'||j.id) cells, '{}'::jsonb groups
from public.customer_deliveries x join public.material_catalog m on m.id=x.material_id left join public.jobs j on j.id=x.job_id
where (select app_private.has_financial_reporting_role()) and (true);
revoke all on app_private.report_deliveries from public,anon,authenticated,service_role;
grant select on app_private.report_deliveries to authenticated;

create view app_private.report_quality with(security_invoker=true) as
select 'lead_source:'||j.id::text id,j.created_at at,j.customer_id customer_id,j.organization_id organization_id,array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,j.lead_source_id source_id,array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids,'open'::text status,null::numeric amount,jsonb_build_object('issues',1) stats,jsonb_build_object('issue','Lead source missing','detail',null::text,'date',j.created_at,'href','/admin/jobs/'||j.id) cells,jsonb_build_object('issue','Lead source missing') groups from public.jobs j left join public.customers c on c.id=j.customer_id left join public.organizations o on o.id=j.organization_id left join public.lead_sources ls on ls.id=j.lead_source_id left join public.service_locations sl on sl.id=j.service_location_id where (select app_private.has_financial_reporting_role()) and (j.archived_at is null and j.lead_disposition='active' and j.lead_source_id is null)
union all
select 'legacy_completion:'||j.id::text id,j.created_at at,j.customer_id customer_id,j.organization_id organization_id,array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,j.lead_source_id source_id,array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids,'open'::text status,null::numeric amount,jsonb_build_object('issues',1) stats,jsonb_build_object('issue','Completion date missing','detail',null::text,'date',j.created_at,'href','/admin/jobs/'||j.id) cells,jsonb_build_object('issue','Completion date missing') groups from public.jobs j left join public.customers c on c.id=j.customer_id left join public.organizations o on o.id=j.organization_id left join public.lead_sources ls on ls.id=j.lead_source_id left join public.service_locations sl on sl.id=j.service_location_id where (select app_private.has_financial_reporting_role()) and (j.completed_at is null and j.status in ('completed','ready_to_invoice','invoiced','paid'))
union all
select 'invoice:'||j.id::text id,j.completed_at at,j.customer_id customer_id,j.organization_id organization_id,array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,j.lead_source_id source_id,array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids,'open'::text status,null::numeric amount,jsonb_build_object('issues',1) stats,jsonb_build_object('issue','Completed work without issued invoice','detail',null::text,'date',j.completed_at,'href','/admin/jobs/'||j.id) cells,jsonb_build_object('issue','Completed work without issued invoice') groups from public.jobs j left join public.customers c on c.id=j.customer_id left join public.organizations o on o.id=j.organization_id left join public.lead_sources ls on ls.id=j.lead_source_id left join public.service_locations sl on sl.id=j.service_location_id where (select app_private.has_financial_reporting_role()) and (j.completed_at is not null and not exists(select 1 from public.invoices i where i.job_id=j.id and i.status not in ('draft','void')))
union all
select 'closeout:'||j.id::text id,j.completed_at at,j.customer_id customer_id,j.organization_id organization_id,array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,j.lead_source_id source_id,array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids,'open'::text status,null::numeric amount,jsonb_build_object('issues',1) stats,jsonb_build_object('issue','Completed work without closeout','detail',null::text,'date',j.completed_at,'href','/admin/jobs/'||j.id) cells,jsonb_build_object('issue','Completed work without closeout') groups from public.jobs j left join public.customers c on c.id=j.customer_id left join public.organizations o on o.id=j.organization_id left join public.lead_sources ls on ls.id=j.lead_source_id left join public.service_locations sl on sl.id=j.service_location_id where (select app_private.has_financial_reporting_role()) and (j.completed_at is not null and not exists(select 1 from public.job_closeouts c where c.job_id=j.id))
union all
select 'crew:'||j.id::text id,j.created_at at,j.customer_id customer_id,j.organization_id organization_id,array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,j.lead_source_id source_id,array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids,'open'::text status,null::numeric amount,jsonb_build_object('issues',1) stats,jsonb_build_object('issue','Scheduled work without crew','detail',null::text,'date',j.created_at,'href','/admin/jobs/'||j.id) cells,jsonb_build_object('issue','Scheduled work without crew') groups from public.jobs j left join public.customers c on c.id=j.customer_id left join public.organizations o on o.id=j.organization_id left join public.lead_sources ls on ls.id=j.lead_source_id left join public.service_locations sl on sl.id=j.service_location_id where (select app_private.has_financial_reporting_role()) and (j.archived_at is null and j.status in ('scheduled','in_progress') and j.assigned_crew_user_id is null and not exists(select 1 from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id where e.job_id=j.id and e.status<>'cancelled'))
union all
select 'estimator:'||q.id::text id,q.created_at at,q.customer_id customer_id,q.organization_id organization_id,array[q.estimator_user_id] employee_ids,coalesce(j.lead_source_id,c.lead_source_id) source_id,array(select distinct l.service_category_id from public.quote_line_items l where l.quote_id=q.id and l.service_category_id is not null) service_ids,'open'::text status,null::numeric amount,jsonb_build_object('issues',1) stats,jsonb_build_object('issue','Quote estimator missing','detail',null::text,'date',q.created_at,'href','/admin/quotes/'||q.id) cells,jsonb_build_object('issue','Quote estimator missing') groups from public.quotes q left join public.customers c on c.id=q.customer_id left join public.organizations o on o.id=q.organization_id left join public.profiles p on p.id=q.estimator_user_id left join public.jobs j on j.id=q.job_id left join public.lead_sources ls on ls.id=coalesce(j.lead_source_id,c.lead_source_id) where (select app_private.has_staff_role()) and (q.archived_at is null and ((select app_private.has_financial_reporting_role()) or q.estimator_user_id=(select auth.uid())) and q.estimator_user_id is null)
union all
select 'quote_service:'||l.id::text id,q.created_at at,q.customer_id customer_id,q.organization_id organization_id,array[q.estimator_user_id] employee_ids,coalesce(j.lead_source_id,c.lead_source_id) source_id,array(select distinct l.service_category_id from public.quote_line_items l where l.quote_id=q.id and l.service_category_id is not null) service_ids,'open'::text status,null::numeric amount,jsonb_build_object('issues',1) stats,jsonb_build_object('issue','Quote line service missing','detail',null::text,'date',q.created_at,'href','/admin/quotes/'||q.id) cells,jsonb_build_object('issue','Quote line service missing') groups from public.quotes q left join public.customers c on c.id=q.customer_id left join public.organizations o on o.id=q.organization_id left join public.profiles p on p.id=q.estimator_user_id left join public.jobs j on j.id=q.job_id left join public.lead_sources ls on ls.id=coalesce(j.lead_source_id,c.lead_source_id) join public.quote_line_items l on l.quote_id=q.id where (select app_private.has_staff_role()) and (q.archived_at is null and ((select app_private.has_financial_reporting_role()) or q.estimator_user_id=(select auth.uid())) and l.service_category_id is null)
union all
select 'quote_job:'||q.id::text id,q.created_at at,q.customer_id customer_id,q.organization_id organization_id,array[q.estimator_user_id] employee_ids,coalesce(j.lead_source_id,c.lead_source_id) source_id,array(select distinct l.service_category_id from public.quote_line_items l where l.quote_id=q.id and l.service_category_id is not null) service_ids,'open'::text status,null::numeric amount,jsonb_build_object('issues',1) stats,jsonb_build_object('issue','Approved quote without work order','detail',null::text,'date',q.created_at,'href','/admin/quotes/'||q.id) cells,jsonb_build_object('issue','Approved quote without work order') groups from public.quotes q left join public.customers c on c.id=q.customer_id left join public.organizations o on o.id=q.organization_id left join public.profiles p on p.id=q.estimator_user_id left join public.jobs j on j.id=q.job_id left join public.lead_sources ls on ls.id=coalesce(j.lead_source_id,c.lead_source_id) where (select app_private.has_staff_role()) and (q.archived_at is null and ((select app_private.has_financial_reporting_role()) or q.estimator_user_id=(select auth.uid())) and (q.status='approved' or q.approved_at is not null) and q.job_id is null and not exists(select 1 from public.jobs w where w.source_quote_id=q.id))
union all
select 'invoice_service:'||l.id::text id,i.created_at at,i.customer_id customer_id,i.organization_id organization_id,array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,coalesce(j.lead_source_id,c.lead_source_id) source_id,array(select distinct l.service_category_id from public.invoice_line_items l where l.invoice_id=i.id and l.service_category_id is not null) service_ids,'open'::text status,null::numeric amount,jsonb_build_object('issues',1) stats,jsonb_build_object('issue','Invoice line service missing','detail',null::text,'date',i.created_at,'href','/admin/invoices/'||i.id) cells,jsonb_build_object('issue','Invoice line service missing') groups from public.invoices i left join public.customers c on c.id=i.customer_id left join public.organizations o on o.id=i.organization_id left join public.jobs j on j.id=i.job_id left join public.lead_sources ls on ls.id=coalesce(j.lead_source_id,c.lead_source_id) join public.invoice_line_items l on l.invoice_id=i.id where (select app_private.has_financial_reporting_role()) and (i.status not in ('draft','void') and l.service_category_id is null)
union all
select 'due_date:'||i.id::text id,i.created_at at,i.customer_id customer_id,i.organization_id organization_id,array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,coalesce(j.lead_source_id,c.lead_source_id) source_id,array(select distinct l.service_category_id from public.invoice_line_items l where l.invoice_id=i.id and l.service_category_id is not null) service_ids,'open'::text status,null::numeric amount,jsonb_build_object('issues',1) stats,jsonb_build_object('issue','Open invoice due date missing','detail',null::text,'date',i.created_at,'href','/admin/invoices/'||i.id) cells,jsonb_build_object('issue','Open invoice due date missing') groups from public.invoices i left join public.customers c on c.id=i.customer_id left join public.organizations o on o.id=i.organization_id left join public.jobs j on j.id=i.job_id left join public.lead_sources ls on ls.id=coalesce(j.lead_source_id,c.lead_source_id) where (select app_private.has_financial_reporting_role()) and (i.status not in ('draft','paid','void') and i.balance_due_cents>0 and i.due_at is null)
union all
select 'time_job:'||t.id::text id,t.clock_in_at at,null::uuid customer_id,null::uuid organization_id,array[t.user_id] employee_ids,null::uuid source_id,'{}'::uuid[] service_ids,'open'::text status,null::numeric amount,jsonb_build_object('issues',1) stats,jsonb_build_object('issue','Job time without a work order','detail',null::text,'date',t.clock_in_at,'href','/admin/time') cells,jsonb_build_object('issue','Job time without a work order') groups from public.time_entries t where (select app_private.has_financial_reporting_role()) and (t.status<>'void' and t.entry_type='job' and t.job_id is null)
union all
select 'cost_category:'||x.id::text id,x.created_at at,j.customer_id customer_id,j.organization_id organization_id,array(select distinct v from (select j.assigned_crew_user_id v union select t.user_id from public.time_entries t where t.job_id=j.id and t.status<>'void' union select coalesce(a.user_id,er.auth_user_id) from public.schedule_events e join public.schedule_event_assignments a on a.event_id=e.id left join public.employee_records er on er.id=a.employee_id where e.job_id=j.id and e.status<>'cancelled') assigned where v is not null) employee_ids,j.lead_source_id source_id,array(select distinct l.service_category_id from public.quotes qx join public.quote_line_items l on l.quote_id=qx.id where (qx.id=j.source_quote_id or qx.job_id=j.id) and l.service_category_id is not null union select distinct l.service_category_id from public.invoices ix join public.invoice_line_items l on l.invoice_id=ix.id where ix.job_id=j.id and ix.status<>'void' and l.service_category_id is not null) service_ids,'open'::text status,null::numeric amount,jsonb_build_object('issues',1) stats,jsonb_build_object('issue','Direct cost needs classification','detail',null::text,'date',x.created_at,'href','/admin/jobs/'||j.id) cells,jsonb_build_object('issue','Direct cost needs classification') groups from public.job_cost_entries x join public.jobs j on j.id=x.job_id where (select app_private.has_financial_reporting_role()) and (x.archived_at is null and x.category='other')
union all
select 'ownership:'||x.id::text id,x.created_at at,null::uuid customer_id,null::uuid organization_id,'{}'::uuid[] employee_ids,null::uuid source_id,'{}'::uuid[] service_ids,'open'::text status,null::numeric amount,jsonb_build_object('issues',1) stats,jsonb_build_object('issue','Contracting party ownership review','detail',replace(x.issue_type,'_',' '),'date',x.created_at,'href',case x.record_type when 'quote' then '/admin/quotes/' when 'job' then '/admin/jobs/' when 'invoice' then '/admin/invoices/' when 'change_order' then '/admin/change-orders/' when 'recurring_service_plan' then '/admin/recurring/' else '/admin/reports?view=quality#' end||x.record_id) cells,jsonb_build_object('issue','Contracting party ownership review') groups from public.contracting_party_review_items x where (select app_private.has_financial_reporting_role()) and (x.status='open');
revoke all on app_private.report_quality from public,anon,authenticated,service_role;
grant select on app_private.report_quality to authenticated;

-- One data source yields complete SQL totals and bounded deterministic detail.
-- Identifier selection is a fixed allowlist; all user values remain parameters.
create function app_private.read_report_dataset(
 p_kind text,p_start timestamptz,p_end timestamptz,p_filters jsonb,
 p_page integer default 1,p_size integer default 50,p_expected text default null,p_count_only boolean default false
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
predicate text:=$where$($1 is null or r.at >= $1) and ($2 is null or r.at < $2)
   and (nullif($3->>'customer','') is null or r.customer_id=($3->>'customer')::uuid)
   and (nullif($3->>'organization','') is null or r.organization_id=($3->>'organization')::uuid)
   and (nullif($3->>'employee','') is null or ($3->>'employee')::uuid=any(r.employee_ids))
   and (nullif($3->>'employee_name','') is null or exists(select 1 from public.profiles p where p.id=any(r.employee_ids) and position(lower($3->>'employee_name') in lower(coalesce(p.full_name,'')))>0))
   and (nullif($3->>'source','') is null or r.source_id=($3->>'source')::uuid)
   and (nullif($3->>'service','') is null or ($3->>'service')::uuid=any(r.service_ids))
   and (nullif($3->>'status','') is null or r.status=$3->>'status')
   and (nullif($3->>'party','') is null or position(lower($3->>'party') in lower(coalesce((select o.name from public.organizations o where o.id=r.organization_id),(select c.display_name from public.customers c where c.id=r.customer_id),'')))>0)$where$;
begin
 if auth.uid() is null or not app_private.has_staff_role() then raise exception 'Reporting access required' using errcode='42501';end if;
 if p_kind not in ('quotes','jobs','backlog','completed','invoices','ar','payments','time','schedule','profitability','customers','organizations','quote_lines','invoice_lines','rates','costs','assets','maintenance','problems','inspections','movements','stock','disposal','production','deliveries','quality')
  or p_page is null or p_page<1 or p_page>10000000 or p_size not between 1 and 10000 or p_size is null then raise exception 'Invalid report page' using errcode='22023';end if;
 if p_count_only then
  execute format('select jsonb_build_object(''total'',count(*)) from %I.%I r where %s','app_private','report_'||p_kind,predicate) into result using p_start,p_end,p_filters;
  return result;
 end if;
 execute format($query$
 with filtered as materialized (
  select r.id,r.at,r.amount,r.stats,r.cells,r.groups from %I.%I r
  where %s
 ), totals as (
  select count(*) total,percentile_cont(0.5) within group(order by amount) median_amount,
   md5(coalesce(string_agg(md5(jsonb_build_array(id,at,stats-'ageDays',cells,groups)::text),'' order by at desc nulls last,id),'')) version
  from filtered
 ), stats as (
  select coalesce(jsonb_object_agg(key,n),'{}') value from (
   select x.key,sum(x.value::numeric) n from filtered f cross join lateral jsonb_each_text(f.stats) x group by x.key
  ) s
 ), labels as (
  select f.id,f.stats,g.key group_key,
   case when jsonb_typeof(g.value)='object' then g.value->>'key' else g.value#>>'{}' end group_id,
   case when jsonb_typeof(g.value)='object' then g.value->>'label' else g.value#>>'{}' end label
  from filtered f cross join lateral jsonb_each(f.groups) g
 ), label_counts as (
  select group_key,group_id,max(label) label,count(*) n from labels group by group_key,group_id
 ), label_stats as (
  select group_key,group_id,jsonb_object_agg(key,n) stats from (
   select l.group_key,l.group_id,s.key,sum(s.value::numeric) n
   from labels l cross join lateral jsonb_each_text(l.stats) s group by l.group_key,l.group_id,s.key
  ) x group by group_key,group_id
 ), ranked as (
  select c.*,coalesce(s.stats,'{}') stats,row_number() over(partition by c.group_key order by c.n desc,c.label,c.group_id) rank
  from label_counts c left join label_stats s using(group_key,group_id)
 ), others as (
  select group_key,'__other__' group_id,'Other ('||count(*)||' groups)' label,sum(n) n,10000000::bigint rank,
   (select coalesce(jsonb_object_agg(key,n),'{}') from (
    select v.key,sum(v.value::numeric) n from ranked r2 cross join lateral jsonb_each_text(r2.stats) v
    where r2.group_key=r.group_key and r2.rank>15 group by v.key
   ) x) stats
  from ranked r where rank>15 group by group_key
 ), display_groups as (
  select group_key,group_id,label,n,stats,rank from ranked where rank<=15
  union all select group_key,group_id,label,n,stats,rank from others
 ), groups as (
  select coalesce(jsonb_object_agg(group_key,value),'{}') value from (
   select group_key,jsonb_build_object('totalGroups',(select count(*) from ranked r where r.group_key=g.group_key),'repeatGroups',(select count(*) from ranked r where r.group_key=g.group_key and r.n>1),'issuedGroups',(select count(*) from ranked r where r.group_key=g.group_key and coalesce((r.stats->>'issued')::numeric,0)>0),'items',jsonb_agg(jsonb_build_object('id',group_id,'label',label,'count',n,'stats',stats) order by rank)) value
   from display_groups g group by group_key
  ) x
 ), paged as (
  select id,at,cells from filtered order by at desc nulls last,id
  offset ((least($4,greatest(1,ceil((select total from totals)::numeric/$5)::integer))-1)::bigint*$5)
  limit $5
 )
 select jsonb_build_object('key',$6,'total',t.total,'page',least($4,greatest(1,ceil(t.total::numeric/$5)::integer)),
  'pageSize',$5,'pages',greatest(1,ceil(t.total::numeric/$5)::integer),'version',t.version,
  'stats',s.value,'medianAmount',t.median_amount,'groups',g.value,
  'rows',coalesce((select jsonb_agg(cells||jsonb_build_object('id',id) order by at desc nulls last,id) from paged),'[]'))
 from totals t cross join stats s cross join groups g
 $query$,'app_private','report_'||p_kind,predicate)
 into result using p_start,p_end,p_filters,p_page,p_size,p_kind;
 if p_expected is not null and p_expected<>result->>'version' then raise exception 'Report records changed. Refresh before continuing' using errcode='40001';end if;
 return result;
end $$;
revoke all on function app_private.read_report_dataset(text,timestamptz,timestamptz,jsonb,integer,integer,text,boolean) from public,anon,service_role;
grant execute on function app_private.read_report_dataset(text,timestamptz,timestamptz,jsonb,integer,integer,text,boolean) to authenticated;

create function public.get_business_report(
 p_view text,p_start date,p_end date,p_filters jsonb default '{}',
 p_pages jsonb default '{}',p_versions jsonb default '{}',p_page_size integer default 50,p_export boolean default false
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare financial boolean;zone text;start_at timestamptz;end_at timestamptz;
 kinds text[];kind text;period_start timestamptz;period_end timestamptz;datasets jsonb:='{}'::jsonb;
 previous jsonb:='{}'::jsonb;previous_start date;previous_end date;settings jsonb;options jsonb;export_total bigint;one jsonb;
begin
 if auth.uid() is null or not app_private.has_staff_role() then raise exception 'Reporting access required' using errcode='42501';end if;
 financial:=app_private.has_financial_reporting_role();
 if p_view not in ('executive','pipeline','quotes','revenue','profitability','labor','scheduling','customers','sources','services','fleet','materials','quality','dashboard')
  or p_view is null or p_start is null or p_end is null or p_start>p_end or p_end-p_start>3660
  or p_filters is null or jsonb_typeof(p_filters)<>'object' or length(p_filters::text)>3000
  or p_pages is null or jsonb_typeof(p_pages)<>'object' or length(p_pages::text)>3000
  or p_versions is null or jsonb_typeof(p_versions)<>'object' or length(p_versions::text)>4000
  or p_page_size is null or p_page_size not between 1 and 100 or p_export is null then raise exception 'Invalid report range or filters' using errcode='22023';end if;
 if exists(select 1 from jsonb_each_text(p_filters) x where x.key not in ('customer','organization','employee','employee_name','source','service','status','party') or length(x.value)>200) then raise exception 'Invalid report filters' using errcode='22023';end if;
 select to_jsonb(s),s.business_timezone into settings,zone from public.reporting_settings s where singleton_key;
 if settings is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'Reporting timezone is unavailable' using errcode='22023';end if;
 start_at:=p_start::timestamp at time zone zone;end_at:=(p_end+1)::timestamp at time zone zone;
 if p_view='dashboard' then
  return jsonb_build_object('restricted',false,'scope',case when financial then 'company' else 'own' end,'generatedAt',statement_timestamp(),'timezone',zone,'datasets','{}'::jsonb,'previous','{}'::jsonb,'options','{}'::jsonb,'settings',jsonb_build_object('business_timezone',zone),'allTotalsComplete',true,'summary',
   jsonb_build_object('approvedQuoteCents',(select coalesce(sum((stats->>'approvedCents')::numeric),0) from app_private.report_quotes where at>=start_at and at<end_at),
   'quoteApprovalRate',(select case when sum((stats->>'eligible')::numeric)>0 then sum((stats->>'approved')::numeric)/sum((stats->>'eligible')::numeric)*100 else null end from app_private.report_quotes where at>=start_at and at<end_at),
   'invoicedCents',case when financial then (select coalesce(sum((stats->>'invoicedCents')::numeric),0) from app_private.report_invoices where at>=start_at and at<end_at) else 0 end,
   'collectedCents',case when financial then (select coalesce(sum((stats->>'collectedCents')::numeric),0) from app_private.report_payments where at>=start_at and at<end_at) else 0 end,
   'outstandingCents',case when financial then (select coalesce(sum((stats->>'balanceCents')::numeric),0) from app_private.report_ar) else 0 end,
   'overdueCents',case when financial then (select coalesce(sum((stats->>'overdueCents')::numeric),0) from app_private.report_ar) else 0 end));
 end if;
 if not financial and p_view not in ('executive','quotes','sources','services','dashboard') then
  return jsonb_build_object('restricted',true,'scope','own','generatedAt',statement_timestamp(),'datasets','{}'::jsonb,'settings','{}'::jsonb,'options','{}'::jsonb,'previous','{}'::jsonb,'timezone',zone);
 end if;
 kinds:=case p_view
  when 'executive' then array['quotes','jobs','completed','invoices','payments','ar','backlog']
  when 'dashboard' then array['quotes','invoices','payments','ar']
  when 'pipeline' then array['jobs','quotes','invoices','backlog']
  when 'quotes' then array['quotes']
  when 'revenue' then array['invoices','payments','ar']
  when 'profitability' then array['profitability','rates']
  when 'labor' then array['time']
  when 'scheduling' then array['schedule','backlog']
  when 'customers' then array['customers','organizations','completed','jobs','invoices','ar']
  when 'sources' then array['jobs','quotes','invoices']
  when 'services' then array['quote_lines','invoice_lines']
  when 'fleet' then array['assets','maintenance','problems','inspections']
  when 'materials' then array['movements','stock','disposal','production','deliveries','costs']
  when 'quality' then array['quality'] end;
 foreach kind in array kinds loop
  if not financial and kind not in ('quotes','quote_lines') then continue;end if;
  period_start:=case when kind in ('ar','backlog','rates','assets','stock','quality') then null else start_at end;
  period_end:=case when kind in ('ar','backlog','rates','assets','stock','quality') then null else end_at end;
  datasets:=datasets||jsonb_build_object(kind,app_private.read_report_dataset(kind,period_start,period_end,
   case when kind='stock' then '{}'::jsonb when kind='assets' then jsonb_build_object('status',p_filters->>'status') when kind='rates' then jsonb_build_object('employee',p_filters->>'employee','employee_name',p_filters->>'employee_name') else p_filters end,
   case when p_export then 1 else coalesce((p_pages->>kind)::integer,1) end,case when p_export then 1 else p_page_size end,case when p_export then null else p_versions->>kind end,p_export));
 end loop;
 if p_export then
  select coalesce(sum((value->>'total')::bigint),0) into export_total from jsonb_each(datasets);
  if export_total>10000 then raise exception 'Export exceeds 10,000 rows. Choose a focused tab or narrower work filters' using errcode='54000';end if;
  foreach kind in array kinds loop
   if not datasets?kind then continue;end if;
   period_start:=case when kind in ('ar','backlog','rates','assets','stock','quality') then null else start_at end;
   period_end:=case when kind in ('ar','backlog','rates','assets','stock','quality') then null else end_at end;
   one:=app_private.read_report_dataset(kind,period_start,period_end,
    case when kind='stock' then '{}'::jsonb when kind='assets' then jsonb_build_object('status',p_filters->>'status') when kind='rates' then jsonb_build_object('employee',p_filters->>'employee','employee_name',p_filters->>'employee_name') else p_filters end,1,10000,null,false);
   datasets:=jsonb_set(datasets,array[kind],one);
  end loop;
 end if;
 if p_view='executive' then
  previous_end:=p_start-1;previous_start:=previous_end-(p_end-p_start);
  foreach kind in array array['quotes','jobs','completed','invoices','payments'] loop
   if not financial and kind<>'quotes' then continue;end if;
   previous:=previous||jsonb_build_object(kind,app_private.read_report_dataset(kind,previous_start::timestamp at time zone zone,(previous_end+1)::timestamp at time zone zone,p_filters,1,1,null)-'rows'-'groups');
  end loop;
 end if;
 select jsonb_build_object(
  'exactFilters',jsonb_build_object('customer',(select display_name from public.customers where id=nullif(p_filters->>'customer','')::uuid),'organization',(select name from public.organizations where id=nullif(p_filters->>'organization','')::uuid),'employee',(select full_name from public.profiles where id=nullif(p_filters->>'employee','')::uuid)),
  'sources',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id) from public.lead_sources),'[]'),
  'services',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label) order by sort_order,label,id) from public.service_categories),'[]')
 ) into options;
 -- Only settings administrators need the mutable defaults or employee-rate form.
 -- Ordinary estimator DTOs contain neither labor defaults nor private employee data.
 if not financial then settings:=jsonb_build_object('business_timezone',zone);end if;
 return jsonb_build_object('restricted',false,'scope',case when financial then 'company' else 'own' end,
  'generatedAt',statement_timestamp(),'datasets',datasets,'previous',previous,'settings',settings,'options',options,'timezone',zone,
  'periodStart',p_start,'periodEnd',p_end,'allTotalsComplete',true,'exportComplete',p_export);
end $$;
revoke all on function public.get_business_report(text,date,date,jsonb,jsonb,jsonb,integer,boolean) from public,anon,service_role;
grant execute on function public.get_business_report(text,date,date,jsonb,jsonb,jsonb,integer,boolean) to authenticated;
notify pgrst,'reload schema';
