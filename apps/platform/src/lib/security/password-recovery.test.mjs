import assert from "node:assert/strict";
import test from "node:test";
import {
  grantPasswordRecovery,
  recoveryGrantMatchesUser,
} from "./password-recovery.ts";

const userA = { id: "00000000-0000-4000-8000-00000000000a" };
const userB = { id: "00000000-0000-4000-8000-00000000000b" };

function sessionFor(user) {
  return { user };
}

test("only PASSWORD_RECOVERY establishes a password recovery grant", () => {
  assert.equal(grantPasswordRecovery("INITIAL_SESSION", sessionFor(userB)), null);
  assert.equal(grantPasswordRecovery("SIGNED_IN", sessionFor(userB)), null);
  assert.equal(grantPasswordRecovery("TOKEN_REFRESHED", sessionFor(userB)), null);
  assert.deepEqual(grantPasswordRecovery("PASSWORD_RECOVERY", sessionFor(userA)), { userId: userA.id });
});

test("a recovery event without an authenticated user is rejected", () => {
  assert.equal(grantPasswordRecovery("PASSWORD_RECOVERY", null), null);
  assert.equal(grantPasswordRecovery("PASSWORD_RECOVERY", { user: { id: "" } }), null);
});

test("the active auth user must match the recovery-link user", () => {
  const grant = grantPasswordRecovery("PASSWORD_RECOVERY", sessionFor(userA));
  assert.equal(recoveryGrantMatchesUser(grant, userA), true);
  assert.equal(recoveryGrantMatchesUser(grant, userB), false);
  assert.equal(recoveryGrantMatchesUser(grant, null), false);
});

test("a caller-supplied target cannot establish or redirect a recovery grant", () => {
  const untrustedTarget = userB.id;
  const grant = grantPasswordRecovery("PASSWORD_RECOVERY", sessionFor(userA));
  assert.equal(grant?.userId, userA.id);
  assert.notEqual(grant?.userId, untrustedTarget);
});
