---
version: 1
slug: optional-preferences
primary_target: index.html
related_targets: [overrides.css, ats-form-enhancements.js]
---
Mode: Operate. Simplify the estimate form's final stretch with a native Optional
preferences disclosure for existing contact-method radios and seasonal updates.
Keep all required fields and the hazard question visible. Preserve field names,
defaults, unchecked marketing opt-in, validation, customer details, service links,
draft recovery, analytics, cookie consent and CRM. Never disable closed contents.

Reopen recovered nondefault contact preferences so the reason for conditional
email validation is discoverable. Collapse after Clear draft and confirmed
success, where focus already moves safely. Never store the marketing choice or
the disclosure state in a saved draft. Keep native keyboard behavior, generous
tap areas and natural wrapping, including enlarged text.

Keep this patch independently reviewable from the existing gallery-controls
patch. Test locally and in isolated QA with all outbound lead delivery blocked;
QA-only request simulations may inspect synthetic payloads. No commit, push or
production publication in this task.

Verification (October 22, 2026): 202 local tests and the 18-page build/validator
pass. Browser QA covers 320/390/768/1280px and synthetic doubled text at
320/390px: natural wrapping, no horizontal overflow, native disclosure marker,
44px minimum summary, Enter/Space, radio arrows and Tab access. The core
stylesheet's summary display reset is overridden locally with display:list-item.

Isolated local-response simulations confirm closed controls remain in FormData,
failed requests retain choices and customer details, Email validation focuses the
visible email field, service estimate links recover multiline details and reopen
saved contact choices, marketing opt-in is not recovered, and success/Clear draft
reset and forget the draft. No real submissions or consent choices. QA wrappers
block outbound collection/submissions, have no functions and never ship. Physical
device/OS text enlargement and spoken screen-reader checks are not certified.

Final review also removes the redundant standalone phone heading beneath the
form; retain its call button, the contact email and the separate footer contact.
The QA finish found the exported email span clipped at doubled text sizes.
Scope min-width:0 and overflow-wrap:anywhere to that span, and invalidate the
homepage stylesheet with preferences2. Keep the form-script cache query at
preferences1; its code and build anchor did not change during this finish.

The owner explicitly approved QA-only previews on October 22. Final preview
6ada50fa5f7763deddf482b7 verifies normal 320/390/768/1280px and doubled-text
320/390px layouts: no duplicate phone heading, preserved call/email destinations,
visible wrapped email, no horizontal clipping and no overlap with the form.
All 202 tests and 18-page build/validation pass. No commit, push or production
publication; analytics, consent and CRM remain unchanged.
