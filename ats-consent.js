(function () {
  "use strict";
  var api = window.ATSWebsite;
  var panel = document.getElementById("ats-consent");
  if (!api || !panel) return;
  var key = "ats-analytics-choice-v1";
  var lifetime = 180 * 24 * 60 * 60 * 1000;
  var choice = null;
  var memoryOnly = false;
  var timer;
  var opener;
  var allow = document.getElementById("ats-consent-allow");
  var reject = document.getElementById("ats-consent-reject");
  var status = document.getElementById("ats-consent-status");
  var title = document.getElementById("ats-consent-title");
  var description = document.getElementById("ats-consent-description");
  var feedback = document.getElementById("ats-consent-feedback");
  var feedbackText = document.getElementById("ats-consent-feedback-text");
  var feedbackDismiss = document.getElementById("ats-consent-feedback-dismiss");
  var main = document.getElementById("main-content") || document.querySelector("main");
  var enabled = api.isCollectionEnabled();
  var triggers = document.querySelectorAll("[data-ats-privacy]");

  function removeStored() {
    try { window.localStorage.removeItem(key); } catch (error) { /* Optional storage. */ }
  }
  function readStored() {
    try {
      var raw = window.localStorage.getItem(key) || "null";
      var stored = JSON.parse(raw);
      var now = Date.now();
      if (stored && stored.version === 1 && (stored.value === "granted" || stored.value === "denied") &&
          Number.isFinite(stored.at) && stored.at <= now && now - stored.at < lifetime) {
        // Restore opt-in only if this browser still permits changing the choice.
        // Keep the exact record and timestamp; navigation must not renew consent.
        if (stored.value === "granted") window.localStorage.setItem(key, raw);
        return stored;
      }
      removeStored();
    } catch (error) { removeStored(); }
    return null;
  }
  function render() {
    allow.disabled = !enabled;
    description.textContent = enabled ?
      "We’d like to use Google Analytics cookies to understand visits and clicks." :
      "Google Analytics is currently disabled. We do not load it or send website analytics events. Calls and estimate requests work as usual.";
    status.hidden = enabled && !choice;
    status.textContent = !enabled ? "Analytics is off for everyone. Allowing analytics is unavailable." :
      choice ? (choice.value === "granted" ? "Analytics cookies accepted." : "Analytics cookies rejected.") :
        "Analytics stays off until you allow it.";
    if (memoryOnly && choice) status.textContent += " Your browser could not save this choice; it applies only to this page.";
    if (!enabled && choice && choice.value === "denied") status.textContent += " Your rejection is saved" + (memoryOnly ? " for this page." : " in this browser.");
  }
  function show(focus) {
    feedbackText.textContent = "";
    feedback.removeAttribute("data-warning");
    feedbackDismiss.hidden = true;
    panel.hidden = false;
    triggers.forEach(function (button) { button.setAttribute("aria-expanded", "true"); });
    if (focus) title.focus();
  }
  function restoreFocus(from) {
    if (!from.contains(document.activeElement)) return;
    var target = opener || main;
    if (target) {
      if (target === main) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  }
  function close() {
    restoreFocus(panel);
    panel.hidden = true;
    triggers.forEach(function (button) { button.setAttribute("aria-expanded", "false"); });
  }
  function apply() {
    window.clearTimeout(timer);
    api.setConsent(enabled && choice && choice.value === "granted" ? "granted" : "denied");
    if (choice) timer = window.setTimeout(refresh, Math.min(lifetime - (Date.now() - choice.at), 2147483647));
    render();
    if (enabled && !choice) show(false);
  }
  function refresh() {
    if (!memoryOnly) choice = readStored();
    else if (choice && (Date.now() < choice.at || Date.now() - choice.at >= lifetime)) choice = null;
    // Never bank an opt-in while the site-wide collection gate is closed.
    if (!enabled && choice && choice.value === "granted") { choice = null; removeStored(); }
    apply();
  }
  function choose(value) {
    if (value === "granted" && !enabled) return;
    choice = { version: 1, value: value, at: Date.now() };
    memoryOnly = false;
    try { window.localStorage.setItem(key, JSON.stringify(choice)); }
    catch (error) { memoryOnly = true; removeStored(); }
    apply();
    close();
    // Announce outside the hidden banner. A storage failure stays visibly explained.
    feedbackText.textContent = status.textContent + (memoryOnly ? "" : " Change this anytime in Privacy settings.");
    if (memoryOnly) feedback.setAttribute("data-warning", "");
    else feedback.removeAttribute("data-warning");
    feedbackDismiss.hidden = !memoryOnly;
  }
  triggers.forEach(function (button) {
    button.setAttribute("data-ready", "");
    button.addEventListener("click", function () { opener = button; refresh(); show(true); });
  });
  allow.addEventListener("click", function () { choose("granted"); });
  reject.addEventListener("click", function () { choose("denied"); });
  document.getElementById("ats-consent-close").addEventListener("click", close);
  feedbackDismiss.addEventListener("click", function () {
    restoreFocus(feedback);
    feedback.removeAttribute("data-warning");
    feedbackDismiss.hidden = true;
    feedbackText.textContent = "";
  });
  panel.addEventListener("keydown", function (event) { if (event.key === "Escape") { event.preventDefault(); close(); } });
  window.addEventListener("pageshow", refresh);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
  window.addEventListener("storage", function (event) {
    if (event.key === key || event.key === null) {
      feedbackText.textContent = "";
      feedback.removeAttribute("data-warning");
      feedbackDismiss.hidden = true;
      memoryOnly = false;
      refresh();
    }
  });
  refresh();
})();
