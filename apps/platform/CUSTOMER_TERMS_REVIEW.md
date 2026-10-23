# Customer terms consistency review

October 22, 2026. Review baseline: the existing CRM wording, as selected by the owner. This is an engineering comparison of what the application displays and enforces, not approval or a legal assessment of those terms. No application code, terms, prices, fees, migrations or hosted settings were changed. No customer communication was sent.

## Decision

**Fix enforcement of an explicitly stored proposal expiry before rewriting shared terms.** A proposal whose `expires_at` is in the past can still pass the core approval command while its status remains open and its capability token is usable. This was reproduced with the existing in-memory SQL fixture; a read-only staging definition check confirms the installed approval routine checks token expiry and revision, but does not read proposal expiry. Production approval was not exercised.

Next, reconcile record-specific payment/debris instructions and actual invoice due dates across emails, portal review and saved documents. Preserve the currently rendered wording for existing accepted documents before introducing new defaults. The owner still needs to choose the intended business policy for due dates, penalties and warranty; discovering wording in source code is not evidence that the owner approved it.

This continues the existing customer-experience follow-up in `CUSTOMER_EXPERIENCE_REVIEW.md`; it does not introduce a competing roadmap. The released dashboard fix remains intact. Verified customer-branding work remains preserved locally and unreleased.

## What the current CRM says

| Subject | Current proposal wording | Current invoice wording / behavior |
| --- | --- | --- |
| Validity | 30 days when no explicit expiry is supplied; otherwise a specific valid-through date | Not applicable to invoice payment deadlines |
| Debris | All described-work debris removed unless otherwise specified | Scope confirmation refers to the accompanying estimate, work order or invoice |
| Ground disturbance | Tree/stump removal can disturb the ground | No separate matching clause |
| Payment deadline | Full payment due upon completion | Printed terms say within 15 days; the actual invoice has a separately editable `due_at` |
| Payment methods | Proposal-specific payment text can be saved | Printed text names checks, ACH and major cards; the chooser separately uses runtime payment availability |
| Card surcharge | No general proposal surcharge clause | Printed text says 3% for eligible credit cards; payment calculation uses the configured rate, between 0 and 300 basis points, and its enabled flag |
| Late charges | No matching proposal clause | Text says after 15 days: 1.5% monthly / 18% APR or $25, whichever is greater, compounded monthly |
| Returned/declined payments | No matching proposal clause | Text says $35 or the legal maximum |
| Disputes | No matching proposal clause | Text requests written questions/disputes within seven days |
| Warranty | No general proposal warranty clause | Text states 12 months of workmanship coverage with follow-up-care conditions |
| Other invoice clauses | Proposal approval accepts its scope, cost and terms | Collection costs, site access/safety, events beyond company control, liability limits, Virginia law/venue, and acceptance through payment |

These entries describe the checked-in text. They do not establish that a fee was charged, a warranty claim occurred, or any clause is enforceable. The focused search found the late/returned-payment amounts and warranty promise in the document constants, without a corresponding dedicated automatic fee-assessment engine. Manual billing or external business practices were not audited.

Source: `src/lib/documents/terms.ts:8`, `:31`; `src/lib/invoices/due-date.ts:1`; `src/lib/payments/payment-options.ts:14`; `src/lib/payments/card-surcharge.ts:16`.

## Confirmed differences and practical effect

### 1. Stored proposal expiry is not an approval deadline — higher priority

The existing approval core rejects an explicitly `expired` status, an expired/revoked token, and a stale revision. However, a past `quotes.expires_at` by itself does not stop acceptance. Those are different facts: the secure link can remain usable after the proposal's displayed date.

In the existing PGlite fixture, both staff approval and the service-only customer-token command accepted a synthetic open proposal dated January 1, 2020 and created a work order. A control with `status='expired'` was rejected. The installed staging approval/header-validator definitions also contain no proposal-expiry reference; approval still contains token-expiry and expected-revision checks.

This is a deadline-enforcement gap, not evidence of cross-customer access or a failed authorization boundary. The synthetic database uses the existing explicit Auth/effective-access stand-ins; it does not certify real RLS or reproduce a production customer action.

Recommended implementation: reject **new** acceptance after a non-null stored proposal expiry, with the existing lock order and a wall-clock check after lock waits. Preserve read-only/replayed recovery of an approval already committed before proposal expiry, including its first work order, timestamp, source event and delivery history. Existing token expiry/revocation and authorization gates must still apply to recovery. Show a matching closed outcome in the portal. Keep token lifetime separate. Do not infer a 30-day database deadline for undated records without the owner's policy decision. Verify the installed schema with rollback-only staging cases when implementing.

Source: `supabase/migrations/20261016064442_atomic_quote_approval.sql:25`, `:34`, `:44`, `:56`; `supabase/migrations/20261016060143_atomic_quote_editing.sql:49`; `src/lib/data/portal-quote.ts:70`; `src/lib/actions/portal-tokens.ts:91`.

### 2. Custom payment/debris text can disagree with the document being approved

An email for a synthetic proposal included a 50% deposit instruction and a direction to leave chipped material on site. The printed/portal proposal omitted both fields and still showed full payment upon completion and the default debris-removal clause. Scope and the $1,000 total were preserved. An approved-status render behaved the same way.

Separately, saved `Net 30` proposal text was absent from both email and document: the email formatter deliberately filters net-day phrases, while the document always uses the shared payment clause. This suppression may have been intended to distinguish proposal and invoice terms, but the customer-facing artifacts do not explain the distinction.

Recommendation after policy review: use the saved, reviewed instructions consistently for new/revised proposals, with one explicit precedence rule for per-record overrides. Do not derive deposits, charge money, alter scope or override historical accepted terms as part of the presentation change.

Source: `src/lib/documents/email-drafts.ts:155`, `:429`, `:521`; `src/components/documents/quote-document.tsx:61`.

### 3. The invoice's stored date and 15-day boilerplate can conflict

A synthetic invoice issued October 1 with a November 15 due date and `Net 45` showed that date in the document metadata and email, but its document terms still required payment within 15 days and said penalties begin after 15 days. An undated invoice simultaneously displayed “No due date set” and the fixed 15-day clause; its email used saved `Net 30` text.

The application normally generates a due date 15 days after the Eastern business date, but an operator can supply another date. Due-date calculation is not a parser for the free-text `payment_terms` field. Separately, proposal payment upon completion versus invoice payment within 15 days might be an intended grace-period policy, but the current text never explains that relationship.

Recommendation: have customer-facing invoice timing agree with the stored, reviewed due date. Obtain the owner's rule for missing dates and the relationship between completion, due date and any grace period. Do not change overdue calculations, add fees, or reinterpret a free-text term silently.

Source: `src/lib/documents/email-drafts.ts:197`; `src/components/documents/invoice-document.tsx:29`, `:44`; `src/lib/documents/terms.ts:34`, `:42`; `src/lib/invoices/due-date.ts:22`; `src/app/admin/invoices/actions.ts:78`, `:286`.

### 4. Printed 3% wording does not follow payment configuration

For a synthetic $1,000 principal, the existing calculator charged $25 at 250 basis points and zero when surcharging was disabled. The invoice document still stated 3% in either scenario. Eligibility protections remain in the calculator: debit, prepaid, unknown funding and non-US cards are not surcharged by this implementation. This review did not inspect or change live Stripe settings and makes no claim that production currently uses 2.5%.

Recommendation: present the applicable disclosed rate and availability consistently, while keeping checkout's calculation and eligibility authoritative. A document wording correction must not change configured charges, funding checks or reconciliation. Decide how already-issued documents retain their original disclosures before adding dynamic wording everywhere.

Source: `src/lib/payments/payment-options.ts:14`, `:42`; `src/lib/payments/card-surcharge.ts:16`; `src/lib/documents/terms.ts:38`; `src/app/portal/invoice/[token]/page.tsx:123`.

### 5. Missing proposal expiry produces two different messages

Without `expires_at`, proposal metadata asks the customer to contact the office for validity, while the terms assert 30 days. With an explicit expiry, the tested email/document date agreed.

Recommendation: choose whether new proposals must have a concrete date or may be undated. Then use the same meaning in the header, email, approval outcome and terms. Do not replace the separate security-token expiration with the business expiry.

Source: `src/components/documents/quote-document.tsx:43`; `src/lib/documents/terms.ts:86`; `src/lib/documents/email-drafts.ts:165`.

### 6. Shared constants can restate historical documents

The reviewed quote/invoice components render current application constants rather than an immutable copy of the terms associated with the accepted/issued document. `approved_from_revision` protects the quote record version; it does not preserve text that only exists in the current application bundle. No dedicated document-terms version/snapshot field was found in the reviewed quote/invoice types or migrations.

Existing saved email payloads remain frozen and recoverable, which is valuable, but does not freeze what an older portal document renders after a later deployment. A blanket edit to the constants could therefore make a past document differ from its original email or saved PDF without editing its database row.

Recommendation: preserve the present wording as an immutable legacy version before changing defaults. Introduce reviewed terms for future documents through the existing draft/revision workflow; do not rewrite historical accepted records or saved deliveries. This should be a small extension of document/quote safety, not a new contract-management subsystem.

Source: `src/components/documents/quote-document.tsx:61`; `src/components/documents/invoice-document.tsx:44`; `src/lib/documents/terms.ts:8`; `supabase/migrations/20261016064442_atomic_quote_approval.sql:114`.

## Business decisions for the next wording batch

| Decision | Existing facts to reconcile | Needed owner direction |
| --- | --- | --- |
| Normal payment timing | Proposal: on completion. Invoice: 15 days. Explicit dates and commercial terms are supported. | Which deadline is standard, and is the other period a grace period? How should approved exceptions appear? |
| Deposits and debris exceptions | The saved fields exist, but some customer artifacts omit them. | Should a reviewed per-proposal instruction override the corresponding default clause? |
| Penalties and warranty | The text currently includes the late-charge, $35, seven-day and 12-month clauses listed above. | Confirm which existing promises/rules the company actually intends to retain. No new fee or warranty is proposed. |
| Undated proposals | Header asks for help; body says 30 days. | Require an explicit date for new sends, or retain a clearly defined undated policy? |

The explicit-past-expiry approval fix does not require choosing a new default payment or warranty policy. It should lead the next implementation batch.

## Verification and boundaries

- Eight synthetic probes exercised the actual proposal/invoice React document components and actual email/calculation helpers. They reproduced the conflicts, retained input records, scope and totals, and made no database/provider calls. Passing probes establish reproduction, not correctness of the current wording.
- Three in-memory SQL cases used the existing quote-approval fixture and actual migration: past-date staff acceptance, past-date customer-token acceptance, and rejected expired-status control.
- Fourteen existing branding, surcharge and due-date checks passed; zero failures/skips.
- One staging read-only transaction inspected two installed routine definitions and rolled back. It returned hashes/reference-presence facts only. No staging business mutation or app deployment was performed. No production database query or write was performed.
- No browser, real mailbox, payment, screen-reader or physical-device certification is claimed for this review. Prior customer branding/PDF checks remain documented separately. The renderer expansion helper emitted React list-key notices; those are fixture-expansion diagnostics, not a newly demonstrated production UI defect.
- Typecheck/build were not repeated for this documentation-only pass; the application code is unchanged from the previously verified work.

Private reproduction scripts, synthetic HTML/email text, SQL evidence and targeted test log: `/Users/noelsierra/Documents/Codex/2026-10-22/customer-terms-review/`. Sanitized summary: `staging/CUSTOMER_TERMS_REVIEW_20261022.json`. This report and summary remain local for review; no push or deployment was performed in this pass.

## Implementation follow-through — October 22, 2026

The owner authorized proposal-expiry enforcement after this review. New acceptance now checks the stored deadline after lock waits and again before saving approval; the customer page shows the matching closed state. Committed approvals, existing token/role gates, undated behavior, legacy approved-record repair and source-event deduplication are preserved. The full CRM suite, installed-schema local/staging rollback tests, native lock-wait/concurrent-approval tests, typecheck, build and local desktop/mobile inspection passed. See `PROPOSAL_EXPIRY_ENFORCEMENT.md` and `staging/PROPOSAL_EXPIRY_VERIFICATION_20261022.json` for scope and evidence.

This closes finding 1 in the local candidate, not in production. Migration 117 remains deferred for targeted permanent staging installation/reconciliation. The original review evidence above is historical. No terms/defaults were changed, and findings 2–5 and the business decisions remain open.
