import "server-only";

import { headers } from "next/headers";
import { hashPortalToken } from "@/lib/portal/tokens";
import { enforceSharedRateLimit } from "@/lib/security/rate-limit";

export async function checkPortalPageRateLimit(portalType: "quote" | "invoice" | "change-order", rawToken: string) {
  return enforceSharedRateLimit({
    action: `portal.${portalType}.view`,
    headers: await headers(),
    identifiers: [hashPortalToken(rawToken)],
    limit: 60,
    windowSeconds: 600,
  });
}

export async function checkPortalActionRateLimit(action: string, rawToken: string) {
  return enforceSharedRateLimit({
    action: `portal.action.${action}`,
    headers: await headers(),
    identifiers: [hashPortalToken(rawToken)],
    limit: 8,
    windowSeconds: 600,
  });
}
