import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { deriveGoogleOAuthStateKey } from "./credential-codec.ts";

type StateEnvelope = {
  expiresAt: number;
  nonce: string;
  userId: string;
};

export const googleOAuthStateCookieName = "ats_google_calendar_oauth";
export const googleOAuthStateLifetimeSeconds = 10 * 60;

export function createGoogleOAuthState(userId: string, now = Date.now(), configuredKey?: string) {
  const nonce = randomBytes(32).toString("base64url");
  const envelope: StateEnvelope = {
    expiresAt: now + googleOAuthStateLifetimeSeconds * 1000,
    nonce,
    userId,
  };
  const payload = Buffer.from(JSON.stringify(envelope)).toString("base64url");
  const signature = sign(payload, configuredKey);
  if (!signature) return null;
  return { cookieValue: `${payload}.${signature}`, state: nonce };
}

export function verifyGoogleOAuthState(input: {
  cookieValue: string | null | undefined;
  returnedState: string | null | undefined;
  userId: string;
  now?: number;
  configuredKey?: string;
}) {
  if (!input.cookieValue || !input.returnedState) return false;
  const separator = input.cookieValue.lastIndexOf(".");
  if (separator <= 0) return false;
  const payload = input.cookieValue.slice(0, separator);
  const submittedSignature = input.cookieValue.slice(separator + 1);
  const expectedSignature = sign(payload, input.configuredKey);
  if (!expectedSignature || !safeEqual(expectedSignature, submittedSignature)) return false;

  try {
    const envelope = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StateEnvelope;
    const now = input.now ?? Date.now();
    return envelope.userId === input.userId
      && envelope.nonce === input.returnedState
      && envelope.expiresAt >= now;
  } catch {
    return false;
  }
}

function sign(payload: string, configuredKey?: string) {
  const key = deriveGoogleOAuthStateKey(configuredKey);
  return key ? createHmac("sha256", key).update(payload).digest("base64url") : null;
}

function safeEqual(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
