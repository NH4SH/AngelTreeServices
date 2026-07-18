# Homepage SEO Quality Pass Report

## Scope

This pass improves homepage navigation, semantic quality, icon branding, and restrained performance details without redesigning the approved hero or deploying the site.

## Navigation

The earlier public-page order was `Services`, `Projects`, `Commercial`, `About`. The final owner-approved desktop order is:

1. About
2. Services
3. Projects
4. Commercial

Instagram and `Call Us!` remain the right-side actions. The logo and business name remain the Home link; no separate Home label was added.

The expanded mobile order is `About`, `Services`, `Projects`, `Commercial & HOA`, `Credentials & Safety`, `Reviews & Recognition`, and `Contact`. Persistent mobile actions remain `Call now` and `Free estimate`.

The order is defined in the shared page generator and enforced by the release validator. The existing privacy-conscious analytics pattern now records `navigation_link_click` with a non-PII destination key and desktop/mobile location, allowing future order decisions to use actual click behavior.

## Search Alignment

- Title preserved: `Tree Service in Fredericksburg, VA | Angel Tree Services`
- Sole H1 preserved: `Your yard’s best friend.`
- Visible eyebrow preserved: `Fredericksburg Tree Service`
- Canonical preserved: `https://angeltreeservices.org/`

Previous meta description:

> Certified-arborist-led tree care in Fredericksburg, including tree removal, pruning, stump grinding, storm cleanup, landscaping, and lawn care. Request a free estimate.

New meta description:

> Certified-arborist-led tree service in Fredericksburg for removal, pruning, storm cleanup, stump grinding, landscaping, and lawn care. Free estimates.

The new description is used consistently for the standard, Open Graph, Twitter, itemprop, and homepage LocalBusiness description fields without duplicating the full visible hero paragraph.

## Duplicate Content

The repeated hero copy came from parallel custom-mobile and legacy Squarespace desktop hero DOM trees. The homepage now has one semantic responsive hero containing one eyebrow, one H1, one supporting paragraph, one CTA, and one credential block. The hidden legacy background-FX image markup was also removed; the hero remains a CSS background.

The approved desktop and mobile composition is preserved through responsive CSS rather than duplicate accessible content. Static generation remains deterministic.

## Image Alternatives

Before this pass, every homepage image already had an explicit `alt` attribute. The scanner's two likely findings were two intentional empty alternatives:

- The mobile brand logo used `alt=""` because adjacent accessible text already says `Angel Tree Services`; that decorative/redundant treatment remains correct.
- A hidden legacy hero background-FX image used `alt=""`; the redundant image element was removed with the duplicate legacy hero/background markup.

Informative service, ISA, Chamber, and header logo images retain concise alternatives. No keyword text was added to decorative images.

## Brand Assets

Two explicit logo roles are now used:

- In-site layout mark: `/assets/angel-tree-logo-transparent.webp` (512×512, transparent yellow-halo logo)
- Search/icon badge: `/assets/angel-tree-logo-square.webp` (512×512, green-background square logo)

The square badge supplies:

- `/assets/favicon-32.png`
- `/assets/favicon-192.png`
- `/assets/apple-touch-icon.png` (180×180)
- the homepage LocalBusiness `logo` ImageObject

The transparent mark supplies homepage and generated-page header branding. Header CSS controls the displayed size and does not depend on the source image's intrinsic dimensions. The green square is not used as a layout/header replacement.

## Emphasis Audit

Homepage `<strong>` elements decreased from 19 to 15 when the duplicate hero was removed; no `<b>` elements are present. The remaining strong elements communicate genuine sentence importance, review proof, process step names, or contact emphasis. The shared hero retains four deliberate emphasis points and does not bold the whole paragraph.

## Internal Links

Navigation destinations now consistently resolve to the canonical About page, service hub, verified project library, and Commercial & HOA page. Existing clear CTA and navigation labels were retained rather than awkwardly varied. The homepage contains no nearby vague `Learn more`, `Click here`, or generic `Read more` links requiring replacement.

## Performance Review

- Desktop hero WebP: approximately 240 KB at 1600 px.
- Mobile hero WebP: approximately 94 KB at 900 px.
- ISA marks: approximately 15–36 KB each.
- Transparent header logo: approximately 17 KB, replacing the prior 279 KB layout source.
- Square search/logo source: approximately 37 KB.
- Apple touch icon: approximately 30 KB.
- Font-face declarations now use `font-display: swap` in both bundled font stylesheets.
- The duplicate hidden hero image and duplicate hero DOM were removed.
- The above-the-fold hero remains an immediate CSS background rather than being lazy-loaded.
- Below-the-fold image behavior and existing intrinsic dimensions were preserved where already appropriate.

The remaining Squarespace-export runtime is legacy overhead. It was not broadly removed during this restrained pass because that would be a higher-risk rewrite unrelated to the approved visual change. Local browser console warnings from legacy Squarespace modules are documented as remnants, not newly introduced failures.

## Validation

The production-style artifact is validated for approved routes, metadata, exactly one H1, JSON-LD parsing, internal references, form labels, canonical URLs, navigation order, mobile order, icon presence/dimensions, sitemap/robots, private-file exclusions, and prohibited credential claims.

Responsive previews cover 1440, 1024, 430, 390, 375, and 320 pixels. Browser inspection confirms the approved H1 hierarchy and mobile menu order. Lighthouse was not treated as an absolute requirement for a local static preview; production-artifact validation and real-browser responsive/layout checks provide the equivalent release evidence for this pass.

## Intentionally Unchanged

- Approved hero image, CTA, credentials, wave treatment, typography, and overall visual identity
- Recognition structured-data decisions
- No AggregateRating or copied Review schema
- No unsupported memberships, partnerships, awards, or credentials
- No stock imagery
- No third-party analytics provider
- No automatic outreach or backlink creation
- No deployment

## Off-Page Work

Legitimate follow-up opportunities are documented separately in `LOCAL_OFF_PAGE_SEO_ACTION_PLAN.md`. They prioritize established local relationships and the canonical HTTPS domain while excluding bulk backlink and directory-spam tactics.

## Preview Locations

Responsive review images are stored under `output/playwright/homepage-seo-quality/` and are intentionally excluded from the deployable `dist-public/` artifact.

## Deployment And Rollback

No deployment was performed. After visual approval, run `npm run test:public`, review `git diff --check`, commit the approved source changes, and use the normal controlled Netlify release process. Rollback is the prior Git commit; generated files should always be recreated from the source generator rather than edited directly.

