-- Forward-safe contracting-party integrity. Existing ambiguous records are
-- preserved and listed for staff review; CHECK NOT VALID protects all new or
-- changed rows without making an unreviewed ownership decision.

alter table public.quotes
  add column if not exists onsite_contact_id uuid references public.organization_contacts(id) on delete set null,
  add column if not exists billing_contact_id uuid references public.organization_contacts(id) on delete set null;
create index if not exists quotes_onsite_contact_id_idx on public.quotes(onsite_contact_id);
create index if not exists quotes_billing_contact_id_idx on public.quotes(billing_contact_id);

alter table public.customer_deliveries
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.customer_deliveries alter column customer_id drop not null;
alter table public.customer_deliveries add constraint customer_deliveries_exactly_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;
create index if not exists customer_deliveries_organization_id_idx on public.customer_deliveries(organization_id);

create table public.contracting_party_review_items (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  record_id uuid not null,
  issue_type text not null check (issue_type in (
    'both_contracting_parties', 'missing_contracting_party',
    'legacy_organization_conversion', 'inactive_selected_contact',
    'invalid_service_location_owner', 'record_party_mismatch',
    'payment_party_mismatch', 'missing_organization_contact_role'
  )),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'accepted')),
  resolved_by_user_id uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracting_party_review_item_unique unique (record_type, record_id, issue_type)
);

create index contracting_party_review_items_status_idx
  on public.contracting_party_review_items(status, record_type, created_at desc);

create trigger contracting_party_review_items_set_updated_at
  before update on public.contracting_party_review_items
  for each row execute function public.set_updated_at();

alter table public.contracting_party_review_items enable row level security;
revoke all on table public.contracting_party_review_items from public, anon;
grant select, insert, update on table public.contracting_party_review_items to authenticated, service_role;

create policy "Staff can review contracting party integrity"
  on public.contracting_party_review_items
  for all to authenticated
  using (app_private.has_staff_role())
  with check (app_private.has_staff_role());

-- Recreate ownership constraints as forward-enforced constraints. They can be
-- validated after every open ownership review item has been resolved.
alter table public.quotes drop constraint if exists quotes_one_contracting_party;
alter table public.quotes drop constraint if exists quotes_exactly_one_contracting_party;
alter table public.quotes add constraint quotes_exactly_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;

alter table public.jobs drop constraint if exists jobs_one_contracting_party;
alter table public.jobs drop constraint if exists jobs_exactly_one_contracting_party;
alter table public.jobs add constraint jobs_exactly_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;

alter table public.invoices drop constraint if exists invoices_one_contracting_party;
alter table public.invoices drop constraint if exists invoices_exactly_one_contracting_party;
alter table public.invoices add constraint invoices_exactly_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;

alter table public.change_orders drop constraint if exists change_order_has_owner;
alter table public.change_orders drop constraint if exists change_orders_exactly_one_contracting_party;
alter table public.change_orders add constraint change_orders_exactly_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;

alter table public.service_recommendations drop constraint if exists service_recommendation_has_owner;
alter table public.service_recommendations drop constraint if exists service_recommendations_exactly_one_contracting_party;
alter table public.service_recommendations add constraint service_recommendations_exactly_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;

alter table public.service_locations drop constraint if exists service_locations_has_owner;
alter table public.service_locations drop constraint if exists service_locations_exactly_one_owner;
alter table public.service_locations add constraint service_locations_exactly_one_owner
  check ((customer_id is null) <> (organization_id is null)) not valid;

alter table public.quote_portal_tokens drop constraint if exists quote_portal_tokens_one_contracting_party;
alter table public.quote_portal_tokens add constraint quote_portal_tokens_exactly_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;
alter table public.invoice_portal_tokens drop constraint if exists invoice_portal_tokens_one_contracting_party;
alter table public.invoice_portal_tokens add constraint invoice_portal_tokens_exactly_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;
alter table public.payments drop constraint if exists payments_one_contracting_party;
alter table public.payments add constraint payments_exactly_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;
alter table public.invoice_checkout_sessions drop constraint if exists invoice_checkout_sessions_one_contracting_party;
alter table public.invoice_checkout_sessions add constraint invoice_checkout_sessions_exactly_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;
alter table public.customer_communications drop constraint if exists customer_communications_one_contracting_party;
alter table public.customer_communications add constraint customer_communications_exactly_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;

-- Repeat-safe manual-review classification. No ownership columns are changed.
insert into public.contracting_party_review_items (record_type, record_id, issue_type, details)
select 'quote', id,
  case when customer_id is not null and organization_id is not null then 'both_contracting_parties' else 'missing_contracting_party' end,
  jsonb_build_object('customer_id', customer_id, 'organization_id', organization_id)
from public.quotes
where (customer_id is null) = (organization_id is null)
on conflict (record_type, record_id, issue_type) do update set details = excluded.details;

insert into public.contracting_party_review_items (record_type, record_id, issue_type, details)
select 'job', id,
  case when customer_id is not null and organization_id is not null then 'both_contracting_parties' else 'missing_contracting_party' end,
  jsonb_build_object('customer_id', customer_id, 'organization_id', organization_id)
from public.jobs where (customer_id is null) = (organization_id is null)
on conflict (record_type, record_id, issue_type) do update set details = excluded.details;

insert into public.contracting_party_review_items (record_type, record_id, issue_type, details)
select 'invoice', id,
  case when customer_id is not null and organization_id is not null then 'both_contracting_parties' else 'missing_contracting_party' end,
  jsonb_build_object('customer_id', customer_id, 'organization_id', organization_id)
from public.invoices where (customer_id is null) = (organization_id is null)
on conflict (record_type, record_id, issue_type) do update set details = excluded.details;

insert into public.contracting_party_review_items (record_type, record_id, issue_type, details)
select 'change_order', id,
  case when customer_id is not null and organization_id is not null then 'both_contracting_parties' else 'missing_contracting_party' end,
  jsonb_build_object('customer_id', customer_id, 'organization_id', organization_id)
from public.change_orders where (customer_id is null) = (organization_id is null)
on conflict (record_type, record_id, issue_type) do update set details = excluded.details;

insert into public.contracting_party_review_items (record_type, record_id, issue_type, details)
select 'service_recommendation', id,
  case when customer_id is not null and organization_id is not null then 'both_contracting_parties' else 'missing_contracting_party' end,
  jsonb_build_object('customer_id', customer_id, 'organization_id', organization_id)
from public.service_recommendations where (customer_id is null) = (organization_id is null)
on conflict (record_type, record_id, issue_type) do update set details = excluded.details;

insert into public.contracting_party_review_items (record_type, record_id, issue_type, details)
select 'service_location', id, 'invalid_service_location_owner',
  jsonb_build_object('customer_id', customer_id, 'organization_id', organization_id)
from public.service_locations where (customer_id is null) = (organization_id is null)
on conflict (record_type, record_id, issue_type) do update set details = excluded.details;

insert into public.contracting_party_review_items (record_type, record_id, issue_type, details)
select 'customer_delivery', id,
  case when customer_id is not null and organization_id is not null then 'both_contracting_parties' else 'missing_contracting_party' end,
  jsonb_build_object('customer_id', customer_id, 'organization_id', organization_id)
from public.customer_deliveries where (customer_id is null) = (organization_id is null)
on conflict (record_type, record_id, issue_type) do update set details = excluded.details;

-- Earlier deployed versions retained the former individual reference here.
-- Preserve it as evidence and require a human to confirm the organization owner.
insert into public.contracting_party_review_items (record_type, record_id, issue_type, details)
select record_type, record_id, 'legacy_organization_conversion', details
from (
  select 'quote'::text record_type, id record_id, jsonb_build_object('legacy_customer_id', legacy_customer_id, 'organization_id', organization_id) details from public.quotes where legacy_customer_id is not null
  union all
  select 'job', id, jsonb_build_object('legacy_customer_id', legacy_customer_id, 'organization_id', organization_id) from public.jobs where legacy_customer_id is not null
  union all
  select 'invoice', id, jsonb_build_object('legacy_customer_id', legacy_customer_id, 'organization_id', organization_id) from public.invoices where legacy_customer_id is not null
) legacy
on conflict (record_type, record_id, issue_type) do update set details = excluded.details;

-- Linked documents must agree on their contracting party.
insert into public.contracting_party_review_items (record_type, record_id, issue_type, details)
select 'invoice', invoice.id, 'record_party_mismatch',
  jsonb_build_object('invoice_customer_id', invoice.customer_id, 'invoice_organization_id', invoice.organization_id,
    'job_customer_id', job.customer_id, 'job_organization_id', job.organization_id)
from public.invoices invoice
join public.jobs job on job.id = invoice.job_id
where invoice.customer_id is distinct from job.customer_id
   or invoice.organization_id is distinct from job.organization_id
on conflict (record_type, record_id, issue_type) do update set details = excluded.details;

insert into public.contracting_party_review_items (record_type, record_id, issue_type, details)
select 'payment', payment.id, 'payment_party_mismatch',
  jsonb_build_object('payment_customer_id', payment.customer_id, 'payment_organization_id', payment.organization_id,
    'invoice_customer_id', invoice.customer_id, 'invoice_organization_id', invoice.organization_id)
from public.payments payment
join public.invoices invoice on invoice.id = payment.invoice_id
where payment.customer_id is distinct from invoice.customer_id
   or payment.organization_id is distinct from invoice.organization_id
on conflict (record_type, record_id, issue_type) do update set details = excluded.details;

-- Selected organization contacts must remain active and belong to the owner.
insert into public.contracting_party_review_items (record_type, record_id, issue_type, details)
select selected.record_type, selected.record_id, 'inactive_selected_contact',
  jsonb_build_object('contacts', jsonb_agg(jsonb_build_object('contact_id', contact.id, 'contact_name', contact.full_name)))
from (
  select 'quote'::text record_type, q.id record_id, q.organization_id, unnest(array[q.recipient_contact_id, q.approval_contact_id, q.onsite_contact_id, q.billing_contact_id]) contact_id from public.quotes q where q.organization_id is not null
  union all
  select 'job', j.id, j.organization_id, unnest(array[j.onsite_contact_id, j.property_manager_contact_id]) from public.jobs j where j.organization_id is not null
  union all
  select 'invoice', i.id, i.organization_id, unnest(array[i.billing_contact_id, i.accounts_payable_contact_id]) from public.invoices i where i.organization_id is not null
  union all
  select 'change_order', co.id, co.organization_id, unnest(array[co.requested_by_contact_id, co.approval_contact_id]) from public.change_orders co where co.organization_id is not null
) selected
join public.organization_contacts contact on contact.id = selected.contact_id
where not contact.is_active or contact.organization_id <> selected.organization_id
group by selected.record_type, selected.record_id
on conflict (record_type, record_id, issue_type) do update set details = excluded.details;

insert into public.contracting_party_review_items (record_type, record_id, issue_type, details)
select 'recurring_service_plan', plan.id, 'missing_organization_contact_role',
  jsonb_build_object('approval_contact_id', plan.approval_contact_id, 'billing_contact_id', plan.billing_contact_id,
    'default_onsite_contact_id', plan.default_onsite_contact_id)
from public.recurring_service_plans plan
where plan.organization_id is not null
  and (plan.approval_contact_id is null or plan.billing_contact_id is null or plan.default_onsite_contact_id is null)
on conflict (record_type, record_id, issue_type) do update set details = excluded.details;
