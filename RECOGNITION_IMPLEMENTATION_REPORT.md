# Reviews, Recognition, and Media Implementation Report

## Summary

This local, undeployed implementation adds a permanent `/recognition/` page and a restrained homepage trust section. It brings together three different forms of third-party credibility without presenting them as interchangeable endorsements:

- Google customer review proof.
- 2026 Best of the Burg finalist recognition.
- NBC4 Responds media coverage.

A focused secondary layer now adds verified professional affiliations, community wood-chip support, and responsible material reuse. It remains visually and semantically subordinate to the three primary trust signals.

The work preserves the existing Poppins typography, green/cream/white palette, organic wave transitions, editorial spacing, rounded actions, and responsive static-page system.

## Verified Public Wording

- Google: `4.9 stars from 120+ Google reviews`.
- Best of the Burg: `Angel Tree Services was named a 2026 Best of the Burg finalist in the Best Tree Trim/Removal Services category.`
- NBC4: coverage of the September 19, 2024 Google Business Profile issue and reinstatement, described explicitly as coverage rather than an endorsement.
- Chamber: `Member of the Fredericksburg Regional Chamber of Commerce`.
- FABA: `Member of the Fredericksburg Area Builders Association`.
- Tree Fredericksburg: `Angel Tree Services regularly donates arborist wood chips to Tree Fredericksburg, helping support local tree planting and urban forestry efforts.`
- ChipDrop: `Angel Tree Services also uses ChipDrop to connect reusable arborist wood chips with local gardeners and other nearby recipients.`

The Google profile displayed a `4.9` rating during the July 17, 2026 verification pass. The owner-supplied external snapshot reported `123` reviews on the same date, so the site uses the durable `120+` threshold. Exact source details and maintenance ownership are recorded in `PUBLIC_RECOGNITION_SOURCES.md`.

The Chamber and FABA directories were also verified July 17, 2026. Both show the exact business name `Angel Tree Services LLC`, with the company phone number and public website. The organization names were cross-checked against their official sites before the approved membership wording was used.

## Claims Intentionally Withheld

- No individual Google quotations or reviewer names are published because the limited public view did not provide stable, attributable review links.
- No Google endorsement, perfect rating, number-one ranking, or recommendation claim is made.
- No Best of the Burg winner or award-winner claim is made.
- No NBC4 recommendation, ranking, workmanship validation, or award claim is made.
- No official finalist artwork is used because usage permission was not established.
- No self-serving `AggregateRating` or `Review` structured data is added.
- No affiliation is presented as an award, certification, preferred-contractor status, workmanship approval, or endorsement.
- No Tree Fredericksburg or ChipDrop partnership, sponsorship, endorsement, exclusive-provider status, private recipient detail, or undocumented quantity is published.
- No referral-count claim is published or investigated.
- No organization logo is used because public usage permission was not established.

## Page and Homepage Changes

The generated `/recognition/` page includes:

1. A centered editorial hero with the existing white-stroked wave.
2. A Google review-proof section with written numerical context and a direct official-profile link.
3. A Best of the Burg section with the exact year, status, and category.
4. An NBC4 section with factual context, official article/video links, and a click-to-load official YouTube video.
5. A quieter editorial section for professional affiliations, Tree Fredericksburg support, and ChipDrop material reuse.
6. Internal links to Services, Credentials and Safety, Projects, and the shared Free Estimate flow.

The homepage keeps its quiet three-column primary trust row and adds only one smaller linked community sentence beneath it. The Credentials and Safety page adds a restrained Professional Affiliations subsection with direct member-page links and points to the fuller Recognition narrative.

## Structured Data

The existing homepage `LocalBusiness` entity at `https://angeltreeservices.org/#business` now includes:

- `award` with qualified 2026 finalist wording and the exact category.
- `subjectOf` references for the official NBC4 `NewsArticle` and official NBC4 Washington YouTube `VideoObject`.

The Recognition page emits one `WebPage` and one `BreadcrumbList`, with the page linked to the existing business entity through `about`. It does not create a duplicate `LocalBusiness` entity.

No `memberOf` relationship was added. Visible official-directory links provide clear entity association without introducing additional organization entities or changing the existing structured-data graph. Tree Fredericksburg and ChipDrop were not added to `sameAs` or represented as business relationships in JSON-LD.

## Video Performance and Accessibility

- Initial HTML contains a responsive 16:9 thumbnail and native button, not an iframe.
- The official privacy-enhanced `youtube-nocookie.com` iframe is created only after a click or keyboard activation.
- Autoplay is not requested or allowed.
- Intrinsic image dimensions and a fixed aspect ratio prevent layout shift.
- A normal official YouTube link remains available in the source list and in the `noscript` fallback.
- The button has a descriptive accessible name and the rating is stated in text rather than conveyed by stars alone.

## Files Changed for This Layer

- `index.html`
- `overrides.css`
- `site-pages.css`
- `site-pages.js`
- `scripts/build-public-pages.py`
- `scripts/validate-public-site.py`
- `PUBLIC_RECOGNITION_SOURCES.md`
- `RECOGNITION_IMPLEMENTATION_REPORT.md`
- `PUBLIC_SITE_ROADMAP.md`
- `PUBLIC_SITE_CONTENT_ARCHITECTURE.md`
- `PUBLIC_SITE_DESIGN_GUIDE.md`
- `PUBLIC_SITE_RELEASE_CHECKLIST.md`

`sitemap.xml` and `/recognition/index.html` are generated into `dist-public/` by the deterministic build and are intentionally not committed source files.

## Verification Performed

- Official source inspection for Google, Best of the Burg, NBC4 article, NBC4 video page, and official YouTube upload.
- Official-directory verification for the Fredericksburg Regional Chamber of Commerce and Fredericksburg Area Builders Association, both showing `Angel Tree Services LLC`.
- Official-site review for Tree Fredericksburg and ChipDrop, including ChipDrop's arborist and wood-chip information pages.
- Python syntax compilation for the build and validation scripts.
- JavaScript syntax checking for `site-pages.js`.
- Deterministic public build and ten-page validator pass.
- Repository-configured `netlify build --offline` pass.
- Desktop and mobile visual inspection of the Recognition page.
- Desktop and mobile visual inspection of the homepage trust row.
- Visual inspection of the Recognition community section, homepage community reference, and Credentials affiliations subsection at approximately 1440px, 1024px, and 390px.
- Fifty responsive route checks across all ten approved pages at 1440px, 1024px, 768px, 390px, and 360px, with no overflow or missing H1 failures.
- Confirmation that the initial Recognition HTML contains no iframe.
- Interaction test confirming one privacy-enhanced iframe appears after the video button is activated and has no autoplay permission.
- Clean Recognition-page console check with zero warnings or errors.
- Fresh HTTP checks returning `200` for Google, the redirected official Best of the Burg ballot, both NBC4 pages, and the official YouTube upload.
- Fresh source checks for the Chamber, FABA, Tree Fredericksburg, and ChipDrop links.

## Preview Locations

- Recognition community layer: `/recognition/#community`
- Homepage community reference: `/#ats-home-recognition-title`
- Credentials affiliations subsection: `/credentials-safety/#professional-affiliations-title`

These routes are local build previews until an approved Netlify preview is created. Nothing was deployed as part of this addendum.

## Deployment Steps

Nothing was deployed automatically.

1. Reverify the Google rating/count threshold and every official source in `PUBLIC_RECOGNITION_SOURCES.md`.
2. Run `npm run test:public`, `git diff --check`, and the full responsive route matrix.
3. Review the complete working-tree diff because release-hardening work from the controlled pre-deployment review is also pending.
4. Commit the exact approved scope and create a Netlify Deploy Preview through the repository-controlled build.
5. Complete the Recognition checks in `PUBLIC_SITE_RELEASE_CHECKLIST.md` before production approval.

## Rollback Considerations

The recognition layer is isolated to one generated route, one homepage block, shared static-page CSS/JavaScript, and qualified structured-data fields. If a source changes or the presentation regresses, remove the homepage block and Recognition page entry from the generator, remove the corresponding structured-data fields, rebuild, and publish through the normal controlled rollback path. Do not hide unsupported claims with CSS.

## Post-Deployment Smoke Checklist

- `/recognition/` returns `200` and is present once in the sitemap.
- Google, Best of the Burg, NBC4 article, NBC4 video, and official YouTube links resolve to the recorded sources.
- Chamber and FABA member links still identify `Angel Tree Services LLC`; Tree Fredericksburg and ChipDrop links resolve to the recorded official sites.
- Google wording still matches the live rating and durable count threshold.
- Finalist wording and category remain exact.
- NBC4 is described only as media coverage.
- The video facade is keyboard operable, loads only after interaction, does not autoplay, and produces no console error.
- Homepage and Recognition layouts have no horizontal overflow at 1440px, 1024px, 768px, 390px, or 360px.
- No unsupported review, award, endorsement, or credential claim appears in HTML, metadata, alt text, JSON-LD, or generated markup.
- The community section remains secondary to Google, Best of the Burg, and NBC4; no logo wall, referral count, TRAQ reference, or unsupported relationship wording appears.
