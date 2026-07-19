# Public Trust and Recognition Report

## Scope

This pass improves the static public website only. It does not modify `apps/platform`, deployment settings, DNS, lead delivery, or the public site's structured business data.

Pages and shared surfaces changed:

- Homepage hero credential card, immediate recognition strip, deeper review proof, testimonial, estimate-form trust line, and footer links
- `/recognition/`
- Generated service-page heroes and tree-removal testimonial
- `/credentials-safety/`
- `/services/commercial-hoa-tree-care/`
- Generated-page footer and final calls to action

## Trust Hierarchy

The operational trust line is:

> Certified Arborist-led · Insured · 30+ years of tree-industry experience

The homepage retains its professional credential card with the existing ISA Member and ISA Certified Arborist marks. Supporting copy identifies Angel Tree Services as family-operated and serving the Fredericksburg region since 2015. Certified Arborist wording remains singular. Because active policy types were not confirmed for publication, insurance wording is limited to `Insured` and certificates being available upon request.

The approved homepage order is hero, estimate action, ISA credential card, immediate Best of the Burg/Google/NBC4 recognition, services, then deeper Angi/BBB proof and a customer testimonial.

## Review Proof

Metrics were verified on July 19, 2026 and remain separated by platform:

| Platform | Public presentation | Public source |
| --- | --- | --- |
| Google | `120+ reviews · 4.9 average` | Place ID `ChIJkTtDRfXAtokRlO24zHOF67o` |
| Angi | `44 customer reviews · 5.0 rating` | Public Angel Tree Services profile |
| Better Business Bureau | `A+ BBB rating · Not BBB Accredited` | Public Angel Tree Services profile |

Google's signed-out view confirmed the live `4.9` rating but did not expose the count. The owner-supplied July 17 snapshot showed `123`, so the public site retains the durable `120+` wording.

## Selected Excerpts

The current exact brief excerpts include:

1. **Mark Mayer · Google Review · July 2026**
   “I was pleased with the quote... and then thrilled with the fantastic job the crew did in every respect... We will use them again, and have already referred them to others!”
2. **donnysmooth · Google Review · 2026**
   “Some [trees] in between houses... required all sorts of ropes, pulleys and bucket trucks to bring down safely while not damaging anyone’s property.”
3. **Kathleen Humphries · Google Review · 2026**
   “Saul was extremely knowledgeable... assessed the health of our trees and offered guidance for future work.”
4. **K P · Google Review · Updated July 2026**
   “2nd 5 star review from me... They literally left no ‘tree/leaf crumbs.’ Would hire again!”
5. **Tim S. · Google Review · 2023**
   “I’ve had several very large trees taken down which were immediately adjacent to our house, and everything went perfectly.”
6. **Carolyn K. · Angi · 2024**
   “They did a great job and left the work site very clean... I’ll be using Angel Tree Service for all my tree work.”
7. **Anne L. · Angi · 2023**
   “I have used this company twice and was so pleased. They respond promptly and definitely knows the business well.”
8. **JOHN P. · Angi · 2019**
   “They brought the tree down (piece by piece) without any problems or damage to bushes and shrubs located near it...”

The homepage features Mark Mayer. The Commercial/HOA page uses donnysmooth, Credentials and Safety uses Kathleen Humphries, and Recognition opens with K P. Tim S. remains on Recognition; the tree-removal page uses JOHN P. because that excerpt explicitly describes removal. The July 2026 Google excerpts come from owner-supplied screenshots and link to the verified public Google profile.

## Immediate Homepage Rendering

The ISA credential card is present in the original homepage HTML immediately below the estimate action. Its existing images are `angeltreeservices_backup_files/isamember1_004.jpg` and `angeltreeservices_backup_files/certified-arborist.png`, with explicit dimensions and no lazy-loading attribute. No JavaScript injects, reveals, or replaces the card. The prior first-visit gap was caused by lazy image loading, not by missing markup or a JavaScript visibility toggle.

## Recognition and Community

The page retains exact, restrained claims:

- `Best of the Burg 2026 Finalist` in Best Tree Trim/Removal Services
- `Previously recognized with Angi’s Super Service Award`, clearly labeled historical
- `Featured by NBC4`, with the coverage described as reporting rather than endorsement
- Membership in the Fredericksburg Regional Chamber of Commerce and Fredericksburg Area Builders Association
- Wood-chip donations to Tree Fredericksburg and material reuse through ChipDrop

No organization is described as endorsing, certifying, or approving Angel Tree Services.

## Profile Limitations

- **BBB:** The profile displays an A+ rating and states that the business is not BBB Accredited. No BBB seal is used.
- **Yelp:** The supplied URL is an owner-management URL. A correct public customer listing was not confidently verified, so Yelp is intentionally omitted.
- **Facebook and Apple Maps:** Public business listings were not confidently verified, so they are not linked in this release.

## Structured Data and Privacy

No `AggregateRating` or `Review` structured data was added. Ratings remain visible editorial content with direct third-party links. No review widgets, live scraping, new trackers, platform logos, or heavy third-party scripts were added.

## Maintenance

Changeable proof is centralized in `public-trust-data.json`. Before a release:

1. Reverify Google, Angi, and BBB directly.
2. Update `lastVerifiedAt`, metrics, excerpts, source labels, and public URLs in the data file.
3. Update homepage copy if a durable threshold or rating changes.
4. Update `PUBLIC_RECOGNITION_SOURCES.md` and validator invariants in the same change.
5. Run `npm run test:public`, responsive browser checks, accessibility checks, and `git diff --check`.

## Validation Evidence

Responsive screenshots are stored under `output/playwright/public-trust/`:

- `homepage-desktop.png`
- `homepage-mobile.png`
- `recognition-desktop.png`
- `recognition-mobile.png`

The hierarchy-correction screenshots are stored under `output/playwright/public-trust-restoration/`:

- `homepage-hero-recognition-desktop.png`
- `homepage-review-desktop.png`
- `homepage-hero-mobile.png`
- `homepage-recognition-mobile.png`
- `homepage-review-mobile.png`
- `homepage-restored-desktop.png`
- `homepage-restored-mobile.png`

The July 19 first-paint correction screenshots are stored under `output/playwright/public-trust-first-paint/`:

- `desktop-1536x864.png`, `desktop-1440x900.png`, and `desktop-1366x768.png`
- `mobile-430x932.png`, `mobile-390x844.png`, and `mobile-375x812.png`
- `phase-initial-html-1440x900.png`, `phase-domcontentloaded-1440x900.png`, and `phase-network-idle-1440x900.png`
- `javascript-disabled-1440x900.png` and `javascript-disabled-390x844.png`
- Contextual review captures for Mark Mayer, donnysmooth, Kathleen Humphries, and K P

Validation results:

- `npm run test:public`: passed, with 11 approved pages generated and validated
- Throttled initial-render checks: estimate action, static credential card, both ISA images, and immediate recognition were present by `DOMContentLoaded`; measured cumulative layout shift was `0.084`
- JavaScript-disabled checks: credential card visible at 1440 × 900 and 390 × 844, with no horizontal overflow at the mobile viewport
- Required homepage screenshots: passed at 1536 × 864, 1440 × 900, 1366 × 768, 430 × 932, 390 × 844, and 375 × 812
- Responsive matrix: 55 route/viewport checks passed across all 11 pages at 1440, 1024, 768, 390, and 320 pixels; no horizontal overflow or H1 errors
- Recognition semantics: five blockquotes, including Tim S.'s Google-labeled 2023 review; each has a cite and descriptive source link
- Latest hierarchy-correction Lighthouse homepage: Accessibility 100, Best Practices 96, SEO 100, Performance 34
- Latest hierarchy-correction Lighthouse recognition page: Accessibility 100, Best Practices 100, SEO 100, Performance 98
- External source check: Google, NBC4, Chamber, FABA, and ChipDrop returned `200`; Angi, BBB, and Tree Fredericksburg rejected command-line requests with `403` but were verified in a browser; the Best of the Burg redirect timed out in the command-line pass but had already been verified interactively
- `git diff --check`: passed

The homepage performance result is dominated by the inherited Squarespace runtime and roughly 7 MB legacy payload. This pass adds no third-party script or widget; the generated recognition page demonstrates the lightweight implementation. No production deployment was performed.
