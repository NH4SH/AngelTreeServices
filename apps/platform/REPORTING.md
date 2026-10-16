# Business reporting and profitability

PR17 replaces capped, cross-period JavaScript joins with authorized SQL totals and bounded detail. All 13 existing report tabs, historical rates, settings and correction links remain available at `/admin/reports`. This is operational reporting, not a general ledger or a forecast.

## Release state

Prepared and verified locally on `codex/pr17-report-semantics`. The additive migration is `supabase/migrations/20261016200200_trustworthy_report_reads.sql`. No hosted database migration or deployment has been performed. A future release must apply migrations in order before the matching application version. Publishing code, applying hosted migrations and deploying each require their own release authorization.

Do not reset the shared review database to test this package. Use the existing named disposable stack, or replay all migrations into a new empty disposable database with the matching Supabase Auth/Storage bootstrap. No new environment variables, dependencies or provider credentials are required.

## Definitions

| Measure | Population and date basis |
| --- | --- |
| Quotes and approval | Unarchived quotes created in the selected business-date period; current outcome of that cohort. Draft/cancelled quotes are excluded from the approval denominator. Estimators see only assigned quotes. |
| Work created | Active, unarchived work records created in the period. Independent job/quote/invoice status counts are not a conversion funnel. |
| Completed work | Explicit `completed_at` falls in the period, even when the work was created earlier. Legacy closed status without a completion date is a correction item. |
| Issued invoice value | Invoices created in the period, excluding draft and void. Archived issued invoices remain financial history. This is billed value, not cash. |
| Net retained payments | Successful/refunded payments received by `paid_at` in the period, minus known refunded and lost-dispute principal, clamped per payment as in PR07. Card surcharge is excluded. Fully-refunded status means zero retained principal even for legacy records with incomplete refund-detail fields. Later adjustments restate the original receipt cohort as of refresh; this is not a refund-event ledger. |
| Current receivables | Positive open issued balances across all invoice dates. Due today is current; overdue uses business-calendar dates. Missing due dates have a separate bucket. |
| Whole-job margin | Jobs completed in the period, hydrated with all linked issued invoices and their known principal adjustments, approved time, effective labor rates, approved current direct costs and equipment snapshots across all dates. Each child source is aggregated independently before joining. |
| Estimated profit | Adjusted billed value minus recorded approved labor, direct and equipment costs. Pending/open/unapproved time, missing or overlapping rates, pending costs, missing invoice/time/equipment rates, or excess payment allocation prevent a complete estimate. Unknown/unentered costs cannot be detected. |
| Margin total | Sum of complete estimates divided by their adjusted billed value; never an average of percentages. Empty/all-incomplete cohorts show Unavailable. |
| Labor | Entries starting in the period, full recorded duration less breaks, latest approval ordered by timestamp then ID. Voided entries are excluded. Effective rates use the business start date. Overlapping rates are flagged rather than arbitrarily selected. Explicit configured blended/default costs remain supported. |
| Scheduling | Events starting in the period, with full event duration; cancelled hours excluded. Overnight entries/events are not split at period boundaries. Capacity utilization remains unavailable without availability records. |
| Services | Explicitly classified quote/invoice line value before document-level adjustments and tax. Unclassified lines remain explicit. Whole-job filters do not apportion a fraction of job costs. |
| Repeat accounts | Distinct contracting accounts with more than one explicit completion in the period. Identically named individuals/organizations are separate groups. |
| Current snapshots | Receivables, backlog, labor rates, stock, fleet and correction queues use their stated current/all-date basis. Company-wide stock/fleet snapshots do not infer job allocation. Work-filtered activity excludes records lacking the required relationship. |
| Stale work | Reporting thresholds are retained. Lead age uses weekdays (no holiday calendar is configured); quote thresholds use elapsed days. |

Approved cost corrections supersede amounts through the same-job correction chain. Original records and rejected corrections remain history. Equipment costs are counted once from usage snapshots; maintenance is not silently allocated to jobs. No historical completion date, rate, lead source, service category, overhead or capacity is inferred.

## Read contract and security

- One selected-view `get_business_report` RPC supplies totals, groups, detail pages and previous-period comparisons. Dashboard summaries use the same source projections, without fetching drilldown pages.
- New projections live in unexposed `app_private`, are `security_invoker` views and retain caller RLS. Both new functions use invoker security, an empty search path and live staff checks. Anonymous/service-role execution is denied; financial projections also enforce the existing owner/admin/payroll boundary.
- Estimator DTOs contain only assigned quote/line datasets and business timezone, without company cash, employee costs or labor defaults. Caller-supplied roles are not authority.
- No RLS policy, financial write command, payment guard, provider configuration or business-history row is changed by the migration.
- Totals/median/group counts cover all matches independently of detail pages. Groups show the top 15 plus an explicit combined Other group. Details use deterministic date/ID ordering, counts, page metadata and a source fingerprint. Changing records require refresh; continuously changing display-only age is excluded from that fingerprint.
- Exact customer, organization and employee filters remain URL compatible, show their names, and can be removed individually. Other filters remain in links, paging and export.
- Runtime validation rejects incomplete pages, missing required datasets, unsafe numbers and unconfirmed totals. Failed reads show Unavailable/error recovery rather than fabricated zero totals. No shared private-data cache is introduced.

## CSV contract

Exports use one stable database statement snapshot for both summaries and rows. Count-only preflight enforces a combined 10,000-row limit before assembling detail. Successful exports include all selected datasets, cents, filter/range metadata and an explicit completion footer. Larger exports return HTTP 413 with narrowing guidance; timeouts/errors return no partial CSV. Downloads are authenticated, role limited, private and noncacheable. Formula-like text is escaped. Portal/provider tokens, receipt/storage paths, private URLs, contact phones/addresses and free-form notes are omitted.

## Verification

`npm run test:unit`, `npm run typecheck` and `npm run build` run from `apps/platform`. See `tests/README.md` for opt-in disposable integration tests. PR17 tests use actual local Auth/RLS and HTTP export, cross-month job inputs, multiple invoices, late refunds, correction chains, overlapping/missing rates, deterministic approvals, legacy completion gaps, current aging, stale-page conflicts, 5,006-row totals/export, over-limit refusal, role/offboarding denial and a concurrent quote update during export.

The verified local database replay contains 86 migrations. Security Advisor has zero warning/error findings; the existing private RLS tables without client policies remain informational findings. Query-plan and large-data timings are local measurements, not a production SLA. Further tuning belongs in measured PR18 work rather than raising API limits or weakening policies.
