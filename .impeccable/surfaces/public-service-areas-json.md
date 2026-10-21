---
version: 1
slug: "public-service-areas-json"
primary_target: "public-service-areas.json"
related_targets: ["scripts/build-public-pages.py","index.html","ats-service-areas.css"]
---

Mode: Read for service areas; Persuade for compact homepage coverage.
Precisely specified code-led extension of the existing public-page architecture.
Seed: not applicable; approved narrow content/wayfinding extension, no new world.
THESIS: Let customers find their confirmed community and understand Richmond's tree-only scope before requesting an estimate.
OWN-WORLD: Existing Poppins, green/cream, page hero, breadcrumbs, footer and underlined text links. No new photography or location icons.
STORY: Read compact homepage coverage, open full location directory, find geographic group, see Richmond tree-only distinction and request the appropriate estimate.
FIRST VIEWPORT: Existing green page hero names Service areas around Fredericksburg and states the Richmond exception. A quiet two-column text directory follows; no repeated cards, fabricated map or location offices.
FORM: Existing static builder and route architecture. No form code, analytics, consent, CRM or GBP edits. Separate checkout and patch from the pending estimate-guidance work.
FINISH: All owner-confirmed places present exactly once in the directory. Seventeen pages validate, mobile/desktop evidence, independent finish review, incumbent-system documentation, no commit/push/deploy.

## Finished-system check — 2026-10-20

Outcome: the finished service-area directory and compact homepage coverage band are an ordinary extension of the incumbent public-site template. No new visual world or approved system change was found. Preserve `PUBLIC_SITE_DESIGN_GUIDE.md`, `overrides.css`, `site-pages.css`, existing design documents and assets; no root `DESIGN.md` or system-token sidecar is introduced by this pass.

The built source uses Poppins; the existing green family, white and cream surfaces; the shared centered hero, white underline and shallow wave; pill actions; and underlined text links. The directory adds eight geographic text groups containing 41 normal communities and a separate four-place Richmond tree-only section. It is two columns above 760px and one column at smaller widths, within the existing 1180px content limit. The homepage summary sits immediately before the estimate section and stacks at the same breakpoint. These are surface arrangements, not new global design rules.

The scoped `.ats-page-hero .ats-page-hero__inner--single` selector keeps `minmax(0, 850px)` and the shared center alignment. Refreshed desktop evidence shows the heading, underline, lead, trust line and actions on the central axis; the 768px, 390px and 320px captures retain the single column without visible clipping. The new homepage footer coverage/privacy row uses a static class so it remains visible without the legacy `preFlex` reveal state.

Evidence checked: `PRODUCT.md`; the incumbent public design guide; `overrides.css` and `site-pages.css` (unchanged against `ce1ca85c6f97de903969d590cbbf9fa1064fc780`); `ats-service-areas.css`; `public-service-areas.json`; homepage coverage/footer markup; and `service_areas_body` in the shared builder. Visual evidence in `/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/outputs/service-areas/`: `areas-desktop-top.jpg`, `areas-desktop-full.jpg`, `areas-tablet-768-full.jpg`, `areas-mobile-390-full.jpg`, `areas-mobile-320-top.jpg`, `homepage-coverage-desktop.jpg`, `homepage-desktop-footer.jpg`, `homepage-desktop-full.jpg`, and `homepage-mobile-390-coverage.jpg`.

`independent-review.txt` records the scored desktop alignment fix as resolved and disposition `ship` for local owner review; it reports that the preceding full review found no other material scope issue. `artifact-comparison.json` records all 16 existing pages' metadata/schema preserved and 232 existing artifacts unchanged, including the existing assets. The supplied test logs record 155 passing standalone tests and 158 passing tests with the exact separately reviewable estimate patch; both builds validate 17 pages. This documentation pass did not rerun those suites.

Not canonized or repaired: the incumbent guide lists primary green as `#2f8e2f`, while both unchanged source stylesheets use `#287228`; source remains the factual implementation reference. Legacy homepage footer hidden text and oversized spacing remain outside this narrow extension. Existing uppercase breadcrumb/eyebrow treatments elsewhere are not promoted into new system rules. No imagery, analytics, consent, CRM or GBP changes, live lead submission, commit, push or deployment was performed by this pass.

## Release-review follow-up — 2026-10-20

The final review refined only the new page's metadata and one introductory paragraph: the title names Fredericksburg, tree and landscaping service areas, and the prose links to existing removal, pruning, grinding and the documented William Street project. The incumbent system, layout, scope list, photos, estimate targets and protected runtime are unchanged. Refreshed 1280/768/390/320 evidence remains readable without overflow; native menu Enter/current-page/Escape behavior was verified through the browser. Existing design-guide drift and legacy footer behavior remain recorded without repair. The earlier independent verdict remains a scored hero-alignment review; the follow-up technical/SEO review is recorded separately in release-review.txt.

## Directory refinement — 2026-10-21

The owner confirmed all 41 researched additions and requested a clearer design
while preserving SEO. The local directory now retains 84 normal entries across
the same eight regions, with Woodbridge explicitly marked tree-services-only
and four Richmond tree-only locations separate. Native
city/county jump links precede semantic place lists. Headings now identify
Fredericksburg/Spotsylvania, Stafford, Woodbridge/Prince William, Culpeper/Orange,
Warrenton/Fauquier, Caroline/Ashland, Lake Anna/Louisa and King George/Westmoreland.
Falmouth, southern Spotsylvania communities and Port Royal were moved beneath
the matching county group; every entry and existing anchor remains.
Fredericksburg/Spotsylvania and Stafford come first in both navigation and
sections, followed by the other groups alphabetically; Richmond remains last
with its tree-only qualification. Two list columns become one on
very narrow phones; existing regional section columns still stack below 760px.
Poppins, green/white surfaces, page-level headings, service copy, metadata and
estimate destinations remain the incumbent truth. No new imagery, JavaScript,
location pages, analytics, consent or CRM changes. Evidence and local tests are
in the task workspace's outputs/coverage-place-navigation/ (earlier layout
evidence remains in outputs/coverage-layout/). Not committed or published.

Woodbridge coverage clarification — 2026-10-21: the owner confirmed tree services
only in Woodbridge. Its directory entry carries that label and a no-landscaping
note. Homepage coverage, About, shared interior footers, the page lead/description
and llms summary reflect the same exception. Other listed Prince William
communities retain their confirmed scope. Existing region ordering, anchors,
photos, estimate links and protected runtime remain. Tests and screenshot:
task workspace outputs/woodbridge-coverage/. Local only, unpublished.
