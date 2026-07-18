# Public Website Batch 1 Implementation Report

## Status

Batch 1 was visually approved and is part of the current production baseline. The production site was serving commit `73358a371d221d81770467bd49f2b9f3a3fc33ad` when the controlled release review was performed on July 17, 2026.

The deterministic build, validation, and repository-controlled Netlify configuration added during the release review remain local pending explicit deployment approval. Batch 2 routes now exist and are documented separately in `BATCH_2_IMPLEMENTATION_REPORT.md`.

## Implemented

### Crawl and metadata

- Added a production `robots.txt` that allows crawling and points to the canonical sitemap.
- Added a valid homepage-only `sitemap.xml`.
- Normalized the homepage canonical URL to `https://angeltreeservices.org/`.
- Replaced stale social-image references with a maintained first-party hero image URL.
- Added unique, service-oriented title, meta description, Open Graph, and Twitter metadata.
- Consolidated homepage structured data into one `WebSite` and `LocalBusiness` graph using a consistent business entity identifier.
- Kept unsupported address, hours, reviews, licensing, insurance, and credential details out of structured data.

### Trust and customer guidance

- Kept the existing ISA Member and ISA Certified Arborist badges unchanged.
- Added the verified statement `30+ years of industry experience` beneath the existing certification heading.
- Added a concise six-step homeowner process: request, property visit, proposal, approval/scheduling, work/cleanup, and follow-up.
- Added a calm storm-damage and immediate-hazard pathway with explicit power-line safety guidance.
- Deferred a featured project rather than publishing unverified facts or inferred project details.

### Estimate flow and CRM context

- Added an optional preferred-contact selector: no preference, call, text, or email.
- Added an immediate-hazard checkbox.
- Hazard submissions are marked urgent in CRM intake and recorded in internal notes/activity metadata.
- Existing lead attribution remains intact: source page, referrer, UTM parameters, submission ID, and request fingerprint.
- Existing duplicate-click protection and idempotent submission behavior remain intact.
- A saved lead still returns customer-facing success if an office notification fails afterward.

### Conversion access and analytics

- Added a restrained mobile `Call now` / `Free estimate` action bar.
- The action bar hides when the contact section enters view so it does not cover the form.
- Added privacy-conscious events to the existing Google Analytics instance:
  - `phone_link_click`
  - `estimate_cta_click`
  - `emergency_cta_click`
  - `service_link_click`
  - `estimate_form_started`
  - `estimate_form_submitted`
  - `estimate_form_failed`
- No customer-entered names, phone numbers, email addresses, addresses, or project details are sent in these events.

### Responsive and performance work

- Fixed the 390px hero left shift by removing the hidden desktop content column from mobile layout flow.
- Fixed the 1024px hero overflow by reducing the responsive headline scaling rate.
- Confirmed no horizontal document overflow at 1440px, 1024px, or 390px.
- Replaced the 871 KB hero source used for rendering with responsive WebP derivatives:
  - desktop: approximately 240 KB
  - mobile: approximately 94 KB
- Preserved the original image for social metadata and rollback.
- Removed the missing Squarespace performance-script request, unused Squarespace extension script, and failing Chamber widget runtime while preserving its static visible membership content.
- Replaced the exported fixed-row contact grid with natural document flow, removing the large empty green region below the form.

## Files Changed for Batch 1

- `index.html`
- `overrides.css`
- `ats-form-enhancements.js`
- `apps/platform/src/lib/leads/intake.ts`
- `assets/hero-grass-1600.webp`
- `assets/hero-grass-900.webp`
- `robots.txt`
- `sitemap.xml`
- `PUBLIC_SITE_AUDIT.md`
- `PUBLIC_SITE_CONTENT_ARCHITECTURE.md`
- `PUBLIC_SITE_DESIGN_GUIDE.md`
- `PUBLIC_SITE_ROADMAP.md`
- `BATCH_1_IMPLEMENTATION_REPORT.md`

The worktree also contains earlier CRM lead-intake work documented separately. Those changes were preserved and not reverted.

## Verification Completed

### Responsive visual review

- 1440px: no horizontal overflow; homepage remains recognizably Angel Tree Services.
- 1024px: document width equals viewport width; headline fits within the viewport.
- 390px: document width equals viewport width; mobile hero starts at `x = 0` and is exactly viewport width.
- The Batch 1 guidance block now exits through a full-width organic SVG divider that reuses the site's cream/green wave language instead of ending as a rectangular insert.
- Screenshots are stored under `output/playwright/` for local review.

### Form behavior

- `201` JSON success: exact success message shown and fields reset.
- Empty `202` response: safely treated as success with the default success message.
- Explicit `{ ok: false }` / `503`: error shown and customer input preserved.
- Two immediate submit attempts: exactly one fetch request sent.
- Notification failure after CRM save: route catches and logs the notification error, records failed notification status, and still returns successful lead receipt.

### Code and content checks

- `npm run typecheck` in `apps/platform`: passed.
- `npm run build` in `apps/platform`: passed; all 43 static/dynamic routes completed.
- `node --check ats-form-enhancements.js`: passed.
- JSON-LD parse: passed.
- `robots.txt` and `sitemap.xml` parse/check: passed.
- Local HTML asset/link reference check: zero missing references.
- `git diff --check`: passed.
- Public HTML/CSS/JavaScript/JSON/XML TRAQ scan: zero matches.
- Lighthouse SEO: 100.
- Lighthouse accessibility after the final contrast correction: 100.

## Known Legacy Constraints

- The homepage still carries a substantial Squarespace-derived runtime and CSS payload. Removing it wholesale is intentionally deferred because the current header, section geometry, and animations still depend on portions of it.
- Local static-server testing still reports legacy Squarespace cookie/census errors that are unrelated to the Batch 1 code. The new missing performance script, extension-script, and Chamber widget errors were removed.
- The mobile and desktop hero still use parallel markup. Consolidation remains a controlled later task because prior changes to this area caused visible regressions.
- The July 17, 2026 production-source scan found no public TRAQ reference across the homepage, all eight generated routes, `sitemap.xml`, or `robots.txt`.

## Deferred for Missing Verified Material

- Featured project: needs approved photos and factual project details.
- Project result claims, species names, equipment details, exact locations, and customer quotations: not published without verification.
- Licensing, insurance, workers' compensation, family-owned, 24/7 availability, review counts, and partner/customer claims: not added without evidence and approval.

## Deployment and Production Smoke Checklist

1. Review local screenshots at 1440px, 1024px, and 390px and approve Batch 1 visually.
2. Deploy the static public site and CRM application through their existing release paths.
3. Confirm `https://angeltreeservices.org/robots.txt` returns `200`.
4. Confirm `https://angeltreeservices.org/sitemap.xml` returns `200` and contains only the canonical homepage.
5. Inspect production HTML and metadata for canonical URLs, JSON-LD, social image, and absence of TRAQ.
6. Submit one controlled test lead from production.
7. Verify exactly one CRM lead, correct page/referrer/UTM metadata, preferred contact, and hazard state.
8. Verify success remains visible if a notification channel is deliberately unavailable in a controlled environment.
9. Verify Call, Free Estimate, emergency, service, form-start, success, and failure events in analytics debug/realtime tooling without PII.
10. Submit the sitemap in Google Search Console after production verification.

## Rollback

- Restore the prior versions of `index.html`, `overrides.css`, and `ats-form-enhancements.js` together to avoid layout or behavior drift.
- Restore the previous `apps/platform/src/lib/leads/intake.ts` only with the matching public form version.
- The original hero JPEG remains in place and can replace the WebP background URLs without changing metadata.
- Remove `robots.txt` and `sitemap.xml` only if the release is rolled back before Search Console submission.
