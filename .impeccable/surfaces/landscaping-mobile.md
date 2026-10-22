---
version: 1
slug: landscaping-mobile
primary_target: dist-public/services/landscaping/index.html
related_targets: [scripts/build-public-pages.py, site-pages.css, landscaping-mobile.js]
---

Mode: Persuade. Refine the existing Landscaping mobile layout.

## Direction

Preserve all approved wording, photos, alt text, SEO, links and estimate/draft
behavior. Keep analytics, consent code/settings and CRM unchanged. The owner
approved local testing and QA-only previews, with no commit, push or production
publication.

Through 700px, retain the linear content and readable type. Use 36px/80px hero
padding, 48px content sections and final invitation, and 28px content/photo gaps.
Keep the complete images, wave and existing green/cream bands. Do not add another
navigation block or hide service information. Desktop composition is unchanged.

Place Free estimate before Call now in the mobile bar, preserving both hrefs and
labels. Yield only to a complete visible hero or final action pair below the
measured sticky header, with no cookie panel open. Partial/offscreen pairs restore
the bar. Preserve keyboard focus until it leaves the bar. Observe late cookie
panel insertion and hidden-state changes without modifying consent choices,
logic, storage, policy or analytics. Browsers lacking the required observers keep
the visible fallback.

Measure bar height for enlarged-text footer clearance and header height for the
short-screen menu. A Landscaping-only rule in site-pages.css preserves the normal
84px privacy-panel bottom offset and increases clearance only as the contact bar
grows. The panel remains scrollable and at least 12px above the bar with doubled
text. Consent assets and settings remain byte-identical.

## Verification — complete

208 local tests pass (199 Node + 9 Python), plus the 18-page build and validator.
All 18 pages retain SEO/head, photo markup, forms, copy and links. Only the
Landscaping body class, script and quick-action order change in markup; the other
pages differ only in the shared stylesheet fingerprint. All 17 protected source
hashes, including analytics, consent, estimate/draft and other mobile runtimes,
remain exact. The unrelated .impeccable/review/ is untouched.

Final QA covers 320/390px phones, 700/701px breakpoints, 844px landscape, 1280px
desktop, synthetic doubled text at 320/390px, and a 320x568 short screen with
doubled text. All requested sizes were verified against actual innerWidth/Height.
No horizontal or heading-box overflow. Sixteen open/closed panel layout states and
36 interaction checks pass: reopened panel keeps both quick actions readable and
tappable; closing it restores full/partial hero/final behavior; focus stays on the
bar until it leaves; footer/privacy controls clear the bar. The short enlarged
menu scrolls within the screen and Escape returns focus to Menu. No console errors
or warnings. At 390px the first service heading moves 1102px to 1006px and total
page height falls 4997px to 4813px while retaining the content.

Synthetic name and multiline details survive the hero-to-form journey, floating
estimate link and reload with Landscaping selected. Clear draft removes them
through reload. No submissions, calls, emails or saved analytics/consent choices.
Only the current-visit cookie settings were closed/reopened for inspection.

## QA and release boundary

Final QA: https://6ada68addf72a6fe2a9a65b7--verdant-shortbread-99c404.netlify.app/services/landscaping/

Deploy 6ada68addf72a6fe2a9a65b7 is ready/unpublished, noindex, no functions,
collection/submissions blocked, with local fonts. All 18 HTTP routes and 15
shipping asset comparisons pass, including the corrected script, fingerprinted
stylesheet and page photographs. Two QA drafts were uploaded during this approved
QA pass; the first exposed the enlarged-text clearance issue, corrected in the
final draft. Earlier QA builds are historical and must not be used for release
verification. QA wrappers/probes never ship.

Public production remains 6ada5762e7ec3080f9942032; CRM remains
6ad95318d4baa154ecf3456a. Both projects' published/build/processing settings and
recent CRM deployments are unchanged. No commit, push or production publication.
Source remains detached at 1c828891606e60823f4315657f42eeea1a0bfa5a. Newer main
08ed9d9 has CRM-only changes and identical public inputs; preserve it or any newer
main during an approved release.

Authoritative source/diff/manifest, tests, HTTP checks, browser results and
screenshots: outputs/landscaping-mobile-final-qa/ in the website workstream
workspace. Ready for owner release approval; no known blocking regression remains.

## Limits

The original local-browser denial remains unresolved; authorized hosted QA was
used. Emulated viewport/synthetic enlargement checks do not certify physical
phones, OS/browser zoom, virtual keyboards or spoken screen readers. The inherited
extreme shared-brand/hero word splits under synthetic 200% remain separate type
work. No real production lead-delivery test was performed.
