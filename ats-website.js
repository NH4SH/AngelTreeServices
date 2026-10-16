(function () {
  "use strict";
  if (window.ATSWebsite) return;

  // Release gates: change only after property verification and consent UX approval.
  var COLLECTION_ENABLED = false;
  var MEASUREMENT_ID = "";
  var consent = "denied";
  var ready = false;
  var loading = false;
  var pageSent = false;
  var attributionKey = "ats-attribution-v1";
  var maxAge = 30 * 60 * 1000;
  var campaignKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  var routes = ["/", "/services/", "/services/tree-removal/", "/services/tree-pruning/",
    "/services/stump-grinding/", "/services/emergency-tree-service/",
    "/services/commercial-hoa-tree-care/", "/credentials-safety/", "/projects/",
    "/about/", "/recognition/", "/privacy/", "/privacy-request/"];
  var schemas = {
    navigation_link_click: { destination: ["about", "services", "projects", "commercial", "credentials", "recognition", "contact"], navigation: ["mobile_menu", "desktop_header"] },
    phone_link_click: { location: ["contact", "hero", "mobile_actions", "site"] },
    emergency_cta_click: { location: ["homepage_guidance"] },
    estimate_cta_click: { location: ["contact", "hero", "mobile_actions", "site"] },
    service_link_click: { destination: routes },
    estimate_form_started: { form_name: ["contact"] },
    estimate_request_acknowledged: { form_name: ["contact"] },
    estimate_form_failed: { form_name: ["contact"], reason: ["network_or_server"] }
  };

  function safePath(path) {
    return routes.indexOf(path) !== -1 ? path : "/other/";
  }

  function command() {
    try { window.gtag.apply(window, arguments); } catch (error) { /* Measurement is optional. */ }
  }

  function pageView() {
    if (pageSent || !ready || consent !== "granted") return;
    pageSent = true;
    command("event", "page_view", {
      page_location: "https://angeltreeservices.org" + safePath(window.location.pathname),
      page_title: safePath(window.location.pathname),
      page_referrer: ""
    });
  }

  function initializeCollection() {
    if (!COLLECTION_ENABLED || !/^G-[A-Z0-9]+$/.test(MEASUREMENT_ID) || consent !== "granted") return;
    if (ready) { pageView(); return; }
    if (loading) return;
    loading = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    command("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + MEASUREMENT_ID;
    script.onload = function () {
      loading = false;
      if (consent !== "granted") return;
      ready = true;
      command("consent", "update", { analytics_storage: "granted" });
      command("js", new Date());
      // Suppress implicit page views; never allow raw location, title or referrer.
      command("config", MEASUREMENT_ID, { send_page_view: false, allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_location: "https://angeltreeservices.org" + safePath(window.location.pathname),
        page_title: safePath(window.location.pathname), page_referrer: "" });
      pageView();
    };
    script.onerror = function () { loading = false; script.remove(); };
    document.head.appendChild(script);
  }

  function forgetAttribution() {
    try { window.sessionStorage.removeItem(attributionKey); } catch (error) { /* Storage may be unavailable. */ }
  }

  function setConsent(value) {
    consent = value === "granted" ? "granted" : "denied";
    if (MEASUREMENT_ID) window["ga-disable-" + MEASUREMENT_ID] = consent !== "granted";
    if (consent !== "granted") {
      forgetAttribution();
      if (ready) command("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      return;
    }
    // Consent is intentionally not persisted. Approved consent UI must restore it per page.
    getAttribution();
    if (ready) command("consent", "update", { analytics_storage: "granted" });
    initializeCollection();
  }

  function track(name, parameters) {
    if (!COLLECTION_ENABLED || consent !== "granted" || !ready || !Object.prototype.hasOwnProperty.call(schemas, name)) return;
    var clean = {};
    Object.keys(schemas[name]).forEach(function (key) {
      var value = parameters && parameters[key];
      if (schemas[name][key].indexOf(value) !== -1) clean[key] = value;
    });
    command("event", name, clean);
  }

  function currentCampaign() {
    var values = {};
    try {
      var params = new URLSearchParams(window.location.search);
      campaignKeys.forEach(function (key) {
        var value = params.get(key);
        // Bounded operational attribution only. Never passed to analytics.
        if (value && value.length <= 120 && /^[a-zA-Z0-9 _.-]+$/.test(value)) values[key] = value;
      });
    } catch (error) { /* Use empty attribution. */ }
    return values;
  }

  function getAttribution() {
    var current = currentCampaign();
    if (consent !== "granted") return current;
    try {
      var now = Date.now();
      if (Object.keys(current).length) {
        window.sessionStorage.setItem(attributionKey, JSON.stringify({ at: now, values: current }));
        return current;
      }
      var stored = JSON.parse(window.sessionStorage.getItem(attributionKey) || "null");
      if (!stored || !Number.isFinite(stored.at) || now < stored.at || now - stored.at >= maxAge) {
        forgetAttribution();
        return {};
      }
      var clean = {};
      campaignKeys.forEach(function (key) {
        var value = stored.values && stored.values[key];
        if (typeof value === "string" && value.length <= 120 && /^[a-zA-Z0-9 _.-]+$/.test(value)) clean[key] = value;
      });
      return clean;
    } catch (error) { return current; }
  }

  function preserveEstimateAttribution() {
    var campaign = getAttribution();
    document.querySelectorAll("a.ats-estimate-link").forEach(function (link) {
      try {
        var destination = new URL(link.href, window.location.origin);
        if (destination.origin !== window.location.origin) return;
        campaignKeys.forEach(function (key) {
          if (campaign[key] && !destination.searchParams.has(key)) destination.searchParams.set(key, campaign[key]);
        });
        link.href = destination.pathname + destination.search + destination.hash;
      } catch (error) { /* Keep navigation functional. */ }
    });
  }

  function clickLocation(link) {
    return link.closest(".ats-mobile-actions") ? "mobile_actions" : link.closest("#contact") ? "contact" :
      link.closest("#top, .ats-page-hero") ? "hero" : "site";
  }

  function trackClick(event) {
    var target = event.target;
    var link = target && target.closest && target.closest("a");
    if (!link) return;
    var location = clickLocation(link);
    if (link.dataset.atsNav) track("navigation_link_click", {
      destination: link.dataset.atsNav,
      navigation: link.closest(".ats-home-mobile-menu, .ats-mobile-menu") ? "mobile_menu" : "desktop_header"
    });
    if (link.classList.contains("ats-emergency-call")) {
      track("emergency_cta_click", { location: "homepage_guidance" });
    } else if (link.matches('a[href^="tel:"]')) {
      track("phone_link_click", { location: location });
    }
    try {
      var destination = new URL(link.href, window.location.origin);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === "/" && destination.hash === "#contact") track("estimate_cta_click", { location: location });
      if (destination.pathname.indexOf("/services/") === 0 && routes.indexOf(destination.pathname) !== -1) {
        track("service_link_click", { destination: destination.pathname });
      }
    } catch (error) { /* Ignore unsupported links. */ }
  }

  window.ATSWebsite = { track: track, setConsent: setConsent, getAttribution: getAttribution };
  document.addEventListener("DOMContentLoaded", function () {
    preserveEstimateAttribution();
    document.addEventListener("click", trackClick);
  });
})();
