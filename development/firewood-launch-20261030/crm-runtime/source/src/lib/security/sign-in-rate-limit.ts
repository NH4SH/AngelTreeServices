import "server-only";

import { isIP } from "node:net";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { hashRateLimitKey } from "@/lib/security/rate-limit-core";
import { consumeRateLimitWithClient } from "@/lib/security/rate-limit";
import { withDeadline } from "@/lib/runtime/deadline";

type SignInLimit = "allowed" | "limited" | "unavailable";

function canonicalAddress(raw: string) {
  const version = isIP(raw);
  if (version === 4) return raw;
  if (version !== 6 || raw.includes("%")) return null;
  const value = new URL(`http://[${raw}]/`).hostname.slice(1, -1);
  // Treat IPv4-mapped IPv6 and IPv4 as the same source.
  const mapped = /^::ffff:([a-f\d]{1,4}):([a-f\d]{1,4})$/.exec(value);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return value;
}

export function signInSourceAddress(headers: Pick<Headers, "get">, localDevelopment = false) {
  // Hosted login trusts Netlify's connecting-address header, never a caller's
  // arbitrary X-Forwarded-For chain. Adapter behavior remains a release gate.
  const direct = headers.get("x-nf-client-connection-ip");
  if (direct !== null) return canonicalAddress(direct.trim());
  if (!localDevelopment) return null;

  // Plain Next development on loopback has no Netlify header. Only accept a
  // single loopback address and loopback Host; no arbitrary dev-proxy IPs.
  const host = headers.get("host") ?? "";
  const forwarded = headers.get("x-forwarded-for")?.trim() ?? "";
  const address = canonicalAddress(forwarded);
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)
    && ["127.0.0.1", "::1"].includes(address ?? "") ? address : null;
}

export async function checkPasswordSignInRateLimit(
  email: string,
  headers: Pick<Headers, "get">,
  localDevelopment = process.env.NODE_ENV === "development",
): Promise<SignInLimit> {
  const address = signInSourceAddress(headers, localDevelopment);
  if (!address) return "unavailable"; // No globally shared unknown-IP bucket.
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 320) return "unavailable";

  try {
    const client = getServiceRoleClient();
    if (!client) return "unavailable";
    return await withDeadline<SignInLimit>(async signal => {
      const budgets = [
        { action: "auth.password.ip", keyHash: hashRateLimitKey([address]), limit: 60 },
        { action: "auth.password.ip-account", keyHash: hashRateLimitKey([address, normalizedEmail]), limit: 10 },
      ];
      for (const budget of budgets) {
        if (signal.aborted) return "unavailable";
        const result = await consumeRateLimitWithClient(client, { ...budget, windowSeconds: 600, signal });
        if (signal.aborted || !result.available) return "unavailable";
        if (!result.allowed) return "limited";
      }
      return "allowed";
    }, 3000);
  } catch {
    // Never log provider/database diagnostics, input, addresses or credentials.
    return "unavailable";
  }
}
