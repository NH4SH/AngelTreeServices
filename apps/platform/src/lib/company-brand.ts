// Public business details only. Safe to use in customer pages and client previews.
export const companyBrand = {
  name: "Angel Tree Services",
  services: "Tree service and landscaping",
  region: "Fredericksburg, Virginia region",
  phone: "(540) 388-8715",
  phoneHref: "tel:+15403888715",
  email: "info@angeltreeservice.org",
  website: "angeltreeservices.org",
  websiteHref: "https://angeltreeservices.org/",
} as const;

// Display the existing Reply-To mailbox, never sender credentials or internal
// recipients. A malformed setting must not become an unsafe customer link.
export function customerContactEmail(value?: string | null) {
  if (!value || /[\r\n]/.test(value)) return companyBrand.email;
  const trimmed = value.trim();
  const mailbox = trimmed.match(/^[^<>]*<([^<>]+)>$/)?.[1] ?? trimmed;
  return mailbox.length <= 254 && /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}$/i.test(mailbox)
    ? mailbox
    : companyBrand.email;
}

export function companyContactText(email?: string | null) {
  return [companyBrand.name, companyBrand.phone, customerContactEmail(email), companyBrand.website].join("\n");
}

export function customerContactHref(email?: string | null) {
  return `mailto:${encodeURIComponent(customerContactEmail(email)).replace("%40", "@")}`;
}
