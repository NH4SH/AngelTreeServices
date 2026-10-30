import { formatBusinessDate } from "@/lib/business-time";
import { DOCUMENT_TERMS_LEGACY_VERSION, legacyInvoiceTerms, legacyQuoteTerms } from "./terms/legacy-2026-10-22.ts";
import type { DocumentTerm } from "./terms/legacy-2026-10-22.ts";
import { isFirewoodInvoiceTerms, firewoodInvoiceTerms } from "./terms/firewood-2026-10-24.ts";
import { FIREWOOD_CHECKOUT_TEST_TERMS_VERSION, firewoodCheckoutTestTerms } from "./terms/firewood-checkout-test-2026-10-25.ts";

export { DOCUMENT_TERMS_LEGACY_VERSION };
export type { DocumentTerm };
// Compatibility exports always mean the legacy baseline, never a latest default.
export const quoteTerms = legacyQuoteTerms;
export const invoiceTerms = legacyInvoiceTerms;

function requireSupportedVersion(version?: string | null) {
  // Pre-migration records have no version field and retain their existing text.
  if ((version ?? DOCUMENT_TERMS_LEGACY_VERSION) !== DOCUMENT_TERMS_LEGACY_VERSION) {
    throw new Error("This document's terms version is unavailable. Contact our office for help.");
  }
}

export function getInvoiceTerms(version?: string | null): readonly DocumentTerm[] {
  if (version === FIREWOOD_CHECKOUT_TEST_TERMS_VERSION) return firewoodCheckoutTestTerms;
  if (isFirewoodInvoiceTerms(version)) return firewoodInvoiceTerms;
  requireSupportedVersion(version);
  return legacyInvoiceTerms;
}

export function getQuoteTerms(expiresAt?: string | null, version?: string | null): readonly DocumentTerm[] {
  requireSupportedVersion(version);
  if (!expiresAt) return legacyQuoteTerms;
  return Object.freeze([
    Object.freeze({ label: "Validity", text: `This estimate is valid through ${formatBusinessDate(expiresAt, { dateStyle: "long" })}.` }),
    ...legacyQuoteTerms.slice(1),
  ]);
}
