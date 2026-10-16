begin;
set local lock_timeout='1s';
set local statement_timeout='5s';
create index quotes_document_lookup_updated_idx on public.quotes(updated_at desc);
commit;
