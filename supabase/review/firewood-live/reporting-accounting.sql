-- REVIEW-ONLY accounting reporting extension. No historical gross period rewrite.
-- A credit posts a separate negative billed row on its own creation date.
-- Existing invoice and payment rows, view rights and options are preserved.
do $$begin
 if current_setting('ats.firewood_live_review',true)is distinct from'isolated-synthetic-only'
 or to_regclass('app_private.firewood_live_cancellation_credits')is null then raise exception 'Isolated accounting prerequisite required.';end if;
 if md5(pg_get_viewdef('app_private.report_invoices'::regclass,true))<>'ca80b7864411fbe3ee8ae9dc46298491' then raise exception 'Original invoice reporting view changed; review required.';end if;
end $$;
create function app_private.firewood_live_credit_report_rows()returns table(credit_id uuid,invoice_id uuid,created_at timestamptz,amount_cents integer)
language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid()is null or not app_private.has_financial_reporting_role()then raise exception 'Financial reporting access required.'using errcode='42501';end if;
 return query select c.id,c.invoice_id,c.created_at,c.amount_cents from app_private.firewood_live_cancellation_credits c;
end $$;
revoke all on function app_private.firewood_live_credit_report_rows()from public,anon,authenticated,service_role;
grant execute on function app_private.firewood_live_credit_report_rows()to authenticated;
create or replace view app_private.report_invoices with(security_invoker=true) as
SELECT i.id::text AS id,
    i.created_at AS at,
    i.customer_id,
    i.organization_id,
    ARRAY( SELECT DISTINCT assigned.v
           FROM ( SELECT j.assigned_crew_user_id AS v
                UNION
                 SELECT t.user_id
                   FROM time_entries t
                  WHERE t.job_id = j.id AND t.status <> 'void'::text
                UNION
                 SELECT COALESCE(a.user_id, er.auth_user_id) AS "coalesce"
                   FROM schedule_events e
                     JOIN schedule_event_assignments a ON a.event_id = e.id
                     LEFT JOIN employee_records er ON er.id = a.employee_id
                  WHERE e.job_id = j.id AND e.status <> 'cancelled'::text) assigned
          WHERE assigned.v IS NOT NULL) AS employee_ids,
    COALESCE(j.lead_source_id, c.lead_source_id) AS source_id,
    ARRAY( SELECT DISTINCT l.service_category_id
           FROM invoice_line_items l
          WHERE l.invoice_id = i.id AND l.service_category_id IS NOT NULL) AS service_ids,
    i.status,
    i.total_cents::numeric AS amount,
    jsonb_build_object('invoicedCents',
        CASE
            WHEN i.status <> ALL (ARRAY['draft'::text, 'void'::text]) THEN i.total_cents
            ELSE 0
        END, 'issued', (i.status <> ALL (ARRAY['draft'::text, 'void'::text]))::integer, 'draftCents',
        CASE
            WHEN i.status = 'draft'::text THEN i.total_cents
            ELSE 0
        END, 'balanceCents',
        CASE
            WHEN (i.status <> ALL (ARRAY['draft'::text, 'paid'::text, 'void'::text])) AND i.balance_due_cents > 0 THEN i.balance_due_cents
            ELSE 0
        END, 'overdueCents',
        CASE
            WHEN (i.status <> ALL (ARRAY['draft'::text, 'paid'::text, 'void'::text])) AND i.balance_due_cents > 0 AND GREATEST(0, timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), now())::date - timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), i.due_at)::date) > 0 THEN i.balance_due_cents
            ELSE 0
        END, 'paid', (i.paid_at IS NOT NULL)::integer, 'paymentDays',
        CASE
            WHEN i.paid_at IS NOT NULL THEN GREATEST(0::numeric, EXTRACT(epoch FROM i.paid_at - i.created_at) / 86400::numeric)
            ELSE 0::numeric
        END) AS stats,
    jsonb_build_object('number', COALESCE(i.invoice_number, i.id::text), 'party', COALESCE(o.name, c.display_name, 'Unknown account'::text), 'status', i.status, 'invoicedCents', i.total_cents, 'balanceCents', i.balance_due_cents, 'createdAt', i.created_at, 'dueAt', i.due_at, 'paidAt', i.paid_at, 'archived', (i.archived_at IS NOT NULL)::integer, 'href', '/admin/invoices/'::text || i.id) AS cells,
    jsonb_build_object('status', i.status, 'source', jsonb_build_object('key', COALESCE(ls.id::text, 'unknown'::text), 'label', COALESCE(ls.name, 'Not recorded'::text)), 'party', jsonb_build_object('key', COALESCE('organization:'::text || o.id, 'customer:'::text || c.id, 'unknown'::text), 'label', COALESCE(o.name, c.display_name, 'Unknown account'::text)), 'month', to_char(timezone(( SELECT reporting_settings.business_timezone
           FROM reporting_settings
          WHERE reporting_settings.singleton_key), i.created_at), 'YYYY-MM'::text), 'aging',
        CASE
            WHEN i.due_at IS NULL THEN 'Due date missing'::text
            WHEN GREATEST(0, timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), now())::date - timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), i.due_at)::date) = 0 THEN 'Current / not due'::text
            WHEN GREATEST(0, timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), now())::date - timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), i.due_at)::date) <= 30 THEN '1–30 days'::text
            WHEN GREATEST(0, timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), now())::date - timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), i.due_at)::date) <= 60 THEN '31–60 days'::text
            WHEN GREATEST(0, timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), now())::date - timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), i.due_at)::date) <= 90 THEN '61–90 days'::text
            ELSE 'More than 90 days'::text
        END) AS groups
   FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     LEFT JOIN organizations o ON o.id = i.organization_id
     LEFT JOIN jobs j ON j.id = i.job_id
     LEFT JOIN lead_sources ls ON ls.id = COALESCE(j.lead_source_id, c.lead_source_id)
  WHERE ( SELECT app_private.has_financial_reporting_role() AS has_financial_reporting_role) AND i.status <> 'void'::text
union all
select 'firewood-credit:'||c.credit_id::text,c.created_at,b.customer_id,b.organization_id,b.employee_ids,b.source_id,b.service_ids,
 'credited'::text,-c.amount_cents::numeric,
 jsonb_build_object('invoicedCents',-c.amount_cents,'creditCents',c.amount_cents,'issued',0,'draftCents',0,'balanceCents',0,'overdueCents',0,'paid',0,'paymentDays',0),
 jsonb_build_object('number','Credit for '||(b.cells->>'number'),'party',b.cells->'party','status','credited','invoicedCents',-c.amount_cents,'creditCents',c.amount_cents,'originalInvoiceId',c.invoice_id,'recordKind','cancellation_credit','balanceCents',0,'createdAt',c.created_at,'dueAt',null,'paidAt',null,'archived',b.cells->'archived','href','/admin/invoices/'||c.invoice_id::text),
 b.groups||jsonb_build_object('status','credited','month',to_char(timezone((select business_timezone from public.reporting_settings where singleton_key),c.created_at),'YYYY-MM'))
from app_private.firewood_live_credit_report_rows()c
join (SELECT i.id::text AS id,
    i.created_at AS at,
    i.customer_id,
    i.organization_id,
    ARRAY( SELECT DISTINCT assigned.v
           FROM ( SELECT j.assigned_crew_user_id AS v
                UNION
                 SELECT t.user_id
                   FROM time_entries t
                  WHERE t.job_id = j.id AND t.status <> 'void'::text
                UNION
                 SELECT COALESCE(a.user_id, er.auth_user_id) AS "coalesce"
                   FROM schedule_events e
                     JOIN schedule_event_assignments a ON a.event_id = e.id
                     LEFT JOIN employee_records er ON er.id = a.employee_id
                  WHERE e.job_id = j.id AND e.status <> 'cancelled'::text) assigned
          WHERE assigned.v IS NOT NULL) AS employee_ids,
    COALESCE(j.lead_source_id, c.lead_source_id) AS source_id,
    ARRAY( SELECT DISTINCT l.service_category_id
           FROM invoice_line_items l
          WHERE l.invoice_id = i.id AND l.service_category_id IS NOT NULL) AS service_ids,
    i.status,
    i.total_cents::numeric AS amount,
    jsonb_build_object('invoicedCents',
        CASE
            WHEN i.status <> ALL (ARRAY['draft'::text, 'void'::text]) THEN i.total_cents
            ELSE 0
        END, 'issued', (i.status <> ALL (ARRAY['draft'::text, 'void'::text]))::integer, 'draftCents',
        CASE
            WHEN i.status = 'draft'::text THEN i.total_cents
            ELSE 0
        END, 'balanceCents',
        CASE
            WHEN (i.status <> ALL (ARRAY['draft'::text, 'paid'::text, 'void'::text])) AND i.balance_due_cents > 0 THEN i.balance_due_cents
            ELSE 0
        END, 'overdueCents',
        CASE
            WHEN (i.status <> ALL (ARRAY['draft'::text, 'paid'::text, 'void'::text])) AND i.balance_due_cents > 0 AND GREATEST(0, timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), now())::date - timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), i.due_at)::date) > 0 THEN i.balance_due_cents
            ELSE 0
        END, 'paid', (i.paid_at IS NOT NULL)::integer, 'paymentDays',
        CASE
            WHEN i.paid_at IS NOT NULL THEN GREATEST(0::numeric, EXTRACT(epoch FROM i.paid_at - i.created_at) / 86400::numeric)
            ELSE 0::numeric
        END) AS stats,
    jsonb_build_object('number', COALESCE(i.invoice_number, i.id::text), 'party', COALESCE(o.name, c.display_name, 'Unknown account'::text), 'status', i.status, 'invoicedCents', i.total_cents, 'balanceCents', i.balance_due_cents, 'createdAt', i.created_at, 'dueAt', i.due_at, 'paidAt', i.paid_at, 'archived', (i.archived_at IS NOT NULL)::integer, 'href', '/admin/invoices/'::text || i.id) AS cells,
    jsonb_build_object('status', i.status, 'source', jsonb_build_object('key', COALESCE(ls.id::text, 'unknown'::text), 'label', COALESCE(ls.name, 'Not recorded'::text)), 'party', jsonb_build_object('key', COALESCE('organization:'::text || o.id, 'customer:'::text || c.id, 'unknown'::text), 'label', COALESCE(o.name, c.display_name, 'Unknown account'::text)), 'month', to_char(timezone(( SELECT reporting_settings.business_timezone
           FROM reporting_settings
          WHERE reporting_settings.singleton_key), i.created_at), 'YYYY-MM'::text), 'aging',
        CASE
            WHEN i.due_at IS NULL THEN 'Due date missing'::text
            WHEN GREATEST(0, timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), now())::date - timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), i.due_at)::date) = 0 THEN 'Current / not due'::text
            WHEN GREATEST(0, timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), now())::date - timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), i.due_at)::date) <= 30 THEN '1–30 days'::text
            WHEN GREATEST(0, timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), now())::date - timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), i.due_at)::date) <= 60 THEN '31–60 days'::text
            WHEN GREATEST(0, timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), now())::date - timezone(( SELECT reporting_settings.business_timezone
               FROM reporting_settings
              WHERE reporting_settings.singleton_key), i.due_at)::date) <= 90 THEN '61–90 days'::text
            ELSE 'More than 90 days'::text
        END) AS groups
   FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     LEFT JOIN organizations o ON o.id = i.organization_id
     LEFT JOIN jobs j ON j.id = i.job_id
     LEFT JOIN lead_sources ls ON ls.id = COALESCE(j.lead_source_id, c.lead_source_id)
  WHERE ( SELECT app_private.has_financial_reporting_role() AS has_financial_reporting_role) AND i.status <> 'void'::text)b on b.id=c.invoice_id::text;
notify pgrst,'reload schema';
