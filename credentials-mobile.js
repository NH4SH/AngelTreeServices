(function () {
  function initCredentialsActions() {
    var actions = document.querySelector(".ats-credentials-page .ats-mobile-actions");
    var pairs = document.querySelectorAll(".ats-credentials-page :is(.ats-page-hero, .ats-final-cta) .ats-actions");
    var header = document.querySelector(".ats-page-header");
    if (!actions || !pairs.length) return;

    var visiblePairs = new Set();
    function updateActions(nextFocus) {
      var consentPanel = document.getElementById("ats-consent");
      // IntersectionObserver does not detect buttons covered by the cookie panel.
      var consentOpen = consentPanel && !consentPanel.hidden;
      actions.hidden = visiblePairs.size > 0 && !consentOpen && !actions.contains(nextFocus);
    }
    // Never remove a quick action while someone is using it with a keyboard.
    actions.addEventListener("focusout", function (event) {
      updateActions(event.relatedTarget);
    });

    function measureBar() {
      var height = Math.ceil(actions.getBoundingClientRect().height);
      if (height > 0) {
        document.documentElement.style.setProperty("--ats-credentials-bar-space", (height + 20) + "px");
      }
    }

    var observer;
    var headerHeight = -1;
    function observeActions() {
      var measured = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      var position = header ? window.getComputedStyle(header).position : "static";
      var height = position === "sticky" || position === "fixed" ? measured : 0;
      // A scrolling header still occupies room above its open menu.
      document.documentElement.style.setProperty("--ats-credentials-menu-offset", (measured + 20) + "px");
      if (height === headerHeight) return;
      headerHeight = height;
      document.documentElement.style.setProperty("--ats-credentials-header-offset", (height + 20) + "px");
      if (!window.IntersectionObserver || !window.MutationObserver) return;
      if (observer) observer.disconnect();
      visiblePairs.clear();
      updateActions(document.activeElement);
      observer = new window.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          // Yield only when the complete action pair fits below the header.
          if (entry.isIntersecting && entry.intersectionRatio >= 1) {
            visiblePairs.add(entry.target);
          } else {
            visiblePairs.delete(entry.target);
          }
        });
        updateActions(document.activeElement);
      }, { rootMargin: "-" + height + "px 0px 0px 0px", threshold: [0, 1] });
      pairs.forEach(function (pair) { observer.observe(pair); });
    }

    observeActions();
    measureBar();
    if (window.MutationObserver) {
      new window.MutationObserver(function (records) {
        if (records.some(function (record) {
          return record.type === "childList" || record.target.id === "ats-consent";
        })) {
          updateActions(document.activeElement);
        }
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    }
    if (window.ResizeObserver) {
      var resize = new window.ResizeObserver(function () {
        observeActions();
        measureBar();
      });
      if (header) resize.observe(header);
      resize.observe(actions);
    }
    // Short-screen CSS can change header positioning without changing its size.
    window.addEventListener("resize", function () {
      observeActions();
      measureBar();
    });
  }

  document.addEventListener("DOMContentLoaded", initCredentialsActions);
})();
