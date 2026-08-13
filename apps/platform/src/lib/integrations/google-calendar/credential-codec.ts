import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function encryptGoogleRefreshToken(rawToken: string, configuredKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
  const key = decodeEncryptionKey(configuredKey);
  if (!key || !rawToken.trim()) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(rawToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptGoogleRefreshToken(encryptedToken: string | null | undefined, configuredKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
  const key = decodeEncryptionKey(configuredKey);
  if (!key || !encryptedToken) return null;

  const [version, encodedIv, encodedCiphertext, encodedTag] = encryptedToken.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext || !encodedTag) return null;

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function preserveOrEncryptRefreshToken(input: {
  existingEncryptedToken: string | null;
  newRefreshToken: string | null | undefined;
  configuredKey?: string;
}) {
  if (!input.newRefreshToken) return input.existingEncryptedToken;
  return encryptGoogleRefreshToken(input.newRefreshToken, input.configuredKey);
}

export function deriveGoogleOAuthStateKey(configuredKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
  const key = decodeEncryptionKey(configuredKey);
  return key ? createHash("sha256").update(key).update("angel-tree-google-oauth-state-v1").digest() : null;
}

export function isGoogleTokenEncryptionConfigured(configuredKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
  return Boolean(decodeEncryptionKey(configuredKey));
}

function decodeEncryptionKey(value: string | null | undefined) {
  if (!value?.trim()) return null;
  try {
    const key = Buffer.from(value.trim(), "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

