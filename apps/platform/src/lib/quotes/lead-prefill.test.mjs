import assert from "node:assert/strict";
import test from "node:test";
import { buildQuoteLeadPrefill } from "./lead-prefill.ts";

const customerLead = {
  id: "73000000-0000-0000-0000-000000000001",
  customer_id: "71000000-0000-0000-0000-000000000001",
  organization_id: null,
  service_location_id: "72000000-0000-0000-0000-000000000001",
  onsite_contact_id: null,
  property_manager_contact_id: null,
  service_type: "tree_removal",
  requested_scope: "Remove the oak near the driveway.",
  website_submission_id: "website-123",
  customers: {
    id: "71000000-0000-0000-0000-000000000001",
    display_name: "Donna Goodwin",
    email: "donna@example.test",
    phone: "540-555-0100",
  },
  organizations: null,
  onsite_contact: null,
  property_contact: null,
  service_locations: {
    id: "72000000-0000-0000-0000-000000000001",
    customer_id: "71000000-0000-0000-0000-000000000001",
    organization_id: null,
    label: "Primary service location",
    street: "6917 Bloomsbury Ln",
    city: "Spotsylvania",
    state: "VA",
    postal_code: "22553",
    access_notes: "Use the side gate.",
    service_notes: "Dog will be inside.",
  },
};

test("customer lead reuses its contracting party, location, contact details, and source job", () => {
  const result = buildQuoteLeadPrefill(customerLead);

  assert.equal(result?.partyValue, `customer:${customerLead.customer_id}`);
  assert.equal(result?.serviceLocationId, customerLead.service_location_id);
  assert.equal(result?.sourceJobId, customerLead.id);
  assert.equal(result?.partyName, "Donna Goodwin");
  assert.equal(result?.email, "donna@example.test");
  assert.equal(result?.phone, "540-555-0100");
  assert.equal(result?.requestedService, "Tree Removal");
  assert.equal(result?.projectDetails, "Remove the oak near the driveway.");
  assert.match(result?.propertyNotes ?? "", /Use the side gate/);
  assert.match(result?.propertyNotes ?? "", /Dog will be inside/);
});

test("organization lead remains organization-owned and selects its active intake contact", () => {
  const organizationId = "74000000-0000-0000-0000-000000000001";
  const contactId = "75000000-0000-0000-0000-000000000001";
  const result = buildQuoteLeadPrefill({
    ...customerLead,
    customer_id: null,
    organization_id: organizationId,
    customers: null,
    organizations: {
      id: organizationId,
      name: "Rappahannock Properties Inc",
      billing_email: "billing@example.test",
      billing_phone: "540-555-0111",
    },
    onsite_contact_id: contactId,
    onsite_contact: {
      id: contactId,
      organization_id: organizationId,
      full_name: "Alex Manager",
      email: "alex@example.test",
      phone: "540-555-0122",
      is_active: true,
    },
    service_locations: {
      ...customerLead.service_locations,
      customer_id: null,
      organization_id: organizationId,
    },
  });

  assert.equal(result?.partyValue, `organization:${organizationId}`);
  assert.equal(result?.recipientContactId, contactId);
  assert.equal(result?.approvalContactId, contactId);
  assert.equal(result?.onsiteContactId, contactId);
  assert.equal(result?.email, "alex@example.test");
  assert.equal(result?.phone, "540-555-0122");
});

test("missing optional intake details stay empty and never become quote scope or pricing", () => {
  const result = buildQuoteLeadPrefill({
    ...customerLead,
    service_type: null,
    requested_scope: null,
    customers: { ...customerLead.customers, email: null, phone: null },
  });

  assert.equal(result?.requestedService, "Not specified");
  assert.equal(result?.projectDetails, "");
  assert.equal(result?.email, "");
  assert.equal(result?.phone, "");
  assert.equal("lineItems" in (result ?? {}), false);
  assert.equal("price" in (result ?? {}), false);
});

test("mismatched service-location ownership is rejected", () => {
  const result = buildQuoteLeadPrefill({
    ...customerLead,
    service_locations: {
      ...customerLead.service_locations,
      customer_id: "76000000-0000-0000-0000-000000000001",
    },
  });

  assert.equal(result, null);
});
