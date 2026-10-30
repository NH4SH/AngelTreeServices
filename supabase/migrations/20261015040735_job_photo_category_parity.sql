-- Match the six categories accepted by web/native photo upload validation.
-- Preserve the authenticated-only, private-bucket and assigned-job/staff boundary.
-- This only changes INSERT; retrieval, deletion, MIME/size limits and metadata
-- policies remain unchanged. No existing objects are rewritten or deleted.
alter policy "Authorized users can upload private job photos"
  on storage.objects
  with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[2] in (
      'before', 'during', 'after', 'issue', 'equipment_access', 'completion'
    )
    -- Generated paths are exactly job UUID / category / filename.
    and array_length(storage.foldername(name), 1) = 2
    and storage.filename(name) not in ('', '.', '..')
    and private.can_access_job_photo_object(name)
  );
