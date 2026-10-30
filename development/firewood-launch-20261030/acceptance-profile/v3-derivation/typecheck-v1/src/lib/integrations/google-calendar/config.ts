import "server-only";

import { buildCanonicalAppUrl, getCanonicalAppBaseUrl } from "@/lib/security/app-base-url";
import { isGoogleTokenEncryptionConfigured } from "./credentials";

export function getGoogleCalendarConfiguration() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "";
  const appBaseUrl = getCanonicalAppBaseUrl();
  const redirectUri = buildCanonicalAppUrl("/api/integrations/google-calendar/callback");
  const configured = Boolean(
    clientId
    && clientSecret
    && appBaseUrl
    && redirectUri
    && isGoogleTokenEncryptionConfigured(),
  );

  return {
    appBaseUrl,
    clientId,
    clientSecret,
    configured,
    redirectUri,
  };
}

