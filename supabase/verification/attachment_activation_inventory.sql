-- Read-only, aggregate-only inventory for the existing seven attachment areas.
-- Works before the scan migrations; exposes no paths, names, IDs, or file bytes.
-- Use a read-only session and a short statement timeout. Counts are a snapshot,
-- not permission to activate, purge, scan, backfill, or repair migration history.
with areas(bucket_id) as (
  values ('platform-documents'), ('employee-files'), ('employee-program-files'),
    ('equipment-files'), ('material-files'), ('job-cost-receipts'), ('job-photos')
), refs(bucket_id, storage_path, unarchived) as (
  select 'platform-documents', storage_path, archived_at is null from public.documents
  union all select 'employee-files', storage_path, archived_at is null from public.employee_documents
  union all select 'employee-files', profile_photo_storage_path, archived_at is null from public.employee_records
  union all select 'employee-program-files', storage_path, true from public.employee_program_files
  union all select 'equipment-files', storage_path, true from public.equipment_documents
  union all select 'equipment-files', photo_storage_path, true from public.equipment_problem_reports
  union all select 'material-files', attachment_storage_path, true from public.inventory_transactions
  union all select 'material-files', receipt_storage_path, true from public.material_purchases
  union all select 'material-files', receipt_storage_path, true from public.disposal_records
  union all select 'material-files', proof_storage_path, true from public.customer_deliveries
  union all select 'material-files', photo_storage_path, true from public.stockpile_measurements
  union all select case when exists (select 1 from public.disposal_records d
      where d.job_cost_entry_id=c.id and d.receipt_storage_path=c.receipt_storage_path)
    then 'material-files' else 'job-cost-receipts' end,
    c.receipt_storage_path, c.archived_at is null from public.job_cost_entries c
  union all select 'job-photos', storage_path, true from public.job_photos
), reference_paths as (
  select bucket_id, storage_path, bool_or(unarchived) as has_unarchived_reference
  from refs where storage_path is not null and storage_path<>''
  group by bucket_id, storage_path
), objects as (
  select o.bucket_id, o.name, o.archived_at, o.is_delete_marker,
    case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::numeric end as size_bytes
  from storage.objects o join areas a on a.bucket_id=o.bucket_id
), object_totals as (
  select o.bucket_id, count(*) as objects, coalesce(sum(size_bytes),0) as known_bytes,
    count(*) filter (where size_bytes is null) as unknown_sizes,
    count(*) filter (where size_bytes>26214400) as over_scanner_limit,
    count(*) filter (where r.storage_path is null) as objects_without_known_reference,
    count(*) filter (where o.archived_at is not null or coalesce(o.is_delete_marker,false)) as retired_objects
  from objects o left join reference_paths r on r.bucket_id=o.bucket_id and r.storage_path=o.name
  group by o.bucket_id
), reference_totals as (
  select r.bucket_id, count(*) as referenced_paths,
    count(*) filter (where r.has_unarchived_reference) as unarchived_referenced_paths,
    count(*) filter (where o.name is null) as references_without_object_metadata
  from reference_paths r left join objects o on o.bucket_id=r.bucket_id and o.name=r.storage_path
  group by r.bucket_id
)
select a.bucket_id, b.public as bucket_public,
  coalesce(o.objects,0) as objects, coalesce(o.known_bytes,0) as known_bytes,
  coalesce(o.unknown_sizes,0) as unknown_sizes,
  coalesce(o.over_scanner_limit,0) as over_scanner_limit,
  coalesce(o.retired_objects,0) as retired_objects,
  coalesce(o.objects_without_known_reference,0) as objects_without_known_reference,
  coalesce(r.referenced_paths,0) as referenced_paths,
  coalesce(r.unarchived_referenced_paths,0) as unarchived_referenced_paths,
  coalesce(r.references_without_object_metadata,0) as references_without_object_metadata
from areas a left join storage.buckets b on b.id=a.bucket_id
left join object_totals o on o.bucket_id=a.bucket_id
left join reference_totals r on r.bucket_id=a.bucket_id
order by a.bucket_id;
