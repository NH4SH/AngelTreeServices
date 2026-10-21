(function () {
  function initStumpActions() {
    var actions = document.querySelector(".ats-stump-grinding-page .ats-mobile-actions");
    var heroActions = document.querySelector(".ats-stump-grinding-page .ats-page-hero .ats-actions");
    var header = document.querySelector(".ats-page-header");
    if (!actions || !heroActions) return;

    var observer;
    var headerHeight = -1;
    function observeActions() {
      var height = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      if (height === headerHeight) return;
      headerHeight = height;
      document.body.style.setProperty("--ats-stump-anchor-offset", (height + 20) + "px");
      if (!window.IntersectionObserver) return;
      if (observer) observer.disconnect();
      observer = new window.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.target === heroActions) {
            // Both hero links must fit below the sticky header before yielding.
            actions.hidden = entry.isIntersecting && entry.intersectionRatio >= 1;
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

  document.addEventListener("DOMContentLoaded", initStumpActions);
})();
