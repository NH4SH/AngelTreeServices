# Public Website Batch 2 Implementation Report

## Status

Batch 2 is implemented and validated locally. It has not been deployed.

The approved homepage remains the conversion hub. The new routes use a lightweight shared static-page system and the same green, cream, white, Poppins, rounded-button, real-photography, and organic-wave language as the homepage.

## Pages Created

### Service and commercial pages

- `/services/` — service hub.
- `/services/tree-removal/` — removal assessment, scope, site planning, process, and FAQs.
- `/services/tree-pruning/` — pruning goals, topping guidance, timing, process, site considerations, and FAQs.
- `/services/stump-grinding/` — access, utilities, roots, chips, replanting considerations, process, and FAQs.
- `/services/emergency-tree-service/` — immediate safety guidance, utility boundaries, storm requests, normal urgent requests, process, and FAQs.
- `/services/commercial-hoa-tree-care/` — site walks, scoped proposals, stakeholder coordination, documentation, recurring planning, storm response, and organization estimate routing.

### Trust and proof pages

- `/credentials-safety/` — verified ISA membership, ISA Certified Arborist wording, 30+ years of industry experience, planning, PPE, equipment checks, work-zone control, and documentation-request guidance.
- `/projects/` — a real-work image library that separates verified imagery from facts still needed for case studies.

## Pages Withheld

No individual project case-study pages were published. The repository contains genuine tree-service, lawn-care, and landscaping images, but it does not contain enough approved facts to publish a factual case study covering the customer concern, privacy-safe location, site constraints, confirmed method/equipment, property-protection steps, cleanup outcome, and media permission.

This is an intentional content-integrity decision. The project index is complete and indexable; individual project routes should be added only after the missing facts are approved.

No location pages were created in this batch.

## Reusable Static System

- `scripts/build-public-pages.py` holds structured page content and renders the public routes.
- `site-pages.css` centralizes the shared responsive design system.
- `site-pages.js` preserves campaign parameters on estimate links and closes the accessible mobile navigation after selection.
- Generated pages remain ordinary static HTML; no framework, client-side content rendering, CMS, or heavy component library was introduced.

The shared system includes:

- Sticky transparent-green header and keyboard-accessible mobile menu.
- Skip link, visible focus states, breadcrumbs, and semantic heading structure.
- Editorial hero with real imagery where a truthful image is available.
- Organic white-stroked wave transition.
- Reusable content, process, FAQ, callout, related-link, final-CTA, footer, and mobile-action patterns.
- Centralized metadata and JSON-LD generation.

To regenerate the routes locally:

```bash
python3 scripts/build-public-pages.py
```

## Homepage Integration

- The legacy desktop header remains the desktop header.
- Homepage navigation now exposes Services, Projects, Commercial, and Credentials without overcrowding or wrapping at the 1024px reference width.
- The custom mobile header includes an accessible compact menu for the same destinations.
- The homepage service action and services overview link to `/services/`.
- Homepage credential headings link to `/credentials-safety/`.
- The form reads safe exact-match `service` and `customer_type` query values.
- Tree-service CTAs preselect the existing `Tree Care` option.
- Emergency CTAs preselect `Storm Cleanup`.
- Commercial CTAs preselect `Multiple Services / Not Sure Yet` and `Commercial / Property Management`, then reveal the existing organization fields.
- Browser referrer, page URL, UTM values, and submission IDs continue through the existing lead flow.

## Internal-Link Map

- Homepage → service hub, projects, commercial/HOA, credentials/safety, estimate form.
- Service hub → all five service/commercial routes, credentials/safety, projects, estimate form.
- Tree removal → pruning, stump grinding, emergency guidance, credentials/safety, estimate form.
- Tree pruning → removal, emergency guidance, credentials/safety, projects, estimate form.
- Stump grinding → removal, service hub, projects, estimate form.
- Emergency guidance → removal, pruning, credentials/safety, estimate form, phone action.
- Commercial/HOA → removal, pruning, emergency guidance, credentials/safety, organization-prefilled estimate path.
- Credentials/safety → service hub, emergency guidance, projects, estimate form.
- Projects → tree removal, pruning, service hub, estimate form.

## Structured Data and Metadata

Every new route includes:

- Unique title and meta description.
- Absolute canonical URL.
- Open Graph title, description, URL, and maintained first-party image.
- Twitter card metadata.
- One H1.
- Visible breadcrumbs and matching `BreadcrumbList` JSON-LD.

The service and commercial pages include truthful `Service` JSON-LD linked to the homepage business entity. The credentials page uses `WebPage`; the project library uses `CollectionPage`. No review, rating, FAQ, customer, insurance, licensing, availability, or unverified credential data was added.

## Project Assets and Facts Used

Only repository-visible facts were published:

- `assets/AngelChainsawSquooshed_008.jpg` — real Angel Tree Services tree-work imagery; no location, species, equipment plan, or outcome was inferred.
- `assets/LightroomGrassPictureSquooshed_014.jpg` — real lawn imagery; no address, customer, treatment, or outcome was inferred.
- `assets/GardenLandscaping+(2)_008.jpg` — real landscaping imagery; no location, customer, scope, or result was inferred.
- `assets/VerySquooshedSideGreenwall.jpg` — real supporting landscaping/property image used without inventing a project narrative.
- Existing ISA Member and ISA Certified Arborist graphics are reused unchanged.

## Missing Content Needed

Before publishing individual project case studies, collect:

- Approved project title and service category.
- Privacy-safe city/county or confirmation that location should be omitted.
- Customer concern and site constraints.
- Confirmed work scope and methods/equipment actually used.
- Property-protection and cleanup details.
- Factual outcome.
- Before/during/after image mapping.
- Customer/media permission and any face/license-plate review.
- Optional exact customer quotation with explicit permission.

Current insurance, workers’ compensation, licensing, hours, response-time, customer/partner, and recurring-inspection claims also remain unpublished until evidence and owner approval are recorded.

## Files Changed

- `index.html`
- `overrides.css`
- `ats-form-enhancements.js`
- `sitemap.xml`
- `site-pages.css`
- `site-pages.js`
- `scripts/build-public-pages.py`
- `services/index.html`
- `services/tree-removal/index.html`
- `services/tree-pruning/index.html`
- `services/stump-grinding/index.html`
- `services/emergency-tree-service/index.html`
- `services/commercial-hoa-tree-care/index.html`
- `credentials-safety/index.html`
- `projects/index.html`
- `PUBLIC_SITE_CONTENT_ARCHITECTURE.md`
- `PUBLIC_SITE_DESIGN_GUIDE.md`
- `PUBLIC_SITE_ROADMAP.md`
- `BATCH_2_IMPLEMENTATION_REPORT.md`

## Verification Completed

- Regenerated all static routes from the shared builder.
- `python3 -m py_compile scripts/build-public-pages.py`: passed.
- `node --check site-pages.js`: passed.
- `node --check ats-form-enhancements.js`: passed.
- Local internal-link and asset-reference check across all nine indexable HTML files: passed.
- Unique title and description check: passed.
- One-H1 and heading-presence check: passed.
- JSON-LD parse check: passed.
- `sitemap.xml` parse check: passed.
- Public HTML/CSS/JavaScript/JSON/XML TRAQ scan: zero matches.
- Browser matrix for every new route at 1440px, 1024px, and 390px: all returned `200`, had one H1, and matched document width to viewport width.
- New-route browser console/page-error check: zero errors.
- Keyboard skip-link check: passed.
- Mobile menu open/touch-width/overflow check: passed.
- Tree-service and commercial CTA prefill/referrer smoke tests: passed.
- Homepage visual check at 1440px, 1024px, and 390px: passed with no horizontal overflow.
- `git diff --check`: passed.

The homepage still emits known legacy Squarespace local-server warnings/errors that predate this static-page system. New pages do not load that runtime and produced no console errors.

## Deployment Steps

1. Review the local homepage and new-page screenshots at 1440px, 1024px, and 390px.
2. Run `python3 scripts/build-public-pages.py` and confirm no unexpected generated diff.
3. Deploy the static site through the existing Netlify release path; do not deploy an incomplete subset of the generated pages and shared assets.
4. Confirm each route returns `200` on the canonical HTTPS host.
5. Confirm `/sitemap.xml` includes only the completed routes in this report.
6. Confirm canonical and Open Graph URLs use `https://angeltreeservices.org`.
7. Submit controlled homeowner, emergency, and commercial estimate tests and verify one correctly attributed CRM lead per submission.
8. Re-run the production TRAQ scan before announcing the release.

## Search Console Recommendations

1. Submit `https://angeltreeservices.org/sitemap.xml` after production smoke testing.
2. Inspect the service hub, five service/commercial pages, credentials page, and project index.
3. Request indexing only after each production URL returns the expected canonical HTML.
4. Monitor Coverage/Pages, Core Web Vitals, and search queries before considering location pages.
5. Do not submit withheld project URLs or placeholder routes.

## Production Smoke Checklist

- Header and navigation work at desktop, tablet, and mobile widths.
- Mobile menu opens, closes, and does not create horizontal scrolling.
- All hero and supporting images load from first-party assets.
- Every estimate CTA reaches `/#contact` and expected service/customer type is selected.
- Referrer and UTM attribution survive the route transition.
- Phone links dial `(540) 388-8715`.
- Emergency copy warns visitors away from fallen/contacted power lines and does not claim energized-line work or 24/7 availability.
- Credentials page contains only the approved ISA and experience language.
- Structured data and canonical tags match the visible page.
- No incomplete case-study route is indexable.
- No public TRAQ reference is present.

## Rollback

- Roll back the generated route directories together with `site-pages.css`, `site-pages.js`, and the matching sitemap/navigation changes.
- Restore `index.html`, `overrides.css`, and `ats-form-enhancements.js` as one compatible homepage set if homepage integration is rolled back.
- Do not leave sitemap entries or homepage links pointing to removed routes.
- The builder is deterministic, so the generated pages can be recreated from `scripts/build-public-pages.py` after a rollback or content correction.
