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

  function enablePrivacyEnhancedVideos() {
    document.querySelectorAll(".ats-video-facade[data-video-id]").forEach(function (facade) {
      var button = facade.querySelector(".ats-video-facade__button");
      var videoId = facade.dataset.videoId;

      if (!button || !/^[A-Za-z0-9_-]{11}$/.test(videoId || "")) {
        return;
      }

      button.addEventListener(
        "click",
        function () {
          var iframe = document.createElement("iframe");
          iframe.className = "ats-video-facade__iframe";
          iframe.src = "https://www.youtube-nocookie.com/embed/" + videoId;
          iframe.title = "NBC4 Responds report about Angel Tree Services";
          iframe.allow = "encrypted-media; picture-in-picture; web-share";
          iframe.allowFullscreen = true;
          iframe.referrerPolicy = "strict-origin-when-cross-origin";
          facade.replaceChildren(iframe);
        },
        { once: true }
      );
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    preserveCampaignParameters();
    closeMobileMenuAfterNavigation();
    enablePrivacyEnhancedVideos();
  });
})();
