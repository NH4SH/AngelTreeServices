# Customer payment clarity and closed proposals

October 21, 2026 · local implementation · `codex/customer-payment-clarity`

## Decision and scope

Implements the owner's selected next batch from `CUSTOMER_EXPERIENCE_REVIEW.md`: payment clarity and accurate closed-proposal states, with secure emailed links and clear recovery help as the primary customer entry model. Preserves dashboard commit `08b5297` and the previous CRM work. The branch includes current main `4568081`; no push, app deployment, hosted migration, production configuration change or external customer communication was performed.

This is a refinement of the existing light, green-and-neutral customer documents. The dark dashboard remains an internal operations surface. The earlier independent review's 23/40 score is a historical baseline; this focused batch is not a new full-journey review or a claim that all findings are closed.

## What changed

- Invoice status and a plain next step sit beside the balance. Bank, card and unknown-method pending payments use accurate wording and suppress a second payment chooser. A read-only refresh link is available; no automatic polling or provider reconciliation is triggered.
- Unpaid invoices link directly to payment choices, placed before the full invoice and terms. Full scope, printable invoice and contractual wording remain available and unchanged.
- Paid, zero-balance, void and inconsistent/noncollectible states do not invite another payment. A customer-controlled `payment=success` or `payment=processing` query is only an unconfirmed return hint, never proof of receipt. Refresh preserves uncertainty until recorded state resolves it. Failed and cancelled attempts have cautious retry/help wording without claiming that no payment could have occurred.
- Offline pickup/mailing choices remain usable when online payment is unavailable; disabled bank/card choices are not selected by default. No preference is persisted until the existing submit action is used. Card disclosures respect the existing surcharge switch. Stripe initialization waits until the existing card review is opened.
- Approved, declined, cancelled and expired quote statuses have explicit outcomes instead of an enabled response form. The stored quote status controls presentation; this batch does not introduce a new timestamp-based expiration rule.
- Change-requested quotes explain that review is pending. The existing ability to accept or request further changes remains available under “Review current proposal options.” Normal open quotes show response options immediately.
- Quote/invoice unavailable states and document help provide a usable office call link and instructions to reply to the secure-link email. Invalid/revoked/expired tokens still reveal no customer record. No anonymous record lookup, email sender or customer account hub was added.

## Small functional corrections and boundaries

The invoice page previously derived paid principal from the embedded payment array, which can be capped. It now reuses checkout's existing `getSuccessfulPaymentTotal` read after successful token authorization. That helper validates the complete database principal receipt, including refund and lost-dispute adjustments. The accounting formula is unchanged. If the client or read is unavailable, the page displays recovery help instead of guessing a balance or rendering payment controls. The existing full invoice document and stored accounting fields are untouched; this is not a new atomic invoice/principal transaction or accounting reconciliation command.

The only other interaction changes are presentation gating, progressive disclosure, an available default radio option, disabling unavailable online options and delaying SDK initialization. Payment status descriptions still use the existing token-scoped payment rows; they are not a new durable reconciliation source. Checkout/webhook and approval commands remain authoritative, including under stale pages, concurrency or manually edited URLs.

No server actions, payment API endpoints, token loaders, financial commands, authorization/RLS, SQL, migration history, access boundaries, fee calculations, card review/authorization flow, approval revisions, retry identities or audit history were modified. No environment files or secrets were created or changed. No live Stripe payment or customer email/SMS was sent.

## Verification

| Check | Result |
|---|---|
| Full existing local regression runner | 2,138 passed; zero failed/skipped, including 13 new state/page tests |
| Actual server page tests | Complete receipt used instead of conflicting embedded payments; rate/token checks precede privileged read; unavailable read hides details/payment chooser; settled/pending states suppress another payment |
| Real disposable customer portal integration | Six scenarios / seven TAP results passed; token/privacy, view deduplication, stale/concurrent/replayed approval, manual-payment idempotency and updated balance, invalid/revoked/expired/wrong-document capabilities, malformed/origin/RPC denials |
| Existing installed payment-context SQL integration | 18 scenarios / 19 TAP results passed in rollback; complete histories beyond 1,000 rows, refunds/disputes, read-only receipt, pending reservations and authorization denials; no provider calls |
| Isolated Node 22.23.3 typecheck/build | Passed with synthetic environment/manifest, no credentials, linked site or deploy copied; running preview build directory preserved |
| Rendered desktop/tablet/mobile | 1,365 / 908 / 390 CSS-pixel checks; no horizontal overflow in checked views |
| Keyboard | Change-request disclosure opens with Enter; payment radio ArrowDown changes choice and dependent instructions without submitting |
| Impeccable detector / whitespace | One detector pass, zero findings; `git diff --check` passed |

Real local integration created only synthetic data, retired its test actor and revoked six test tokens. The reusable visual fixtures remain synthetic and local. No application approval or payment was submitted through the browser. Stored secrets, internal notes and token hashes were checked absent from rendered customer responses.

The processing explanation moved from approximately y2140 desktop / y3416 mobile to y384 / y648. Ordinary payment choices moved from approximately y2173 / y3449 to y688 / y971. These are positions in the reviewed synthetic fixtures, not universal performance guarantees.

## Files

- `src/app/portal/invoice/[token]/page.tsx`
- `src/app/portal/quote/[token]/page.tsx`
- `src/app/portal/customer-clarity.css`
- `src/components/invoice-portal-payment-button.tsx`
- `src/components/portal-quote-actions.tsx`
- `src/components/portal-contact.tsx`
- `src/lib/portal/customer-states.ts`
- `src/lib/portal/customer-states.test.mjs`
- `tests/customer-invoice-page.test.mjs`

## Evidence and remaining work

Private local evidence: `/Users/noelsierra/Documents/Codex/2026-10-21/customer-payment-clarity/`. Screenshots contain synthetic records only; do not publish the separate token-bearing fixture file or private environment/status files.

| Evidence | File |
|---|---|
| Previous processing/choice hierarchy | `../dashboard-remake/b-invoice_bank_pending-desktop.png`, `b-invoice_bank_pending-mobile.png`, `b-invoice_choice-desktop.png` |
| New initial processing view | `invoice-processing-first.png`, `invoice-processing-mobile-first.png` |
| New payment choices | `invoice_choice-1365.png`, `invoice_choice-390.png` |
| Closed and waiting proposals | `quote_declined-390.png`, `quote_cancelled-390.png`, `quote_approved-390.png`, `quote_change_requested-390.png`, `quote-change-options-open.png` |
| Return and link recovery | `unconfirmed-return-mobile.png`, `unavailable-link-mobile.png` |
| Checks and exact source fingerprints | `unit.private.log`, `integration.private.log`, `principal-integration.private.log`, `typecheck.private.log`, `build.private.log`, `browser-metrics.json`, `final-source-verification.json` |

Live Stripe/card/ACH returns, real mailbox rendering/delivery, printed/PDF output, screen reader and physical-device acceptance remain separate release gates. No new claim is made for these. No standalone lint script exists in this package; the configured typecheck/build and existing regression runner were used.

Next customer priority: actionable reminder emails using existing secure document links and delivery safeguards. Follow with customer entry/change-order link recovery and the previously recorded appointment cancellation notice gap. Keep these inside the existing communications/portal roadmap. Authoritative contract/payment/debris wording still needs owner confirmation before changing legal document terms. The scanner and all earlier rollout gates remain open.
