---
version: 1
slug: emergency-tree-mobile
primary_target: dist-public/services/emergency-tree-service/index.html
related_targets: [scripts/build-public-pages.py, site-pages.css, emergency-tree-mobile.js]
---

Mode: Persuade. Ordinary extension of the approved mobile service-page pattern.
Keep this patch uncommitted for review. The user authorized local testing and a
separately hosted Netlify QA draft; no push or production release is authorized.

THESIS: Help phone visitors reach safety triage, call preparation and answers
quickly, with calling visually primary and all existing guidance available.

OWN-WORLD: Preserve Poppins, green/cream bands, wave, approved 24/7 wording,
safety copy, service order, desktop composition, SEO metadata/schema and all
estimate destinations. No new photos, factual claims or global tokens.
Analytics, consent and CRM code/settings remain unchanged. Preserve customer
details and draft recovery. CRM deployment activity is outside this patch;
no unchanged-CRM-deploy claim is made.

STORY: Call-first introduction and hero actions, three mobile text shortcuts,
immediate-danger triage, call details and electrical warning, ordered process,
site considerations, FAQs and final invitation. Do not collapse safety guidance.

FORM: Carry over 48px mobile section rhythm, 24px card inset and compact ordered
process rows. Safety, What to share and FAQs wrap with at least 44px targets.
Use a visually primary white/deep-green Call now pill and secondary Free
estimate link in the green floating bar. Its grid is
`minmax(min-content, 1.2fr) minmax(min-content, .8fr)` with normal word wrapping:
the base proportions favor calling, while min-content may allocate more width
to the longer estimate label at enlarged text. Keep both labels and hrefs
unchanged. Retain desktop.

INTERACTION: The Emergency-only observer yields only when the entire hero action
pair fits below the measured sticky header and focus is outside the floating
bar. Partial/offscreen hero actions restore it. Missing observer support leaves
it available. Targets use actual header height plus 20px clearance. Preserve
centered wrapped labels, 8px/12px bar inset, 88px plus safe-area footer reserve,
and the scoped viewport-minus-header menu cap. Never shrink enlarged text.

VERIFICATION: Completed local checks: 182 Node and 9 Python checks (191 total),
plus the 18-page build and validator. The 18-page preservation guards pass:
metadata is identical except the stylesheet key, photographs and forms are
preserved, HTML is preserved except approved navigation markup, and the new
runtime is Emergency-only. All 12 protected source hashes match.

The isolated QA checks pass for mobile 320/390 and desktop 1280, all three
anchors at normal and synthetic 200% text, settled focus and header clearance,
keyboard FAQ/electrical guidance, menu Escape and the last menu link,
full/partial/offscreen hero action states, focused-bar retention, and footer
privacy clearance. Parent-reported coverage also includes the 700/701
breakpoint, 844 landscape and 320×568 short viewport. The browser JSON's empty
matrix means those additional viewport combinations are not independently
established by the saved matrix. The non-submitting QA estimate flow preserves
storm context and customer details across navigation/reload, restores the draft,
and clears it successfully. No lead was submitted and no call was placed.

The enlarged-text correction keeps intact words and centered wrapping without
shrinking text; the bar measures 125.75px at synthetic 200%. In the enlarged
320×568 footer evidence, privacy ends at 428.02px and the bar starts at 432.25px.
Synthetic 200% computed text is a stress test, not OS accessibility or browser
text zoom. Actual browser text zoom remains unverified. The inherited P3 shared
brand split ("Service" / "s") at synthetic 200% and 320px is outside this patch.
The original localhost browser permission denial remains unresolved; the
separately approved QA access does not reset that permission.

QA: [Emergency tree service review preview](https://6ad952ea47d85fa612deff01--verdant-shortbread-99c404.netlify.app/services/emergency-tree-service/).
The ready 18-page isolated deploy has context `deploy-preview`,
`published_at: null`, no functions and no function schedules. Its QA wrapper
blocks collection, forms/submissions, external links and indexing. All 18 HTTP
checks pass for noindex, disabled collection/submission and forms, preserved
canonicals, and loaded QA safeguards; the eight checked assets match shipping
bytes. Public production remains on `6ad94caba0d9101daf7c3cf4`. Source HEAD is
`6a7211287dc8115c635c58b4bb1ada4b4de0929b`; no commit, push or production release
was made for this patch.

FINISH: Independent visual review passes as owner-review-ready, with no P0–P2
blocker or further in-scope UI fix. The review used the supplied patch, source,
guards, HTTP/browser evidence and nine stored captures; it did not rerun the
browser, detector or tests. Its `ship` disposition means ready for owner review
as an uncommitted ordinary extension and does not authorize publication. The
incumbent service-page system remains the visual authority; no global PRODUCT
or DESIGN drift repair, replacement visual world or new system file is owed.

Evidence:

- [Verification summary](/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/outputs/emergency-mobile/verification-summary.json)
- [QA HTTP checks](/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/outputs/emergency-mobile/qa-http-checks.json)
- [Preservation guards](/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/outputs/emergency-mobile/regression-guards.json)
- [Independent visual finish](/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/outputs/emergency-mobile/independent-visual-finish.md)

Rubric: palette — incumbent green/cream and wave; type — Poppins, readable
wrapping and no enlarged-text shrinkage; layout — preserved desktop, 48px mobile
rhythm, 24px insets and compact ordered process; navigation — three 44px
shortcuts, measured anchor clearance and bounded keyboard-accessible menu;
actions — call-first pills, original destinations, full-hero yielding and focus
retention, with footer privacy clear of the bar.
