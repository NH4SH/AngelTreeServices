# Angel Tree Services Public Site Release Checklist

## Approved release batch — 5% discount for veterans

On October 16, 2026, the owner confirmed the business can honor these terms and
approved commit, push and publication of this reviewed patch. Skip automatic
Netlify builds and trigger only the public project. The prior case study and
named credential below were released at
`44fa2e2` / public deploy `6ad2863dff988526ec0e1c3a` on October 16, 2026.

- Owner-confirmed policy: 5% off the full service and material subtotal before
  taxes and fees; cannot be combined with another discount. Do not invent proof,
  eligibility restrictions, expiration dates or automatic discount application.
- Homepage: one existing native FAQ addition and a short estimate-form reminder.
  Customers mention the offer in their existing project-details field. Preserve
  the form contract, optional service context and customer-entered details.
- Preserve established URLs, titles, headings, canonicals and structured data,
  the six-photo case study, Saul's credential and existing service priorities.
  Do not add discount/city doorway pages or unsupported Offer/FAQ rich-result data.
- Keep analytics disabled. Do not edit CRM source, settings or business records.
  The separate CRM workstream owns discount calculation, rounding and documents.
- Local tests: 93/93 pass, public build and validation of all 14 pages pass.
  Homepage head/metadata/schema, headings, form markup and scripts match the
  released baseline. Desktop (1440px) and mobile (390px) checks found no overflow;
  the native FAQ expands by keyboard, retains single-open behavior, and its
  estimate link works. Typed details survived service and optional-context changes.
- Independent finish review: `ship` for this narrow local homepage extension;
  no material fixes required. This does not certify CRM calculations or release
  approval. The incumbent design system is preserved.
- Release: owner approval and confirmation that staff can honor these terms are
  recorded. Refresh shared repository and both projects' release state, then use
  a website-only release with automatic builds skipped. CRM functionality remains
  outside this website verification.
  After release, run non-submitting production smoke checks. Physical-device and
  spoken screen-reader checks and search indexing/rankings are not established.

## Released batch — Fredericksburg tree-removal case study

The owner approved the six-photo case study and local website implementation.
The project is confirmed to be in Fredericksburg; public copy uses the city only.
Customer identity, street and house number are omitted. On October16 the owner
approved commit/push, then explicitly confirmed "Push and publish the website".
Both automatic Netlify builds will be skipped; only the public project will be
triggered separately. Analytics stays disabled and CRM code/settings are unchanged.

- Source content: `public-tree-removal-project.json`. Page generation and related
  links: `scripts/build-public-pages.py`. New route: `/projects/hollow-tree-removal/`.
- Preserve the six selected frames, including the approved first-person chipper
  view and later cleared yard. Keep the stump visible and accurately captioned;
  do not imply grinding, a damage-free guarantee or a verified before photograph.
- Describe the owner-confirmed visible holes and rot during the ivy-removal visit.
  General risk/signs copy cites ISA and USDA guidance. Do not invent inspection
  tools, a formal risk rating, disease, decay percentage or a prediction of failure.
- Confirm discoverability from Projects and Tree Removal, unique metadata,
  canonical/breadcrumbs, a sitemap entry and matching CreativeWork image data.
  Keep unknown dates and customer-review markup out of the case-study schema.
- Check all six uncropped responsive WebP images, captions, alternative text,
  dimensions, lead-image priority and lazy loading of the five later images.
  Regeneration uses `scripts/generate-project-images.py --source-dir <exports>`
  with Pillow and six `<photo-key>.jpg` exports. Deploy builds use committed
  derivatives and their source-provenance sidecars; original frames and private
  intake files are outside build inputs.
- Every case-study estimate action must retain existing `service=Tree Care` and
  `estimate_context=tree-removal`. Check the local form entry without submitting.
- Run `npm run test:public` and desktop/mobile visual and keyboard checks for
  the case study, Projects and Tree Removal. Confirm no new overflow, broken links,
  image failures, analytics collection, private notes or CRM changes.

Local verification completed October 16, 2026: all 93 behavior/analytics tests
passed; the build and validation of all 14 pages passed. The three affected pages
passed 72 Chromium checks, including keyboard skip/menu navigation, image loading,
accessible link names, overflow checks down to 320px and at layout boundaries,
and non-submitting entry into the existing Tree Care/tree-removal form context.
Customer-entered name/details survived changing the optional specific service.
No outside requests, analytics collection or submissions occurred in those checks.
Desktop/mobile visual review and an independent finish review found no material
issues within the approved local-review scope. Source hashes and provenance
sidecars match all 24 image variants. The analytics initializer, form behavior,
CRM files and hosting configuration have no patch changes. The concurrent named
credential addition below changes the homepage attribution only.

For this approved release, refresh shared-repository/deployment state, review the
exact public-only patch and deploy only the public Netlify project. The verified
pre-release website baseline is commit `be33fa7`, public deploy
`6ad23cb8acde7b9cc99cd1ea` building main `49a0b82`.
Run non-submitting production smoke checks after release. If a published release
needs correction, prepare an approved public-only revert/fix and deploy it forward.
A failed unpublished build leaves the previous site live; do not deploy CRM.
Search ranking/indexing impact and physical-device/spoken screen-reader behavior
remain separate verification, not claims established by local tests.

## Concurrent approved batch — named arborist credential

The owner handed the completed local credential review to this Website workstream.
Its four-file patch is now reconciled with the case study. The owner subsequently
approved commit, push and public-only publication of the combined patch.

- Credentials & Safety names Saul Sierra Hernandez, ISA Certified Arborist®
  MA-381822A, the International Society of Arboriculture, and the certificate's
  April 27, 2026 issue and June 30, 2029 expiration dates. The official issuer
  record and certificate were freshly inspected during this integration.
- Preserve the direct issuer link, individual-versus-company distinction,
  existing membership/certification artwork and insurance wording. Do not infer
  an employment relationship, authorship, TRAQ or company-held certification.
- The homepage's existing credential link names Saul and targets
  `/credentials-safety/#saul-sierra-hernandez`. Tree Pruning gains one contextual
  related link. The anchor has a sticky-header offset. Existing page URLs, H1s,
  titles, descriptions, navigation and contact behavior remain intact.
- The credentials page's Person.hasCredential graph mirrors the visible name,
  certification category/identifier and official URL. No credential rich-result
  eligibility or search ranking improvement is promised.
- Combined verification passed: all 93 behavior/analytics tests and all 14 page
  builds/validation. Focused comparison confirms the credential block and homepage
  source match the independently prepared patch, and the prior case-study assets
  and content are unchanged. Fresh in-app desktop/mobile checks found no overflow;
  keyboard activation of both credential entry links reached the named section.
  Existing Safari section screenshots were also visually reviewed. These checks
  do not certify physical-device or spoken-screen-reader behavior.

For the approved combined release, review the exact combined patch, refresh
shared repository and both Netlify projects, and deploy only the public
website. After release, check the named links, six-photo case and credential
facts without submitting leads. Recheck issuer status when maintaining this copy
and update/remove stale claims by expiration. Preserve disabled analytics and
unchanged CRM. Correct a published regression through an approved public-only
revert/fix deployed forward; a failed unpublished build leaves production intact.

### Release preparation — October 16, 2026

The shared remote history changed during CRM development. The reviewed public
baseline still matches it byte-for-byte. Release preparation uses a separate
checkout from remote `d069ac9` with the exact 55-file reviewed patch applied,
preserving the original working checkout and all upstream CRM work. Fresh tests
passed 93/93 and all 14 pages validated. The push uses `[skip netlify]`; existing
GitHub workflows run only on pull requests/manual dispatch or schedule, so this
push does not invoke them. Deployment IDs, final source hashes and GET-only live
smoke results are maintained in WEBSITE-HANDOFF.txt outside the public artifact.

## Earlier lawn-care/Landscaping batch — historical pre-release record

The owner approved removing lawn care from the public offering and correcting the
homepage Landscaping estimate action. This batch is local implementation and
testing only; no commit, push, preview, or deployment is authorized. Analytics
collection stays disabled and CRM code/settings stay unchanged.

Production remains public commit `562c2e6`, Netlify deploy
`6ad229c8706d729b079fc672`. The CRM remains on deployment
`6ab9b03884d68c00086ce380`. The source below also preserves historical reviews;
their earlier production-status statements are superseded by this section and
the maintained handoff.

- Remove the homepage lawn-care card, dropdown option, hero/metadata/structured
  description, services-overview wording, project-gallery card, and generated
  machine-readable offering. Keep the remaining tree-care and Landscaping content.
- Keep all 13 URLs, titles, canonicals, sitemap entries, indexing rules, contact
  destinations, emergency availability, credentials, and analytics gates unchanged.
  The homepage description changes only to remove the retired service. There is
  no known dedicated lawn-care route in the approved public artifact to redirect.
- The Landscaping card has a direct service-specific link. Normal click or Enter
  updates the current form, clears incompatible tree context, updates the URL,
  and focuses Service needed. All other customer fields and submission identity
  remain intact. Modified clicks retain normal link behavior. In-flight requests
  keep their current service and draft.
- Check generic and all five tree-service entry contexts, commercial details,
  contact preference, message budget, failure/retry, retired lawn-care query links,
  history-unavailable fallback, keyboard activation, and narrow/200%-text layouts.
  Submit synthetic payloads only to the loopback-only fixture, with production
  connections and form actions blocked by CSP.
- Verify the two-card homepage and project gallery, responsive image hints, all
  13 built pages, absence of retired-service wording in shipped HTML/llms.txt,
  unchanged analytics initializer, and a public-only patch before release review.

Before a separately approved release, recheck shared-repository overlap and both
Netlify projects, deploy only the public artifact, and run non-submitting live
smoke checks. Roll back a problem through an approved public-only fix or prior
public deploy; do not rebuild or change the CRM to reverse this website batch.
Production inquiry persistence/notification delivery and physical-device/spoken
screen-reader certification remain outside the checks completed for this batch.

### Regression review

Starting a new Landscaping estimate now clears a previous successful-request
announcement and removes its legacy `contact=success` URL marker. This prevents
an earlier acknowledgment from appearing to confirm the new request. Failed-request
feedback, entered fields, submission identity and in-flight behavior are preserved.
Regression checks first reproduced the stale confirmation at all three reference
widths before the fix.

Review also corrected an existing four-pixel horizontal overflow at the 801px
desktop/mobile boundary: the hero estimate action now includes padding and borders
inside its declared width, matching the existing mobile box model. No hero copy,
contact destination or visual identity changed in that correction. Focus checks
wait for the site's existing smooth scroll to settle before checking visibility.

Final review: 93 automated behavior tests, validation of all 13 pages, and 776
browser assertions in each of Chromium and native Safari passed. The reviewed
patch remains local and uncommitted; no push or deployment has been performed.

## Earlier service-context batch — historical pre-release review

The owner approved implementing service-specific estimate context, preserving
customer-entered details, matching the Prefer to call action to Send My Request,
and running local tests. **No push, preview, or deployment is authorized for this
batch. Analytics collection stays disabled; CRM code and settings stay unchanged.**

Production currently serves commit `84f1641`, public Netlify deploy
`6ad1da454203843b67b986c2`, released earlier on October 16. The CRM remains on
`2938577` and deploy `6ab9b03884d68c00086ce380`. Historical checks below retain
their original baseline; this section supersedes their old release-status claims.

The new service context is an allowlisted `estimate_context` value on the five
specific service-page estimate links. The form shows a changeable, optional
specific-service selector only after a compatible link. Broad service/customer
categories remain unchanged. Incompatible category/type changes clear stale
context; reset clears it; returning to the old category does not restore it.

Context is added to a copy of the existing `message` field when sending. The
customer's textarea is never rewritten, prefixed, truncated, or replaced. Required
project details must still be entered. The 3,000-character message limit includes
the context prefix and multipart CRLF line endings; an over-budget request is blocked with a focused inline error
and preserves the full draft. Clear the context or shorten details to recover.
There is no new named form/API field, CRM migration, tracking event, or storage.

Both contact actions share Poppins, the existing primary button's weight, size,
line height and tracking, and use the full form-row width on desktop and mobile.
The phone destination is unchanged.

## Service-context regression review — October 16, 2026

Review found and corrected a website-side message-length boundary issue. Multipart
encoding turns every line ending into CRLF; the original raw-text count could pass
3,000 characters while the CRM received more and retained only the first 3,000.
Both inline validation and the final transport guard now count the encoded line
endings without rewriting the draft. The regression cases use a native multipart
encoder, and browser cases send synthetic payloads to a loopback-only multipart
parser. Exact-boundary, one-character overflow, multiline, clearing-context and
recovery behavior are checked. No CRM file or setting changed.

The final review evidence and refreshed patch are in the maintained handoff and
this chat's outputs/. Release is still withheld. Before a release, recheck main,
project deploy/settings state, the reviewed patch and public artifact, and isolate
the public deploy so the shared repository does not rebuild the CRM. After a
separately approved release, perform non-submitting production smoke checks.
Real production lead persistence and notification delivery remain unexercised;
physical-device and spoken screen-reader checks remain documented limits.

## Source and artifact ownership

- Maintain the homepage in root `index.html` and its behavior in
  `ats-form-enhancements.js`; `ats-website.js` is the shared initializer.
- Maintain secondary pages, sitemap, robots, and llms content in
  `scripts/build-public-pages.py`. Do not edit generated pages directly.
- `scripts/build-public-site.py` assembles the allowlisted artifact in ignored
  `dist-public/`, applies guarded emergency-copy replacements, and optionally
  configures Google address autocomplete.
- Tests and documentation stay outside the public artifact. The validator rejects
  extra routes, application source, reports, environment files, and known secret patterns.

The release retains all 13 existing routes, one homepage and 12 generated pages:

| Route | Artifact |
| --- | --- |
| `/` | `dist-public/index.html` |
| `/services/` | `dist-public/services/index.html` |
| `/services/tree-removal/` | `dist-public/services/tree-removal/index.html` |
| `/services/tree-pruning/` | `dist-public/services/tree-pruning/index.html` |
| `/services/stump-grinding/` | `dist-public/services/stump-grinding/index.html` |
| `/services/emergency-tree-service/` | `dist-public/services/emergency-tree-service/index.html` |
| `/services/commercial-hoa-tree-care/` | `dist-public/services/commercial-hoa-tree-care/index.html` |
| `/credentials-safety/` | `dist-public/credentials-safety/index.html` |
| `/projects/` | `dist-public/projects/index.html` |
| `/about/` | `dist-public/about/index.html` |
| `/recognition/` | `dist-public/recognition/index.html` |
| `/privacy/` | `dist-public/privacy/index.html` |
| `/privacy-request/` | `dist-public/privacy-request/index.html` |

No new location or individual case-study page is part of this batch.

## Build contract

| Setting | Value |
| --- | --- |
| Public Netlify project | `verdant-shortbread-99c404` (`86c48a95-ead4-4b15-8e57-fa827558b2f0`) |
| Base directory | Repository root |
| Build command | `npm run test:public` |
| Publish directory | `dist-public` |
| Runtime | Node.js/npm and Python 3 |
| Canonical origin | `https://angeltreeservices.org` |
| Separate CRM origin | `https://admin.angeltreeservices.org` |

No environment variable is required for the static build. The existing optional
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` controls address autocomplete. Test with it absent;
verify production's existing autocomplete behavior separately before any release.
No CRM secrets or configuration belong in the static artifact.

Run from the isolated checkout:

```bash
npm run test:public
git diff --check
```

This runs both Node test files, rebuilds `dist-public/`, and validates all 13 routes.
The builder replaces only that output directory. A repeat build with identical inputs
must produce matching file hashes. No install, Netlify CLI command, or production
request is needed for these checks.

Expected shared artifacts include `ats-website.js`, `ats-form-enhancements.js`,
`ats-address-autocomplete.js`, `site-pages.js`, `overrides.css`, `site-pages.css`,
`_redirects`, `sitemap.xml`, `robots.txt`, `llms.txt`, and curated assets. Every route
must load one deferred shared initializer. Neither saved
`google-analytics_analytics.js` replacement may ship.

## Contact and measurement acceptance

Use synthetic fixtures only. Serve the built artifact on loopback with a CSP that
blocks external connections and form actions. Set `window.ATS_LEAD_INTAKE_URL` or
the form's `data-lead-intake-url` to a local mock before testing. Never allow a
fixture to reach `admin.angeltreeservices.org` or Netlify Forms.

- [ ] Selecting Email sets the email field's required and `aria-required` state,
  and changes its label indicator to `(required)`, without immediately showing an error.
- [ ] Email plus blank/invalid address sends no request. Submission focuses the
  email field and links its inline error with `aria-describedby`.
- [ ] Call, Text, and No preference allow a blank email. Switching preferences
  preserves the draft, restores `(optional)`, and clears an obsolete required error.
  Nonempty malformed email still fails validation. Repeated validation must not
  leave `aria-describedby` pointing to a removed error; preserve any original hint.
- [ ] On `pageshow`, including browser form-state restoration, the email
  requirement and label match the restored preference without a change event.
- [ ] Successful submission resets the preference and email requirement together.
- [ ] Only JSON objects with `ok:true`, an `application/json` content type, and
  HTTP 200/201/202 acknowledge receipt. Their status message receives focus.
- [ ] Empty bodies, JSON null/primitives/arrays, malformed JSON, HTML, unexpected
  statuses (including 204), and `ok:false` fail closed. Keep fields and submission ID.
- [ ] Network errors and HTTP 400/403/413/415/429/500/503 show an error, retain the
  draft/ID, and re-enable submission for retry.
- [ ] Two submissions while a response is pending send one request. A failed
  request retry retains the submission ID; a completed acknowledgment rotates it.
- [ ] A throwing `ATSWebsite.track` never interrupts a customer's request.
- [ ] `estimate_request_acknowledged` is diagnostic only. HTTP 200 replay and
  HTTP 202 spam acknowledgments emit no such diagnostic. A 201 can still be a
  likely duplicate: do not introduce `generate_lead`, a unique-inquiry conversion,
  or mark this diagnostic as a key event.
- [ ] `COLLECTION_ENABLED=false`, measurement ID empty, and no real Google tag
  loader, gtag global, or collection is created by the shared module, even if
  its consent integration point is called with `granted`.
- [ ] Direct estimate links retain bounded current URL UTMs and valid service
  prefill. Ordinary-navigation storage remains dormant without a future approved
  consent-restoration integration; do not report it as active.
- [ ] If the shared initializer is missing, incomplete, or throws, the form still
  captures bounded current-URL campaign metadata. Its fallback creates no storage
  or analytics transport.

Property verification, consent UI/privacy decisions, and a CRM-owned eligibility
contract are future activation work. They are not permission to enable collection
in this disabled batch. Phone clicks are intent, not completed calls; receipt
acknowledgments are not verified new inquiries or won work.

## Layout and navigation regression checks

- [ ] All 13 pages render at desktop and mobile widths without horizontal overflow,
  keep one H1 and correct canonical metadata, and retain approved content.
- [ ] Homepage and secondary-page mobile menus support Escape/focus return,
  navigation, outside click, and focus exit.
- [ ] Mobile Call/Estimate actions disappear at the contact form and cannot be
  focused while hidden. Phone links retain `(540) 388-8715`; do not place calls.
- [ ] Contact labels, focus indication, live status, errors, and draft retention
  remain usable at desktop/mobile widths. Review actual screenshots.
- [ ] Removal/pruning/stump links retain the currently supported `Tree Care`
  prefill; emergency and commercial prefills remain compatible. A narrower
  service subtype is not part of this patch.
- [ ] Keep the 24/7 emergency response context and its conditions: serious damage
  or urgent hazards; response depends on conditions, crew safety, location,
  and severity. Do not promise immediate arrival.
- [ ] Recognition source distinctions, existing reviews, credentials, and
  privacy content remain unchanged. No new factual claims are approved here.

## Production baseline and future release authorization

Last verified during the October 16 discovery (recheck before any future push):

| Item | Baseline |
| --- | --- |
| Published SHA | `2938577db20bb801ba797de0c4252d7e59b632d2` |
| Published deploy | `6ab9b038d904e2000848f543` |
| Context / branch | `production` / `main` |
| Published | September 27, 2026, 8:09 p.m. Eastern |
| Dashboard | `https://app.netlify.com/projects/verdant-shortbread-99c404` |

Both projects' authenticated Netlify dashboard settings were inspected read-only
on October 16, 2026, at approximately 06:19 UTC (02:19 Eastern):

| Setting | Public website | CRM (`angel-tree-admin`) |
| --- | --- | --- |
| Repository | `NH4SH/AngelTreeServices` | Same repository |
| Base directory | `/` | `apps/platform` |
| Package directory | Not set | Not set |
| Dashboard build command | Not set; root `netlify.toml` supplies `npm run test:public` | `npm run build` |
| Dashboard publish directory | Not set; root `netlify.toml` supplies `dist-public` | `apps/platform/.next` (repository-relative display) |
| Functions directory | `netlify/functions` | `apps/platform/netlify/functions` |
| Runtime / Node | No framework set / 22.x | Next.js / 22.x |
| Build status | Active | Active |
| Production branch | `main` | `main` |
| Branch deploys | Only production branch | Only production branch |
| Deploy Previews | Any PR against production/branch-deploy branches | Same |
| Auto publishing | On; successful `main` deploys publish automatically | Same |
| Deployment method restrictions | All methods permitted | All methods permitted |
| Published deploy | `6ab9b038d904e2000848f543` | `6ab9b03884d68c00086ce380` |
| Published SHA | `2938577db20bb801ba797de0c4252d7e59b632d2` | Same |

Dashboard build fields and repository configuration are distinguished above;
an unset dashboard command is not a missing effective build command. Both deploys
were ready in production context. No settings were saved or changed. Neither
project listed injected snippets or build hooks in the inspected developer page.
No shared team environment variables were returned. The public project has only
its optional Maps variable; CRM secrets were not found in its variable list.

Existing PR evidence shows previews can build both projects, even for changes
limited to one app. Neither inspected `netlify.toml` defines a custom ignore
command. Do not assume that a push or PR is inert or that a preview is isolated.
Recheck settings and intervening work immediately before any future approved push.

A future release requires the owner to approve its exact diff/commit and deployment
path. Recheck overlapping work, preserve the current baseline SHA/hash manifest,
run the local checks above, and verify allowed origins and acknowledgment behavior
against a confirmed isolated staging intake. Do not change hosting settings to
work around an approval boundary. No push, PR, merge, preview, or deployment is
authorized by this checklist or by implementation approval.

Release verification status:

1. **Completed in isolated local staging:** real multipart POST/JSON, browser
   response CORS, replay/duplicate/spam, shared rate limiting, persistence failure
   and recovery, concurrent/lost-acknowledgment retry, and notification failure
   after save. All 63 API/database assertions and 13 actual browser assertions
   passed. Production received only the previously recorded read-only OPTIONS
   requests; no production submission is authorized.
2. Recheck the verified Netlify settings above and the exact reviewed commit/artifact
   immediately before an approved release. Both projects still publish SHA
   `2938577db20bb801ba797de0c4252d7e59b632d2`; settings inspection is complete for
   this review, but push/preview/release permission remains withheld.
3. **Completed the remaining computer mobile/accessibility checks:** narrow
   reflow, 200% text, spacing, native keyboard/focus, accessible names/errors,
   contrast and hidden actions, with scoped fixes documented below. Physical
   devices and spoken VoiceOver/TalkBack output remain unverified; no conformance
   certification is claimed.
4. Obtain separate approval for the exact push/preview and production-release
   path; then run non-submitting production smoke checks after the approved release.

GA ownership/settings, consent UI, ordinary-navigation persistence activation,
CRM server-side email enforcement, and a unique-inquiry eligibility contract remain
separate follow-ups. They are not prerequisites to finishing this disabled website
patch, and this checklist does not authorize implementing or activating them.

### Isolated local CRM contract tests — completed October 16, 06:38 UTC

The initial discovery found no existing staging environment. That blocker was
resolved by creating a disposable local stack on this computer. The downloaded
official Supabase CLI v2.121.0 supports an experimental native runtime on Apple
silicon, so Docker and a hosted deployment were unnecessary. The release archive's
SHA256 was checked against the publisher's checksum. CLI/Next telemetry and local
Supabase analytics were disabled. Tools, cache, database and credentials stay in
this chat's `work/` directory; no global installation or project link was made.

Isolation was confirmed before any POST:

- A clean archive of the currently published CRM SHA `2938577` contained no
  production `.env` files or linked-project metadata. All 65 committed migrations
  replayed into a fresh native PostgreSQL 17 database; initial job count was zero.
- Database (`127.0.0.1:30414`), Supabase HTTP (`127.0.0.1:26402`), CRM
  (`127.0.0.1:48010`) and website fixture (`127.0.0.1:48011`) were loopback-bound.
  Fresh local-only keys matched the new database. Production credentials were
  absent from the scrubbed app environment.
- `RESEND_API_KEY` was empty; the notification recipient was a synthetic
  `example.invalid` address. The app's fetch guard permitted only its local
  Supabase/CRM origins, and the website CSP allowed only the local CRM. No
  background integration route was invoked. Mailpit had zero messages.
- The guard denied Next's npm version-check attempts before fetch. Every
  permitted CRM fetch targeted local Supabase; no production database or mail
  provider request was attempted. No canary, production lead or business write
  was made.

| Actual contract case | Result |
| --- | --- |
| Allowed/disallowed origin | OPTIONS and actual POST CORS accepted the test origin; unrelated origin rejected |
| Valid first multipart submission | HTTP 201 JSON `ok:true`; one synthetic inquiry persisted with campaign/preference metadata |
| Same submission ID replay | HTTP 200; no additional inquiry or notification attempt |
| Likely duplicate with new ID | HTTP 201 with a persisted duplicate relationship; confirms 201 is not a unique-inquiry signal |
| Honeypot and too-fast spam | HTTP 202 `ok:true`; no inquiry or notification |
| Invalid fields, MIME and size | HTTP 400/415/413 with JSON and appropriate CORS |
| Shared database rate limit | First five spam attempts acknowledged; sixth HTTP 429 with Retry-After |
| Local persistence fault and recovery | HTTP 503 without inquiry; same-ID retry after removing the local test constraint returned 201 once |
| Concurrent same-ID retry | One 201 and one 200; one inquiry and one notification attempt |
| Lost actual acknowledgment | Saved 201 deliberately discarded in the browser; draft/ID retained; retry received real 200 replay and reset correctly |
| Notification unavailable after save | Failed notification status recorded locally; saved inquiry still received success acknowledgment |
| Website integration | 13/13 Chromium browser assertions passed, including desktop/mobile geometry, conditional email, double submit, receipt focus/reset and 503/retry |

The API/database suite passed 63/63 assertions against actual Next.js HTTP and
Supabase/PostgREST, rather than mocked persistence. Browser response statuses were
201, 201, 200, 503, 201 across five attempts and exactly three saved inquiries.
The website's runtime patch/artifact remained unchanged; only the fixture's
in-memory endpoint pointed to loopback. All local servers/services were stopped
after testing and the temporary browser tab was closed. The stopped synthetic
database and test scripts remain available for reproduction.

These checks establish the reviewed local contract and notification-failure
independence. Real Resend delivery, production POST/persistence and production
schema drift were not tested. No production credentials, customer data, or
CRM source/configuration changes were used. A future push still needs a fresh
overlap/settings/artifact check and separate release approval.

After separate release authorization, use the established controlled deployment
path. Non-submitting production smoke checks should confirm all 13 routes and
assets return 200, metadata/robots/sitemap/legacy redirects remain correct,
analytics stays disabled, no source/private files are exposed, and the form/menu
presentation matches the tested artifact. Do not add a live submission to smoke
checks without explicit approval for that submission. Production persistence,
notifications, real CORS, GA delivery, indexing, and rankings are not established
by local mocks.

## Computer mobile and accessibility release checks — October 16, 07:05 UTC

**Verdict: ready for a separately approved release of this reviewed patch.** No
known code blocker remains in the approved website scope. The patch is local and
uncommitted; pushes, previews and deployments remain withheld.

This continuation corrected verified issues while preserving the green/white
identity, imagery, wording, metadata, routes, forms contract and disabled analytics:

- Secondary header branding can wrap at larger text sizes; long words can wrap
  instead of pushing the Menu control or page content outside the viewport.
- Labeled review/credential groups and star-rating graphics now have appropriate
  semantic roles, preserving their existing accessible names and visible wording.
- Existing darker greens provide sufficient text contrast for hero/header areas,
  contact/footer content, buttons, selected choices, help text and hover states.
  Keyboard focus uses a clear dark outline; secondary-page focus also has a white
  surround. This deliberately changes two CSS sources and the mobile header tint.
- The exported decorative contact divider crossed contact text on narrow screens.
  That divider and its clipping mask are disabled in the contact section.

| Check | Evidence/result |
| --- | --- |
| Normal mobile/tablet/desktop reflow | All 13 routes at 320, 360, 768 and 1440 CSS pixels; no page overflow or clipped controls/text in the rendered matrix |
| Increased text spacing | All 13 routes at 320px with 1.5 line-height, 0.12em letter spacing, 0.16em word spacing and 2em paragraph spacing passed |
| 200% text scaling | Final targeted checks passed 26/26 in Chromium 155 and 26/26 in Safari 27.0.1: every route at 320px and 390px |
| Automated accessibility | Axe-core 4.14.0, package integrity verified; 29 rendered scans (13 routes at 320/1440 plus menu/error/receipt states), zero confirmed WCAG A/AA or best-practice violations; prohibited-ARIA manual flags resolved |
| Manual contrast | Photographic/pseudo-element backgrounds were marked incomplete by axe, so they were separately inspected with rendered background samples and computed colors. Corrected mobile hero samples exceed 8:1 at the reviewed positions; white/dark-green controls are 8.26:1; 82%-white secondary breadcrumb text over the lightest new hero endpoint is 4.59:1 |
| Native keyboard and accessibility tree | Home/secondary Menu open, link Tab, Escape and focus return; secondary Skip to main focuses MAIN; radio arrow selection exposes Email (required); submit via keyboard focuses the linked invalid email error; switching back restores optional state and retains the draft; hidden mobile actions report visibility:hidden at the form |
| Public tests/build | 63/63 Node tests; all 13 generated route validations; deterministic 120-file build |
| Preserved release contract | Inquiry/analytics JS unchanged by this continuation; prior actual isolated CRM 63 API/database and 13 browser assertions remain applicable |
| Review state | Remote main remains 2938577; both published Netlify deploy IDs remain ready and unchanged; no release/settings action performed |

The intermediate broader 200%-text scan exposed additional long-word overflow;
the final shared wrap fix was verified by the targeted 26-case checks in both
engines. Original intermediate failures remain in work/ as evidence, not as a
passing final run. The design detector's exported-layout/style advisories and
decorative false positives were reviewed; no redesign was undertaken.

These are computer checks, including macOS accessibility-tree inspection. They
are not physical iPhone/Android testing, an audible VoiceOver/TalkBack session,
or a WCAG conformance certification. OS reduced-motion rules were reviewed in
source; no OS preference was changed. Real production POST/email delivery remains
outside the authorized tests. Those limits do not constitute a newly found code
blocker for this patch; retain them in the release decision.

Final screenshots include mobile-release-preview.png, mobile-keyboard-email-error.png,
mobile-contact-accessibility.png, mobile-text-200.png and desktop-services-accessibility.png.
All test tabs/services are closed and the viewport override was cleared. Local
fixtures and axe assets stay outside dist-public. Analytics remains disabled.

The remaining action is owner approval for the exact reviewed patch/commit and
release path. Immediately before an approved push, recheck intervening changes
and both projects' automation; after an approved release, run the documented
non-submitting smoke checks. Do not send a production test lead.

## Reversal and remaining ownership

If an approved release introduces broken routes, inaccessible navigation, false
receipt confirmations, failed inquiries, exposed source, or unexpected analytics,
prepare a new revert commit against that release, validate it, and obtain the
appropriate release approval for the correction. Do not reset shared history or
republish an old deploy as an agent action. An unsuccessful unpublished build
leaves the prior production deploy live.

Keep notification failures after a saved inquiry separate from customer receipt
handling. CRM owns persistence, deduplication, server-side conditional-email
validation, notifications, and a future measurement eligibility contract. This
website batch changes none of those systems. GBP settings remain outside scope.

Search Console sitemap submission, recrawl requests, and indexing verification
are separate future actions; this contact-only patch does not authorize them.

## Local verification record

October 16 results for the uncommitted patch:

| Check | Result |
| --- | --- |
| `npm run test:public` | 63 Node tests passed; build and validation of all 13 routes passed |
| Repeat build | All 120 output-file hashes matched |
| Local browser fixtures | 194 assertions passed in each of Chromium and Safari at 1440px and 390px; production blocked |
| Restoration / accessibility regression | Actual Chromium back navigation retained the draft and correct Email requirement; repeated error correction left no removed error reference |
| Actual error-state previews | New mobile keyboard-error/contact/large-text and desktop service screenshots captured during the accessibility continuation |
| Optional Maps configuration | Isolated build with ordinary non-secret placeholder and all 13 route validations passed; injection occurred once; provider not contacted |
| Content regression | All 13 routes retain titles, metadata, JSON-LD, links and image references; this accessibility continuation deliberately adjusts overrides.css/site-pages.css and semantic roles |
| Production preflight only | Public origin allowed (204); unrelated origin rejected (403); no form payload sent |
| Both Netlify projects | Authenticated dashboard build/base/branch/preview/auto-publish settings verified read-only; no settings changed |
| Isolated local CRM | Fresh native Supabase; 65 migrations; 63/63 actual HTTP/database and 13/13 browser assertions passed; no external email |
| Whitespace / complete patch application | `git diff --check` and clean-baseline `git apply --check` passed |
| Analytics | Collection disabled, ID blank, no unique-inquiry conversion |

The maintained `WEBSITE-HANDOFF.txt`, local validation transcript, browser results,
and screenshots retain the evidence. The unchecked acceptance items above are
the reusable review steps for a future release; they do not negate these completed
local checks or authorize external actions. The local actual POST/CORS contract
now passes; production POST, real email delivery, real analytics, and physical-device
testing remain unverified. Historical
July/August scores and empty-2xx success expectations are superseded.
