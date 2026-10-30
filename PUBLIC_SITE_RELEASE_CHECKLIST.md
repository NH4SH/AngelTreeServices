# Angel Tree Services Public Site Release Checklist

## Combined release review — local only, October 20, 2026

Verdict: ready for publishing approval after one corrected service-summary issue.
Scope: tenth homepage FAQ, optional-field contrast, Landscaping case study and
entry links, four approved Drive photos on Projects and pruning/grinding heroes.

- Fixed a pre-existing public llms.txt sentence that still offered limited lawn
  and property-care services. It now lists the confirmed existing-bush/hedge/bed
  landscaping scope. Validator now rejects lawn-care offering terminology there.
- Fetched GitHub main c5a3a98. Nine commits newer than local e6c5c30 affect only
  apps/platform and supabase; none overlap this public patch. Tested an isolated
  archive of that main revision with only the reviewed public files overlaid.
  All 1,014 CRM/database source blobs match main verbatim. Actual checkout remains
  at e6c5c30 with its pending changes preserved; no merge or commit performed.
- Latest-main integration: 155/155 tests and 16 public-page validations pass.
  Local build/validation also pass, and both public artifacts are byte-identical.
- Compared against a fresh e6c5c30 build: eight existing artifacts change, one
  new HTML page plus 32 responsive-photo/sidecar files added, no removals. All
  15 existing pages preserve SEO metadata and JSON-LD. Sitemap adds only the new
  case-study route. Analytics/consent, form/draft engines, shared page CSS,
  robots and existing William Street case study remain unchanged.
- Browser checks use inert loopback servers blocking Google, external connections
  and lead submissions. FAQ has ten disclosures and 5/5 desktop columns; native
  keyboard opening, visible focus and single-open grouping work. Optional labels
  render at 14px, full opacity, deep green. Choosing Email makes email required;
  No preference restores optional. No form was submitted or personal data entered.
- Landscaping-to-case link opens correctly; both entry links are validated.
  All four case-study estimate actions retain Landscaping; opening that URL
  selects Landscaping. Case page has one H1, both approved photos and no overflow
  at 320/390/768/1280 layout widths. Prior photo pass verifies responsive loading
  and complete framing on the three photo-updated routes. No desktop case errors.
- Detector warnings recorded in the preceding local photo/case reviews concern
  unchanged shared styling; this review adds no visual/CSS change. Physical
  devices and spoken screen-reader checks remain unperformed. No real lead or
  end-to-end CRM test was attempted; intake implementation is unchanged.
- Release requirement: apply this public patch atop the latest main at release,
  preserving all newer CRM/database commits; never force-push this older checkout.
  Confirm public-site-only Netlify publication and run non-submitting production
  checks after release. Existing no-push/no-deploy hold remains in effect.
- Evidence: October16 chat work/combined-release-review/ and
  outputs/combined-release-review/. Final patch and explicit source/asset manifest
  are captured there for review; private analysis artifacts are excluded.

## Approved Drive photography — local only, October 20, 2026

- Owner cleared the selected Drive photos for website use and confirmed tree/bush
  trimming beside the Fredericksburg tower. Neighboring business name uncertain,
  so no business name, endorsement, customer identity or unconfirmed date added.
  The former client's photos 5/6 and associated job remain excluded.
- Pruning hero now shows the confirmed trimming climber. Stump-grinding hero now
  shows the operator following tree removal. Projects gains four full-frame photos:
  trimming, grinding, cleanup in progress and trimming beside the tower. Existing
  SD-card landscaping images and both case studies retained without alteration.
- New public-drive-photography.json and scripts/generate-drive-photography.py
  produce 480/840/1280/1600px WebP from hash-checked private originals. No source
  Drive credentials/URLs or original files ship. EXIF/GPS removed; all 16 shipping
  derivatives have provenance sidecars. No retouching or generative alteration.
- 155 local tests and validation of all 16 pages pass. Artifact comparison against
  the pre-edit local baseline: exactly three existing pages changed, plus 32 new
  derivative/sidecar files. All existing page heads and link destinations identical;
  homepage, shared styles, analytics/consent, estimate/draft code, sitemap, existing
  project content and CRM unchanged. Prior pending local work preserved.
- Browser review: desktop 1280x720; isolated same-origin 320px and 390px frames
  running the actual pages with collection/submissions blocked. No horizontal
  overflow, new hero images use contain, and gallery images load when scrolled
  into view. No console errors in the desktop review. Native browser viewport
  override had no effect; mobile checks use actual iframe layout widths, not
  physical-device or touch emulation. Physical-device checks remain unperformed.
- Mechanical detector findings concern retained shared styles/labels (legacy
  uppercase labels, overflow, padding and shadows); no new CSS or controls.
  Scoped visual review found no photo-layout regression. Verdict: ready for owner
  review locally. Evidence: October16 chat outputs/drive-photo-integration/.
- No commit, push, deployment, real analytics collection or lead submission.
  Before release, review the combined pending Landscaping/FAQ/label/photo patch
  and recheck the current repository head. Roll back only this photo patch's
  hunks/manifest/assets; do not restore whole files over other pending work.

## Landscaping case study and estimate-label contrast — local only, October 20, 2026

- Added `/projects/bush-trimming-mulch/` using the two approved commercial-property
  photos and confirmed trimming, weeding, edging and mulch scope. No planting,
  specific job location, date, client identity, testimonial or before/after claim.
- Linked from Landscaping and the Projects gallery. Existing page metadata and
  existing estimate destinations preserved; all four new-page estimate actions
  preselect Landscaping. Correct project photos/service in CreativeWork, plus
  canonical, social metadata, sitemap and resource-list entry.
- Optional form labels now 14px, fully opaque dark green. Measured contrast 10.96:1;
  optional/required email switching retained on desktop and phone.
- 155 tests /16 page validations pass. Manual desktop 1280×900 and mobile 390×844
  views, 320×568 overflow checks, both entry links and email preference verified
  through isolated loopback QA. No leads, calls or Google collection.
- Relative to the tenth-FAQ baseline, only six existing artifacts change, plus
  one new page. All 15 existing pages' metadata preserved. Analytics, consent,
  submission/draft engines, shared page CSS, privacy and tree case study unchanged.
- Independent finish reviewer: ship for this local extension; no material findings.
  Proof/reports: October16 chat outputs/landscaping-case-study/ and
  work/landscaping-case-study/. Desktop full-page image omitted painted photos;
  valid section captures used and accepted by reviewer. Mobile full capture valid.
- Includes pending tenth Landscaping FAQ. No commit, push or deployment authorized
  for this batch; public release remains e6c5c30. CRM unchanged.


## Tenth Landscaping FAQ — local only, October 20, 2026

- Added the owner-approved Landscaping question and confirmed service wording with
  a link to `/services/landscaping/`. Ten native disclosures, five per desktop column.
- 155 tests and 15 page validations pass; desktop and phone keyboard, single-open
  grouping, answer layout and Landscaping destination checked in isolated local QA.
- Only homepage output changed among 217 artifacts. All other homepage content,
  SEO, photos, buttons, estimate links, analytics/consent and CRM remain unchanged.
- No commit, push or deployment. Live public release remains e6c5c30.
- Fresh mobile PageSpeed lab report: performance 97, accessibility 97, LCP 2.0s,
  CLS 0; no field data. Next recommended task is contrast for the estimate form's
  optional-field labels. Evidence: October16 chat outputs/faq10-next-step/.


## Quieter cookie notice — push approved, publication held

Owner requested pushing the reviewed quieter banner. Commit and push only; use
[skip ci] [skip netlify] so neither Netlify project automatically deploys. Preserve
the two newer repository commits through 87193e3. Analytics property settings and
CRM code/settings/deployment unchanged. Public-site publication remains a separate
action; the currently live cookie banner is still the previous ba41899 release.

## Quieter cookie notice — local, October 19, 2026

Owner requested an even smaller, less noticeable banner after publication ba41899.
No new commit, push or deployment. Analytics property and CRM settings unchanged.

- Slim note and one control row: lighter border, no prominent visible heading,
  14px copy, inline Details link and equally styled Accept/Reject. Full accessible
  cookie labels and region heading retained. Close remains a 44px target.
- Desktop 360×118.6px; mobile 296×118.6px at320×568. Mobile actions 105×44px each;
  no overflow/wrapping, and clearance above existing mobile call/estimate bar.
  About half the published notice's footprint. Full policy content unchanged.
- Both choices still save and close immediately. Footer reopen focuses the current
  visible choice; it no longer focuses the visually hidden heading. Escape and
  focus restoration, saved rejection/reload and Details link pass with inert QA.
- 155 tests /15 page validations pass. All217 artifacts checked:200 unchanged;
  15 pages normalize exactly after consent-only markup/version updates, plus
  consent CSS/JS. SEO, photos, copy, estimate links and analytics engine unchanged.
- No real Google requests, leads or calls. Evidence: October16 chat
  work/quieter-cookie-banner/ and outputs/quieter-cookie-banner/.
  Physical-device and spoken-reader testing remain unperformed.

Earlier publication sections below describe previous releases.

## Cookie-banner publication approved — October 19, 2026

Owner approved committing, pushing and publishing the reviewed simple cookie
banner. Preserve the two newer CRM staging commits through d0241d7 without edits.
Use [skip ci] [skip netlify] on the release commit; trigger only the public Netlify
website project. Keep analytics property settings and CRM code/settings/deploy
unchanged. Run non-submitting production smoke checks: both choices close/save,
rejection survives navigation/reload, footer reopens, details link and mobile
layout remain correct. Do not submit leads or place calls. Record exact commit,
public deployment and unchanged CRM deployment in the release evidence/handoff.

Earlier local-review sections below describe their historical candidate states.

## Simple cookie banner and automatic dismissal — local, October 19, 2026

This supersedes the earlier compact panel candidate below. No new commit, push or
publish. Keep the live consent-based analytics configuration and CRM unchanged.

- Short Optional cookies notice, equal Accept cookies / Reject cookies controls,
  and Cookie details & privacy link to the existing full analytics policy section.
  No retention/provider details removed from that policy; no metadata changes.
- Both choices save/apply and close immediately. Footer Privacy settings reopens
  the controls. Focus returns to the opener or main content without scrolling.
  Confirmation is announced outside the closed banner; storage failure gets a
  compact visible page-only warning with Dismiss, instead of false saved success.
- 154 tests pass; 15 pages validate. Inert local browser verifies acceptance and
  rejection across reloads, withdrawal/reopen, Escape/focus, policy link, and
  mobile storage denial. No real Google requests, leads or calls.
- Desktop 420×203.5px; mobile 296×224.5px at 320×568. Equal 127×44px mobile
  actions, no overflow; storage warning 296×133px clears mobile quick actions.
- All 217 artifacts checked; 200 unchanged. All 15 HTML pages normalize exactly
  after consent-only markup/version changes; analytics engine unchanged.
- Evidence: October 16 chat work/cookie-banner/ and outputs/cookie-banner/.
  Design reference: https://design-system.service.gov.uk/components/cookie-banner/
  Physical-device and spoken screen-reader verification remain unperformed.

## Compact privacy panel — local review, October 19, 2026

Owner requested a smaller panel. No new commit, push or deployment in this batch.
Preserve the live consent-based analytics configuration and CRM code/settings.

- Compact 420 × 244px desktop panel; 296 × 286px at a 320 × 568px viewport.
  Shorter optional-analytics summary, less padding and an accessible header Close
  button. Initial redundant status line is hidden; saved choices and storage
  warnings remain visible. Full policy and 180-day preference wording retained.
- Equal side-by-side Allow/Reject controls, each 44px high (127px wide on the
  narrowest screen). No overflow or scrolling at 320px; above mobile quick actions.
  At 568 × 320px, the panel scrolls and controls remain reachable.
- Allow/Reject, saved rejection, Close, footer reopen, Escape/focus restoration
  verified with an inert local tag. No real Google requests, leads or calls.
- All 152 tests pass; 15 pages validate. All 217 artifacts checked: 200 unchanged;
  15 pages differ only in consent markup/asset versions, plus the two consent
  assets. Photos, SEO, copy, estimate links and analytics engine remain unchanged.
- Consent assets versioned consent2; validator follows the new version. Evidence:
  October 16 chat work/compact-privacy/ and outputs/compact-privacy/.

Earlier sections below record historical approvals and releases.

## Minimal Analytics activation — approved October 18, 2026

Owner delegated the recommended consent-based public-site launch. This supersedes
the earlier disabled/local-only hold for this batch. Commit with [skip ci] and
[skip netlify], preserve newer repository changes, and trigger only the public
website build. CRM code/settings/deployment unchanged; no leads or calls.

- Verified public GA property 437728721, stream 7989355946, G-8WMD200TXP.
- Remote automatic enhanced measurement/history/interactions off; tag automatic
  contact detection/user-provided capabilities off; Signals off; granular device/
  location off; ads personalization allowed in 0 of 307 regions. No cross-domain
  rules. Existing retention and historical event rules preserved and documented.
- Shipping gate active, consent denied by default. Google loads only after Allow.
  Manual sanitized page views and bounded phone/estimate clicks only; no form,
  lead, purchase or CRM events. Intrinsic Google session/engagement events remain.
- Active policy discloses Google processing, choices, 180-day preferences/cookies,
  actual property retention and withdrawal limits. Equal controls and footer
  access on all pages; storage failure, expiry and cross-tab withdrawal covered.
- 152 local tests pass and 15 pages validate. Actual Google DebugView receives
  all three requested signals from safe local QA; synthetic URL canary excluded.
  Zero before consent; withdrawal clears public cookies and blocks further clicks;
  regrant does not duplicate page views. No form submitted or call initiated.
- Public Netlify main/root build uses netlify.toml (npm run test:public/dist-public),
  Node 22.x; no injected snippets. Preserve production Maps configuration. Record
  exact commit/deploy, run production GET and consent/navigation smoke checks,
  confirm CRM published deploy unchanged, then update handoff/evidence.
- Tag's previous 48-hour inactivity notice and standard reporting may lag. Treat
  clicks as intent, not completed calls or verified leads. Physical-device and
  spoken screen-reader checks remain unperformed.

See PUBLIC_SITE_ANALYTICS_PREPARATION.md for the current configuration and QA.
Earlier checklist sections below describe their historical batch states.

## Consent controls — historical disabled-state review

Final October 18 review: fixed the saved-opt-in/read-only-storage edge case and
scoped the Privacy settings insertion to the footer, preserving the privacy-request
breadcrumb. The failing regression checks now pass. No open blockers found for
a release with analytics disabled. Activation remains a separate decision.

Owner approved consent controls, withdrawal cleanup, truthful privacy wording and
read-only automatic-measurement review. No commit, push, deploy, activation, Google
settings mutation or lead submission. CRM code/settings remain unchanged.

- Footer Privacy settings appears on all 15 public pages. No disabled-state prompt;
  Allow is unavailable and a saved opt-in cannot be banked while collection is off.
- Enabled simulation has equal Allow/Reject buttons, optional local preference
  storage with 180-day expiry, page-only fallback, resume/expiry checks and cross-tab
  withdrawal. Keyboard focus and mobile quick-action clearance verified.
- Withdrawal disables collection, clears bounded attribution and targets only the
  public stream's root GA cookies. Synthetic cookie tests leave unrelated state.
- All 150 local tests pass; 15 built pages validate. No real Google library or
  delivery used. Shipping gates remain false / empty measurement ID.
- Public privacy copy reflects disabled collection, choice storage, withdrawal
  limits and separate estimate draft/marketing choices. Before activation, update
  the active policy to match approved provider/retention settings.
- Remote review found all seven enhanced measurements enabled, including forms and
  search, plus history-based views. No switches or settings saved. Tag-level editor
  and quality-issue cause remain unverified; resolve before activation. See
  PUBLIC_SITE_ANALYTICS_PREPARATION.md for the minimal-setting recommendation.
- Later authorized Google delivery/cookie checks are required before activation.
  Form acknowledgments are not verified unique leads. CRM contracts are unchanged.

## Option 1 homepage and commercial testimonial publication approved

Owner approved committing, pushing and publishing the reviewed option 1 copy and
commercial testimonial role/bracket correction. Preserve newer repository work.
Keep analytics disabled and CRM code/settings unchanged. Use [skip netlify] in
the release commit, trigger only the public website Git build, and run non-
submitting production smoke checks. Do not submit leads or alter hosting inputs.
The local-only sections below record the earlier review state.

## Option 1 copy and commercial attribution final review — local only

Owner requested final regression/release-readiness review and confirmed the
Google reviewer donnysmooth is Chancellor Green HOA President. Preserve the
Google display name, add the role below it, and remove brackets around trees.
Update the shared review source, renderer, source notes and matching validator.
Do not add an organization endorsement or Review/AggregateRating schema.

The exact approved option 1 homepage descriptions remain unchanged. Preserve
photos, buttons, CSS, SEO heads, estimate URLs/context and scripts. Keep analytics
disabled and CRM code/settings unchanged. No commit, push or deploy authorized.
No customer data or form submission.

- Fresh134tests pass and15approved pages validate. Only homepage/commercial
  HTML differ among215builtfiles;213unchanged. The homepage exactly matches the
  approved option1implementation. Reversing the two commercial body edits
  reproduces its published hash; all15SEOheads/links/photos/buttons preserved.
- Fresh local keyboard service destinations and Landscaping estimate prefill
  pass withblankname/details. Commercial1440/390/320: role wraps readably with
  nooverflow; originalGoogle displayname/year/link retained, brackets removed.
  Existing8homepagecaptures remain valid by exact source/buildhash equality.
- Shared main55d0ba5 includes2newer platform-only commits, no public overlap.
  Preserve then-current repository work at any separately approved publication.
- Reuse homepage single41inheritedfindingscan; onecommercialscan6existing
  sharedstylefindings. No CSS changes or new role/layout issue.
- Evidence: October16chat work/service-copy-commercial-final-review/ and
  .impeccable/review/service-copy-commercial-final-review/. Fresh finishreview:
  ship for local review, no fixes. Documentation complete; all215hashes independently
  verified. No physicaldevice/spoken-screen-reader/
  productiondelivery tests. After approved release, run non-submitting smoke.

## Warm homepage service copy — local only

Owner approved option 1 for both homepage service cards. This supersedes the
previous descriptions, published as64ff25c, only in this local candidate.
Do not commit, push or deploy this batch. Keep analytics disabled and CRM unchanged.

- Tree Service: Care for the trees you love. Count on our arborist-led team for
  pruning, tree removal, stump grinding and more.
- Landscaping: Bring out the beauty in your yard with bush and hedge trimming,
  tidy garden beds and fresh mulch.
- Update visible paragraphs and duplicate legacy configuration together. Preserve
  photos, buttons, existing CSS, SEO heads, estimate URLs/context and all scripts.
- Local verification complete:134tests pass and15approved pages validate. Only
  index.html differs among215built files;214unchanged. Reverse the four approved
  replacements to reproduce the published homepage exactly.
- Browser1440/1280/760/576/390/320: readable copy, nooverflow/overlap, aligned
  paired actions. Both Explore keyboard destinations and Landscaping estimate
  selection pass, with name/details blank. No data entered or form submitted.
  Existing CSS/button rules unchanged;56pxactions except naturally wrapped72.8px
  labels at576.
- One detector:41exact inherited findings, none new. Evidence: October16chat
  work/service-copy-warm/ and .impeccable/review/service-copy-warm/.
- Fresh finish review: ship, no material fixes. Ordinary-extension documentation
  comparison complete; all215artifact hashes independently verified.
  Physical-device/spoken-screen-reader/production delivery not tested.

Earlier publication approvals below apply to their historical batches only.

## Homepage service-description publication approved

Owner approved committing, pushing and publishing the reviewed homepage copy and
scoped card alignment. Preserve newer repository changes; keep analytics disabled
and CRM code/settings unchanged. Skip automatic Netlify builds in the release
commit and trigger only the public website build. Run non-submitting production
smoke checks after publication; do not submit production leads.

The local-only sections below record the earlier review state.

## Final homepage service-description review — local only

Ready for owner release approval within this service-card patch scope. No commit,
push or deploy authorized. Analytics disabled and CRM code/settings unchanged.
No product edits were needed in this final review.

- Fresh134tests pass and15approved pages validate. Fresh215-file build exactly
  matches implemented/reviewed hashes. Onlyhomepage/CSS differ from4d7bb9e;
 213otherfiles, all15SEOheads, photos, buttons/styles/URLs, estimates, scripts,
  privacy and crawlers preserved. Source reverse-replacement comparison passes.
- Fresh browser at1440/1280/760/576/390/320: approvedcopyreadable/nooverflow,
  side-by-sidebuttons align; exact existing56pxbuttons except natural two-line
  labels at576where bothare72.796875px. No clipping or style changes.
- Hover remains green text onwhite; focus3pxwhite/4pxoffset. BothExplore links
  work with keyboard; Landscaping estimate stillselectsLandscaping with blank
  details. No customerdataentered, formsubmission or productionlead.
- Fresh full independent finish review: ship, no materialfixes, all9section/state
  captures valid. Documentation comparison follows. No seconddetector because
  exact unchangedproduct/build reuses prior single41inheritedfinding scan.
- Read-only fetch found4newer main commits through26d1860, onlyapps/platform/no
  publicoverlap. Preserve then-current sharedwork and recheck build inputs when
  preparing an approved release. Publish publiconly with analyticsdisabled and
  CRMunchanged; run non-submitting production smokeafterwards.
- Evidence: October16chat work/service-descriptions-final-review/ and
  .impeccable/review/service-descriptions-final-review/. Viewportreset. Physical-
  device/spoken-screen-reader/production smoke/CRMdelivery not tested here.

## Confirmed homepage service descriptions — local only

Owner approved the two recommended descriptions with photos/buttons/SEO/estimate
links preserved, analytics disabled and CRM unchanged. Local tests only; do not
commit, push or deploy under earlier publication approvals.

- Tree Service: Tree removal, pruning, stump grinding and storm cleanup.
- Landscaping: Bush and hedge trimming, weeding, edging and mulch for existing
  gardens and planting beds.
- Changed visible paragraphs and duplicate legacy card configuration. Only added
  a min-width576px card-container stretch rule because the longer Landscaping
  copy otherwise lowered its button. Button styling, labels and URLs unchanged.
- Fresh134tests and15-page validation pass. Reverse replacements reproduce the
  old index exactly; removing the new container rule reproduces old CSS exactly.
  Only2of215built files change;213unchanged. All15heads, real photos, estimate
  links/context, scripts, privacy, crawlers, analytics and CRM unchanged.
- Browser1440/1280/760/390/320: readable wrapping/nooverflow; actions remain
  equal56px and align side-by-side. Both Explore destinations and Landscaping's
  estimate selection pass. No customer data or form submission. Viewport reset.
- Evidence: October16chat work/service-descriptions/ and7section captures under
  .impeccable/review/service-descriptions/. One detector run:41exact inherited
  findings, none new. Fresh finish review/documentation comparison follow.

## Approved navigation publication

The owner explicitly approved commit, push and publication of the reviewed
Tree services/Landscaping navigation patch, preserving newer repository work,
analytics disabled and CRM unchanged. This supersedes this batch's earlier local-
only holds below. Apply only the reviewed public patch on current main; use
[skip netlify] to skip both projects' automatic builds, then trigger only the
public project's Git build. Preserve production Maps input and hosting settings.
Do not submit production leads. Run non-submitting production smoke checks and
verify CRM deployment/settings unchanged. No extra product changes authorized.

## Final Tree services / Landscaping navigation review — local only

Ready for owner release approval at this public-navigation scope. Do not commit,
push or deploy until approved. Analytics remains disabled; CRM code/settings
remain unchanged. No product edits were needed in this final review.

- Fresh134tests pass and all15approved pages validate. Fresh build exactly
  matches all215implementation artifact hashes. All15SEO heads, content outside
  headers, estimate links/context, photos, form/draft/address scripts, analytics
  and crawler files remain unchanged; only15HTMLheaders and2CSS differ frombase.
- Fresh loopback browser review passes at1440/1280/1101/1100/960/760/390/320px
  and568x320landscape. No overflow or desktop identity wrapping. Both desktop/
  mobile service links and current states work. Keyboard focus, Escape return,
  outside click, focus exit and scrollable short-screen access pass.
- Nonpersonal local project details survive navigation and Landscaping estimate
  selection. Clear draft empties the marker, resets context and focuses Fullname.
  No personal/contact data entered, no form submitted, zero production leads.
- Fresh full independent finish review: ship, no material fixes; all10required
  header/menu captures valid. This replaces the implementation's F1-only verdict
  as the latest full navigation review. Documentation comparison follows.
- Fetched main27b70da:6newercommits onlyapps/platform, no public-file overlap.
  Preserve newer shared main when preparing any future approved release; do not
  recommit or revert CRM work. Recheck main/build inputs at publication time,
  skip both automatic builds, publish public website only, then non-submitting
  production smoke and verify CRM deploy/settings unchanged.
- Final evidence: October16chat work/service-navigation-final-review/ and
  .impeccable/review/service-navigation-final-review/. No second detector:
  unchanged product/build uses prior single scan's42inheritedfindings. Physical-
  device/spoken-screen-reader and CRM delivery testing were not performed here.

## Separate Tree services and Landscaping navigation — local only

Owner approved implementation/local tests only. Do not commit, push or deploy this
new batch under earlier publication approvals. Keep analytics disabled and CRM
code/settings unchanged.

- Both homepage header variants, homepage compact/legacy menus, and the shared
  interior-page generator include Tree services → /services/ and Landscaping →
  /services/landscaping/, in sentence case. Existing destinations remain.
- Landscaping receives its own current-page state rather than marking Tree
  services. Fixed specificity that suppressed desktop underline/hover states.
- Navigation switches to the existing native-details menu at <=1100px to avoid
  crowding; short menus can scroll. Homepage menu links and summary are >=44px.
  Interior menu links retain their existing >44px dimensions.
- Local134tests and15-page validation pass. Validator checks both new navigation
  labels/destinations/order and Landscaping's exclusive current state.
- All15page heads and content outside headers are unchanged against5bfc9a2.
  Estimate destinations/prefills, photos, crawler files, privacy, analytics-off
  and all form/draft/address-autocomplete scripts remain unchanged. Only15HTML
  headers and2stylesheets change in the215-file build;198files unchanged.
- Local browser checks cover desktop1440/1280, breakpoint1101/1100,960,760,
  mobile390 and narrow320. Both service destinations work with keyboard;
  Landscaping's estimate still selects Landscaping. Escape closes/focuses Menu.
  No personal data entered, no form submitted and no production lead.
- Evidence: October16 chat work/service-navigation/ and
  .impeccable/review/service-navigation/. Independent finish review and
  documentation comparison required before final delivery; record their result
  there. Fresh full finish review found one desktop-brand wrapping issue;
  reserved350px at1101–1280px, rebuilt and recaptured all8viewports. Reviewer
  scored F1 resolved (ship, F1-only verdict). Physical-device and spoken-screen-
  reader checks are not claimed.

## Matching homepage Explore buttons — October 17, 2026

The owner rejected the published asymmetry: Tree Service had an animated Explore
pill, while Landscaping had a text link and an estimate pill. The correction
uses one matching primary Explore pill per card: Explore tree services →
/services/ and Explore landscaping → /services/landscaping/. This intentionally
replaces the card-level Landscaping estimate primary; service-page estimates,
the global estimate path and all form/draft behavior remain unchanged.

- Both buttons share the same300px maximum width,56px height,16px700Poppins,
  220ms green/white fade, padding and3pxwhite keyboard-focus outline. Width
  shrinks equally to available card space. Button rows align at desktop/tablet.
- Desktop1440, user1280, tablet760, mobile390 and narrow320 pass without
  overflow; labels stay on one line and both target heights remain56px. Both
  keyboard destinations work; Landscaping's page estimate still preselects it.
- All134tests/15pages pass. Only homepage/CSS built artifacts change;213other
  files, all page heads, photography, privacy, analytics and form/draft JS remain
  byte-identical to f53e951. Validator now checks two real Explore destinations
  instead of requiring the superseded card-level estimate action.
- Analytics remains disabled; CRM code/settings and hosting remain untouched.
  No customer data or form submission. One detector pass gives the same41
  inherited findings, none new. Fresh review/documentation evidence is in the
  October16 chat work/equal-service-buttons/ and screenshots in
  .impeccable/review/equal-service-buttons/.
- Publish the correction as continuation of the owner's existing explicit
  commit/push/publish approval and current request to make the live buttons
  equal. Finish review first, preserve any newer main work, use [skip netlify]
  and trigger only the public project's Git build. Keep production Maps input,
  verify CRM deployment unchanged and run non-submitting production smoke.

## Approved draft-recovery, Landscaping-link and privacy publication — October 17, 2026

The owner approved commit, push and publication of the final reviewed public
website patch. This supersedes this batch's local-only holds below. The approved
homepage includes “Explore landscaping services” above its retained estimate
button. Keep analytics disabled and CRM code/settings unchanged. Preserve newer
shared-main work, use `[skip netlify]` to prevent both projects' automatic builds,
and trigger only the public project's Git build. Preserve production Maps input.
Do not submit production leads; run non-submitting live smoke checks and verify
CRM's published deployment remains unchanged. No additional feature changes.

## Final draft-recovery / Landscaping-link / privacy review — October 17, 2026

Owner requested final regression/release review and correction of the privacy
wording. Keep analytics disabled, CRM code/settings unchanged, no push/deploy.
This review supersedes the implementation-only evidence and privacy follow-up
below. Readiness: local patch passes independent final review (`ship`, no material
fixes). Publication remains held; release steps below still apply.

- Corrected public privacy body/date only: Google Analytics collection is
  disabled, no active public-analytics provider claim, factual tab draft storage,
  30-minute inactivity expiry, suspended-timer caveat, Clear draft, verified
  success cleanup, consent exclusion and storage-unavailable fallback. All
  metadata, links and unrelated platform claims remain intact.
- Found and fixed an expired-draft history regression. A reconstructed history
  document could remove an expired record during initialization, then recover
  browser-native field values before pageshow. The first pageshow now retains
  the initial expiry result and resets those expired values. Added a meaningful
  failing-before/passing-after regression test. Browser confirmation: expire
  while visiting Privacy, then Back → empty fields, expiry notice, no saved copy.
- Fresh final checks:134/134 tests and15-page build validation pass. Compared to
  released73a099d,4existing built files change (homepage, shared form helper,
  overrides and privacy body),1draft script is added;210others are identical.
  All15page heads, every previous homepage href, all photos/provenance,
  analytics bytes and production autocomplete source are preserved.
- Fresh keyboard homepage Explore landscaping services → Landscaping hero
  estimate selects Landscaping. Privacy browse/Back preserves exact multiline
  and emoji customer text and resets marketing opt-in. Clear resets fields,
  context and retry identity, focusing Fullname. Existing isolated mock failure,
  ambiguous acknowledgment and success evidence remains applicable; no new
  browser submission was made in this review. No production lead or CRM call.
- New desktop1440x1000 privacy, user1280x720 estimate/expiry and390x844 mobile
  captures show the complete new draft and analytics paragraphs without clipping
  or horizontal overflow. Earlier unchanged service-card captures remain valid;
  previous320/390/760/761/1280/1440 numeric layout checks cover shared UI.
  All synthetic review drafts were cleared and viewport/test clock reset.
- Read-only GitHub snapshot:main bd6ea2d8972a6435052c5604e0e106dc2371c1f8
  is5commits ahead of local73a099d; changed paths only apps/ and supabase/,
  with no public patch overlap. No fetch, merge, rebase or repository-index
  change. Preserve those newer commits in a later approved release and rebuild
  its exact final commit. Hosting state/settings were not queried or changed.
- Before publication: preserve current shared-main work, verify exact release
  build, refresh both Netlify projects/production Maps input, then publish only
  the website and run non-submitting production smoke checks. Physical devices,
  spoken screen reader and isolated CRM delivery remain untested. These local
  browser/form changes introduce no CRM contract or endpoint change.
- Final independent review: `ship`, all9required section captures valid and no
  material fixes. Final documentation comparison preserves incumbent system
  files; no design-token, visual-world or unrelated legacy repair is required.
- Final evidence: October16 chat work/estimate-draft-recovery/final-review-*
  and .impeccable/review/estimate-draft-recovery/final-*.jpg. Local preview
  http://127.0.0.1:53639/privacy/ uses a loopback fixture and blocks external
  form/connect traffic; it is not the production CRM. No commit, push or deploy.

## Approved local estimate draft recovery and Landscaping access — October 17, 2026

Owner approved tab-only estimate draft recovery with Clear draft, expiry and
cleanup after successful submission. Preserve SEO/estimate links, disabled
analytics and unchanged CRM. No commit, push, deploy or production lead tests.
The homepage Landscaping card gains an additive “Explore landscaping services”
link while its existing estimate button and destination stay intact. On the
current live website the route remains Services → Explore landscaping services;
the homepage shortcut is part of this local patch.

- Save only allowlisted customer fields and compatible service/context choices
  in sessionStorage for the current tab. Expire after 30 minutes without edits;
  restoration and browsing do not extend expiry. No persistent-storage fallback,
  marketing consent, honeypot, attribution, endpoint URL or server response saved.
- Preserve literal text and retry identity through browsing/reload. Explicit
  estimate links still select their service. Clear draft resets current fields,
  context and retry identity, focuses Full name, and prevents stale browser
  history from recovering the discarded details. Disable Clear while submitting.
- Clear saved details only after the existing verified success acknowledgment.
  Failed, network and ambiguous responses keep the draft. The real browser
  exposed a native history-restoration case; reconciliation now also covers
  reconstructed back/forward pages as well as bfcache pages.
- Storage denial, quota, malformed/expired records and oversized entries leave
  the form usable; never silently truncate customer text. Active form timers and
  reads enforce expiry. Suspended background pages can delay physical cleanup;
  an expired record is never restored. Current open fields remain after expiry.
- Local checks pass: 134/134 tests and all 15 pages validate. All 15 existing
  page heads and every previous homepage link are preserved. Four existing
  built files change (homepage, form helper, overrides and privacy body), one
  draft script is added, and the other 210 artifact files are byte-identical. All photos,
  provenance, analytics configuration and CRM/hosting settings are unchanged.
- Isolated local browser checks cover browse/return, literal multiline/emoji
  input, conditional email, consent exclusion, failure/ambiguous/success, Back
  after success, keyboard Clear/focus, reload and 31-minute expiry simulation.
  Desktop 1280/1440 and widths 320/390/760/761 show no horizontal overflow. New
  actions are at least 48px tall and keyboard focus is visible. Synthetic data
  was cleared; four mock submissions went only to a loopback fixture endpoint.
- Independent finish review: `ship`, no material fixes. One detector pass finds
  exactly the same 41 inherited findings as the previous homepage review; no
  new notice/link findings. Documentation comparison preserves incumbent files.
- Local evidence: October 16 chat work/estimate-draft-recovery/ and
  .impeccable/review/estimate-draft-recovery/. Preview at
  http://127.0.0.1:53639/#services uses an isolated mock transport, not the CRM.
- Before a future approved release: reconcile newer shared-main work, rerun the
  final release build, refresh both Netlify projects and production Maps input,
  publish only the website, and run non-submitting production smoke checks.
  Physical-device/spoken-screen-reader and isolated CRM-delivery tests remain
  unperformed. The final review above corrects the public analytics wording
  and adds the factual draft disclosure; collection remains disabled. No
  unrelated platform policy rewrite is included in this local feature.

## Approved Landscaping publication — October 17, 2026

The owner approved commit, push and publication of the final reviewed Landscaping
service-page patch. This supersedes this batch's earlier local-only holds.
Keep analytics disabled and CRM code/settings unchanged. Preserve newer shared
main work, use `[skip netlify]` to prevent automatic builds, and trigger only the
public project build. Preserve production autocomplete configuration. Do not
submit production leads; run non-submitting production smoke checks and confirm
the CRM deployment is unchanged. No additional website features or draft-storage
changes are included in this release.

## Final Landscaping regression and release review — October 17, 2026

- Ready for release approval at this public-patch scope; no blocking regression
  or code fix identified. Fresh 101/101 tests and all 15 pages pass. All 214
  rebuilt files match the reviewed artifact, preserving existing SEO, homepage,
  previous estimate links, shared CSS/JS and photo bytes.
- Keyboard hero/Services/footer and mobile quick-estimate journeys select
  Landscaping. Desktop and 320/390/760/761px checks pass; the mobile menu opens
  and Escape closes it. Fresh valid desktop/mobile captures saved.
- Existing limitation: in-page estimate actions preserve entered details, but
  unsent details are not persisted through a full trip to another page and a
  fresh form. Reproduced with a local synthetic note and cleared it afterward.
  This is unchanged baseline form behavior, not a new regression. Cross-page
  draft recovery would be a separate improvement; it was not added here.
- Read-only GitHub comparison: shared main at `449f73e` is three commits ahead
  of this base, all changes under `apps/` and `supabase/`; no public patch
  overlap. Preserve that newer work in a future approved release and rerun
  the release build on its final commit. No branch/checkout was changed.
- Before publication, refresh both hosting projects' state and preserve the
  existing production Maps input; publish only the public website and run
  non-submitting live smoke checks. Current hosting settings were not queried
  in this local review. Physical devices, spoken screen reader and isolated
  CRM lead delivery remain unverified. Analytics stays disabled; CRM/settings
  unchanged; zero production leads. No commit, push or deployment.
- Final review bundle: October 16 chat `outputs/website-landscaping-service-final-review.*`,
  with fresh test/invariant/browser evidence in `work/landscaping-service/`.
  Use this final bundle for a later approved release.

## Approved local Landscaping service page — October 17, 2026

Add `/services/landscaping/` using the existing service-page layout, approved
garden-path and commercial-hedge photographs, and confirmed bush/hedge trimming,
weeding, edging and mulch/bed care. Link from the Services page while preserving
its existing estimate link. Keep tree trimming connected to existing pruning
guidance. Do not infer planting, lawn care, job dates/locations or before/after
claims. General Fredericksburg wording describes the existing service area.

- Reuse existing image variants and provenance without modifying photo bytes.
- Keep all existing page metadata, H1s, URLs, homepage and estimate links intact.
  Add the new page's metadata, Service/Breadcrumb schema, sitemap and resource
  links. Its own hero, final, footer and mobile estimates select Landscaping
  through the existing form; no new CRM fields, intent, JavaScript or endpoint.
- Run public tests/build/15-page validation, responsive/keyboard checks, and
  verify existing SEO, image/script bytes and form behaviors are preserved.
- Keep analytics disabled and CRM code/settings unchanged. Do not commit,
  push, deploy, submit production leads or change hosting settings.

### Completed local checks

- All 101 tests pass; the generated release artifact validates all 15 approved
  pages. Existing 14 page heads, homepage, estimate links, full case study,
  image bytes and shared CSS/JavaScript are preserved. Only the Services hub,
  sitemap and crawler resource list change, alongside the new page.
- Browser checks pass at 320/390/760/761/1280/1440px with no horizontal overflow
  or clipped heading. Both approved images load in complete frames. Services
  navigation and the Landscaping estimate work with the keyboard and mouse;
  all four new-page estimate actions retain Landscaping. Mobile menu Escape
  dismissal works. Main actions are 54px high; the mobile estimate is 48px.
- Independent visual finish review: `ship` at this ordinary-extension scope,
  with no material fixes. One malformed mobile screenshot was replaced and
  the complete page reviewed again. Eleven inherited detector findings in
  unchanged shared styling/Services eyebrow remain outside this patch.
- Final documentation comparison is complete. The page matches the incumbent
  public-site system; no new design tokens, components or system files are
  needed. Existing guide/context drift is recorded without unrelated repair.
- Local preview: `http://127.0.0.1:63816/services/landscaping/`. Local evidence
  is in the October 16 chat's `work/landscaping-service/` and
  `.impeccable/review/landscaping-service/`. The preview blocks outbound
  requests and website submissions. No production leads were submitted.
- This remains a local patch. Analytics is disabled; CRM code/settings and
  hosting are unchanged. No commit, push or deployment. An approved release
  still needs current shared-main/hosting reconciliation, preservation of the
  production autocomplete input, and non-submitting production smoke checks.
  Physical-device, spoken screen-reader and isolated CRM-delivery checks
  have not been performed.

## Approved bucket-truck and Services-button publication — October 16, 2026

The owner approved commit, push and publication of this reviewed four-file
website patch. This supersedes the local-only holds below for this batch. Keep
analytics disabled and CRM code/settings unchanged; do not submit production
leads. Preserve the newer CRM-only commit on the shared branch. Use a commit
with `[skip netlify]`, then trigger a Git build only for the public project.
Verify the published commit, readable completed Services hover, bucket photo
and caption, SEO/estimate links, production autocomplete and disabled analytics
with non-submitting checks. Confirm the current CRM deployment is preserved.

## Final bucket-truck and Services-button review — October 16, 2026

- Reproduced the owner's Services-button defect after the hover animation: a
  white `::before` fill covered the button while its label remained white.
  The scoped override used `.user-items-list-section-button`, but the actual
  link uses `.list-section-button`. Corrected all nine occurrences in that
  existing override group, so its existing readable hover/focus colors and
  pseudo-element suppression apply. No button text, destination or JavaScript
  changed. Other button selectors and declarations are untouched.
- Confirmed the completed hover state shows a green label on the pale surface,
  with no fill overlay and full opacity. Keyboard focus has a visible white
  outline; Enter on the Services link reaches `/services/`. Desktop 1440px and
  widths 320/390/800/801 have no horizontal overflow; service and spotlight
  links retain at least 48px height. The complete bucket photograph and caption
  remain readable on desktop and mobile.
- Fresh local verification: all 101 tests and the 14-page build validation pass.
  Homepage HTML outside its approved photo/caption figure is byte-identical to
  the published baseline. Only built `index.html` and `overrides.css` differ;
  the other 211 artifacts, all image bytes and full case study are unchanged.
  SEO, estimate links, form and script behavior remain unchanged. The detector
  reports the same 41 inherited findings with no new findings.
- Ready for release approval at this public-patch scope. No unresolved patch
  regression was found after the hover fix. No commit, push, deployment,
  production lead or CRM/settings change. Analytics remains disabled. For a
  future approved release, refresh shared repository/hosting state, preserve
  the existing production autocomplete input, and run non-submitting live checks
  including the completed Services hover state. Physical-device, spoken screen
  reader and isolated end-to-end CRM delivery remain outside these local checks.
- Current review proof is in the October 16 chat under
  `work/bucket-spotlight-release-review/` and
  `.impeccable/review/bucket-spotlight-release-review/`. Earlier photo-only
  review bundles are historical; use the final combined review manifest/patch.

## Approved local refinement — homepage bucket-truck spotlight, October 16, 2026

The owner approved replacing only the homepage spotlight photo and its caption.
Reuse the documented project's existing bucket-access WebP variants and source
provenance. Alt text describes the visible worker, tree, house and overhead lines;
the caption reads “Bucket-truck access during tree removal beside the home.”
Keep the full case study and its hollow-log photograph unchanged, along with
homepage SEO, project/estimate links, form behavior and all other imagery.

- Keep analytics disabled and CRM code/settings unchanged.
- Run the local public test/build/validation suite and inspect desktop/mobile
  framing, image loading and unchanged spotlight links before review.
- Completed: 101 local tests pass and all 14 approved pages validate. Desktop
  1440px and mobile 390px show the complete photograph and matching caption,
  with no horizontal overflow and both links at least 48px high. Only built
  `index.html` changes; the other 212 artifacts, full case study, image bytes,
  homepage SEO, form, scripts and spotlight links are unchanged. The 41 existing
  homepage detector findings are identical to the previous photo review.
- This approval is local only: do not commit, push, deploy or submit leads.

## Approved production release — October 16, 2026

The owner approved commit, push and publication of the reviewed photography and
homepage spotlight patch. This supersedes the local-only hold below for this
batch. Keep analytics disabled and CRM code/settings unchanged; no production
lead submission. Preserve newer CRM-only commits on the shared branch.

- Verified the exact reviewed patch and all 55 source/asset/documentation hashes
  before applying it to a fresh detached release checkout at current main
  `022039a8798091b3bbc0e2770ee6f3bcf50b8689`. The earlier review checkout remains
  untouched. Only this approval note differs from the reviewed files.
- Commit with `[skip netlify]` to suppress both shared-repository automatic
  builds, push normally, then trigger a Git build for the public project only.
  Do not trigger a CRM build, change settings or enable analytics.
- Public production autocomplete input is present in its existing production
  environment; preserve it and verify the deployed code/configuration.
- Run non-submitting production smoke checks for the homepage spotlight,
  service-context/draft preservation, refreshed photos/captions, responsive
  layouts, metadata/routes/assets and disabled analytics. Confirm the CRM's
  published deployment remains unchanged.

## Final photography and homepage spotlight review — October 16, 2026

- Corrected the commercial gallery wording following the owner's clarification:
  Angel trimmed the existing bushes, weeded the beds and edged them. Removed
  “Planting around a commercial property” and the former commercial captions;
  neither card now implies that Angel installed the bushes.
- Fixed a loading regression in the new gallery image modifier. A bare
  `aspect-ratio: auto` suppressed the HTML image's initial ratio, allowing lazy
  images to have zero height before decoding. `aspect-ratio: auto 16 / 9` reserves
  the landscape frame, then retains the natural ratio. Confirmed positive image
  height while images were still incomplete at 320px, 390px and 615px.
- Fresh `npm run test:public`: all 101 tests and all 14 approved pages pass.
  Home, Projects and Commercial fit 320, 390, 615, 800, 801 and 1440px without
  horizontal overflow. Corrected commercial cards are readable in fresh desktop,
  mobile and current-window screenshots. Both spotlight actions remain at least
  48px high. Enter on the estimate action preserves typed contact/address/details
  and contact choice, selects Tree Care/tree-removal, retains attribution and
  focuses the service field. No website form was submitted.
- Existing SEO heads/H1s, homepage form/scripts, documented case HTML and all
  22 new photo bytes remain unchanged from their respective reviewed baselines.
  Since the initial photo review, only Projects HTML and `site-pages.css` change
  in the built artifact. Analytics stays disabled; CRM source/settings untouched.
- Refreshed `origin/main`: `022039a8798091b3bbc0e2770ee6f3bcf50b8689` contains two
  CRM-only commits beyond this checkout. The complete public-only patch passes
  a clean apply check against that revision using a temporary index; the real
  index and checkout are unchanged. Carry the public patch onto current main
  during approved release preparation, preserving that newer CRM work.
- Read-only Netlify checks confirm published deploys remain public website
  `6ad28d05f686e6b16c049ddd` and CRM `6ad23c757dfc53f702ae00b9`, both ready.
  No project setting or environment variable was changed or credential exposed.
- Current evidence is in the October 16 chat's `work/photography-release-review/`
  and `.impeccable/review/photography-release-review/`. Earlier photo-review
  captures of the commercial captions are historical; use the new captures.
- Fresh full finish review: `ship` at the local public-patch scope, no remaining
  material fixes. Documentation comparison rechecked the corrected maintenance
  facts and reserved image frame; incumbent identity is preserved. The final
  source inventory and patch are `outputs/website-photography-final-review.json`
  and `.patch` in the October 16 chat; earlier review bundles are historical.
- Release hold remains: no commit, push or deploy. Before publication, refresh
  the shared branch/project state again, verify the production autocomplete
  environment, and publish only the public artifact after approval. Follow with
  non-submitting production smoke checks. Isolated end-to-end CRM submission,
  physical-device and spoken-screen-reader checks remain unverified; this
  public patch does not authorize production leads or CRM changes.

## Approved local refinement — selected SD-card photography

After reviewing the complete SD image inventory, the owner requested using the
stronger photos to improve the website. This extends the local homepage spotlight
batch below. Do not commit, push or deploy. Keep analytics disabled and CRM code,
settings and lead records unchanged. The owner authorized these photos for website
use and confirmed bush trimming, tree trimming and mulch for the garden group.
The owner then clarified that Angel did not plant the commercial bushes: Angel
trimmed them, weeded the beds and edged them. The final commercial captions use
that maintenance scope and remove the misleading “Planting” heading, without
a new case study, location, date, installation claim or before/after pairing.

- Homepage: replace the grass-only hero background with the selected flowering
  tree/driveway photograph; align its two AVIF preloads and WebP fallbacks.
  Replace the Landscaping circle with the stronger garden photograph.
- Projects: use four complete landscape frames for the field gallery: garden
  path, flowering tree, commercial overview and hedge/mulch detail. Keep the
  documented six-photo Fredericksburg case and homepage spotlight intact.
- Commercial page: replace the unrelated residential garden hero with the
  commercial-property photograph, shown in full in the established hero columns.
- Preserve existing SEO text, schema, canonicals, routes, hero wording, trust
  claims, estimate links, draft-preservation behavior and veterans terms.
  Homepage head changes only to the two hero image preloads. Image alternatives
  describe the visible scene without unsupported service/location claims.
- `public-site-photography.json` records selected sources and responsive variants.
  `scripts/generate-site-photography.py --source-dir <originals>` reproducibly
  creates derivatives with Pillow, original hashes and provenance sidecars.
  Original images stay private; derivatives omit EXIF/location metadata.
  Deploy builds use committed derivatives and do not access the SD card.
- Local verification complete: `npm run test:public` passed all 101 tests and
  the 14-page build validation. Homepage head (except the two preloads), all
  generated SEO heads/H1s/scripts, homepage form markup and exact documented
  case HTML match the pre-photo baseline. All 22 new derivatives pass filename
  hash, dimensions, EXIF-removal and source-provenance checks.
- Inspected desktop 1440 × 1000, mobile 390 × 844 and the current 615 × 724
  window across Home, Projects and Commercial: readable text, complete photo
  frames and no horizontal overflow. WebKit full-page snapshots omitted some
  offscreen image paint; actual viewport supplements verify the desktop
  spotlight and all four gallery images at 615px. Viewport overrides reset.
- Independent finish review: `ship` for this local photography scope; no
  material fixes. One detector run returned 42 inherited findings (the extra
  versus the earlier 41 is unchanged wave CSS in a newly scanned stylesheet).
  New image provenance is complete. The scan also identifies 15 pre-existing
  logo/service/testimonial WebPs without sidecars; their bytes are unchanged.
- Evidence: October 16 chat `work/photography-refresh/` contains validation,
  invariants, source/artifact hashes, derivative audit, detector comparison,
  browser checks and finish review; screenshots are under that chat's
  `.impeccable/review/photography-refresh/`.
- Before release: obtain publication approval, verify the final exact
  public-only diff/assets, and refresh shared Git/both Netlify project state.
  After an approved public-only release, run non-submitting production smoke
  checks. Do not submit production leads or trigger a CRM deploy.

## Approved local batch — homepage Fredericksburg project spotlight

The owner approved implementation and local testing on October 16, 2026. Do not
commit, push or deploy this batch. The live baseline remains `921875f`, public
deploy `6ad28d05f686e6b16c049ddd` (veterans discount). Separate release approval
is required before publication.

- One compact spotlight after Services links to the existing Fredericksburg case.
  Reuse its cleared hollow-wood photo, responsive WebP variants, literal caption
  and confirmed facts. Keep public location city-only. No new project, photo,
  customer/street disclosure, disease diagnosis, risk rating or guarantee.
- Preserve the existing complete homepage head, metadata/schema, H1 and earlier
  headings, hero, form markup, script elements, URLs, sitemap and routing. Keep
  the veterans terms, named credential and six-photo case unchanged. Add only
  the spotlight's H2, factual copy, project link and contextual estimate action.
- The new estimate action must select Tree Care / Tree removal in place, retain
  entered details, customer/contact choices and request identity, and focus the
  existing form. The necessary bounded enhancement preserves Landscaping,
  attribution, pending-request protection and the existing message-prefix intake
  contract. Keep its real query/hash link for modified or JavaScript-free use.
- Verification: 101/101 local tests pass, including eight added regressions;
  the public build and all 14-page validation pass. Desktop 1440x1000 and mobile
  390x844 captures show loaded, uncropped imagery and complete actions. Click
  and mobile Enter retain synthetic draft fields/choices and request identity;
  service/context and focus are correct, with no horizontal overflow. No lead
  was submitted. Modified-activation and pending-request branches pass in tests;
  JavaScript-disabled browsing, physical devices and spoken screen readers were
  not exercised. The local build omits Google address autocomplete credentials.
- Independent finish review retained the bounded visual review and scored its
  sole form-continuity fix resolved, disposition `ship` at that fix's scope.
  Documentation comparison preserves the incumbent system. No broad site audit,
  production behavior, search ranking or indexing outcome is certified.
- Keep analytics disabled and CRM source/settings unchanged. No hosting or
  environment setting changes. Reuse the below-fold lazy image with dimensions;
  no new shipped image bytes/assets are generated. Private SD-card previews,
  candidate facts and permissions stay outside the website build.
- Before any later approved release, refresh repository and both projects'
  release state, confirm the exact public-only diff, skip both automatic builds
  and publish only the public project. Run non-submitting production smoke
  checks afterward. No production leads or CRM contract writes for this batch.

## Released batch — 5% discount for veterans

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
