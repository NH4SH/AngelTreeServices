(function () {
  function initCommercialActions() {
    var actions = document.querySelector(".ats-commercial-hoa-page .ats-mobile-actions");
    var heroActions = document.querySelector(".ats-commercial-hoa-page .ats-page-hero .ats-actions");
    var header = document.querySelector(".ats-page-header");
    if (!actions || !heroActions) return;

    var heroFullyVisible = false;
    // Keep a focused quick action available until focus leaves the bar.
    actions.addEventListener("focusout", function (event) {
      actions.hidden = heroFullyVisible && !actions.contains(event.relatedTarget);
    });
    var observer;
    var headerHeight = -1;
    function observeActions() {
      var height = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      if (height === headerHeight) return;
      headerHeight = height;
      document.body.style.setProperty("--ats-commercial-anchor-offset", (height + 20) + "px");
      if (!window.IntersectionObserver) return;
      if (observer) observer.disconnect();
      observer = new window.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.target === heroActions) {
            // Both hero links must fit below the sticky header before yielding.
            heroFullyVisible = entry.isIntersecting && entry.intersectionRatio >= 1;
            actions.hidden = heroFullyVisible && !actions.contains(document.activeElement);
          }
        });
      }, { rootMargin: "-" + height + "px 0px 0px 0px", threshold: [0, 1] });
      observer.observe(heroActions);
    }

    observeActions();
    if (header && window.ResizeObserver) {
      new window.ResizeObserver(observeActions).observe(header);
    } else {
      window.addEventListener("resize", observeActions);
    }
  }

  document.addEventListener("DOMContentLoaded", initCommercialActions);
})();
