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
    location: { search, pathname, origin: "https://local.test" },
    sessionStorage: {
      getItem(key) { if (storageBlocked) throw Error("blocked"); return storage.get(key); },
      setItem(key, value) { if (storageBlocked) throw Error("blocked"); storage.set(key, value); },
      removeItem(key) { if (storageBlocked) throw Error("blocked"); storage.delete(key); },
    },
  };
  const document = {
    head: { appendChild(script) { scripts.push(script); } },
    createElement() { return { remove() {} }; },
    addEventListener(name, fn) { listeners[name] = fn; },
    querySelectorAll() { return links; },
  };
  const context = vm.createContext({ window, document, URL, URLSearchParams,
    Date: class extends Date { static now() { return now; } },
    fetch() { throw Error("NETWORK BLOCKED"); },
  });
  const scriptSource = enabled ? source.replace("var COLLECTION_ENABLED = false;", "var COLLECTION_ENABLED = true;").replace('var MEASUREMENT_ID = "";', 'var MEASUREMENT_ID = "G-MOCKONLY";') : source;
  vm.runInContext(scriptSource, context);
  return { window, document, listeners, scripts, links, storage,
    api: window.ATSWebsite,
    events: () => Array.from(window.dataLayer || [], item => Array.from(item)).filter(item => item[0] === "event"),
    commands: () => Array.from(window.dataLayer || [], item => Array.from(item)),
    advance: value => { now += value; },
    load: () => { scripts.at(-1).onload(); },
    rerun: () => vm.runInContext(scriptSource, context),
  };
}

test("shipping gates prevent tag loading even with consent; no pre-consent storage", () => {
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
  assert.equal(h.events().length, 2);
  assert.equal(h.events()[0][2].page_location, "https://angeltreeservices.org/other/");
  assert.equal(h.events()[1][2].navigation, "mobile_menu");
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
  test(`${mobile ? "mobile" : "desktop"}: shared navigation, phone and estimate instrumentation`, () => {
    const h = harness({ enabled: true });
    h.api.setConsent("granted"); h.load(); h.listeners.DOMContentLoaded();
    const link = {
      href: "https://local.test/?service=Tree+Care#contact", dataset: { atsNav: "contact" },
      closest(selector) { return mobile && /mobile/.test(selector) ? {} : null; },
      classList: { contains: () => false }, matches: () => false,
    };
    h.listeners.click({ target: { closest: () => link } });
    assert.equal(h.events().filter(x => x[1] === "navigation_link_click").length, 1);
    assert.equal(h.events().find(x => x[1] === "navigation_link_click")[2].navigation, mobile ? "mobile_menu" : "desktop_header");
    assert.equal(h.events().filter(x => x[1] === "estimate_cta_click").length, 1);
    link.href = "tel:+15403888715"; link.dataset = {}; link.matches = () => true;
    h.listeners.click({ target: { closest: () => link } });
    assert.equal(h.events().filter(x => x[1] === "phone_link_click").length, 1);
  });
}
