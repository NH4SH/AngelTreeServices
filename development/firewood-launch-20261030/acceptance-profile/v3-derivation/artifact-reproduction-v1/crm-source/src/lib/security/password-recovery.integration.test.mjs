import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const mailpitUrl = process.env.SUPABASE_TEST_MAILPIT_URL;
const enabled = Boolean(url && anonKey && serviceRoleKey && mailpitUrl);

test("local recovery changes only the recovery-link user", { skip: !enabled }, async () => {
  const admin = createClient(url, serviceRoleKey, clientOptions());
  const marker = randomBytes(5).toString("hex");
  const users = ["a", "b", "c"].map((label) => ({
    email: `password-recovery-${label}-${marker}@example.test`,
    initialPassword: randomBytes(24).toString("base64url"),
    nextPassword: randomBytes(24).toString("base64url"),
  }));

  try {
    for (const user of users) {
      const created = await admin.auth.admin.createUser({
        email: user.email,
        password: user.initialPassword,
        email_confirm: true,
      });
      assert.ifError(created.error);
      user.id = created.data.user.id;
    }

    for (const user of users) {
      assert.equal(await canSignIn(user.email, user.initialPassword), true);
    }

    const recoveryRequester = createClient(url, anonKey, {
      auth: { ...clientOptions().auth, flowType: "implicit" },
    });
    const request = await recoveryRequester.auth.resetPasswordForEmail(users[0].email, {
      redirectTo: "http://127.0.0.1:3000/update-password",
    });
    assert.ifError(request.error);

    const recoveryUrl = await readRecoveryUrl(users[0].email);
    const firstUse = await fetch(recoveryUrl, { redirect: "manual" });
    const callback = new URL(firstUse.headers.get("location"));
    const callbackValues = new URLSearchParams(callback.hash.slice(1));
    assert.equal(callbackValues.get("type"), "recovery");

    const sameBrowserClient = createClient(url, anonKey, clientOptions());
    const signedInB = await sameBrowserClient.auth.signInWithPassword({
      email: users[1].email,
      password: users[1].initialPassword,
    });
    assert.ifError(signedInB.error);
    assert.equal(signedInB.data.user.id, users[1].id);

    const recoverySession = await sameBrowserClient.auth.setSession({
      access_token: callbackValues.get("access_token"),
      refresh_token: callbackValues.get("refresh_token"),
    });
    assert.ifError(recoverySession.error);
    assert.equal(recoverySession.data.user.id, users[0].id);

    const changed = await sameBrowserClient.auth.updateUser({ password: users[0].nextPassword });
    assert.ifError(changed.error);
    await sameBrowserClient.auth.signOut({ scope: "global" });

    assert.equal(await canSignIn(users[0].email, users[0].initialPassword), false);
    assert.equal(await canSignIn(users[0].email, users[0].nextPassword), true);
    assert.equal(await canSignIn(users[1].email, users[1].initialPassword), true);
    assert.equal(await canSignIn(users[2].email, users[2].initialPassword), true);
    assert.equal(await canSignIn(users[1].email, users[0].nextPassword), false);
    assert.equal(await canSignIn(users[2].email, users[0].nextPassword), false);

    const reused = await fetch(recoveryUrl, { redirect: "manual" });
    const reusedLocation = reused.headers.get("location") ?? "";
    assert.equal(reusedLocation.includes("error"), true);

    const invalidSession = await createClient(url, anonKey, clientOptions()).auth.setSession({
      access_token: "invalid",
      refresh_token: "invalid",
    });
    assert.ok(invalidSession.error);
  } finally {
    for (const user of users) {
      if (user.id) await admin.auth.admin.deleteUser(user.id);
    }
  }

  async function canSignIn(email, password) {
    const result = await createClient(url, anonKey, clientOptions()).auth.signInWithPassword({ email, password });
    return !result.error;
  }

  async function readRecoveryUrl(email) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const list = await (await fetch(`${mailpitUrl}/api/v1/messages`)).json();
    const message = list.messages.find((candidate) => candidate.To?.some((recipient) => recipient.Address === email));
    assert.ok(message, "local recovery email should be captured");
    const detail = await (await fetch(`${mailpitUrl}/api/v1/message/${message.ID}`)).json();
    const body = String(detail.HTML || detail.Text || "");
    const urls = [...body.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((match) => match[0].replaceAll("&amp;", "&"));
    const recoveryUrl = urls.find((candidate) => candidate.includes("/auth/v1/verify"));
    assert.ok(recoveryUrl, "local recovery email should contain a verification URL");
    return recoveryUrl;
  }
});

function clientOptions() {
  return {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  };
}
