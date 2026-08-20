import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repoRoot = new URL("../../../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, repoRoot), "utf8");
}

test("customer email composers expose an optional CC field", async () => {
  const singleComposer = await source("apps/platform/src/components/send-email-action-form.tsx");
  const multiComposer = await source("apps/platform/src/components/multi-quote-email-composer.tsx");

  assert.match(singleComposer, /name="email_cc"/);
  assert.match(singleComposer, /CC recipients receive the same customer email and secure link/);
  assert.match(multiComposer, /name="email_cc"/);
  assert.match(multiComposer, /CC recipients receive the same customer email and secure proposal links/);
});

test("transactional email actions validate and forward CC recipients", async () => {
  const actions = await source("apps/platform/src/lib/actions/transactional-email.ts");
  const sender = await source("apps/platform/src/lib/email/send.ts");

  assert.match(actions, /readCcRecipients\(formData, validation\.recipient\)/);
  assert.match(actions, /readCcRecipients\(formData, recipient\)/);
  assert.match(actions, /cc:\s*cc\.recipients/);
  assert.match(sender, /cc\?: string\[\]/);
  assert.match(sender, /\.\.\.\(ccRecipients\.length \? \{ cc: ccRecipients \} : \{\}\)/);
});
