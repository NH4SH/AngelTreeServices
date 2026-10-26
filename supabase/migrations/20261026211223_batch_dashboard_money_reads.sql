begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
create function public.get_dashboard_money_reports(p_start date,p_end date) returns jsonb language plpgsql stable security invoker set search_path='' as $f$
declare report jsonb; cash jsonb:='[]'::jsonb; days integer; buckets integer; zone text;
begin
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>365 then raise exception 'Invalid reporting dates.' using errcode='22023';end if;
 report:=public.get_business_report(p_view=>'dashboard',p_start=>p_start,p_end=>p_end,p_filters=>'{}'::jsonb,p_pages=>'{}'::jsonb,p_versions=>'{}'::jsonb,p_page_size=>1,p_export=>false);
 if report->>'scope'='company' then
  if not app_private.has_financial_reporting_role() then raise exception 'Financial reporting access required.' using errcode='42501';end if;
  zone:=report->>'timezone';days:=p_end-p_start+1;buckets:=least(7,days);
  with windows as (
    select i, p_start+(i*days/buckets) as first_day,p_start+((i+1)*days/buckets)-1 as last_day from pg_catalog.generate_series(0,buckets-1) i
  ), receipts as materialized (
    select p.at,(p.stats->>'collectedCents')::numeric as cents from app_private.report_payments p
    where p.at>=p_start::timestamp at time zone zone and p.at<(p_end+1)::timestamp at time zone zone
  ), amounts as (
    select w.i,w.first_day,w.last_day,coalesce(sum(r.cents),0) as cents from windows w left join receipts r
    on r.at>=w.first_day::timestamp at time zone zone and r.at<(w.last_day+1)::timestamp at time zone zone
    group by w.i,w.first_day,w.last_day
  )
  select jsonb_agg(jsonb_build_object('scope','company','timezone',zone,'start',first_day::text,'end',last_day::text,'collectedCents',cents) order by i) into cash from amounts;
 end if;
 return jsonb_build_object('report',report,'cash',cash);
end;$f$;
revoke all on function public.get_dashboard_money_reports(date,date) from public,anon,service_role;
grant execute on function public.get_dashboard_money_reports(date,date) to authenticated;
comment on function public.get_dashboard_money_reports(date,date) is 'One bounded caller-RLS dashboard read; summary and retained-payment semantics reuse the existing reporting contract.';
notify pgrst,'reload schema';
commit;
