import assert from "node:assert/strict";
import test from "node:test";
import { parseGoogleAddressComponents } from "./google-address.ts";

test("parses a US Places address into CRM fields", () => {
  const address = parseGoogleAddressComponents([
    { longText: "5802", shortText: "5802", types: ["street_number"] },
    { longText: "Ford Road", shortText: "Ford Rd", types: ["route"] },
    { longText: "Fredericksburg", shortText: "Fredericksburg", types: ["locality"] },
    { longText: "Virginia", shortText: "VA", types: ["administrative_area_level_1"] },
    { longText: "22407", shortText: "22407", types: ["postal_code"] },
  ], "5802 Ford Rd, Fredericksburg, VA 22407, USA");

  assert.deepEqual(address, {
    street: "5802 Ford Road",
    city: "Fredericksburg",
    state: "VA",
    postalCode: "22407",
    formattedAddress: "5802 Ford Rd, Fredericksburg, VA 22407, USA",
  });
});

test("omits missing components so existing form values are not blanked", () => {
  assert.deepEqual(parseGoogleAddressComponents([
    { longText: "Virginia", shortText: "VA", types: ["administrative_area_level_1"] },
  ]), { state: "VA" });
});

test("uses postal town when locality is unavailable", () => {
  assert.equal(parseGoogleAddressComponents([
    { longText: "Quantico", types: ["postal_town"] },
  ]).city, "Quantico");
});

