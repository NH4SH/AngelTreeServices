# Dashboard remake — local review package

October21,2026. Branch `codex/dashboard-remake`, based on aligned `origin/main`4568081. Previous staging100 reconciliation4568081 was pushed atomically/nonforce to main and its preserved staging branch. No dashboard deployment or hosted change occurred.

## Result

The opening view now pairs a large cash-collected figure and actual cumulative chart with four daily-work actions. Invoiced, all-date outstanding and overdue balances have explicit date bases. Period links select MTD,7D,30D,90D andYTD. Today/tomorrow's schedule follows, then work queues and three owned due handoffs with view-all. Deeper attention queues, completed-estimate follow-through, crew/communication/equipment/employee/account checks and emergency response remain available.

The dark graphite/lime visual system is opt-in for `/admin` only. `PlatformFrame` defaults are unchanged. Customer portals, employee redesign, financial commands, RLS, schema/migrations, provider configuration and other CRM pages retain their existing behavior.

## Source changes

- `src/app/admin/page.tsx`: new composition, period parsing, focused queue destinations and progressive disclosure.
- `src/app/admin/dashboard.css`: scoped visual system, responsive layouts, focus/touch targets and reduced-motion behavior.
- `src/components/dashboard/DashboardMoney.tsx`: server-rendered money/sales/loading/unavailable variants and clear financial basis.
- `src/components/dashboard/DashboardCashChart.tsx`: actual SVG timeline; pointer/keyboard exact values and accessible table.
- `src/lib/data/dashboard-money.ts`: authenticated, bounded aggregate reads using the existing report RPC.
- `src/lib/dashboard/cash-series.ts`: bounded date periods, contiguous business-calendar buckets, exact-cent reconciliation and formatting.
- `src/lib/dashboard/*.test.mjs`: focused numerical, scope, missing-data, deadline/completion and concurrency coverage.
- `src/components/PlatformFrame.tsx`: optional dashboard-only appearance.
- `src/components/NextActionsPanel.tsx`: bounded optional preview limit; default10 remains for existing callers.
- Surface/design notes and `CUSTOMER_EXPERIENCE_REVIEW.md`: durable guidance and separate customer review.

## Financial and authorization boundaries

No service-role client, raw payment export, new RPC, SQL migration, permission grant or payment mutation was added. Fresh user/effective-access roles and existing `get_business_report` remain authoritative. Company scope is limited to owner/admin/payroll-admin reporting roles. Estimator responses serialize only own quote value/rate. Unexpected company scope for an estimator, changed timezone, invalid summary, restricted response or bucket-scope/transport failure fails closed.

A financial panel uses at most8 existing aggregate RPCs: one whole-period summary and up to7 contiguous business-calendar buckets, at most3 in flight, under a12-second complete-operation deadline. Siblings settle before partial failure is handled. Each uses page_size1 and no export/filter expansion; totals do not come from capped record previews. Cash uses existing net retained principal semantics, excluding surcharge, refunded principal and lost disputes as defined by the trusted report. Future refunds/lost disputes can restate the original receipt period. Cash is explicitly not profit.

The timeline consists of separate aggregate reads, not a new cross-request transaction/snapshot. Exact-cent bucket/summary disagreement hides the timeline and requests refresh rather than drawing a plausible line. The complete summary can remain visible when only that reconciliation fails. Other incomplete or scope failures hide the whole financial response. This does not claim snapshot isolation across calls or measure large hosted-data performance;8 aggregate reads are a bounded but real additional read cost to monitor before rollout.

Workflow counts retain existing definitions; record lists remain bounded previews and are labelled accordingly. Operational status counts are not a conversion funnel or financial source of truth. The local environment contains large pre-existing synthetic stress-test datasets, so screen amounts/queue sizes are not production business performance.

## Verification

| Check | Result |
|---|---|
| Existing full local regression runner | 2125 passed,0 failures/skips |
| New focused dashboard tests |17 passed; ranges/DST/leap-year coverage/exact cents/partial reads/scope changes/roles/concurrency |
| Typecheck | Passed in isolated current-source copy with synthetic settings |
| Production build | Passed locally in isolated copy; no deployment/site link/real env copied |
| Live local dashboard | Rendered on existing disposable stack, authenticated owner session |
| Actual reporting window interaction |7D changed dates and totals from MTD; no fabricated trend |
| Keyboard | Enter selects a chart point; ArrowRight moves focus/value; Escape clears selection; exact table/disclosures work |
| Responsive |1440px desktop,390px mobile,908px actual panel width; no horizontal overflow measured |
| Error/empty/restricted behavior | Source and focused unit tests; no claim of complete screen-reader/device or multi-role browser acceptance |
| Design detector | One changed-target pass,zero findings |
| Independent visual review | Initial fix disposition, then exact listed fixes scored resolved; final disposition ship for that fix-list scope |
| Git alignment | origin/main4568081 is base; no reset/force push/history replacement |

Node22.23.3; existing Next16.3.8/React19 dependencies and package manager unchanged. No new dependencies, credentials or external accounts. No new full financial integration suite or native device acceptance is claimed.

## Evidence and remaining work

Private evidence directory: `/Users/noelsierra/Documents/Codex/2026-10-21/dashboard-remake/`. Before: `dashboard-before.png`. Final required full-page captures: `dashboard-desktop.png`, `dashboard-mobile.png`, `dashboard-user-908.png`; exact opening views use `*-first.png`. The initial scaled auxiliary capture was replaced with the explicit browser screenshot API; final required full-page evidence was valid. Reviewer report/verdict, detector JSON, unit log and isolated-copy metadata are retained there.

No raster assets ship in the app. SVG is derived from real aggregate values. Design notes are scoped development metadata, not rendered application content.

Customer-facing findings are in `CUSTOMER_EXPERIENCE_REVIEW.md`. Recommended next customer batch: payment/status clarity and closed-proposal states, followed by recovery/reminder links; authoritative contract wording requires an owner decision. Live Stripe, actual mailbox rendering, PDF pagination, real-device/screen-reader and hosted performance acceptance remain separate release gates. Scanner-dependent and all existing rollout gates remain unchanged.
