# Dashboard width and interaction fix

October 22, 2026. Verified locally and deployed as an isolated, owner-authorized dashboard hotfix. No production business-data or configuration change.

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

The three existing dashboard application files were byte-identical between the published production source `943f3e2f8ffd724029186d4a40c417fa8b150099` and this patch's pre-change base `ce14a26`. This allowed an isolated release without pending customer-document branding or other unreleased work.

## Production release and live acceptance

The owner explicitly requested pushing and deploying this fix. Release source `8fa9df32c95a2e6d6a72c77422391ae7b9ca7528` applies only this seven-file patch to previously published source `943f3e2`. Published Netlify deploy: `6adab6d33b9c3096a37ad0a1`, at https://admin.angeltreeservices.org. The fix is also integrated into `main`, retaining concurrent website changes; future normal Git deployments will replace the manual artifact with a source that retains this fix. Customer-branding commit `ce14a26` remains preserved locally and unreleased.

The isolated release passed its five regression checks, typecheck and Netlify production adapter build (Next 16.3.8, runtime 5.16.3, Node 22.23.3). Live health/login returned 200; all ten login CSS/JavaScript assets returned 200. Anonymous dashboard access still redirects to login. Existing scheduled function names and schedules, Netlify build settings and the staging deploy were preserved. No migrations, database writes, credential changes or customer-action endpoints were invoked by this release.

Signed-in live acceptance reset browser zoom to 100% and checked widths 1920, 1280, 904 and 390px. The dark shell matched the viewport at every width, with no horizontal overflow or light side bar; CSS zoom and visual viewport scale were both 1. Month-to-date and 90-day navigation selected the correct routes and displayed the matching verified reporting windows. The 90-day selection committed in 911ms, showing a loading state while financial reads finished, then displayed July 25–October 22. This is one sampled live interaction, not a guaranteed response time. Browser error/warning logs were empty. Temporary viewport overrides were reset; the existing live tab remains on the 90-day dashboard.

Release packaging incident: the first three upload attempts failed live acceptance, causing temporary server errors or missing styles between approximately 01:13 and 01:22 UTC on October 23. The online CLI build had substituted masked public configuration values; the no-build upload also needed the adapter's `.netlify/static` directory, and its two-minute function-manifest cache must remain fresh to preserve the adapter's unbundled handler. Corrected the release packaging using existing public values verified against production, the adapter static directory, and an immediate deploy after rebuilding. No application-code workaround or hosted-setting change was made. The final artifact passed server, asset and signed-in browser checks. Only those three invalid artifacts created during this release were retired after saving their diagnostics privately; the original production deploy and final verified deploy were retained.

Sanitized production proof: `staging/DASHBOARD_PRODUCTION_RELEASE_20261022.json`. Private release logs, diagnostics and live screenshots are in `/Users/noelsierra/Documents/Codex/2026-10-22/dashboard-production-hotfix/` and are excluded from Git.

## Evidence and scope

Application files: `src/app/admin/page.tsx`, `src/app/admin/dashboard.css`, `src/components/dashboard/DashboardMoney.tsx` and new `DashboardPeriodLinks.tsx`. Regression tests: `tests/dashboard-responsiveness.test.mjs`. Sanitized verification summary: `staging/DASHBOARD_RESPONSIVENESS_VERIFICATION_20261022.json`.

Private evidence is in `/Users/noelsierra/Documents/Codex/2026-10-22/dashboard-responsiveness/`: controlled before/after timings, browser geometry and interaction proofs, logs and synthetic local screenshots. Live CRM screenshots and synthetic actor credentials stay outside Git. The existing live tab is preserved at the owner's 90-day dashboard. Temporary local browser tabs, preview/proxy and the owned disposable stack were stopped after verification; retained data volumes and unrelated applications were preserved.

The fix is pushed and live; prior customer branding commit `ce14a26` is preserved locally. This fix improves the dashboard's readiness and response feedback; it does not claim that every destination page or underlying operational query throughout the CRM is now faster.
