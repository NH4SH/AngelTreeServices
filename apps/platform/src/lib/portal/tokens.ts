import "server-only";

import { createHash, randomBytes } from "node:crypto";

const portalTokenPattern = /^[A-Za-z0-9_-]{40,200}$/;

export const QUOTE_PORTAL_LINK_LIFETIME_DAYS = 30;
export const INVOICE_PORTAL_LINK_LIFETIME_DAYS = 30;

export function generatePortalToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPortalToken(rawToken: string) {
  if (!portalTokenPattern.test(rawToken)) {
    return null;
  }

  return createHash("sha256").update(rawToken).digest("hex");
}

export function getPortalTokenHint(rawToken: string) {
  return rawToken.slice(-6);
}
