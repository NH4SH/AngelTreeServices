import assert from "node:assert/strict";
import test from "node:test";
import { chooseLocation, chooseOrganizationContact } from "./party-estimate.ts";

test("organization defaults to its sole primary contact", () => {
  const contacts = [
    { id: "billing", contact_roles: ["billing"], is_active: true },
    { id: "primary", contact_roles: ["primary"], is_active: true },
  ];
  assert.equal(chooseOrganizationContact(contacts)?.id, "primary");
});

test("organization does not guess when multiple contacts have no primary", () => {
  const contacts = [
    { id: "one", contact_roles: ["billing"], is_active: true },
    { id: "two", contact_roles: ["onsite"], is_active: true },
  ];
  assert.equal(chooseOrganizationContact(contacts), null);
});

test("a sole property defaults while multiple properties remain explicit", () => {
  assert.equal(chooseLocation([{ id: "only" }])?.id, "only");
  assert.equal(chooseLocation([{ id: "one" }, { id: "two" }]), null);
});
