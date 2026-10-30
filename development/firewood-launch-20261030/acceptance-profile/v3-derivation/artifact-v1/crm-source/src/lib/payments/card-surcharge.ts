export type CardFundingType = "credit" | "debit" | "prepaid" | "unknown";

export type CardChargeBreakdown = {
  cardFundingType: CardFundingType;
  grossChargeCents: number;
  invoicePrincipalCents: number;
  surchargeCents: number;
  surchargeEligible: boolean;
};

export function normalizeCardFunding(value: unknown): CardFundingType {
  return value === "credit" || value === "debit" || value === "prepaid" ? value : "unknown";
}

export function calculateCardCharge({
  cardCountry,
  funding,
  invoicePrincipalCents,
  surchargeBps,
  surchargeEnabled,
}: {
  cardCountry: string | null;
  funding: CardFundingType;
  invoicePrincipalCents: number;
  surchargeBps: number;
  surchargeEnabled: boolean;
}): CardChargeBreakdown {
  if (!Number.isSafeInteger(invoicePrincipalCents) || invoicePrincipalCents <= 0) {
    throw new Error("Invoice principal must be a positive integer number of cents.");
  }
  if (!Number.isInteger(surchargeBps) || surchargeBps < 0 || surchargeBps > 300) {
    throw new Error("Credit-card surcharge basis points must be between 0 and 300.");
  }

  // International and unknown-country cards remain unsurcharged until the
  // business confirms the rules that apply outside its US service area.
  const surchargeEligible = surchargeEnabled && funding === "credit" && cardCountry === "US";
  const surchargeCents = surchargeEligible
    ? Math.floor((invoicePrincipalCents * surchargeBps + 5_000) / 10_000)
    : 0;

  return {
    cardFundingType: funding,
    grossChargeCents: invoicePrincipalCents + surchargeCents,
    invoicePrincipalCents,
    surchargeCents,
    surchargeEligible,
  };
}

export function allocateRefund({
  grossRefundedCents,
  invoicePrincipalCents,
  surchargeCents,
}: {
  grossRefundedCents: number;
  invoicePrincipalCents: number;
  surchargeCents: number;
}) {
  const grossCollectedCents = invoicePrincipalCents + surchargeCents;
  const boundedRefund = Math.max(0, Math.min(grossRefundedCents, grossCollectedCents));
  if (boundedRefund === grossCollectedCents) {
    return { refundedPrincipalCents: invoicePrincipalCents, refundedSurchargeCents: surchargeCents };
  }

  const refundedPrincipalCents = Math.min(
    invoicePrincipalCents,
    Math.floor((boundedRefund * invoicePrincipalCents + Math.floor(grossCollectedCents / 2)) / grossCollectedCents),
  );

  return {
    refundedPrincipalCents,
    refundedSurchargeCents: Math.min(surchargeCents, boundedRefund - refundedPrincipalCents),
  };
}
