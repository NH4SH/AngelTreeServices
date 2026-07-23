import { createHash } from "node:crypto";
import { isIP } from "node:net";

export function hashRateLimitKey(parts: Array<string | null | undefined>) {
  const normalized = parts.map((part) => String(part ?? "").trim().slice(0, 500)).join("\u001f");
  return createHash("sha256").update(`angel-tree-rate-limit-v1\u001f${normalized}`).digest("hex");
}

export function trustedClientIp(headers: Pick<Headers, "get">) {
  const direct = headers.get("x-nf-client-connection-ip")?.trim();
  if (direct && isIP(stripAddressPort(direct))) return stripAddressPort(direct);

  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded && isIP(stripAddressPort(forwarded))) return stripAddressPort(forwarded);
  return null;
}

function stripAddressPort(value: string) {
  if (value.startsWith("[") && value.includes("]")) return value.slice(1, value.indexOf("]"));
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) return value.slice(0, value.lastIndexOf(":"));
  return value;
}
