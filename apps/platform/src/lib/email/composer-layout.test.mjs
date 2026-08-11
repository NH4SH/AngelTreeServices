import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repoRoot = new URL("../../../../../", import.meta.url);

test("the shared document email composer responds to its container width", async () => {
  const css = await readFile(new URL("apps/platform/src/styles/globals.css", repoRoot), "utf8");

  assert.match(css, /container-name:\s*email-composer/);
  assert.match(css, /@container email-composer \(max-width: 900px\)/);
  assert.match(css, /\.customer-email-composer-form\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /@container email-composer \(max-width: 620px\)/);
});

test("an opened invoice composer receives the full delivery-grid width", async () => {
  const css = await readFile(new URL("apps/platform/src/styles/globals.css", repoRoot), "utf8");

  assert.match(css, /\.invoice-delivery-grid:has\(\.customer-email-composer\)\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /\.invoice-delivery-grid\s*>\s*\*[\s\S]*?min-width:\s*0/);
});
