import assert from "node:assert/strict";
import test from "node:test";
import { achCheckoutPaymentMethodTypes } from "./ach-checkout.ts";
import { cardPaymentFeatureEnabled } from "./card-feature.ts";
import {
  cardAuthenticationLifetimeMs,
  cardIntentCanExpire,
  cardIntentMustRemainReserved,
  reservationIsStale,
} from "./card-reservation-policy.ts";
import { normalizeBusinessCheckMailingAddress } from "./check-mailing-address.ts";
import { netSuccessfulPaymentPrincipal } from "./payment-accounting.ts";
import { portalPaymentOwnershipIsValid } from "./portal-ownership.ts";
import { safeWebhookLog, WebhookProcessingError } from "./webhook-logging.ts";

test("lost disputes restore invoice principal exactly once and never count surcharge", () => {
  const payment = {
    amount_cents: 10_000,
    dispute_status: "lost",
    disputed_principal_cents: 10_000,
    refunded_principal_cents: 0,
  };
  assert.equal(netSuccessfulPaymentPrincipal(payment), 0);
  assert.equal(netSuccessfulPaymentPrincipal(payment), 0);
});

test("won and active disputes preserve successful invoice principal", () => {
  for (const dispute_status of ["won", "needs_response", "under_review"]) {
    assert.equal(netSuccessfulPaymentPrincipal({
      amount_cents: 10_000,
      dispute_status,
      disputed_principal_cents: 10_000,
      refunded_principal_cents: 0,
    }), 10_000);
  }
});

test("refund and lost-dispute restoration cannot exceed original principal", () => {
  assert.equal(netSuccessfulPaymentPrincipal({
    amount_cents: 10_000,
    dispute_status: "lost",
    disputed_principal_cents: 8_000,
    refunded_principal_cents: 4_000,
  }), 0);
});

test("abandoned authentication reservations expire but live intents remain reserved", () => {
  const expiredAt = new Date(Date.now() - 1).toISOString();
  assert.equal(reservationIsStale(expiredAt), true);
  assert.equal(cardAuthenticationLifetimeMs, 30 * 60 * 1000);
  for (const status of ["requires_action", "requires_confirmation", "requires_payment_method", "canceled"]) {
    assert.equal(cardIntentCanExpire(status), true);
  }
  for (const status of ["processing", "requires_capture", "succeeded"]) {
    assert.equal(cardIntentMustRemainReserved(status), true);
    assert.equal(cardIntentCanExpire(status), false);
  }
});

test("portal payment ownership requires an exact token, invoice, and contracting party match", () => {
  const invoice = { id: "invoice-1", customer_id: "customer-1", organization_id: null };
  assert.equal(portalPaymentOwnershipIsValid({ customerExists: true, invoice, organizationExists: false, token: invoice }), true);
  assert.equal(portalPaymentOwnershipIsValid({ customerExists: false, invoice, organizationExists: false, token: invoice }), false);
  const organizationInvoice = { id: "invoice-org", customer_id: null, organization_id: "organization-1" };
  assert.equal(portalPaymentOwnershipIsValid({
    customerExists: false,
    invoice: organizationInvoice,
    organizationExists: false,
    token: organizationInvoice,
  }), false);
  assert.equal(portalPaymentOwnershipIsValid({
    customerExists: true,
    invoice,
    organizationExists: false,
    token: { ...invoice, id: "invoice-2" },
  }), false);
  assert.equal(portalPaymentOwnershipIsValid({
    customerExists: true,
    invoice: { ...invoice, organization_id: "organization-1" },
    organizationExists: true,
    token: { ...invoice, organization_id: "organization-1" },
  }), false);
});

test("mailing address accepts multiline, escaped newlines, and the known legacy comma value", () => {
  const expected = "Angel Tree Services LLC\n5802 Ford Rd\nFredericksburg, VA 22407";
  assert.equal(normalizeBusinessCheckMailingAddress(expected), expected);
  assert.equal(normalizeBusinessCheckMailingAddress("Angel Tree Services LLC\\n5802 Ford Rd\\nFredericksburg, VA 22407"), expected);
  assert.equal(normalizeBusinessCheckMailingAddress("Angel Tree Services LLC, 5802 Ford Rd, Fredericksburg, VA 22407"), expected);
  assert.equal(normalizeBusinessCheckMailingAddress("Example, LLC, 1 Main St"), "Example, LLC, 1 Main St");
});

test("webhook logging exposes only allowlisted operational fields", () => {
  const sensitive = new Error("signature secret confirmation token billing details");
  const log = safeWebhookLog({ error: sensitive, eventType: "charge.dispute.created", internalEventCategory: "processing" });
  assert.deepEqual(Object.keys(log).sort(), ["applicationErrorCode", "eventType", "internalEventCategory", "retryable", "route"]);
  assert.equal(JSON.stringify(log).includes(sensitive.message), false);
  assert.equal(safeWebhookLog({
    error: new WebhookProcessingError("dispute_payment_not_ready", true),
    eventType: "charge.dispute.created",
    internalEventCategory: "processing",
  }).applicationErrorCode, "dispute_payment_not_ready");
});

test("ACH Checkout remains bank-account-only", () => {
  assert.deepEqual(achCheckoutPaymentMethodTypes, ["us_bank_account"]);
});

test("card and surcharge activation stays blocked while both flags are false", () => {
  assert.equal(cardPaymentFeatureEnabled({
    hasPublishableKey: true,
    surchargeEnabled: false,
    unsurchargedCardEnabled: false,
  }), false);
});
