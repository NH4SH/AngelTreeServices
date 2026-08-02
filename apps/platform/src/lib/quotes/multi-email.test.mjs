import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMultiQuoteEmailDraft,
  normalizeMultiQuoteIds,
  renderMultiQuoteEmailHtml,
  validateMultiQuoteSelection,
} from "./multi-email.ts";

const customerId = "10000000-0000-4000-8000-000000000001";

function quote(overrides = {}) {
  const id = overrides.id ?? "20000000-0000-4000-8000-000000000001";
  return {
    id,
    quote_number: id.endsWith("1") ? "Q-101" : "Q-102",
    customer_id: customerId,
    organization_id: null,
    archived_at: null,
    status: "draft",
    recurring_occurrence_id: null,
    pricing_reviewed_at: null,
    total_cents: 160000,
    expires_at: "2026-08-17T12:00:00.000Z",
    customers: { id: customerId, display_name: "Annalee Customer", email: "annalee@example.test", phone: null },
    organizations: null,
    approval_contact: null,
    recipient_contact: null,
    service_locations: { id: "30000000-0000-4000-8000-000000000001", label: "Home", street: "7480 Wahoo Way", city: "King George", state: "VA", postal_code: "22485" },
    jobs: { requested_scope: "Remove the oak safely.", service_type: "tree_removal" },
    quote_line_items: [{ id: "40000000-0000-4000-8000-000000000001", name: "Tree removal", description: "Remove the oak safely.", sort_order: 0 }],
    ...overrides,
  };
}

test("quote IDs are validated, deduplicated, and bounded", () => {
  const first = "20000000-0000-4000-8000-000000000001";
  const second = "20000000-0000-4000-8000-000000000002";
  assert.deepEqual(normalizeMultiQuoteIds([first, "not-an-id", first, second]), [first, second]);
  assert.deepEqual(normalizeMultiQuoteIds([first, second], 1), [first]);
});

test("same-customer quotes with one resolved recipient are accepted", () => {
  const result = validateMultiQuoteSelection([
    quote(),
    quote({ id: "20000000-0000-4000-8000-000000000002" }),
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.recipient, "annalee@example.test");
});

test("different parties, recipients, and closed records are blocked", () => {
  assert.match(validateMultiQuoteSelection([
    quote(),
    quote({ id: "20000000-0000-4000-8000-000000000002", customer_id: "10000000-0000-4000-8000-000000000002" }),
  ]).message, /same customer or organization/i);

  assert.match(validateMultiQuoteSelection([
    quote(),
    quote({ id: "20000000-0000-4000-8000-000000000002", customers: { id: customerId, display_name: "Annalee Customer", email: "other@example.test" } }),
  ]).message, /different recipients/i);

  assert.match(validateMultiQuoteSelection([
    quote(),
    quote({ id: "20000000-0000-4000-8000-000000000002", status: "approved" }),
  ]).message, /closed/i);
});

test("organization quotes require one organization and one unambiguous recipient", () => {
  const organizationId = "50000000-0000-4000-8000-000000000001";
  const organizationQuote = (id, email = "approvals@example.test") => quote({
    id,
    customer_id: null,
    organization_id: organizationId,
    customers: null,
    organizations: { id: organizationId, name: "Rappahannock Properties Inc", billing_email: "billing@example.test" },
    approval_contact: { id: "60000000-0000-4000-8000-000000000001", full_name: "Alex Manager", email },
  });

  assert.equal(validateMultiQuoteSelection([
    organizationQuote("20000000-0000-4000-8000-000000000001"),
    organizationQuote("20000000-0000-4000-8000-000000000002"),
  ]).ok, true);
  assert.match(validateMultiQuoteSelection([
    organizationQuote("20000000-0000-4000-8000-000000000001"),
    organizationQuote("20000000-0000-4000-8000-000000000002", "other@example.test"),
  ]).message, /different recipients/i);
});

test("archived and unreviewed recurring quotes are not sendable", () => {
  assert.match(validateMultiQuoteSelection([
    quote(),
    quote({ id: "20000000-0000-4000-8000-000000000002", archived_at: "2026-08-02T12:00:00.000Z" }),
  ]).message, /archived/i);
  assert.match(validateMultiQuoteSelection([
    quote(),
    quote({ id: "20000000-0000-4000-8000-000000000002", recurring_occurrence_id: "70000000-0000-4000-8000-000000000001" }),
  ]).message, /pricing reviewed/i);
});

test("combined draft keeps proposals independent and formats money for customers", () => {
  const draft = buildMultiQuoteEmailDraft([
    { quote: quote(), portalUrl: "https://admin.example.test/portal/quote/token-a" },
    { quote: quote({ id: "20000000-0000-4000-8000-000000000002", total_cents: 40050 }), portalUrl: "https://admin.example.test/portal/quote/token-b" },
  ]);

  assert.equal(draft.items[0].totalLabel, "$1,600");
  assert.equal(draft.items[1].totalLabel, "$400.50");
  assert.match(draft.body, /token-a/);
  assert.match(draft.body, /token-b/);
  assert.doesNotMatch(draft.body, /grand total/i);
  assert.match(draft.intro, /independently/i);
});

test("HTML includes a separate safe call to action for each proposal", () => {
  const maliciousTitle = "Tree removal <script>alert(1)</script>";
  const draft = buildMultiQuoteEmailDraft([
    { quote: quote({ quote_line_items: [{ name: maliciousTitle, description: "Scope", sort_order: 0 }] }), portalUrl: "https://admin.example.test/portal/quote/token-a" },
    { quote: quote({ id: "20000000-0000-4000-8000-000000000002" }), portalUrl: "https://admin.example.test/portal/quote/token-b" },
  ]);
  const html = renderMultiQuoteEmailHtml(draft);

  assert.equal((html.match(/Review proposal/g) ?? []).length, 2);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /token-a/);
  assert.match(html, /token-b/);
});
