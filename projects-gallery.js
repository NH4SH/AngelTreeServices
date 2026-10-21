(function () {
  "use strict";

  function initGallery() {
    var gallery = document.querySelector("[data-project-gallery]");
    if (!gallery) return;
    var cards = Array.from(gallery.querySelectorAll("[data-gallery-card]"));
    var filters = Array.from(gallery.querySelectorAll("[data-gallery-filter]"));
    var count = gallery.querySelector("[data-gallery-count]");
    var dialog = gallery.querySelector("[data-gallery-viewer]");
    var activeFilter = "all";
    var currentCard = null;
    var opener = null;
    var currentImage = null;

    function visibleCards() {
      return cards.filter(function (card) { return !card.hidden; });
    }

    filters.forEach(function (button) {
      button.addEventListener("click", function () {
        activeFilter = button.dataset.galleryFilter;
        cards.forEach(function (card) {
          card.hidden = activeFilter !== "all" && card.dataset.galleryServices.split(" ").indexOf(activeFilter) < 0;
        });
        filters.forEach(function (filter) {
          filter.setAttribute("aria-pressed", String(filter === button));
        });
        count.textContent = visibleCards().length + (activeFilter === "all" ? " project photos" : activeFilter === "tree" ? " tree service photos" : " landscaping photos");
      });
    });
    gallery.querySelector("[data-gallery-filters]").hidden = false;

    // Full-size image links remain useful if the native dialog is unavailable.
    if (!dialog || typeof dialog.showModal !== "function") return;
    var title = dialog.querySelector("[data-gallery-title]");
    var caption = dialog.querySelector("[data-gallery-description]");
    var position = dialog.querySelector("[data-gallery-position]");
    var media = dialog.querySelector("[data-gallery-media]");
    var status = dialog.querySelector("[data-gallery-load-status]");
    var request = dialog.querySelector("[data-gallery-request]");
    var original = dialog.querySelector("[data-gallery-original]");

    function showPhoto(card) {
      currentCard = card;
      var photoLink = card.querySelector("[data-gallery-photo]");
      var thumbnail = photoLink.querySelector("img");
      var estimate = card.querySelector("[data-gallery-estimate]");
      var visible = visibleCards();
      title.textContent = card.querySelector("h2").textContent;
      caption.textContent = card.querySelector("[data-gallery-caption]").textContent;
      position.textContent = "Photo " + (visible.indexOf(card) + 1) + " of " + visible.length + ": " + title.textContent;
      request.href = estimate.href;
      request.textContent = estimate.textContent;
      original.href = photoLink.href;
      status.textContent = "Loading photo…";
      var image = document.createElement("img");
      currentImage = image;
      image.alt = thumbnail.alt;
      image.width = thumbnail.width;
      image.height = thumbnail.height;
      image.addEventListener("load", function () {
        if (currentImage === image) status.textContent = "";
      }, { once: true });
      image.addEventListener("error", function () {
        if (currentImage === image) status.textContent = "This photo could not load. Try the full-size photo link, or choose another photo.";
      }, { once: true });
      media.replaceChildren(image);
      image.src = photoLink.href;
    }

    function move(step) {
      var visible = visibleCards();
      if (!visible.length) return;
      showPhoto(visible[(visible.indexOf(currentCard) + step + visible.length) % visible.length]);
    }

    cards.forEach(function (card) {
      var link = card.querySelector("[data-gallery-photo]");
      link.setAttribute("aria-haspopup", "dialog");
      link.addEventListener("click", function (event) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        showPhoto(card);
        try { dialog.showModal(); } catch (_) { return; }
        opener = link;
        document.body.classList.add("ats-gallery-open");
        event.preventDefault();
      });
    });
    dialog.querySelector("[data-gallery-close]").addEventListener("click", function () { dialog.close(); });
    dialog.querySelector("[data-gallery-previous]").addEventListener("click", function () { move(-1); });
    dialog.querySelector("[data-gallery-next]").addEventListener("click", function () { move(1); });
    dialog.addEventListener("keydown", function (event) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }
    });
    dialog.addEventListener("click", function (event) {
      if (event.target !== dialog) return;
      var box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    // Native modal behavior contains focus and handles Escape. Restore the exact
    // photo link after any close path, including Escape and backdrop dismissal.
    dialog.addEventListener("close", function () {
      document.body.classList.remove("ats-gallery-open");
      currentImage = null;
      media.replaceChildren();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initGallery);
  else initGallery();
})();
