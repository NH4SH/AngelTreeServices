import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canCreateMobileParties,
  cleanMobileSearchTerm,
  formatAddress,
  mergeMobilePartyDirectoryRows,
  mergeMobilePartyResults,
  mobileJobOperationalStates,
  normalizeMobileDirectoryLimit,
  normalizeMobileJobScope,
  toMobileServiceLocation,
  validateMobilePartyCreateInput,
} from "./mobile-field-contract.ts";
import {
  canManageMobileQuotes,
  normalizeMobileQuoteScope,
  quoteStatusesForScope,
  validateMobileQuoteWriteInput,
} from "./mobile-quotes.ts";
import {
  canRecordMobilePayments,
  canViewMobileInvoices,
  invoiceStatusesForScope,
  normalizeMobileInvoiceScope,
  validateMobileManualPayment,
} from "./mobile-invoices.ts";

test("customer search input is bounded and safe for PostgREST or filters", () => {
  assert.equal(cleanMobileSearchTerm("  Donna%, (Goodwin)  "), "Donna Goodwin");
  assert.equal(cleanMobileSearchTerm("a".repeat(100)).length, 80);
});

test("service locations retain field instructions and format addresses", () => {
  const location = toMobileServiceLocation({
    id: "location-one",
    label: "Rear lot",
    street: "6917 Bloomsbury Ln",
    city: "Spotsylvania",
    state: "VA",
    postal_code: "22553",
    access_notes: "Use side gate",
    gate_code: "1234",
    service_notes: "Protect flower bed",
  });

  assert.equal(location.fullAddress, "6917 Bloomsbury Ln, Spotsylvania, VA 22553");
  assert.equal(location.accessNotes, "Use side gate");
  assert.equal(formatAddress({ street: "Main St", city: "Richmond", state: "VA", postal_code: null }), "Main St, Richmond, VA");
});

test("search results deduplicate parties while retaining a matched location", () => {
  const direct = [{
    id: "customer-one",
    kind: "customer",
    name: "Donna Goodwin",
    contactName: null,
    email: null,
    phone: null,
    address: null,
  }];
  const byLocation = [{ ...direct[0], address: "6917 Bloomsbury Ln, Spotsylvania, VA 22553" }];
  assert.deepEqual(mergeMobilePartyResults(direct, byLocation), byLocation);
});

test("directory merge is stable, bounded, and reports per-source consumption", () => {
  const customer = {
    id: "customer-one", kind: "customer", name: "Donna", contactName: null,
    email: null, phone: null, address: null, updatedAt: "2026-08-12T14:00:00Z",
  };
  const olderCustomer = { ...customer, id: "customer-two", name: "Ann", updatedAt: "2026-08-10T14:00:00Z" };
  const organization = {
    ...customer, id: "organization-one", kind: "organization", name: "Fox Point HOA",
    updatedAt: "2026-08-11T14:00:00Z",
  };

  const result = mergeMobilePartyDirectoryRows([customer, olderCustomer], [organization], 2);
  assert.deepEqual(result.rows.map((row) => row.id), ["customer-one", "organization-one"]);
  assert.equal(result.consumedCustomers, 1);
  assert.equal(result.consumedOrganizations, 1);
  assert.equal(result.hasMore, true);
  assert.equal(normalizeMobileDirectoryLimit("500"), 50);
  assert.equal(normalizeMobileDirectoryLimit("0"), 1);
});

test("mobile party creation validates contact and service-location semantics", () => {
  const valid = validateMobilePartyCreateInput({
    kind: "organization",
    name: "Fox Point HOA",
    contactName: "Pat Manager",
    email: "PAT@EXAMPLE.COM",
    phone: "540-555-0100",
    organizationType: "hoa",
    serviceLocation: { street: "100 Danford St", city: "Fredericksburg", state: "VA", postalCode: "22401" },
  });
  assert.equal(valid.error, null);
  assert.equal(valid.value.email, "pat@example.com");
  assert.equal(valid.value.serviceLocation.street, "100 Danford St");

  assert.equal(
    validateMobilePartyCreateInput({ kind: "customer", name: "Donna", email: "bad" }).error,
    "Enter a valid email address or leave email blank.",
  );
  assert.equal(
    validateMobilePartyCreateInput({
      kind: "customer", name: "Donna", serviceLocation: { street: "100 Main", city: "" },
    }).error,
    "Street and city are required when adding a service location.",
  );
});

test("mobile party creation stays limited to existing internal staff roles", () => {
  assert.equal(canCreateMobileParties(["owner"]), true);
  assert.equal(canCreateMobileParties(["admin"]), true);
  assert.equal(canCreateMobileParties(["payroll_admin"]), true);
  assert.equal(canCreateMobileParties(["estimator"]), true);
  assert.equal(canCreateMobileParties(["crew"]), false);
  assert.equal(canCreateMobileParties([]), false);
});

test("mobile job views use established operational states and exclude cancelled work", () => {
  assert.deepEqual(mobileJobOperationalStates("upcoming"), ["scheduled"]);
  assert.deepEqual(mobileJobOperationalStates("active"), ["in_progress", "needs_attention"]);
  assert.deepEqual(mobileJobOperationalStates("unscheduled"), ["to_be_scheduled"]);
  assert.deepEqual(mobileJobOperationalStates("completed"), ["work_complete", "invoiced", "paid"]);
  for (const scope of ["upcoming", "active", "unscheduled", "completed"]) {
    assert.equal(mobileJobOperationalStates(scope).includes("cancelled"), false);
    assert.equal(normalizeMobileJobScope(scope), scope);
  }
  assert.equal(normalizeMobileJobScope("cancelled"), null);
  assert.equal(normalizeMobileJobScope(null), null);
});

test("mobile job directory remains caller-scoped through the RLS-aware read model", () => {
  const route = readFileSync(new URL("../../app/api/mobile/jobs/route.ts", import.meta.url), "utf8");
  const data = readFileSync(new URL("../data/mobile-jobs.ts", import.meta.url), "utf8");
  assert.match(route, /getCrewApiContext\(request\)/);
  assert.match(data, /from\("job_operations_search_index"\)/);
  assert.doesNotMatch(route + data, /service[_-]?role/i);
});

test("mobile proposals preserve established statuses and staff role boundaries", () => {
  assert.deepEqual(quoteStatusesForScope("sent"), ["sent", "change_requested"]);
  assert.deepEqual(quoteStatusesForScope("closed"), ["expired", "cancelled"]);
  assert.equal(normalizeMobileQuoteScope("approved"), "approved");
  assert.equal(normalizeMobileQuoteScope("unknown"), null);
  assert.equal(canManageMobileQuotes(["estimator"]), true);
  assert.equal(canManageMobileQuotes(["crew"]), false);
});

test("mobile proposal validation preserves multiline scope and integer cents", () => {
  const result = validateMobileQuoteWriteInput({
    customerId: "customer-one",
    serviceLocationId: "location-one",
    customerMessage: "First paragraph\r\n\r\nSecond <tree> & brush",
    lines: [{ name: "Tree removal", description: "- Remove oak\r\n- Haul brush", quantity: 1.5, unitPriceCents: 125050 }],
  });
  assert.equal(result.error, "");
  assert.equal(result.value.customerMessage, "First paragraph\n\nSecond <tree> & brush");
  assert.equal(result.value.lines[0].description, "- Remove oak\n- Haul brush");
  assert.equal(result.value.lines[0].unitPriceCents, 125050);
  assert.equal(validateMobileQuoteWriteInput({ customerId: "one", organizationId: "two", serviceLocationId: "location", lines: [] }).value, null);
});

test("mobile proposal routes remain bearer-authenticated and do not expose token or email secrets", () => {
  const route = readFileSync(new URL("../../app/api/mobile/quotes/route.ts", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../../app/api/mobile/quotes/[quoteId]/route.ts", import.meta.url), "utf8");
  const data = readFileSync(new URL("../data/mobile-quotes.ts", import.meta.url), "utf8");
  assert.match(route + detail, /getCrewApiContext\(request\)/);
  assert.match(data, /admin_record_search/);
  assert.doesNotMatch(route + detail + data, /SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|token_hash|token_encrypted/);
});

test("mobile invoice scopes preserve delivery and payment lifecycle distinctions", () => {
  assert.deepEqual(invoiceStatusesForScope("outstanding"), ["sent", "partially_paid"]);
  assert.deepEqual(invoiceStatusesForScope("overdue"), ["overdue"]);
  assert.deepEqual(invoiceStatusesForScope("void"), ["void"]);
  assert.equal(normalizeMobileInvoiceScope("paid"), "paid");
  assert.equal(normalizeMobileInvoiceScope("payable"), null);
});

test("invoice visibility and manual-payment authority remain role aware", () => {
  assert.equal(canViewMobileInvoices(["estimator"]), true);
  assert.equal(canViewMobileInvoices(["crew"]), false);
  assert.equal(canRecordMobilePayments(["owner"]), true);
  assert.equal(canRecordMobilePayments(["admin"]), true);
  assert.equal(canRecordMobilePayments(["payroll_admin"]), false);
  assert.equal(canRecordMobilePayments(["estimator"]), false);
});

test("manual payment input uses integer cents and bounded methods", () => {
  const valid = validateMobileManualPayment({ amountCents: 12500, method: "check", receivedAt: "2026-08-13T12:00:00Z", reference: "Check 1042" });
  assert.equal(valid.error, "");
  assert.equal(valid.value.amountCents, 12500);
  assert.equal(validateMobileManualPayment({ amountCents: 12.5, method: "card", receivedAt: "bad" }).value, null);
});

test("mobile invoice routes use caller auth and the audited payment RPC without secrets", () => {
  const list = readFileSync(new URL("../../app/api/mobile/invoices/route.ts", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../../app/api/mobile/invoices/[invoiceId]/route.ts", import.meta.url), "utf8");
  const payment = readFileSync(new URL("../../app/api/mobile/invoices/[invoiceId]/manual-payment/route.ts", import.meta.url), "utf8");
  assert.match(list + detail + payment, /getCrewApiContext\(request\)/);
  assert.match(payment, /record_manual_invoice_payment/);
  assert.doesNotMatch(list + detail + payment, /STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|token_hash|token_encrypted/);
});
