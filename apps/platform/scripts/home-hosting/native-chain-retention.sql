-- Staging-only rehearsal of serialized native-component retirement.
-- Keep all ledger/history rows; delete only eligible immutable Storage payloads.
begin;
do $guard$ begin
 if md5(pg_get_functiondef('public.ats_recovery_native_control(jsonb)'::regprocedure))<>'22ba645b28655ec482fbc712b3584798'
 then raise exception 'Reviewed file-aware native authority required';end if;
end $guard$;
create table ats_recovery_lab.native_retirements(
 namespace text not null references ats_recovery_lab.native_sources,
 job_id uuid primary key references ats_recovery_lab.native_jobs,
 inventory jsonb not null,observed_snapshot jsonb not null,
 requested_at timestamptz not null default clock_timestamp(),completed_at timestamptz
);
create table ats_recovery_lab.native_pins(
 namespace text not null references ats_recovery_lab.native_sources,
 job_id uuid primary key references ats_recovery_lab.native_jobs,
 reason text not null check(length(reason) between 1 and 200)
);
alter table ats_recovery_lab.native_retirements enable row level security;
alter table ats_recovery_lab.native_pins enable row level security;
revoke all on ats_recovery_lab.native_retirements,ats_recovery_lab.native_pins from public,anon,authenticated,service_role;
create function ats_recovery_lab.native_retention_snapshot(ns text) returns jsonb
language sql stable security definer set search_path=pg_catalog,ats_recovery_lab as $body$
 select jsonb_build_object('namespace',n.namespace,'bindingSha256',encode(sha256(convert_to(n.binding::text,'UTF8')),'hex'),
 'headJobId',n.last_job,'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'namespace',j.namespace,
 'bindingSha256',encode(sha256(convert_to(n.binding::text,'UTF8')),'hex'),'sequence',j.sequence,'kind',j.kind,
 'parentJobId',j.parent_job,'createdAt',j.created_at,'verifiedAt',j.verified_at,'componentSha256',j.component_sha) order by j.sequence,j.id),'[]')
 from ats_recovery_lab.native_jobs j where j.namespace=n.namespace),
 'pinned',(select coalesce(jsonb_agg(p.job_id order by p.job_id),'[]') from ats_recovery_lab.native_pins p where p.namespace=n.namespace))
 from ats_recovery_lab.native_sources n where n.namespace=ns
$body$;
revoke all on function ats_recovery_lab.native_retention_snapshot(text) from public,anon,authenticated,service_role;
create function public.ats_recovery_native_retention(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,ats_recovery_lab as $body$
declare ns text:=p->>'namespace';action text:=p->>'action';n ats_recovery_lab.native_sources%rowtype;
 j ats_recovery_lab.native_jobs%rowtype;r ats_recovery_lab.native_retirements%rowtype;
 snapshot jsonb;inventory jsonb;protected boolean;depth integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role required' using errcode='42501';end if;
 if ns is null or ns!~'^ats-rehearsal-continuous-[a-f0-9]{12}$' then raise exception 'Invalid native namespace';end if;
 -- Same lock as prepare/finish/admit: a head change cannot race retirement.
 select * into strict n from ats_recovery_lab.native_sources where namespace=ns for update;
 snapshot:=ats_recovery_lab.native_retention_snapshot(ns);
 if action='snapshot' then return snapshot;end if;
 if p->'snapshot' is distinct from snapshot then raise exception 'Retention observation changed';end if;
 select * into strict j from ats_recovery_lab.native_jobs where id=(p->>'jobId')::uuid and namespace=ns for update;
 if action='pin' then
  if exists(select 1 from ats_recovery_lab.native_retirements where job_id=j.id) then raise exception 'Retired component cannot be pinned';end if;
  if exists(with recursive deps as(
    select q.id,q.namespace,q.kind,q.parent_job,q.verified_at,1 depth from ats_recovery_lab.native_jobs q where q.id=j.id
    union all select q.id,q.namespace,q.kind,q.parent_job,q.verified_at,d.depth+1 from deps d join ats_recovery_lab.native_jobs q on q.id=d.parent_job where d.kind='delta' and d.depth<=2048
   )select 1 from deps d where d.namespace<>ns or d.verified_at is null or d.depth>2048
     or exists(select 1 from ats_recovery_lab.native_retirements retired where retired.job_id=d.id))
    then raise exception 'A pinned recovery dependency is retired or incomplete';end if;
  insert into ats_recovery_lab.native_pins values(ns,j.id,p->>'reason') on conflict do nothing;
  return jsonb_build_object('pinned',true);
 end if;
 if action not in('prepare','finish') then raise exception 'Unsupported retention action';end if;
 if n.last_job is null or (select count(*) from ats_recovery_lab.native_jobs where namespace=ns)>8192 then raise exception 'Bounded verified source required';end if;
 if not exists(select 1 from ats_recovery_lab.native_jobs where id=n.last_job and namespace=ns and verified_at is not null)
  or exists(select 1 from ats_recovery_lab.native_jobs q left join ats_recovery_lab.native_jobs parent on parent.id=q.parent_job
    where q.namespace=ns and ((q.sequence=1 and (q.kind<>'base' or q.parent_job is not null))
    or (q.sequence>1 and (parent.namespace is distinct from ns or parent.sequence is distinct from q.sequence-1))))
  then raise exception 'Incomplete recovery history';end if;
 -- Independently recompute the planner's protected roots and dependency closure.
 with recursive jobs as(select * from ats_recovery_lab.native_jobs where namespace=ns),
 roots as(
  select id from jobs where id=n.last_job or verified_at is null
    or greatest(created_at,coalesce(verified_at,created_at))>clock_timestamp()-interval '24 hours'
  union select id from(select id from jobs where verified_at is not null order by sequence desc,id desc limit 2)latest
  union select id from(select distinct on((created_at at time zone 'UTC')::date) id from jobs where verified_at is not null and created_at>=clock_timestamp()-interval '7 days' order by (created_at at time zone 'UTC')::date,sequence desc,id desc)daily
  union select job_id from ats_recovery_lab.native_pins where namespace=ns
 ), closure(id,kind,parent_job,depth) as(
  select q.id,q.kind,q.parent_job,1 from jobs q join roots on roots.id=q.id
  union all select q.id,q.kind,q.parent_job,c.depth+1 from closure c join jobs q on q.id=c.parent_job where c.kind='delta' and c.depth<=2048
 ) select coalesce(bool_or(id=j.id),false),coalesce(max(closure.depth),0) into protected,depth from closure;
 if protected or depth>2048 then raise exception 'Protected recovery component';end if;
 if j.verified_at is null or j.inventory is null or j.component_sha is null then raise exception 'Unverified evidence retained';end if;
 if not exists(select 1 from storage.buckets where id=n.bucket and public=false and file_size_limit<=33554432) then raise exception 'Private bounded bucket required';end if;
 select * into r from ats_recovery_lab.native_retirements where job_id=j.id;
 inventory:=ats_recovery_lab.native_inventory(n.bucket,j.id);
 if action='prepare' then
  if r.job_id is null then
   if inventory is distinct from j.inventory then raise exception 'Provider versions changed';end if;
   insert into ats_recovery_lab.native_retirements(namespace,job_id,inventory,observed_snapshot) values(ns,j.id,inventory,snapshot) returning * into r;
  else
   if exists(select 1 from jsonb_array_elements(inventory)o where not exists(select 1 from jsonb_array_elements(r.inventory)e where e=o)) then raise exception 'Retirement provider versions changed';end if;
  end if;
  return jsonb_build_object('namespace',ns,'jobId',j.id,'bucket',n.bucket,'prefix',j.id::text||'/',
    'inventory',r.inventory,'remaining',inventory,'retired',true,'completed',r.completed_at is not null,'writeAdmission',false);
 end if;
 if r.job_id is null or jsonb_array_length(inventory)<>0 then raise exception 'Retirement incomplete';end if;
 update ats_recovery_lab.native_retirements set completed_at=coalesce(completed_at,clock_timestamp()) where job_id=j.id;
 return jsonb_build_object('retired',true,'completed',true,'historyPreserved',true,'writeAdmission',false);
end $body$;
revoke all on function public.ats_recovery_native_retention(jsonb) from public,anon,authenticated;
grant execute on function public.ats_recovery_native_retention(jsonb) to service_role;
commit;
