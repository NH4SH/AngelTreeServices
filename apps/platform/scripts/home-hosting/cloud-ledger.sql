-- Isolated staging infrastructure only. This is NOT a CRM release migration.
-- Install only in CRM Staging using apply_migration. Never production.
begin;
do $guard$ begin
 if to_regprocedure('ats_staging_auth.reject_email(jsonb)') is null then
  raise exception 'Staging Auth guard missing; refuse infrastructure installation';
 end if;
 if md5(pg_get_functiondef('ats_staging_auth.reject_email(jsonb)'::regprocedure))<>'c601aeb6c6c0ad4da79265034f84c1a6' then
  raise exception 'Staging binding changed; review before installation';
 end if;
end $guard$;
create schema ats_recovery_lab authorization postgres;
revoke all on schema ats_recovery_lab from public,anon,authenticated,service_role;
create table ats_recovery_lab.namespaces(
 namespace text primary key check(namespace~'^ats-rehearsal-continuous-[a-f0-9]{12}$'),
 bucket text unique not null check(bucket~'^crm-cloud-lab-[a-f0-9]{12}$'),
 last_sequence bigint not null default 0,
 daily_limit bigint not null default 100663296 check(daily_limit between 262144 and 100663296),
 monthly_limit bigint not null default 536870912 check(monthly_limit between 262144 and 536870912)
);
create table ats_recovery_lab.budgets(namespace text references ats_recovery_lab.namespaces,period text,
 reserved_bytes bigint not null check(reserved_bytes>=0),primary key(namespace,period));
create table ats_recovery_lab.jobs(namespace text references ats_recovery_lab.namespaces,request_id uuid,
 body_sha text not null check(body_sha~'^[a-f0-9]{64}$'),created_at timestamptz not null default clock_timestamp(),
 lease_until timestamptz not null,reserved_bytes bigint not null,claims jsonb,report jsonb,
 primary key(namespace,request_id));
create table ats_recovery_lab.roots(namespace text references ats_recovery_lab.namespaces,snapshot_id text,
 sequence bigint not null,capture_started_at timestamptz not null,verified_at timestamptz not null,
 manifest_sha text not null,primary key(namespace,snapshot_id));
alter table ats_recovery_lab.namespaces enable row level security;
alter table ats_recovery_lab.budgets enable row level security;
alter table ats_recovery_lab.jobs enable row level security;
alter table ats_recovery_lab.roots enable row level security;
revoke all on all tables in schema ats_recovery_lab from public,anon,authenticated,service_role;
create function public.ats_recovery_lab_control(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,ats_recovery_lab as $function$
declare n ats_recovery_lab.namespaces%rowtype;j ats_recovery_lab.jobs%rowtype;
 action text:=p->>'action';ns text:=p->>'namespace';inventory jsonb;bytes bigint;
 periods text[]:=array['d:'||to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD'),'m:'||to_char(clock_timestamp() at time zone 'UTC','YYYY-MM')];
 period_name text;used bigint;lim bigint;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role required' using errcode='42501';end if;
 if ns is null or ns!~'^ats-rehearsal-continuous-[a-f0-9]{12}$' then raise exception 'Invalid lab namespace';end if;
 if action='configure' then
  if p->>'bucket' is distinct from 'crm-cloud-lab-'||right(ns,12) then raise exception 'Bucket binding mismatch';end if;
  insert into ats_recovery_lab.namespaces(namespace,bucket) values(ns,p->>'bucket') on conflict do nothing;
 end if;
 select * into strict n from ats_recovery_lab.namespaces where namespace=ns for update;
 if action='configure' then return jsonb_build_object('configured',true);end if;
 if action in('inventory','finish') then
  if not exists(select 1 from storage.buckets where id=n.bucket and public=false and file_size_limit<=33554432) then raise exception 'Private bounded lab bucket required';end if;
  select coalesce(jsonb_agg(jsonb_build_object('name',name,'id',id,'version',version,'size',(metadata->>'size')::bigint) order by name),'[]') into inventory
   from(select * from storage.objects where bucket_id=n.bucket order by name limit 257)o;
  if jsonb_array_length(inventory)>256 or (select coalesce(sum((x->>'size')::bigint),0) from jsonb_array_elements(inventory)x)>134217728 then raise exception 'Repository cap exceeded';end if;
  if action='inventory' then return inventory;end if;
 end if;
 if action='status' then return jsonb_build_object('budgets',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from(select * from ats_recovery_lab.budgets where namespace=ns order by period desc limit 64)b),
  'roots',(select coalesce(jsonb_agg(to_jsonb(r) order by capture_started_at),'[]') from(select * from ats_recovery_lab.roots where namespace=ns order by capture_started_at desc limit 257)r),'lastSequence',n.last_sequence);end if;
 select * into j from ats_recovery_lab.jobs where namespace=ns and request_id=(p->>'requestId')::uuid;
 if action in('reserve','augment') then
  if action='augment' then
   if j.request_id is null or j.body_sha is distinct from p->>'bodySha' or j.claims is not null or j.lease_until<=clock_timestamp() or j.reserved_bytes<>262144 then raise exception 'Invalid augmentation lease';end if;
   bytes:=(p->>'additionalBytes')::bigint;
   if bytes is null or bytes<=0 or bytes>134217728 then raise exception 'Invalid additional reservation';end if;
  else
  if j.request_id is not null then
   if j.body_sha is distinct from p->>'bodySha' then raise exception 'Request id reused with different body';end if;
   if j.claims is not null then return jsonb_build_object('completed',true,'claims',j.claims,'report',j.report);end if;
   raise exception 'Request already reserved; no refund or implicit retry';
  end if;
  if exists(select 1 from ats_recovery_lab.jobs where namespace=ns and claims is null and lease_until>clock_timestamp()) then raise exception 'Verifier busy';end if;
  bytes:=(p->>'reserveBytes')::bigint;
  if bytes is distinct from 262144 then raise exception 'Invalid metadata reservation';end if;
  end if;
  foreach period_name in array periods loop
   select coalesce((select reserved_bytes from ats_recovery_lab.budgets where namespace=ns and period=period_name),0) into used;
   lim:=case when left(period_name,2)='d:' then n.daily_limit else n.monthly_limit end;
   if used+bytes>lim then raise exception 'Transfer budget exhausted';end if;
   insert into ats_recovery_lab.budgets values(ns,period_name,bytes) on conflict(namespace,period) do update set reserved_bytes=budgets.reserved_bytes+excluded.reserved_bytes;
  end loop;
  if action='reserve' then
   insert into ats_recovery_lab.jobs(namespace,request_id,body_sha,lease_until,reserved_bytes) values(ns,(p->>'requestId')::uuid,p->>'bodySha',clock_timestamp()+interval '90 seconds',bytes);
  else
   update ats_recovery_lab.jobs set reserved_bytes=reserved_bytes+bytes where namespace=ns and request_id=j.request_id;
  end if;
  return jsonb_build_object('reserved',true);
 elsif action='finish' then
  if j.request_id is null or j.body_sha is distinct from p->>'bodySha' or j.claims is not null or j.lease_until<=clock_timestamp() then raise exception 'Lost verification lease';end if;
  if inventory is distinct from p->'inventory' then raise exception 'Object inventory changed during verification';end if;
  if p->'claims'->>'namespace' is distinct from ns then raise exception 'Claim namespace mismatch';end if;
  if p->'claims'->>'kind'='continuous-backup' then
   if (p->'claims'->>'sequence')::bigint<=n.last_sequence or (p->'claims'->>'expiresAt')::timestamptz<=clock_timestamp() then raise exception 'Stale or duplicate admission';end if;
   update ats_recovery_lab.namespaces set last_sequence=(p->'claims'->>'sequence')::bigint where namespace=ns;
  elsif p->'claims'->>'kind' is distinct from 'archive-verification' then raise exception 'Invalid receipt kind';end if;
  update ats_recovery_lab.jobs set claims=p->'claims',report=p->'report' where namespace=ns and request_id=j.request_id;
  insert into ats_recovery_lab.roots values(ns,p->'claims'->>'snapshotId',(p->'claims'->>'sequence')::bigint,(p->'claims'->>'captureStartedAt')::timestamptz,clock_timestamp(),p->'claims'->>'manifestSha256') on conflict do nothing;
  return jsonb_build_object('completed',true,'claims',p->'claims','report',p->'report');
 end if;
 raise exception 'Unsupported lab action';
end $function$;
revoke all on function public.ats_recovery_lab_control(jsonb) from public,anon,authenticated;
grant execute on function public.ats_recovery_lab_control(jsonb) to service_role;
commit;
