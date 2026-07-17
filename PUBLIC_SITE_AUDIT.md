# Angel Tree Services Public Website Audit

## Scope and Method

Audit date: July 17, 2026.

Reviewed:

- `index.html`, `overrides.css`, `ats-form-enhancements.js`, and public assets.
- Alternate static pages in `landing-clean/` and `localbuild/`.
- Public production behavior at `https://angeltreeservices.org/`.
- Responsive baselines at approximately 1440, 1024, and 390 CSS pixels.
- Production Lighthouse results and local browser console output.
- Public lead endpoint integration and existing CRM compatibility code.

Baselines are stored in `output/playwright/`.

## Audit Completion Status

The original audit run created all four required documents and captured the requested responsive baselines, but its final response was interrupted by model-capacity failure. The repository artifacts survived. This completion pass filled the two thin areas from that run: the public asset/page inventory and the impact/risk/dependency roadmap matrix.

Audit recommendations and later Batch 1 implementation are intentionally distinguished. Findings below describe the audited baseline; the final status section records what Batch 1 subsequently changed.

## Executive Summary

The site has a memorable local identity, strong photography, a clear phone number, a direct estimate path, and credible ISA visual proof. The largest risks are technical rather than aesthetic: a Squarespace export still loads substantial unused runtime, the mobile hero is offset off-screen, crawl support files are missing, the production deployment still contains the removed TRAQ claim, and the homepage lacks deeper service/project content that can earn local search visibility.

The recommended direction is evolutionary: preserve the hero, type, palette, waves, photos, and rounded interactions while fixing responsive geometry, tightening technical SEO, adding a calm emergency path, improving attribution, and building service/project depth over time.

## Quality Score

Scoring scale: `0` absent/broken, `1` weak, `2` partial, `3` good, `4` strong.

| Area | Score | Notes |
| --- | ---: | --- |
| Accessibility | 3/4 | Lighthouse scored 100, labels/live regions/reduced motion are present; heading duplication and manual responsive issues remain. |
| Performance | 1/4 | Production Lighthouse 41; LCP 18.6s, TBT 680ms, about 3.8MB production payload and substantial unused JS/CSS. |
| Responsive design | 1/4 | Desktop is recognizable; local measurements show 58px tablet overflow and an 86px left-offset mobile hero. |
| Theming/design consistency | 4/4 | Strong, recognizable green/white/Poppins system and consistent rounded action language. |
| Anti-pattern control | 2/4 | No framework bloat was added, but legacy Squarespace runtime, duplicate hero markup, and duplicate asset trees create fragility. |

**Total: 11/20**

## Positive Findings

- Canonical HTTPS host redirects are already coherent at Netlify: HTTP and `www` redirect to `https://angeltreeservices.org/`.
- Homepage title and description already identify the main service categories and region.
- Existing form uses real labels, accessible error/status regions, a honeypot, idempotent submission IDs, UTM/referrer capture, and double-submit protection.
- Lead API returns customer success after a saved lead even when notification fails.
- Hero and service imagery are genuine business assets rather than stock photography.
- ISA Member and ISA Certified Arborist badges are visually clear and appropriately subordinate to the main CTA.
- Reduced-motion overrides are present.
- Alternate `landing-clean` and `localbuild` pages carry `noindex` directives.

## Findings

### P0 — Credential accuracy must be deployed

**Location:** local `index.html` is corrected; production homepage still rendered TRAQ during the audit.

**Impact:** Publicly claiming an unearned qualification is a trust and compliance risk.

**Recommendation:** Deploy the local removal after Batch 1 validation. Re-run repository and production scans. Do not describe the qualification as pending or partial.

**Status:** Resolved in source; deployment pending.

### P1 — Mobile and tablet hero geometry overflows

**Location:** mobile hero rules in `index.html` and overlapping exported layout rules.

**Evidence:** At 390px, `.ats-mobile-hero` measured `x = -86.39px`; at 1024px the document measured 1082px wide.

**Impact:** Content is cropped, the page feels left-shifted, and the layout is fragile across devices.

**Recommendation:** Remove inherited/translated horizontal offsets, constrain hero children to `100%`, and verify no horizontal scrolling at 390/1024/1440.

### P1 — Production performance is materially slow

**Location:** exported Squarespace CSS/JS and oversized image variants.

**Evidence:** Lighthouse performance 41; LCP 18.6s; TBT 680ms; unused JavaScript opportunity about 511KiB; unused CSS about 137KiB; image delivery opportunity about 1.4MiB. Local load observed 53 resources and about 8.1MB transferred.

**Impact:** Slow first impression, especially on mobile networks, and lower conversion/search competitiveness.

**Recommendation:** First optimize true LCP discovery and image delivery, then carefully remove only verified-unused export dependencies with visual regression checks.

### P1 — Crawl support files are missing

**Location:** repository root and production `/robots.txt`, `/sitemap.xml`.

**Evidence:** Both production paths returned 404.

**Impact:** Search engines can still crawl the homepage, but discovery/canonical maintenance becomes less explicit as pages are added.

**Recommendation:** Add a permissive `robots.txt` with sitemap reference and a canonical sitemap containing only indexable public pages.

### P1 — Homepage architecture cannot support service-intent growth

**Location:** one indexable marketing page; navigation uses in-page anchors.

**Impact:** Tree removal, pruning, stump grinding, storm cleanup, landscaping, lawn care, project proof, and service-area intent compete on one page with little depth.

**Recommendation:** Add focused static service and project pages in later batches using shared visual patterns. Do not turn location pages into near-duplicates.

### P1 — Public form has no explicit hazard or contact-preference control

**Location:** contact form in `index.html`; parsing in `apps/platform/src/lib/leads/intake.ts`.

**Impact:** Staff must infer urgency and preferred follow-up from free text, increasing triage time.

**Recommendation:** Add compact, optional contact preference and hazard indication fields; preserve the existing short form and CRM lead-only workflow.

### P2 — Two hero systems create maintenance drift

**Location:** custom mobile hero plus exported desktop hero in `index.html`.

**Impact:** Content, credentials, accessibility, and layout fixes must be duplicated and have repeatedly diverged.

**Recommendation:** Consolidate to one responsive source of truth in a later controlled refactor after visual baselines are stable.

### P2 — Heading semantics are duplicated

**Location:** two `h1` elements for mobile and desktop variants.

**Impact:** Automated parsers see duplicate page-level headings, while each visual mode hides one implementation.

**Recommendation:** Consolidate the hero first, then retain one meaningful H1 and use visual styling independently of heading tags.

### P2 — Social metadata depends on old Squarespace URLs

**Location:** Open Graph/Twitter image and legacy static context in `index.html`.

**Impact:** Social previews depend on a third-party source and HTTP URL; stale export metadata is difficult to maintain.

**Recommendation:** Use canonical HTTPS URLs to local maintained assets and simplify structured metadata.

### P2 — Asset trees are duplicated

**Location:** `assets/` and `angeltreeservices_backup_files/`.

**Evidence:** 126 files represent 52 unique payloads; duplicate payloads account for roughly 17.9MB.

**Impact:** Repository weight and risk of editing the wrong copy.

**Recommendation:** Select one canonical public asset directory in a later cleanup and update every reference atomically.

### P2 — A required export script is missing locally

**Location:** `angeltreeservices_backup_files/performance-1e76009f7da8e011-min.en-US.js` reference.

**Impact:** Browser console 404 and dependent Squarespace warnings.

**Recommendation:** Verify whether the dependency is truly required. Remove the registration/reference only after behavior testing, or restore the exact asset if required.

### P2 — No maintainable review/project proof source

**Location:** homepage proof areas.

**Impact:** Certification and experience are present, but there is no maintainable case-study or review system to answer “Have they done work like mine?”

**Recommendation:** Collect approved project facts, before/after imagery, customer permission, and a single maintainable review source before publishing counts or quotes.

### P3 — HTTP external links add redirects

**Location:** Instagram and Chamber links.

**Impact:** Minor latency and avoidable protocol inconsistency.

**Recommendation:** Use verified HTTPS destinations.

## SEO Inventory

- Indexable canonical page: homepage only.
- Alternate pages: `landing-clean` and `localbuild`, both intentionally noindex.
- Admin placeholder: noindex.
- Canonical host: `https://angeltreeservices.org/`.
- Missing: robots, sitemap, deeper service/project/location pages.
- Existing structured data: `WebSite` and `LocalBusiness`, with legacy Squarespace-hosted image references.
- Existing local terms: Fredericksburg, Spotsylvania, Stafford, King George, Caroline.

## Public Page Inventory

| Route/source | Purpose | Title/H1 | Primary CTA | Public assets and forms | Baseline status |
| --- | --- | --- | --- | --- | --- |
| `/` / `index.html` | Homepage, services overview, trust, estimate journey | Brand title; visible “Your yard’s best friends.” | Request a Free Estimate / Call | Hero lawn image, three service images, ISA badges, Chamber mark, estimate form | Indexable; strongest visual source of truth |
| `/landing-clean/` | Alternate landing-page experiment | Alternate service/estimate presentation | Request estimate | Reuses public brand/service assets and form | `noindex`; not canonical |
| `/localbuild/` | Earlier static alternate/source | Older homepage variation | Request estimate | Reuses hero, badges, and service imagery | `noindex`; internal comparison only |
| `/admin/` | Legacy public-repository placeholder | Administrative placeholder | None for customers | No marketing conversion role | Must remain `noindex`; current CRM is separate |

There were no indexable service, project, location, credential, article, or dedicated contact pages at audit time.

## Public Asset Inventory

| Asset group | Representative files | Current role | Audit treatment |
| --- | --- | --- | --- |
| Primary logo | `SquooshedAngelTreeTransparent.png` | Header/mobile brand identity and structured-data logo | Retain; generate smaller derivatives only when references can be updated atomically |
| Hero/lawn photography | `LightroomGrassPictureSquooshed_013.jpg`, related numbered variants | Hero and lawn-care presentation | Retain original; use responsive WebP derivatives for rendering |
| Tree-service photography | `AngelChainsawSquooshed_008.jpg`, related numbered variants | Tree-service card | Real company imagery; eligible for future pages only when project facts are verified |
| Landscaping photography | `GardenLandscaping+(2)_008.jpg`, related numbered variants | Landscaping card | Real company imagery; do not infer project location or scope from the photo |
| Credential graphics | `isamember1_004.jpg`, `certified-arborist.png` | ISA trust block | Retain while current; no third or combined credential graphic |
| Chamber graphic | `200x200-hortz-logo.jpg` | Chamber/community proof | Retain while membership is current; static image is sufficient |
| Secondary exterior images | `VerySquooshedFrontYardGrass1-1.jpg`, `VerySquooshedPurinaTower.jpg`, `VerySquooshedSideGreenwall.jpg` | Alternate-page/supporting imagery | Require factual context and permission before project-page use |

No public video files were found. The two legacy asset trees contain many byte-identical variants: 126 files represented 52 unique payloads, with roughly 17.9 MB duplicated. No asset was deleted during the audit.

## Baseline Visual Record

- Desktop homepage: `output/playwright/homepage-1440-full.png`.
- Tablet homepage: `output/playwright/homepage-1024-full.png`.
- Mobile homepage: `output/playwright/homepage-390-full.png`.
- Form and key section captures are stored alongside the full-page images.
- The desktop navigation is visible in the desktop/tablet captures. The custom mobile header is visible in the mobile capture; it has no expanded menu state.
- Batch 1 comparison captures use the `batch1-` prefix in the same directory.

## Conversion Journey

Primary path: hero → free-estimate CTA → contact form → CRM website lead.

Secondary path: header/hero/form phone links.

Strengths:

- CTA is visually dominant.
- Form asks for the core triage details and distinguishes homeowner from commercial/property management.
- Success/failure and duplicate-click behavior are already thoughtfully implemented.

Friction:

- Mobile crop/offset damages the first impression.
- Form is physically far below a long single-page journey.
- No persistent mobile action access.
- Emergency visitors receive only a short callout, not a clear safety path.
- No explicit response-time promise can be added without operational verification.

Integration notes at audit time:

- Public submissions target the CRM lead endpoint and preserve a unique submission ID.
- Source page URL, referrer, and UTM fields are collected before submission.
- Confirmed success resets the form; a real failure preserves entered values.
- The form was not ready for public photo uploads. A safe implementation would require authenticated or signed storage, content/type limits, retention rules, and CRM attachment handling.
- Residential and commercial/property-management request types already existed, but commercial intake had limited tailored context.
- Referral-source capture beyond UTMs/referrer was not exposed as a customer field and should remain optional if added.

## Trust Claim Classification

| Claim | Current evidence | Treatment |
| --- | --- | --- |
| ISA Certified Arborist | Existing badge and approved site copy | Keep; verify active status operationally before future expansions |
| ISA Member | Existing badge | Keep while membership is current |
| 30+ years of experience | Existing approved copy | Keep; phrase as industry experience |
| Local/family treatment | Existing “part of the family” language | Keep as tone; do not upgrade to “family-owned” without proof |
| Chamber membership | Existing Chamber logo/widget | Keep while membership is current |
| TRAQ | Not earned | Remove everywhere; do not qualify as pending |
| Licensed/insured | Not evidenced in repository | Do not add until owner supplies exact wording/evidence |
| Ratings/review count | No maintained source in repository | Do not add/hardcode |
| 24/7 emergency response | Not verified | Do not claim |

## Recommended Proof Hierarchy

1. Active ISA Certified Arborist and ISA membership statements, reviewed for currency.
2. Real local project photography with verified scope, general location, and customer permission.
3. Specific property-protection, cleanup, written-proposal, approval, and communication practices confirmed by operations.
4. Maintained customer reviews linked to a verifiable source rather than hard-coded counts.
5. Commercial documentation and certificate-of-insurance process only after exact workflow wording is approved.
6. Real crew and equipment photography with captions that describe only what is known.

## Missing Proof and Content Assets

- Approved before/during/after sets with project facts and privacy permission.
- Maintained review source, approved quotations, service performed, and general location.
- Exact operating wording for cleanup, hauling, stump chips, property protection, and recurring maintenance.
- Current documentation for insurance, workers’ compensation, licensing, emergency availability, financing, and guarantees before any public claim.
- Team/business-history copy sufficient to support “family operated” or “locally operated” as factual claims.
- Service-specific facts for stump grinding, equipment use, commercial workflows, and educational review attribution.

## Audit Completion Summary

- TRAQ removed from the mobile and desktop trust copy and associated styling; public-source scans return no matches.
- Current public inventory: one canonical homepage plus two `noindex` alternates and one `noindex` admin placeholder.
- Strongest design elements: real green photography, centered editorial hero, white organic dividers, Poppins typography, wide pill CTA, circular service images, and restrained ISA proof.
- Top technical SEO baseline problems: missing crawl files, stale social/structured-data assets, no deeper service architecture, and heavy exported runtime.
- Top conversion baseline problems: mobile overflow, long path to contact, no persistent mobile actions, weak emergency routing, and limited urgency/contact context.
- Recommended first batch: crawl/metadata normalization, responsive correction, verified proof, concise process/emergency guidance, safer form context, analytics, and hero optimization.
- Expected first-batch files: `index.html`, `overrides.css`, `ats-form-enhancements.js`, `apps/platform/src/lib/leads/intake.ts`, optimized hero assets, `robots.txt`, and `sitemap.xml`.

## Post-Audit Batch 1 Status

Batch 1 subsequently implemented the recommended foundation locally. The exact changes and checks are recorded in `BATCH_1_IMPLEMENTATION_REPORT.md`. Deployment, production TRAQ verification, one controlled CRM lead, and Search Console submission remain pending approval and release.

## Recommended Follow-Up Commands

- `$adapt` for responsive hero consolidation and mobile overflow.
- `$optimize` for measured LCP/runtime reduction.
- `$harden` for end-to-end form and emergency-path resilience.
- `$polish` after new service/project pages exist.
