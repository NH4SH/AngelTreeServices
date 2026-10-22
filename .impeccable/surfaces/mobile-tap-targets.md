---
version: 1
slug: mobile-tap-targets
primary_target: site-pages.css
related_targets: [overrides.css, index.html]
---

Mode: Operate within the existing public marketing site. Small ergonomic adaptation.
Owner approved implementation, local tests and a QA-only preview. No commit,
push or production publication is authorized. Analytics, consent and CRM remain
unchanged.

Thesis: Make the existing next step easier to activate accurately on phones.
Keep the same typography, color, link labels, destinations, DOM order and design.

At widths through the existing 960px breakpoint, standalone interior-footer links, secondary estimate
links in action groups, gallery estimate links and the service-overview callout
estimate receive at least 44px height with 8px vertical inset. Retain line wrapping
and permit long contact addresses to fit. Remove the old extra 8px gaps between
mobile footer list items because the new hit areas supply their own spacing.
Do not enlarge estimate links embedded in ordinary prose. Wider desktop rules
remain unchanged; the existing 960px breakpoint covers phone landscape.
The homepage footer already meets 44px and remains unchanged.

The homepage contact block's phone/email links and the form's urgent phone route
receive the same minimum height. Existing main buttons, floating bars and form
controls retain their styles and behavior. Bump only the homepage stylesheet query
to invalidate the updated overrides CSS; preserve shared stylesheet fingerprinting.

Verify all 18 pages for unchanged SEO, HTML content, photos, links and forms;
protected runtimes/settings; existing tests/build; measured 44px targets and no
overlap/overflow at 320/390px and enlarged text; desktop styles unchanged;
keyboard focus and actual estimate navigation with synthetic draft preservation
and Clear draft in the isolated QA preview. No calls or submissions. Keep the
original localhost denial unresolved and use only the authorized hosted QA origin.

Verification completed October 22, 2026: 188 Node + 9 Python = 197 tests,
18-page build and validator, diff whitespace check and all preservation guards
pass. All 18 HTML pages match baseline apart from stylesheet cache references;
17 protected sources and 243 other shipping assets match. Analytics, consent,
CRM, SEO, photos, labels, destinations and form/draft runtimes are unchanged.

The final isolated QA draft is
https://6ada08093a1fad4acfebb3fd--verdant-shortbread-99c404.netlify.app/projects/ .
51 browser states cover every page at 320/390px, four representative pages with
synthetic 200% text, phone landscape, 960/961px boundary and desktop. All targeted
mobile anchors measure at least 44px, without new overflow or actual client-rect
overlap. Visible top/bottom padding responds as part of the link, keyboard focus
is retained, and the enlarged footer clears the floating contact bar. Actual
gallery and generic footer estimate navigation preserves synthetic name, address
and multiline notes; reload recovery and Clear draft followed by reload pass.
No phone/email action or form submission was triggered.

18 QA routes and 11 critical asset-byte checks pass. QA is noindex, blocks outbound
collection/submission and contains no deployed functions. Public and CRM published
deploys, build settings and processing settings remain unchanged; CRM has no new
deploy. Two QA draft uploads only. No commit, push or public publication.

All seven scoped detector flags match the initial inherited CTA-padding, separator
and body-overflow heuristics; visual and geometry checks show no new defect.
Physical-device/browser/OS text enlargement and spoken screen-reader checks remain
outside this desktop QA. The original localhost permission issue is not resolved.
Evidence and full source diff: workspace outputs/mobile-tap-targets/.
