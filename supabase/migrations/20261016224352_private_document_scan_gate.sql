-- Staged file-safety rollout: inactive until an explicit local/production review.
-- No backfill, file deletion, external sending, or automatic activation.
create table app_private.document_scan_settings (
  singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into app_private.document_scan_settings default values;
alter table app_private.document_scan_settings enable row level security;
revoke all on app_private.document_scan_settings from public,anon,authenticated,service_role;
alter table public.documents
  add column scan_status text not null default 'unscanned' check(scan_status in ('unscanned','checking','clean','quarantined','unavailable')),
  add column scan_checked_at timestamptz,
  add column scan_sha256 text check(scan_sha256 is null or scan_sha256 ~ '^[a-f0-9]{64}$');
create table app_private.document_scan_attempts (
  token uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id),
  actor_id uuid not null references public.profiles(id), storage_path text not null,
  expected_sha256 text check(expected_sha256 is null or expected_sha256 ~ '^[a-f0-9]{64}$'),
  started_at timestamptz not null default clock_timestamp(), finished_at timestamptz,
  verdict text check(verdict in ('clean','quarantined','unavailable')),
  sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$')
);
create index document_scan_attempts_document_idx on app_private.document_scan_attempts(document_id,started_at desc);
alter table app_private.document_scan_attempts enable row level security;
revoke all on app_private.document_scan_attempts from public,anon,authenticated,service_role;

create function app_private.guard_document_scan_fields() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('postgres','service_role','supabase_admin') then
   if tg_op='INSERT' then
     if new.scan_status<>'unscanned' or new.scan_sha256 is not null or new.scan_checked_at is not null
       or split_part(new.storage_path,'/',1) is distinct from auth.uid()::text
       or new.uploaded_by_user_id is distinct from auth.uid() then
       raise exception 'Invalid document upload metadata' using errcode='42501';end if;
   elsif new.scan_status is distinct from old.scan_status or new.scan_sha256 is distinct from old.scan_sha256
     or new.scan_checked_at is distinct from old.scan_checked_at or new.storage_path is distinct from old.storage_path
     or new.uploaded_by_user_id is distinct from old.uploaded_by_user_id or new.mime_type is distinct from old.mime_type
     or new.file_size_bytes is distinct from old.file_size_bytes then
     raise exception 'File identity and scan results are protected' using errcode='42501';end if;
 end if;
 return new;
end $$;
create trigger documents_scan_fields before insert or update on public.documents
 for each row execute function app_private.guard_document_scan_fields();

create function app_private.document_scan_mode() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select enabled from app_private.document_scan_settings where singleton),false)
   and (current_setting('role',true)='service_role' or app_private.has_staff_role());
$$;
create function public.document_scan_mode() returns boolean
language sql stable security invoker set search_path='' as $$ select app_private.document_scan_mode(); $$;

-- Restrictive policy cannot be bypassed by another permissive bucket policy.
-- The existing staff/classification/archive and effective-access policies remain.
create function app_private.document_scan_download_allowed(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select not coalesce((select enabled from app_private.document_scan_settings where singleton),false)
   or exists(select 1 from public.documents where storage_path=p_path and scan_status='clean' and archived_at is null);
$$;
create policy "Platform documents require a clean scan when enabled" on storage.objects
 as restrictive for select to authenticated using(bucket_id<>'platform-documents' or app_private.document_scan_download_allowed(name));

create function app_private.assert_document_scan_actor(p_actor uuid,p_sensitive boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if current_setting('role',true)<>'service_role' or p_actor is null
   or not app_private.effective_platform_access(p_actor)
   or not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=p_actor
     and r.name=any(case when p_sensitive then array['owner','admin'] else array['owner','admin','payroll_admin','estimator'] end)) then
   raise exception 'Document scanning is unavailable to this account' using errcode='42501';end if;
end $$;
create function app_private.claim_document_scan(p_document uuid,p_actor uuid,p_expected_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.documents%rowtype; a app_private.document_scan_attempts%rowtype;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('platform-role-management'));
 select * into d from public.documents where id=p_document and archived_at is null for update;
 if not found then raise exception 'Document unavailable' using errcode='P0002';end if;
 perform app_private.assert_document_scan_actor(p_actor,d.access_classification='employee_sensitive');
 if not app_private.document_scan_mode() then raise exception 'Document checks are not enabled' using errcode='55000';end if;
 if d.scan_status in ('clean','quarantined') then return jsonb_build_object('status',d.scan_status);end if;
 if exists(select 1 from app_private.document_scan_attempts where document_id=d.id and finished_at is null and started_at>clock_timestamp()-interval '90 seconds') then
   raise exception 'A file check is already running' using errcode='55P03';end if;
 insert into app_private.document_scan_attempts(document_id,actor_id,storage_path,expected_sha256)
   values(d.id,p_actor,d.storage_path,p_expected_sha256) returning * into a;
 update public.documents set scan_status='checking' where id=d.id;
 return jsonb_build_object('token',a.token,'path',a.storage_path,'status','checking','size',d.file_size_bytes);
end $$;
create function app_private.finish_document_scan(p_document uuid,p_actor uuid,p_token uuid,p_verdict text,p_sha256 text) returns boolean
language plpgsql security definer set search_path='' as $$
declare d public.documents%rowtype; a app_private.document_scan_attempts%rowtype;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('platform-role-management'));
 select * into d from public.documents where id=p_document and archived_at is null for update;
 if not found then return false;end if;
 perform app_private.assert_document_scan_actor(p_actor,d.access_classification='employee_sensitive');
 select * into a from app_private.document_scan_attempts where token=p_token and document_id=d.id and actor_id=p_actor for update;
 if not found or a.finished_at is not null or a.storage_path<>d.storage_path or a.started_at<clock_timestamp()-interval '90 seconds'
   or exists(select 1 from app_private.document_scan_attempts n where n.document_id=d.id and n.started_at>a.started_at)
   or not app_private.document_scan_mode() then return false;end if;
 if p_verdict is null or p_verdict not in ('clean','quarantined','unavailable') then raise exception 'Invalid scan verdict' using errcode='22023';end if;
 if p_verdict in ('clean','quarantined') and (p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$') then raise exception 'Missing file digest' using errcode='22023';end if;
 if p_verdict='clean' and a.expected_sha256 is not null and p_sha256 is distinct from a.expected_sha256 then p_verdict:='unavailable';end if;
 update app_private.document_scan_attempts set finished_at=clock_timestamp(),verdict=p_verdict,sha256=p_sha256 where token=a.token;
 update public.documents set scan_status=p_verdict,scan_sha256=p_sha256,scan_checked_at=clock_timestamp() where id=d.id;
 insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,idempotency_key,metadata_json)
 values(p_actor,'system','document',d.id,'document_scan_finished','document-scan/'||a.token,jsonb_build_object('status',p_verdict));
 return true;
end $$;
create function public.claim_document_scan(p_document uuid,p_actor uuid,p_expected_sha256 text default null) returns jsonb
language sql security invoker set search_path='' as $$ select app_private.claim_document_scan(p_document,p_actor,p_expected_sha256); $$;
create function public.finish_document_scan(p_document uuid,p_actor uuid,p_token uuid,p_verdict text,p_sha256 text) returns boolean
language sql security invoker set search_path='' as $$ select app_private.finish_document_scan(p_document,p_actor,p_token,p_verdict,p_sha256); $$;
revoke all on function app_private.guard_document_scan_fields(),app_private.document_scan_mode(),app_private.document_scan_download_allowed(text),app_private.assert_document_scan_actor(uuid,boolean),app_private.claim_document_scan(uuid,uuid,text),app_private.finish_document_scan(uuid,uuid,uuid,text,text),public.document_scan_mode(),public.claim_document_scan(uuid,uuid,text),public.finish_document_scan(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function app_private.document_scan_mode(),public.document_scan_mode() to authenticated,service_role;
grant execute on function app_private.document_scan_download_allowed(text) to authenticated;
grant execute on function app_private.claim_document_scan(uuid,uuid,text),app_private.finish_document_scan(uuid,uuid,uuid,text,text),public.claim_document_scan(uuid,uuid,text),public.finish_document_scan(uuid,uuid,uuid,text,text) to service_role;
