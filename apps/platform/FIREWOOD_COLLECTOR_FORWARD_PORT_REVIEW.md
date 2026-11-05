# Guarded Firewood collector and receipt forward-port

This local follow-up starts from `bb7421c`. It carries the remaining verified collector/receipt source hooks into current main’s application without substituting the frozen 102-era application wholesale. It does not change a hosted database, install a release descriptor, enable a source/sender, contact a provider or deploy an application.

## Source closure included

- Exact pure collector and receipt-source admission modules, bound to the existing fixed-path release reader. Policies are minted in a private WeakMap after fresh key/source checks and revalidated against the exact constructed Stripe client before remote side effects.
- Narrow existing card/ACH preparation, replacement, confirmation and cleanup hooks. Uncertain creates retain provider references and original idempotency keys; there is no automatic second charge. The existing verified live API versions, exact surcharge checks and single CRM receipt authority are retained.
- Session/token-authorized payment context and three customer payment routes pass the minted policy. Marked live invoices cannot take the unmanaged ordinary-invoice path.
- Exact saved receipt pre-claim, pre-transport and final provider-boundary admission. Source/sending status is checked independently of collection/cancellation holds; accepted or uncertain history retains its no-resend recovery behavior.
- Canonical Firewood credit/balance projection, customer state and invoice document hooks. Cancellation credits stay distinct from payments/refunds; uncertain accounting hides payment actions. The live accepted terms are registered as their own immutable version, referencing the same clauses included in the accepted hash.

## Main behavior preserved

The forward-port keeps main’s versioned invoice-link APIs, contracting-party checks, direct delivery-address fallback, print CSS/print-region class, privacy help, recovery contact help, branded reply address, Firewood headings, legacy/default terms, proposal expiry and change-order response behavior. No older `portal-invoice.ts`, email-draft, quote-link or change-order-link file replaces main’s newer implementation.

Ordinary `InvoiceDocument` rendering remains synchronous and does not make a Firewood RPC. A live-only server wrapper loads guarded accounting when a parent has not supplied it; explicit unknown accounting remains closed. This small composition change is necessary to retain main’s lightweight ordinary rendering while adding the reviewed live projection. Customer payment presentation remains a projection of server-verified balances, never payment evidence.

The existing ordinary-invoice unit harnesses now explicitly stub the newly introduced Firewood dependency seam. Their policy stub rejects live invoice markers and non-null policies so those fixtures cannot silently become live admission tests. The separate portable runtime suites execute the actual collector, receipt adapter, dispatcher and sender with synthetic IO, including final provider-boundary checks.

## Deliberately unchanged release boundary

The fixed reader, recovery helper pins, 102-era source/catalog binding, readonly root mounts, exact key fingerprints, schema/source hashes and fresh paired-recovery/worker gates are unchanged. A consistent 129-era binding still fails the existing 102-era profile test. There is no environment-only bypass or catalog-count substitution.

The target must have the reviewed native Firewood functions and receipt claim protection. Positive native unmanaged classification is required even for an ordinary payment receipt; missing classification holds the receipt instead of permitting an unverified send. That dependency has not been installed or reconciled on a 129-era target by this source port.

`supabase/review/firewood-live/receipt-claim-guard.sql` preserves the exact historical review-only guard (SHA-256: 2466b37e115ac00e8f04a1e57b014fbae95dfa8eb62672411122860830240cbe). It requires an isolated review setting and exact 102-era claim/finish preimages, retains ACL/owner/definer settings and is not a 129-era installer. No SQL was executed from that file in this task.

Remaining release work is target-specific SQL/catalog/profile reconciliation, a complete enrolled build/source/image/key/paired-recovery proof, and synthetic end-to-end verification on that explicitly selected target. The separately verified live ACH microdeposit/pending-refund ordering delta in `webhook-recovery.ts` was not copied into this narrow admission port; main’s existing recovery behavior is preserved and that independent delta remains available for separate review.

The original four-commit consolidation branch, dirty development worktrees, frozen 702-file maintenance candidate, live application and scanner are untouched. No push or deployment is performed here.
