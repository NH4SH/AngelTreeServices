---
name: Angel Tree Services — Admin Dashboard
# Surface-only contract. Directory placement does not apply this design to child routes.
description: Dark cash-and-day-work dashboard for the ATS owner and office staff; /admin only.
colors:
  dashboard-accent: "#c2f57a"
  dashboard-action-hover: "#d2ff9b"
  dashboard-action-ink: "#1b2913"
  dashboard-warning: "#f5bc91"
  dashboard-bg: "#111713"
  dashboard-surface: "#19201b"
  dashboard-raised: "#222b24"
  dashboard-line: "#354139"
  dashboard-text: "#f2f5ef"
  dashboard-muted: "#acb8ae"
typography:
  display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: "clamp(2.4rem, 4.8vw, 4.5rem)"
    fontWeight: 550
    lineHeight: 1.08
    letterSpacing: "-.04em"
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: "clamp(2rem, 3vw, 2.8rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-.04em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: "1.1rem"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "-.015em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: "14px"
    lineHeight: 1.42
    letterSpacing: "0"
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: ".75rem"
    fontWeight: 650
  ledger:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: "clamp(1.05rem, 1.65vw, 1.6rem)"
    fontWeight: 550
    letterSpacing: "-.025em"
  queue-count:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: "1.5rem"
    fontWeight: 500
    letterSpacing: "-.04em"
rounded:
  period: "4px"
  alert: "5px"
  primary-action: "6px"
  navigation: "8px"
  inherited-control: "10px"
  inherited-workflow-row: "11px"
  inherited-panel: "14px"
spacing:
  compact: "8px"
  control: "12px"
  row-gap: "16px"
  ledger: "20px"
  section: "24px"
  section-rule: "28px"
  section-major: "32px"
  column: "36px"
  opening-column: "40px"
components:
  action-primary:
    backgroundColor: "{colors.dashboard-accent}"
    textColor: "{colors.dashboard-action-ink}"
    rounded: "{rounded.primary-action}"
    padding: "0 18px"
  action-primary-hover:
    backgroundColor: "{colors.dashboard-action-hover}"
  action-secondary:
    backgroundColor: "{colors.dashboard-raised}"
    textColor: "{colors.dashboard-text}"
    rounded: "{rounded.inherited-control}"
    padding: "0 12px"
  period-navigation:
    textColor: "{colors.dashboard-muted}"
    rounded: "{rounded.period}"
  period-navigation-selected:
    backgroundColor: "{colors.dashboard-surface}"
    textColor: "{colors.dashboard-accent}"
    rounded: "{rounded.period}"
  cash-total:
    textColor: "{colors.dashboard-text}"
    typography: "{typography.display}"
  cash-chart:
    textColor: "{colors.dashboard-accent}"
    height: "200px"
  priority-row:
    textColor: "{colors.dashboard-text}"
    padding: "23px 0"
  agenda-row:
    textColor: "{colors.dashboard-text}"
    padding: "20px 0"
  disclosure:
    textColor: "{colors.dashboard-text}"
    padding: "18px 0"
  preview-panel:
    backgroundColor: "{colors.dashboard-surface}"
    textColor: "{colors.dashboard-text}"
    rounded: "{rounded.inherited-panel}"
    padding: "14px"
  sidebar-navigation:
    textColor: "{colors.dashboard-muted}"
    rounded: "{rounded.navigation}"
    padding: "0 9px"
---

# Design System: Angel Tree Services — Admin Dashboard

## Overview

> **SCOPE: `/admin` dashboard only.** This document governs `page.tsx`, `dashboard.css`, `DashboardMoney`, `DashboardCashChart`, and the `PlatformFrame` instance explicitly using `appearance="dashboard-dark"`. It is **not** guidance for other `/admin/*` routes. Existing employee, document, and files design documents remain authoritative for their surfaces. Do not propagate this palette to the website or portals.

**Creative North Star: "Robinhood portfolio/day board"**

The user-pinned Robinhood portfolio/day board brings retained cash and the next work to handle into one operating surface. Graphite, warm white, a single lime accent, open chart space, tabular figures, hairline divisions, and compact task rows carry the implemented direction. The dashboard prioritizes both daily work and money.

This is a dashboard-specific design system. Its dark appearance is an explicit exception to PRODUCT.md’s public-website light-mode preference. It preserves the existing CRM navigation, role boundaries, record destinations, and shared components. There are no shipping raster assets; the PNG captures are review evidence only.

**Key Characteristics:**
- Dark graphite surfaces with warm white text and one lime action/chart accent.
- Large tabular money figures, with financial basis and date window visible.
- Flat chart and queue sections; bounded operational previews behind native disclosures.
- Responsive dashboard content inside the existing opt-in CRM shell.

**The Dashboard Boundary Rule.** Apply this document only to /admin’s dashboard implementation and its explicitly opted-in .dashboard-dark frame. This file’s directory placement does not extend its guidance to descendant admin routes, employee or document surfaces, the public website, customer portals, crew tools, or files.

The normative tokens above are extracted from `dashboard.css` and the inherited platform stylesheet. The scope remains narrower than this directory. The direction contract is `.impeccable/surfaces/apps-platform-src-app-admin-page-tsx.md`; the corresponding evidence directory is `Documents/Codex/2026-10-21/dashboard-remake`. No app behavior or global palette is established by this document.

## Colors

The palette uses graphite and warm white, with one lime accent and a peach attention color. Frontmatter values preserve the implementation’s canonical CSS values.

### Primary

- **Dashboard lime** (`dashboard-accent`): primary quote action, chart line and dots, selected period, active link emphasis, focus, selection, and carets.
- **Action hover lime** (`dashboard-action-hover`): the primary quote action’s hover state.
- **Action ink** (`dashboard-action-ink`): readable text on the lime action and selected text.

### Neutral

- **Graphite page** (`dashboard-bg`): dashboard page, opted-in sidebar, main area, mobile bar, and navigation drawer.
- **Graphite surface** (`dashboard-surface`): selected period, loading line, inherited preview and handoff panels.
- **Raised graphite** (`dashboard-raised`): selected navigation, secondary actions, compact count/icon backgrounds, and local hover surfaces.
- **Hairline graphite** (`dashboard-line`): borders, dividers, chart grid, and scrollbar thumb.
- **Warm white** (`dashboard-text`): headings, figures, and primary content.
- **Quiet gray-green** (`dashboard-muted`): dates, basis, supporting details, inactive navigation, chart cursor, and secondary text.

Peach (`dashboard-warning`) is semantic attention: nonzero overdue amounts, schedule conflicts, and unavailable-module notices. The sidecar records only extracted colors; it does not invent tonal ramps.

**The One Accent Rule.** Lime identifies the primary action, selected reporting period, chart, selected navigation icon, and active links. Peach communicates overdue balances or attention; it is not a second promotional accent.

The dark wrapper remaps existing platform color aliases locally and sets `color-scheme: dark`. Default `PlatformFrame` instances remain governed by the existing CRM styles.

## Typography

The dashboard inherits the platform’s system sans-serif stack. There is no added display font, font download, or separate monospace family. Money, chart-table amounts, times, priority order, and counts use tabular numerals.

- **Display:** the cash or approved-quote figure uses the frontmatter display role. It wraps long values rather than clipping. At the compact breakpoint it uses `clamp(2.5rem,6vw,4rem)`; on narrow phones it uses `clamp(2.1rem,10vw,3.4rem)`.
- **Headline:** the page heading uses the headline role, then becomes a fixed size on narrow screens (`2rem`). No eyebrow sits above it.
- **Title:** standard section headings use the title role. The daybook heading is larger (`1.45rem`, then `1.3rem` on narrow screens). Standard headings become `1rem` on narrow screens.
- **Body and labels:** the inherited body is compact; row titles, basis, dates, and descriptions use their explicit local sizes. Period labels use the frontmatter label role. Supporting chart text ranges from `.7rem` to `.8rem`.
- **Ledger and counts:** ledger amounts and priority counts use their distinct numeric roles. Narrow-screen ledger values become `.97rem`.

**The Numeric Basis Rule.** Keep money and counts tabular. Pair the largest figure with its actual reporting window and basis; do not add invented growth percentages, trend deltas, or profit claims.

## Layout

The dashboard is a block container with a maximum width (`1440px`), centered within the existing main area. Default padding is (`32px 36px 24px`). The opening layout uses `minmax(0, 1.65fr) minmax(290px, 1fr)` with a gap (`40px`). Money leads on the left; Next up has a left divider and inset (`30px`). The daybook, workflow/handoffs, and progressive disclosures follow below.

| Condition | Implemented behavior |
| --- | --- |
| At or below `1200px` | Horizontal padding becomes `28px`; opening columns become `minmax(0,1.5fr) minmax(270px,1fr)`; their gap and Next up inset become `24px`. |
| At or below `980px` | The existing platform shell replaces its sidebar with the mobile bar/drawer. This inherited shell breakpoint is separate from dashboard content reflow. The 908px capture therefore retains two opening columns. |
| At or below `800px` | Money and Next up stack. Next up receives a top divider, priorities form two columns, and Money / Next up / Today’s work jump links become visible. |
| At or below `640px` | Page padding becomes `24px 20px 20px`; priorities, days, workflow/handoffs, and preview grids become one column. Chart height becomes `150px`; period targets and exact-amount disclosure have a minimum height (`44px`). |

The opening chart remains open space, not a card. The three ledger columns remain side by side on phones. Today and Tomorrow use two columns until the narrow breakpoint; each day shows at most four eligible estimate/job/emergency/maintenance entries. Agenda rows align a fixed time column (`65px`, then `58px`) with flexible text and an arrow. Long names, locations, and amounts wrap.

Shared preview panels and disclosures use compact spacing; principal content sections are separated by top rules and gaps from the extracted spacing scale. Secondary queues, estimate follow-through, and business checks start collapsed as native `details` elements. Horizontal overflow is contained by the exact-amount table wrapper.

## Elevation & Depth

Dashboard content has no added shadows. Tonal layering and one-pixel dividers distinguish the page, selected states, preview panels, and rows. The inherited mobile navigation drawer retains its existing edge shadow; it is shell behavior, not a dashboard card elevation system.

**The Flat Content Rule.** The dashboard’s chart, priorities, agenda, and workflow use space and hairline dividers for hierarchy. Do not turn the opening surface into a decorative card grid.

There is no chart draw animation, animated loading shimmer, or authored dashboard transition timing. The existing shell’s navigation chevron uses its inherited transform transition (`180ms cubic-bezier(0.22, 1, 0.36, 1)`); pressed shell actions inherit a small brightness/translation response. With reduced motion enabled, the dark wrapper disables animation and transitions and restores automatic scrolling. Native disclosure chevrons rotate when open without an added dashboard transition.

## Shapes

The opening sections and rows use square, rule-separated structure. The extracted corner roles are local and functional: period selectors, schedule warning, primary action, and inherited navigation/controls/rows/panels retain their distinct values. Do not flatten the inherited CRM panel corners into a new global rule, or expand the primary action’s compact shape into a global button redesign.

Borders use the hairline token. The chart uses a rounded, non-scaling line (`2.5px`) with small circular points; the selected point grows from radius (`3px`) to (`5px`). Focus on dashboard links, buttons, summaries, and button-role targets is visible in lime (`2px`, offset `4px`); chart hit targets use their own dashed lime stroke. Selection, input carets, and scrollbars are scoped to the dark wrapper.

## Components

### Quote action and secondary actions

The filled lime **New quote** link has a minimum height (`44px`), horizontal padding (`18px`), icon gap (`16px`), and weight (`750`). It uses the extracted primary corner, a lighter hover fill, and visible keyboard focus. Narrow screens reduce padding (`12px`), gap (`8px`), and text size (`.75rem`). Reused secondary actions retain CRM semantics and control shape, recolored with raised graphite, warm white, and the local border. Do not infer a new dashboard form-field or status-chip system: the page does not introduce one.

### Reporting period navigation

MTD, 7D, 30D, 90D, and YTD are real `/admin?range=` links, not cosmetic chart filters. Invalid or absent range values resolve to MTD. Selected state uses `aria-current="page"`, lime text, a surface fill, and a hairline border. Default targets have minimum dimensions (`44px × 40px`); narrow-screen height becomes (`44px`). Hover uses raised graphite and warm white.

### Money overview and role-sensitive sales variant

Financial reporting roles (`owner`, `admin`, `payroll_admin`) see company-scope cash and invoice totals only after server authorization and report-scope validation. Estimators can receive the own-record sales variant: **Your sales / Approved quote value**, with no company cash chart or invoice ledger serialized to them. Roles outside reporting, failed authorization, or incomplete totals receive the unavailable state. Do not use client-side hiding as the financial boundary.

**Cash collected** is retained payment principal from receipts within the chosen reporting window, after refunds and lost disputes. It excludes card surcharges and is not profit. Later refunds/disputes restate the original receipt period. **Invoiced** uses issued invoice creation dates, excluding drafts and voids. **Outstanding** and **Overdue** are current balances across all invoice dates. Their differing date bases stay visibly labeled. The definition disclosure also retains the business timezone, refresh time, approved quote value, approval rate or no-eligible-quotes message, and company/own scope.

Loading reserves space and announces verified-total loading. Unavailable totals have an explicit status and refresh path. A complete summary may remain visible while a changed cash-series read is explicitly unavailable; an incomplete or changed access scope hides the money result. Financial amounts are formatted as USD from integer cents.

**The Verified Data Rule.** A verified zero is valid data. Unavailable totals, incomplete chart reads, and unconfirmed workflow counts remain explicit unavailable states; never substitute a plausible curve or a false zero.

### Cumulative cash chart and exact amounts

The chart uses actual date-weighted bucket positions, up to seven contiguous business-calendar buckets, and a cumulative line beginning at zero. Bucket values must reconcile with the complete selected-period cash total. A valid zero period has a flat chart and the explicit no-retained-payments message. Grid, line, cursor, and points use the extracted colors; there is no fabricated comparison series or growth badge.

Each point has a labeled, focusable SVG button target. Pointer entry, focus, or click reveals the bucket’s date range, received amount, and cumulative amount in an atomic polite live caption. Left/Right moves focus between point targets; Enter/Space selects; Escape clears. The SVG title and description give the range, total, and non-profit basis. **Exact amounts** expands a semantic table with date, received, and cumulative columns, column/row headers, a caption, tabular amounts, and contained horizontal scrolling. Keep this table alongside the chart.

### Next up and workflow queues

The priority order is Contact new leads, Invoice finished work, Schedule approved work, Finish draft quotes. Counts come from exact existing workflow-stage reads; when those reads cannot be confirmed, show the dash and unavailable explanation. The order number, title, support text, count, and arrow remain independently aligned. Hover emphasizes title/arrow with lime.

Queue destinations preserve action intent: finished work opens `/admin/jobs?view=billing&invoice=none`; approved work opens `/admin/jobs?view=to_be_scheduled`; draft quotes open `/admin/quotes?status=draft`. Work in progress uses the same scheduling/invoice destination mapping. Due follow-ups and delivery review remain direct links.

### Day rows, handoffs, and progressive previews

Today/Tomorrow are business-date previews with explicit full-day and schedule links. Empty preview copy does not claim the entire day has no work. Schedule errors have an unavailable message. The conflict alert reports the loaded window, not a business-wide conflict total.

My due handoffs is assigned to the current user, due-only, ordered by due time, and limited to three visible items. Its reused panel, row separators, status actions, managed scheduling behavior, pending/error states, and full follow-ups destination remain intact. The outer panel uses the inherited panel shape; individual handoff rows remain flat.

Attention-queue badges explicitly say **in preview**; each lane has a full-queue link. Estimate follow-through names the latest 100-record input boundary and shows at most ten entries. Business checks explicitly state that they are bounded previews and retain each full-area destination. Unassigned work, conflicts, and upcoming estimates show at most five entries in their respective lists. Module failures appear in the dashboard’s unavailable-information disclosure; their fallback lengths must never be presented as verified business totals.

**The Preview Boundary Rule.** Preserve the visible preview/window labels and full-area links. A loaded list length is not a company-wide total.

### Opt-in platform navigation

`PlatformFrame` adds the dark namespace only when its optional appearance prop is provided. The default frame API and styling remain intact elsewhere. Existing role-aware navigation, sidebar expansion, skip link, mobile menu, search, notification controls, focus behavior, and record routes are preserved. The dashboard recolors this instance’s main area, sidebar, mobile bar, and drawer through its local aliases.

## Do's and Don'ts

### Do:
- Do keep this dark system confined to the /admin dashboard and the explicitly opted-in .dashboard-dark shell.
- Do preserve the user’s dark, bold-number, high-contrast chart direction and the CRM’s existing navigation identity.
- Do show the actual date window, business timezone, financial basis, and refresh time where the implemented components provide them.
- Do preserve the chart’s keyboard interaction and exact-amount table alongside pointer access.
- Do retain unavailable, loading, empty-preview, and role-sensitive variants with their honest labels.
- Do link each priority and workflow row to the queue that implements its stated action.

### Don't:
- Don't apply this file to all admin routes, the website, customer portals, crew tools, employee/document screens, or files.
- Don't serialize or reveal company cash and invoice fields to sales-only reporting roles.
- Don't label cash collected as profit, use invoice totals as cash, or compare date-scoped values with all-date balances without their labels.
- Don't invent growth metrics, replace unavailable data with zero, or draw an unreconciled cash timeline.
- Don't present bounded preview lengths as complete business totals or remove the paths to full queues.
- Don't add shipping raster assets, decorative card grids, extra eyebrow labels, or display tracking tighter than the implemented -.04em.
