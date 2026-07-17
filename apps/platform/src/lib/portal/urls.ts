import "server-only";

import { headers } from "next/headers";

export async function getPortalUrl(portalType: "quote" | "invoice" | "change-order", rawToken: string) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}/portal/${portalType}/${rawToken}`;
}
