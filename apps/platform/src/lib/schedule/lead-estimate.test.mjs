import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLeadEstimatePrefill,
  defaultEstimateStart,
  isLeadEstimateSchedulable,
} from "./lead-estimate.ts";

const baseLead = {
  id: "73000000-0000-0000-0000-000000000001",
  status: "new_lead",
  service_type: "trimming",
  requested_scope: "Trim the oak over the driveway.",
  internal_notes: "Customer reported a hanging limb.",
  preferred_contact_method: "text",
  preferred_appointment_timing: "Tuesday afternoon",
  source_detail: "Public website request",
  submitted_at: "2026-07-28T14:00:00.000Z",
  service_locations: {
    street: "6917 Bloomsbury Ln",
    city: "Spotsylvania",
    state: "VA",
    postal_code: "22553",
    access_notes: "Use the side gate.",
    service_notes: "Dog will be inside.",
  },
  lead_sources: { name: "Website" },
  lead_estimate: [],
};

test("residential lead maps every supported intake field into the estimate form", () => {
  const result = buildLeadEstimatePrefill({
    ...baseLead,
    customers: {
      display_name: "Donna Goodwin",
      email: "donna@example.test",
      phone: "540-555-0100",
    },
  });

  assert.equal(result.partyType, "customer");
  assert.equal(result.contactName, "Donna Goodwin");
  assert.equal(result.email, "donna@example.test");
  assert.equal(result.phone, "540-555-0100");
  assert.equal(result.street, "6917 Bloomsbury Ln");
  assert.equal(result.city, "Spotsylvania");
  assert.equal(result.postalCode, "22553");
  assert.equal(result.accessNotes, "Use the side gate.");
  assert.equal(result.serviceNotes, "Dog will be inside.");
  assert.equal(result.serviceType, "trimming");
  assert.equal(result.requestedScope, "Trim the oak over the driveway.");
  assert.equal(result.internalNotes, "Customer reported a hanging limb.");
  assert.equal(result.preferredContactMethod, "text");
  assert.equal(result.preferredTiming, "Tuesday afternoon");
  assert.equal(result.leadSource, "Website");
  assert.match(result.calendarNotes, /Tuesday afternoon/);
  assert.match(result.calendarNotes, /side gate/);
});

test("commercial lead uses its organization and existing intake contact without inventing a customer", () => {
  const result = buildLeadEstimatePrefill({
    ...baseLead,
    organizations: {
      name: "Rappahannock Properties Inc",
      billing_email: "billing@example.test",
      billing_phone: "540-555-0111",
    },
    onsite_contact: {
      full_name: "Alex Manager",
      email: "alex@example.test",
      phone: "540-555-0122",
    },
  });

  assert.equal(result.partyType, "organization");
  assert.equal(result.organizationName, "Rappahannock Properties Inc");
  assert.equal(result.contactName, "Alex Manager");
  assert.equal(result.email, "alex@example.test");
  assert.equal(result.phone, "540-555-0122");
});

test("revisiting an estimate keeps the existing event, estimator, and local time", () => {
  const result = buildLeadEstimatePrefill({
    ...baseLead,
    status: "estimate_scheduled",
    customers: {
      display_name: "Donna Goodwin",
      email: null,
      phone: "540-555-0100",
    },
    lead_estimate: [{
      id: "74000000-0000-0000-0000-000000000001",
      title: "Estimate - driveway oak",
      starts_at: "2026-07-30T14:30:00.000Z",
      calendar_notes: "Meet customer by driveway.",
      schedule_event_assignments: [{
        user_id: "75000000-0000-0000-0000-000000000001",
      }],
    }],
  });

  assert.equal(result.eventId, "74000000-0000-0000-0000-000000000001");
  assert.equal(result.assignedUserId, "75000000-0000-0000-0000-000000000001");
  assert.equal(result.eventTitle, "Estimate - driveway oak");
  assert.equal(result.calendarNotes, "Meet customer by driveway.");
  assert.match(defaultEstimateStart(result.existingStartsAt, "2026-08-01T09:00"), /^2026-07-30T/);
});

test("manual schedule defaults remain available and only lead scheduling statuses are accepted", () => {
  assert.equal(defaultEstimateStart("", "2026-08-01T09:00"), "2026-08-01T09:00");
  assert.equal(isLeadEstimateSchedulable("new_lead"), true);
  assert.equal(isLeadEstimateSchedulable("estimate_scheduled"), true);
  assert.equal(isLeadEstimateSchedulable("quoted"), false);
});
