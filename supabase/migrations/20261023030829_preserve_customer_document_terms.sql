-- Bind existing and new documents to the current rendering baseline without
-- changing terms, financial facts, timestamps, approval versions or saved mail.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
alter table public.quotes
  add column document_terms_version text not null default 'legacy-2026-10-22',
  add constraint quotes_document_terms_version_known check(document_terms_version='legacy-2026-10-22');
alter table public.invoices
  add column document_terms_version text not null default 'legacy-2026-10-22',
  add constraint invoices_document_terms_version_known check(document_terms_version='legacy-2026-10-22');

-- A future version needs its own reviewed creation/revision workflow. Ordinary
-- updates must never relabel a document's existing wording as a newer version.
create function app_private.preserve_document_terms_version() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.document_terms_version is distinct from old.document_terms_version then
    raise exception 'Document terms must be retained. Create a new document for different terms.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function app_private.preserve_document_terms_version() from public,anon,authenticated,service_role;
create trigger preserve_quote_document_terms before update of document_terms_version on public.quotes
  for each row execute function app_private.preserve_document_terms_version();
create trigger preserve_invoice_document_terms before update of document_terms_version on public.invoices
  for each row execute function app_private.preserve_document_terms_version();
comment on column public.quotes.document_terms_version is 'Immutable rendering baseline; legacy-2026-10-22 records current CRM wording, not reconstructed historic acceptance text.';
comment on column public.invoices.document_terms_version is 'Immutable rendering baseline; legacy-2026-10-22 records current CRM wording, not reconstructed historic acceptance text.';
notify pgrst,'reload schema';
commit;
