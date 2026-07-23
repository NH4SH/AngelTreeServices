const fallbackPath = "/admin";

export function safeLocalRedirect(value: string | null | undefined, fallback = fallbackPath) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  if (/[\\\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }

  let decoded = value;
  try {
    for (let index = 0; index < 3; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return fallback;
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://admin.angeltreeservices.org");
    if (parsed.origin !== "https://admin.angeltreeservices.org") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
