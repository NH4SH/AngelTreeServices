# Angel Tree Services Public Content Architecture

## Strategy

Keep the current homepage as the recognizable brand and conversion hub. Grow the site with focused static pages that answer real homeowner questions, show genuine work, and route visitors to the same estimate workflow.

## Canonical Domain

All indexable pages use:

`https://angeltreeservices.org/`

The `www` host may redirect at Netlify. Email addresses on `angeltreeservice.org` are contact identities, not canonical web URLs, and should not be rewritten unless the business changes email domains.

## Current Public Inventory

| Route/source | Role | Indexing |
| --- | --- | --- |
| `/` (`index.html`) | Primary homepage and estimate journey | Index |
| `/services/` | Tree-services decision hub | Index |
| `/services/tree-removal/` | Tree-removal planning and estimate intent | Index |
| `/services/tree-pruning/` | Purpose-led pruning guidance and estimate intent | Index |
| `/services/stump-grinding/` | Stump-grinding scope and estimate intent | Index |
| `/services/emergency-tree-service/` | Storm-tree safety guidance and urgent contact path | Index |
| `/services/commercial-hoa-tree-care/` | Commercial, HOA, and property-management service path | Index |
| `/credentials-safety/` | Verified credentials, planning, and safety practices | Index |
| `/projects/` | Real-work image library and future case-study hub | Index |
| `/about/` | Company story, founder experience, family operation, and community overview | Index |
| `/recognition/` | Verified Google review proof, 2026 finalist recognition, and NBC4 coverage | Index |
| `/landing-clean/` | Alternate design experiment | Noindex |
| `/localbuild/` | Older static alternate/source | Noindex |
| `/admin/` | Legacy placeholder; internal platform now lives separately | Noindex |

Individual project pages remain withheld until factual project notes and media permission are approved.

## Target Information Architecture

### Primary Navigation

- Brand link to Home
- About
- Services
- Projects
- Commercial
- Instagram
- Call Us

This compact order is shared by the homepage and generated public pages. The expanded mobile menu continues with Credentials & Safety, Reviews & Recognition, and Contact; persistent mobile actions provide Call now and Free estimate. The order should be evaluated using the existing privacy-conscious `navigation_link_click` event rather than competitor convention alone.

### Service Hub

`/services/`

Purpose: help visitors choose the correct service and provide a crawlable overview without duplicating the homepage.

Recommended child pages, only where the service is operationally confirmed:

- `/services/tree-removal/` — published.
- `/services/tree-pruning/` — published.
- `/services/stump-grinding/` — published.
- `/services/emergency-tree-service/` — published.
- `/services/commercial-hoa-tree-care/` — published.
- `/services/tree-assessment/`
- `/services/landscaping/`
- `/services/lawn-care/`

Each service page should include:

- One service-and-region H1.
- Plain-language problem/fit explanation.
- What the visit and proposal include.
- Safety/property-protection considerations.
- Genuine work images.
- Related services.
- Call and estimate actions.
- Visible, eligible FAQs only when they answer actual customer questions.

### Projects

`/projects/`

Individual pages:

`/projects/{verified-project-slug}/`

Required source material before publication:

- Approved photos.
- General location, if approved.
- Actual service performed.
- Customer problem and constraints.
- Property protection and cleanup steps.
- Outcome stated without exaggeration.
- Customer quote only with permission.

No project page should invent tree species, neighborhood, equipment, conditions, or outcomes.

### Service Areas

Start with one useful regional page:

`/service-area/`

Only create deeper location pages when there is unique local proof, service detail, or project content. Avoid swapping town names into duplicated templates.

Potential areas currently named by the business:

- Fredericksburg
- Spotsylvania
- Stafford
- King George
- Caroline

### About

`/about/`

Include:

- Business story and operating values.
- Verified experience and credentials.
- Real team/work imagery.
- Service area.
- What customers can expect.
- Chamber/community relationships while current.

Published structure:

- More than 30 years of continuous tree-industry experience behind the company.
- Company founded in 2015 and serving the Fredericksburg region since 2015.
- Founder’s progression from crew leader with Asplundh to General Foreman with Lewis Tree Service.
- More than 20 years of founder experience before 2015, connected to the company’s subsequent local service and present-day planning, crew coordination, property protection, and communication.
- Family-operated identity without publishing unverified names, titles, or private biographies.
- Concise community and recognition summaries that link to `/recognition/` for source-backed detail.

### Contact

`/contact/` may eventually provide a dedicated version of the existing estimate flow. Until then, `/#contact` remains the canonical action target.

### Reviews, Recognition, and Media Coverage

`/recognition/`

Purpose: corroborate Angel Tree Services through current customer review proof, exact local finalist recognition, and factual independent media coverage without presenting any source as an endorsement.

Maintenance rules:

- Keep the Google rating and durable count threshold synchronized with `PUBLIC_RECOGNITION_SOURCES.md`.
- Publish individual review excerpts only when the exact public review, reviewer display name, rating, and source link can be verified.
- Keep Best of the Burg language qualified as finalist status in the exact verified category.
- Describe NBC4 as coverage of the business-profile issue, never as a recommendation or workmanship award.
- Use no `AggregateRating` or `Review` structured data for this self-serving local-business review proof.

## Homepage Evolution

Preserve the existing hero and visual identity. Recommended content order:

1. Hero brand line, service/region support, free-estimate CTA.
2. Restrained verified trust block.
3. Short service overview using existing cards.
4. Concise “How it works” sequence.
5. One real featured project when verified content exists.
6. Calm emergency/hazard pathway.
7. Estimate form.
8. Business/footer proof.

## Page Template Rules

### Service Page Template

Use this structure for every confirmed service rather than cloning location-keyword pages:

1. Service-and-region H1, short fit statement, Call and Free Estimate actions.
2. Common homeowner situations the service addresses.
3. What an assessment, proposal, and completed visit typically include.
4. Property-protection, access, cleanup, and safety considerations.
5. One or more verified projects or real work photographs.
6. Related services and a concise estimate CTA.
7. Visible FAQs based on actual customer questions.

Required inputs: operational scope, approved terminology, service limitations, real imagery, and any claim evidence. Recommended schema: `Service`, `BreadcrumbList`, and only eligible visible `FAQPage` content.

### Service-Area Page Template

1. Region-specific H1 and concise service coverage statement.
2. Services actually available in the area.
3. Local conditions or property patterns that materially affect the work.
4. Verified nearby project examples or photographs.
5. Clear scheduling and estimate pathway.
6. Links to primary service pages and the regional hub.

Do not publish a town page unless it contains unique, verifiable value beyond replacing a place name. Recommended schema: `BreadcrumbList`; rely on the site-wide local-business identity rather than duplicating business entities.

### Project Page Template

1. Truthful project title and approved general location.
2. Customer need and site constraints.
3. Service performed and property-protection approach.
4. Outcome and cleanup, stated without unsupported superlatives.
5. Approved before/during/after media with useful alt text.
6. Link to the relevant service and estimate form.

Required inputs: factual project notes, media permission, date or approximate period, service category, and approved location specificity. Recommended schema: `Article` or `CreativeWork` only when the visible page supplies matching facts, plus `BreadcrumbList`.

### Educational Article Template

1. Question-led H1 and concise answer.
2. Signs a homeowner can safely observe.
3. What not to do and when to keep distance or contact utilities/emergency services.
4. What a professional assessment can determine.
5. Related service and estimate CTA.
6. Reviewed date and qualified reviewer when verifiable.

Do not turn educational pages into diagnoses from photographs. Recommended schema: `Article` and `BreadcrumbList`; use `FAQPage` only for visible, substantive Q&A.

### Metadata

- Unique title of roughly 45–60 characters where natural.
- Unique description of roughly 140–160 characters where natural.
- Canonical absolute URL.
- Open Graph title, description, URL, and maintained image.

### Headings

- One descriptive H1.
- H2 for major content sections.
- H3 only within an H2 section.
- Do not choose heading levels for visual size.

### Structured Data

- Homepage: one maintainable LocalBusiness/Organization graph and WebSite identity.
- Recognition page: WebPage and BreadcrumbList tied to the existing business entity; verified finalist text may be represented by `award`, and official coverage may be referenced through `subjectOf` on the canonical business entity.
- Service page: Service only for visibly offered, truthful services.
- Project page: Article/CreativeWork only when content supports it; no fabricated review markup.
- Deep pages: BreadcrumbList reflecting visible navigation.
- FAQPage only for visible eligible Q&A.

## Internal Linking

- Homepage links to the service hub, projects, commercial/HOA, credentials/safety, recognition, and the shared estimate flow.
- Service pages link to relevant adjacent services, the project library, credentials/safety, and the shared estimate flow.
- Project pages link back to the performed service and estimate action.
- Commercial/HOA content links to relevant services, credentials/safety, and an organization-prefilled estimate path.
- Credentials/safety and the restrained static-page footer link to recognition; recognition links back to services, credentials/safety, projects, and the shared estimate flow.
- Service-area content links to services, not to duplicate city variants.
- Use descriptive link labels; avoid generic “learn more” where context is unclear.

The shared estimate path accepts only exact existing `service` and `customer_type` values. The destination retains normal browser referrer data and existing UTM attribution rather than creating a second form endpoint.

## Priority Page Briefs

### Tree Removal — `/services/tree-removal/`

- User intent: understand whether removal is appropriate, what protects the property, and how to request a quote.
- Search intent: local high-intent service research.
- Primary CTA: Request a Free Estimate; secondary CTA: Call.
- Outline: removal situations, assessment, access/property protection, cleanup, related stump service, FAQs.
- Needed media/proof: real crew and completed-work photos, approved project facts, verified credential language.
- Relevant testimonial: verified removal customer quote about communication, property protection, or cleanup.
- Internal links: tree assessment, stump grinding, emergency tree service, projects, contact.
- Schema: `Service` and `BreadcrumbList`.
- Visual pattern: existing green/white cards, rounded CTA, restrained organic divider.

### Tree Pruning — `/services/tree-pruning/`

- User intent: improve clearance, structure, appearance, or safety without unnecessary removal.
- Search intent: local pruning/trimming comparison and estimate intent.
- Primary CTA: Request a Free Estimate.
- Outline: reasons to prune, assessment, appropriate timing, property protection, cleanup, FAQs.
- Needed media/proof: real pruning work, approved terminology, no unsupported health guarantees.
- Relevant testimonial: verified pruning customer quote about the process, clearance, or cleanup.
- Internal links: tree assessment, tree removal, projects, contact.
- Schema: `Service` and `BreadcrumbList`.
- Visual pattern: current service-card photography and calm explanatory copy.

### Stump Grinding — `/services/stump-grinding/`

- User intent: understand access, expected finish, and what happens to grindings/roots.
- Search intent: local transactional service query.
- Primary CTA: Request a Free Estimate.
- Outline: fit, access questions, utility considerations, expected result, restoration boundaries, FAQs.
- Needed media/proof: equipment and finished-area photos plus verified scope details.
- Relevant testimonial: verified stump customer quote that accurately reflects the completed scope.
- Internal links: tree removal, landscaping if operationally confirmed, contact.
- Schema: `Service` and `BreadcrumbList`.
- Visual pattern: simple before/after-led page with existing rounded components.

### Emergency Tree Service — `/services/emergency-tree-service/`

- User intent: determine the safest immediate action and reach the company quickly.
- Search intent: urgent local assistance.
- Primary CTA: Call (540) 388-8715; secondary CTA: Send Hazard Details.
- Outline: immediate hazards, power-line/911 guidance, what information to provide, response expectations only when verified, cleanup follow-up.
- Needed media/proof: no dramatic stock imagery; use real safe-work imagery and approved availability claims.
- Relevant testimonial: use only a verified urgent-service quote that does not imply unverified response times.
- Internal links: tree removal, tree assessment, contact.
- Schema: `Service` and `BreadcrumbList`; do not claim 24/7 service without verification.
- Visual pattern: Batch 1 emergency callout expanded into a focused page.

### Commercial and HOA Tree Care — `/services/commercial-hoa-tree-care/`

- User intent: confirm that managed properties, recurring needs, and stakeholder coordination are understood.
- Search intent: vendor qualification and estimate request.
- Primary CTA: Request a Property Estimate.
- Outline: property types actually served, scope coordination, documentation, scheduling, site access, project examples.
- Needed media/proof: verified commercial/HOA experience, approved customer references, insurance/licensing claims only with evidence.
- Relevant testimonial: approved property-manager, HOA, or commercial contact quote tied to real work.
- Internal links: relevant services, projects, contact.
- Schema: `Service` and `BreadcrumbList`.
- Visual pattern: homeowner brand system with denser operational details, not a separate corporate aesthetic.

### Credentials and Safety — `/credentials-safety/`

- User intent: verify expertise and understand how work is approached.
- Search intent: trust validation before contact.
- Primary CTA: Request a Free Estimate.
- Outline: active verifiable credentials, experience, property protection, safety process, credential verification links where available.
- Needed media/proof: active credential records and current badge-use permission.
- Relevant testimonial: not required; credential verification and process evidence should carry this page.
- Internal links: About, services, contact.
- Schema: `AboutPage` or plain `WebPage` plus `BreadcrumbList`.
- Visual pattern: restrained trust block; never imply TRAQ or another unawarded qualification.

### Projects — `/projects/`

- User intent: see evidence of comparable real work.
- Search intent: trust and contractor comparison.
- Primary CTA: View a Project, then Request a Free Estimate.
- Outline: filterable or grouped verified project summaries, service links, estimate CTA.
- Needed media/proof: approved photographs and factual intake for every project.
- Relevant testimonial: project-specific customer quote only when permission and exact wording are recorded.
- Internal links: each project, matching services, contact.
- Schema: `CollectionPage` and `BreadcrumbList`.
- Visual pattern: generous image-led cards using the current rounded geometry.

### Regional Service Area — `/service-area/`

- User intent: confirm coverage and available services.
- Search intent: regional local-service discovery.
- Primary CTA: Check Availability / Request an Estimate.
- Outline: Fredericksburg-region coverage, confirmed localities, service overview, regional projects, contact.
- Needed media/proof: coverage confirmation and regional project material.
- Relevant testimonial: verified quote from the region with only approved location specificity.
- Internal links: services, projects, contact.
- Schema: `WebPage` and `BreadcrumbList`.
- Visual pattern: one useful regional page before considering individual locality pages.

### Learning Center — `/learning-center/`

- User intent: get trustworthy homeowner guidance without self-diagnosing hazardous conditions.
- Search intent: informational discovery that can mature into service intent.
- Primary CTA: Request a Professional Assessment when relevant.
- Outline: seasonal guidance, hazard awareness, pruning/removal questions, article index.
- Needed media/proof: reviewed copy, original diagrams or approved images, review dates.
- Relevant testimonial: generally unnecessary; prioritize reviewer attribution and field-based guidance.
- Internal links: articles, services, emergency guidance, contact.
- Schema: `CollectionPage`; individual articles use `Article` and `BreadcrumbList`.
- Visual pattern: quieter editorial cards derived from the existing site typography.

## Homepage Evolution Map

| Addition | Existing pattern to reuse | Purpose | Placement |
| --- | --- | --- | --- |
| Verified trust line | Current certification block | Establish credibility without a badge wall | Homepage hero |
| How it works | Rounded cards and green/white palette | Reduce estimate uncertainty | Homepage summary; fuller detail on service pages |
| Emergency pathway | Existing call pill and contact language | Route urgent visitors safely | Homepage plus dedicated service page |
| Featured project | Existing image cards | Add real proof | One homepage feature; library on `/projects/` |
| Service detail | Current service cards | Match specific needs to services | Short homepage overview; depth on service pages |
| Regional coverage | Existing subheading style | Confirm local relevance | Short homepage statement; depth on `/service-area/` |
| Why Angel Tree | Current editorial heading and real imagery | Explain verified process and property care | Concise homepage proof; full credentials/safety page |
| Reviews, recognition, and press | Existing centered editorial rhythm with quiet separators | Add third-party reassurance without a badge wall | Durable aggregate proof on the homepage; maintained sources and full context on `/recognition/` |
| Residential/commercial paths | Existing rounded controls | Route distinct customer needs | Compact homepage choice; depth on service pages |
| Service-area entry points | Existing service-card pattern | Help genuine local visitors orient | Small homepage list; regional page for depth |
| Practical FAQs | Existing text hierarchy | Resolve final estimate objections | A short homepage set; service-specific answers on deeper pages |
| Trust-heavy footer | Existing green/white footer language | Reinforce contact and verified proof | Homepage and every future page |

## Competitive Advantage to Preserve

- A distinctive, locally recognizable visual identity rather than a generic contractor template.
- A direct estimate flow tied to the CRM, with calm recovery and duplicate-submit protection.
- Verified arborist credibility presented without inflated or pending credentials.
- Tree service, landscaping, and lawn-care breadth only where each offering remains operationally accurate.
- A warmer homeowner-first tone with a credible commercial/property-management path.
- Real project evidence and practical safety guidance as the long-term trust differentiators.

## Content Governance

Maintain one claim register with:

- Exact approved wording.
- Evidence/owner.
- Review date.
- Pages where the claim appears.

Maintain one project intake sheet with verified facts and media permission. Centralize any review count before displaying it. Remove expired credential/membership proof rather than hiding it.
