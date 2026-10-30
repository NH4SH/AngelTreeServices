import "server-only";

import { buildCanonicalAppUrl } from "@/lib/security/app-base-url";

export async function getPortalUrl(portalType: "quote" | "invoice" | "change-order", rawToken: string) {
  const url = buildCanonicalAppUrl(`/portal/${portalType}/${encodeURIComponent(rawToken)}`);
  if (!url) throw new Error("APP_BASE_URL is not configured with an allowed admin origin.");
  return url;
}
