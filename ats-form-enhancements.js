(function () {
  var successMessage = "Thank you — your request was received. We’ll contact you shortly.";

  function trackEvent(name, parameters) {
    if (typeof window.gtag !== "function") {
      return;
    }

    window.gtag("event", name, parameters || {});
  }

  function initPublicSiteAnalytics() {
    document.addEventListener("click", function (event) {
      var link = event.target.closest("a");
      if (!link) {
        return;
      }

      if (link.dataset.atsNav) {
        trackEvent("navigation_link_click", {
          destination: link.dataset.atsNav,
          navigation: link.closest(".ats-home-mobile-menu") ? "mobile_menu" : "desktop_header",
        });
      }

      if (link.classList.contains("ats-emergency-call")) {
        trackEvent("emergency_cta_click", { location: "homepage_guidance" });
        return;
      }

      if (link.matches('a[href^="tel:"]')) {
        trackEvent("phone_link_click", {
          location: link.closest("#contact") ? "contact" : link.closest("#top") ? "hero" : "site",
        });
        return;
      }

      if (link.matches('a[href="#contact"]')) {
        trackEvent("estimate_cta_click", {
          location: link.closest("#top") ? "hero" : link.closest(".ats-emergency") ? "emergency" : "site",
        });
      }

      if (link.classList.contains("list-item-content__button")) {
        var card = link.closest(".list-item");
        var heading = card ? card.querySelector("h2, h3") : null;
        trackEvent("service_link_click", {
          service_name: heading ? heading.textContent.trim().slice(0, 80) : "service",
        });
      }
    });
  }

  function initMobileActions() {
    var actions = document.querySelector(".ats-mobile-actions");
    var contact = document.querySelector("#contact");

    if (!actions || !contact || typeof window.IntersectionObserver !== "function") {
      return;
    }

    new IntersectionObserver(
      function (entries) {
        actions.classList.toggle("is-hidden", entries[0].isIntersecting);
      },
      { threshold: 0 }
    ).observe(contact);
  }

  function getFieldContainer(field) {
    return (
      field.closest(".form-item") ||
      field.closest("[data-field-wrapper]") ||
      field.closest("fieldset") ||
      field.parentElement
    );
  }

  function getLabelText(field) {
    if (!field) {
      return "This field";
    }

    var label = field.id ? document.querySelector('label[for="' + field.id + '"]') : null;
    if (label) {
      return label.textContent.replace(/\(required\)|\(optional\)/gi, "").trim() || "This field";
    }

    var legend = field.closest("fieldset");
    if (legend) {
      var legendLabel = legend.querySelector("legend");
      if (legendLabel) {
        return legendLabel.textContent.replace(/\(required\)|\(optional\)/gi, "").trim() || "This field";
      }
    }

    return field.name || "This field";
  }

  function getErrorElement(field) {
    var container = getFieldContainer(field);
    if (!container) {
      return null;
    }

    var existing = container.querySelector(".ats-field-error");
    if (existing) {
      return existing;
    }

    var error = document.createElement("div");
    error.className = "ats-field-error";
    error.id = (field.id || field.name || "field") + "-error";
    error.setAttribute("aria-live", "polite");
    container.appendChild(error);
    return error;
  }

  function setFieldDescribedBy(field, errorId, shouldAdd) {
    if (!field) {
      return;
    }

    if (!field.dataset.originalDescribedby) {
      field.dataset.originalDescribedby = field.getAttribute("aria-describedby") || "";
    }

    var ids = (field.dataset.originalDescribedby || "")
      .split(/\s+/)
      .filter(Boolean);

    if (shouldAdd) {
      if (ids.indexOf(errorId) === -1) {
        ids.push(errorId);
      }
    }

    field.setAttribute("aria-describedby", ids.join(" ").trim());
  }

  function showFieldError(field, message) {
    var error = getErrorElement(field);
    if (!error) {
      return;
    }

    error.textContent = message;
    field.setAttribute("aria-invalid", "true");
    setFieldDescribedBy(field, error.id, true);
  }

  function clearFieldError(field) {
    var container = getFieldContainer(field);
    if (!container) {
      return;
    }

    var error = container.querySelector(".ats-field-error");
    if (error) {
      error.remove();
    }

    field.setAttribute("aria-invalid", "false");

    if (field.dataset.originalDescribedby !== undefined) {
      if (field.dataset.originalDescribedby) {
        field.setAttribute("aria-describedby", field.dataset.originalDescribedby);
      } else {
        field.removeAttribute("aria-describedby");
      }
    }
  }

  function shouldValidateField(field) {
    return (
      field &&
      !field.disabled &&
      !field.closest("[hidden]") &&
      field.name !== "bot-field" &&
      field.type !== "hidden" &&
      field.type !== "submit" &&
      field.type !== "button" &&
      field.type !== "checkbox" &&
      field.type !== "radio"
    );
  }

  function validateField(field) {
    if (!shouldValidateField(field)) {
      return true;
    }

    var value = field.value.trim();
    var message = "";

    if (field.required && !value) {
      message = getLabelText(field) + " is required.";
    } else if (field.name === "phone" && value) {
      var digits = value.replace(/\D/g, "");
      if (digits.length < 10) {
        message = "Please enter a phone number with at least 10 digits.";
      }
    } else if (field.type === "email" && value) {
      var validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      if (!validEmail) {
        message = "Please enter a valid email address or leave this field blank.";
      }
    }

    if (message) {
      showFieldError(field, message);
      return false;
    }

    clearFieldError(field);
    return true;
  }

  function syncCommercialFields(form) {
    var panel = form.querySelector("[data-commercial-fields]");
    var radios = form.querySelectorAll('input[name="customer_type"]');

    if (!panel || !radios.length) {
      return;
    }

    var isCommercial = Array.prototype.some.call(radios, function (radio) {
      return radio.checked && /commercial/i.test(radio.value);
    });

    panel.hidden = !isCommercial;
    panel.setAttribute("aria-hidden", String(!isCommercial));

    Array.prototype.forEach.call(
      panel.querySelectorAll("input, select, textarea"),
      function (field) {
        field.disabled = !isCommercial;
        if (!isCommercial) {
          clearFieldError(field);
        }
      }
    );
  }

  function getSubmitButton(form) {
    return form.querySelector('button[type="submit"]');
  }

  function setButtonText(button, text) {
    if (!button) {
      return;
    }

    var label = button.querySelector(".form-submit-button-label");
    if (label) {
      label.textContent = text;
    }

    var state = button.querySelector(".form-submit-button-state");
    if (state) {
      state.setAttribute("aria-label", text);
      var firstVisibleText = state.querySelector('span[aria-hidden="true"]');
      if (firstVisibleText) {
        firstVisibleText.textContent = text;
      }
    }

    if (!label && !state) {
      button.textContent = text;
    }
  }

  function setSubmitting(form, isSubmitting) {
    var button = getSubmitButton(form);
    if (!button) {
      return;
    }

    var defaultLabel = (button.dataset.defaultLabel || button.textContent || "").trim();
    var loadingLabel = button.dataset.loadingLabel || "Sending Request...";

    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = defaultLabel || "Submit";
    }

    form.classList.toggle("is-submitting", isSubmitting);
    form.dataset.submitting = isSubmitting ? "true" : "false";
    button.disabled = isSubmitting;
    button.setAttribute("aria-busy", isSubmitting ? "true" : "false");
    setButtonText(button, isSubmitting ? loadingLabel : button.dataset.defaultLabel);
  }

  function setSummaryState(form, show) {
    var summary = form.querySelector(".ats-form-error-summary");
    if (!summary) {
      return;
    }

    summary.hidden = !show;
  }

  function getServerStatus(form) {
    var existing = form.querySelector(".ats-form-server-status");
    if (existing) {
      return existing;
    }

    var status = document.createElement("p");
    status.className = "ats-form-server-status";
    status.setAttribute("aria-live", "polite");
    status.setAttribute("role", "status");
    status.setAttribute("tabindex", "-1");
    status.hidden = true;
    form.appendChild(status);
    return status;
  }

  function setServerStatus(form, message, state) {
    var status = getServerStatus(form);
    status.textContent = message || "";
    status.classList.toggle("success", state === "success");
    status.classList.toggle("error", state === "error");
    status.hidden = !message;

    if (message) {
      status.focus();
    }
  }

  function getLeadIntakeEndpoint(form) {
    if (window.ATS_LEAD_INTAKE_URL) {
      return window.ATS_LEAD_INTAKE_URL;
    }

    if (form.dataset.leadIntakeUrl) {
      return form.dataset.leadIntakeUrl;
    }

    return "/api/leads";
  }

  function generateSubmissionId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return "website-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }

  function setHiddenFieldValue(form, name, value) {
    var field = form.querySelector('input[name="' + name + '"]');

    if (!field) {
      field = document.createElement("input");
      field.type = "hidden";
      field.name = name;
      form.appendChild(field);
    }

    field.value = value || "";
    return field;
  }

  function setSubmissionMetadata(form, resetSubmissionId) {
    if (resetSubmissionId || !form.dataset.submissionId) {
      form.dataset.submissionId = generateSubmissionId();
    }

    setHiddenFieldValue(form, "submission_id", form.dataset.submissionId);
    setHiddenFieldValue(form, "form_started_at", form.dataset.formStartedAt || String(Date.now()));
    setHiddenFieldValue(form, "page_url", window.location.href || "");
    setHiddenFieldValue(form, "referrer", document.referrer || "");

    try {
      var params = new URLSearchParams(window.location.search);
      setHiddenFieldValue(form, "utm_source", params.get("utm_source") || "");
      setHiddenFieldValue(form, "utm_medium", params.get("utm_medium") || "");
      setHiddenFieldValue(form, "utm_campaign", params.get("utm_campaign") || "");
      setHiddenFieldValue(form, "utm_term", params.get("utm_term") || "");
      setHiddenFieldValue(form, "utm_content", params.get("utm_content") || "");
    } catch (error) {
      setHiddenFieldValue(form, "utm_source", "");
      setHiddenFieldValue(form, "utm_medium", "");
      setHiddenFieldValue(form, "utm_campaign", "");
      setHiddenFieldValue(form, "utm_term", "");
      setHiddenFieldValue(form, "utm_content", "");
    }
  }

  function submitLead(form) {
    return fetch(getLeadIntakeEndpoint(form), {
      method: "POST",
      body: new FormData(form),
      credentials: "omit",
      headers: {
        Accept: "application/json",
      },
    }).then(function (response) {
      return response
        .text()
        .then(function (text) {
          var body = {};

          if (text) {
            try {
              body = JSON.parse(text);
            } catch (error) {
              body = {};
            }
          }

          if (!response.ok || body.ok === false) {
            throw new Error(body.message || "We could not send your request right now. Please call our office.");
          }

          return {
            ok: true,
            message:
              body.message || successMessage,
          };
        });
    });
  }

  function validateForm(form) {
    syncCommercialFields(form);

    var fields = Array.prototype.filter.call(
      form.querySelectorAll("input, select, textarea"),
      shouldValidateField
    );

    var firstInvalidField = null;

    fields.forEach(function (field) {
      var isValid = validateField(field);
      if (!isValid && !firstInvalidField) {
        firstInvalidField = field;
      }
    });

    setSummaryState(form, !!firstInvalidField);

    if (firstInvalidField) {
      firstInvalidField.focus();
      return false;
    }

    return true;
  }

  function applyEstimatePrefill(form) {
    var parameters;

    try {
      parameters = new URLSearchParams(window.location.search);
    } catch (error) {
      return;
    }

    var requestedService = parameters.get("service");
    var serviceField = form.querySelector('select[name="service"]');

    if (requestedService && serviceField) {
      var matchingOption = Array.prototype.find.call(serviceField.options, function (option) {
        return option.value === requestedService;
      });

      if (matchingOption) {
        serviceField.value = matchingOption.value;
      }
    }

    var requestedCustomerType = parameters.get("customer_type");
    if (requestedCustomerType) {
      var customerTypeField = Array.prototype.find.call(
        form.querySelectorAll('input[name="customer_type"]'),
        function (field) {
          return field.value === requestedCustomerType;
        }
      );

      if (customerTypeField) {
        customerTypeField.checked = true;
      }
    }
  }

  function initForm(form) {
    form.dataset.formStartedAt = String(Date.now());
    setSubmissionMetadata(form, true);
    applyEstimatePrefill(form);
    syncCommercialFields(form);
    setSubmitting(form, false);
    setSummaryState(form, false);
    setServerStatus(form, "", "");

    form.addEventListener(
      "input",
      function () {
        if (form.dataset.analyticsStarted === "true") {
          return;
        }

        form.dataset.analyticsStarted = "true";
        trackEvent("estimate_form_started", { form_name: "contact" });
      },
      { once: true }
    );

    Array.prototype.forEach.call(
      form.querySelectorAll('input[name="customer_type"]'),
      function (radio) {
        radio.addEventListener("change", function () {
          syncCommercialFields(form);
        });
      }
    );

    Array.prototype.forEach.call(
      form.querySelectorAll("input, select, textarea"),
      function (field) {
        if (!shouldValidateField(field)) {
          return;
        }

        field.addEventListener(
          "blur",
          function () {
            validateField(field);
          },
          true
        );

        field.addEventListener("input", function () {
          if (field.getAttribute("aria-invalid") === "true") {
            validateField(field);
          }
        });

        field.addEventListener("change", function () {
          validateField(field);
        });
      }
    );

    form.addEventListener("submit", function (event) {
      if (form.dataset.submitting === "true") {
        event.preventDefault();
        return;
      }

      var valid = validateForm(form);
      if (!valid) {
        event.preventDefault();
        setSubmitting(form, false);
        return;
      }

      if (!window.fetch || !window.FormData) {
        setSubmitting(form, true);
        return;
      }

      event.preventDefault();
      document.body.classList.remove("ats-form-submitted");
      setSubmissionMetadata(form, false);
      setServerStatus(form, "", "");
      setSubmitting(form, true);

      submitLead(form)
        .then(function (response) {
          form.reset();
          form.dataset.formStartedAt = String(Date.now());
          setSubmissionMetadata(form, true);
          syncCommercialFields(form);
          document.body.classList.add("ats-form-submitted");
          setSummaryState(form, false);
          setServerStatus(form, response.message || successMessage, "success");
          trackEvent("estimate_form_submitted", { form_name: "contact" });
        })
        .catch(function (error) {
          setServerStatus(
            form,
            error.message || "We could not send your request right now. Please call our office.",
            "error"
          );
          trackEvent("estimate_form_failed", {
            form_name: "contact",
            reason: "network_or_server",
          });
        })
        .finally(function () {
          setSubmitting(form, false);
        });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initPublicSiteAnalytics();
    initMobileActions();
    Array.prototype.forEach.call(document.querySelectorAll(".ats-contact-form"), initForm);
  });

  window.addEventListener("pageshow", function () {
    Array.prototype.forEach.call(document.querySelectorAll(".ats-contact-form"), function (form) {
      setSubmitting(form, false);
    });
  });
})();
