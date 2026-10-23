Method: dual-agent (A: /root/customer_design_review · B: /root/customer_evidence_review)

# Customer experience review — October 21, 2026

## Decision

Preserve the readable green-and-neutral document identity. Fix the task hierarchy and state/recovery gaps before considering a wholesale customer visual redesign. The dashboard's new dark palette is an internal operations decision, not a reason to darken proposals and invoices for homeowners.

The next customer implementation should lead with **invoice payment/status clarity and accurate closed-proposal states**, followed by link recovery and actionable reminders. Keep contractual terms unchanged until their authoritative source is confirmed. These are follow-ups within the existing portal/payment/quote and communications work, not a competing PR roadmap.

This package reviews customer surfaces; it does not implement these fixes, create a new customer account system, change financial rules, weaken token/authorization checks, or change production.

## Design specificity and overall impression

Shared proposal/invoice paperwork feels appropriate for Angel Tree Services: scope and amounts are readable, pricing is familiar, and additional work compares the original and revised commitment. The customer account home is less useful: it describes capabilities without offering a task. The largest opportunity is to tell customers what happened and what they should do next, especially after payment or when a document is closed/unavailable.

Independent design assessment: **23/40 — acceptable foundation with significant journey gaps**. No P0 was demonstrated. Three deterministic font warnings in 19 markup-bearing files were all email-safe Arial fallbacks and are not useful redesign priorities. No browser detector overlay was injected: only read-only DOM inspection was available. The actual rendered screenshots and source locations provided the fallback evidence.

## Coverage and evidence strength

| Touchpoint | Review performed | Acceptance still needed |
|---|---|---|
| Public enquiry/contact/estimate request, commercial fields, service prefill, call/email/urgent CTAs, interrupted draft, validation and thank-you | Source inventory including client/server acknowledgement contracts | Desktop/mobile rendered acceptance and a guarded local submission test; no hosted intake submitted |
| Customer entry and organization destination | Actual local desktop/mobile views | A deliberate secure-link versus account-hub product decision |
| Quotes | Local sent/approved/declined/change-requested/cancelled, invalid/expired/revoked states; source action/error review | Actual customer-response submissions and screen-reader acceptance |
| Invoices/payment choices | Local unpaid, paid, bank-processing and unavailable states; payment preference source and safe no-submit inspection | Live Stripe/card/ACH return, failure, partial and void acceptance; no real payment/provider calls |
| Change orders | Local sent/approved/cancelled views; approval/change/decline source | End-to-end responses and accessible error announcements |
| Transactional emails | Eight actual-generator HTML previews: proposal, invoice, receipt, invoice reminder, overdue reminder, quote follow-up, appointment reminder and multiple proposals | Real mailbox rendering/delivery, not inferred from a browser |
| Appointments, changes/cancellation, SMS | Source inventory; appointment-reminder HTML preview | Actual customer contact after changed/cancelled appointments and manual SMS handoff |
| Post-job review/feedback/photos/privacy | Source inventory of active copy-only review drafts, public project gallery, staff-only photo routes, manual privacy request | Real review destination, customer feedback decision, private completion-photo delivery if desired |
| Print/save/download | Visible invoice control and source/print CSS | Actual PDF pagination, native viewer/printing, real private download acceptance |

The main visual review used fresh **synthetic loopback fixtures**, not production records. Report A was completed before root read B's findings. Review B used verified 390px mobile and desktop widths; reviewed customer pages had no horizontal overflow at 390px. No business approval, decline, change request, payment, preference submission, SMS, email or public contact submission was performed. Synthetic view telemetry was permitted. A no-submit payment-radio check did not reliably update dependent React text in the harness; that interaction remains unverified and is not classified as a confirmed application defect.

Public first/last-touchpoint supplement remained source-only because the supplemental agent's browser binding was unavailable. A temporary loopback static preview did not prove submission or rendering acceptance. Generated service-page source may be transformed by the public build; source wording is not claimed to be deployed wording.

## What works

- Proposals give services, full scope, exclusions, quantities and amounts a familiar document structure. Preserve that clarity while changing the reading order.
- Additional work distinguishes the original agreement, added amount and combined total. The authorizing-person field helps commercial buyers.
- Payment logic distinguishes a method preference from received money. Bank processing and the card-review source contain useful safeguards; make the visible journey equally clear without replacing those commands.

## Five priorities

### P1 — Payment action and settlement reassurance belong beside the balance

A bank-pending invoice initially showed “Sent” and a balance due. Its processing explanation began around **y2140 desktop / y3416 mobile**, after the document and 13 terms sections. The ordinary chooser began around **y2173 desktop / y3449 mobile**. There was no pay/status jump near the top.

A customer returning after payment can reasonably wonder whether anything happened. Put the current state, safe next step and contact option next to the balance; unpaid invoices should lead to the chooser, processing invoices should clearly explain that a second payment is unnecessary while clearing. Keep the full invoice and print surface below. Do not represent the retained invoice balance as proof a new payment is needed.

Related source-only concerns: any pending Stripe payment is called a bank payment without checking its method; a processing return can precede the pending row; no automatic refresh was found despite update wording. These need controlled acceptance tests, not assumptions about live Stripe behavior.

Evidence: `src/app/portal/invoice/[token]/page.tsx:42,80,106,124`; `src/components/invoice-portal-payment-button.tsx`. Suggested work: Impeccable shape/clarify within the existing payment-portal follow-up.

### P1 — Closed proposals must show an outcome, not an enabled response form

Declined/cancelled local fixtures showed enabled Approve proposal and Request a change actions. Approved records correctly replaced buttons but retained introductory instructions to approve/request changes. The page supplies an approved boolean; other statuses enter the interactive branch. This finding does **not** mean the server accepts a closed quote.

Use explicit awaiting-decision, changes-under-review, approved, declined, expired and cancelled presentation states. Explain the result and contact/reopen route; retain all server revision, token and approval safeguards. Returning to a change-requested quote should also explain what is under review.

Evidence: `src/app/portal/quote/[token]/page.tsx:34,58`; `src/components/portal-quote-actions.tsx:98`; existing command rejection in `src/lib/actions/portal-tokens.ts`. Suggested work: Impeccable harden/clarify within the existing atomic quote/approval follow-up.

### P1 — Unavailable links and customer entry need useful next steps

Invalid, expired and revoked links had no usable call/email/new-link action; the invalid quote had **zero interactive controls**. The signed-in `/portal` home presents feature cards without document/task controls, including “later” billing wording although invoice links work. The organization destination explains a future implementation rather than helping the customer.

For the existing emailed-link workflow, provide clear instructions and company contact/replacement-link help, without revealing whether an unauthorized record exists. A real account hub is a separate authorized feature requiring record scoping and acceptance tests. Remove promises of customer uploads/feedback from primary guidance until such paths actually exist.

Evidence: `src/app/portal/page.tsx`; `src/app/portal/organization/[token]/page.tsx`; quote/invoice/change-order unavailable components. Suggested work: Impeccable onboard/harden/clarify.

### P1 — Reminder HTML needs real linked actions

Invoice reminders, overdue notices and proposal follow-ups rendered secure URLs as escaped text within paragraphs. Browser previews contained **zero anchors** for these messages. Email clients may auto-link text, but that client-specific behavior was not tested and should not carry the workflow.

Reuse the stronger customer-document email action/contact block. Provide a real secure CTA, copyable backup link, clear amount/due context and reply/call route. Preserve deduplication, delivery reconciliation, no-send guards and the distinction between receipts and requests to pay.

Evidence: `src/lib/communications/templates.ts:63,94,136,144`; contrast with `src/lib/email/customer-document-layout.ts`. Suggested work: Impeccable clarify/layout within the existing communications phase.

### P1 — Reconcile the facts across email, approval and printable document

Source inference: quote emails can include quote-specific payment/debris fields that the fixed approval document does not render. Invoice terms hard-code “15 days” and “3%” while due dates/payment configuration are variable. The reviewed synthetic due date happened to match the fixed term, so no conflicting live invoice or incorrect charge is claimed.

Confirm the authoritative business terms, then render the same approved facts across email, document, decision and payment review. Do not rewrite contract language or change fees during cosmetic work. On mobile, approval was at **y875**, full scope at **y1982**, and terms at **y2599**; keep the relevant scope/exclusions/commitment near the decision or introduce a clear review step.

Evidence: `src/lib/documents/email-drafts.ts:153`; `src/components/documents/quote-document.tsx:69`; `src/lib/documents/terms.ts:31`; `src/components/documents/invoice-document.tsx:55`; `src/lib/payments/payment-options.ts`. Suggested work: Impeccable clarify after the owner confirms the business facts.

## Nielsen heuristic scores

| # | Heuristic | Score /4 | Main issue |
|---|---|---:|---|
| 1 | Visibility of system status | 2 | Important processing state is buried |
| 2 | Match with the real world | 3 | Internal terms reach customer destinations |
| 3 | User control and freedom | 2 | Missing recovery/exit routes |
| 4 | Consistency and standards | 2 | Entry promises, documents and emails diverge |
| 5 | Error prevention | 3 | Closed actions and decision context need work |
| 6 | Recognition rather than recall | 3 | Direct documents clear; retrieval weak |
| 7 | Flexibility and efficiency | 2 | Scroll cost and inconsistent save controls |
| 8 | Aesthetic and minimalist design | 3 | Good paperwork, weak task hierarchy |
| 9 | Error recovery | 1 | Unavailable pages are dead ends |
| 10 | Help and documentation | 2 | Useful copy lacks usable next steps |
| **Total** | | **23/40** | **Acceptable foundation** |

## Persona red flags

- A first-time homeowner opens an invoice and must scroll through several screens of terms before discovering how to pay. Keep the action and assistance close to the current amount/state.
- A returning payer sees Sent and balance due while waiting for a bank payment, and has to find the distant reassurance. Make “what happened” the first read.
- A property manager looking for a misplaced document reaches a feature overview or technical organization placeholder. Provide a current recovery path before promising a hub.

## Additional findings

- **P1, conditional/source:** cancelling an appointment stops pending reminders, but no corresponding customer cancellation notice was found. Staff may already call separately; verify that operational responsibility before claiming cancellation is customer-complete. Keep any future notices within existing durable source-event/deduplication work.
- **P2:** change-order amount renders at about13px because a more-specific shared rule wins; mobile Decline is about27px high. Cancelled additional work incorrectly says the customer's response is on file. Change-order errors lack the quote form's alert/live announcements.
- **P2:** invoice print control is only38px high; quote lacks an equally discoverable save action. Change-order print output may be blank under the shared print selector; this is source inference pending PDF acceptance.
- **P2:** customer document/reminder footers still advertise lawn care, contrary to current product context. Verify and update customer-facing positioning without inventing services.
- **P2, source:** review-request drafts remain copyable with `[Add Google review link]` when unconfigured. Preserve copy-only behavior; prevent unfinished drafts being mistaken for ready messages.
- **P2, source:** the public form's optional seasonal/update consent and its “only follow up about the request” reassurance disagree. Clarify ordinary enquiry use versus optional updates; no legal-policy conclusion is made here.
- **P2, source:** thank-you copy says soon/shortly without an owner-approved expectation or retained request summary. Do not invent a turnaround guarantee. A receipt is not a scheduled appointment; urgency already has a call fallback.
- **P2/source:** online receipt traceability lacks some method/reference/context fields; disabled-online mode defaults to an unavailable bank option in this local environment. Neither demonstrates a production payment configuration defect.
- **P3:** small metadata and print terms deserve a real older-reader/paper check. Reviewed pages wrap at390px, but this is not contrast or screen-reader certification.

## Existing-roadmap integration and acceptance order

1. Extend the existing payment portal and quote state follow-ups: lead with payment status/action, show accurate closed states and preserve immutable quote/payment commands. Test every state and race-return variant with synthetic fixtures.
2. Extend communications/recovery work: real reminder CTA/contact blocks, unavailable-link help, explicit cancelled-appointment contact responsibility. Retain source-event receipts, delivery reconciliation and duplicate-prevention guarantees.
3. Confirm business facts once; reconcile payment/debris/due/surcharge wording across all customer artifacts. No fee/contract change without the owner decision.
4. Choose secure-link entry versus a scoped account-hub project. Do not ship an unscoped document lookup or silently broaden account access.
5. Apply smaller accessibility/print/brand/form-copy fixes, then accept PDFs, real mailbox clients, screen readers, devices and controlled payment-return flows. Re-review the journey after those changes.

The next implementation is a recommendation, not authorization to send communications, change business terms, deploy, or modify production. Two targeted preference questions were presented after the customer report; until answered, payment/closed-state fixes and secure links with recovery help are recommended defaults only.

## Evidence location

Private local evidence: `/Users/noelsierra/Documents/Codex/2026-10-21/dashboard-remake/` contains independent `customer-assessment-a.md`, `customer-assessment-b.md`, `customer-touchpoint-supplement.md`,23 B screenshots, actual-source email HTML previews, and detector JSON. Token-bearing fixture indexes/private logs stay outside Git and are not reproduced here. Representative images: `b-invoice-choice-mobile.png`, `b-invoice_bank_pending-mobile.png`, `b-quote_declined-desktop.png`, `b-quote_sent-mobile.png`, `b-email-reminder-mobile.png`.

## Supplemental visual check by the coordinating reviewer

After the independent supplement's browser binding failed, root's existing browser remained accessible. A separate temporary local public preview was inspected at1365px desktop and390px mobile without a submission. No horizontal overflow was measured at those widths. Commercial-request fields revealed correctly; choosing Email made email required; a grounded service-link query selected Tree Care; keyboard Tab focused the phone field and blur validation announced the empty required name. Draft restoration was visible. These checks strengthen the public-form evidence, but do not prove accepted lead delivery, success acknowledgement, real phone/email handoff, generated service-page layout or hosted configuration.

Evidence: `public-contact-desktop.png`, `public-contact-mobile.png`, `public-contact-mobile-fields.png`, `public-contact-mobile-details.png`. Root closed its temporary public tab, reset viewport overrides and stopped its static preview. Earlier A/B findings and the independent23/40 score are unchanged.

## Implementation follow-through — October 22, 2026

The findings above remain the historical review, not a list of wholly open defects. Payment/closed-proposal clarity and actionable reminder work are recorded in `CUSTOMER_PAYMENT_CLARITY.md` and `ACTIONABLE_REMINDER_EMAILS.md`. Print/save acceptance is complete and pushed through `fa62bd3`; see `CUSTOMER_DOCUMENT_PRINT_READINESS.md`.

Customer entry and lost-link recovery are now verified locally and with rollback-only synthetic staging inputs, pending push/release; see `CUSTOMER_ENTRY_RECOVERY.md`. The existing sign-in gates and document capability rules are preserved. This adds office recovery guidance, not an account hub or automatic replacement-link email sender.

The next customer follow-up is response acceptance, starting with additional-work request/decline outcomes and accessibility. Contractual consistency still needs the owner's authoritative business wording. This does not replace the original roadmap or change the historical review score.


## Response acceptance follow-through — October 22, 2026

Customer entry recovery is now pushed to main through `d3d30da` (includes `72b2c21` and preserves the concurrent website work). Additional-work response outcomes and accessibility are verified locally and against rollback-only synthetic staging commands, pending push/release; see `CHANGE_ORDER_RESPONSE_OUTCOMES.md`. Approval/change/decline confirmations, stale and uncertain recovery, immediate saving controls and keyboard focus preserve the existing capability, transaction, receipt and email deduplication guarantees.

Continue the original customer follow-up with proposal response outcomes/accessibility, then the outstanding contractual wording and real-device/screen-reader/mailbox acceptance. Historical findings and scores above remain historical; no competing roadmap or production release is introduced.

## Proposal response follow-through — October 22, 2026

Change-order response outcomes/accessibility (`946ae0b`) are pushed to main. Proposal approval/change-request outcomes and accessibility are now verified locally and against 14 rollback-only staging command scenarios, pending push/release; see `PROPOSAL_RESPONSE_OUTCOMES.md`. This preserves existing response capabilities and authorization while adding clear saved/uncertain/closed outcomes, exact-retry guidance, early-submission recovery, immediate saving controls, retained wording and keyboard focus.

Next in the existing customer follow-up: reconcile document/email branding and contact sources, including the historical lawn-care tagline still visible on the actual proposal, then authoritative business wording and mailbox/screen-reader/device acceptance. Financial/contractual terms and production remain unchanged. Historical review findings and scores remain historical.


## Document branding follow-through — October 22, 2026

Proposal response outcomes (`c67f0e3`) are pushed through `a2732f6`, preserving concurrent main/public-site work. Document/email branding and contact consistency is now verified locally and with six rollback-only staging document cases, pending push/release; see `CUSTOMER_DOCUMENT_BRANDING.md`. Public contact uses the existing reply-to setting; current service branding is corrected while historical records, saved deliveries and contractual/financial terms remain unchanged.

Continue this existing customer follow-up with owner-approved authoritative business wording, then mailbox-client, screen-reader and physical-device acceptance. No competing roadmap, staging app deployment or production change is introduced; the original review findings and scores remain historical.

## Existing terms review — October 22, 2026

The owner selected existing CRM wording as the review baseline, not as approval of every existing clause. `CUSTOMER_TERMS_REVIEW.md` records eight synthetic renderer/calculation probes, three in-memory approval SQL cases, fourteen passing existing checks and a read-only staging routine-definition check. It confirms per-record payment/debris omissions, invoice due-date versus fixed 15-day wording, configured surcharge versus fixed 3% text, ambiguous undated validity, and the need to preserve historical terms before editing shared constants.

The next implementation priority is now **enforcement of an explicitly stored proposal expiry**: an open proposal with a past date was accepted by the existing core SQL fixture when its customer token was still usable; installed staging definitions also lack the proposal-expiry check. Fix new acceptance and the matching portal outcome while preserving lock order, committed-result replay, capability/authorization checks and source-event deduplication. Then continue record-aware terms consistency after the owner confirms payment timing, existing penalty/warranty clauses and override precedence. No application code, business terms, migrations or hosted configuration changed in this review, and no production query, send, push or deployment occurred. The dashboard hotfix remains released; the completed customer-branding batch remains preserved locally and unreleased.

### Proposal-expiry implementation — October 22, 2026

The explicit stored-expiry enforcement candidate is now verified locally and with 30 rollback-only assertions in staging. New approvals reject after the deadline, including lock waits and tentative work creation that cross it. The portal shows a closed outcome while retaining document/office help. Committed-result replay, token/authorization checks, undated behavior, historical approved-record repair and source-event deduplication remain intact. See `PROPOSAL_EXPIRY_ENFORCEMENT.md`; the earlier review findings remain historical.

Next is targeted permanent staging reconciliation for migration 117, which has only been exercised inside rolled-back staging transactions. No app deploy, production change or communication send occurred. Then continue the existing record-aware terms follow-up once the owner chooses the unresolved policy/override rules. The prior branding work and released dashboard fix are preserved.

### Document-terms preservation — October 22, 2026

The staging 117 reconciliation is complete and pushed to main as `e956e25`. The next existing terms-review step is now implemented locally: retain the exact current clauses in a fixed legacy rendering version and bind proposals/invoices to it before changing defaults. Candidate 118 passed local upgrade/command checks, 60 rollback-only staging assertions, component comparisons, desktop/mobile inspection, schema checks, typecheck/build and all 2,394 CRM checks. See `CUSTOMER_DOCUMENT_TERMS_PRESERVATION.md`.

Staging remains at 117 after rollback; permanent reconciliation for 118 is next. Policy choices about record-specific instructions, deadlines, penalties, surcharges, warranty and undated validity remain with the owner. Existing wording, history, security, employee UI, dashboard and prior CRM work are preserved. No app deployment, production change or email send occurred.

### Review-request readiness — October 23, 2026

Migration 118 staging reconciliation and the framework security update are pushed to main through `cad55f1`. While the separate Netlify runtime issue awaits a vendor response, the next independent existing customer finding is now addressed locally: missing or unusable review destinations no longer create copyable unfinished email/text drafts. The actual component/clipboard reproduction confirmed the historical placeholder issue; valid configured wording and copy-only behavior are preserved. See `REVIEW_REQUEST_DRAFT_READINESS.md` for 2,418 passing CRM checks, typecheck/build, responsive/keyboard/clipboard acceptance and rollback-only synthetic staging input/RLS checks.

The staging ledger, catalog, protected records and sending guards remain unchanged at 118. This feature batch is local and pending push/release. Business-policy decisions, mailbox/screen-reader/physical-device acceptance and the separate managed runtime follow-up remain in the existing roadmap. No business wording, production configuration, customer communication or application deployment changed.

### Payment-receipt clarity — October 23, 2026

Review-request safety is pushed to main as `0a2d148`. The existing receipt-traceability finding is now addressed locally: recorded payment method/date, amounts and existing references are readable in both formats; missing historical dates no longer become today's date. Financial calculations, recipient selection, source identities, frozen deliveries, history and duplicate-send safeguards are preserved. See `CUSTOMER_PAYMENT_RECEIPT_CLARITY.md` for 2,428 passing CRM checks, build/typecheck, generated-email browser acceptance, eight rollback-only staging assertions and seven processor scenarios using those synthetic database inputs.

This receipt candidate remains local and unreleased. Staging remains at 118 with sending OFF and protected state unchanged; production is unchanged. Continue the existing communications work with remaining appointment-email contact/branding consistency and actual mailbox/device/assistive-technology acceptance. The unresolved terms-policy decisions and separate managed runtime follow-up remain open. No competing roadmap is introduced.

### Appointment-email consistency — October 23, 2026

Receipt clarity is pushed to main as `1f250da`. Appointment confirmations/reminders, changes/cancellations and reinstatements now use current public branding and consistent reply/call help in a readable email layout. Exact subjects and all captured operational wording/times/locations/schedules are preserved. Existing recipients, authorization, source identities, delivery transactions and immutable history remain unchanged. See `APPOINTMENT_EMAIL_CONSISTENCY.md` for 2,435 passing checks, build/typecheck, 36 protection and 12 input assertions in each native local/staging environment, 22 native-input renderer cases and browser acceptance.

The new appointment batch remains local and undeployed. Staging remains at 118 with all protected state preserved and sending OFF. Continue remaining real mailbox/device/assistive-technology acceptance and the outstanding owner terms-policy decisions; keep the separate managed runtime issue separate. No application deployment, production change or customer email occurred.

### Communication source-read safety — October 23, 2026

Appointment-email consistency is pushed normally to main as `8422b3e`. The next existing communications/recovery gap is now fixed locally: errors reading a customer, organization, quote, invoice or payment no longer become misleading “missing record/contact” cancellations or skips, or expose raw backend diagnostics in queue reasons. Failed preparation stays visible for staff review, sends nothing and does not automatically retry. Successful empty reads retain their deliberate original behavior; healthy content, recipients, financial facts, frozen requests, delivery keys and history remain unchanged.

See `COMMUNICATION_SOURCE_READ_SAFETY.md` for 2,445 passing CRM checks, typecheck/build, 21 rollback-only SQL assertions in each local/staging environment and 60 actual-worker cases with native synthetic inputs and controlled error responses. Staging remains exactly at 118 with protected state unchanged and sending OFF. This new batch is local and undeployed, with no new migration or recovery UI. Remaining mailbox/device/assistive-technology acceptance, owner terms-policy choices and the separate managed-runtime issue remain in the existing roadmap. Production is unchanged; no customer communication was sent.

### Appointment reminder preparation follow-through — October 23, 2026

Source-read safety is pushed to main as `1f1cfb7`, and the concurrent website-only `0a85e15` update is preserved. The next checked-update/recovery gap is fixed locally: appointment reminder cleanup errors can no longer report successful preparation, allow this batch to claim deliveries or prematurely complete an accepted email's follow-up recovery. Successful recovery retains existing stable identities and does not resend the accepted email. Earlier partial cleanup can remain applied; synchronization is not made globally atomic.

See `APPOINTMENT_QUEUE_SYNC_SAFETY.md` for 2,459 passing CRM checks, build/typecheck, 51 rollback-only native SQL assertions per local/staging environment, 98 controlled native-input scenarios and compatibility checks for the concurrent website update. This candidate remains local with no new migration or UI. Staging remains at 118 with protected state unchanged and sending OFF. Existing security, financial behavior, templates and delivery history are preserved; production and customer communications are unchanged. Remaining acceptance/policy/runtime work stays in the existing roadmap.

### Proposal follow-up deadlines — October 23, 2026

Appointment-reminder recovery is pushed to main as `4e5bd40`. The next existing expiry/send-time eligibility gap is now verified locally: follow-ups stop at the stored proposal deadline even if its customer link is still valid. Candidate 119 also checks after the shared reminder-lock wait, preserving accepted/uncertain results, existing claims, token checks and historical messages. Future/undated behavior and financial/business records remain unchanged. See `PROPOSAL_FOLLOWUP_EXPIRY.md` for 2,466 passing checks, build/typecheck, fresh native schema regeneration, 27 local/staging SQL assertions, eight native-input worker scenarios and actual concurrent lock/claim tests.

Staging remains unchanged at 118 after the candidate transaction rolled back; migration 119 is deferred for targeted permanent staging reconciliation. This batch remains local and unreleased. The existing terms-policy, mailbox/device/assistive-technology and separate managed-runtime follow-ups stay in the same roadmap. No production query/change, deployment or customer email occurred.

### Proposal follow-up staging reconciliation — October 23, 2026

The expiry implementation is pushed to main as `bf0d794`; the unchanged migration 119 is now installed and verified on ATS CRM Staging. Both intended routine bodies match the native local rehearsal, while all 118 earlier ledger entries, protected records/history, rights, document/approval behavior and OFF switches are preserved. The independent main website update `8fed532` is included. See `STAGING_PROPOSAL_FOLLOWUP_RECONCILIATION.md` for failed-upgrade rollback/repeat checks, 27 candidate and installed assertions, fresh schema/maintenance checks, native concurrency and 2,476 passing CRM results. This completes the staging database step only: no app deployment, production query/change, automatic activation or customer email occurred. Existing owner-policy, mailbox/device/assistive-technology and managed-runtime work remains separate.

### Individual payment receipt recovery — October 23, 2026

Migration 119 staging reconciliation is pushed to main as `ba4367c`. The next existing receipt/delivery-recovery defect is now verified locally: a receipt for one payment no longer suppresses a different payment's receipt on the same invoice. Same-payment duplicates, in-flight/unknown outcomes and unidentified historical invoice receipts retain their holds. See `PAYMENT_RECEIPT_IDENTITY.md` for 2,485 passing CRM checks, typecheck/build, native concurrency, fresh schema verification, 32 local/staging SQL assertions and 12 worker scenarios using native synthetic inputs. Healthy payloads, financial facts, recipients, history and prior security remain unchanged.

The new batch and candidate migration 120 remain local and unreleased. Staging remains at 119 after complete candidate/fixture rollback, with all protected state and OFF controls preserved. Targeted permanent reconciliation for 120 is the next database step; historical skipped/failed messages are not automatically retried. The owner-policy, real mailbox/device/assistive-technology and separate managed-runtime follow-ups remain in the same roadmap. No production query/change, app deployment or customer email occurred.

### Payment receipt staging reconciliation — October 23, 2026

The verified receipt fix is pushed to main as `ee15928`; the original migration 120 is now installed and verified on ATS CRM Staging. Only its intended claim-body matching expression changed, preserving the original 119 native entries, protected records/history, rights, proposal-expiry checkpoints and OFF controls. The independent website update `609abe5` is preserved. See `STAGING_PAYMENT_RECEIPT_RECONCILIATION.md` for failed-upgrade rollback/repeat, 32 candidate/installed assertions, native concurrency, fresh schema/maintenance checks and 2,495 passing CRM results. This completes only the staging database step; no app deployment, production query/change, automatic activation or historical-message resend occurred. Existing owner-policy, real mailbox/device/assistive-technology and managed-runtime work remains separate.

### Complete payment-confirmation preparation — October 23, 2026

Migration 120 reconciliation is pushed to main as `d14d504`. The next existing communications/scalable-read gap is verified locally: payment receipt preparation no longer silently succeeds after the first capped page. Bounded UUID paging reads the complete eligible set before bounded same-key writes, and interrupted reads/writes leave recovery pending without a new delivery claim. See `PAYMENT_CONFIRMATION_PLANNING.md` for 2,509 passing CRM checks, typecheck/build, 11 rollback-only SQL assertions per native environment, 16 native-input queue/worker/recovery cases and real local PostgREST acceptance beyond 1,000 payments. Recipients, money, existing queue identities/history, sending controls and security are preserved.

This new batch remains local and undeployed; no migration is needed. Staging remains exactly at 120 with protected state and OFF controls preserved. Other bulk reminder source planners remain the next focused communications follow-up; owner-policy, mailbox/device/assistive-technology and separate managed-runtime work stays in the existing roadmap. No production query/change, automatic activation or customer communication occurred.

### Complete proposal/invoice reminder preparation — October 23, 2026

Payment-confirmation planning is pushed to main as `4a9ea6c`. Proposal follow-up and invoice reminder planning now read beyond the first capped page, retain both existing stages and safely resume bounded same-key writes after interrupted preparation. See `REMINDER_SOURCE_PLANNING.md` for 2,535 passing CRM checks, typecheck/build, 12 native rollback assertions per environment, 32 native-input planner/worker/recovery cases and actual local PostgREST acceptance of 4,004 stages across both complete source sets. Eligibility, expiry, timing, contact precedence, history, financial behavior and existing sending/security controls remain intact.

The new batch remains local and undeployed; no migration is needed. Staging remains at 120 with its exact protected state and OFF controls preserved. Visit-source reads and complete appointment-notice coverage are the next scoped communications follow-up. Existing owner-policy, real mailbox/device/assistive-technology and separate managed-runtime work remains in the same roadmap. No production query/change, automatic activation or customer communication occurred.

### Complete visit reminder planning and notice coverage — October 23, 2026

The verified proposal/invoice reminder fix `9c57df6` is pushed to main through `5005e92`, preserving the concurrent website update `0921c20`. Visit sources now read beyond the first capped page before cleanup/preparation, select the earliest work visit across the whole source set and use bounded same-key writes. Complete notice coverage combines canonical duplicates according to the existing native suppression rule; interrupted reads keep delivery claims blocked and accepted-email recovery pending.

See `VISIT_REMINDER_PLANNING.md` for 2,560 passing CRM checks, typecheck/build, eight rollback-only native assertions per local/staging environment, 38 native-input scenarios and actual local API acceptance of 4,004 stages plus complete notice coverage. Staging remains exactly at migration 120 with protected state and OFF controls preserved. No migration, production query/change, app deployment or customer email occurred. This new batch remains local. Bounded bulk obsolete-visit reconciliation is the next focused communications follow-through; existing owner-policy, real mailbox/device/assistive-technology and managed-runtime work stays separate.

### Bulk obsolete visit-reminder cleanup — October 23, 2026

Visit planning and canonical notice coverage are pushed to main as `5fe849d`. The remaining per-visit cleanup bottleneck is now replaced locally with checked batches of at most 200 sources. Candidate 121 rechecks and locks visit versions before cancelling only obsolete pending rows. Incomplete acknowledgements keep recovery pending without resending; current and nonpending history remain intact. The real local API reduced 2,002 cleanup requests to 12 with the same 4,004 stages.

See `BULK_REMINDER_CLEANUP.md` for 2,573 passing CRM checks, typecheck/build, 43 native local/staging assertions each, 32 native-input recovery cases and eight real two-session concurrency cases. Staging candidate DDL/fixtures rolled back completely and its exact migration-120 baseline and OFF controls are preserved. The new candidate remains local and undeployed. Targeted reconciliation of migration 121 is the next database step; existing owner-policy, real mailbox/device/assistive-technology and managed-runtime work stays separate. No production query/change, customer email or provider request occurred.
