---
version: 1
slug: "estimate-service-guidance"
primary_target: "index.html"
related_targets: ["ats-form-enhancements.js", "overrides.css"]
---

Approved October 20, 2026: service-specific help and examples for the estimate.
Mode: Operate within the existing green/Poppins form. Keep stable labels and
helper position; associate visible help with Project details using aria-describedby.
Guidance follows compatible service/intent selections, explicit links, restoration,
reset and pageshow. Only help text and placeholder change; never customer values,
draft records, request identity, payload fields or transport. Unknown/mixed choices
retain useful neutral guidance; only allowlisted copy is displayed. Use confirmed
Landscaping services and existing tree-service contexts; no planting or lawn care.
Project placeholder uses the existing dark-green token for AA text contrast.
Preserve SEO, estimate links, photos, analytics/consent and CRM. No commit/push/deploy.
Existing public design guide is the visual authority; no new layout or imagery.

Verification: 158 tests pass; 16 pages validate. Desktop1280/mobile320/390 browser
checks cover untouched Unicode/whitespace, links, restored service/intent, Clear
draft and accessible help plus validation error. No overflow. Only three release
artifacts change; remaining247 match. General design scan reports41 incumbent
layout/style warnings; this patch preserves those layouts. No production requests.

## Final review against published coverage release — October 20, 2026

Reviewed on ef9defd with the published Service Areas patch included. Inherit the incumbent green/Poppins form unchanged; no new visual system or token file is required. One correction sets a 16px minimum on the existing form controls (max(16px,0.98rem)); this rounds up the inherited 15.68px while preserving larger rem-based sizing. Final browser evidence confirms 16px at 320/390 and no horizontal overflow. Persistent helper and validation error both remain in aria-describedby, customer text is untouched through service changes and reload, and Clear draft restores the neutral guidance. The final suite passes 158 tests and validates 17 pages. Only three release artifacts change; 249 remain identical to the published baseline. Earlier 16-page/247-file figures are historical. Original pending checkout is preserved; the current reviewed seven-file patch is based on the new public release plus newer repository work. No commit/push/deploy, live lead, analytics, consent or CRM change.
