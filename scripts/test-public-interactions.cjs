const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const successMessage = "Thank you — your request was received. We’ll contact you shortly.";

const contextCases = [
  ["tree-removal", "Tree Care", "Tree removal"],
  ["tree-pruning", "Tree Care", "Tree pruning"],
  ["stump-grinding", "Tree Care", "Stump grinding"],
  ["emergency-tree-service", "Storm Cleanup", "Storm / emergency tree service"],
  ["commercial-hoa-tree-care", "Multiple Services / Not Sure Yet", "Commercial / HOA tree care"],
];

function contextHarness(search) {
  const service = { value: "", options: ["", "Tree Care", "Storm Cleanup", "Landscaping", "Multiple Services / Not Sure Yet"].map(value => ({ value })) };
  const customer = { value: "Commercial / Property Management", checked: false };
  const picker = { value: "", disabled: true, options: ["", ...contextCases.map(x => x[0])].map(value => ({ value })) };
  const panel = { hidden: true };
  const details = { value: "  My words stay intact.\n🌳 & <tags> are customer text.  ", getAttribute: () => "false" };
  const guidance = { textContent: "" };
  const form = {
    dataset: { leadIntakeUrl: "https://local.test/__mock" },
    querySelector: s => ({ 'select[name="service"]': service, '[data-estimate-intent]': picker, '[data-estimate-context]': panel,
      'textarea[name="message"]': details, '[data-estimate-guidance]': guidance,
      'input[name="customer_type"]:checked': customer.checked ? customer : { value: "Homeowner" } })[s] || null,
    querySelectorAll: s => s === 'input[name="customer_type"]' ? [customer] : [],
  };
  const requests = [];
  const helpers = loadScript("ats-form-enhancements.js", ["applyEstimatePrefill", "applyEstimateService", "syncEstimateContext", "clearEstimateContext", "getMessagePrefix", "submitLead"], {
    URLSearchParams,
    window: { addEventListener() {}, location: { search } },
    FormData: class {
      constructor() { this.fields = new Map([["message", details.value], ["service", service.value]]); }
      set(k, v) { this.fields.set(k, v); }
    },
    fetch: async (url, options) => { assert.equal(url, "https://local.test/__mock"); requests.push(options.body.fields); return response(true, '{"ok":true}'); },
  });
  helpers.applyEstimatePrefill(form);
  return { helpers, form, service, customer, picker, panel, details, guidance, requests };
}

test("service-specific guidance follows category and valid intent without editing customer details", () => {
  const cases = [
    ["", "", /short note/, /trees and garden beds/],
    ["Landscaping", "", /bushes or beds/, /weed and edge/],
    ["Tree Care", "", /nearby buildings/, /dead branches/],
    ["Tree Care", "tree-removal", /assessed for removal/, /remove a large tree/],
    ["Tree Care", "tree-pruning", /clearance or deadwood/, /branches over our driveway/],
    ["Tree Care", "stump-grinding", /size if known/, /one stump about 2 feet/],
    ["Storm Cleanup", "emergency-tree-service", /safe place/, /fallen limb/],
    ["Multiple Services / Not Sure Yet", "commercial-hoa-tree-care", /properties/, /HOA entrance/],
    ["Multiple Services / Not Sure Yet", "", /short note/, /trees and garden beds/],
  ];
  for (const [service, intent, help, example] of cases) {
    const h = contextHarness("?" + new URLSearchParams({ service, estimate_context: intent, customer_type: "Commercial / Property Management" }));
    assert.match(h.guidance.textContent, help);
    assert.match(h.details.placeholder, example);
    assert.equal(h.details.value, "  My words stay intact.\n🌳 & <tags> are customer text.  ");
  }
});

test("guidance follows in-page estimate links, restored choices and clear/reset without changing the request identity", () => {
  const h = contextHarness("?service=Tree%20Care&estimate_context=stump-grinding");
  const text = h.details.value;
  h.form.dataset.submissionId = "same-local-request";
  h.helpers.applyEstimateService(h.form, "Landscaping");
  assert.match(h.details.placeholder, /fresh mulch/);
  h.helpers.applyEstimateService(h.form, "Tree Care", "tree-removal");
  assert.match(h.guidance.textContent, /assessed for removal/);
  h.picker.value = "tree-pruning";
  h.helpers.syncEstimateContext(h.form);
  assert.match(h.guidance.textContent, /clearance or deadwood/);
  h.service.value = "Landscaping";
  h.helpers.syncEstimateContext(h.form);
  assert.match(h.details.placeholder, /fresh mulch/);
  h.service.value = "";
  h.helpers.clearEstimateContext(h.form);
  assert.match(h.details.placeholder, /trees and garden beds/);
  assert.equal(h.details.value, text);
  assert.equal(h.form.dataset.submissionId, "same-local-request");
});

test("unknown and incompatible URL intent cannot inject guidance or an example into the outgoing message", async () => {
  for (const intent of ["tree-removal", "__proto__", "constructor", "<img onerror=alert(1)>"]) {
    const h = contextHarness("?" + new URLSearchParams({ service: "Landscaping", estimate_context: intent }));
    assert.match(h.guidance.textContent, /bushes or beds/);
    assert.match(h.details.placeholder, /fresh mulch/);
    await h.helpers.submitLead(h.form);
    assert.equal(h.requests[0].get("message"), h.details.value);
    assert.equal(h.requests[0].get("service"), "Landscaping");
  }
  const h = contextHarness("?service=constructor&estimate_context=__proto__");
  assert.match(h.guidance.textContent, /short note/);
});

for (const [slug, category, label] of contextCases) {
  test(`${slug}: allowlisted context preserves the broad contract and customer draft on repeated payloads`, async () => {
    const query = new URLSearchParams({ service: category, estimate_context: slug, customer_type: "Commercial / Property Management" });
    const h = contextHarness("?" + query), draft = h.details.value;
    assert.equal(h.service.value, category);
    assert.equal(h.picker.value, slug);
    assert.equal(h.panel.hidden, false);
    assert.equal(h.picker.disabled, false);
    await h.helpers.submitLead(h.form); await h.helpers.submitLead(h.form);
    for (const payload of h.requests) {
      assert.equal(payload.get("message"), `Service requested: ${label}\n\n${draft}`);
      assert.equal(payload.get("service"), category);
      assert.equal(payload.has("estimate_context"), false, "no new API field");
    }
    assert.equal(h.details.value, draft);
  });
}

for (const input of ["unknown", "__proto__", "constructor", "<img onerror=alert(1)>", "tree-removal&private=value", "x".repeat(2000)]) {
  test(`unrecognized context is not reflected (${input.slice(0, 28)})`, async () => {
    const h = contextHarness("?" + new URLSearchParams({ service: "Tree Care", estimate_context: input }));
    assert.equal(h.panel.hidden, true); assert.equal(h.picker.disabled, true);
    await h.helpers.submitLead(h.form);
    assert.equal(h.requests[0].get("message"), h.details.value);
  });
}

test("incompatible category and commercial request type do not attach context", () => {
  for (const search of ["?service=Landscaping&estimate_context=tree-removal", "?service=Multiple%20Services%20%2F%20Not%20Sure%20Yet&estimate_context=commercial-hoa-tree-care"]) {
    const h = contextHarness(search); assert.equal(h.panel.hidden, true); assert.equal(h.helpers.getMessagePrefix(h.form), "");
  }
});

test("changing, clearing, category switching and reset do not edit details or resurrect stale context", async () => {
  const h = contextHarness("?service=Tree%20Care&estimate_context=tree-removal"), draft = h.details.value;
  h.picker.value = "tree-pruning"; h.helpers.syncEstimateContext(h.form); await h.helpers.submitLead(h.form);
  assert.equal(h.requests[0].get("message"), "Service requested: Tree pruning\n\n" + draft);
  h.picker.value = ""; h.helpers.syncEstimateContext(h.form); await h.helpers.submitLead(h.form);
  assert.equal(h.requests[1].get("message"), draft);
  h.picker.value = "tree-removal"; h.service.value = "Landscaping"; h.helpers.syncEstimateContext(h.form);
  assert.equal(h.picker.value, ""); assert.equal(h.panel.hidden, true);
  h.service.value = "Tree Care"; h.helpers.syncEstimateContext(h.form); assert.equal(h.picker.value, "");
  h.picker.value = "tree-removal"; h.helpers.clearEstimateContext(h.form);
  assert.equal(h.panel.hidden, true); assert.equal(h.picker.value, ""); assert.equal(h.details.value, draft);
});

for (const [slug, service] of [["", ""], ...contextCases]) {
  test(`landscaping action replaces ${slug || "generic entry"} without changing customer details or submission identity`, async () => {
    const h = contextHarness("?" + new URLSearchParams({ service, estimate_context: slug, customer_type: "Commercial / Property Management" }));
    h.form.dataset.submissionId = "same-local-request";
    const draft = h.details.value, customer = h.customer.checked;
    assert.equal(h.helpers.applyEstimateService(h.form, "Landscaping"), true);
    assert.equal(h.service.value, "Landscaping");
    assert.equal(h.picker.value, ""); assert.equal(h.panel.hidden, true); assert.equal(h.picker.disabled, true);
    assert.equal(h.details.value, draft); assert.equal(h.customer.checked, customer);
    assert.equal(h.form.dataset.submissionId, "same-local-request");
    await h.helpers.submitLead(h.form);
    assert.equal(h.requests[0].get("service"), "Landscaping");
    assert.equal(h.requests[0].get("message"), draft);
  });
}

test("retired lawn-care links cannot select a service or attach tree context", () => {
  const h = contextHarness("?service=Lawn%20Care&estimate_context=tree-removal");
  assert.equal(h.service.value, ""); assert.equal(h.picker.value, ""); assert.equal(h.panel.hidden, true);
  assert.equal(h.helpers.applyEstimateService(h.form, "Lawn Care"), false);
});

test("landscaping action leaves an in-flight request unchanged", () => {
  const h = contextHarness("?service=Tree%20Care&estimate_context=tree-pruning"), draft = h.details.value;
  h.form.dataset.submitting = "true";
  assert.equal(h.helpers.applyEstimateService(h.form, "Landscaping"), false);
  assert.equal(h.service.value, "Tree Care"); assert.equal(h.picker.value, "tree-pruning"); assert.equal(h.details.value, draft);
});

test("homepage tree-removal action preserves customer draft and request identity on repeated payloads", async () => {
  const h = contextHarness("?service=Landscaping"), draft = h.details.value;
  h.form.dataset.submissionId = "same-local-request";
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(h.helpers.applyEstimateService(h.form, "Tree Care", "tree-removal"), true);
    assert.equal(h.service.value, "Tree Care"); assert.equal(h.picker.value, "tree-removal");
    assert.equal(h.panel.hidden, false); assert.equal(h.picker.disabled, false);
    assert.equal(h.details.value, draft); assert.equal(h.form.dataset.submissionId, "same-local-request");
    await h.helpers.submitLead(h.form);
    assert.equal(h.requests[attempt].get("message"), "Service requested: Tree removal\n\n" + draft);
    assert.equal(h.requests[attempt].get("service"), "Tree Care");
    assert.equal(h.requests[attempt].has("estimate_context"), false, "no new intake field");
  }
});

test("homepage context action rejects mismatched or unknown intent without changing the draft", () => {
  const h = contextHarness("?service=Tree%20Care&estimate_context=tree-pruning"), draft = h.details.value;
  for (const [service, intent] of [["Landscaping", "tree-removal"], ["Tree Care", "__proto__"], ["Tree Care", "unknown"], ["Lawn Care", "tree-removal"]]) {
    assert.equal(h.helpers.applyEstimateService(h.form, service, intent), false);
  }
  h.form.dataset.submitting = "true";
  assert.equal(h.helpers.applyEstimateService(h.form, "Tree Care", "tree-removal"), false);
  assert.equal(h.service.value, "Tree Care"); assert.equal(h.picker.value, "tree-pruning"); assert.equal(h.details.value, draft);
});

function homepageEstimateLinkHarness() {
  const h = contextHarness("?service=Landscaping"), handlers = {};
  const link = { dataset: { estimateService: "Tree Care", estimateContext: "tree-removal" }, addEventListener(type, fn) { handlers[type] = fn; } };
  let nextUrl = "", focuses = 0;
  h.service.closest = () => null; h.service.focus = () => focuses++;
  const helpers = loadScript("ats-form-enhancements.js", ["initEstimateServiceLinks"], {
    URL,
    document: { addEventListener() {}, querySelectorAll: () => [link], body: { classList: { remove() {} } } },
    window: { addEventListener() {}, location: { href: "https://local.test/?utm_source=local-review&contact=success" },
      history: { state: { retained: true }, replaceState(state, title, href) { assert.equal(state.retained, true); nextUrl = href; } } },
  });
  helpers.initEstimateServiceLinks(h.form);
  return { ...h, click: handlers.click, nextUrl: () => nextUrl, focuses: () => focuses };
}

test("homepage estimate link changes context in place, retains attribution and focuses the form", () => {
  const h = homepageEstimateLinkHarness(), draft = h.details.value;
  let prevented = false;
  h.click({ button: 0, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.focuses(), 1);
  assert.equal(h.details.value, draft); assert.equal(h.service.value, "Tree Care"); assert.equal(h.picker.value, "tree-removal");
  const destination = new URL(h.nextUrl(), "https://local.test");
  assert.equal(destination.searchParams.get("utm_source"), "local-review");
  assert.equal(destination.searchParams.get("service"), "Tree Care");
  assert.equal(destination.searchParams.get("estimate_context"), "tree-removal");
  assert.equal(destination.searchParams.has("contact"), false); assert.equal(destination.hash, "#contact");
});

for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
  test(`modified homepage estimate activation keeps the normal URL fallback (${JSON.stringify(modifiers)})`, () => {
    const h = homepageEstimateLinkHarness();
    h.click({ button: 0, ...modifiers, preventDefault() { assert.fail("modified activation must keep browser navigation"); } });
    assert.equal(h.service.value, "Landscaping"); assert.equal(h.nextUrl(), ""); assert.equal(h.focuses(), 0);
  });
}

test("homepage estimate link blocks navigation during a pending request", () => {
  const h = homepageEstimateLinkHarness(), draft = h.details.value;
  h.form.dataset.submitting = "true"; let prevented = false;
  h.click({ button: 0, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.service.value, "Landscaping"); assert.equal(h.details.value, draft);
  assert.equal(h.nextUrl(), ""); assert.equal(h.focuses(), 0);
});

test("unavailable or unsupported landscaping actions leave existing selections intact", () => {
  const h = contextHarness("?service=Tree%20Care&estimate_context=tree-removal");
  for (const value of ["unknown", "__proto__", "Tree Care", ""]) assert.equal(h.helpers.applyEstimateService(h.form, value), false);
  h.service.disabled = true; assert.equal(h.helpers.applyEstimateService(h.form, "Landscaping"), false);
  h.service.disabled = false; h.service.options.find(x => x.value === "Landscaping").disabled = true;
  assert.equal(h.helpers.applyEstimateService(h.form, "Landscaping"), false);
  assert.equal(h.service.value, "Tree Care"); assert.equal(h.picker.value, "tree-removal");
});

for (const previous of ["success", "error", ""]) {
  test(`new estimate clears stale success and preserves customer state (previous feedback: ${previous || "empty"})`, () => {
    const classes = new Set(previous ? [previous] : []), bodyClasses = new Set(["ats-form-submitted"]);
    const status = { textContent: previous ? "Previous response" : "", hidden: !previous,
      classList: { contains: x => classes.has(x), toggle(x, enabled) { if (enabled) classes.add(x); else classes.delete(x); } },
      focus() { assert.fail("clearing confirmation must not move focus to an empty status"); },
    };
    const form = { dataset: { submissionId: "same-request" }, draft: "Keep every word.",
      querySelector: selector => selector === ".ats-form-server-status" ? status : null };
    const helpers = loadScript("ats-form-enhancements.js", ["clearEstimateConfirmation"], {
      document: { addEventListener() {}, body: { classList: { remove: x => bodyClasses.delete(x) } } },
    });
    helpers.clearEstimateConfirmation(form);
    assert.equal(bodyClasses.has("ats-form-submitted"), false);
    assert.equal(status.hidden, previous !== "error");
    assert.equal(status.textContent, previous === "error" ? "Previous response" : "");
    assert.equal(classes.has("error"), previous === "error");
    assert.equal(form.draft, "Keep every word."); assert.equal(form.dataset.submissionId, "same-request");
  });
}

test("message budget includes context, never truncates details and prevents oversized transport", async () => {
  const h = contextHarness("?service=Tree%20Care&estimate_context=tree-removal"), prefix = h.helpers.getMessagePrefix(h.form);
  h.details.value = "x".repeat(3000 - (await multipartMessage(prefix)).length); await h.helpers.submitLead(h.form);
  assert.equal((await multipartMessage(h.requests[0].get("message"))).length, 3000);
  h.details.value += "x"; const draft = h.details.value;
  await assert.rejects(h.helpers.submitLead(h.form), /shorten project details/);
  assert.equal(h.requests.length, 1); assert.equal(h.details.value, draft);
  h.picker.value = ""; h.details.value = "x".repeat(3000); await h.helpers.submitLead(h.form);
  assert.equal(h.requests[1].get("message"), h.details.value);
});

async function multipartMessage(value) {
  const data = new FormData();
  data.set("message", value);
  // Serialize locally with the native multipart encoder; no request is sent.
  const encoded = await new Request("http://127.0.0.1/never-sent", { method: "POST", body: data }).text();
  return encoded.slice(encoded.indexOf("\r\n\r\n") + 4, encoded.lastIndexOf("\r\n--"));
}

for (const [name, search, draft] of [
  ["context prefix at raw length boundary", "?service=Tree%20Care&estimate_context=tree-removal", "x".repeat(2967)],
  ["multiline context", "?service=Tree%20Care&estimate_context=tree-removal", "x\n".repeat(1000)],
  ["multiline generic", "", "x\n".repeat(1001)],
]) {
  test(`${name}: prevent truncation after real multipart line-ending normalization`, async () => {
    const h = contextHarness(search); h.details.value = draft;
    const wire = await multipartMessage(h.helpers.getMessagePrefix(h.form) + draft);
    assert.ok(wire.length > 3000, "the real encoder exceeds the server's retained length");
    await assert.rejects(h.helpers.submitLead(h.form), /shorten project details/);
    assert.equal(h.requests.length, 0, "over-budget text must not reach transport");
    assert.equal(h.details.value, draft, "no truncation or rewriting of customer input");
  });
}

test("multiline message exactly at the encoded boundary preserves every customer character", async () => {
  const h = contextHarness("?service=Tree%20Care&estimate_context=tree-pruning");
  const prefix = h.helpers.getMessagePrefix(h.form);
  const fixed = prefix + "First line\nSecond line\r\n";
  const padding = 3000 - (await multipartMessage(fixed)).length;
  h.details.value = "First line\nSecond line\r\n" + "x".repeat(padding);
  const draft = h.details.value;
  await h.helpers.submitLead(h.form);
  assert.equal((await multipartMessage(h.requests[0].get("message"))).length, 3000);
  assert.equal(h.details.value, draft);
  h.details.value += "x";
  await assert.rejects(h.helpers.submitLead(h.form), /shorten project details/);
  assert.equal(h.requests.length, 1);
});

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

test("mobile quick actions avoid the hero and form, including partial observer updates and restored scroll", () => {
  const hero = {}, contact = {}, observed = [];
  let hidden, notify;
  const actions = { classList: { toggle(name, value) { assert.equal(name, "is-hidden"); hidden = value; } } };
  function Observer(callback) { notify = callback; this.observe = target => observed.push(target); }
  const helpers = loadScript("ats-form-enhancements.js", ["initMobileActions"], {
    document: { addEventListener() {}, querySelector: selector => ({ ".ats-mobile-actions": actions, "#contact": contact, "#top": hero })[selector] },
    window: { addEventListener() {}, IntersectionObserver: Observer }, IntersectionObserver: Observer,
  });
  helpers.initMobileActions();
  assert.equal(hidden, true, "first paint keeps the main estimate action clear");
  assert.ok(observed.includes(hero) && observed.includes(contact));
  notify([{ target: contact, isIntersecting: false }]);
  assert.equal(hidden, true, "contact-only update cannot reveal a duplicate hero action");
  notify([{ target: hero, isIntersecting: false }]);
  assert.equal(hidden, false, "actions are available after scrolling or restoring below the hero");
  notify([{ target: contact, isIntersecting: true }]);
  assert.equal(hidden, true, "actions cannot cover the form");
  notify([{ target: hero, isIntersecting: true }]);
  notify([{ target: contact, isIntersecting: false }]);
  assert.equal(hidden, true, "returning to the top hides the duplicate actions again");
});

test("mobile quick actions retain their existing fallback when observation is unavailable", () => {
  let touched = false;
  const actions = { classList: { toggle() { touched = true; } } };
  const helpers = loadScript("ats-form-enhancements.js", ["initMobileActions"], {
    document: { addEventListener() {}, querySelector: selector => selector === ".ats-mobile-actions" ? actions : {} },
    window: { addEventListener() {} },
  });
  assert.doesNotThrow(() => helpers.initMobileActions());
  assert.equal(touched, false);
});

for (const service of [
  { name: "Tree Removal", file: "tree-removal-mobile.js", init: "initRemovalActions", offset: "--ats-removal-anchor-offset" },
  { name: "Tree Pruning", file: "tree-pruning-mobile.js", init: "initPruningActions", offset: "--ats-pruning-anchor-offset" },
  { name: "Storm / Emergency", file: "emergency-tree-mobile.js", init: "initEmergencyActions", offset: "--ats-emergency-anchor-offset" },
  { name: "Stump Grinding", file: "stump-grinding-mobile.js", init: "initStumpActions", offset: "--ats-stump-anchor-offset" },
]) {
  test(`${service.name} actions yield only to the complete hero pair below the header and recover on return`, () => {
    const actions = { hidden: false, addEventListener() {}, contains: () => false }, hero = {}, observers = [];
    let headerHeight = 70, resize, anchorOffset;
    const header = { getBoundingClientRect: () => ({ height: headerHeight }) };
    function Observer(callback, options) {
      Object.assign(this, { callback, options, observe: target => { this.target = target; }, disconnect: () => { this.disconnected = true; } });
      observers.push(this);
    }
    function ResizeObserver(callback) { resize = callback; this.observe = target => assert.equal(target, header); }
    const helpers = loadScript(service.file, [service.init], {
      document: { body: { style: { setProperty(name, value) { assert.equal(name, service.offset); anchorOffset = value; } } }, addEventListener() {}, querySelector: s => s.endsWith(".ats-mobile-actions") ? actions : s.endsWith(".ats-actions") ? hero : header },
      window: { IntersectionObserver: Observer, ResizeObserver },
    });
    helpers[service.init]();
    assert.equal(observers[0].target, hero);
    assert.equal(observers[0].options.rootMargin, "-70px 0px 0px 0px");
    assert.equal(anchorOffset, "90px");
    const notify = (ratio, visible = true) => observers.at(-1).callback([{ target: hero, intersectionRatio: ratio, isIntersecting: visible }]);
    notify(0.98); assert.equal(actions.hidden, false, "partly clipped hero links cannot replace the floating pair");
    notify(1); assert.equal(actions.hidden, true);
    notify(0, false); assert.equal(actions.hidden, false, "bar returns after scrolling or restored navigation");
    notify(1); assert.equal(actions.hidden, true, "scrolling back yields to the hero again");
    resize(); assert.equal(observers.length, 1, "same header height does not recreate observation");
    headerHeight = 140; resize();
    assert.equal(observers[0].disconnected, true);
    assert.equal(observers[1].options.rootMargin, "-140px 0px 0px 0px", "larger text reserves actual header space");
    assert.equal(anchorOffset, "160px", "anchor clearance grows with the header");
    notify(0.5); assert.equal(actions.hidden, false);
  });

  test(`${service.name} bar remains available on unsupported browsers and unrelated pages`, () => {
    for (const available of [false, true]) {
      const actions = { hidden: false, addEventListener() {} };
      const helpers = loadScript(service.file, [service.init], {
        document: { body: { style: { setProperty() {} } }, addEventListener() {}, querySelector: s => !available ? null : s === ".ats-page-header" ? { getBoundingClientRect: () => ({ height: 70 }) } : actions },
        window: { addEventListener() {} },
      });
      assert.doesNotThrow(() => helpers[service.init]());
      assert.equal(actions.hidden, false);
    }
  });
}

test("Storm quick actions retain keyboard focus when the hero returns", () => {
  let notify, leave;
  const focusedLink = {};
  const actions = { hidden: false, contains: element => element === focusedLink,
    addEventListener: (type, callback) => { assert.equal(type, "focusout"); leave = callback; } };
  const hero = {};
  const document = { activeElement: focusedLink, body: { style: { setProperty() {} } }, addEventListener() {},
    querySelector: selector => selector.endsWith(".ats-mobile-actions") ? actions : selector.endsWith(".ats-actions") ? hero : null };
  function IntersectionObserver(callback) { notify = callback; this.observe = () => {}; }
  const helpers = loadScript("emergency-tree-mobile.js", ["initEmergencyActions"], { document,
    window: { IntersectionObserver, addEventListener() {} } });
  helpers.initEmergencyActions();
  notify([{ target: hero, isIntersecting: true, intersectionRatio: 1 }]);
  assert.equal(actions.hidden, false, "a focused bar cannot disappear during scrolling or resizing");
  leave({ relatedTarget: focusedLink });
  assert.equal(actions.hidden, false, "moving between quick actions preserves the bar");
  leave({ relatedTarget: {} });
  assert.equal(actions.hidden, true, "the visible hero can replace the bar after focus leaves");
  notify([{ target: hero, isIntersecting: false, intersectionRatio: 0 }]);
  assert.equal(actions.hidden, false);
});

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

function formHarness(draft) {
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
      ATSEstimateDrafts: draft ? { create: () => draft } : undefined,
      location: { search: "", href: "https://local.test/" },
      crypto: { randomUUID: () => `local-${++sequence}` },
      ATSWebsite: { track: (...args) => events.push(args), getAttribution: () => ({ utm_source: "mock" }) },
    },
    document: { referrer: "", addEventListener() {}, querySelectorAll() { return []; }, createElement: () => ({}), body: { classList: { remove() {}, add() {} } } },
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

for (const [status, body, forgotten] of [[201, '{"ok":true}', 1], [200, '{"ok":true}', 1], [202, '{"ok":true}', 1], [500, '{"ok":false}', 0], [200, '<html>ambiguous</html>', 0]]) {
  test(`draft cleanup follows a real verified acknowledgment (${status}/${body})`, async () => {
    let forgets = 0;
    const h = formHarness({ finishRestore() {}, setBusy() {}, forget() { forgets++; } });
    assert.equal(h.requests.length, 0, "restoration never sends a request");
    h.submit(); h.requests[0].resolve(response(status < 400, body, status)); await h.settle();
    assert.equal(forgets, forgotten); assert.equal(h.resets(), forgotten);
  });
}

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
