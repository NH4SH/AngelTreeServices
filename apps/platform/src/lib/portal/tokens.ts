import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

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

export function encryptPortalToken(rawToken: string) {
  if (!hashPortalToken(rawToken)) {
    return { encryptedToken: "", error: "Could not secure the customer portal link." };
  }

  const key = getPortalTokenEncryptionKey();
  if (!key) {
    return {
      encryptedToken: "",
      error: "Portal link recovery is not configured. Set PORTAL_TOKEN_ENCRYPTION_KEY before generating customer links.",
    };
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(rawToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encryptedToken: ["v1", iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join("."),
    error: null,
  };
}

export function decryptPortalToken(encryptedToken: string | null | undefined) {
  const key = getPortalTokenEncryptionKey();
  if (!encryptedToken || !key) {
    return null;
  }

  const [version, encodedIv, encodedCiphertext, encodedTag] = encryptedToken.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext || !encodedTag) {
    return null;
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const rawToken = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");

    return hashPortalToken(rawToken) ? rawToken : null;
  } catch {
    return null;
  }
}

function getPortalTokenEncryptionKey() {
  const value = process.env.PORTAL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!value) {
    return null;
  }

  try {
    const key = Buffer.from(value, "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}
