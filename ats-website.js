(function () {
  "use strict";
  if (window.ATSWebsite) return;

  // Release gates: change only after property verification and consent UX approval.
  var COLLECTION_ENABLED = true;
  var MEASUREMENT_ID = "G-8WMD200TXP";
  var consent = "denied";
  var ready = false;
  var loading = false;
  var libraryLoaded = false;
  var pageSent = false;
  var attributionKey = "ats-attribution-v1";
  var maxAge = 30 * 60 * 1000;
  var campaignKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  var routes = ["/", "/services/", "/services/tree-removal/", "/services/tree-pruning/",
    "/services/stump-grinding/", "/services/emergency-tree-service/",
    "/services/commercial-hoa-tree-care/", "/services/landscaping/",
    "/credentials-safety/", "/projects/", "/projects/hollow-tree-removal/",
    "/about/", "/recognition/", "/privacy/", "/privacy-request/"];
  // Minimal public-site launch: only phone and estimate intent are custom events.
  // Google also supplies its own basic session/engagement events after consent.
  var schemas = {
    phone_link_click: { location: ["contact", "hero", "mobile_actions", "site"] },
    estimate_cta_click: { location: ["contact", "hero", "mobile_actions", "site"] }
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
      send_to: MEASUREMENT_ID,
      page_location: "https://angeltreeservices.org" + safePath(window.location.pathname),
      page_title: safePath(window.location.pathname),
      page_referrer: ""
    });
  }

  function configureCollection() {
    if (!libraryLoaded || ready || consent !== "granted") return;
    ready = true;
    command("consent", "update", { analytics_storage: "granted" });
    command("js", new Date());
    // Suppress implicit page views; never allow raw location, title or referrer.
    command("config", MEASUREMENT_ID, { send_page_view: false, allow_google_signals: false,
      cookie_domain: "none", cookie_path: "/", cookie_expires: 180 * 24 * 60 * 60, cookie_update: false,
      allow_ad_personalization_signals: false,
      page_location: "https://angeltreeservices.org" + safePath(window.location.pathname),
      page_title: safePath(window.location.pathname), page_referrer: "" });
    pageView();
  }

  function initializeCollection() {
    if (!COLLECTION_ENABLED || !/^G-[A-Z0-9]+$/.test(MEASUREMENT_ID) || consent !== "granted") return;
    if (ready) { pageView(); return; }
    if (libraryLoaded) { configureCollection(); return; }
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
      libraryLoaded = true;
      configureCollection();
    };
    script.onerror = function () { loading = false; script.remove(); };
    document.head.appendChild(script);
  }

  function forgetAttribution() {
    try { window.sessionStorage.removeItem(attributionKey); } catch (error) { /* Storage may be unavailable. */ }
  }

  function clearAnalyticsCookies() {
    // Only this public site's GA cookies; never clear arbitrary cookies or storage.
    var suffix = (MEASUREMENT_ID || "G-8WMD200TXP").replace(/^G-/, "");
    var host = window.location.hostname;
    ["_ga", "_ga_" + suffix].forEach(function (name) {
      ["", host, host && "." + host].forEach(function (domain) {
        try { document.cookie = name + "=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" +
          (domain ? "; domain=" + domain : "") + "; SameSite=Lax"; } catch (error) { /* Browser policy may restrict cookies. */ }
      });
    });
  }

  function setConsent(value) {
    consent = value === "granted" ? "granted" : "denied";
    if (MEASUREMENT_ID) window["ga-disable-" + MEASUREMENT_ID] = consent !== "granted";
    if (consent !== "granted") {
      forgetAttribution();
      clearAnalyticsCookies();
      if (ready) command("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      return;
    }
    // The public consent controls restore an unexpired browser choice per page.
    getAttribution();
    if (ready) command("consent", "update", { analytics_storage: "granted" });
    initializeCollection();
  }

  function track(name, parameters) {
    if (!COLLECTION_ENABLED || consent !== "granted" || !ready || !Object.prototype.hasOwnProperty.call(schemas, name)) return;
    var clean = { send_to: MEASUREMENT_ID };
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
    if (link.matches('a[href^="tel:"]')) {
      track("phone_link_click", { location: location });
    }
    try {
      var destination = new URL(link.href, window.location.origin);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === "/" && destination.hash === "#contact") track("estimate_cta_click", { location: location });
    } catch (error) { /* Ignore unsupported links. */ }
  }

  window.ATSWebsite = { track: track, setConsent: setConsent, getAttribution: getAttribution,
    isCollectionEnabled: function () { return COLLECTION_ENABLED && /^G-[A-Z0-9]+$/.test(MEASUREMENT_ID); } };
  document.addEventListener("DOMContentLoaded", function () {
    preserveEstimateAttribution();
    document.addEventListener("click", trackClick);
  });
})();
