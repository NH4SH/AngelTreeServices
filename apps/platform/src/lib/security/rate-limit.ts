import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { hashRateLimitKey, trustedClientIp } from "@/lib/security/rate-limit-core";

export { hashRateLimitKey, trustedClientIp } from "@/lib/security/rate-limit-core";

type RateLimitResult = {
  allowed: boolean;
  available: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export async function enforceSharedRateLimit({
  action,
  identifiers,
  headers,
  limit,
  request,
  windowSeconds,
}: {
  action: string;
  identifiers?: Array<string | null | undefined>;
  headers?: Pick<Headers, "get">;
  limit: number;
  request?: Request;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const client = getServiceRoleClient();
  if (!client) return unavailable();
  const ip = trustedClientIp(request?.headers ?? headers ?? new Headers());
  const keyHash = hashRateLimitKey([ip ? `ip:${ip}` : "ip:unknown", ...(identifiers ?? [])]);
  return consumeRateLimitWithClient(client, { action, keyHash, limit, windowSeconds });
}

export async function consumeRateLimitWithClient(
  client: SupabaseClient<any, "public", any>,
  input: { action: string; keyHash: string; limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const { data, error } = await client.rpc("consume_security_rate_limit", {
    p_action_name: input.action,
    p_key_hash: input.keyHash,
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return unavailable();
  return {
    allowed: Boolean(row.allowed),
    available: true,
    remaining: Number(row.remaining ?? 0),
    retryAfterSeconds: Number(row.retry_after_seconds ?? 0),
  };
}

function unavailable(): RateLimitResult {
  return { allowed: false, available: false, remaining: 0, retryAfterSeconds: 30 };
}
