begin;

select plan(20);

select has_column('public', 'customers', 'archived_at', 'customers support archive state');
select has_column('public', 'organizations', 'archived_at', 'organizations support archive state');
select has_column('public', 'service_locations', 'archived_at', 'service locations support archive state');
select has_column('public', 'jobs', 'archived_at', 'jobs support archive state');
select has_column('public', 'quotes', 'archived_at', 'quotes support archive state');
select has_column('public', 'invoices', 'archived_at', 'invoices support archive state');

insert into public.customers (id, display_name, customer_type, email, phone)
values ('71000000-0000-0000-0000-000000000001', 'CRM Search Fixture Smith', 'residential', 'smith-search@example.test', '(540) 555-0199');

insert into public.service_locations (id, customer_id, label, street, city, state, postal_code)
values ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'Primary service location', '6917 Bloomsbury Ln', 'Spotsylvania', 'VA', '22553');

insert into public.jobs (id, customer_id, service_location_id, status, service_type, requested_scope)
values ('73000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'accepted', 'tree_removal', 'Remove hazardous oak beside garage');

insert into public.quotes (id, customer_id, service_location_id, status, quote_number, subtotal_cents, total_cents)
values ('74000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'draft', 'Q-SEARCH-1042', 125000, 125000);

insert into public.invoices (id, customer_id, service_location_id, status, invoice_number, subtotal_cents, total_cents, balance_due_cents)
values ('75000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'draft', 'INV-SEARCH-2042', 125000, 125000, 125000);

insert into public.organizations (id, name, organization_type, billing_email, billing_phone, billing_address)
values ('76000000-0000-0000-0000-000000000001', 'CRM Search Fixture HOA', 'hoa', 'board@example.test', '540.555.0110', '99 Boardwalk Dr, Stafford, VA');

select ok(exists(select 1 from public.admin_record_search where record_type = 'customer' and search_text like '%fixture smith%'), 'customer name is searchable');
select ok(exists(select 1 from public.admin_record_search where record_type = 'customer' and search_text like '%5405550199%'), 'phone search stores a formatting-tolerant digit form');
select ok(exists(select 1 from public.admin_record_search where record_type = 'customer' and search_text like '%6917 bloomsbury%'), 'customer search includes service address');
select ok(exists(select 1 from public.admin_record_search where record_type = 'invoice' and search_text like '%inv-search-2042%'), 'invoice number is searchable');
select ok(exists(select 1 from public.admin_record_search where record_type = 'quote' and search_text like '%q-search-1042%'), 'quote number is searchable');
select ok(exists(select 1 from public.admin_record_search where record_type = 'job' and search_text like '%hazardous oak%' and search_text like '%spostylvania%') is false, 'misspelled city does not create a false match');
select ok(exists(select 1 from public.admin_record_search where record_type = 'job' and status = 'accepted' and search_text like '%spostylvania%') is false, 'search and status predicates combine');
select ok(exists(select 1 from public.admin_record_search where record_type = 'job' and status = 'accepted' and search_text like '%spotsylvania%'), 'job address search combines with status');
select ok(exists(select 1 from public.admin_record_search where record_type = 'organization' and search_text like '%fixture hoa%' and search_text not like '%fixture smith%'), 'organization search stays associated with its own record');
select ok(exists(select 1 from public.job_operations_search_index where id = '73000000-0000-0000-0000-000000000001' and expanded_search_text like '%5405550199%'), 'jobs operations index uses expanded CRM search text');

update public.customers set archived_at = now() where id = '71000000-0000-0000-0000-000000000001';
select ok(exists(select 1 from public.admin_record_search where record_id = '71000000-0000-0000-0000-000000000001' and archived_at is not null), 'archive state is visible to explicit archived queries');
select is((select count(*)::integer from public.admin_record_search where record_id = '71000000-0000-0000-0000-000000000001' and archived_at is null), 0, 'archived customer is excluded by the active-record predicate');

select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'Owners can delete customers' and cmd = 'DELETE'), 'customer delete policy is owner-specific');
select ok(not exists(select 1 from pg_policies where schemaname = 'public' and tablename in ('customers', 'organizations', 'service_locations', 'jobs', 'quotes', 'invoices') and policyname like 'Staff can manage %' and cmd = 'ALL'), 'broad staff delete policies were removed');

select * from finish();
rollback;
