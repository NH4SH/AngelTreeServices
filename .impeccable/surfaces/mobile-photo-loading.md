---
version: 1
slug: mobile-photo-loading
primary_target: scripts/public_mobile_photos.py
related_targets: [scripts/build-public-site.py, scripts/generate-mobile-photo-variants.py, public-mobile-photo-variants.json]
---
Mode: Persuade; ordinary loading-performance refinement of the existing homepage
and Tree Removal page. Preserve the approved composition, photos, crops, wording,
image fallback URLs, alt text, SEO, estimate links and drafts. Analytics, consent
and CRM are unchanged. Owner authorizes local tests and QA-only preview uploads;
no commit, push or public release.

Measured baseline: cached image reloads are already effective. In a 390px iframe
on the available 2x desktop display, Tree Removal selects the 182904-byte 840px
WebP hero despite its 284px visible width; homepage selects the 102558-byte bucket
photo and 320px service thumbnails. Keep the existing responsive WebP fallbacks,
immutable content-addressed assets and shared stylesheet caching. Add mobile-only
right-sized WebP sources for the same approved images and accurate sizing for the circular
Tree Removal hero. Desktop imagery and full-size project images remain intact.

Verification: three paired cold/warm runs per page using unique isolated case
paths, normal desktop network and unthrottled CPU; record source selection,
transfer, LCP and CLS without claiming real-device results. Preserve every image
box/crop and inspect fine detail. QA blocks collection, submissions and indexing.
Run existing public tests/build, all-page content/SEO/link/form/runtime guards,
mobile and desktop QA, keyboard/estimate navigation and synthetic draft recovery.
Document any baseline timing/shift variability rather than claiming a guaranteed
speed, conversion or ranking gain. Do not disturb .impeccable/review/.

Encoding choice: an AVIF trial saved bytes but did not establish consistent paint
timing gains. Final candidate uses right-sized WebP derivatives to retain the
existing decoder path and reduce transferred/decoded pixels; AVIF trial assets
are not part of the final shipping patch. Preserve the full trial evidence.

Final verification — October 22, 2026: 197 tests and the 18-page build/validator
pass. Only homepage and Tree Removal HTML change in shipping output; all other
262 old files, 19 protected source hashes, SEO, words, links, photos/alt text,
forms, draft/analytics/consent runtimes and shared CSS remain identical. Eleven
new WebP derivatives include provenance sidecars; two existing tree candidates
are reused. No desktop image/crop change.

Three final paired cold/warm runs per page show 21.9% less homepage photo transfer
and 27.1% less Tree Removal photo transfer at 390px/DPR2. Warm resource medians
remain 2700/1500 bytes. This is a desktop connection, not a phone/radio test.
No reliable LCP improvement established; exact timings and baseline iframe
body/font shifts are disclosed in outputs/mobile-photo-loading/speed-summary.json.
Do not claim field Web Vitals compliance or a guaranteed page-speed gain.

Final QA: https://6ada1a9ef8855bca55ddb8ff--verdant-shortbread-99c404.netlify.app/services/tree-removal/ .
18 route/14 asset checks pass; noindex, collection/submission blocks, no functions
and unpublished draft status verified. Sixteen visual states (320/390/800/1280,
both pages, baseline/candidate) retain image/heading boxes within 1px. Source
selection, crops, lazy loading, keyboard estimate navigation, exact synthetic
multiline draft retention/reload and Clear draft pass. No calls or submissions.

Production and CRM deployments, build/processing settings and CRM recent deploys
are unchanged. No commit or push. Original localhost denial and physical-device,
OS text zoom and spoken screen-reader verification remain separate limits.
