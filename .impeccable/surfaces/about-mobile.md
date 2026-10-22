---
version: 1
slug: about-mobile
primary_target: dist-public/about/index.html
related_targets: [scripts/build-public-pages.py, site-pages.css, about-mobile.js]
---

Mode: Persuade. Refinement of the approved mobile service-page pattern.

The owner approved implementation and local testing, then explicitly approved a
QA-only Netlify draft. No commit, push or production release is authorized.

## Direction

Keep the company story linear and complete, make its credibility landmarks
reachable, and show one primary estimate invitation at a time. Preserve Poppins,
green/cream bands, wave, approved photograph and alt text, company history,
employment disclaimer, prior-territory context, community and recognition facts,
desktop composition, SEO head/canonical/schema, all existing links and estimate
and draft behavior. Analytics, consent and CRM remain unchanged.

Through 700px, show four wrapping, underlined shortcuts after the hero actions:
Our story, Experience, Community and Recognition. Each has a target of at least
44px. Preserve the target IDs and make headings focusable with measured header
height plus 20px scroll clearance. Hide the shortcuts above 700px.

Use 36px/80px hero padding, 48px content sections, 28px related-content gaps,
24px territory-panel and history-note insets. Practice rows retain their ordered
content with a 32px counter track, 12px column gap and 20px vertical padding.
No new cards, accordions, imagery, facts or content deletion.

Preserve the white, wider estimate pill, labels, DOM order and hrefs. The
About-only observer yields only when the complete hero action pair fits below
the sticky header and focus is outside the bar. Partial or offscreen actions
restore it; a focused bar remains available. Unsupported observers retain the
visible fallback. Reserve 88px plus safe area below the content and cap the menu
using the measured header offset.

## Verification

188 Node and 9 Python tests pass (197 total), with an 18-page build and validator.
Preservation guards pass for all 18 pages and 17 protected source hashes. SEO,
photos, forms, factual copy and existing links remain unchanged. The other 17
pages differ only in the shared stylesheet fingerprint.

Eight QA states cover 320/390px phones, 700/701px breakpoints, 844px landscape,
1280px desktop and synthetic 200% text at 320/390px. Heading/control bounds,
image readiness, all 12 settled anchor/focus checks, full/partial/offscreen hero
bar behavior, keyboard focus retention, estimate priority, short enlarged menu,
Escape focus return and footer/privacy/pill clearance pass. Synthetic name,
company, multiline notes and commercial service/intent survive the real About
hero and floating estimate links and reload. Clear draft removes the entries,
confirmed after reload. No leads or calls; no console errors or warnings.

At 390px the page height falls from 9,480px to 9,287px. The shortcuts provide the
main reduction in reading effort while retaining the complete story. Independent
capture/source review found no new P0–P2 defect or blocker. Five inherited
mechanical warnings (six before) are triaged in detector-triage.json.

## QA and release boundary

[QA preview](https://6ad979166a2acac84e9bee92--verdant-shortbread-99c404.netlify.app/about/) is deploy `6ad979166a2acac84e9bee92`:
ready, deploy-preview, published_at null, no functions or schedules. The isolated
wrapper blocks collection, submissions, external navigation and indexing, and
localizes fonts. All 18 HTTP checks and 10 shipping-asset comparisons pass. QA
configuration and ignored .netlify state stay outside shipping source. Never
publish this QA wrapper.

Public production stays at 6ad9762da5a0d96e485da7ea; CRM stays at
6ad95318d4baa154ecf3456a. Both projects' build/processing settings and recent CRM
deploys are unchanged. The checkout remains at 38395ba with seven uncommitted
files. Unrelated .impeccable/review/ is untouched. Evidence, complete diff,
manifest and backup are in outputs/about-mobile/.

## Limits

The original localhost denial remains unresolved; authorized hosted QA was used.
Synthetic text enlargement is not actual browser/OS zoom certification. The
inherited shared-brand Service/s split and extreme hero word wrapping at 320px
synthetic 200% remain separate typography work. Physical-device and spoken
screen-reader verification remain unperformed. This draft is ready for owner
review and has not been committed, pushed or released to production.
