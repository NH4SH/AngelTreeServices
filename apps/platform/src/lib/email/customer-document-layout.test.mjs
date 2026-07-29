import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCustomerDocumentEmailEdits,
  generateInvoiceEmailDraft,
  generateQuoteEmailDraft,
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
