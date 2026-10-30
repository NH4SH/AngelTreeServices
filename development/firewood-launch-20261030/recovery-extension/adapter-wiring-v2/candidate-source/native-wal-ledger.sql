-- Staging-only recovery infrastructure. No production installer or CRM migration.
-- The source cannot hold the service key. A separate, authenticated cloud worker
-- may call this function; upload callers receive only immutable upload grants.
begin;
do $guard$ begin
 if to_regprocedure('ats_staging_auth.reject_email(jsonb)') is null
  or md5(pg_get_functiondef('ats_staging_auth.reject_email(jsonb)'::regprocedure))<>'c601aeb6c6c0ad4da79265034f84c1a6' then
  raise exception 'Expected staging Auth guard required';
 end if;
end $guard$;
create table ats_recovery_lab.native_sources(
 namespace text primary key check(namespace~'^ats-rehearsal-continuous-[a-f0-9]{12}$'),
 bucket text unique not null check(bucket~'^crm-native-lab-[a-f0-9]{12}$'),
 binding jsonb not null,enabled boolean not null default false,last_sequence bigint not null default 0,
 last_job uuid,last_lsn pg_lsn
);
create table ats_recovery_lab.native_jobs(
 id uuid primary key,namespace text not null references ats_recovery_lab.native_sources,
 body_sha text not null check(body_sha~'^[a-f0-9]{64}$'),kind text not null check(kind in('base','delta')),
 sequence bigint not null check(sequence>0),parent_job uuid references ats_recovery_lab.native_jobs,
 ticket jsonb not null,expected_objects jsonb not null,created_at timestamptz not null default clock_timestamp(),
 lease_until timestamptz not null,verified_at timestamptz,inventory jsonb,proof jsonb,component_sha text,report jsonb
);
create index native_jobs_source_sequence on ats_recovery_lab.native_jobs(namespace,sequence);
create table ats_recovery_lab.native_charges(
 id bigint generated always as identity primary key,job_id uuid not null references ats_recovery_lab.native_jobs,
 charged_at timestamptz not null default clock_timestamp(),bytes bigint not null check(bytes>0 and bytes<=134225920)
);
create index native_charges_recent on ats_recovery_lab.native_charges(charged_at);
create table ats_recovery_lab.native_admissions(
 namespace text not null references ats_recovery_lab.native_sources,sequence bigint not null,request_id uuid not null unique,
 body_sha text not null,job_id uuid not null references ats_recovery_lab.native_jobs,claims jsonb not null,chain jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(namespace,sequence)
);
alter table ats_recovery_lab.native_sources enable row level security;
alter table ats_recovery_lab.native_jobs enable row level security;
alter table ats_recovery_lab.native_charges enable row level security;
alter table ats_recovery_lab.native_admissions enable row level security;
revoke all on ats_recovery_lab.native_sources,ats_recovery_lab.native_jobs,ats_recovery_lab.native_charges,ats_recovery_lab.native_admissions from public,anon,authenticated,service_role;

create function ats_recovery_lab.native_inventory(bucket_name text,job_id uuid) returns jsonb
language sql stable set search_path=pg_catalog as $body$
 select coalesce(jsonb_agg(jsonb_build_object('name',substring(name from 38),'id',id,'version',version,'size',(metadata->>'size')::bigint) order by name),'[]')
 from(select * from storage.objects where bucket_id=bucket_name and name>=job_id::text||'/' and name<job_id::text||'/'||chr(127) order by name limit 65)o
$body$;
revoke all on function ats_recovery_lab.native_inventory(text,uuid) from public,anon,authenticated,service_role;

create function public.ats_recovery_native_control(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,ats_recovery_lab as $body$
<<control>>
declare action text:=p->>'action';ns text:=p->>'namespace';n ats_recovery_lab.native_sources%rowtype;
 j ats_recovery_lab.native_jobs%rowtype;parent ats_recovery_lab.native_jobs%rowtype;a ats_recovery_lab.native_admissions%rowtype;
 t jsonb:=p->'ticket';objects jsonb:=p->'objects';v jsonb;proof jsonb;inventory jsonb;claims jsonb;chain jsonb;
 total bigint;old_bytes bigint;bytes bigint;at timestamptz:=clock_timestamp();full_at timestamptz;expires timestamptz;
 component_count integer;bad_components integer;base_count integer;job_id_value uuid;seq bigint;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role required' using errcode='42501';end if;
 if ns is null or ns!~'^ats-rehearsal-continuous-[a-f0-9]{12}$' then raise exception 'Invalid native namespace';end if;
 if action='configure' then
  if exists(select 1 from unnest(array['namespace','generation','sourceId','sourceBoot','databaseBoot','topology','sourceDbImage','systemIdentifier','timeline'])k where p->'binding'->>k is null)
   or p->>'bucket' is distinct from 'crm-native-lab-'||right(ns,12)
   or p->'binding'->>'sourceId' is distinct from 'ats_crm_candidate_20261027'
   or p->'binding'->>'namespace' is distinct from ns or (p->'binding'->>'generation')::bigint<1
   or p->'binding'->>'sourceBoot'!~'^[a-f0-9-]{36}$' or p->'binding'->>'databaseBoot' is null
   or p->'binding'->>'topology'!~'^([a-f0-9]{32}|[a-f0-9]{64})$' or p->'binding'->>'sourceDbImage'!~'^sha256:[a-f0-9]{64}$'
   or p->'binding'->>'systemIdentifier'!~'^[0-9]{1,20}$' or (p->'binding'->>'timeline')::integer<1 then raise exception 'Invalid source binding';end if;
  insert into ats_recovery_lab.native_sources(namespace,bucket,binding) values(ns,p->>'bucket',p->'binding') on conflict do nothing;
 end if;
 select * into strict n from ats_recovery_lab.native_sources where namespace=ns for update;
 if action='configure' then
  if n.bucket is distinct from p->>'bucket' or n.binding is distinct from p->'binding' then raise exception 'Never replace a source registration';end if;
  return jsonb_build_object('configured',true,'enabled',n.enabled);
 elsif action='set_enabled' then
  if p->'binding' is distinct from n.binding then raise exception 'Source changed';end if;
  update ats_recovery_lab.native_sources set enabled=(p->>'enabled')::boolean where namespace=ns;
  return jsonb_build_object('enabled',(p->>'enabled')::boolean);
 elsif action='status' then
  return jsonb_build_object('binding',n.binding,'enabled',n.enabled,'lastSequence',n.last_sequence,'lastJob',n.last_job,'lastLsn',n.last_lsn,
   'dailyBytes',(select coalesce(sum(c.bytes),0) from ats_recovery_lab.native_charges c where charged_at>at-interval '24 hours'),
   'rolling31DayBytes',(select coalesce(sum(c.bytes),0) from ats_recovery_lab.native_charges c where charged_at>at-interval '31 days'));
 end if;
 job_id_value:=(p->>'requestId')::uuid;
 if action='prepare' then
  select * into j from ats_recovery_lab.native_jobs q where q.id=(p->>'requestId')::uuid;
  if j.id is not null then
   if j.namespace is distinct from ns or j.body_sha is distinct from p->>'bodySha' or j.ticket is distinct from t or j.expected_objects is distinct from objects then raise exception 'Request id reused';end if;
   if j.verified_at is null and j.lease_until<=at then raise exception 'Upload lease expired';end if;
   return jsonb_build_object('jobId',j.id,'prefix',j.id::text||'/','completed',j.verified_at is not null,'proof',j.proof,'componentSha256',j.component_sha,'report',j.report);
  end if;
  seq:=(t->>'sequence')::bigint;
  if p->>'bodySha' is null or p->>'kind' is null
   or exists(select 1 from unnest(array['namespace','sequence','capturePath','manifestSha256','snapshotId','captureStartedBootMs','captureStartedAt','captureCompletedAt'])k where t->>k is null)
   or p->>'bodySha'!~'^[a-f0-9]{64}$' or p->>'kind' not in('base','delta') or seq is distinct from n.last_sequence+1
   or t->'binding' is distinct from n.binding or t->>'namespace' is distinct from ns
   or t->>'capturePath' is distinct from '/home/noelsierra.guest/candidate/native-'||right(ns,12)||'/capture-'||seq::text
   or t->>'manifestSha256'!~'^[a-f0-9]{64}$' or t->>'snapshotId'!~'^[a-f0-9]{64}$'
   or (t->>'captureStartedBootMs')::numeric<=0 or (t->>'captureStartedAt')::timestamptz>at
   or (t->>'captureStartedAt')::timestamptz<at-interval '240 seconds'
   or (t->>'captureCompletedAt')::timestamptz<(t->>'captureStartedAt')::timestamptz or (t->>'captureCompletedAt')::timestamptz>at then raise exception 'Invalid fresh native ticket';end if;
  if coalesce(t->>'parentJobId','') is distinct from coalesce(n.last_job::text,'') then raise exception 'Parent changed';end if;
  if p->>'kind'='delta' and n.last_job is null then raise exception 'A full base is required';end if;
  if jsonb_typeof(objects) is distinct from 'array' or jsonb_array_length(objects)<1 or jsonb_array_length(objects)>64 then raise exception 'Invalid object set';end if;
  total:=0;
  for v in select value from jsonb_array_elements(objects) loop
   if v->>'name' is null or v->>'size' is null or v->>'sha256' is null
    or v->>'name'!~'^(config|keys/[a-f0-9]{64}|index/[a-f0-9]{64}|snapshots/[a-f0-9]{64}|data/[a-f0-9]{2}/[a-f0-9]{64})$'
    or v->>'sha256'!~'^[a-f0-9]{64}$' or (v->>'size')::bigint<1 or (v->>'size')::bigint>33554432 then raise exception 'Invalid encrypted object';end if;
   total:=total+(v->>'size')::bigint;
  end loop;
  if total>134217728 or not exists(select 1 from jsonb_array_elements(objects)o where o->>'name'='config')
   or (select count(distinct o->>'name') from jsonb_array_elements(objects)o)<>jsonb_array_length(objects) then raise exception 'Invalid repository';end if;
  if not exists(select 1 from storage.buckets where id=n.bucket and public=false and file_size_limit<=33554432) then raise exception 'Private native bucket required';end if;
  bytes:=total+8192;
  -- Conservative account-wide guard, including all old lab reservations in the
  -- current/previous calendar month. Failures remain charged. No caller refund.
  perform pg_advisory_xact_lock(178214,4280);
  select coalesce(sum(reserved_bytes),0) into old_bytes from ats_recovery_lab.budgets where period in('m:'||to_char(at,'YYYY-MM'),'m:'||to_char(at-interval '1 month','YYYY-MM'));
  if old_bytes+(select coalesce(sum(c.bytes),0) from ats_recovery_lab.native_charges c where charged_at>at-interval '31 days')+bytes>2147483648 then raise exception 'Account recovery budget exhausted';end if;
  select coalesce(sum(reserved_bytes),0) into old_bytes from ats_recovery_lab.budgets where period in('d:'||to_char(at,'YYYY-MM-DD'),'d:'||to_char(at-interval '1 day','YYYY-MM-DD'));
  if old_bytes+(select coalesce(sum(c.bytes),0) from ats_recovery_lab.native_charges c where charged_at>at-interval '24 hours')+bytes>536870912 then raise exception 'Daily recovery budget exhausted';end if;
  insert into ats_recovery_lab.native_jobs(id,namespace,body_sha,kind,sequence,parent_job,ticket,expected_objects,lease_until)
   values(job_id_value,ns,p->>'bodySha',p->>'kind',seq,n.last_job,t,objects,least(at+interval '180 seconds',(t->>'captureStartedAt')::timestamptz+interval '270 seconds'));
  insert into ats_recovery_lab.native_charges(job_id,bytes) values(job_id_value,control.bytes);
  return jsonb_build_object('jobId',job_id_value,'prefix',job_id_value::text||'/','completed',false,'reservedBytes',bytes);
 end if;
 if action in('inventory','finish','admit') and not exists(select 1 from storage.buckets b where b.id=n.bucket and b.public=false and b.file_size_limit<=33554432) then raise exception 'Private native bucket required';end if;
 select * into strict j from ats_recovery_lab.native_jobs q where q.id=(p->>'jobId')::uuid and q.namespace=ns for update;
 if action='inventory' then return ats_recovery_lab.native_inventory(n.bucket,j.id);
 elsif action='finish' then
  if j.body_sha is distinct from p->>'bodySha' then raise exception 'Job changed';end if;
  if j.verified_at is not null then return jsonb_build_object('proof',j.proof,'componentSha256',j.component_sha,'report',j.report,'replayed',true);end if;
  if j.lease_until<=at then raise exception 'Verification lease expired';end if;
  inventory:=ats_recovery_lab.native_inventory(n.bucket,j.id);
  if inventory is distinct from p->'inventory' or jsonb_array_length(inventory)<>jsonb_array_length(j.expected_objects) then raise exception 'Inventory changed';end if;
  if exists(select 1 from jsonb_array_elements(j.expected_objects)e where not exists(select 1 from jsonb_array_elements(inventory)o where o->>'name'=e->>'name' and o->>'size'=e->>'size' and o->>'version' is not null)) then raise exception 'Object set changed';end if;
  proof:=p->'proof';
  if exists(select 1 from unnest(array['privatePairSha256','targetLsn'])k where proof->>k is null)
   or proof->>'kind' is distinct from 'native-wal-component-v1' or proof->>'componentType' is distinct from j.kind
   or proof->'binding' is distinct from n.binding or proof->>'manifestSha256' is distinct from j.ticket->>'manifestSha256'
   or proof->>'snapshotId' is distinct from j.ticket->>'snapshotId' or proof->>'jobId' is distinct from j.id::text
   or proof->>'resticFullReadPassed' is distinct from 'true' or proof->>'publicAccessDenied' is distinct from 'true'
   or proof->>'writeAdmission' is distinct from 'false' or proof->>'privatePairSha256'!~'^[a-f0-9]{64}$'
   or proof->>'targetLsn' is null then raise exception 'Incomplete independent proof';end if;
  perform (proof->>'targetLsn')::pg_lsn;
  if j.kind='base' then
   if proof->>'completeRecoveryPackage' is distinct from 'true' then raise exception 'Incomplete full base';end if;
   proof:=proof||jsonb_build_object('baseJobId',j.id,'fullVerifiedAt',at,'fullExpiresAt',at+interval '24 hours');
  else
   select * into strict parent from ats_recovery_lab.native_jobs where native_jobs.id=j.parent_job;
   if parent.verified_at is null or proof->>'previousTargetLsn' is distinct from parent.proof->>'targetLsn'
    or proof->>'privatePairSha256' is distinct from parent.proof->>'privatePairSha256'
    or (proof->>'targetLsn')::pg_lsn<=(parent.proof->>'targetLsn')::pg_lsn then raise exception 'Broken recovery chain';end if;
   proof:=proof||jsonb_build_object('baseJobId',parent.proof->>'baseJobId','fullVerifiedAt',parent.proof->>'fullVerifiedAt','fullExpiresAt',parent.proof->>'fullExpiresAt');
  end if;
  proof:=proof||jsonb_build_object('verifiedAt',at,'sequence',j.sequence);
  update ats_recovery_lab.native_jobs set verified_at=at,inventory=control.inventory,proof=control.proof,component_sha=encode(sha256(convert_to(control.proof::text,'UTF8')),'hex'),report=p->'report' where native_jobs.id=j.id returning * into j;
  return jsonb_build_object('proof',j.proof,'componentSha256',j.component_sha,'report',j.report,'replayed',false);
 elsif action='admit' then
  select * into a from ats_recovery_lab.native_admissions where request_id=(p->>'requestId')::uuid;
  if a.request_id is not null then
   if a.namespace is distinct from ns or a.body_sha is distinct from p->>'bodySha' or a.job_id is distinct from j.id then raise exception 'Admission id reused';end if;
   return jsonb_build_object('claims',a.claims,'chain',a.chain,'replayed',true);
  end if;
  if not n.enabled or j.verified_at is null or j.sequence<>n.last_sequence+1 or j.parent_job is distinct from n.last_job
   or j.ticket->'binding' is distinct from n.binding then raise exception 'Source disabled or stale parent';end if;
  expires:=least((j.ticket->>'captureStartedAt')::timestamptz+interval '280 seconds',(j.proof->>'fullExpiresAt')::timestamptz);
  if expires<=at+interval '20 seconds' or (n.last_lsn is not null and (j.proof->>'targetLsn')::pg_lsn<=n.last_lsn) then raise exception 'Recovery cutoff is stale';end if;
  with recursive deps as(
   select q.*,1 depth from ats_recovery_lab.native_jobs q where q.id=j.id
   union all select q.*,d.depth+1 from deps d join ats_recovery_lab.native_jobs q on q.id=d.parent_job where d.kind='delta' and d.depth<2049
  ) select count(*),count(*) filter(where verified_at is null or namespace<>ns or depth>2048 or ticket->'binding' is distinct from n.binding
    or component_sha is distinct from encode(sha256(convert_to(deps.proof::text,'UTF8')),'hex')
    or deps.inventory is distinct from ats_recovery_lab.native_inventory(n.bucket,deps.id)),
    count(*) filter(where kind='base' and deps.id=(j.proof->>'baseJobId')::uuid) into component_count,bad_components,base_count from deps;
  if bad_components<>0 or component_count<1 or base_count<>1 then raise exception 'A recovery dependency is missing or changed';end if;
  claims:=jsonb_build_object('version',1,'kind','certified-native-wal-backup','namespace',ns,'generation',(n.binding->>'generation')::bigint,'binding',n.binding,'sequence',j.sequence,'jobId',j.id,
   'baseJobId',j.proof->>'baseJobId','componentSha256',j.component_sha,'snapshotId',j.ticket->>'snapshotId','manifestSha256',j.ticket->>'manifestSha256',
   'captureStartedAt',j.ticket->>'captureStartedAt','captureStartedBootMs',j.ticket->'captureStartedBootMs','captureCompletedAt',j.ticket->>'captureCompletedAt',
   'issuedAt',at,'expiresAt',expires,'offsiteVerifiedAt',j.verified_at,'fullVerifiedAt',j.proof->>'fullVerifiedAt','fullExpiresAt',j.proof->>'fullExpiresAt',
   'targetLsn',j.proof->>'targetLsn','privatePairSha256',j.proof->>'privatePairSha256','completeRecoveryChain',true,'allNewBytesReadBack',true,
   'retainedProviderVersionsChecked',true,'freshFullRemoteRead',j.kind='base','serializedByAuthority',true);
  chain:=jsonb_build_object('version',1,'kind','native-wal-chain-reference','namespace',ns,'binding',n.binding,'jobId',j.id,'baseJobId',j.proof->>'baseJobId',
   'componentSha256',j.component_sha,'sequence',j.sequence,'targetLsn',j.proof->>'targetLsn','privatePairSha256',j.proof->>'privatePairSha256','dependencies',component_count,
   'issuedAt',at,'expiresAt',j.proof->>'fullExpiresAt','writeAdmission',false);
  insert into ats_recovery_lab.native_admissions(namespace,sequence,request_id,body_sha,job_id,claims,chain) values(ns,j.sequence,(p->>'requestId')::uuid,p->>'bodySha',j.id,control.claims,control.chain);
  update ats_recovery_lab.native_sources set last_sequence=j.sequence,last_job=j.id,last_lsn=(j.proof->>'targetLsn')::pg_lsn where namespace=ns;
  return jsonb_build_object('claims',claims,'chain',chain,'replayed',false);
 end if;
 raise exception 'Unsupported native recovery action';
end $body$;
revoke all on function public.ats_recovery_native_control(jsonb) from public,anon,authenticated;
grant execute on function public.ats_recovery_native_control(jsonb) to service_role;
commit;
