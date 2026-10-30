-- Extend the staging-only native verifier with one charged read attempt per job.
-- A lost completed response is recoverable without downloading the archive again.
begin;
do $guard$ begin
 if md5(pg_get_functiondef('public.ats_recovery_native_control(jsonb)'::regprocedure))<>'32fd06a56b45e617f243e67b500318be' then
  raise exception 'Reviewed native staging authority required';
 end if;
end $guard$;
-- The old limits were per lab namespace. The native limit covers ALL recovery
-- traffic and prior lab reservations: 3 GiB/rolling 31 days, 512 MiB/day. This
-- leaves room below the observed 5 GB free allowance and includes bounded
-- metadata/upload-grant responses. No legacy namespace's cap is changed.
do $account_budget$ declare definition text:=pg_get_functiondef('public.ats_recovery_native_control(jsonb)'::regprocedure);begin
 if (length(definition)-length(replace(definition,'bytes:=total+8192;','')))/length('bytes:=total+8192;')<>1
  or (length(definition)-length(replace(definition,'>2147483648','')))/length('>2147483648')<>1 then raise exception 'Unexpected native budget definition';end if;
 definition:=replace(definition,'bytes:=total+8192;','bytes:=total+32768+jsonb_array_length(objects)*512;');
 definition:=replace(definition,'>2147483648','>3221225472');
 execute definition;
end $account_budget$;
alter table ats_recovery_lab.native_charges drop constraint native_charges_bytes_check;
alter table ats_recovery_lab.native_charges add constraint native_charges_bytes_check check(bytes>0 and bytes<=134283264);
alter table ats_recovery_lab.native_jobs add column verification_started_at timestamptz;
create function ats_recovery_lab.require_native_verification() returns trigger
language plpgsql set search_path=pg_catalog as $body$
begin
 if new.verified_at is not null and new.verification_started_at is null then raise exception 'An independent verification attempt is required';end if;
 return new;
end $body$;
revoke all on function ats_recovery_lab.require_native_verification() from public,anon,authenticated,service_role;
create trigger native_verification_attempt_required before update on ats_recovery_lab.native_jobs
 for each row execute function ats_recovery_lab.require_native_verification();
create function public.ats_recovery_native_verification(p_namespace text,p_job_id uuid,p_read_only boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,ats_recovery_lab as $body$
declare n ats_recovery_lab.native_sources%rowtype;j ats_recovery_lab.native_jobs%rowtype;parent ats_recovery_lab.native_jobs%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role required' using errcode='42501';end if;
 select * into strict n from ats_recovery_lab.native_sources where namespace=p_namespace for update;
 select * into strict j from ats_recovery_lab.native_jobs where id=p_job_id and namespace=p_namespace for update;
 if not p_read_only and j.verified_at is null then
  if j.verification_started_at is not null then raise exception 'Verification already attempted; no uncharged replay';end if;
  if j.lease_until<=clock_timestamp() then raise exception 'Verification lease expired';end if;
  update ats_recovery_lab.native_jobs set verification_started_at=clock_timestamp() where id=p_job_id returning * into j;
 end if;
 if j.parent_job is not null then select * into strict parent from ats_recovery_lab.native_jobs where id=j.parent_job and namespace=p_namespace;end if;
 return jsonb_build_object('jobId',j.id,'namespace',j.namespace,'bucket',n.bucket,'binding',n.binding,'enabled',n.enabled,'bodySha',j.body_sha,
  'kind',j.kind,'ticket',j.ticket,'objects',j.expected_objects,'prefix',j.id::text||'/','completed',j.verified_at is not null,
  'attempted',j.verification_started_at is not null,'proof',j.proof,'componentSha256',j.component_sha,'report',j.report,
  'parentProof',parent.proof,'parentComponentSha256',parent.component_sha);
end $body$;
revoke all on function public.ats_recovery_native_verification(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.ats_recovery_native_verification(text,uuid,boolean) to service_role;
commit;
