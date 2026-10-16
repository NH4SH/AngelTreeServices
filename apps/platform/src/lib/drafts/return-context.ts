// Only list context travels through editors; never trust a redirect destination
// or echo arbitrary query parameters (which can contain portal tokens).
export function safeReturnTo(value: unknown, fallback = "/admin/quotes"): string {
  if (typeof value !== "string" || value.length > 1800 || /[\\\x00-\x1f%#]/.test(value.split("?")[0]) || !value.startsWith("/admin/")) return fallback;
  try {
    const url = new URL(value, "https://crm.invalid");
    if (url.origin !== "https://crm.invalid" || !["/admin/quotes", "/admin/invoices", "/admin/jobs", "/admin/communications"].includes(url.pathname)) return fallback;
    const query = new URLSearchParams();
    for (const name of ["q", "status", "page", "archived", "view"]) {
      const item = url.searchParams.get(name);
      if (!item || item.length > 200 || /[\x00-\x1f]/.test(item)) continue;
      if (name === "page" && !/^[1-9]\d{0,5}$/.test(item)) continue;
      if (name === "archived" && item !== "1") continue;
      query.set(name, item);
    }
    return `${url.pathname}${query.size ? `?${query}` : ""}`;
  } catch { return fallback; }
}

export function withReturnTo(href: string, returnTo: unknown, fallback = "/admin/quotes") {
  const url = new URL(href, "https://crm.invalid");
  url.searchParams.set("returnTo", safeReturnTo(returnTo, fallback));
  return `${url.pathname}${url.search}${url.hash}`;
}
