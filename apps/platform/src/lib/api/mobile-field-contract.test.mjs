import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanMobileSearchTerm,
  formatAddress,
  mergeMobilePartyResults,
  toMobileServiceLocation,
} from "./mobile-field-contract.ts";

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
