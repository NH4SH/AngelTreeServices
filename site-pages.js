(function () {
  var trackedParameters = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

  function preserveCampaignParameters() {
    var currentParameters = new URLSearchParams(window.location.search);

    document.querySelectorAll("a.ats-estimate-link").forEach(function (link) {
      var destination;

      try {
        destination = new URL(link.href, window.location.origin);
      } catch (error) {
        return;
      }

      trackedParameters.forEach(function (name) {
        var value = currentParameters.get(name);
        if (value && !destination.searchParams.has(name)) {
          destination.searchParams.set(name, value);
        }
      });

      link.href = destination.pathname + destination.search + destination.hash;
    });
  }

  function closeMobileMenuAfterNavigation() {
    var menu = document.querySelector(".ats-mobile-menu");
    if (!menu) {
      return;
    }

    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        menu.open = false;
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    preserveCampaignParameters();
    closeMobileMenuAfterNavigation();
  });
})();
