# Public Trust and Recognition Report

## Scope

This pass improves the static public website only. It does not modify `apps/platform`, deployment settings, DNS, lead delivery, or the public site's structured business data.

Pages and shared surfaces changed:

- Homepage hero, review proof, testimonial, estimate-form trust line, and footer links
- `/recognition/`
- Generated service-page heroes and tree-removal testimonial
- `/credentials-safety/`
- `/services/commercial-hoa-tree-care/`
- Generated-page footer and final calls to action

## Trust Hierarchy

The operational trust line is:

> Certified Arborist-led · Insured · 30+ years of tree-industry experience

Supporting copy identifies Angel Tree Services as family-operated and serving the Fredericksburg region since 2015. Certified Arborist wording remains singular. Because active policy types were not confirmed for publication, insurance wording is limited to `Insured` and certificates being available upon request.

## Review Proof

Metrics were verified on July 18, 2026 and remain separated by platform:

| Platform | Public presentation | Public source |
| --- | --- | --- |
| Google | `120+ reviews · 4.9 average` | Place ID `ChIJkTtDRfXAtokRlO24zHOF67o` |
| Angi | `44 customer reviews · 5.0 rating` | Public Angel Tree Services profile |
| Better Business Bureau | `A+ BBB rating · Not BBB Accredited` | Public Angel Tree Services profile |

Google's signed-out view confirmed the live `4.9` rating but did not expose the count. The owner-supplied July 17 snapshot showed `123`, so the public site retains the durable `120+` wording.

## Selected Excerpts

The exact brief excerpts used are:

1. **Tim S. · Google Review · 2023**  
   “I’ve had several very large trees taken down which were immediately adjacent to our house, and everything went perfectly.”
2. **Carolyn K. · Angi · 2024**  
   “They did a great job and left the work site very clean... I’ll be using Angel Tree Service for all my tree work.”
3. **Anne L. · Angi · 2023**  
   “I have used this company twice and was so pleased. They respond promptly and definitely knows the business well.”
4. **Louis F. · Angi · 2020**  
   “No damage to lots of delicate flowers and shrubs directly under the trees... they left the yard and my driveway cleaner than when they came.”
5. **JOHN P. · Angi · 2019**  
   “They brought the tree down (piece by piece) without any problems or damage to bushes and shrubs located near it...”

Tim S. is labeled `Google Review` on the Angi source page and is therefore attributed to Google. The other four are attributed to Angi. The homepage uses Tim S.; the recognition page uses four Angi excerpts; the tree-removal page uses JOHN P. because that excerpt explicitly describes removal.

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

Validation results:

- `npm run test:public`: passed, with 11 approved pages generated and validated
- Responsive matrix: 55 route/viewport checks passed across all 11 pages at 1440, 1024, 768, 390, and 320 pixels; no horizontal overflow or H1 errors
- Recognition semantics: four blockquotes, each with a cite and descriptive source link; all 21 external links use `noopener noreferrer`
- Lighthouse homepage: Accessibility 100, Best Practices 96, SEO 100, Performance 45
- Lighthouse recognition page: Accessibility 100, Best Practices 100, SEO 100, Performance 99
- External source check: Google, NBC4, Chamber, FABA, and ChipDrop returned `200`; Angi, BBB, and Tree Fredericksburg rejected command-line requests with `403` but were verified in a browser; the Best of the Burg redirect timed out in the command-line pass but had already been verified interactively
- `git diff --check`: passed

The homepage performance result is dominated by the inherited Squarespace runtime and roughly 7 MB legacy payload. This pass adds no third-party script or widget; the generated recognition page demonstrates the lightweight implementation. No production deployment was performed.
