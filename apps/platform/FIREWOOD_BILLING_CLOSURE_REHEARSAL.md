# Firewood billing-closure rehearsal

> Follow-up: the reproduced financial defects below were subsequently fixed and tested locally. See [issuance and billing implementation](FIREWOOD_ISSUANCE_AND_BILLING_IMPLEMENTATION.md). This earlier rehearsal remains the original failure evidence.

October 30, 2026. This is the focused follow-up to the office-workflow review, using the retained production-102 definitions and the inactive Firewood candidate. It is not a new CRM audit or an accounting-policy change.

**The native rehearsal is complete. The financial guards and cancellation holds passed; live release remains blocked.** Actual 102 reconciliation turns a fully paid Firewood invoice back into a draft after a full refund, partial refund, bank return or partial lost dispute, because preparation did not record document delivery. Its positive debt then disappears from ordinary AR, including when some paid principal remains. Separately, historical positive debt still needs a proper accounting adjustment before cancellation can finish. Neither issue was hidden or worked around. No application or canonical SQL changes, production/staging changes, scanner changes, provider calls or customer emails were made.

## Decision already supported by the existing commands

The clean cancellation and the money-history cancellation are different financial operations. For this accepted Firewood profile, coordinated cancellation intentionally admits the existing original void commands only when its invoice has no payment rows and no checkout rows. Other original invoice workflows still retain their own reviewed checkout-reconciliation rules. A fully refunded invoice with a positive original balance needs an accounting adjustment, not another refund and not a zero-balance patch. The current 102 command set has no credit-note, debt-release or write-off operation. The manual-payment cancellation and restoration commands correct receipt records; they do not cancel an accepted sale or provide that missing accounting operation.

The office workflow correctly leaves these historical cases held for billing review. It must not label them finally cancelled or settled. Existing received-money, original-paid proof, refunds, bank returns, disputes and checkout history remain authoritative.

## Scope and target safeguards

`scripts/verification/firewood-native-billing-checks.mjs` exports `runNativeBilling({ pool, identity, outputPath })`. The caller supplies the already-open isolated PostgreSQL pool plus the exact database name, cluster system identifier and synthetic database comment. Every transaction verifies all three before reading or writing. The script discovers no connection strings, environment files, hosted projects, provider credentials or recovery authority.

The rehearsal uses genuine Auth/profile/role rows and actual effective-access predicates, authenticated RLS and original financial commands. The synthetic owner has no password or API login. Fictional contacts occupy the reserved 202-555-7000–7999 range. Manual cash entries and deliberately seeded returned/refunded ledger states are expressly synthetic; they are not Stripe observations, real refunds or proof of customer payment. The partial-dispute case uses a separately labeled fictional Stripe payment with synthetic identifiers and invokes the actual private 102 dispute allocator; it does not insert or claim a real webhook/provider receipt. No checkout reconciliation stamp is invented.

Only the isolated handoff-source preparation fixture is enabled. Collection, surcharge reporting and sending stay off and their flags must remain unchanged. The suite retains its synthetic rows and immutable history rather than deleting evidence. It does not enroll new tables in live guards, backups or five-minute recovery authority.

## Measured native results

Eleven cases executed against native PostgreSQL **17.11**, in the separate Unix-socket-only database `fw_office_native_6186e960daa2_billing`. Every transaction pinned the actual database, cluster system identifier and exact synthetic database comment. The final suite completed 109 bounded operations and 147 target/access/rejection checks. The initial eight-case proof is preserved separately. Four additional negative target checks rejected bad input or the wrong actual database before any mutation. These counts do not imply release readiness.

The accepted fixture is a full cord plus stacking: **$600**. Refund/return entries below are deliberately synthetic local ledger states, using actual recorded fictional manual payments, a separately labeled fictional Stripe dispute fixture, and actual reconciliation, constraints, triggers and report views. They do not certify a genuine provider refund, bank return or dispute.

| Case | Actual result |
| --- | --- |
| Full-eligible order, no payment or checkout history | Original guarded void and final cancellation succeeded. Status became `void`; amount and original balance both remained 60,000 cents. Actual AR and invoice-report rows were absent, and the real dashboard outstanding total decreased exactly 60,000 cents. Exact retry returned the same acknowledgement. |
| Fully refunded historical $600 payment | Confirmation and the original money-history void were denied; original paid proof and 60,000-cent debt remained. Office status correctly stayed `cancellation_requested` / `billing_closure_required`. **Invoice status became `draft`, with `sent_at = NULL` and zero AR rows: release-blocking report defect.** |
| Partial $300 payment, then synthetic refund | Retained money first required `refund_review`. After refund it required `billing_closure_required`; balance remained 60,000 cents. Status was `sent` and ordinary AR retained one row. No automatic refund or debt erasure. |
| Full $600 payment, then $300 partial refund | Payment correctly remained `succeeded` with 30,000 refunded cents. Actual reconciliation retained 30,000 paid-principal cents and restored a 30,000-cent balance; repeated reconciliation was stable. **Invoice became `draft`, `sent_at` stayed NULL and AR had zero rows.** Office correctly held `refund_review`; original $600 paid proof was unchanged. |
| Full $600 payment, then valid $300 lost dispute | The original 102 dispute allocator applied the bounded principal loss. Actual reconciliation retained 30,000 paid-principal cents and restored a 30,000-cent balance; repeated reconciliation was stable. **Invoice became `draft`, `sent_at` stayed NULL and AR had zero rows.** Office correctly held `payment_review`; original $600 paid proof was unchanged. No unsupported “partial bank return” state was invented. |
| Recorded-delivery positive control and ordinary unsent-draft matrix | The actual owner delivery-recording command was used on a separate, explicitly synthetic control—not on any failing case. A full payment followed by partial refund then remained `partially_paid`, with a 30,000-cent balance and one AR row. Actual original resolver matrix: undelivered paid → partial reversal gives `draft`; recorded delivery gives `partially_paid`; ordinary unsent draft with prepayment remains `draft`. |
| Previously collected $600 subsequently returned | `payment_review` hold; original paid proof remained, confirmation and original final void were denied, and no second refund was requested. **Invoice status became `draft`, with 60,000-cent debt and zero AR rows: the same report defect.** |
| Expired checkout history | `billing_closure_required` remained held. It was not treated as a never-attempted order, and the checkout's original void reconciliation token stayed absent. |
| Fully paid late non-refundable cancellation | Final cancellation succeeded; invoice stayed `paid`, balance stayed zero, actual AR had no row, and the payment ledger was byte-for-byte unchanged. No refund. |
| Unpaid late non-refundable cancellation | `billing_closure_required` remained held. Invoice stayed `sent`, balance stayed 60,000 cents and ordinary AR retained one row. No debt forgiveness was invented. |
| Ordinary invoice, outside new Firewood guards | Unchanged original guards rejected direct initial void, direct status void, paid header/line rewrite, paid void, history deletion and authenticated balance patching. Financial history was unchanged. This fixture was not linked to a Firewood handoff, so the original guards—not a new Firewood restriction—produced these denials. |

The initially missing `owner` business-role row was added as synthetic fixture data using the real role tables. Actual Auth/profile/effective-access functions and original financial functions were never replaced or bypassed.

## Confirmed reporting blocker and truthful issuance options

Actual 102 `app_private.report_ar` excludes `draft`, `paid` and `void` invoices; the dashboard uses that view for its outstanding total. The live preparation candidate creates an invoice with status `sent` and no `sent_at`. Actual 102 `invoice_payment_status` checks the unsent `draft`/`paid` branch **before** checking whether retained paid principal is positive. A previously fully paid invoice can therefore become `draft` after even a partial reversal, with both real retained principal and renewed positive debt. Repeated reconciliation keeps it a draft.

The native suite reproduced this reporting defect after full refund, full payment return, partial refund and partial lost dispute, while the office holds correctly remained in place. By contrast, an initially partial payment followed by refund stayed `sent` because it did not enter reconciliation from `paid`. A separate synthetic recorded-delivery control produced the expected `partially_paid` status and AR balance. Ordinary unsent draft prepayments still correctly remained drafts, which is why the original global resolver must not be weakened.

The original invoice creation command deliberately creates a draft with no delivery timestamp. Actual 102 `record_invoice_delivery(invoice, true)` records an owner/admin attestation that delivery occurred outside the CRM, writes `sent_at`, and audits `invoice_marked_sent_manually`; its existing interface says “Record delivery without sending another email.” The email repair path sets `sent_at` only after an accepted outbound delivery with a provider receipt. Therefore `sent_at` is broader than email delivery but still means **recorded document delivery**, not generic server-side invoice creation.

Setting `sent_at` during preparation would invent delivery: the returned server reply can be lost, and the customer-facing route/delivery acknowledgement is not integrated yet. Calling the manual-delivery command automatically would invent that owner attestation. Neither is an acceptable repair.

The minimal future correction should be owned by the new candidate: explicitly distinguish financial issuance of the accepted order from actual document delivery, then preserve the financially issued positive-debt state through refund/return reconciliation without modifying delivery history. Alternatively, a bound, idempotent acknowledgement of actual Website document delivery can drive an appropriately reviewed delivery-recording operation after the customer route exists. Either path needs native regression checks for lost replies, no actual delivery, partial/full refunds, bank returns, original report semantics and the unchanged general invoice workflow. No original financial resolver, report filter or historical record was changed during this rehearsal.

Until that distinction is implemented and verified, the observed reporting gap is a release blocker. It is not permission to backfill delivery timestamps.

## Next implementation decision

Keep public ordering, collection and sending inactive. First correct the candidate's issuance/delivery distinction and rerun these exact native refund/return/report cases. Then define and implement the missing invoice-bound accounting adjustment for an accepted order cancelled after money history. It must link the cancellation and original invoice, retain original amounts and payment/refund/surcharge evidence, apply the accepted full-versus-non-refundable policy, preserve unresolved settlement/refund/dispute holds, and update effective receivables/reporting through an audited, atomic, idempotent command with genuine authorization and concurrency checks. A refund and cancellation of the sale are separate facts; the adjustment must not trigger another charge, refund or customer email.

The office can continue to display its truthful hold until that operation exists. A manual zero balance, fake payment, extra refund or relaxed original void guard is not a substitute. Paid late non-refundable cancellation is already supported by the existing commands and passed; it does not require inventing a credit.

## Evidence and final state

- Native results: `/Users/noelsierra/Documents/Codex/2026-10-30/firewood-native-rehearsal/target-6186e960daa2/BILLING_PROOF.json`.
- Preserved initial eight-case results: `/Users/noelsierra/Documents/Codex/2026-10-30/firewood-native-rehearsal/target-6186e960daa2/BILLING_PROOF.initial.json`.
- Final flags/target proof: `/Users/noelsierra/Documents/Codex/2026-10-30/firewood-native-rehearsal/target-6186e960daa2/BILLING_FINAL_FLAGS_PROOF.json`.
- Executed runner SHA-256: `358097331c8a66ffaa0da1e438796d6675d204de6b76a0a28fe9082ecf23aa75`.
- Final native results SHA-256: `f399c880208d18499fff9bef2925d227a6266a1f5e357f1e80151edda1b01e4c`.
- Initial native results SHA-256: `e290ed5674ce88bfdacabdfcafec8579d1b5c0b9e18678c1b1c8a4a0e559866b`.

After the additional checks, **all four source flags were turned off again in this isolated billing clone** and verified. The initial final-flags proof was preserved as `BILLING_FINAL_FLAGS_PROOF.initial.json`. Across both runs, nineteen synthetic handoffs, twenty-four office events, thirteen synthetic payment records and related financial history were retained. No tables, history or source evidence were deleted. Pools were closed and the database released to the root task for shutdown. The clone received no live runtime, recovery authority or provider credentials. No commit, push, merge, hosted migration, production change or deployment was performed.
