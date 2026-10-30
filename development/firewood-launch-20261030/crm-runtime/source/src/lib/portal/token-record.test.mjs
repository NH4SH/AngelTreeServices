import assert from "node:assert/strict";
import test from "node:test";
import { getEncryptedPortalToken } from "./token-record.ts";

const baseRecord = {
  created: false,
  expires_at: "2026-09-04T16:00:00.000Z",
  id: "20000000-0000-4000-8000-000000000001",
};

test("reads the token_encrypted field returned by current Supabase RPCs", () => {
  assert.equal(getEncryptedPortalToken({ ...baseRecord, token_encrypted: "current-ciphertext" }), "current-ciphertext");
});

test("accepts the older encrypted_token response alias when present", () => {
  assert.equal(getEncryptedPortalToken({ ...baseRecord, encrypted_token: "aliased-ciphertext" }), "aliased-ciphertext");
});

test("prefers the current RPC field and treats missing ciphertext as legacy", () => {
  assert.equal(getEncryptedPortalToken({
    ...baseRecord,
    encrypted_token: "aliased-ciphertext",
    token_encrypted: "current-ciphertext",
  }), "current-ciphertext");
  assert.equal(getEncryptedPortalToken(baseRecord), null);
});
