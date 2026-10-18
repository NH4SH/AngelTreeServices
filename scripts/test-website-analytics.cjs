const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "ats-website.js"), "utf8");

// No browser/network implementation is supplied: external scripts are inert objects.
// All requests fail closed unless a test explicitly supplies a local mock.
function harness({ enabled = false, search = "", pathname = "/", storage = new Map(), storageBlocked = false } = {}) {
  const listeners = {}, scripts = [], links = [];
  let now = 1000000;
  const window = {
    location: { search, pathname, hostname: "angeltreeservices.org", origin: "https://local.test" },
    sessionStorage: {
      getItem(key) { if (storageBlocked) throw Error("blocked"); return storage.get(key); },
      setItem(key, value) { if (storageBlocked) throw Error("blocked"); storage.set(key, value); },
      removeItem(key) { if (storageBlocked) throw Error("blocked"); storage.delete(key); },
    },
  };
  const cookieWrites = [];
  const document = {
    set cookie(value) { cookieWrites.push(value); },
    head: { appendChild(script) { scripts.push(script); } },
    createElement() { return { remove() {} }; },
    addEventListener(name, fn) { listeners[name] = fn; },
    querySelectorAll() { return links; },
  };
  const context = vm.createContext({ window, document, URL, URLSearchParams,
    Date: class extends Date { static now() { return now; } },
    fetch() { throw Error("NETWORK BLOCKED"); },
  });
  const scriptSource = source
    .replace(/var COLLECTION_ENABLED = (?:true|false);/, "var COLLECTION_ENABLED = " + enabled + ";")
    .replace(/var MEASUREMENT_ID = "[^"]*";/, 'var MEASUREMENT_ID = "' + (enabled ? 'G-MOCKONLY' : '') + '";');
  vm.runInContext(scriptSource, context);
  return { window, document, listeners, scripts, links, storage,
    api: window.ATSWebsite, cookieWrites,
    events: () => Array.from(window.dataLayer || [], item => Array.from(item)).filter(item => item[0] === "event"),
    commands: () => Array.from(window.dataLayer || [], item => Array.from(item)),
    advance: value => { now += value; },
    load: () => { scripts.at(-1).onload(); },
    rerun: () => vm.runInContext(scriptSource, context),
  };
}

test("disabled fixture prevents tag loading even with consent; no pre-consent storage", () => {
  const h = harness({ search: "?utm_source=google" });
  h.listeners.DOMContentLoaded();
  assert.equal(h.storage.size, 0);
  h.api.track("estimate_form_started", { form_name: "contact" });
  h.api.setConsent("granted");
  assert.equal(h.scripts.length, 0);
  assert.equal(h.window.gtag, undefined);
});

test("approved mock transport waits for consent; sends one sanitized page view and drops old events", () => {
  const h = harness({ enabled: true, pathname: "/services/tree-removal/", search: "?email=private@example.com&utm_source=secret" });
  h.api.track("estimate_form_started", { form_name: "contact" });
  assert.equal(h.scripts.length, 0);
  h.api.setConsent("granted");
  h.api.track("estimate_form_started", { form_name: "contact" });
  assert.equal(h.scripts.length, 1);
  h.load();
  h.api.setConsent("granted");
  h.rerun();
  assert.equal(h.events().length, 1);
  assert.equal(h.events()[0][1], "page_view");
  assert.equal(h.events()[0][2].page_location, "https://angeltreeservices.org/services/tree-removal/");
  assert.equal(h.events()[0][2].page_referrer, "");
  assert.doesNotMatch(JSON.stringify(h.commands()), /private|secret|email=/);
  assert.equal(h.commands().find(x => x[0] === "config")[2].send_page_view, false);
});

test("unknown paths and arbitrary parameters never enter telemetry", () => {
  const h = harness({ enabled: true, pathname: "/customer/private-name/" });
  h.api.setConsent("granted"); h.load();
  h.api.track("navigation_link_click", { destination: "private@example.com", navigation: "mobile_menu", address: "123 Private" });
  h.api.track("generate_lead", { value: 100 });
  h.api.track("estimate_form_submitted", {});
  h.api.track("__proto__", {});
  assert.equal(h.events().length, 1);
  assert.equal(h.events()[0][2].page_location, "https://angeltreeservices.org/other/");
  assert.doesNotMatch(JSON.stringify(h.commands()), /private|123 Private|generate_lead|estimate_form_submitted/i);
});

test("withdrawal stops events, clears attribution, and does not duplicate page view on regrant", () => {
  const h = harness({ enabled: true, search: "?utm_campaign=spring" });
  h.api.setConsent("granted"); h.load();
  assert.equal(h.storage.size, 1);
  h.api.setConsent("denied");
  assert.equal(h.window["ga-disable-G-MOCKONLY"], true);
  assert.equal(h.storage.size, 0);
  h.api.track("phone_link_click", { location: "hero" });
  assert.equal(h.events().length, 1);
  h.api.setConsent("granted");
  assert.equal(h.events().length, 1);
});

test("withdrawal while loader is pending cannot configure or emit", () => {
  const h = harness({ enabled: true });
  h.api.setConsent("granted"); h.api.setConsent("denied"); h.load();
  assert.equal(h.events().length, 0);
  assert.equal(h.commands().filter(x => x[0] === "config").length, 0);
});

test("blocked loader and throwing transport stay non-blocking", () => {
  const h = harness({ enabled: true });
  h.api.setConsent("granted"); h.scripts[0].onerror();
  assert.equal(h.events().length, 0);
  h.api.setConsent("granted"); h.load();
  h.window.gtag = () => { throw Error("blocked"); };
  assert.doesNotThrow(() => h.api.track("phone_link_click", { location: "hero" }));
});

test("campaign attribution is bounded, consent-gated and replaced by a new explicit campaign", () => {
  const storage = new Map();
  const landing = harness({ search: "?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=secret&utm_content=person%40example.com", storage });
  assert.equal(landing.api.getAttribution().utm_source, "google");
  assert.equal(storage.size, 0);
  landing.api.setConsent("granted");
  const next = harness({ storage });
  assert.equal(Object.keys(next.api.getAttribution()).length, 0, "consent must be restored by approved UI");
  next.api.setConsent("granted");
  assert.equal(next.api.getAttribution().utm_campaign, "spring");
  assert.equal(next.api.getAttribution().gclid, undefined);
  assert.equal(next.api.getAttribution().utm_content, undefined);
  next.window.location.search = "?utm_source=bing";
  assert.equal(next.api.getAttribution().utm_source, "bing");
  assert.equal(next.api.getAttribution().utm_campaign, undefined, "do not mix campaigns");
  next.window.location.search = "";
  next.advance(30 * 60 * 1000);
  assert.equal(Object.keys(next.api.getAttribution()).length, 0);
});

test("malformed, future and unavailable storage fail safely", () => {
  for (const value of ["{broken", '{"at":99999999,"values":{"utm_source":"bad"}}', '{"at":1000000,"values":{"utm_source":"bad@example.com"}}']) {
    const h = harness({ storage: new Map([["ats-attribution-v1", value]]) });
    h.api.setConsent("granted");
    assert.equal(Object.keys(h.api.getAttribution()).length, 0);
  }
  const h = harness({ storageBlocked: true, search: "?utm_source=google" });
  assert.doesNotThrow(() => h.api.setConsent("granted"));
  assert.equal(h.api.getAttribution().utm_source, "google");
});

test("estimate links keep bounded current attribution and prefill; never rewrite external links", () => {
  const h = harness({ search: "?utm_source=google&utm_campaign=" + "x".repeat(121) });
  h.links.push({ href: "https://local.test/?service=Tree+Care#contact" }, { href: "https://external.test/#contact" });
  h.listeners.DOMContentLoaded();
  assert.match(h.links[0].href, /service=Tree\+Care&utm_source=google#contact/);
  assert.doesNotMatch(h.links[0].href, /utm_campaign/);
  assert.equal(h.links[1].href, "https://external.test/#contact");
});

for (const mobile of [false, true]) {
  test(`${mobile ? "mobile" : "desktop"}: only phone and estimate intent instrumentation`, () => {
    const h = harness({ enabled: true });
    h.api.setConsent("granted"); h.load(); h.listeners.DOMContentLoaded();
    const link = {
      href: "https://local.test/?service=Tree+Care#contact", dataset: { atsNav: "contact" },
      closest(selector) { return mobile && /mobile/.test(selector) ? {} : null; },
      classList: { contains: () => false }, matches: () => false,
    };
    h.listeners.click({ target: { closest: () => link } });
    assert.equal(h.events().filter(x => x[1] === "navigation_link_click").length, 0);
    assert.equal(h.events().filter(x => x[1] === "estimate_cta_click").length, 1);
    link.href = "tel:+15403888715"; link.dataset = {}; link.matches = () => true;
    h.listeners.click({ target: { closest: () => link } });
    assert.equal(h.events().filter(x => x[1] === "phone_link_click").length, 1);
  });
}

const publicRoutes = ["/", "/services/", "/services/tree-removal/", "/services/tree-pruning/",
  "/services/stump-grinding/", "/services/emergency-tree-service/", "/services/landscaping/",
  "/services/commercial-hoa-tree-care/", "/credentials-safety/", "/projects/",
  "/projects/hollow-tree-removal/", "/about/", "/recognition/", "/privacy/", "/privacy-request/"];

test("every published route has one sanitized page view scoped to the intended stream", () => {
  for (const pathname of publicRoutes) {
    const h = harness({ enabled: true, pathname, search: "?qa_private_marker=DO_NOT_SEND#DO_NOT_SEND" });
    h.api.setConsent("granted"); h.load(); h.api.setConsent("granted"); h.rerun();
    const views = h.events().filter(x => x[1] === "page_view");
    assert.equal(views.length, 1, pathname);
    assert.equal(views[0][2].page_location, "https://angeltreeservices.org" + pathname);
    assert.equal(views[0][2].page_title, pathname);
    assert.equal(views[0][2].page_referrer, "");
    assert.equal(views[0][2].send_to, "G-MOCKONLY");
    assert.doesNotMatch(JSON.stringify(h.commands()), /DO_NOT_SEND|qa_private_marker/);
  }
});

test("consent defaults deny every category and preparation keeps advertising features off", () => {
  const h = harness({ enabled: true });
  h.listeners.DOMContentLoaded();
  h.api.setConsent("denied");
  assert.equal(h.scripts.length, 0);
  h.api.setConsent("granted");
  const defaults = h.commands().find(x => x[0] === "consent" && x[1] === "default")[2];
  for (const category of ["analytics_storage", "ad_storage", "ad_user_data", "ad_personalization"]) {
    assert.equal(defaults[category], "denied");
  }
  h.load();
  const config = h.commands().find(x => x[0] === "config")[2];
  assert.equal(config.send_page_view, false);
  assert.equal(config.cookie_domain, "none", "future analytics cookies must be host-only, not shared with CRM subdomains");
  assert.equal(config.cookie_path, "/");
  assert.equal(config.cookie_expires, 180 * 86400);
  assert.equal(config.cookie_update, false);
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
  for (const entry of h.commands().filter(x => x[0] === "consent" && x[1] === "update")) {
    assert.notEqual(entry[2].ad_storage, "granted");
    assert.notEqual(entry[2].ad_user_data, "granted");
    assert.notEqual(entry[2].ad_personalization, "granted");
  }
});

test("a library loaded after withdrawal is reused on regrant without duplicate configuration", () => {
  const h = harness({ enabled: true });
  h.api.setConsent("granted");
  h.api.setConsent("denied");
  h.load();
  assert.equal(h.events().length, 0);
  assert.equal(h.commands().filter(x => x[0] === "config").length, 0);
  h.api.setConsent("granted");
  assert.equal(h.scripts.length, 1, "reuse the loaded library rather than fetching it twice");
  assert.equal(h.commands().filter(x => x[0] === "config").length, 1);
  assert.equal(h.events().filter(x => x[1] === "page_view").length, 1);
  h.api.setConsent("denied");
  h.api.setConsent("granted");
  assert.equal(h.scripts.length, 1);
  assert.equal(h.commands().filter(x => x[0] === "config").length, 1);
  assert.equal(h.events().filter(x => x[1] === "page_view").length, 1);
});

test("phone and estimate payloads exclude raw URLs, text, form contents and caller-supplied destinations", () => {
  const h = harness({ enabled: true, search: "?qa_private_marker=DO_NOT_SEND" });
  h.api.setConsent("granted"); h.load(); h.listeners.DOMContentLoaded();
  for (const name of ["phone_link_click", "estimate_cta_click"]) {
    h.api.track(name, { location: "hero", email: "DO_NOT_SEND", address: "DO_NOT_SEND",
      message: "DO_NOT_SEND", link_text: "DO_NOT_SEND", link_url: "DO_NOT_SEND", send_to: "G-DO_NOT_SEND" });
    const payload = h.events().find(x => x[1] === name)[2];
    assert.deepEqual(Object.keys(payload).sort(), ["location", "send_to"]);
    assert.equal(payload.send_to, "G-MOCKONLY");
  }
  assert.doesNotMatch(JSON.stringify(h.commands()), /DO_NOT_SEND|qa_private_marker/);
});

test("emergency telephone links record one phone intent and no extra diagnostic", () => {
  const h = harness({ enabled: true });
  h.api.setConsent("granted"); h.load(); h.listeners.DOMContentLoaded();
  const link = {
    href: "tel:+15403888715", dataset: {},
    closest: () => null,
    classList: { contains: name => name === "ats-emergency-call" },
    matches: selector => selector === 'a[href^="tel:"]',
  };
  h.listeners.click({ target: { closest: () => link } });
  assert.equal(h.events().filter(x => x[1] === "phone_link_click").length, 1);
  assert.equal(h.events().filter(x => x[1] === "emergency_cta_click").length, 0);
  assert.doesNotMatch(JSON.stringify(h.events()), /15403888715/);
});

test("service and navigation diagnostics stay off without passing arbitrary paths", () => {
  const h = harness({ enabled: true });
  h.api.setConsent("granted"); h.load(); h.listeners.DOMContentLoaded();
  const link = {
    href: "https://local.test/services/landscaping/?qa_private_marker=DO_NOT_SEND",
    dataset: { atsNav: "landscaping" }, closest: () => null,
    classList: { contains: () => false }, matches: () => false,
  };
  h.listeners.click({ target: { closest: () => link } });
  assert.equal(h.events().length, 1);
  assert.equal(h.events()[0][1], "page_view");
  assert.doesNotMatch(JSON.stringify(h.commands()), /DO_NOT_SEND/);
});


test("withdrawal removes only approved public GA cookie names and leaves other storage alone", () => {
  const h = harness({ enabled: true });
  h.api.setConsent("granted"); h.load();
  h.storage.set("estimate-draft", "synthetic draft");
  h.api.setConsent("denied");
  assert.equal(h.window["ga-disable-G-MOCKONLY"], true);
  assert.equal(h.storage.get("estimate-draft"), "synthetic draft");
  assert.equal(h.cookieWrites.length, 6);
  assert.deepEqual([...new Set(h.cookieWrites.map(x => x.split("=")[0]))], ["_ga", "_ga_MOCKONLY"]);
  assert.ok(h.cookieWrites.every(x => x.includes("Max-Age=0") && x.includes("path=/")));
  assert.ok(h.cookieWrites.some(x => x.includes("domain=.angeltreeservices.org")));
  const disabled = harness(); disabled.api.setConsent("denied");
  assert.deepEqual([...new Set(disabled.cookieWrites.map(x => x.split("=")[0]))], ["_ga", "_ga_8WMD200TXP"]);
  assert.equal(disabled.scripts.length, 0);
});


test("minimal launch excludes all form, navigation, service and fabricated conversion events", () => {
  const h = harness({ enabled: true }); h.api.setConsent("granted"); h.load();
  for (const name of ["estimate_form_started", "estimate_request_acknowledged", "estimate_form_failed",
    "navigation_link_click", "service_link_click", "emergency_cta_click", "generate_lead", "purchase"]) {
    h.api.track(name, { form_name: "contact", destination: "/services/landscaping/", location: "hero" });
  }
  assert.deepEqual(h.events().map(x => x[1]), ["page_view"]);
});
