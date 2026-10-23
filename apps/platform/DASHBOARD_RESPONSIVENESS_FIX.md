# Dashboard width and interaction fix

October 22, 2026. Verified locally; no push, deployment or production business-data change.

## Reproduced problems

The live dashboard was inspected read-only after the owner signed in. At a 1,920px viewport, the dark shell was only 1,440px wide. The underlying light page showed beside it. At the normal panel width, the 90-day link navigated successfully, but gave no immediate feedback; its previously selected period remained visible while work loaded. The first immediate check was at 361ms; the next observation at 5,180ms showed the completed 90-day range. These are sampled observations, not a precise production latency benchmark. No browser console errors were observed.

The dashboard awaited eleven optional operational modules before returning its shell, controls and independent financial Suspense boundary. The financial reads then began after that wait. A small range change therefore repeated unrelated operational work and appeared unresponsive. Default dashboard-link prefetch could also start unrelated route work.

## Fix

- The dashboard-only dark shell fills its available width. Existing capped content measure and other CRM page themes remain intact.
- Auth/configuration checks still run before the shell is returned. Operational sections stream through their own Suspense boundary, independently of the reporting panel. The operations boundary is also keyed by period: already revealed work must not hold the whole client transition on the old range. Existing work data, authorization and complete/unavailable semantics are preserved.
- Period links render outside the keyed money boundary, with Next's per-link pending state, a visible loading treatment and a polite screen-reader announcement. They remain real links with keyboard, URL, history and pre-hydration navigation behavior. Selected range and verified totals are not optimistically fabricated or relabeled.
- Dashboard links load on navigation rather than automatically prefetching unrelated pages. Existing navigation chrome and intent-based navigation behavior are unchanged.
- No API, financial query, RPC, metric definition, role/RLS policy, database configuration, migration, email delivery, scanner or secret changed. There is no cross-user financial cache or new client API for totals. Slow operational reads still take their original time; they no longer block the money panel or range controls.

## Verification

Controlled local comparison used the same retained disposable database and warmed development server, deliberately delaying the employee-directory read by eight seconds. Compilation warm-ups were excluded:

| Visible server output | Before | After |
| --- | ---: | ---: |
| Dashboard shell | 9,061ms | 198ms |
| Reporting-period links | 9,511ms | 198ms |
| Verified financial values | 9,510ms | 540ms |
| Complete response, including delayed operations | 9,512ms | 8,451ms |

These measure streamed HTML availability in a controlled local fault test, not production or real-device timings. Both responses returned HTTP 200. The actual local browser also showed the 90-day link's pending state 130ms after keyboard activation, followed by the correct selected period/date window. A final browser acceptance with the period-keyed operations boundary selected 90D in 341ms and displayed the correct verified date window/totals in 860ms, while the eight-second operational read was still loading. Month-to-date selection took 215ms. The mobile menu opened during a reporting transition in 681ms (includes automation overhead) and closed using Escape.

Actual browser widths: 1920, 1440, 1280, 1024, 981, 980, 904, 768, 390 and 320px. Shell and document widths matched each viewport without horizontal overflow. Mobile visual viewport scale and CSS zoom were both 1. Final desktop/mobile screenshots show the full dark surface. Period links, chart keyboard controls, dashboard sections and navigation remain available. Browser error log was empty.

All **2,370 CRM checks** passed, zero failures/skips. Five new regression checks cover a non-blocking authenticated shell even when operational promises never resolve, retained access/configuration gates, actual period href/history semantics, pending announcements and money-loading states without stale/fabricated values. The final self-contained targeted suite also passed. Financial-role, own-scope, bounded aggregate, failed-bucket, changed-timezone and incomplete-total regressions remain green.

Final typecheck, optimized isolated build and `git diff --check` passed. Preview/build application sources match the repository. One design detector pass reported 19 incumbent typography advisories, none on changed lines; this focused fix does not rewrite unrelated design tokens/context metadata. No staging app deployment or staging database mutation was needed for a UI scheduling/layout change.

The three existing dashboard application files were byte-identical between the published production source `943f3e2f8ffd724029186d4a40c417fa8b150099` and this patch's pre-change base `ce14a26`. This keeps the dashboard change separable from pending customer-document branding and other unreleased work. A production release still requires the owner's deployment instruction and a release built from the intended source.

## Evidence and scope

Application files: `src/app/admin/page.tsx`, `src/app/admin/dashboard.css`, `src/components/dashboard/DashboardMoney.tsx` and new `DashboardPeriodLinks.tsx`. Regression tests: `tests/dashboard-responsiveness.test.mjs`. Sanitized verification summary: `staging/DASHBOARD_RESPONSIVENESS_VERIFICATION_20261022.json`.

Private evidence is in `/Users/noelsierra/Documents/Codex/2026-10-22/dashboard-responsiveness/`: controlled before/after timings, browser geometry and interaction proofs, logs and synthetic local screenshots. Live CRM screenshots and synthetic actor credentials stay outside Git. The existing live tab is preserved at the owner's 90-day dashboard. Temporary local browser tabs, preview/proxy and the owned disposable stack were stopped after verification; retained data volumes and unrelated applications were preserved.

The new changes remain local and preserve prior customer branding commit `ce14a26`. The live site will retain the old behavior until a reviewed deployment is authorized. This fix improves the dashboard's readiness and response feedback; it does not claim that every destination page or underlying operational query throughout the CRM is now faster.
