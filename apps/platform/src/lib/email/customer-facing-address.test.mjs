import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCustomerFacingAddress,
  formatCustomerFacingLocationPhrase,
  generateQuoteEmailDraft,
} from "../documents/email-drafts.ts";
import { renderCustomerDocumentEmailHtml } from "./customer-document-layout.ts";

test("formats a complete customer-facing address", () => {
  const location = {
    street: "7480 Wahoo Way",
    city: "King George",
    state: "VA",
    postal_code: "22485",
  };

  assert.equal(formatCustomerFacingAddress(location), "7480 Wahoo Way, King George, VA 22485");
  assert.equal(formatCustomerFacingLocationPhrase(location), " at 7480 Wahoo Way in King George, VA 22485");
});

test("formats street, city, and state without inventing a ZIP code", () => {
  const location = { street: "18 Main St", city: "Stafford", state: "VA" };
  assert.equal(formatCustomerFacingAddress(location), "18 Main St, Stafford, VA");
});

test("formats street and city when state is missing", () => {
  const location = { street: "18 Main St", city: "Stafford", state: null };
  assert.equal(formatCustomerFacingAddress(location), "18 Main St, Stafford");
  assert.equal(formatCustomerFacingLocationPhrase(location), " at 18 Main St in Stafford");
});

test("formats a street-only location", () => {
  const location = { street: "18 Main St", city: null, state: null };
  assert.equal(formatCustomerFacingAddress(location), "18 Main St");
  assert.equal(formatCustomerFacingLocationPhrase(location), " at 18 Main St");
});

test("formats a city-and-state-only location", () => {
  const location = { street: null, city: "Fredericksburg", state: "VA" };
  assert.equal(formatCustomerFacingAddress(location), "Fredericksburg, VA");
  assert.equal(formatCustomerFacingLocationPhrase(location), " in Fredericksburg, VA");
});

test("returns no customer address when every value is unusable", () => {
  const location = { street: "Not provided", city: "Needs confirmation", state: "N/A", postal_code: null };
  assert.equal(formatCustomerFacingAddress(location), "");
  assert.equal(formatCustomerFacingLocationPhrase(location), "");
});

test("suppresses a state confirmation sentinel without suppressing the locality", () => {
  const location = { street: "7480 Wahoo Way", city: "King George", state: "Needs confirmation" };
  assert.equal(formatCustomerFacingAddress(location), "7480 Wahoo Way, King George");
  assert.equal(formatCustomerFacingLocationPhrase(location), " at 7480 Wahoo Way in King George");
});

test("recovers the locality from the confirmed comma-less intake shape", () => {
  const location = { street: "7480 Wahoo Way King George", city: "Needs confirmation", state: "VA" };
  assert.equal(formatCustomerFacingAddress(location), "7480 Wahoo Way, King George, VA");
  assert.equal(formatCustomerFacingLocationPhrase(location), " at 7480 Wahoo Way in King George, VA");
});

test("suppresses only exact confirmed placeholder values", () => {
  assert.equal(formatCustomerFacingAddress({ street: "Unknown", city: "N/A", state: "Not provided" }), "");
  assert.equal(
    formatCustomerFacingAddress({ street: "42 Unknown Road", city: "Fredericksburg", state: "VA" }),
    "42 Unknown Road, Fredericksburg, VA",
  );
});

test("trims whitespace and collapses repeated spaces", () => {
  const location = { street: "  18   Main St  ", city: "  Stafford ", state: " VA ", postal_code: " 22554 " };
  assert.equal(formatCustomerFacingAddress(location), "18 Main St, Stafford, VA 22554");
});

test("avoids duplicate components and malformed punctuation", () => {
  const location = { street: "18 Main St, Stafford", city: "Stafford", state: "VA" };
  const formatted = formatCustomerFacingAddress(location);
  assert.equal(formatted, "18 Main St, Stafford, VA");
  assert.doesNotMatch(formatted, /,\s*,|\s{2,}|,\s*$/);
});

test("plain-text proposal copy excludes internal address placeholders", () => {
  const draft = quoteDraft({ street: "7480 Wahoo Way", city: "King George", state: "Needs confirmation" });
  assert.equal(
    draft.intro,
    "Thank you for the opportunity to provide this proposal for the tree work at 7480 Wahoo Way in King George.",
  );
  assert.doesNotMatch(draft.body, /Needs confirmation|\bN\/A\b|\bundefined\b|\bnull\b/i);
});

test("HTML proposal output excludes internal address placeholders", () => {
  const draft = quoteDraft({ street: "7480 Wahoo Way King George", city: "Needs confirmation", state: "VA" });
  const html = renderCustomerDocumentEmailHtml(draft);
  assert.match(html, /7480 Wahoo Way in King George, VA/);
  assert.doesNotMatch(html, /Needs confirmation|\bN\/A\b|\bundefined\b|\bnull\b/i);
});

function quoteDraft(serviceLocation) {
  return generateQuoteEmailDraft({
    approval_contact: { full_name: "Taylor Reed" },
    customer_message: null,
    customers: { display_name: "Taylor Reed" },
    debris_handling: null,
    debris_handling_notes: null,
    expires_at: null,
    jobs: { requested_scope: "Remove a hazardous oak.", service_locations: serviceLocation, service_type: null },
    notes: [],
    organizations: null,
    payment_terms: null,
    quote_line_items: [
      { name: "Tree removal", description: "Remove the marked oak.", quantity: 1, unit_price_cents: 100000, total_cents: 100000, sort_order: 1 },
    ],
    quote_number: "Q-ADDRESS",
    recipient_contact: null,
    sent_at: null,
    service_locations: serviceLocation,
    status: "draft",
    total_cents: 100000,
    updated_at: "2026-08-02T12:00:00.000Z",
  });
}
