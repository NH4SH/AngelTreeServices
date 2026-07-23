const productionHostname = "admin.angeltreeservices.org";

export function normalizeAppBaseUrl(
  value: string | null | undefined,
  environment = process.env.NODE_ENV,
) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;

    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (environment === "production") {
      return url.protocol === "https:" && url.hostname === productionHostname ? url.origin : null;
    }

    if (isLocal && url.protocol === "http:") return url.origin;
    if (url.protocol === "https:" && url.hostname === productionHostname) return url.origin;
    return null;
  } catch {
    return null;
  }
}

export function getCanonicalAppBaseUrl() {
  return normalizeAppBaseUrl(process.env.APP_BASE_URL);
}

export function buildCanonicalAppUrl(path: string) {
  const baseUrl = getCanonicalAppBaseUrl();
  if (!baseUrl) return null;
  return new URL(path, baseUrl).toString();
}
