# Recurring Services, Renewals, and Follow-ups

## Deployment

Apply migrations through the linked Supabase workflow. Do not paste this migration into production out of sequence.

```text
supabase/migrations/20260717015652_change_orders_and_organization_parity.sql
supabase/migrations/20260717022829_recurring_services_followups_and_renewals.sql
```

```bash
npx supabase migration list
npx supabase db push
```

The recurring migration adds no secrets. It creates `follow_up_tasks`, `service_recommendations`, `recurring_service_plans`, `recurring_plan_locations`, `recurring_service_occurrences`, and singleton `recurring_service_settings`, plus recurrence references on quotes, jobs, invoices, schedule events, and closeouts.

After deployment, refresh the PostgREST schema cache if needed and run Supabase Security Advisor. Keep `app_private` out of exposed API schemas.

## Routes

- `/admin/recurring`: office follow-up, recommendation, renewal, and plan queues
- `/admin/recurring/[planId]`: property portfolio and occurrence history
- `/admin/customers/[customerId]`: customer recurring-service summary
- `/admin/organizations/[organizationId]`: organization property-plan summary
- `/crew/jobs/[jobId]`: assigned-crew future-work recommendation

## Recurrence Rules

A plan is a future-work template. An occurrence is one property cycle. The occurrence key is the plan ID, service-location ID, and target date; a unique constraint prevents duplicate cycles. Quote and work-order occurrence IDs are also unique.

Staff may generate due occurrences manually. The generator creates only cycles inside each plan's planning window, uses the configured business timezone, locks candidate property rows, skips inactive/paused plans and properties, and creates one deduplicated office review task. It does not create years of visits, send email, or create a work order.

`automated_generation_enabled` is seeded `false`. A service-role scheduled worker returns without generating work until an administrator intentionally enables that setting. The current app provides manual generation and no new scheduled endpoint or secret.

Completing or skipping an occurrence advances only that property's future date. Completed occurrences, quotes, jobs, invoices, contacts, pricing, and other historical records are not rewritten. Seasonal/manual plans require staff to set their next date.

## Authorization And Pricing

- `quote_required`: staff prepares a renewal quote; pricing must be reviewed before CRM send.
- `staff_review`: staff reviews the occurrence before choosing the existing workflow.
- `existing_agreement`: authorized staff may create one work order only while the recorded agreement dates are active and an agreement reference exists.

Renewal quotes copy useful prior line structure and multiline scope into a new draft. They do not copy portal tokens, email history, approvals, jobs, invoices, or payments. Prior pricing is visible in the draft but is marked unreviewed; saving the renewal edit records staff pricing review before sending.

Approved renewal quotes continue through the existing quote approval path and create exactly one linked work order. Recurrence IDs then carry through work-order invoice generation. No card subscription or automatic price increase is added.

## Organizations

An organization remains the plan owner and may select multiple existing service locations without duplicating the organization. The plan records separate approval, billing, and default onsite contacts; each selected property may override its onsite contact. A property can be paused without pausing the rest of the plan.

Renewal quotes target the selected approval contact. Existing schedule and invoice recipient logic continues to use onsite and billing roles. Because the legacy quote/job schema still requires a contracting `customer_id`, renewal quote or work-order creation for an organization requires an existing active linked customer record; the recurring workflow never creates a fake or duplicate customer.

## Security

New operational tables have RLS enabled, no anonymous table grants, and staff-only policies. Crew users cannot query the recurring portfolio or pricing tables. They submit a recommendation only through `submit_crew_service_recommendation`, which validates authentication and assigned-job access and creates a pending office-review record. It does not send customer communication or generate pricing.

Privileged functions use an empty fixed `search_path`; PUBLIC and anonymous execution are revoked. No portal token, provider secret, or private URL is written to activity history.

## Production Smoke Test

1. Create an annual plan for an individual customer and one service location.
2. Generate due renewals twice; confirm one occurrence and one review task.
3. Prepare a renewal quote; confirm copied scope, draft status, and pricing-review warning.
4. Save pricing, send through the existing CRM flow, approve through the portal, and confirm one linked work order.
5. Generate an invoice from the completed work order and confirm recurring plan/occurrence provenance remains linked.
6. Complete the occurrence and confirm only its future next date advances.
7. Create an organization plan with three properties, selecting two and assigning different onsite contacts.
8. Pause one property; confirm the other remains active and can generate its own occurrence.
9. Confirm the renewal quote uses the approval contact and existing invoice behavior uses the billing contact.
10. Submit a crew recommendation from an assigned job; confirm it enters office review with no customer send, quote, or pricing.
11. Confirm an unassigned crew account cannot submit for another crew's work order and cannot read recurring tables.
12. Confirm anonymous users cannot read any recurring table or call recurring management RPCs.
13. Re-test quote and invoice portal links, change orders, email, payments, schedule, closeout, materials, equipment, time, and reporting.
14. Run Supabase Security Advisor and verify no new exposed privileged function.

For a local Supabase environment:

```bash
npx supabase start
npx supabase db reset
npx supabase db lint --local
```

The Next.js build does not prove migration, RLS, or RPC behavior passed.

## Current Limits

- Batch visit preview/scheduling continues through the existing schedule after approved work orders exist; no separate recurrence calendar was added.
- Recurring communication templates are not automatically enabled. Staff use the existing quote, schedule, and invoice communication actions.
- Photos/documents remain linked through the source work order and existing document systems; recommendations do not duplicate private files.
- Projected annual plan value is an estimate based on approved per-visit price, active properties, and frequency. It is not labeled or counted as invoiced or collected revenue.
