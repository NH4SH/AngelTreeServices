begin;
set local lock_timeout='1s';
set local statement_timeout='5s';
-- Capture immutable object identity without backfilling or activating old files.
create table app_private.attachment_scan_settings (
 bucket_id text primary key check(bucket_id in ('employee-files','employee-program-files','equipment-files','material-files','job-cost-receipts','job-photos')),
 enabled boolean not null default false
);
insert into app_private.attachment_scan_settings(bucket_id) values ('employee-files'),('employee-program-files'),('equipment-files'),('material-files'),('job-cost-receipts'),('job-photos');
alter table app_private.attachment_scan_settings enable row level security;
revoke all on app_private.attachment_scan_settings from public,anon,authenticated,service_role;
create table app_private.attachment_scans (
 bucket_id text not null references app_private.attachment_scan_settings(bucket_id), storage_path text not null,
 object_id uuid not null, object_version text, generation uuid not null default gen_random_uuid(),
 upload_actor uuid, deleted boolean not null default false,
 status text not null default 'unscanned' check(status in ('unscanned','checking','clean','quarantined','unavailable')),
 sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$'), checked_at timestamptz,
 primary key(bucket_id,storage_path)
);
create table app_private.attachment_scan_attempts (
 token uuid primary key default gen_random_uuid(), bucket_id text not null, storage_path text not null,
 object_id uuid not null, generation uuid not null, actor_id uuid not null references public.profiles(id),
 expected_sha256 text check(expected_sha256 is null or expected_sha256 ~ '^[a-f0-9]{64}$'),
 started_at timestamptz not null default clock_timestamp(), finished_at timestamptz,
 verdict text check(verdict in ('clean','quarantined','unavailable')), sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$')
);
create index attachment_scan_attempts_target_idx on app_private.attachment_scan_attempts(bucket_id,storage_path,started_at desc);
alter table app_private.attachment_scans enable row level security;
alter table app_private.attachment_scan_attempts enable row level security;
revoke all on app_private.attachment_scans,app_private.attachment_scan_attempts from public,anon,authenticated,service_role;

create function app_private.capture_attachment_object() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op in ('DELETE','UPDATE') and (tg_op='DELETE' or old.bucket_id is distinct from new.bucket_id or old.name is distinct from new.name) then
   update app_private.attachment_scans set deleted=true,status='unavailable',generation=gen_random_uuid(),sha256=null,checked_at=null where bucket_id=old.bucket_id and storage_path=old.name;
 end if;
 if tg_op='DELETE' then return old;end if;
 if not exists(select 1 from app_private.attachment_scan_settings where bucket_id=new.bucket_id) then return new;end if;
 -- Downloads may update access timestamps; those are not content replacements.
 if tg_op='UPDATE' and new.bucket_id=old.bucket_id and new.name=old.name and new.id=old.id
   and new.version is not distinct from old.version and new.metadata is not distinct from old.metadata
   and new.archived_at is not distinct from old.archived_at and new.is_delete_marker is not distinct from old.is_delete_marker then return new;end if;
 insert into app_private.attachment_scans(bucket_id,storage_path,object_id,object_version,upload_actor,deleted)
 values(new.bucket_id,new.name,new.id,new.version,coalesce(auth.uid(),case when new.owner_id ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then new.owner_id::uuid end),new.archived_at is not null or coalesce(new.is_delete_marker,false))
 on conflict(bucket_id,storage_path) do update set object_id=excluded.object_id,object_version=excluded.object_version,
   upload_actor=excluded.upload_actor,deleted=excluded.deleted,generation=gen_random_uuid(),status='unscanned',sha256=null,checked_at=null;
 return new;
end $$;
create trigger capture_attachment_object after insert or update or delete on storage.objects
 for each row execute function app_private.capture_attachment_object();

-- This view carries precisely the caller's existing metadata RLS. No definer
-- union, privileged status listing, file bytes, service key or HR fields.
create view public.attachment_file_sources with(security_invoker=true) as
 select 'employee-files'::text bucket_id,storage_path,'employee_document'::text source_type,id source_id,title label from public.employee_documents where archived_at is null
 union all select 'employee-files',profile_photo_storage_path,'employee_profile',id,'Profile photo' from public.employee_records where archived_at is null
 union all select 'employee-program-files',storage_path,'employee_program',id,title from public.employee_program_files
 union all select 'equipment-files',storage_path,'equipment_document',id,title from public.equipment_documents
 union all select 'equipment-files',photo_storage_path,'equipment_problem',id,title from public.equipment_problem_reports
 union all select 'material-files',attachment_storage_path,'inventory_movement',id,'Movement attachment' from public.inventory_transactions
 union all select 'material-files',receipt_storage_path,'material_purchase',id,'Purchase receipt' from public.material_purchases
 union all select 'material-files',receipt_storage_path,'disposal',id,'Disposal receipt' from public.disposal_records
 union all select 'material-files',proof_storage_path,'delivery',id,'Delivery proof' from public.customer_deliveries
 union all select 'material-files',photo_storage_path,'stockpile',id,'Stockpile photo' from public.stockpile_measurements
 union all select case when exists(select 1 from public.disposal_records d where d.job_cost_entry_id=c.id and d.receipt_storage_path=c.receipt_storage_path) then 'material-files' else 'job-cost-receipts' end,c.receipt_storage_path,'job_cost',c.id,'Job cost receipt' from public.job_cost_entries c where c.archived_at is null
 union all select 'job-photos',storage_path,'job_photo',id,coalesce(caption,'Job photo') from public.job_photos;
revoke all on public.attachment_file_sources from public,anon,authenticated,service_role;
grant select on public.attachment_file_sources to authenticated,service_role;
create policy "Visible attachment metadata exposes scan state" on app_private.attachment_scans for select to authenticated using(
 public.has_effective_platform_access() and exists(select 1 from public.attachment_file_sources s where s.bucket_id=attachment_scans.bucket_id and s.storage_path=attachment_scans.storage_path)
);
grant select(bucket_id,storage_path,status,upload_actor) on app_private.attachment_scans to authenticated;

create function app_private.attachment_scan_enabled(p_bucket text) returns boolean
language sql stable security definer set search_path='' as $$ select coalesce((select enabled from app_private.attachment_scan_settings where bucket_id=p_bucket),false); $$;
create function public.attachment_scan_enabled(p_bucket text) returns boolean
language sql stable security invoker set search_path='' as $$ select app_private.attachment_scan_enabled(p_bucket); $$;
create function app_private.attachment_download_allowed(p_bucket text,p_path text,p_object uuid,p_version text) returns boolean
language sql stable security definer set search_path='' as $$
 select not app_private.attachment_scan_enabled(p_bucket) or exists(select 1 from app_private.attachment_scans s where s.bucket_id=p_bucket and s.storage_path=p_path and s.object_id=p_object and s.object_version is not distinct from p_version and not s.deleted and s.status='clean');
$$;
create policy "Attachments require clean matching objects when enabled" on storage.objects as restrictive for select to authenticated
 using(app_private.attachment_download_allowed(bucket_id,name,id,version));
create policy "Attachment ownership matches the authenticated uploader" on storage.objects as restrictive for insert to authenticated
 with check(not app_private.attachment_scan_enabled(bucket_id) or owner_id=(select auth.uid())::text);
-- No ordinary caller can replace or move checked bytes while a bucket is active.
create policy "Checked attachments are immutable when enabled" on storage.objects as restrictive for update to authenticated
 using(not app_private.attachment_scan_enabled(bucket_id)) with check(not app_private.attachment_scan_enabled(bucket_id));

create function app_private.assert_attachment_scan_actor(p_actor uuid,p_upload_actor uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if current_setting('role',true)<>'service_role' or p_actor is null or not app_private.effective_platform_access(p_actor)
   or (p_actor is distinct from p_upload_actor and not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=p_actor and r.name in ('owner','admin'))) then
   raise exception 'Only the active uploader or an administrator can check this attachment' using errcode='42501';end if;
end $$;
create function app_private.claim_attachment_scan(p_bucket text,p_path text,p_actor uuid,p_expected_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o storage.objects%rowtype;s app_private.attachment_scans%rowtype;a app_private.attachment_scan_attempts%rowtype;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('platform-role-management'));
 if not app_private.attachment_scan_enabled(p_bucket) then raise exception 'Attachment checks are not enabled' using errcode='55000';end if;
 select * into o from storage.objects where bucket_id=p_bucket and name=p_path and archived_at is null and not coalesce(is_delete_marker,false) for share;
 if not found then raise exception 'Attachment unavailable' using errcode='P0002';end if;
 select * into s from app_private.attachment_scans where bucket_id=p_bucket and storage_path=p_path for update;
 if not found then
   -- Legacy files are held; an administrator may explicitly check one. Never backfill clean.
   perform app_private.assert_attachment_scan_actor(p_actor,null);
   insert into app_private.attachment_scans(bucket_id,storage_path,object_id,object_version) values(p_bucket,p_path,o.id,o.version) returning * into s;
 end if;
 perform app_private.assert_attachment_scan_actor(p_actor,s.upload_actor);
 if s.deleted or s.object_id<>o.id or s.object_version is distinct from o.version then raise exception 'Attachment changed' using errcode='40001';end if;
 if s.status in ('clean','quarantined') then return jsonb_build_object('status',s.status);end if;
 if exists(select 1 from app_private.attachment_scan_attempts where bucket_id=p_bucket and storage_path=p_path and generation=s.generation and finished_at is null and started_at>clock_timestamp()-interval '90 seconds') then raise exception 'A file check is already running' using errcode='55P03';end if;
 insert into app_private.attachment_scan_attempts(bucket_id,storage_path,object_id,generation,actor_id,expected_sha256)
 values(p_bucket,p_path,o.id,s.generation,p_actor,p_expected_sha256) returning * into a;
 update app_private.attachment_scans set status='checking' where bucket_id=p_bucket and storage_path=p_path;
 return jsonb_build_object('token',a.token,'path',p_path,'status','checking','size',o.metadata->>'size');
end $$;
create function app_private.finish_attachment_scan(p_bucket text,p_path text,p_actor uuid,p_token uuid,p_verdict text,p_sha256 text) returns boolean
language plpgsql security definer set search_path='' as $$
declare o storage.objects%rowtype;s app_private.attachment_scans%rowtype;a app_private.attachment_scan_attempts%rowtype;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('platform-role-management'));
 select * into o from storage.objects where bucket_id=p_bucket and name=p_path and archived_at is null and not coalesce(is_delete_marker,false) for share;
 if not found then return false;end if;
 select * into s from app_private.attachment_scans where bucket_id=p_bucket and storage_path=p_path for update;
 if not found then return false;end if;
 perform app_private.assert_attachment_scan_actor(p_actor,s.upload_actor);
 select * into a from app_private.attachment_scan_attempts where token=p_token and bucket_id=p_bucket and storage_path=p_path and actor_id=p_actor for update;
 if not found or a.finished_at is not null or a.generation<>s.generation or a.object_id<>o.id or s.object_id<>o.id or s.object_version is distinct from o.version or s.deleted
   or a.started_at<clock_timestamp()-interval '90 seconds' or not app_private.attachment_scan_enabled(p_bucket)
   or exists(select 1 from app_private.attachment_scan_attempts n where n.bucket_id=p_bucket and n.storage_path=p_path and n.generation=s.generation and n.started_at>a.started_at) then return false;end if;
 if p_verdict is null or p_verdict not in ('clean','quarantined','unavailable') then raise exception 'Invalid verdict' using errcode='22023';end if;
 if p_verdict in ('clean','quarantined') and (p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$') then raise exception 'Missing digest' using errcode='22023';end if;
 if p_verdict='clean' and a.expected_sha256 is not null and p_sha256 is distinct from a.expected_sha256 then p_verdict:='unavailable';end if;
 update app_private.attachment_scan_attempts set finished_at=clock_timestamp(),verdict=p_verdict,sha256=p_sha256 where token=a.token;
 update app_private.attachment_scans set status=p_verdict,sha256=p_sha256,checked_at=clock_timestamp() where bucket_id=p_bucket and storage_path=p_path;
 insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,idempotency_key,metadata_json)
 values(p_actor,'system','attachment',o.id,'attachment_scan_finished','attachment-scan/'||a.token,jsonb_build_object('bucket',p_bucket,'status',p_verdict));
 return true;
end $$;
create function public.claim_attachment_scan(p_bucket text,p_path text,p_actor uuid,p_expected_sha256 text default null) returns jsonb
language sql security invoker set search_path='' as $$ select app_private.claim_attachment_scan(p_bucket,p_path,p_actor,p_expected_sha256); $$;
create function public.finish_attachment_scan(p_bucket text,p_path text,p_actor uuid,p_token uuid,p_verdict text,p_sha256 text) returns boolean
language sql security invoker set search_path='' as $$ select app_private.finish_attachment_scan(p_bucket,p_path,p_actor,p_token,p_verdict,p_sha256); $$;
create function public.get_attachment_scan_states(p_bucket text,p_paths text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if p_paths is null or cardinality(p_paths)>100 then raise exception 'Choose up to 100 attachment paths' using errcode='22023';end if;
 return(select coalesce(jsonb_agg(jsonb_build_object('path',s.storage_path,'status',coalesce(a.status,'unscanned'),
  'enabled',app_private.attachment_scan_enabled(p_bucket),'canRetry',a.upload_actor=auth.uid() or app_private.has_platform_admin_role())),'[]')
 from(select distinct storage_path from public.attachment_file_sources where bucket_id=p_bucket and storage_path=any(p_paths) and public.has_effective_platform_access())s
 left join app_private.attachment_scans a on a.bucket_id=p_bucket and a.storage_path=s.storage_path);
end $$;
revoke all on function app_private.capture_attachment_object(),app_private.attachment_scan_enabled(text),public.attachment_scan_enabled(text),app_private.attachment_download_allowed(text,text,uuid,text),app_private.assert_attachment_scan_actor(uuid,uuid),app_private.claim_attachment_scan(text,text,uuid,text),app_private.finish_attachment_scan(text,text,uuid,uuid,text,text),public.claim_attachment_scan(text,text,uuid,text),public.finish_attachment_scan(text,text,uuid,uuid,text,text),public.get_attachment_scan_states(text,text[]) from public,anon,authenticated,service_role;
grant execute on function app_private.attachment_scan_enabled(text),public.attachment_scan_enabled(text),app_private.attachment_download_allowed(text,text,uuid,text),public.get_attachment_scan_states(text,text[]) to authenticated,service_role;
grant execute on function app_private.claim_attachment_scan(text,text,uuid,text),app_private.finish_attachment_scan(text,text,uuid,uuid,text,text),public.claim_attachment_scan(text,text,uuid,text),public.finish_attachment_scan(text,text,uuid,uuid,text,text) to service_role;

create view public.attachment_file_checks with(security_invoker=true) as
 select s.*,coalesce(a.status,'unscanned') status,app_private.attachment_scan_enabled(s.bucket_id) enabled,
   coalesce(a.upload_actor=auth.uid() or app_private.has_platform_admin_role(),false) can_retry,
   exists(select 1 from storage.objects o where o.bucket_id=s.bucket_id and o.name=s.storage_path) can_open
 from public.attachment_file_sources s left join app_private.attachment_scans a on a.bucket_id=s.bucket_id and a.storage_path=s.storage_path
 where s.storage_path is not null and public.has_effective_platform_access();
revoke all on public.attachment_file_checks from public,anon,authenticated,service_role;
grant select on public.attachment_file_checks to authenticated,service_role;
commit;
