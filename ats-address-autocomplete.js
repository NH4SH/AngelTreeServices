(function () {
  "use strict";

  var apiKey = "__ATS_GOOGLE_MAPS_API_KEY__";
  var addressSelector = '.ats-contact-form input[name="address"]';
  var fredericksburgBias = {
    center: { lat: 38.3032, lng: -77.4605 },
    radius: 50000,
  };
  var placesLibraryPromise = null;

  if (!apiKey || apiKey === "__ATS_GOOGLE_MAPS_API_KEY__") {
    return;
  }

  function loadPlacesLibrary() {
    if (window.google && window.google.maps && typeof window.google.maps.importLibrary === "function") {
      return window.google.maps.importLibrary("places");
    }

    if (placesLibraryPromise) {
      return placesLibraryPromise;
    }

    placesLibraryPromise = new Promise(function (resolve, reject) {
      var callbackName = "__atsGoogleMapsReady";
      var script = document.createElement("script");
      var timeout = window.setTimeout(function () {
        cleanup();
        reject(new Error("Google Maps took too long to load."));
      }, 10000);

      function cleanup() {
        window.clearTimeout(timeout);
        try {
          delete window[callbackName];
        } catch (error) {
          window[callbackName] = undefined;
        }
      }

      window[callbackName] = function () {
        if (!window.google || !window.google.maps || typeof window.google.maps.importLibrary !== "function") {
          cleanup();
          reject(new Error("Google Places is unavailable."));
          return;
        }

        window.google.maps
          .importLibrary("places")
          .then(function (library) {
            cleanup();
            resolve(library);
          })
          .catch(function (error) {
            cleanup();
            reject(error);
          });
      };

      script.async = true;
      script.defer = true;
      script.src =
        "https://maps.googleapis.com/maps/api/js?key=" +
        encodeURIComponent(apiKey) +
        "&v=weekly&loading=async&callback=" +
        callbackName;
      script.onerror = function () {
        cleanup();
        reject(new Error("Google Maps could not load."));
      };
      document.head.appendChild(script);
    });

    return placesLibraryPromise;
  }

  function addStyles() {
    if (document.getElementById("ats-address-autocomplete-styles")) {
      return;
    }

    var style = document.createElement("style");
    style.id = "ats-address-autocomplete-styles";
    style.textContent =
      ".ats-address-suggestions{position:fixed;z-index:2147483000;background:#fff;border:1px solid rgba(21,65,42,.2);border-radius:12px;box-shadow:0 14px 36px rgba(15,45,29,.16);overflow:auto;padding:6px;color:#173d29;}" +
      ".ats-address-suggestion{appearance:none;width:100%;border:0;background:transparent;color:inherit;display:block;text-align:left;padding:10px 12px;border-radius:8px;cursor:pointer;font:inherit;line-height:1.25;}" +
      ".ats-address-suggestion:hover,.ats-address-suggestion.is-active{background:#eef5ef;}" +
      ".ats-address-suggestion strong,.ats-address-suggestion small{display:block;}" +
      ".ats-address-suggestion strong{font-weight:700;}" +
      ".ats-address-suggestion small{margin-top:3px;color:#52675b;font-size:.86em;}" +
      ".ats-address-attribution{display:flex;justify-content:flex-end;align-items:center;padding:6px 9px 5px;border-top:1px solid rgba(21,65,42,.1);}" +
      ".ats-address-attribution img{display:block;width:120px;height:14px;object-fit:contain;}" +
      ".ats-address-status{display:block;margin-top:6px;font-size:.82rem;line-height:1.35;color:#52675b;}";
    document.head.appendChild(style);
  }

  function formatAddressComponent(components, type, shortName) {
    var component = (components || []).find(function (item) {
      return Array.isArray(item.types) && item.types.indexOf(type) !== -1;
    });

    if (!component) {
      return "";
    }

    if (shortName) {
      return component.shortText || component.short_name || component.longText || component.long_name || "";
    }

    return component.longText || component.long_name || component.shortText || component.short_name || "";
  }

  function normalizeSelectedAddress(place) {
    var components = place.addressComponents || [];
    var streetNumber = formatAddressComponent(components, "street_number", false);
    var route = formatAddressComponent(components, "route", false);
    var premise = formatAddressComponent(components, "premise", false);
    var street = [streetNumber, route].filter(Boolean).join(" ").trim() || premise;
    var city =
      formatAddressComponent(components, "locality", false) ||
      formatAddressComponent(components, "postal_town", false) ||
      formatAddressComponent(components, "sublocality_level_1", false) ||
      formatAddressComponent(components, "administrative_area_level_2", false);
    var state = formatAddressComponent(components, "administrative_area_level_1", true).toUpperCase();
    var postalCode = formatAddressComponent(components, "postal_code", false);

    if (street && city && state) {
      return [street, city, state + (postalCode ? " " + postalCode : "")].join(", ");
    }

    return String(place.formattedAddress || "").replace(/,\s*USA\s*$/i, "").trim();
  }

  function createStatus(input) {
    var container = input.closest(".form-item") || input.parentElement;
    if (!container) {
      return null;
    }

    var existing = container.querySelector(".ats-address-status");
    if (existing) {
      return existing;
    }

    var status = document.createElement("small");
    status.className = "ats-address-status";
    status.setAttribute("role", "status");
    status.hidden = true;
    container.appendChild(status);
    return status;
  }

  function enhanceAddressInput(input) {
    if (!input || input.dataset.atsAddressAutocomplete === "true") {
      return;
    }

    input.dataset.atsAddressAutocomplete = "true";
    input.setAttribute("autocomplete", "street-address");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");

    var status = createStatus(input);
    var popup = null;
    var suggestions = [];
    var activeIndex = -1;
    var requestId = 0;
    var debounceTimer = null;
    var library = null;
    var sessionToken = null;
    var focused = false;

    function setStatus(message) {
      if (!status) {
        return;
      }
      status.textContent = message || "";
      status.hidden = !message;
    }

    function closePopup() {
      suggestions = [];
      activeIndex = -1;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      if (popup) {
        popup.remove();
        popup = null;
      }
    }

    function positionPopup() {
      if (!popup) {
        return;
      }

      var rect = input.getBoundingClientRect();
      var margin = 10;
      var gap = 6;
      var availableBelow = window.innerHeight - rect.bottom - margin;
      var availableAbove = rect.top - margin;
      var openAbove = availableBelow < 190 && availableAbove > availableBelow;
      var width = Math.min(Math.max(rect.width, 280), window.innerWidth - margin * 2);
      var left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);

      popup.style.left = left + "px";
      popup.style.width = width + "px";
      popup.style.maxHeight = Math.max(140, (openAbove ? availableAbove : availableBelow) - gap) + "px";
      popup.style.top = openAbove ? "auto" : rect.bottom + gap + "px";
      popup.style.bottom = openAbove ? window.innerHeight - rect.top + gap + "px" : "auto";
    }

    function renderPopup() {
      closePopup();
      if (!focused || !suggestions.length) {
        return;
      }

      popup = document.createElement("div");
      popup.className = "ats-address-suggestions";
      popup.id = (input.id || "ats-address") + "-suggestions";
      popup.setAttribute("role", "listbox");
      input.setAttribute("aria-controls", popup.id);
      input.setAttribute("aria-expanded", "true");

      suggestions.forEach(function (prediction, index) {
        var button = document.createElement("button");
        var strong = document.createElement("strong");
        var small = document.createElement("small");
        var mainText = prediction.mainText && prediction.mainText.text;
        var secondaryText = prediction.secondaryText && prediction.secondaryText.text;

        button.type = "button";
        button.className = "ats-address-suggestion";
        button.id = popup.id + "-" + index;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", "false");
        strong.textContent = mainText || (prediction.text && prediction.text.text) || "Address";
        button.appendChild(strong);

        if (secondaryText) {
          small.textContent = secondaryText;
          button.appendChild(small);
        }

        button.addEventListener("mouseenter", function () {
          setActiveIndex(index);
        });
        button.addEventListener("mousedown", function (event) {
          event.preventDefault();
        });
        button.addEventListener("click", function () {
          selectPrediction(prediction);
        });
        popup.appendChild(button);
      });

      var attribution = document.createElement("div");
      var attributionImage = document.createElement("img");
      attribution.className = "ats-address-attribution";
      attribution.setAttribute("aria-label", "Powered by Google");
      attributionImage.alt = "Powered by Google";
      attributionImage.width = 120;
      attributionImage.height = 14;
      attributionImage.src = "https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png";
      attribution.appendChild(attributionImage);
      popup.appendChild(attribution);

      document.body.appendChild(popup);
      positionPopup();
    }

    function setActiveIndex(index) {
      if (!popup || !suggestions.length) {
        return;
      }

      activeIndex = Math.max(0, Math.min(index, suggestions.length - 1));
      Array.prototype.forEach.call(popup.querySelectorAll(".ats-address-suggestion"), function (button, buttonIndex) {
        var isActive = buttonIndex === activeIndex;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
      });
      input.setAttribute("aria-activedescendant", popup.id + "-" + activeIndex);
    }

    function selectPrediction(prediction) {
      closePopup();
      setStatus("Finding the full address…");

      Promise.resolve(prediction.toPlace())
        .then(function (place) {
          return place
            .fetchFields({ fields: ["addressComponents", "formattedAddress"] })
            .then(function () {
              return place;
            });
        })
        .then(function (place) {
          var address = normalizeSelectedAddress(place);
          if (!address) {
            throw new Error("No usable address was returned.");
          }

          input.value = address;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          sessionToken = null;
          setStatus("");
        })
        .catch(function () {
          sessionToken = null;
          setStatus("Address suggestions are unavailable. You can keep typing the address manually.");
        });
    }

    function requestSuggestions() {
      var query = input.value.trim();
      if (query.length < 3) {
        closePopup();
        return;
      }

      var thisRequest = ++requestId;
      setStatus("");

      loadPlacesLibrary()
        .then(function (loadedLibrary) {
          library = loadedLibrary;
          sessionToken = sessionToken || new library.AutocompleteSessionToken();
          return library.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: query,
            includedRegionCodes: ["us"],
            locationBias: fredericksburgBias,
            region: "us",
            sessionToken: sessionToken,
          });
        })
        .then(function (response) {
          if (thisRequest !== requestId || input.value.trim() !== query) {
            return;
          }

          suggestions = (response.suggestions || []).reduce(function (items, suggestion) {
            if (suggestion.placePrediction) {
              items.push(suggestion.placePrediction);
            }
            return items;
          }, []);
          activeIndex = -1;
          renderPopup();
        })
        .catch(function () {
          if (thisRequest !== requestId) {
            return;
          }
          closePopup();
          sessionToken = null;
          setStatus("Address suggestions are unavailable. You can keep typing the address manually.");
        });
    }

    input.addEventListener("focus", function () {
      focused = true;
      if (suggestions.length) {
        renderPopup();
      }
    });

    input.addEventListener("blur", function () {
      window.setTimeout(function () {
        focused = false;
        closePopup();
      }, 120);
    });

    input.addEventListener("input", function () {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(requestSuggestions, 250);
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closePopup();
        return;
      }

      if (!popup || !suggestions.length) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex(activeIndex < 0 ? 0 : activeIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(activeIndex < 0 ? suggestions.length - 1 : activeIndex - 1);
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        selectPrediction(suggestions[activeIndex]);
      }
    });

    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
  }

  function init() {
    addStyles();
    Array.prototype.forEach.call(document.querySelectorAll(addressSelector), enhanceAddressInput);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
