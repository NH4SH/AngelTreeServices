import assert from "node:assert/strict";
import test from "node:test";
import { allocateRefund, calculateCardCharge, normalizeCardFunding } from "./card-surcharge.ts";

test("adds a rounded 3 percent surcharge only to US credit cards", () => {
  assert.deepEqual(calculateCardCharge({
    cardCountry: "US",
    funding: "credit",
    invoicePrincipalCents: 100_00,
    surchargeBps: 300,
    surchargeEnabled: true,
  }), {
    cardFundingType: "credit",
    grossChargeCents: 103_00,
    invoicePrincipalCents: 100_00,
    surchargeCents: 3_00,
    surchargeEligible: true,
  });
});

test("never surcharges debit, prepaid, unknown, or non-US cards", () => {
  for (const funding of ["debit", "prepaid", "unknown"]) {
    assert.equal(calculateCardCharge({ cardCountry: "US", funding, invoicePrincipalCents: 10_01, surchargeBps: 300, surchargeEnabled: true }).surchargeCents, 0);
  }
  assert.equal(calculateCardCharge({ cardCountry: "CA", funding: "credit", invoicePrincipalCents: 10_01, surchargeBps: 300, surchargeEnabled: true }).surchargeCents, 0);
});

test("keeps the surcharge disabled regardless of funding", () => {
  assert.equal(calculateCardCharge({ cardCountry: "US", funding: "credit", invoicePrincipalCents: 99_99, surchargeBps: 300, surchargeEnabled: false }).surchargeCents, 0);
});

test("normalizes unsupported funding classifications to unknown", () => {
  assert.equal(normalizeCardFunding("credit"), "credit");
  assert.equal(normalizeCardFunding("mystery"), "unknown");
  assert.equal(normalizeCardFunding(null), "unknown");
});

test("allocates full and partial refunds without exceeding either component", () => {
  assert.deepEqual(allocateRefund({ grossRefundedCents: 103_00, invoicePrincipalCents: 100_00, surchargeCents: 3_00 }), {
    refundedPrincipalCents: 100_00,
    refundedSurchargeCents: 3_00,
  });
  assert.deepEqual(allocateRefund({ grossRefundedCents: 51_50, invoicePrincipalCents: 100_00, surchargeCents: 3_00 }), {
    refundedPrincipalCents: 50_00,
    refundedSurchargeCents: 1_50,
  });
});
