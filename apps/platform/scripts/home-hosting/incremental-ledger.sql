-- Staging-only lab extension. No application tables, grants or writer rules.
begin;
do $guard$ begin
 if md5(pg_get_functiondef('ats_staging_auth.reject_email(jsonb)'::regprocedure))<>'c601aeb6c6c0ad4da79265034f84c1a6'
  or md5(pg_get_functiondef('public.ats_recovery_lab_control(jsonb)'::regprocedure))<>'c789f6b03b07631ce1892adfe78c0e35' then
  raise exception 'Reviewed staging baseline required';end if;
end $guard$;
create function ats_recovery_lab.charge_bytes(ns text,bytes bigint) returns void
language plpgsql set search_path=pg_catalog,ats_recovery_lab as $charge$
declare n ats_recovery_lab.namespaces%rowtype;period_name text;used bigint;lim bigint;
begin
 if bytes is null or bytes<1 or bytes>134217728 then raise exception 'Invalid transfer charge';end if;
 select * into strict n from ats_recovery_lab.namespaces where namespace=ns for update;
 foreach period_name in array array['d:'||to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD'),'m:'||to_char(clock_timestamp() at time zone 'UTC','YYYY-MM')] loop
  select coalesce((select reserved_bytes from ats_recovery_lab.budgets where namespace=ns and period=period_name),0) into used;
  lim:=case when left(period_name,2)='d:' then n.daily_limit else n.monthly_limit end;
  if used+bytes>lim then raise exception 'Transfer budget exhausted';end if;
  insert into ats_recovery_lab.budgets values(ns,period_name,bytes) on conflict(namespace,period) do update set reserved_bytes=budgets.reserved_bytes+excluded.reserved_bytes;
 end loop;
end $charge$;
revoke all on function ats_recovery_lab.charge_bytes(text,bigint) from public,anon,authenticated,service_role;
create function public.ats_recovery_incremental_control(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,ats_recovery_lab as $function$
declare ns text:=p->>'namespace';action text:=p->>'action';n ats_recovery_lab.namespaces%rowtype;j ats_recovery_lab.jobs%rowtype;inventory jsonb;result jsonb;amount bigint;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role required' using errcode='42501';end if;
 if ns is null or ns!~'^ats-rehearsal-continuous-[a-f0-9]{12}$' then raise exception 'Invalid lab namespace';end if;
 select * into strict n from ats_recovery_lab.namespaces where namespace=ns for update;
 select * into j from ats_recovery_lab.jobs where namespace=ns and request_id=(p->>'requestId')::uuid;
 if action='start' then
  if j.request_id is not null then
   if j.body_sha is distinct from p->>'bodySha' then raise exception 'Request id body mismatch';end if;
   if j.claims is null then raise exception 'Attempt already recorded';end if;
   result:=jsonb_build_object('completed',true,'claims',j.claims,'report',j.report);
   perform ats_recovery_lab.charge_bytes(ns,octet_length(result::text)+4096);return result;
  end if;
  if exists(select 1 from ats_recovery_lab.jobs where namespace=ns and claims is null and lease_until>clock_timestamp()) then raise exception 'Verifier busy';end if;
  perform ats_recovery_lab.charge_bytes(ns,4096);
  insert into ats_recovery_lab.jobs(namespace,request_id,body_sha,lease_until,reserved_bytes) values(ns,(p->>'requestId')::uuid,p->>'bodySha',clock_timestamp()+interval '90 seconds',4096);
  return jsonb_build_object('reserved',true);
 end if;
 if j.request_id is null or j.body_sha is distinct from p->>'bodySha' or j.claims is not null or j.lease_until<=clock_timestamp() then raise exception 'Lost verification lease';end if;
 if action='fail' then
  update ats_recovery_lab.jobs set lease_until=clock_timestamp(),report=jsonb_build_object('failed',true,'receiptPermitsWrites',false) where namespace=ns and request_id=j.request_id;
  return jsonb_build_object('recorded',true);
 end if;
 if action in('inventory','finish') then
  if not exists(select 1 from storage.buckets where id=n.bucket and public=false and file_size_limit<=33554432) then raise exception 'Private bounded bucket required';end if;
  select coalesce(jsonb_agg(jsonb_build_object('name',name,'id',id,'version',version,'size',(metadata->>'size')::bigint) order by name),'[]') into inventory
   from(select * from storage.objects where bucket_id=n.bucket order by name limit 97)o;
  if jsonb_array_length(inventory)>96 or (select coalesce(sum((x->>'size')::bigint),0) from jsonb_array_elements(inventory)x)>134217728 then raise exception 'Incremental repository cap exceeded';end if;
 end if;
 if action='inventory' then result:=inventory;amount:=octet_length(result::text)+4096;
 elsif action='charge' then
  amount:=(p->>'bytes')::bigint;if amount is null or amount<1 or amount>33554432 then raise exception 'Invalid read charge';end if;
  amount:=amount+4096;result:=jsonb_build_object('reserved',true);
 elsif action='finish' then
  if inventory is distinct from p->'inventory' then raise exception 'Repository changed during verification';end if;
  if p->'claims'->>'namespace' is distinct from ns or p->'claims'->>'kind' is distinct from 'archive-verification'
   or p->'claims'->>'verificationMode' is distinct from 'incremental-verified-baseline'
   or p->'claims'->'writeAdmission' is distinct from 'false'::jsonb or p->'report'->'receiptPermitsWrites' is distinct from 'false'::jsonb then raise exception 'Archive-only proof required';end if;
  result:=jsonb_build_object('completed',true,'claims',p->'claims','report',p->'report');amount:=octet_length(result::text)+4096;
 else raise exception 'Unsupported incremental action';end if;
 perform ats_recovery_lab.charge_bytes(ns,amount);
 update ats_recovery_lab.jobs set reserved_bytes=reserved_bytes+amount where namespace=ns and request_id=j.request_id;
 if action='finish' then
  update ats_recovery_lab.jobs set claims=p->'claims',report=p->'report' where namespace=ns and request_id=j.request_id;
  insert into ats_recovery_lab.roots values(ns,p->'claims'->>'snapshotId',(p->'claims'->>'sequence')::bigint,(p->'claims'->>'captureStartedAt')::timestamptz,clock_timestamp(),p->'claims'->>'manifestSha256') on conflict do nothing;
 end if;
 return result;
end $function$;
revoke all on function public.ats_recovery_incremental_control(jsonb) from public,anon,authenticated;
grant execute on function public.ats_recovery_incremental_control(jsonb) to service_role;
commit;
