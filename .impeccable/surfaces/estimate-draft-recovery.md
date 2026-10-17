---
version: 1
slug: "estimate-draft-recovery"
primary_target: "index.html"
related_targets: ["ats-estimate-draft.js", "ats-form-enhancements.js", "overrides.css"]
---

Approved October17,2026: tab-only estimate draft recovery, Clear draft,30-minute
inactivity expiry and cleanup only after confirmed success. Preserve SEO/estimate
links, analytics off, CRM unchanged. Also address owner's stated Landscaping
findability concern with an additive homepage service-card text link; keep the
existing estimate action. Local tests only; no commit/push/deploy.

Mode: Operate for estimate, Persuade for homepage service card. Ordinary code-led
extension of incumbent Poppins/green/cream/pill and form system; no new visual
world or imagery. Current implementation and PUBLIC_SITE_DESIGN_GUIDE.md govern.

## Direction contract

THESIS: Let a visitor browse services and return without losing an unfinished
estimate; expose Landscaping guidance from its own homepage card.
OWN-WORLD: Existing form typography/colors/spacing and clear underlined text
links. A compact draft notice and plain Clear draft button, no modal or animation.
STORY: Start typing; saved-in-this-tab notice appears; browse; return to restored
details and compatible service choices; clear or submit explicitly.
FIRST VIEWPORT: Homepage hero unchanged. In the existing contact form, place a
small wrapping status/action row before the fields; no competing submit button.
FORM: Explicit links still select their service; restore customer text untouched.
Clear draft starts a fresh request. Storage failure never blocks the form. No
automatic submission, CRM transport, analytics collection, or marketing-opt-in
restoration. Session-only storage, short expiry, preserve retry identity.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Ordinary extension preserves incumbent design-system files; no new raster assets.

Final regression-review scope, October 17, 2026: correct public privacy wording
to state Google Analytics collection is disabled, remove it from the active
provider list, explain tab draft storage/expiry/clear/success cleanup and storage
fallback, and update the visible policy date. Preserve metadata, URLs, platform
policy claims and CRM code/settings. Fix reproduced native history recovery of
an expired record after initialization removed it. Local-only hold remains.
