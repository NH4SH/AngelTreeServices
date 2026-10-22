---
version: 1
slug: gallery-controls
primary_target: site-pages.css
related_targets: [projects-gallery.js]
---
Mode: Experience. A narrow mobile refinement of the existing Projects photo viewer.
Keep approved photography, captions, filters, labels, estimate destinations, native
dialog semantics, keyboard navigation, focus return and desktop layout unchanged.
Analytics, consent and CRM remain unchanged. Implement and verify in isolated QA;
no commit, push or production publication in this task.

The mobile Previous photo label wraps and makes its button taller than Next photo.
Stretch the auto-height controls within their existing flex row through 700px.
Keep natural label wrapping and the existing touch-area floor; do not fix heights
or prevent text enlargement. Check 320/390px, synthetic 200% gallery text, the
700/701px boundary and desktop, plus filtering, previous/next, Escape/focus return
and service estimate navigation. Run existing public tests/build and verify that
only CSS cache references change in the generated HTML.

Verification completed October22,2026: 188 Node +9 Python =197 tests and
18-page build/validation pass. Seven actual viewport states cover320/390,700/701,
1280 and synthetic200% gallery text at320/390. Navigation controls share their
row height/top, retain44px or larger hit areas and have no internal or dialog
horizontal overflow. The QA probe explicitly scales initially hidden dialog
labels and dynamically populated title/caption nodes; it is never shipped.

Actual filtering, Previous wraparound, Next via Enter, arrow-key navigation,
Escape/focus return and gallery-to-Landscaping estimate navigation pass. Photos,
all gallery code/captions/links, SEO and estimate/draft/analytics/consent sources
remain identical. All18 generated pages normalize exactly to the released
artifact after CSS fingerprint replacement. No new detector finding. Independent
read-only review found no scope drift or source regression.

QA-only deploy6ada3547414eb1fe39f5830e passes18 routes and15 asset-byte checks,
is unpublished/noindex, blocks collection/submission and has no functions. Both
production deploys/settings and CRM recent deploys remain unchanged. No leads,
calls, emails, production field edits or consent choice changes. No commit/push.

Evidence: workspace outputs/gallery-controls/. Actual-device/OS zoom and spoken
screen-reader certification remain unverified. No production release in this task.
