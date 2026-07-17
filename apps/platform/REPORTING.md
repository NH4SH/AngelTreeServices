# Business Reporting And Profitability

The internal reporting workspace lives at `/admin/reports`. It uses the existing platform shell and authenticated Supabase session. No public website route or customer portal exposes these reports.

## Deployment

Apply migrations in repository order before deploying the application commit. The reporting migration is:

`supabase/migrations/20260717005036_business_reporting_profitability.sql`

From the repository root:

```bash
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

For a fresh local database with Docker running:

```bash
npx supabase start
npx supabase db reset
npx supabase db lint --level warning
```

Then verify the platform:

```bash
cd apps/platform
npm run typecheck
npm run build
```

No new environment variables or secrets are required.

## Schema

The migration adds:

- `service_categories`: explicit report categories seeded with Angel Tree service lines.
- `quote_line_items.service_category_id` and `invoice_line_items.service_category_id`: nullable; historical records are not guessed.
- `quotes.estimator_user_id`: set for newly created quotes; historical nulls remain a Data Quality item.
- `customers.lead_campaign` and `jobs.lead_campaign`: optional campaign detail without changing the original source relationship.
- `reporting_settings`: business timezone, stale-work thresholds, optional burden, and optional blended labor cost.
- `employee_labor_cost_rates`: restricted historical rates with effective start/end dates.
- `job_cost_entries`: private, auditable direct costs with pending/approved/rejected review.
- `job_equipment_usage`: job-specific equipment usage with rate snapshots.
- `equipment_asset_costs.internal_hourly_cost_cents` and `internal_daily_cost_cents`.
- Private `job-cost-receipts` Storage bucket.
- Reporting indexes for status, dates, foreign keys, service categories, labor, and costs.

The migration seeds lead-source choices but does not assign them to existing records. Unknown categories and sources remain null/uncategorized.

## Security

- Owner/admin/payroll-capable roles can access financial reports, profitability, labor cost, and financial CSV exports.
- Owner/admin can change reporting settings.
- Estimators can access reports, but report queries constrain quote metrics to their own `estimator_user_id` and do not query invoice, payment, direct-cost, or labor-rate data.
- Ordinary crew users cannot open `/admin/reports`.
- Assigned crew can submit a pending job cost and private receipt. They cannot approve it or read company cost reports.
- Financial authorization is enforced in RLS and server actions, not only hidden controls.
- Labor rates are queried only for authorized financial sessions and never passed to ordinary crew clients.
- Receipt objects are private and use short-lived signed URLs.
- No reporting RPC is exposed to `anon`; private authorization helpers live in `app_private` with a fixed empty `search_path`.
- CSV exports omit portal tokens, private URLs, receipts, customer phone/address details, and provider secrets.

After deployment, run Supabase Security Advisor and verify `app_private` is not in exposed API schemas.

## Metric Definitions

- **Lead:** job created in `new_lead` or `estimate_scheduled`.
- **Eligible quote:** a quote that left draft; draft and cancelled records are excluded from the approval denominator.
- **Approved quote:** `status = approved` or a recorded `approved_at`.
- **Quote approval rate:** approved eligible quotes / eligible quotes.
- **Invoiced revenue:** non-void invoice totals by invoice creation date. It is not cash revenue.
- **Collected revenue:** successful payment rows by `paid_at`.
- **Outstanding balance:** positive balance on non-paid, non-void invoices.
- **Overdue balance:** outstanding balance with a due date before today.
- **Completed job:** `completed_at` is set or status is completed, ready to invoice, invoiced, or paid.
- **Estimated gross profit:** invoice revenue minus approved direct cost, equipment usage cost, and approved labor cost.
- **Estimated margin:** estimated gross profit / invoice revenue. It is unavailable when invoice revenue, approved time, or an effective labor rate is missing.
- **Revenue per labor hour:** invoiced job revenue / approved recorded job hours.
- **Schedule utilization:** unavailable until explicit employee capacity is modeled; scheduled hours and recorded time are shown separately.
- **Average days to payment:** invoice creation to `paid_at` for paid invoices.

The canonical calculation and date-range helpers are in `src/lib/reporting/definitions.ts`. Sensitive aggregation is in `src/lib/data/reports.ts`.

## Backfill

Do not infer lead sources, estimator ownership, or service categories from free text. Staff should correct high-value records from the Data Quality report. For historical labor rates, add dated rate rows in chronological order; never overwrite a prior rate to represent a later change.

## Known Limitations

- The current roles do not include a separate office/manager role. Existing owner, admin, payroll admin, and estimator boundaries are preserved.
- Estimator attribution is complete only for quotes created after this migration or explicitly corrected later.
- Capacity utilization remains unavailable because employee availability is not modeled.
- Job profitability is an operational estimate, not formal accounting, tax, payroll, or general-ledger data.
- Direct-cost correction history is preserved by adding a superseding row; a dedicated correction editor is not included yet.
- Geographic reporting uses structured city/state/ZIP only; no geocoding or maps are added.
- Report tables render the first 250 rows. Authorized CSV exports include the complete filtered server result, currently capped at 5,000 records per source query.

## Manual Verification

1. Create leads from multiple sources.
2. Create sent, approved, declined, and draft quotes.
3. Confirm quote approval rate excludes drafts.
4. Convert an approved quote to exactly one work order.
5. Complete work with linked time entries.
6. Generate and send an invoice.
7. Record a Stripe payment.
8. Record a manual payment.
9. Confirm collected revenue does not double-count either payment.
10. Confirm outstanding balance is correct.
11. Create an overdue invoice.
12. Confirm the correct aging bucket.
13. Add direct job costs.
14. Confirm estimated job profit.
15. Remove labor cost data.
16. Confirm the report shows incomplete data rather than false profit.
17. Add historical labor rates.
18. Confirm work uses the rate effective on the work date.
19. Filter reports by month, crew/employee, source, and service.
20. Confirm totals match drill-down records.
21. Export a filtered CSV.
22. Confirm secrets, portal tokens, private URLs, phone numbers, and addresses are excluded.
23. Test an estimator account cannot access employee cost rates or financial exports.
24. Test a crew account cannot access company reports.
25. Replay a duplicate Stripe webhook and confirm collected revenue is unchanged.
26. Confirm voided invoices are excluded from invoiced and collectible totals.
27. Confirm partial payments reduce remaining balance correctly.
28. Confirm completed jobs without invoices appear in Data Quality.
29. Confirm maintenance costs are restricted and receipts remain private.
30. Confirm charts and tables work with no data and on a phone-sized viewport.
31. Run Supabase Security Advisor and verify no privileged public function was added.
32. Smoke-test CRM, schedule, closeout, fleet, employee, email, quote/invoice portals, Stripe, and automated reminders.
