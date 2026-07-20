begin;

select plan(14);

insert into public.organizations (id, name, organization_type)
values ('10000000-0000-0000-0000-000000000001', 'Payment Test Organization', 'commercial');

insert into public.service_locations (id, organization_id, street, city, state, postal_code)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '1 Test Way', 'Fredericksburg', 'VA', '22407');

insert into public.jobs (id, organization_id, service_location_id, status)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'in_progress');

insert into public.invoices (id, organization_id, job_id, status, total_cents, balance_due_cents)
values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'paid', 10000, 0),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'paid', 10000, 0),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'paid', 10000, 0);

insert into public.payments (
  id, invoice_id, organization_id, amount_cents, surcharge_cents,
  total_collected_cents, provider, provider_charge_id, status
) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 10000, 300, 10300, 'stripe', 'ch_lost_test', 'succeeded'),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 10000, 300, 10300, 'stripe', 'ch_won_test', 'succeeded'),
  ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 10000, 300, 10300, 'stripe', 'ch_reordered_test', 'succeeded');

select throws_ok(
  $$select * from public.reconcile_stripe_dispute('ch_missing', 'dp_missing', 'needs_response', 10300, 'charge.dispute.created', now())$$,
  'P0002',
  'Stripe dispute arrived before its payment record.',
  'dispute before payment remains retryable'
);

select is(
  (select changed from public.reconcile_stripe_dispute('ch_lost_test', 'dp_lost', 'needs_response', 10300, 'charge.dispute.created', '2026-07-20T12:00:00Z')),
  true,
  'first dispute-created event changes the payment'
);
select is(
  (select changed from public.reconcile_stripe_dispute('ch_lost_test', 'dp_lost', 'needs_response', 10300, 'charge.dispute.created', '2026-07-20T12:00:00Z')),
  false,
  'duplicate dispute-created event is idempotent'
);
select is((select count(*)::integer from public.activity_log where subject_id = '40000000-0000-0000-0000-000000000001'), 1, 'duplicate created event adds no activity');

select is(
  (select invoice_balance_changed from public.reconcile_stripe_dispute('ch_lost_test', 'dp_lost', 'lost', 10300, 'charge.dispute.closed', '2026-07-20T12:05:00Z')),
  true,
  'lost dispute requests one invoice reconciliation'
);
select is(
  (select invoice_balance_changed from public.reconcile_stripe_dispute('ch_lost_test', 'dp_lost', 'lost', 10300, 'charge.dispute.closed', '2026-07-20T12:05:00Z')),
  false,
  'duplicate lost event does not restore invoice principal twice'
);
select is((select disputed_principal_cents from public.payments where provider_charge_id = 'ch_lost_test'), 10000, 'lost dispute records principal');
select is((select disputed_surcharge_cents from public.payments where provider_charge_id = 'ch_lost_test'), 300, 'lost dispute records surcharge separately');
select is((select count(*)::integer from public.activity_log where subject_id = '40000000-0000-0000-0000-000000000001'), 2, 'duplicate closed event adds no activity');

select is(
  (select invoice_balance_changed from public.reconcile_stripe_dispute('ch_won_test', 'dp_won', 'won', 10300, 'charge.dispute.closed', '2026-07-20T12:05:00Z')),
  false,
  'won dispute preserves the paid invoice balance'
);
select is((select status from public.payments where provider_charge_id = 'ch_won_test'), 'succeeded', 'won dispute preserves successful payment history');

select is(
  (select changed from public.reconcile_stripe_dispute('ch_reordered_test', 'dp_reordered', 'won', 10300, 'charge.dispute.closed', '2026-07-20T12:05:00Z')),
  true,
  'closed-before-created event records the terminal outcome'
);
select is(
  (select changed from public.reconcile_stripe_dispute('ch_reordered_test', 'dp_reordered', 'needs_response', 10300, 'charge.dispute.created', '2026-07-20T12:00:00Z')),
  false,
  'late created event cannot regress a terminal dispute'
);
select is((select dispute_status from public.payments where provider_charge_id = 'ch_reordered_test'), 'won', 'reordered dispute keeps terminal status');

select * from finish();
rollback;
