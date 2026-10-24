import type { DocumentTerm } from "./legacy-2026-10-22.ts";

export const FIREWOOD_TERMS_VERSION = "firewood-household-2026-10-24" as const;

export function isFirewoodInvoiceTerms(version?: string | null): boolean {
  if (version === FIREWOOD_TERMS_VERSION) return true;
  if (version == null || version === "legacy-2026-10-22") return false;
  throw new Error("This document's terms version is unavailable. Contact our office for help.");
}

// Immutable terms for new, explicitly classified household-firewood invoices.
// Product/price edits never change a saved document's terms version.
export const firewoodInvoiceTerms: readonly DocumentTerm[] = Object.freeze([
  { label: "Your order", text: "The invoice lists the firewood quantity, unit price, product description and any selected stacking service. One full cord is 128 cubic feet when properly stacked; one half cord is 64 cubic feet." },
  { label: "Product description", text: "Red oak, hickory and white oak, seasoned for at least 12 months after splitting. Logs are generally about 14 inches long. Any agreed changes should be shown in the invoice's product description." },
  { label: "Delivery and stacking", text: "Delivery is included in the wood price. Stacking is optional, charged per delivery as listed, and requires wheelbarrow access and a location within a reasonable distance of the truck. Confirm the delivery arrangements with our office." },
  { label: "Payment", text: "Pay the balance by the due date shown on this invoice. Available payment options and any eligible credit-card surcharge are disclosed in secure checkout before authorization. Debit and prepaid card payments are not subject to the eligible-credit-card surcharge." },
  { label: "Household-use tax basis", text: "This invoice records the household-use confirmation for the stated delivery address. Notify our office if the purchase is for business or other nonqualifying use so its tax treatment can be reviewed." },
  { label: "Questions about your delivery", text: "Check the delivered quantity and product against your order and contact Angel Tree Services at (540) 388-8715 with any concerns. Our office will review the issue with you. Paying this invoice does not confirm that your delivery has been completed or inspected." },
].map(term => Object.freeze(term)));
