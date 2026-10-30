import assert from "node:assert/strict";
import test from "node:test";
import { getQuoteEmailPortalLinkState } from "./quote-email-link-state.ts";

const now = Date.parse("2026-08-04T16:00:00.000Z");

function token(overrides = {}) {
  return {
    expires_at: "2026-09-04T16:00:00.000Z",
    portalUrl: null,
    revoked_at: null,
    ...overrides,
  };
}

test("an active recoverable link remains the preferred resend link", () => {
  const tokens = [token({ portalUrl: "https://admin.example.test/portal/quote/current-token" })];

  assert.equal(getQuoteEmailPortalLinkState(tokens, now), "recoverable");
  assert.equal(getQuoteEmailPortalLinkState(tokens, now), "recoverable");
});

test("an active legacy link requires an explicit replacement", () => {
  assert.equal(getQuoteEmailPortalLinkState([token()], now), "legacy_unrecoverable");
});

test("a newly recoverable replacement clears the legacy resend block", () => {
  const before = [token()];
  const after = [
    token({ revoked_at: "2026-08-04T16:01:00.000Z" }),
    token({ portalUrl: "https://admin.example.test/portal/quote/replacement-token" }),
  ];

  assert.equal(getQuoteEmailPortalLinkState(before, now), "legacy_unrecoverable");
  assert.equal(getQuoteEmailPortalLinkState(after, now), "recoverable");
});

test("revoked and expired links do not block normal link creation", () => {
  assert.equal(getQuoteEmailPortalLinkState([
    token({ revoked_at: "2026-08-03T16:00:00.000Z" }),
    token({ expires_at: "2026-08-03T16:00:00.000Z" }),
  ], now), "none");
  assert.equal(getQuoteEmailPortalLinkState([], now), "none");
});

test("a recoverable active link wins when older legacy rows also exist", () => {
  assert.equal(getQuoteEmailPortalLinkState([
    token(),
    token({ portalUrl: "https://admin.example.test/portal/quote/current-token" }),
  ], now), "recoverable");
});
