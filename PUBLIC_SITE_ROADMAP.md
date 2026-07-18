# Angel Tree Services Public Site Roadmap

## Principles

- Preserve the current visual identity.
- Fix trust, conversion, crawlability, and responsive correctness before adding volume.
- Prefer static, maintainable pages over a framework migration.
- Publish only verified claims and real project material.
- Measure before removing Squarespace-port dependencies.

## Current Release Status

As of July 17, 2026, Batch 1 is visually approved and Batch 2 content is present on the production domain at commit `73358a371d221d81770467bd49f2b9f3a3fc33ad`. A production-source scan found no TRAQ language on any of the nine approved pages, in sitemap/robots, or in emitted metadata.

The controlled release review has prepared a deterministic `dist-public/` build, automated validation, and repository-controlled Netlify settings. These release-hardening changes remain local pending explicit approval; nothing was deployed during the review. Manual gates and rollback instructions are in `PUBLIC_SITE_RELEASE_CHECKLIST.md`.

A style-preserving reviews, recognition, and media layer is now prepared locally for the same controlled release. It adds `/recognition/`, a restrained homepage trust section, verified Best of the Burg finalist wording, factual NBC4 Responds coverage, and a click-to-load official video. It has not been deployed.

A style-preserving About page is now prepared locally for visual approval. It explains the verified continuous history behind the company: more than 20 years of founder experience before 2015, followed by Angel Tree Services serving the Fredericksburg region since 2015, together representing more than 30 years of tree-industry experience. It also explains the progression from crew leader to General Foreman and links concise community and recognition summaries to the source-rich Recognition page. It has not been deployed.

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
| P2 | Reviews, recognition, and media layer | Stronger third-party trust and entity corroboration | Medium | Maintained official-source record | No customer data | Restrained editorial proof modules | Quarterly source review |
| P2 | About and company story | Clarify company history, founder experience, family operation, and local roots | Medium | Verified founder facts and permission-safe field imagery | No customer data | Warm editorial narrative in the shared static system | Recognition approval and responsive preview |

Risk labels describe regression or claim risk, not implementation effort. Any credential, licensing, insurance, availability, review-count, or customer claim remains blocked until evidence and owner approval are recorded.

## P0 — Credential and Lead Safety

- [x] Remove TRAQ references from local public source.
- [x] Verify the production HTML, metadata, sitemap, and robots no longer contain TRAQ.
- [x] Save website leads before attempting secondary notifications.
- [x] Treat successful `2xx` responses safely on the frontend.
- [x] Preserve submission IDs, UTM fields, page URL, referrer, honeypot handling, and duplicate-click protection.
- [ ] Complete production smoke testing with a controlled test lead and verify one CRM record.
- [ ] Verify Netlify dashboard overrides/redirects match repository `netlify.toml`, then publish the deterministic release package with explicit approval.
- [ ] Replace or explicitly accept the CRM's best-effort in-memory lead rate limiter before intentional high-volume traffic.

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
- [x] Establish a maintainable review, recognition, and media source record and permanent page.
- [x] Prepare a generated About page that distinguishes the 2015 company founding from, and connects it truthfully to, the founder’s earlier tree-industry experience.
- [ ] Reverify the Google rating/count threshold and all official recognition sources quarterly or before a major release.

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
