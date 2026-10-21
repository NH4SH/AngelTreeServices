---
version: 1
slug: mobile-menu
primary_target: scripts/build-public-pages.py
related_targets: [index.html, site-pages.css, overrides.css]
---

Mode: Persuade. Ordinary refinement of the incumbent mobile navigation.
Local draft only; no commit, push or deploy.

THESIS: Lead with the service, work examples, coverage and estimate choices a
customer needs; keep company information reachable with quieter emphasis.

OWN-WORLD: Preserve Poppins, deep-green native-details menus, white/cream actions
and existing desktop navigation. Keep all ten destinations, company name, current
page indicators, close behavior, SEO content and customer-detail behavior.

STORY: Tree services, Landscaping, Firewood, Projects, Service areas and Request an
estimate first. More information contains About, Commercial & HOA, Credentials &
safety, and Reviews & recognition. Preserve destinations and sentence case.

FIRST VIEWPORT: A compact Menu trigger beside the complete company name. When
opened, the primary destinations lead; the estimate action is distinct and the
supporting group follows a quiet separator. No nested disclosure or icon system.

FORM: Existing green, type, radii and native-details behavior. Keep Menu on one
line under text enlargement; let branding and destination labels wrap. Constrain
the panel to the viewport with its own scroll area and comfortable link targets.

FINISH: Independent finish review and ordinary-extension documentation required.
No new shipping raster assets. No analytics, consent, CRM or estimate runtime
change is needed. Preserve desktop navigation and existing SEO metadata/schema.


## Documented outcome — 2026-10-21

Status: local refinement complete; independent finish disposition `ship` for this
mobile-menu scope. No commit, push or deployment is implied by the verdict.

The finished implementation follows the incumbent system recorded in PRODUCT.md
and PUBLIC_SITE_DESIGN_GUIDE.md: Poppins, a deep-green native-details panel,
white/cream estimate action, restrained divider, existing radii and visible
keyboard states. It changes navigation hierarchy and responsive containment, not
the visual world. Tree services, Landscaping, Firewood, Projects, Service areas
and Request an estimate lead. More information groups About, Commercial & HOA,
Credentials & safety, and Reviews & recognition, preserving all ten destinations.
Menu stays on one line; the company name and long links may wrap. The dropdown is
positioned below the complete header and scrolls within the viewport.

Evidence checked: the changed homepage, shared page generator, both stylesheets
and navigation validator; the fresh five-section `finish-review.md`; all 18-page
preservation results in `regression-guards.json`; `interaction-checks.json`;
`responsive-metrics.json`; and `local-tests.txt`, under the task's
`outputs/mobile-menu/` directory. The review reports eight individually inspected
captures for the homepage and Tree Removal at mobile, enlarged mobile, landscape
and desktop sizes. Supplied metrics additionally cover the 1100/1101 breakpoint
and 320×568 short viewport. They report no horizontal overflow and one-line Menu
triggers when visible; keyboard checks reach the last link in the scrollable
panel. Enlarged-text evidence is synthetic 200% computed text/line-height scaling,
not OS-native text scaling. Homepage header bounds in the metrics select the
hidden desktop header; the finish review uses the captures for header clearance.

The supplied test log passes 175 JavaScript tests and 9 Python tests, then builds
and validates 18 public pages. Guards preserve desktop navigation, page heads
except stylesheet keys, other page HTML, images, forms, original mobile
destinations and nine protected runtime files. Interaction checks cover Escape
and focus restoration, outside-focus closure, supporting-route current state,
and estimate/customer-draft preservation on the homepage and across pages.

Pre-existing drift, reported without repair: the public guide lists primary green
as `#2f8e2f`, while both `overrides.css` and `site-pages.css` define `--ats-green` as
`#287228`. This patch does not change that token. Root DESIGN.md and
`.impeccable/design.json` are absent; this ordinary-extension documentation does
not create them or replace the incumbent guide. No shipping raster, global token,
new icon system or world-level decision was introduced.
