const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const drafts = require("../ats-estimate-draft.js");
const key = "ats.estimate-draft.v1";
const epoch = 1792240000000;

function fixture(store = new Map(), clock = { time: epoch }, storageMode = "normal") {
  const events = {}, windowEvents = {}, clicks = {}, timers = new Map();
  let timerSequence = 0, cleared = 0, synced = 0;
  const node = (name, value = "", type = "text") => ({ name, value, type, checked: false,
    hasAttribute: () => false, getAttribute: () => "false" });
  const fields = Object.fromEntries(["name", "phone", "email", "address", "message", "commercial_name"].map(name => [name, node(name)]));
  function select(name, values) { fields[name] = { ...node(name), options: values.map(value => ({ value })) }; }
  select("service", ["", "Tree Care", "Landscaping", "Storm Cleanup", "Multiple Services / Not Sure Yet"]);
  select("property_scope", ["", "1 property", "2 to 5 properties", "6+ properties", "Recurring service"]);
  const radioGroups = {
    customer_type: [node("customer_type", "Homeowner", "radio"), node("customer_type", "Commercial / Property Management", "radio")],
    preferred_contact_method: ["", "phone", "text", "email"].map(value => node("preferred_contact_method", value, "radio")),
  };
  Object.values(radioGroups).forEach(group => { group[0].checked = true; });
  for (const [name, group] of Object.entries(radioGroups)) fields[name] = group[0];
  fields.hazard_present = node("hazard_present", "yes", "checkbox");
  fields.updates_opt_in = node("updates_opt_in", "yes", "checkbox");
  fields["bot-field"] = node("bot-field", "must not be retained");
  const picker = { ...node(""), disabled: true, hasAttribute: name => name === "data-estimate-intent",
    options: ["", "tree-removal", "tree-pruning", "stump-grinding", "emergency-tree-service", "commercial-hoa-tree-care"].map(value => ({ value })) };
  const panel = { hidden: true }, status = { textContent: "" }, clear = { hidden: false, disabled: false, addEventListener: (name, fn) => { clicks[name] = fn; } };
  const context = { hidden: true };
  const form = {
    dataset: { submissionId: "11111111-1111-4111-8111-111111111111", formStartedAt: String(clock.time) },
    querySelector(selector) {
      const special = { "[data-estimate-draft]": panel, "[data-draft-status]": status, "[data-draft-clear]": clear,
        "[data-estimate-intent]": picker, "[data-estimate-context]": context };
      if (special[selector]) return special[selector];
      const name = selector.match(/\[name="([^"]+)"\]/)?.[1];
      if (selector.endsWith(":checked")) return radioGroups[name]?.find(item => item.checked) || null;
      return fields[name] || null;
    },
    querySelectorAll(selector) { const name = selector.match(/\[name="([^"]+)"\]/)?.[1]; return radioGroups[name] || (fields[name] ? [fields[name]] : []); },
    addEventListener(name, fn) { (events[name] ||= []).push(fn); },
    reset() {
      (events.reset || []).forEach(fn => fn({}));
      Object.values(fields).forEach(field => { if (field.type === "checkbox") field.checked = false; else if (field.type !== "radio") field.value = ""; });
      Object.values(radioGroups).forEach(group => group.forEach((field, i) => { field.checked = i === 0; }));
      picker.value = ""; picker.disabled = true; form.dataset.estimateContextAvailable = "";
    }
  };
  const storage = {
    getItem(name) { if (storageMode === "read-blocked") throw Error("denied"); return store.get(name) ?? null; },
    setItem(name, value) { if (storageMode === "quota") throw Error("quota"); store.set(name, value); },
    removeItem(name) { store.delete(name); }
  };
  const win = { Date: { now: () => clock.time },
    setTimeout(fn, delay) { const id = ++timerSequence; timers.set(id, { fn, at: clock.time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, fn) { (windowEvents[name] ||= []).push(fn); },
    fetch() { assert.fail("draft recovery must never submit anything"); },
    get localStorage() { assert.fail("persistent storage must never be accessed"); }
  };
  Object.defineProperty(win, "sessionStorage", { get() { if (storageMode === "getter-blocked") throw Error("denied"); return storage; } });
  const controller = drafts.create(form, {
    clearForm() { cleared++; form.reset(); form.dataset.submissionId = "22222222-2222-4222-8222-222222222222"; },
    syncForm() { synced++; }
  }, win);
  return { form, fields, picker, panel, status, clear, controller, store, clock, radioGroups, win,
    edit(name, value) { fields[name].value = value; (events.input || []).forEach(fn => fn({ target: fields[name] })); },
    emit(type, target) { (events[type] || []).forEach(fn => fn({ target })); },
    clickClear: () => clicks.click(),
    page(type, persisted = true) { (windowEvents[type] || []).forEach(fn => fn({ persisted })); },
    advance(ms) { clock.time += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock.time) { timers.delete(id); timer.fn(); } },
    cleared: () => cleared, synced: () => synced };
}

test("a new page restores literal customer details, conditional choices and retry identity without sending", () => {
  const a = fixture();
  for (const [name, value] of Object.entries({ name: "José 🌳", phone: "(540) 555-0123", email: "local@example.test", address: "Local fixture address", commercial_name: "Local fixture HOA", service: "Multiple Services / Not Sure Yet", property_scope: "2 to 5 properties" })) a.fields[name].value = value;
  a.radioGroups.customer_type.forEach(item => { item.checked = item.value === "Commercial / Property Management"; });
  a.radioGroups.preferred_contact_method.forEach(item => { item.checked = item.value === "email"; });
  a.fields.hazard_present.checked = true; a.fields.updates_opt_in.checked = true;
  a.picker.value = "commercial-hoa-tree-care"; a.picker.disabled = false; a.form.dataset.estimateContextAvailable = "true";
  const text = "  Preserve every word.\n<script>literal text only</script> & 🌳  ";
  a.edit("message", text);
  const record = JSON.parse(a.store.get(key));
  assert.equal(record.fields.updates_opt_in, undefined); assert.equal(record.fields["bot-field"], undefined);
  assert.equal(record.page_url, undefined); assert.equal(record.endpoint, undefined);
  const b = fixture(a.store, a.clock); b.controller.finishRestore();
  assert.equal(b.fields.message.value, text); assert.equal(b.fields.name.value, "José 🌳");
  assert.equal(b.fields.commercial_name.value, "Local fixture HOA");
  assert.equal(b.radioGroups.customer_type[1].checked, true); assert.equal(b.radioGroups.preferred_contact_method[3].checked, true);
  assert.equal(b.fields.hazard_present.checked, true); assert.equal(b.fields.updates_opt_in.checked, false);
  assert.equal(b.picker.value, "commercial-hoa-tree-care");
  assert.equal(b.form.dataset.submissionId, a.form.dataset.submissionId); assert.equal(b.form.dataset.formStartedAt, a.form.dataset.formStartedAt);
  assert.match(b.status.textContent, /restored/); assert.equal(b.panel.hidden, false);
});

test("an explicit estimate URL still selects Landscaping without overwriting restored customer text", () => {
  const a = fixture(); a.fields.service.value = "Tree Care";
  a.picker.value = "tree-pruning"; a.picker.disabled = false; a.form.dataset.estimateContextAvailable = "true";
  a.edit("message", "My existing project details");
  const b = fixture(a.store, a.clock);
  const context = vm.createContext({ URLSearchParams, document: { addEventListener() {} }, window: { location: { search: "?service=Landscaping#contact" }, addEventListener() {} } });
  // Execute the real prefill/context helpers in a test-only VM export.
  const source = fs.readFileSync(path.join(__dirname, "../ats-form-enhancements.js"), "utf8");
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, "globalThis.prefill = applyEstimatePrefill; })();"), context);
  context.window.location.search = "?service=Landscaping";
  context.prefill(b.form); b.controller.finishRestore();
  assert.equal(b.fields.service.value, "Landscaping"); assert.equal(b.fields.message.value, "My existing project details");
  assert.equal(b.picker.value, ""); assert.equal(JSON.parse(a.store.get(key)).intent, "");
});

test("expiry is based on edits, not browsing or restoration; an expired draft is not recovered", () => {
  const a = fixture(); a.edit("message", "Keep until expiry");
  const expiry = JSON.parse(a.store.get(key)).expires;
  a.clock.time += 29 * 60 * 1000; a.page("pagehide");
  const b = fixture(a.store, a.clock); b.controller.finishRestore();
  assert.equal(JSON.parse(a.store.get(key)).expires, expiry);
  b.clock.time += 60 * 1000;
  const c = fixture(a.store, a.clock);
  assert.equal(c.fields.message.value, ""); assert.equal(a.store.has(key), false); assert.match(c.status.textContent, /expired/);
});

test("live expiry removes the saved copy without erasing current typing; a later edit starts a fresh period", () => {
  const a = fixture(); a.edit("message", "Still visible here"); a.advance(30 * 60 * 1000);
  assert.equal(a.store.has(key), false); assert.equal(a.fields.message.value, "Still visible here"); assert.match(a.status.textContent, /expired/);
  a.edit("message", "New edit"); assert.equal(JSON.parse(a.store.get(key)).expires, a.clock.time + 30 * 60 * 1000);
});

test("Clear draft resets the form and retry identity, and bfcache cannot resurrect the discarded copy", () => {
  const a = fixture(); a.edit("message", "Discard this");
  const b = fixture(a.store, a.clock); b.controller.finishRestore(); b.clickClear();
  assert.equal(b.fields.message.value, ""); assert.equal(b.fields.service.value, ""); assert.equal(b.store.has(key), false);
  assert.notEqual(b.form.dataset.submissionId, a.form.dataset.submissionId); assert.match(b.status.textContent, /cleared/);
  a.page("pageshow"); assert.equal(a.fields.message.value, ""); assert.equal(a.cleared(), 1);
  a.page("pagehide"); assert.equal(a.store.has(key), false);
});

test("confirmed-success cleanup prevents recovery even through a previous bfcache page", () => {
  const a = fixture(); a.edit("message", "A completed request");
  const b = fixture(a.store, a.clock); b.controller.finishRestore(); b.controller.forget(); b.form.reset();
  assert.equal(b.store.has(key), false);
  a.page("pageshow"); assert.equal(a.fields.message.value, ""); assert.equal(a.store.has(key), false);
});

test("native history restoration after success cannot resurrect fields when persisted is false", () => {
  const a = fixture(); a.edit("message", "Previously submitted"); a.controller.forget();
  const b = fixture(a.store, a.clock);
  // Browser restores its own field snapshot after the script initialized.
  b.fields.message.value = "Previously submitted";
  b.win.performance = { getEntriesByType: () => [{ type: "back_forward" }] };
  b.page("pageshow", false);
  assert.equal(b.fields.message.value, ""); assert.equal(b.store.has(key), false);
});

test("native history restoration cannot recover an already expired draft after initialization removed it", () => {
  const a = fixture(); a.edit("message", "Expired while browsing services");
  a.clock.time += 31 * 60 * 1000;
  const b = fixture(a.store, a.clock);
  assert.equal(b.store.has(key), false, "expired saved copy was removed during initialization");
  // A reconstructed history document receives native field values after scripts run.
  b.fields.message.value = "Expired while browsing services";
  b.win.performance = { getEntriesByType: () => [{ type: "back_forward" }] };
  b.page("pageshow", false);
  assert.equal(b.fields.message.value, ""); assert.equal(b.store.has(key), false);
  assert.match(b.status.textContent, /expired/);
});

test("ordinary initial pageshow never changes current selections or marketing consent", () => {
  const a = fixture(); a.edit("message", "Current typing before load finishes");
  a.fields.updates_opt_in.checked = true;
  a.win.performance = { getEntriesByType: () => [{ type: "navigate" }] };
  a.page("pageshow", false);
  assert.equal(a.fields.message.value, "Current typing before load finishes"); assert.equal(a.fields.updates_opt_in.checked, true);
});

test("Clear draft is inert while a request is in flight", () => {
  const a = fixture(); a.edit("message", "Pending request"); a.form.dataset.submitting = "true"; a.controller.setBusy(true);
  a.clickClear(); assert.equal(a.cleared(), 0); assert.equal(a.fields.message.value, "Pending request"); assert.equal(a.clear.disabled, true);
  assert.equal(a.store.has(key), true);
});

for (const mode of ["getter-blocked", "read-blocked", "quota"]) test(`unavailable session storage (${mode}) keeps the form usable and never falls back to persistent storage`, () => {
  const a = fixture(new Map(), { time: epoch }, mode);
  assert.doesNotThrow(() => a.edit("message", "Keep the current entry"));
  assert.equal(a.fields.message.value, "Keep the current entry");
  assert.match(a.status.textContent, /unavailable/); a.clickClear(); assert.equal(a.fields.message.value, "");
});

for (const raw of ["{broken", "null", "[]", '{"version":99}', '"x"', "x".repeat(60001)]) test(`corrupt or oversized storage is discarded safely (${raw.slice(0, 20)})`, () => {
  const store = new Map([[key, raw]]); const a = fixture(store);
  assert.equal(a.fields.message.value, ""); assert.equal(store.has(key), false);
});

for (const mutate of [r => { r.at += 60000; r.expires += 60000; }, r => { r.fields.service = "Lawn Care"; }, r => { r.fields.endpoint = "https://invalid.test"; }, r => { r.id = "invalid"; }, r => { r.intent = "__proto__"; }, r => { r.fields.message = { html: "unsafe" }; }]) test(`untrusted saved values are rejected (${mutate.toString().slice(0, 65)})`, () => {
  const a = fixture(); a.edit("message", "Original"); const record = JSON.parse(a.store.get(key)); mutate(record); a.store.set(key, JSON.stringify(record));
  const b = fixture(a.store, a.clock); assert.equal(b.fields.message.value, ""); assert.equal(a.store.has(key), false);
});

test("overlong entries are never truncated; saving fails visibly while current text remains editable", () => {
  const a = fixture(), text = "🌳".repeat(11000); a.edit("message", text);
  assert.equal(a.fields.message.value, text); assert.equal(a.store.has(key), false); assert.match(a.status.textContent, /unavailable/);
});

test("separate tab sessions do not share drafts, and empty/default forms are not saved", () => {
  const a = fixture(); a.edit("message", "This tab only"); const b = fixture();
  assert.equal(b.fields.message.value, ""); b.edit("message", ""); assert.equal(b.store.has(key), false);
});

test("a bfcache return restores the latest tab draft rather than the old document's copy", () => {
  const a = fixture(); a.edit("message", "Old version"); a.clock.time++;
  const b = fixture(a.store, a.clock); b.edit("message", "Latest version");
  a.page("pageshow"); assert.equal(a.fields.message.value, "Latest version"); assert.equal(a.synced(), 1);
});
