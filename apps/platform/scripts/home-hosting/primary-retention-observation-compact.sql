begin;do $guard$ begin if md5(pg_get_functiondef('ats_home_backup.native_retention_command(jsonb)'::regprocedure))<>'b30533b302ffe740fe54f663df92e350' then raise exception 'Reviewed initial primary retention required';end if;end $guard$;
create or replace function ats_home_backup.native_retention_command(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,ats_home_backup as $body$
declare ns text:=p->>'namespace';action text:=p->>'action';n ats_home_backup.native_sources%rowtype;
 j ats_home_backup.native_jobs%rowtype;r ats_home_backup.native_retirements%rowtype;
 snapshot jsonb;inventory jsonb;protected boolean;depth integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role required' using errcode='42501';end if;
 if ns is null or ns!~'^ats-home-continuous-[a-f0-9]{12}$' then raise exception 'Invalid native namespace';end if;
 -- Same lock as prepare/finish/admit: a head change cannot race retirement.
 select * into strict n from ats_home_backup.native_sources where namespace=ns for update;
 snapshot:=ats_home_backup.native_retention_snapshot(ns);
 if action='snapshot' then return snapshot;end if;
 if ((p->'snapshot')-'retiredJobIds') is distinct from (snapshot-'retiredJobIds') then raise exception 'Retention observation changed';end if;
 select * into strict j from ats_home_backup.native_jobs where id=(p->>'jobId')::uuid and namespace=ns for update;
 if action='pin' then
  if exists(select 1 from ats_home_backup.native_retirements where job_id=j.id) then raise exception 'Retired component cannot be pinned';end if;
  if exists(with recursive deps as(
    select q.id,q.namespace,q.kind,q.parent_job,q.verified_at,1 depth from ats_home_backup.native_jobs q where q.id=j.id
    union all select q.id,q.namespace,q.kind,q.parent_job,q.verified_at,d.depth+1 from deps d join ats_home_backup.native_jobs q on q.id=d.parent_job where d.kind='delta' and d.depth<=2048
   )select 1 from deps d where d.namespace<>ns or d.verified_at is null or d.depth>2048
     or exists(select 1 from ats_home_backup.native_retirements retired where retired.job_id=d.id))
    then raise exception 'A pinned recovery dependency is retired or incomplete';end if;
  insert into ats_home_backup.native_pins values(ns,j.id,p->>'reason') on conflict do nothing;
  return jsonb_build_object('pinned',true);
 end if;
 if action not in('prepare','finish') then raise exception 'Unsupported retention action';end if;
 if n.last_job is null or (select count(*) from ats_home_backup.native_jobs where namespace=ns)>65536 then raise exception 'Bounded verified source required';end if;
 if not exists(select 1 from ats_home_backup.native_jobs where id=n.last_job and namespace=ns and verified_at is not null)
  or exists(select 1 from ats_home_backup.native_jobs q left join ats_home_backup.native_jobs parent on parent.id=q.parent_job
    where q.namespace=ns and ((q.sequence=1 and (q.kind<>'base' or q.parent_job is not null))
    or (q.sequence>1 and (parent.namespace is distinct from ns or parent.sequence is distinct from q.sequence-1))))
  then raise exception 'Incomplete recovery history';end if;
 -- Independently recompute the planner's protected roots and dependency closure.
 with recursive jobs as(select * from ats_home_backup.native_jobs where namespace=ns),
 roots as(
  select id from jobs where id=n.last_job or verified_at is null
    or greatest(created_at,coalesce(verified_at,created_at))>clock_timestamp()-interval '24 hours'
  union select id from(select id from jobs where verified_at is not null order by sequence desc,id desc limit 2)latest
  union select id from(select distinct on((created_at at time zone 'UTC')::date) id from jobs where verified_at is not null and created_at>=clock_timestamp()-interval '7 days' order by (created_at at time zone 'UTC')::date,sequence desc,id desc)daily
  union select job_id from ats_home_backup.native_pins where namespace=ns
 ), closure(id,kind,parent_job,depth) as(
  select q.id,q.kind,q.parent_job,1 from jobs q join roots on roots.id=q.id
  union all select q.id,q.kind,q.parent_job,c.depth+1 from closure c join jobs q on q.id=c.parent_job where c.kind='delta' and c.depth<=2048
 ) select coalesce(bool_or(id=j.id),false),coalesce(max(closure.depth),0) into protected,depth from closure;
 if protected or depth>2048 then raise exception 'Protected recovery component';end if;
 if j.verified_at is null or j.inventory is null or j.component_sha is null then raise exception 'Unverified evidence retained';end if;
 if not exists(select 1 from storage.buckets where id=n.bucket and public=false and file_size_limit<=33554432) then raise exception 'Private bounded bucket required';end if;
 select * into r from ats_home_backup.native_retirements where job_id=j.id;
 inventory:=ats_home_backup.native_inventory(n.bucket,j.id);
 if action='prepare' then
  if r.job_id is null then
   if inventory is distinct from j.inventory then raise exception 'Provider versions changed';end if;
   insert into ats_home_backup.native_retirements(namespace,job_id,inventory,observed_snapshot) values(ns,j.id,inventory,jsonb_build_object('kind','native-retention-observation-v1','namespace',ns,'headJobId',n.last_job,'bindingSha256',snapshot->>'bindingSha256','jobs',jsonb_array_length(snapshot->'jobs'),'snapshotSha256',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'))) returning * into r;
  else
   if exists(select 1 from jsonb_array_elements(inventory)o where not exists(select 1 from jsonb_array_elements(r.inventory)e where e=o)) then raise exception 'Retirement provider versions changed';end if;
  end if;
  return jsonb_build_object('namespace',ns,'jobId',j.id,'bucket',n.bucket,'prefix',j.id::text||'/',
    'inventory',r.inventory,'remaining',inventory,'retired',true,'completed',r.completed_at is not null,'writeAdmission',false);
 end if;
 if r.job_id is null or jsonb_array_length(inventory)<>0 then raise exception 'Retirement incomplete';end if;
 update ats_home_backup.native_retirements set completed_at=coalesce(completed_at,clock_timestamp()) where job_id=j.id;
 return jsonb_build_object('retired',true,'completed',true,'historyPreserved',true,'writeAdmission',false);
end $body$;
commit;
