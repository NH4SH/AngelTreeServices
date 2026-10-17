begin;
set local lock_timeout='1s';
set local statement_timeout='5s';

-- Untrusted transport buffers, never business attachments or downloadable files.
insert into storage.buckets(id,name,public,file_size_limit)
values('platform-upload-staging','platform-upload-staging',false,26214400);
create policy "Active workers insert own temporary uploads" on storage.objects for insert to authenticated
with check(bucket_id='platform-upload-staging' and public.has_effective_platform_access()
 and (app_private.has_staff_role() or app_private.has_schedule_crew_role())
 and owner_id=(select auth.uid())::text
 and name ~ ('^'||(select auth.uid())::text||'/[a-f0-9-]{36}$'));
-- Restrictive guards keep this area closed even if a future permissive policy is broad.
create policy "Temporary uploads are never readable" on storage.objects as restrictive for select to authenticated,anon
using(bucket_id<>'platform-upload-staging');
create policy "Temporary uploads are immutable" on storage.objects as restrictive for update to authenticated,anon
using(bucket_id<>'platform-upload-staging') with check(bucket_id<>'platform-upload-staging');
create policy "Temporary uploads require server cleanup" on storage.objects as restrictive for delete to authenticated,anon
using(bucket_id<>'platform-upload-staging');

-- Service-only, with a live actor check before accessing an owned buffer. No
-- client-supplied bucket/path and no grants to bypass final destination RLS.
create function public.staged_upload_info(p_actor uuid,p_upload uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if current_setting('role',true)<>'service_role' or not app_private.effective_platform_access(p_actor)
 or not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
 where ur.user_id=p_actor and r.name in ('owner','admin','payroll_admin','estimator','crew')) then
 raise exception 'Upload unavailable' using errcode='42501';end if;
 select jsonb_build_object('size',o.metadata->>'size','version',o.version) into result
 from storage.objects o where o.bucket_id='platform-upload-staging'
 and o.name=p_actor::text||'/'||p_upload::text and o.owner_id=p_actor::text
 and o.created_at>clock_timestamp()-interval '1 hour' and o.archived_at is null
 and not coalesce(o.is_delete_marker,false);
 return result;
end $$;
revoke all on function public.staged_upload_info(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.staged_upload_info(uuid,uuid) to service_role;

-- Caller metadata AND Storage RLS must both allow the exact current object.
-- The library keeps its separate classification/gate; no scan flags change.
create function public.private_file_descriptor(p_source_type text,p_source_id uuid)
returns table(bucket_id text,storage_path text,label text,object_id uuid,object_version text,size_bytes bigint,mime_type text,etag text)
language sql stable security invoker set search_path='' as $$
 with sources as (
 select s.bucket_id,s.storage_path,s.label from public.attachment_file_sources s
 where s.source_type=p_source_type and s.source_id=p_source_id
 union all select 'platform-documents',d.storage_path,d.title from public.documents d
 where p_source_type='platform_document' and d.id=p_source_id and d.archived_at is null
 )
 select s.bucket_id,s.storage_path,s.label,o.id,o.version,(o.metadata->>'size')::bigint,
 coalesce(o.metadata->>'mimetype','application/octet-stream'),o.metadata->>'eTag'
 from sources s join storage.objects o on o.bucket_id=s.bucket_id and o.name=s.storage_path
 where public.has_effective_platform_access() and o.archived_at is null
 and not coalesce(o.is_delete_marker,false);
$$;
revoke all on function public.private_file_descriptor(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.private_file_descriptor(text,uuid) to authenticated;
commit;
