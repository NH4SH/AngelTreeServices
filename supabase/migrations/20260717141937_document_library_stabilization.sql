-- Minimum private document library for the existing admin Documents tab.
-- Files remain private in Storage; this table contains metadata and links only.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (nullif(btrim(title), '') is not null),
  document_type text not null default 'other' check (
    document_type in ('contract', 'proposal', 'invoice', 'work_order', 'insurance', 'permit', 'safety', 'employee', 'equipment', 'photo', 'receipt', 'other')
  ),
  storage_path text not null unique check (nullif(btrim(storage_path), '') is not null),
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  customer_id uuid references public.customers(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete restrict,
  quote_id uuid references public.quotes(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict,
  employee_id uuid references public.employee_records(id) on delete restrict,
  equipment_asset_id uuid references public.equipment_assets(id) on delete restrict,
  access_classification text not null default 'staff' check (
    access_classification in ('staff', 'employee_sensitive')
  ),
  expires_at date,
  uploaded_by_user_id uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  archived_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_single_link check (
    num_nonnulls(customer_id, organization_id, job_id, quote_id, invoice_id, employee_id, equipment_asset_id) <= 1
  )
);

create index documents_created_idx on public.documents(created_at desc) where archived_at is null;
create index documents_type_idx on public.documents(document_type, created_at desc) where archived_at is null;
create index documents_expiration_idx on public.documents(expires_at) where archived_at is null and expires_at is not null;
create index documents_customer_idx on public.documents(customer_id) where customer_id is not null;
create index documents_organization_idx on public.documents(organization_id) where organization_id is not null;
create index documents_job_idx on public.documents(job_id) where job_id is not null;
create index documents_quote_idx on public.documents(quote_id) where quote_id is not null;
create index documents_invoice_idx on public.documents(invoice_id) where invoice_id is not null;
create index documents_employee_idx on public.documents(employee_id) where employee_id is not null;
create index documents_equipment_idx on public.documents(equipment_asset_id) where equipment_asset_id is not null;

create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

alter table public.documents enable row level security;

create policy "Staff read documents" on public.documents for select to authenticated
  using (
    app_private.has_staff_role()
    and (access_classification = 'staff' or app_private.has_platform_admin_role())
  );

create policy "Staff upload documents" on public.documents for insert to authenticated
  with check (
    app_private.has_staff_role()
    and uploaded_by_user_id = (select auth.uid())
    and (access_classification = 'staff' or app_private.has_platform_admin_role())
  );

create policy "Staff archive documents" on public.documents for update to authenticated
  using (
    app_private.has_staff_role()
    and (access_classification = 'staff' or app_private.has_platform_admin_role())
  )
  with check (
    app_private.has_staff_role()
    and (access_classification = 'staff' or app_private.has_platform_admin_role())
  );

revoke all on table public.documents from anon, authenticated;
grant select, insert, update on table public.documents to authenticated;
grant all on table public.documents to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'platform-documents',
  'platform-documents',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The equipment migration's assigned-crew Storage policy calls this private
-- helper but omitted the authenticated EXECUTE grant. Without it, PostgreSQL
-- may reject unrelated private-bucket uploads while evaluating permissive
-- storage policies. The helper stays outside exposed schemas and anon remains
-- revoked.
grant execute on function app_private.can_upload_equipment_path(text) to authenticated, service_role;

create policy "Staff read platform documents" on storage.objects for select to authenticated
  using (
    bucket_id = 'platform-documents'
    and exists (
      select 1
      from public.documents document
      where document.storage_path = name
        and document.archived_at is null
        and app_private.has_staff_role()
        and (document.access_classification = 'staff' or app_private.has_platform_admin_role())
    )
  );

create policy "Staff upload platform documents" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'platform-documents'
    and app_private.has_staff_role()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

comment on table public.documents is
  'Private staff document metadata. Portal access is intentionally excluded; linked records do not make a document public.';
