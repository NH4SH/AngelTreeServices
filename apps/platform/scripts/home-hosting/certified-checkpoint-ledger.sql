-- Synthetic staging infrastructure only. No CRM tables or production authority.
begin;
do $guard$ begin
 if md5(pg_get_functiondef('ats_staging_auth.reject_email(jsonb)'::regprocedure))<>'c601aeb6c6c0ad4da79265034f84c1a6'
  or md5(pg_get_functiondef('public.ats_recovery_incremental_control(jsonb)'::regprocedure))<>'5998c3db0f26b78e9a172eac947b2cea' then
  raise exception 'Reviewed staging baseline required';end if;
end $guard$;
create table ats_recovery_lab.certified_admissions(
 namespace text references ats_recovery_lab.namespaces,request_id uuid,body_sha text not null,
 archive_request_id uuid not null,claims jsonb not null,created_at timestamptz not null default clock_timestamp(),
 primary key(namespace,request_id),unique(namespace,archive_request_id));
alter table ats_recovery_lab.certified_admissions enable row level security;
revoke all on ats_recovery_lab.certified_admissions from public,anon,authenticated,service_role;

create function public.ats_recovery_certify_checkpoint(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,ats_recovery_lab as $function$
declare ns text:=p->>'namespace';n ats_recovery_lab.namespaces%rowtype;j ats_recovery_lab.jobs%rowtype;
 old ats_recovery_lab.certified_admissions%rowtype;previous jsonb;c jsonb:=p->'catalog';a jsonb:=p->'archive';
 proposed jsonb:=p->'claims';stored_catalog jsonb;inventory jsonb;expected jsonb;field text;at timestamptz:=clock_timestamp();
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role required' using errcode='42501';end if;
 if p->>'action' is distinct from 'certify' or ns is null or ns!~'^ats-rehearsal-continuous-[a-f0-9]{12}$'
  or p->>'bodySha' is null or p->>'bodySha'!~'^[a-f0-9]{64}$' then raise exception 'Invalid certification request';end if;
 select * into strict n from ats_recovery_lab.namespaces where namespace=ns for update;
 select * into old from ats_recovery_lab.certified_admissions where namespace=ns and request_id=(p->>'requestId')::uuid;
 if old.request_id is not null then
  if old.body_sha is distinct from p->>'bodySha' then raise exception 'Request id body mismatch';end if;
  if (old.claims->>'expiresAt')::timestamptz<=at then raise exception 'Original admission expired';end if;
  perform ats_recovery_lab.charge_bytes(ns,octet_length(old.claims::text)+4096);
  return jsonb_build_object('claims',old.claims,'replayed',true);
 end if;
 -- The exact archive result must already have completed independently. An
 -- uploader's claimed report, or an in-flight/lost job, cannot open a writer.
 select * into strict j from ats_recovery_lab.jobs where namespace=ns and claims=a;
 if j.report->'resticStructuralCheckPassed' is distinct from 'true'::jsonb
  or j.report->'receiptPermitsWrites' is distinct from 'false'::jsonb
  or j.report->'fullDataRead' is distinct from 'false'::jsonb
  or not coalesce((j.report->>'newPacksFullyVerified')::int>0,false)
  or not coalesce(j.report->>'databaseVerification' in('ordered-part-sha256','whole-file-sha256'),false) then raise exception 'Complete native incremental verification required';end if;
 stored_catalog:=convert_from(decode(translate(j.report->'catalogCertificate'->>'payload','-_','+/')||
  repeat('=',(4-length(j.report->'catalogCertificate'->>'payload')%4)%4),'base64'),'UTF8')::jsonb;
 if stored_catalog is distinct from c or c->>'kind' is distinct from 'restic-verified-catalog'
  or c->'writeAdmission' is distinct from 'false'::jsonb or c ? 'backupLayout'
  or a->>'kind' is distinct from 'archive-verification' or a->'writeAdmission' is distinct from 'false'::jsonb
  or a->>'verificationMode' is distinct from 'incremental-verified-baseline'
  or proposed->>'kind' is distinct from 'certified-incremental-backup'
  or proposed->>'verificationMode' is distinct from 'native-new-pack-readback-and-certified-retained-graph'
  or proposed->'freshFullRemoteRead' is distinct from 'false'::jsonb then raise exception 'Wrong proof contract';end if;
 foreach field in array array['namespace','generation','sourceId','sourceBoot','databaseBoot','topology','sequence','snapshotId','captureStartedAt','captureStartedBootMs','captureCompletedAt','runtimeManifestSha256'] loop
  if proposed->field is null or proposed->field is distinct from c->field or proposed->field is distinct from a->field then raise exception 'Source binding mismatch';end if;
 end loop;
 if proposed->>'namespace' is distinct from ns or proposed->>'sourceId' is distinct from 'ats_crm_candidate_20261027'
  or proposed->>'manifestSha256' is distinct from a->>'manifestSha256'
  or proposed->>'manifestSha256' is distinct from c->'artifacts'->'manifest.private.json'->>'sha256'
  or proposed->>'inventorySha256' is distinct from a->>'inventorySha256'
  or proposed->>'offsiteVerifiedAt' is distinct from a->>'issuedAt'
  or c->>'issuedAt' is distinct from a->>'issuedAt'
  or proposed->>'fullVerifiedAt' is distinct from c->>'fullVerifiedAt'
  or proposed->>'fullExpiresAt' is distinct from c->>'expiresAt' then raise exception 'Capture binding mismatch';end if;
 foreach field in array array['completeSnapshot','allNewPacksReadBack','retainedObjectsPhysicallyObserved','nativeGraphChecked',
  'pairedDatabaseAndFiles','authIncluded','paymentAndDeliveryIncluded','publicAccessDenied','serializedByAuthority'] loop
  if proposed->field is distinct from 'true'::jsonb then raise exception 'Incomplete certification';end if;
 end loop;
 if not coalesce((proposed->>'sequence')::bigint>n.last_sequence and (proposed->>'captureStartedBootMs')::numeric>0
  and (proposed->>'captureStartedAt')::timestamptz<= (proposed->>'captureCompletedAt')::timestamptz
  and (proposed->>'captureCompletedAt')::timestamptz<=(a->>'issuedAt')::timestamptz
  and (a->>'issuedAt')::timestamptz<=at and (a->>'expiresAt')::timestamptz>at
  and (proposed->>'issuedAt')::timestamptz between at-interval '10 seconds' and at+interval '2 seconds'
  and (proposed->>'captureStartedAt')::timestamptz>at-interval '260 seconds'
  and (c->>'fullVerifiedAt')::timestamptz<=(c->>'issuedAt')::timestamptz
  and (c->>'expiresAt')::timestamptz=(c->>'fullVerifiedAt')::timestamptz+interval '24 hours'
  and (proposed->>'expiresAt')::timestamptz=least((proposed->>'captureStartedAt')::timestamptz+interval '280 seconds',(c->>'expiresAt')::timestamptz)
  and (proposed->>'expiresAt')::timestamptz>at,false) then raise exception 'Stale, duplicate or extended admission';end if;
 select claims into previous from ats_recovery_lab.certified_admissions where namespace=ns order by created_at desc limit 1;
 if previous is not null then
  foreach field in array array['generation','sourceId','sourceBoot','databaseBoot','topology'] loop
   if previous->field is distinct from proposed->field then raise exception 'Source changed without a new rehearsal';end if;
  end loop;
  if (proposed->>'captureStartedAt')::timestamptz<=(previous->>'captureStartedAt')::timestamptz then raise exception 'Capture rollback';end if;
 end if;
 if not exists(select 1 from storage.buckets where id=n.bucket and public=false and file_size_limit<=33554432) then raise exception 'Private bounded bucket required';end if;
 select jsonb_agg(jsonb_build_object('name',o.name,'id',o.id,'version',o.version,'size',(o.metadata->>'size')::bigint) order by o.name)
 into inventory from storage.objects o where bucket_id=n.bucket;
 select jsonb_agg(jsonb_build_object('name',x->>'name','id',x->>'id','version',x->>'version','size',(x->>'size')::bigint) order by x->>'name')
 into expected from jsonb_array_elements(c->'objects')x;
 if inventory is distinct from expected then raise exception 'Physical recovery inventory changed after verification';end if;
 if (j.report->>'retainedObjectsPhysicallyObserved')::int is distinct from jsonb_array_length(c->'objects')-(j.report->>'newObjects')::int then raise exception 'Retained object observation incomplete';end if;
 perform ats_recovery_lab.charge_bytes(ns,octet_length(proposed::text)+4096);
 insert into ats_recovery_lab.certified_admissions values(ns,(p->>'requestId')::uuid,p->>'bodySha',j.request_id,proposed,at);
 update ats_recovery_lab.namespaces set last_sequence=(proposed->>'sequence')::bigint where namespace=ns;
 return jsonb_build_object('claims',proposed,'replayed',false);
end $function$;
revoke all on function public.ats_recovery_certify_checkpoint(jsonb) from public,anon,authenticated;
grant execute on function public.ats_recovery_certify_checkpoint(jsonb) to service_role;
commit;
