// Dependency seams for the pre-existing ordinary-invoice regression harnesses.
// These are not the Firewood admission tests: scripts/firewood-verification runs
// the actual collector, receipt adapter, dispatcher and sender with synthetic IO.
// Reject marked inputs so an ordinary fixture cannot accidentally stand in for
// an enrolled live Firewood scenario or a forged collector policy.
import assert from 'node:assert/strict';
const ordinary = invoice => {
  assert.ok(!invoice?.invoice_number?.startsWith('INV-FW-'), 'Live Firewood needs the actual guarded runtime suite');
  assert.ok(!invoice?.document_terms_version?.startsWith('firewood-household-live-'), 'Live Firewood needs the actual guarded runtime suite');
};
const noPolicy = policy => assert.equal(policy == null, true, 'Explicit Firewood policies need the actual guarded runtime suite');
export const ordinaryFirewoodPolicy = {
  FIREWOOD_HANDOFF_TERMS: 'firewood-handoff-test-2026-10-29',
  async getFirewoodCollectorPolicy(_db, invoice) { ordinary(invoice); return { ok: true, policy: null }; },
  getFirewoodOrderReturnUrl(invoice) { ordinary(invoice); return null; },
  async revalidateFirewoodCollection(input) { noPolicy(input.policy); ordinary({ invoice_number: input.invoiceNumber }); return true; },
  isLiveCollectorPolicy(policy) { noPolicy(policy); return false; },
  firewoodCardConfigurationMatches(policy) { noPolicy(policy); return true; },
  firewoodSurchargeFields(policy) { noPolicy(policy); return null; },
};
export const ordinaryReceiptAdmission = {
  async inspectSavedReceiptBeforeClaim() { return { ok: true, row: null, message: 'Synthetic ordinary receipt boundary', beforeTransport: async () => true }; },
  async allowReceiptAtProviderBoundary() { return true; },
};
