# Actionable customer reminder emails

October 21, 2026 · verified local implementation · `codex/actionable-reminder-emails`

## Outcome

Invoice reminders, overdue invoice reminders and proposal follow-ups now contain a clear **View invoice** or **Review proposal** button, a matching copyable secure-link fallback and a usable office call link. The hierarchy and green/neutral styling follow the existing customer document emails. HTML and plain text retain the reference, applicable balance/date/location and bounded proposal scope, with clearer recovery guidance.

Invoice messages direct customers to the current invoice/payment status before paying again. They do not claim settlement, authorize payment, add late fees or create new payment terms. Missing/invalid optional dates direct the reader to the invoice. Closed proposals are still cancelled by the existing send-time checks; an old email leads to the current secure document and its actual state.

The verified portal/dashboard history was pushed atomically and without force to `main` and `codex/customer-payment-clarity` as merge `72b8e26`. It preserves customer commit `c4e8a25`, dashboard `08b5297` and independent website commit `7ab8202`. The pushed tip includes `[skip ci] [skip netlify]`; the published website/admin deploy IDs were unchanged in the read-only after-push check. Staging remained without a published deploy. No deployment, production change or hosted database operation was performed. This new reminder batch remains local, pending push.

## Implementation and preservation

- The shared email-safe button/fallback is extracted from `customer-document-layout.ts`; four representative existing document outputs compare byte-for-byte equal before/after extraction. The default typography is preserved. New reminders use a readable 14px secondary link and 16px body.
- A focused reminder renderer provides a semantic heading, concise introduction, invoice facts, primary action and recovery guidance. Proposal scope stays limited to four items with the existing description limit and appears after the action. Long names, addresses and URLs wrap without horizontal overflow.
- The new reminder renderer rejects unsafe URL schemes, credential-bearing links and non-loopback plain HTTP with a generic error that omits the URL. Production/staging HTTPS and disposable loopback HTTP remain supported. Existing authorized/canonical link generation remains authoritative; no token minting or recipient lookup was added.
- Unchanged: communication planning/scheduling, automatic-send settings, suppression/deduplication, current source/recipient validation, authorization/RLS, claim leases, idempotency keys, frozen payloads, retry limits, provider reconciliation, audit/history repair and all financial calculations. Already frozen deliveries are not rewritten to the new format and cannot gain a new request identity merely because formatting changed.
- Appointment and payment-receipt templates are unchanged; actual generated comparison outputs match. Full documents, legal terms, portal actions, employee/dashboard redesign and prior migrations are preserved.
- No dependency/configuration/environment/secret/schema change. No actual provider email, SMS, payment or customer approval was sent/submitted.

## Verification

| Check | Result |
|---|---|
| Full local regression runner | **2,149 passed**, zero failed/skipped; includes 11 new tests |
| New content tests | Named CTA and identical backup target; invoice facts/date/amount and recovery in both formats; overdue/receipt distinction; bounded proposal scope; optional/invalid data; HTML escaping; safe URL handling; shared button behavior |
| New processor tests | Actual new templates through the unchanged processor with synthetic DB/mock transport; one accepted message per request; unsafe link fails before transport; closed sources/disabled automation suppress sends; uncertain delivery remains quarantined |
| Existing real disposable delivery integration | **26 scenarios / 27 TAP results passed** with local Auth/RLS, concurrent prepare/claim, immutable payload/retry identity, source edits, provider evidence ordering, safe no-send repair, role/offboarding denials and transactional preparation/recovery; provider transport mocked |
| Isolated typecheck/build | Node **22.23.3**, final current source, synthetic environment/manifest; passed. No credentials or linked Netlify state copied and no app deployed |
| Preserved website verification | 173 JavaScript and nine Python tests plus public build/17-page validation passed after main merge. Newer Python required; the Mac's system Python 3.9 cannot parse the preserved website's newer f-string syntax. No source workaround applied |
| Rendered browser checks | 1365, 908, 390 and 320 CSS-pixel views; normal/overdue/proposal, missing scope and extreme name/address/URL; no horizontal overflow in the new previews |
| Keyboard/navigation | Visible focus and Enter on document action; invoice and proposal actions open their real synthetic local secure documents. No payment/approval submitted. Backup targets match the action. Primary action height ~47px; call action ~50px |
| Preservation comparison | Four original document variants byte-identical; appointment and payment-receipt output identical |
| Detector/whitespace | One detector pass; only three Arial warnings, intentionally retained for email client compatibility and incumbent styling. No other findings. `git diff --check` passed |

The old invoice reminder preview contained zero anchors and overflowed at 390px with the actual synthetic secure URL. New previews contain two document anchors plus one call anchor. The main invoice action appears around y439 desktop/y495 mobile; proposal action around y290/y349. These positions describe the checked examples, not every possible customer record.

## Files

- `src/lib/communications/templates.ts`
- `src/lib/email/customer-document-layout.ts`
- `src/lib/email/customer-document-action.ts`
- `src/lib/email/customer-reminder-layout.ts`
- `tests/actionable-reminder-templates.test.mjs`
- `tests/actionable-reminder-processor.test.mjs`

## Review and remaining work

Local synthetic previews: `http://127.0.0.1:3116/invoice.html`, `/overdue.html` and `/proposal.html`. They exercise the real generator; they are not sent messages. Preview amounts/references are illustrative synthetic inputs, and a secure document may show a newer balance. They are separate from the CRM runtime on port3102.

Private local evidence: `/Users/noelsierra/Documents/Codex/2026-10-21/actionable-reminders/`. Before/after screenshots, `browser-metrics.json`, `renderer-preservation.json`, regression/integration/build logs, `delivery-integration.json`, `final-source-verification.json` and `push-verification.json` record the checks. Only synthetic URLs/customer content appear in screenshots. Do not publish private fixture/environment files.

Actual Gmail/Outlook/Apple Mail rendering and delivery, provider link tracking, physical devices, screen-reader and production acceptance remain release gates; browser previews cannot prove them. No new overall customer-review score is claimed. All scanner and prior rollout gates remain.

Source follow-up within the existing payment/communications roadmap: the reminder processor's `getCurrentInvoiceBalance` still sums the returned payment rows. Reuse the existing complete principal-receipt read in a separate safety batch and verify histories beyond the API row cap, refunds/disputes and failure handling. This source-level scaling concern does not demonstrate an incorrect production invoice; the current batch deliberately leaves financial reads/commands unchanged. Customer entry/change-order recovery, the appointment cancellation-notice gap and owner-confirmed contractual consistency remain subsequent customer-experience work.

Deployment-skip reference: [Netlify deploy management](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/). No provider settings were changed.
