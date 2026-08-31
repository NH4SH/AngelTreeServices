const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const successMessage = "Thank you — your request was received. We’ll contact you shortly.";

function loadScript(filename, names, overrides = {}) {
  const context = vm.createContext({
    document: { addEventListener() {} },
    window: { addEventListener() {} },
    FormData: class {},
    ...overrides,
  });
  const source = fs.readFileSync(path.join(root, filename), "utf8");
  // Expose private helpers only inside the test VM, never in the shipped asset.
  assert.match(source, /\}\)\(\);\s*$/);
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `globalThis.helpers = { ${names.join(", ")} }; })();`), context);
  return context.helpers;
}

for (const body of ["", "null", "true", "42", '"received"', "[]", "<html>Received</html>", "{broken", "{}", '{"message":{}}']) {
  test(`successful lead response is safe for ${JSON.stringify(body)}`, async () => {
    const helpers = loadScript("ats-form-enhancements.js", ["submitLead"], {
      fetch: async () => ({ ok: true, text: async () => body }),
    });
    const result = await helpers.submitLead({ dataset: {} });
    assert.equal(result.ok, true);
    assert.equal(result.message, successMessage);
  });
}

test("successful lead response preserves a server message", async () => {
  const helpers = loadScript("ats-form-enhancements.js", ["submitLead"], {
    fetch: async () => ({ ok: true, text: async () => '{"ok":true,"message":"Request received."}' }),
  });
  assert.equal((await helpers.submitLead({ dataset: {} })).message, "Request received.");
});

for (const [ok, body] of [[false, ""], [false, "null"], [true, '{"ok":false}']]) {
  test(`actual failure is retained: HTTP success=${ok}, body=${JSON.stringify(body)}`, async () => {
    const helpers = loadScript("ats-form-enhancements.js", ["submitLead"], {
      fetch: async () => ({ ok, text: async () => body }),
    });
    await assert.rejects(helpers.submitLead({ dataset: {} }), /We could not send your request/);
  });
}

test("network failure remains a failure", async () => {
  const helpers = loadScript("ats-form-enhancements.js", ["submitLead"], {
    fetch: async () => { throw new Error("offline"); },
  });
  await assert.rejects(helpers.submitLead({ dataset: {} }), /offline/);
});

for (const [filename, init] of [
  ["ats-form-enhancements.js", "initMobileMenu"],
  ["site-pages.js", "closeMobileMenuAfterNavigation"],
]) {
  test(`${filename}: analytics failure is non-blocking`, () => {
    const helpers = loadScript(filename, ["trackEvent"], {
      window: { addEventListener() {}, gtag() { throw new Error("Unavailable analytics"); } },
    });
    assert.doesNotThrow(() => helpers.trackEvent("test", {}));
  });

  test(`${filename}: menu supports Escape, outside click, focus exit, and navigation`, () => {
    const listeners = {};
    let focused = false;
    const menu = {
      open: true,
      contains: target => target.inside,
      querySelector: () => ({ focus() { focused = true; } }),
    };
    const helpers = loadScript(filename, [init], {
      document: {
        querySelector: () => menu,
        addEventListener: (name, callback) => { listeners[name] = callback; },
      },
    });
    helpers[init]();
    listeners.keydown({ key: "Escape" });
    assert.equal(menu.open, false);
    assert.equal(focused, true);
    menu.open = true;
    listeners.click({ target: { inside: true, closest: () => null } });
    assert.equal(menu.open, true, "interacting inside the menu must not close it");
    listeners.click({ target: { inside: false } });
    assert.equal(menu.open, false);
    menu.open = true;
    listeners.focusin({ target: { inside: false } });
    assert.equal(menu.open, false);
    menu.open = true;
    listeners.click({ target: { inside: true, closest: () => ({}) } });
    assert.equal(menu.open, false);
  });
}
