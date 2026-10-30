# Firewood customer checkout wiring review

## Superseding office-v2 connection result — October 30, 2026

The accounting fixes are verified in the CRM local candidate. The Website now uses a separate accounting-aware `office-v2/` connection, with 108 passing checkout regression checks and fresh actual-handler/SQL/browser proofs. Cancellation credit, collectible balance and actual money/refunds remain distinct. The earlier record below is retained as office-v1 history; its old accounting/contract blockers are resolved locally by the new evidence. Actual runtime, sender/provider and final recovery/admission gates remain open. Current decision: [customer release review](FIREWOOD_CUSTOMER_RELEASE_REVIEW.md); full proof is in Website workspace `outputs/firewood-checkout/office-v2-connection-20261030/REPORT.md`.

## Earlier office-v1 review record

## Final regression review follow-up — October 30, 2026

The latest review fixes edited-detail loss after failed office resends, improves interrupted-connection guidance and removes an unverified persistence claim. **81/81 checks and 19-page public validation pass.** Launch remains blocked by the CRM accounting corrections/new v2 integration and actual production runtime/sending/recovery gates. The prior end-to-end proof below remains office-v1 evidence only. Current decision and evidence: [final customer release review](FIREWOOD_CUSTOMER_RELEASE_REVIEW.md).

Prepared October 30, 2026. **The customer layer is implemented and tested locally against the reviewed CRM flow. Activation remains off.** No commit, push, migration, deployment, live credential loading or outgoing email occurred.

The new `scripts/firewood-checkout/customer/` layer preserves the original design and reviewed live/office sources. It adds customer HTTP/session adapters, standard ordering, optional office-price request/review/acceptance, same-invoice payment handoff and lifecycle-aware saved-order status. Customer details are retained, current displayed terms/price acknowledgement is required, and unknown/cancelled/review states cannot regain payment access. Internal signing/approval/invoice/payment IDs are omitted from customer status responses.

**46/46 checks pass:** 10 customer HTTP, two browser-code recovery/race regressions, 18 office companion and 16 unchanged live-profile checks. The 19-page public build/validation passes and excludes this candidate. The design detector reports no findings and no suppressions were added.

Actual browser → Website → CRM handler/RPC adapter → reviewed SQL was exercised using separate owned local fixtures and authenticated office commands. One full-cord stacked request received a genuine fixture-authorized 5% price ($427.50 wood + $142.50 stacking), the customer accepted $570, one invoice was created, closed collection stayed closed, and a controlled paid snapshot ($587.10 including $17.10 fee) remained truthful through an authenticated cancellation hold. No duplicate payment action appeared; original paid proof remained. There were 38 CRM operations and zero provider/email calls.

The CRM SQL test has one explicit, hashed, in-memory `checkout.invalid` domain exception; `other.invalid` still fails. Canonical SQL and the separate native proof database were not changed. Payment rows were synthetic fixtures, not genuine Stripe payments/refunds. Desktop, 320px and full-form 200% text checks showed no horizontal overflow; multiline instructions survived request/reload/acceptance. A subsequent focused browser-code regression covers clearing stale error feedback without another whole visual cycle.

All pre-work protected source files remain unchanged. Public content/SEO/photos, estimate behavior/drafts, analytics and consent are unchanged. The owned previews and both temporary database types were stopped; the owned browser tab closed and viewport reset.

Before launch, two CRM financial gates remain: the issuance/receivables problem after refund or partial lost-dispute reconciliation, and historical cancellation/accounting-credit closure. Actual guarded HTTPS/runtime/session installation, source-aware confirmations/outbox, real provider/shared receiver/sender binding, key custody and fresh paired recovery/admission also remain. The production customer handler still returns 503 and cannot be enabled from environment flags.

Full evidence and diff: `/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/outputs/firewood-checkout/customer-flow-20261030/REPORT.md`.
