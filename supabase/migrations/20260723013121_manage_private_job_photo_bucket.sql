-- Keep the private job-photo bucket reproducible without replacing or deleting
-- existing objects. Storage policies remain defined by migration 0004.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-photos',
  'job-photos',
  false,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
