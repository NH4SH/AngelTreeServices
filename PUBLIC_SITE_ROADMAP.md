# Angel Tree Services Public Site Roadmap

## Principles

- Preserve the current visual identity.
- Fix trust, conversion, crawlability, and responsive correctness before adding volume.
- Prefer static, maintainable pages over a framework migration.
- Publish only verified claims and real project material.
- Measure before removing Squarespace-port dependencies.

## Ranked Implementation Matrix

| Rank | Work item | Expected impact | Change risk | Assets/content needed | CRM/data impact | Visual effect | Dependency |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | Deploy and verify TRAQ removal | Critical credential accuracy | Low | None | None | None | Approved production release |
| P0 | Production-test website lead intake | Prevent lost or falsely failed leads | Medium | Controlled test lead | Verify one CRM record, notification status, attribution | None | Public site and platform deployed together |
| P1 | Crawl and metadata foundation | Reliable indexing and sharing | Low | Maintained social image | None | None | Canonical production domain |
| P1 | Responsive and overflow corrections | Better mobile conversion and accessibility | Medium | Existing assets | None | Preserve current design | Three-width visual approval |
| P1 | Process and emergency guidance | Faster homeowner comprehension and safer urgent routing | Low | Verified operating language | Preferred-contact and hazard fields | Adds restrained content and organic divider | Visual approval |
| P1 | Image delivery improvements | Faster hero rendering | Low | Responsive WebP derivatives | None | No intentional visual change | Baseline comparison |
| P2 | Services hub and first service pages | High-intent discovery and conversion | Medium | Confirmed scope, real photos, FAQs | Reuse existing lead source fields | New pages in current system | Operational/service approval |
| P2 | Credentials and safety page | Stronger trust validation | Low | Active credential evidence | None | Restrained trust layout | Claim register |
| P2 | First verified project | Highest-quality proof asset | Medium | Approved facts, photos, permissions | Optional project-source attribution | Image-led feature and page | Completed project intake |
| P2 | Regional service-area page | Local relevance without doorway pages | Low | Confirmed coverage and local proof | Optional location attribution | Current card/editorial patterns | Coverage approval |
| P2 | Consolidate hero/runtime dependencies | Maintainability and performance | High | Complete visual baselines | None | Must remain visually equivalent | Stable approved homepage |
| P3 | Commercial/HOA service depth | Better property-manager conversion | Medium | Verified service capabilities and proof | Additional organization/property context if useful | Homeowner system with denser detail | Commercial workflow approval |
| P3 | Learning center | Sustainable informational discovery | Low per page | Reviewed expert content and media | Content attribution only | Quieter editorial pattern | Editorial cadence |
| P3 | Review-proof system | Stronger third-party trust | Medium | Approved source and update owner | Optional review-source metadata | Small proof modules | Reliable maintainable review source |

Risk labels describe regression or claim risk, not implementation effort. Any credential, licensing, insurance, availability, review-count, or customer claim remains blocked until evidence and owner approval are recorded.

## P0 — Credential and Lead Safety

- [x] Remove TRAQ references from local public source.
- [ ] Deploy the corrected source and verify the production HTML no longer contains TRAQ.
- [x] Save website leads before attempting secondary notifications.
- [x] Treat successful `2xx` responses safely on the frontend.
- [x] Preserve submission IDs, UTM fields, page URL, referrer, honeypot handling, and duplicate-click protection.
- [ ] Complete production smoke testing with a controlled test lead and verify one CRM record.

## P1 — Batch 1 Foundations

- [x] Add valid `robots.txt` and canonical `sitemap.xml`.
- [x] Normalize canonical, Open Graph, and structured-data URLs.
- [x] Replace stale Squarespace social-image references with maintained HTTPS assets.
- [x] Correct responsive overflow at 1024px and the left-shifted 390px hero.
- [x] Add restrained verified proof without adding a badge wall.
- [x] Add a concise homeowner-facing process section.
- [x] Add a calm emergency/hazard pathway and power-line safety warning.
- [x] Add preferred contact and hazard context to the existing form/CRM intake.
- [x] Add privacy-conscious conversion events to the existing analytics instance.
- [x] Add restrained mobile Call / Free Estimate access that does not cover content.
- [x] Improve image sizing/loading without visible quality loss.
- [x] Publish `BATCH_1_IMPLEMENTATION_REPORT.md` and complete local validation.

## P2 — Content Depth and Performance

- [x] Create a reusable static-page system and services hub.
- [x] Publish tree removal, tree pruning, stump grinding, emergency tree service, and commercial/HOA tree care pages.
- [x] Publish a verified credentials and safety page.
- [x] Publish a project-library index using real imagery without inferred case-study facts.
- [ ] Collect and publish one verified featured project with approved media/facts.
- [ ] Add a useful regional service-area page.
- [ ] Consolidate the duplicate mobile/desktop hero into one responsive source of truth.
- [ ] Select one canonical asset directory and remove duplicate payloads in a controlled migration.
- [ ] Remove verified-unused Squarespace runtime/CSS only after baseline comparison.
- [ ] Generate modern responsive image derivatives while preserving originals.
- [ ] Establish a maintainable review-proof source.

## P3 — Ongoing Growth

- [ ] Add additional service pages based on actual demand and operations.
- [ ] Grow the project library with approved project facts, privacy-safe locations, and media permission.
- [ ] Add unique location content only when local proof supports it.
- [ ] Review credentials, memberships, contact details, structured data, and claims quarterly.
- [ ] Review Core Web Vitals and conversion events after meaningful releases.
- [ ] Reconsider secure private photo upload only with a production-ready authenticated/signing flow.

## Batch Definition of Done

- No TRAQ reference in source or deployed public markup.
- Canonical/crawl files validate.
- No horizontal overflow at the three reference widths.
- Call and estimate actions are keyboard- and touch-accessible.
- Form creates one attributed CRM website lead per submission ID.
- Failure preserves customer input; confirmed success resets it.
- No new customer PII enters analytics.
- Visual baselines remain recognizably Angel Tree Services.
- `git diff --check` passes.
