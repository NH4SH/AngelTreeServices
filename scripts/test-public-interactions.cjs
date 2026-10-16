const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const successMessage = "Thank you — your request was received. We’ll contact you shortly.";

function response(ok, body, status = 201, contentType = "application/json") {
  return { ok, status, headers: { get: () => contentType }, text: async () => body };
}

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
  test(`ambiguous lead response is rejected for ${JSON.stringify(body)}`, async () => {
    const helpers = loadScript("ats-form-enhancements.js", ["submitLead"], {
      fetch: async () => response(true, body),
    });
    await assert.rejects(helpers.submitLead({ dataset: {} }), /We could not send your request/);
  });
}

test("successful lead response preserves a server message", async () => {
  const helpers = loadScript("ats-form-enhancements.js", ["submitLead"], {
    fetch: async () => response(true, '{"ok":true,"message":"Request received."}'),
  });
  assert.equal((await helpers.submitLead({ dataset: {} })).message, "Request received.");
});

for (const [ok, body] of [[false, ""], [false, "null"], [true, '{"ok":false}']]) {
  test(`actual failure is retained: HTTP success=${ok}, body=${JSON.stringify(body)}`, async () => {
    const helpers = loadScript("ats-form-enhancements.js", ["submitLead"], {
      fetch: async () => response(ok, body),
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

for (const status of [200, 201, 202]) {
  test(`explicit JSON acknowledgment ${status} remains successful without implying a unique lead`, async () => {
    const helpers = loadScript("ats-form-enhancements.js", ["submitLead"], {
      fetch: async () => response(true, '{"ok":true}', status),
    });
    const result = await helpers.submitLead({ dataset: {} });
    assert.equal(result.ok, true);
    assert.equal(result.newlyRecorded, status === 201);
    assert.equal(result.message, successMessage);
  });
}
for (const [status, contentType] of [[204, "application/json"], [203, "application/json"], [201, "text/html"], [201, ""]]) {
  test(`unexpected acknowledgment ${status}/${contentType} fails closed`, async () => {
    const helpers = loadScript("ats-form-enhancements.js", ["submitLead"], {
      fetch: async () => response(true, '{"ok":true}', status, contentType),
    });
    await assert.rejects(helpers.submitLead({ dataset: {} }));
  });
}
test("optional measurement throwing cannot block a request", () => {
  const helpers = loadScript("ats-form-enhancements.js", ["trackEvent"], {
    window: { addEventListener() {}, ATSWebsite: { track() { throw new Error("blocked"); } } },
  });
  assert.doesNotThrow(() => helpers.trackEvent("estimate_form_started", {}));
});

function formHarness() {
  const events = [], requests = [], fields = new Map(), listeners = {};
  const status = { classList: { toggle() {} }, focus() {} };
  const button = { dataset: {}, textContent: "Send", querySelector() { return null; }, setAttribute() {} };
  let resetCount = 0, sequence = 0;
  const form = {
    dataset: { leadIntakeUrl: "https://local.test/api/leads" },
    classList: { toggle() {} },
    querySelector(selector) {
      if (selector === 'button[type="submit"]') return button;
      if (selector === ".ats-form-server-status") return status;
      const match = selector.match(/^input\[name="([^"]+)"\]$/);
      return match ? fields.get(match[1]) || null : null;
    },
    querySelectorAll() { return []; },
    appendChild(field) { fields.set(field.name, field); },
    addEventListener(name, fn) { listeners[name] = fn; },
    reset() { resetCount++; },
  };
  const fakeFetch = (url, options) => {
    assert.equal(url, "https://local.test/api/leads", "production endpoints are forbidden");
    assert.equal(options.credentials, "omit");
    return new Promise((resolve, reject) => requests.push({ resolve, reject, submissionId: form.dataset.submissionId }));
  };
  const helpers = loadScript("ats-form-enhancements.js", ["initForm"], {
    fetch: fakeFetch,
    window: { fetch: fakeFetch, FormData: class {}, addEventListener() {},
      location: { search: "", href: "https://local.test/" },
      crypto: { randomUUID: () => `local-${++sequence}` },
      ATSWebsite: { track: (...args) => events.push(args), getAttribution: () => ({ utm_source: "mock" }) },
    },
    document: { referrer: "", addEventListener() {}, createElement: () => ({}), body: { classList: { remove() {}, add() {} } } },
  });
  helpers.initForm(form);
  return { form, listeners, events, requests, status, resets: () => resetCount,
    submit: () => listeners.submit({ preventDefault() {} }),
    settle: () => new Promise(resolve => setImmediate(resolve)),
  };
}

for (const status of [200, 201, 202]) {
  test(`submit handler ${status}: acknowledgment, reset, and diagnostic event without conversion`, async () => {
    const h = formHarness();
    h.submit(); h.submit();
    assert.equal(h.requests.length, 1, "double submit suppressed");
    h.requests[0].resolve(response(true, '{"ok":true}', status));
    await h.settle();
    assert.equal(h.resets(), 1);
    assert.equal(h.form.dataset.submitting, "false");
    assert.equal(h.events.filter(x => x[0] === "estimate_request_acknowledged").length, status === 201 ? 1 : 0);
    assert.equal(h.events.filter(x => /generate_lead|estimate_form_submitted/.test(x[0])).length, 0);
    assert.notEqual(h.form.dataset.submissionId, h.requests[0].submissionId);
  });
}

test("lost acknowledgment retains submission ID and fields; replay retry emits no conversion", async () => {
  const h = formHarness(); h.submit();
  h.requests[0].reject(Error("offline")); await h.settle();
  assert.equal(h.resets(), 0);
  assert.equal(h.form.dataset.submitting, "false");
  h.submit();
  assert.equal(h.requests[1].submissionId, h.requests[0].submissionId);
  h.requests[1].resolve(response(true, '{"ok":true}', 200)); await h.settle();
  assert.equal(h.resets(), 1);
  assert.equal(h.events.filter(x => x[0] === "estimate_request_acknowledged").length, 0);
});

test("malformed 2xx does not clear fields or rotate submission ID", async () => {
  const h = formHarness(); h.submit();
  h.requests[0].resolve(response(true, "<html>proxy</html>")); await h.settle();
  assert.equal(h.resets(), 0);
  assert.equal(h.form.dataset.submissionId, h.requests[0].submissionId);
  assert.equal(h.events.filter(x => x[0] === "estimate_request_acknowledged").length, 0);
});

for (const httpStatus of [400, 403, 413, 429, 500, 503]) {
  test(`HTTP ${httpStatus} keeps form and submission ID for retry`, async () => {
    const h = formHarness(); h.submit();
    h.requests[0].resolve(response(false, '{"ok":false,"message":"Please retry."}', httpStatus));
    await h.settle();
    assert.equal(h.resets(), 0);
    assert.equal(h.form.dataset.submissionId, h.requests[0].submissionId);
    assert.equal(h.events.filter(x => x[0] === "estimate_request_acknowledged").length, 0);
  });
}

test("invalid field prevents request and measurement", () => {
  const h = formHarness();
  const field = { required: true, value: "", name: "name", type: "text", closest: () => null, focus() {} };
  h.form.querySelectorAll = selector => selector === "input, select, textarea" ? [field] : [];
  h.submit();
  assert.equal(h.requests.length, 0);
  assert.equal(h.events.length, 0);
});

test("form start is emitted once per document even if callback repeats", () => {
  const h = formHarness();
  h.listeners.input(); h.listeners.input();
  assert.equal(h.events.filter(x => x[0] === "estimate_form_started").length, 1);
});

function emailPreferenceHarness(preference = "email", value = "", describedBy = "email-hint") {
  let error = null, focused = false;
  const attributes = { "aria-invalid": "false" };
  if (describedBy !== null) attributes["aria-describedby"] = describedBy;
  const windowListeners = {};
  const indicator = { textContent: "(optional)" };
  const summary = { hidden: true };
  const choice = { value: preference };
  const container = {
    querySelector: () => error,
    appendChild: element => { error = element; },
  };
  const email = {
    id: "email-field", name: "email", type: "email", value, required: false, dataset: {},
    closest: selector => selector === ".form-item" ? container : null,
    getAttribute: name => attributes[name] || null,
    setAttribute: (name, text) => { attributes[name] = text; },
    removeAttribute: name => { delete attributes[name]; },
    focus: () => { focused = true; },
  };
  const form = {
    querySelector: selector => ({
      'input[name="email"]': email,
      'input[name="preferred_contact_method"]:checked': choice,
      "[data-email-requirement]": indicator,
      ".ats-form-error-summary": summary,
      '[aria-invalid="true"]': attributes["aria-invalid"] === "true" ? email : null,
    })[selector] || null,
    querySelectorAll: selector => selector === "input, select, textarea" ? [email] : [],
  };
  const helpers = loadScript("ats-form-enhancements.js", ["syncEmailRequirement", "validateForm"], {
    window: { addEventListener: (name, callback) => { windowListeners[name] = callback; } },
    document: {
      addEventListener() {},
      querySelectorAll: () => [form],
      querySelector: () => ({ textContent: "Email " + indicator.textContent }),
      createElement: () => ({ setAttribute() {}, remove() { error = null; } }),
    },
  });
  return { email, choice, indicator, summary, attributes, helpers,
    sync: () => helpers.syncEmailRequirement(form),
    validate: () => helpers.validateForm(form),
    pageShow: () => windowListeners.pageshow({ persisted: true }),
    error: () => error, focused: () => focused,
  };
}

test("choosing Email marks it required without prematurely showing an error", () => {
  const h = emailPreferenceHarness();
  h.sync();
  assert.equal(h.email.required, true);
  assert.equal(h.attributes["aria-required"], "true");
  assert.equal(h.indicator.textContent, "(required)");
  assert.equal(h.error(), null);
  assert.equal(h.focused(), false);
});

test("Email preference with a blank address blocks validation, focuses and describes the error", () => {
  const h = emailPreferenceHarness();
  // Submission must also reconcile a restored/programmatically selected preference.
  assert.equal(h.validate(), false);
  assert.equal(h.focused(), true);
  assert.equal(h.summary.hidden, false);
  assert.equal(h.attributes["aria-invalid"], "true");
  assert.equal(h.attributes["aria-describedby"], "email-hint email-field-error");
  assert.match(h.error().textContent, /contact you by email/);
});

test("Email preference rejects malformed addresses without suggesting they can be omitted", () => {
  const h = emailPreferenceHarness("email", "invalid-address");
  assert.equal(h.validate(), false);
  assert.equal(h.error().textContent, "Please enter a valid email address.");
});

test("Email preference accepts a valid address and keeps the draft intact", () => {
  const h = emailPreferenceHarness("email", "fixture@example.test");
  assert.equal(h.validate(), true);
  assert.equal(h.email.value, "fixture@example.test");
  assert.equal(h.error(), null);
});

for (const preference of ["", "phone", "text"]) {
  test(`${preference || "No preference"} can omit email and clears a previous required error`, () => {
    const h = emailPreferenceHarness();
    assert.equal(h.validate(), false);
    h.choice.value = preference;
    h.sync();
    assert.equal(h.email.required, false);
    assert.equal(h.attributes["aria-required"], "false");
    assert.equal(h.indicator.textContent, "(optional)");
    assert.equal(h.error(), null);
    assert.equal(h.attributes["aria-describedby"], "email-hint");
    assert.equal(h.summary.hidden, true);
    assert.equal(h.validate(), true);
    h.email.value = "fixture@example.test";
    h.sync();
    assert.equal(h.email.value, "fixture@example.test", "changing preference must not erase the draft");
  });
}

test("optional email still rejects a nonempty malformed address", () => {
  const h = emailPreferenceHarness("phone", "invalid-address");
  assert.equal(h.validate(), false);
  assert.match(h.error().textContent, /or leave this field blank/);
});

for (const correction of ["valid email", "phone preference"]) {
  test(`originally absent description is restored after repeated errors and ${correction}`, () => {
    const h = emailPreferenceHarness("email", "", null);
    assert.equal(h.validate(), false);
    assert.equal(h.validate(), false);
    if (correction === "valid email") {
      h.email.value = "fixture@example.test";
      assert.equal(h.validate(), true);
    } else {
      h.choice.value = "phone";
      h.sync();
    }
    assert.equal(h.error(), null);
    assert.equal(h.attributes["aria-invalid"], "false");
    assert.equal(h.attributes["aria-describedby"], undefined, "removed errors must not remain referenced");
  });
}

test("pageshow resynchronizes a restored contact preference and label", () => {
  const h = emailPreferenceHarness("phone");
  h.sync();
  h.choice.value = "email"; // Browser form-state restoration does not fire change.
  h.pageShow();
  assert.equal(h.email.required, true);
  assert.equal(h.attributes["aria-required"], "true");
  assert.equal(h.indicator.textContent, "(required)");
  assert.equal(h.error(), null);
});

for (const [name, shared] of [
  ["missing", undefined],
  ["incomplete", {}],
  ["throwing", { getAttribution() { throw new Error("unavailable"); } }],
]) {
  test(`initializer unavailable (${name}): operational form metadata keeps bounded URL attribution`, () => {
    const fields = new Map();
    const form = {
      dataset: { submissionId: "local-review", formStartedAt: "1000" },
      querySelector: selector => fields.get(selector.match(/name="([^"]+)"/)[1]) || null,
      appendChild: field => fields.set(field.name, field),
    };
    const search = "?utm_source=google&utm_medium=cpc&utm_campaign=" + "x".repeat(121) + "&utm_content=private%40example.test&gclid=not-collected";
    const h = loadScript("ats-form-enhancements.js", ["setSubmissionMetadata"], {
      URLSearchParams,
      window: { addEventListener() {}, ATSWebsite: shared, location: { href: "https://local.test/" + search, search } },
      document: { addEventListener() {}, createElement: () => ({}), referrer: "" },
    });
    h.setSubmissionMetadata(form, false);
    assert.equal(fields.get("utm_source").value, "google");
    assert.equal(fields.get("utm_medium").value, "cpc");
    assert.equal(fields.get("utm_campaign").value, "");
    assert.equal(fields.get("utm_content").value, "");
    assert.equal(fields.has("gclid"), false);
    assert.equal(form.dataset.submissionId, "local-review");
  });
}
