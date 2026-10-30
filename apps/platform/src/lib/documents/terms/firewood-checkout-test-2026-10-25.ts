import type { DocumentTerm } from "./legacy-2026-10-22.ts";
export const FIREWOOD_CHECKOUT_TEST_TERMS_VERSION = "firewood-checkout-test-2026-10-25" as const;
// A separate immutable family: never rewrite existing household-use tax or
// tree-service terms, and never describe this test assumption as a live exemption.
export const firewoodCheckoutTestTerms: readonly DocumentTerm[] = Object.freeze([
  { label: "Test record", text: "This invoice is a test-only record of a verified test checkout payment. It is not a live order, tax determination or request for another payment." },
  { label: "Firewood and delivery", text: "The invoice lists the purchased cord size and any optional stacking. Delivery is included at no extra charge. Quantity savings are already included in the wood price; no additional card surcharge or automatic discount is added." },
  { label: "Delivery arrangements", text: "Angel Tree Services will contact the customer with a delivery date within one week of ordering. This is not a promise to complete delivery within one week. Payment does not mark the delivery complete." },
  { label: "Stacking", text: "Optional stacking is $150 once per delivery and requires wheelbarrow access and a reasonable carrying distance from the truck." },
  { label: "Cancellation", text: "A cancellation at least 48 hours before the scheduled delivery qualifies for a full refund. A cancellation with less notice is non-refundable." },
  { label: "Tax review", text: "Zero tax in this test is an unresolved test assumption. Tax treatment must be confirmed before live orders are enabled." },
  { label: "Payment record", text: "The original checkout payment is recorded against this invoice. Any refund or dispute is reconciled to that same payment and requires office review; it must not cause an automatic new charge or unpaid reminder." },
].map(x => Object.freeze(x)));
