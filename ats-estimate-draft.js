(function (factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else window.ATSEstimateDrafts = factory();
})(function () {
  "use strict";
  var key = "ats.estimate-draft.v1";
  var clearedKey = "ats.estimate-draft-cleared.v1";
  var ttl = 30 * 60 * 1000;
  // Customer fields only. Never retain marketing consent, honeypots, attribution,
  // endpoint URLs, server responses, or arbitrary hidden controls.
  var textNames = ["name", "phone", "email", "address", "message", "commercial_name"];
  var choiceNames = ["service", "customer_type", "property_scope", "preferred_contact_method"];
  var names = textNames.concat(choiceNames, ["hazard_present"]);
  var own = function (object, name) { return Object.prototype.hasOwnProperty.call(object, name); };

  function create(form, hooks, environment) {
    var win = environment || window;
    var panel = form.querySelector("[data-estimate-draft]");
    var status = form.querySelector("[data-draft-status]");
    var clear = form.querySelector("[data-draft-clear]");
    if (!panel || !status || !clear) return null;
    var storage, unavailable = false, active = null, timer = null, lastSaved = 0;
    hooks = hooks || {};
    function now() { return (win.Date || Date).now(); }
    try { storage = win.sessionStorage; if (!storage) unavailable = true; }
    catch (error) { unavailable = true; }
    function field(name) { return form.querySelector('[name="' + name + '"]'); }
    function controls(name) { return Array.prototype.slice.call(form.querySelectorAll('[name="' + name + '"]')); }
    function value(name) {
      var node = field(name);
      if (!node) return "";
      if (node.type === "checkbox") return !!node.checked;
      if (node.type === "radio") return (controls(name).filter(function (item) { return item.checked; })[0] || {}).value || "";
      return node.value;
    }
    function knownChoice(name, input) {
      var node = field(name);
      var options = node && node.options ? Array.prototype.slice.call(node.options) : controls(name);
      return typeof input === "string" && options.some(function (option) { return option.value === input; });
    }
    function notice(message, canClear) {
      panel.hidden = !message;
      if (status.textContent !== message) status.textContent = message;
      clear.hidden = !canClear;
      clear.disabled = form.dataset.submitting === "true";
    }
    function remove() {
      if (!storage) return;
      try { storage.removeItem(key); }
      catch (error) { unavailable = true; }
    }
    function stopTimer() { if (timer !== null) win.clearTimeout(timer); timer = null; }
    function forget() {
      remove(); stopTimer(); active = null;
      // A non-personal tombstone prevents an older bfcache document from
      // resurrecting fields after Clear draft or a successful request.
      try { if (storage) storage.setItem(clearedKey, String(now())); }
      catch (error) { unavailable = true; }
    }
    function valid(record) {
      if (!record || record.version !== 1 || !record.fields || Array.isArray(record.fields) || typeof record.fields !== "object") return false;
      if (!Number.isFinite(record.at) || record.at > now() + 1000 || record.expires !== record.at + ttl) return false;
      if (typeof record.id !== "string" || !/^(?:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|website-\d{13}-[a-z0-9]{1,12})$/i.test(record.id)) return false;
      if (typeof record.started !== "string" || !/^\d{13}$/.test(record.started) || Number(record.started) > now() + 1000) return false;
      if (!Object.keys(record.fields).every(function (name) { return names.indexOf(name) !== -1; })) return false;
      if (!names.every(function (name) {
        if (!own(record.fields, name)) return false;
        var input = record.fields[name];
        if (textNames.indexOf(name) !== -1) return typeof input === "string" && input.length <= 20000;
        if (name === "hazard_present") return typeof input === "boolean";
        return knownChoice(name, input);
      })) return false;
      var picker = form.querySelector("[data-estimate-intent]");
      return typeof record.intent === "string" && (record.intent === "" || !!picker && Array.prototype.some.call(picker.options, function (option) { return option.value === record.intent; }));
    }
    function read() {
      if (unavailable) return { kind: "unavailable" };
      var raw;
      try { raw = storage.getItem(key); }
      catch (error) { unavailable = true; return { kind: "unavailable" }; }
      try {
        if (!raw) return { kind: "missing" };
        if (raw.length > 60000) { remove(); return { kind: "invalid" }; }
        var record = JSON.parse(raw);
        if (!valid(record)) { remove(); return { kind: "invalid" }; }
        if (record.expires <= now()) { remove(); return { kind: "expired" }; }
        return { kind: "valid", record: record };
      } catch (error) {
        // Bad JSON is disposable; a blocked storage API must not block sending.
        remove();
        return { kind: unavailable ? "unavailable" : "invalid" };
      }
    }
    function meaningful(fields) {
      return names.some(function (name) {
        if (name === "customer_type") return fields[name] !== "Homeowner";
        return !!fields[name];
      });
    }
    function snapshot(at) {
      var fields = {};
      names.forEach(function (name) { fields[name] = value(name); });
      var picker = form.querySelector("[data-estimate-intent]");
      return { version: 1, at: at, expires: at + ttl, fields: fields,
        intent: picker && !picker.disabled && form.dataset.estimateContextAvailable === "true" ? picker.value : "",
        id: form.dataset.submissionId, started: form.dataset.formStartedAt };
    }
    function schedule() {
      stopTimer();
      if (!active) return;
      timer = win.setTimeout(function () {
        if (active && active.expires <= now()) {
          forget();
          notice("Saved draft expired. Your current entries are still here.", true);
        }
      }, Math.max(1, active.expires - now()));
    }
    function save(edited) {
      var record = snapshot(edited || !active ? now() : active.at);
      if (!meaningful(record.fields)) { forget(); notice("", false); return; }
      if (unavailable || !valid(record) || JSON.stringify(record).length > 60000) {
        remove(); active = null; stopTimer();
        notice("Draft recovery is unavailable for these entries. Keep this page open until you send.", true);
        return;
      }
      if (record.expires <= now()) { forget(); return; }
      try {
        storage.setItem(key, JSON.stringify(record));
        active = record; lastSaved = record.at; schedule();
        notice("Draft saved in this tab. It expires after 30 minutes without edits.", true);
      } catch (error) {
        unavailable = true; remove(); active = null; stopTimer();
        notice("Draft recovery is unavailable in this tab. Keep this page open until you send.", true);
      }
    }
    function restore(record) {
      names.forEach(function (name) {
        var node = field(name), input = record.fields[name];
        if (!node) return;
        if (node.type === "checkbox") node.checked = input;
        else if (node.type === "radio") controls(name).forEach(function (item) { item.checked = item.value === input; });
        else node.value = input;
      });
      // Consent is deliberately not recovered from storage or old bfcache state.
      var consent = field("updates_opt_in");
      if (consent) consent.checked = false;
      var picker = form.querySelector("[data-estimate-intent]");
      if (picker) picker.value = record.intent;
      form.dataset.estimateContextAvailable = record.intent ? "true" : "";
      form.dataset.submissionId = record.id;
      form.dataset.formStartedAt = record.started;
      active = record; lastSaved = record.at; schedule();
    }
    var initial = read();
    var expiredOnLoad = initial.kind === "expired";
    if (initial.kind === "valid") restore(initial.record);
    else if (initial.kind === "expired") notice("Your saved draft expired. Please start a new request.", false);

    function finishRestore() {
      if (!active) return;
      // The existing URL prefill runs after restoration. Explicit estimate links
      // still select their service, without rewriting customer-entered details.
      save(false);
      if (active) notice("Your draft was restored in this tab. It expires after 30 minutes without edits.", true);
    }
    form.addEventListener("input", function (event) {
      if (event.target && (names.indexOf(event.target.name) !== -1 || event.target.hasAttribute("data-estimate-intent"))) save(true);
    });
    form.addEventListener("change", function (event) {
      if (event.target && (names.indexOf(event.target.name) !== -1 || event.target.hasAttribute("data-estimate-intent"))) save(true);
    });
    form.addEventListener("reset", function () { forget(); notice("", false); });
    clear.addEventListener("click", function () {
      if (form.dataset.submitting === "true") return;
      forget();
      if (hooks.clearForm) hooks.clearForm();
      notice("Draft cleared.", false);
    });
    win.addEventListener("pagehide", function () { if (active) save(false); stopTimer(); });
    win.addEventListener("pageshow", function (event) {
      var fromHistory = event.persisted;
      // Some browsers reconstruct a history document and restore native field
      // values without using bfcache (persisted is then false).
      try {
        if (!fromHistory && win.performance) {
          fromHistory = typeof win.performance.getEntriesByType === "function" &&
            win.performance.getEntriesByType("navigation").some(function (entry) { return entry.type === "back_forward"; });
          if (!fromHistory && win.performance.navigation) fromHistory = win.performance.navigation.type === 2;
        }
      } catch (error) { /* The persisted flag remains a usable fallback. */ }
      // Native history values can arrive after initialization already removed
      // an expired record. Carry that expiry through this first pageshow.
      var expired = expiredOnLoad;
      expiredOnLoad = false;
      if (!fromHistory) return;
      var latest = read();
      expired = expired || latest.kind === "expired";
      if (latest.kind === "valid") {
        restore(latest.record);
        if (hooks.syncForm) hooks.syncForm();
        finishRestore();
      } else if (!unavailable) {
        var clearedAt = 0;
        try { clearedAt = Number(storage.getItem(clearedKey)); } catch (error) { /* Keep current fields when storage is unavailable. */ return; }
        var nativeDraft = lastSaved || meaningful(snapshot(now()).fields);
        if (nativeDraft && (expired || clearedAt > 0 && (!lastSaved || clearedAt >= lastSaved))) {
          forget();
          if (hooks.clearForm) hooks.clearForm();
          notice(expired ? "Your saved draft expired. Please start a new request." : "Draft cleared.", false);
          lastSaved = 0;
        }
      }
    });
    return {
      finishRestore: finishRestore,
      save: function () { save(true); },
      forget: function () { forget(); notice("", false); },
      setBusy: function (busy) { clear.disabled = busy; }
    };
  }
  return { create: create };
});
