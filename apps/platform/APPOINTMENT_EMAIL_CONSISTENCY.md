# Appointment email branding and contact consistency

October 23, 2026. Local follow-through to the existing customer-communications review, based on current main `1f250da`. The verified payment-receipt changes are pushed to main. This appointment batch is committed locally, pending a separate push/release request. Nothing was deployed and production was not changed.

## Change

Estimate/work confirmations and reminders, visit changes, cancellations and reinstatements now use the same current public business identity, service description and office phone. The actual pre-change confirmation HTML retained the old lawn-care footer and offered no direct phone link. The replacement uses the existing green-and-neutral transactional email style, a clear message heading, readable 16px body/footer text, responsive wrapping and a single named **Call (540) 388-8715** link.

Both plain text and HTML include reply/call help from the central public brand data. No static mailbox was added in place of the existing Reply-To behavior. The confirmed/reminder/updated/cancelled headings remain distinct; a reinstated visit now has a matching **Visit reinstated** heading. Cancellation still explicitly applies to that visit only, with other visits unchanged.

Eleven independently captured pre-change cases retain their exact subjects and every operational instruction, date, time window, location and multi-day schedule in order. The only plain-text changes are paragraph spacing and consistent contact/closing presentation; confirmations/reminders now include the actual office phone. No scheduling rule, deadline, customer promise or business term changed. Appointment time formatting and the existing open-ended arrival wording are preserved.

The new presentation helper uses central `companyBrand` values and the existing HTML escaping utility. The obsolete appointment-only branded renderer and its duplicate escape function were removed. Proposal reminders, invoice reminders and payment receipts are byte-identical to independently captured pre-change outputs. Existing test adapters were updated only to inject the presentation/brand imports.

## Preservation and delivery safety

The communication processor, queue, recipient selection, scheduling commands, source-event transactions, authorization, RLS/grants, deduplication identities, frozen requests, provider reconciliation and history repair are unchanged. No migration, persistent database setting, key, dependency, runtime, scanner or hosting configuration changed. Employee UI, dashboard, earlier customer work and the separate runtime branch at `06580f6` are preserved.

Existing accepted or uncertain messages are not restyled or resent. A focused test passes the new appointment content through the real durable sender against an older saved request: a changed payload remains a conflict, cannot overwrite the earlier content and cannot authorize provider I/O or rotate the request key. Existing notice tests still cover recipient failures, disabled sending, superseded updates, repeat processing, accepted-history recovery and quarantine of uncertain delivery.

## Verification

| Check | Result |
| --- | --- |
| Complete CRM suite on the patched locked dependencies | **2,435 passed**, no failures/skips |
| New consistency tests included above | Seven tests; eleven appointment baselines plus three unchanged neighboring templates |
| Route types, TypeScript and optimized build | Passed on Node 22.23.4 / Next 16.4.2 / React and DOM 19.2.9 |
| Build environment | No ignored environment files/provider credentials copied; zero external application requests |
| Existing native notice/delivery protections | **36 local + 36 staging assertions** passed inside rollback-only transactions |
| New native email-input verification | **12 local + 12 staging assertions** passed; eleven fixtures exported per environment |
| Actual pre-change/new templates with those native inputs | **22 cases passed**; subjects, operational content and inputs preserved, current branding/contact present |
| Actual generated-email browser inspection | Eleven variants at 1280/390px plus long Unicode names/addresses at 390/768/1280px; 25 views, no horizontal overflow |
| Keyboard/accessibility mechanics | Visible phone-link focus, about 49.6px link target, 16px text, language/viewport/heading markup and checked contrast above 4.5:1 |
| Console/source/whitespace | No browser console errors; source-copy parity and `git diff --check` passed |

The local native checks reused the existing loopback disposable appointment project at migration 105, where the appointment/delivery safeguards were installed; it was not reset or upgraded. Its full application catalog, native ledger and all public/private/Auth table fingerprints match before/after. The patched application build and full suite use current main source, not that older database as a substitute for current staging.

Staging checks use the actual installed 118 schema. The existing regression exercises authorized saves, immutable source capture, obsolete updates, duplicate claim denial, uncertain-result holds, synthetic acceptance recovery, cancellation/reinstatement, address-race denial, source rollback and compatibility with earlier frozen booking confirmations. The new fixture exports estimate/work confirmations/reminders, multi-day/open-ended schedules and five native changed/cancelled/reinstated notice lookups, excluding private calendar notes.

Test-only sending flags were changed solely inside uncommitted SQL transactions and fully rolled back. No real worker or provider was invoked. Fresh before/after staging evidence matches the exact 118 native ledger, all 5,110 catalog objects/permissions, 49 protected business/Auth/history sets, no-send Auth guard and settings. Staging automatic sending, appointment notices and recurring generation remain OFF. `supabase/verification/appointment_email_inputs.sql` is verification, not migration 119.

The mechanical design scan reported one intentional warning: the established Arial email-safe fallback stack. No external fonts or detector suppression were added. Browser acceptance uses generated HTML from the real templates with synthetic inputs; it does not claim a staging app deployment, real mailbox delivery, physical-device/assistive-technology certification or 200% browser-zoom acceptance. The phone link was focused and inspected, not dialed. A final trailing blank line was removed without changing runtime output.

## Follow-through and evidence

This completes the appointment branding/contact follow-up in the existing customer review. Remaining acceptance includes actual mailbox clients, physical devices and assistive technology. The unresolved owner business-policy/override decisions and separate Netlify runtime follow-up remain separate; this batch made no production Node verification or support contact.

Sanitized receipt: `staging/APPOINTMENT_EMAIL_CONSISTENCY_VERIFICATION_20261023.json`. Private evidence: `/Users/noelsierra/Documents/Codex/2026-10-23/appointment-email-consistency/`, including source preimages, build/test logs, native fingerprints and synthetic generated HTML. Representative screenshots: `before-desktop.png`, `before-mobile.png`, `after-estimate-confirmation-desktop.png`, `after-estimate-confirmation-mobile.png`, `after-job-cancelled-mobile.png`, `after-multi-day-desktop.png`. Raw database snapshots and logs remain outside Git. The temporary preview tab was closed, its owned loopback server stopped and viewport restored after acceptance.
