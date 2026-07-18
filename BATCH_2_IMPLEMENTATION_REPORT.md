# Public Website Batch 2 Implementation Report

## Status

Batch 2 content is present on the production site at commit `73358a371d221d81770467bd49f2b9f3a3fc33ad`. Netlify's public site record reported production deploy `6a5ab6d61cf11300081138b1`, published July 17, 2026.

The controlled release review added a deterministic build artifact, a repository-controlled Netlify contract, and automated validation. Those release-hardening changes remain local and have not been deployed. Release approval is therefore conditional on the gates in `PUBLIC_SITE_RELEASE_CHECKLIST.md`.

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

The generated pages are build artifacts and are not committed. A clean checkout uses the same command locally and on Netlify:

```bash
npm run test:public
```

This creates a fresh `dist-public/` artifact, generates the eight Batch 2 routes plus the homepage, and validates the complete public package. `scripts/build-public-pages.py` writes only inside the configured build output; it does not overwrite the hand-maintained homepage.

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
- `site-pages.css`
- `site-pages.js`
- `.gitignore`
- `package.json`
- `netlify.toml`
- `scripts/build-public-site.py`
- `scripts/build-public-pages.py`
- `scripts/validate-public-site.py`
- `PUBLIC_SITE_CONTENT_ARCHITECTURE.md`
- `PUBLIC_SITE_DESIGN_GUIDE.md`
- `PUBLIC_SITE_ROADMAP.md`
- `PUBLIC_SITE_RELEASE_CHECKLIST.md`
- `BATCH_2_IMPLEMENTATION_REPORT.md`

The previously committed generated route files, `sitemap.xml`, and `robots.txt` are intentionally removed from source control. They are now created in `dist-public/` during every build, leaving one source of truth instead of mixing committed and generated output.

## Verification Completed

- `npm run test:public`: passed; generated and validated exactly nine indexable pages.
- `netlify build --offline`: passed using repository `netlify.toml`.
- Clean prospective checkout with no `node_modules`: passed twice; source hashes remained unchanged and artifact hashes matched.
- Second consecutive build: byte-identical public artifact and no unexpected source diff.
- `python3 -m py_compile scripts/build-public-pages.py`: passed.
- `node --check site-pages.js`: passed.
- `node --check ats-form-enhancements.js`: passed.
- Automated internal-link, asset-reference, route-inventory, sitemap, robots, metadata, canonical, Open Graph, JSON-LD, duplicate-ID, form, and publish-boundary checks: passed.
- Unique title and description check: passed.
- One-H1 and heading-presence check: passed.
- JSON-LD parse check: passed.
- `sitemap.xml` parse check: passed.
- Public HTML/CSS/JavaScript/JSON/XML TRAQ scan: zero matches.
- Production-source TRAQ scan on July 17, 2026: zero matches across all nine pages, sitemap, and robots.
- Browser matrix for every new route at 1440px, 1024px, 768px, 390px, and 360px: all returned `200`, had one H1, and matched document width to viewport width.
- New-route browser console/page-error check: zero errors.
- Keyboard skip-link check: passed.
- Mobile menu open/touch-width/overflow check: passed.
- Tree-service and commercial CTA prefill/referrer smoke tests: passed.
- Homepage visual check at 1440px, 1024px, and 390px: passed with no horizontal overflow.
- `git diff --check`: passed.

The homepage still emits known legacy Squarespace local-server warnings/errors that predate this static-page system. New pages do not load that runtime and produced no console errors. The release review also changed the hidden legacy hero image from eager to lazy loading, preventing an unnecessary duplicate hero download without changing the visible hero.

## Release-Readiness Findings

- **Build contract:** repository root, `npm run test:public`, publish `dist-public/`.
- **Build dependencies:** Node.js/npm and Python 3; the public static build requires no environment variables.
- **Public artifact boundary:** only curated HTML, CSS, JavaScript, image assets, `robots.txt`, and `sitemap.xml` enter `dist-public/`. Audit Markdown, screenshots, application source, scripts, local files, and environment files are rejected by validation.
- **Admin separation:** the public static site posts to the separate CRM at `https://admin.angeltreeservices.org/api/leads`; the CRM build and database are outside this release package.
- **Claims requiring owner evidence:** active ISA Certified Arborist status and the published `30+ years` experience statement should remain release approval items. No licensing, insurance, bonded, workers' compensation, family-operated, or 24/7 claim was added.
- **Lead compatibility:** simulated `2xx`, empty-body, explicit failure, server-failure, and repeated-click cases passed. No real production lead was submitted.
- **Known platform hardening item:** the CRM lead route currently uses a process-memory IP rate limiter. It is best-effort across serverless instances and should be replaced with a durable shared limiter before a campaign or other intentional traffic increase.
- **Netlify dashboard visibility:** repository configuration is unambiguous, but dashboard-only base/build/publish overrides and redirects could not be authenticated from the local CLI. They must be checked manually before publishing.

## Deployment Steps

Use the exact gated steps in `PUBLIC_SITE_RELEASE_CHECKLIST.md`. Do not deploy an incomplete subset of the generated pages and shared assets, and do not submit a real production lead without explicit approval.

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
