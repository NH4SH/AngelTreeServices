import { timingSafeEqual } from "node:crypto";

export function monitoringSecretMatches(configured: string | null | undefined, submitted: string | null | undefined) {
  const expected = configured?.trim() ?? "";
  const received = submitted?.trim() ?? "";
  if (expected.length < 32 || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function isAuthenticatedMonitoringCanary(
  configured: string | null | undefined,
  submitted: string | null | undefined,
  marker: string | null | undefined,
) {
  return marker === "contact-form-v1" && monitoringSecretMatches(configured, submitted);
}

export function bearerToken(headers: Pick<Headers, "get">) {
  return headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? null;
}
