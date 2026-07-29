import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCustomerDocumentEmailEdits,
  generateInvoiceEmailDraft,
  generateQuoteEmailDraft,
  parseScopePresentation,
} from "../documents/email-drafts.ts";
import { renderCustomerDocumentEmailHtml } from "./customer-document-layout.ts";

const location = {
  label: "Primary service location",
  street: "6917 Bloomsbury Ln",
  city: "Spotsylvania",
  state: "VA",
  postal_code: "22551",
};

test("quote draft preserves scope, optional work, first name, total, and secure link", () => {
  const draft = generateQuoteEmailDraft({
    approval_contact: { full_name: "Donna Goodwin" },
    customer_message: "Optional stump grinding is not included in the proposal total.",
    customers: { display_name: "Donna Goodwin" },
    debris_handling: "haul_off_site",
    debris_handling_notes: "Haul brush off-site. Leave firewood stacked near the driveway.",
    expires_at: "2026-08-15T12:00:00.000Z",
    jobs: { requested_scope: "Remove two trees.", service_locations: location },
    notes: [
      { visibility: "customer_visible", body: "Work is contingent on utility-line clearance." },
      { visibility: "internal", body: "Private margin discussion must stay hidden." },
    ],
    organizations: null,
    payment_terms: null,
    quote_line_items: [
      { name: "F1 - Oak removal", description: "Remove oak and clean up debris.", quantity: 1, unit_price_cents: 125000, total_cents: 125000, sort_order: 1 },
      { name: "F2 - Optional stump grinding", description: "Complete only if approved.", quantity: 1, unit_price_cents: 25000, total_cents: 25000, sort_order: 2 },
    ],
    quote_number: "Q-1042",
    recipient_contact: null,
    sent_at: null,
    service_locations: location,
    status: "draft",
    total_cents: 150000,
    updated_at: "2026-07-29T12:00:00.000Z",
  }, { portalUrl: "https://admin.angeltreeservices.org/portal/quote/safe-token" });

  assert.equal(draft.greeting, "Hi Donna,");
  assert.match(draft.subject, /6917 Bloomsbury Ln/);
  assert.match(draft.scopeText, /F1 - Oak removal/);
  assert.match(draft.scopeText, /Optional stump grinding/);
  assert.match(draft.customerNotes, /utility-line clearance/);
  assert.doesNotMatch(draft.body, /Private margin discussion/);
  assert.match(draft.body, /\$1,500\.00/);
  assert.match(draft.body, /safe-token/);
});

test("invoice draft uses authoritative balance, due date, applied credits, and completed scope", () => {
  const draft = generateInvoiceEmailDraft({
    accounts_payable_contact: { full_name: "Maria Lopez" },
    balance_due_cents: 87500,
    billing_contact: null,
    customers: null,
    due_at: "2026-08-20T12:00:00.000Z",
    invoice_line_items: [
      { name: "Completed tree removal", description: "Removal and cleanup included.", quantity: 1, unit_price_cents: 100000, total_cents: 100000, sort_order: 1 },
    ],
    invoice_number: "INV-204",
    jobs: { requested_scope: "Remove tree.", service_locations: location },
    notes: [
      { visibility: "customer_visible", body: "A deduction was applied to prevent duplicate billing." },
      { visibility: "crew_visible", body: "Crew-only note." },
    ],
    organizations: { name: "Rappahannock Properties Inc" },
    payment_terms: "Due within 15 days",
    total_cents: 100000,
  }, { portalUrl: "https://admin.angeltreeservices.org/portal/invoice/safe-token" });

  assert.equal(draft.greeting, "Hi Maria,");
  assert.equal(draft.summaryValue, "$875.00");
  assert.match(draft.customerNotes, /Payments or credits applied: \$125\.00/);
  assert.match(draft.customerNotes, /prevent duplicate billing/);
  assert.doesNotMatch(draft.body, /Crew-only note/);
  assert.match(draft.scopeText, /Removal and cleanup included/);
});

test("branded HTML escapes edited customer content and includes responsive operational branding", () => {
  const generated = generateQuoteEmailDraft({
    approval_contact: null,
    customer_message: null,
    customers: { display_name: "Alex Smith" },
    debris_handling: null,
    debris_handling_notes: null,
    expires_at: null,
    jobs: { requested_scope: "Tree work", service_locations: location },
    notes: [],
    organizations: null,
    payment_terms: null,
    quote_line_items: [],
    quote_number: null,
    recipient_contact: null,
    sent_at: null,
    service_locations: location,
    status: "draft",
    total_cents: 50000,
    updated_at: "2026-07-29T12:00:00.000Z",
  }, { portalUrl: "https://admin.angeltreeservices.org/portal/quote/token" });
  const edited = applyCustomerDocumentEmailEdits(generated, {
    subject: "Proposal <script>alert(1)</script>",
    greeting: "Hi Alex,",
    intro: "Please review <img src=x onerror=alert(1)>.",
    scopeText: "Remove tree\n- cleanup included",
    customerNotes: "No additional charge.",
    closing: "Call with questions.",
  });
  const html = renderCustomerDocumentEmailHtml(edited, {
    logoUrl: "https://admin.angeltreeservices.org/angel-tree-services-logo.jpg",
  });

  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /max-width:640px/);
  assert.match(html, /info@angeltreeservice\.org/);
  assert.match(html, /Review and approve proposal/);
});

test("missing optional dates use a narrow document fallback instead of inventing terms", () => {
  const draft = generateInvoiceEmailDraft({
    accounts_payable_contact: null,
    balance_due_cents: 10000,
    billing_contact: null,
    customers: { display_name: "Jamie Reed" },
    due_at: null,
    invoice_line_items: [],
    invoice_number: null,
    jobs: { requested_scope: "Pruning", service_locations: null },
    notes: [],
    organizations: null,
    payment_terms: null,
    total_cents: 10000,
  });

  assert.equal(draft.timingValue, "See the invoice for payment terms");
  assert.doesNotMatch(draft.body, /15 days/);
  assert.match(draft.scopeText, /Pruning/);
});

test("quote copy removes internal location labels and uses a warm deterministic introduction", () => {
  const draft = generateQuoteEmailDraft({
    approval_contact: { full_name: "Carla Beltrao" },
    customer_message: null,
    customers: { display_name: "Carla Beltrao" },
    debris_handling: null,
    debris_handling_notes: null,
    expires_at: "2026-08-13T12:00:00.000Z",
    jobs: { requested_scope: "Tree and landscape work", service_locations: location, service_type: "landscaping" },
    notes: [],
    organizations: null,
    payment_terms: "Net 15",
    quote_line_items: [
      {
        name: "Tree Service",
        description: "Front of the house.\n- Trim a Holly Tree\nBeside Right\n- Elevate 2 Cypress\nBeside Left\n- Trim a purple bush\nBack property\n- Clean up 3 Crape Myrtles\nClose to the shed\n- Remove 2 branches",
        quantity: 1,
        unit_price_cents: 293000,
        total_cents: 293000,
        sort_order: 1,
      },
    ],
    quote_number: "Q-2048",
    recipient_contact: null,
    sent_at: null,
    service_locations: {
      ...location,
      label: "Primary service location",
      street: "11810 Arthur Ln",
      city: "Fredericksburg",
      postal_code: "22407",
    },
    status: "draft",
    total_cents: 293000,
    updated_at: "2026-07-29T12:00:00.000Z",
  });

  assert.equal(draft.subject, "Angel Tree Services Proposal – 11810 Arthur Ln");
  assert.equal(
    draft.intro,
    "Thank you for the opportunity to provide this proposal for the landscaping and tree work at 11810 Arthur Ln in Fredericksburg.",
  );
  assert.doesNotMatch(draft.body, /Primary service location/);
  assert.doesNotMatch(draft.scopeText, /1 × \$2,930\.00/);
  assert.doesNotMatch(draft.customerNotes, /Net 15/);
  assert.match(draft.scopeText, /Right side of the house/);
  assert.match(draft.scopeText, /Left side of the house/);
  assert.match(draft.scopeText, /Back of the property/);
  assert.match(draft.scopeText, /Near the shed/);
});

test("scope headings become structured presentation blocks without rewriting work details", () => {
  const scope = "Front of the house.\n- Trim a Holly Tree\nBeside Right\n- Elevate 2 Cypress";
  assert.deepEqual(parseScopePresentation(scope), [
    { kind: "heading", text: "Front of the house" },
    { kind: "text", text: "- Trim a Holly Tree" },
    { kind: "heading", text: "Right side of the house" },
    { kind: "text", text: "- Elevate 2 Cypress" },
  ]);
});

test("useful line calculations and explicit proposal terms remain visible", () => {
  const draft = generateQuoteEmailDraft({
    approval_contact: null,
    customer_message: null,
    customers: { display_name: "Jamie Reed" },
    debris_handling: null,
    debris_handling_notes: null,
    expires_at: null,
    jobs: { requested_scope: null, service_locations: location, service_type: "tree_removal" },
    notes: [],
    organizations: null,
    payment_terms: "50% deposit required before scheduling",
    quote_line_items: [
      { name: "Tree removal", description: "Remove two marked trees.", quantity: 2, unit_price_cents: 50000, total_cents: 100000, sort_order: 1 },
      { name: "Stump grinding", description: "Grind one stump.", quantity: 1, unit_price_cents: 25000, total_cents: 25000, sort_order: 2 },
    ],
    quote_number: "Q-2049",
    recipient_contact: null,
    sent_at: null,
    service_locations: location,
    status: "draft",
    total_cents: 125000,
    updated_at: "2026-07-29T12:00:00.000Z",
  });

  assert.match(draft.scopeText, /2 × \$500\.00 = \$1,000\.00/);
  assert.match(draft.scopeText, /1 × \$250\.00 = \$250\.00/);
  assert.match(draft.customerNotes, /50% deposit required before scheduling/);
});

test("HTML renders scope headings, a subdued wrapping link, and one company signoff", () => {
  const draft = generateQuoteEmailDraft({
    approval_contact: null,
    customer_message: null,
    customers: { display_name: "Alex Smith" },
    debris_handling: null,
    debris_handling_notes: null,
    expires_at: null,
    jobs: { requested_scope: null, service_locations: location, service_type: "trimming" },
    notes: [],
    organizations: null,
    payment_terms: null,
    quote_line_items: [
      { name: "Pruning", description: "Front of the house\n- Prune the marked limbs", quantity: 1, unit_price_cents: 50000, total_cents: 50000, sort_order: 1 },
    ],
    quote_number: "Q-2050",
    recipient_contact: null,
    sent_at: null,
    service_locations: location,
    status: "draft",
    total_cents: 50000,
    updated_at: "2026-07-29T12:00:00.000Z",
  }, {
    portalUrl: `https://admin.angeltreeservices.org/portal/quote/${"long-token-".repeat(20)}`,
  });
  const html = renderCustomerDocumentEmailHtml(draft, {
    logoUrl: "https://admin.angeltreeservices.org/angel-tree-services-logo.jpg",
  });

  assert.match(html, /Front of the house/);
  assert.match(html, /copy and paste this secure link into your browser/);
  assert.match(html, /word-break:break-word/);
  assert.equal((html.match(/<strong>Angel Tree Services<\/strong>/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<strong style="color:#174b32;">Angel Tree Services<\/strong>/);
});
