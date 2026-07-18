import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { hashPortalToken } from "@/lib/portal/tokens";
import { getServiceRoleClient } from "@/lib/supabase/admin";

const maxBodyBytes = 4_096;
const rateLimitWindowMs = 5 * 60 * 1000;
const rateLimitMaxRequests = 30;
const rateLimitBuckets = new Map<string, number[]>();
const sessionIdPattern = /^[A-Za-z0-9_-]{16,120}$/;

type PortalViewRequest = {
  documentType?: unknown;
  sessionId?: unknown;
  token?: unknown;
};

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return response(false, 403);
  }

  if (Number(request.headers.get("content-length") ?? 0) > maxBodyBytes) {
    return response(false, 413);
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return response(false, 415);
  }

  if (isRateLimited(getRequestBucket(request))) {
    return response(false, 429);
  }

  let body: PortalViewRequest;
  try {
    body = await request.json() as PortalViewRequest;
  } catch {
    return response(false, 400);
  }

  const documentType = body.documentType === "quote" || body.documentType === "invoice"
    ? body.documentType
    : null;
  const sessionId = typeof body.sessionId === "string" && sessionIdPattern.test(body.sessionId)
    ? body.sessionId
    : null;
  const tokenHash = typeof body.token === "string" ? hashPortalToken(body.token) : null;

  if (!documentType || !sessionId || !tokenHash) {
    return response(false, 400);
  }

  const supabase = getServiceRoleClient();
  if (!supabase) {
    console.error("Portal view tracking is not configured: service role client unavailable.");
    return response(false, 503);
  }

  const { data, error } = await supabase
    .rpc("record_portal_view", {
      p_document_type: documentType,
      p_referrer_domain: getReferrerDomain(request),
      p_token_hash: tokenHash,
      p_user_agent_family: getUserAgentFamily(request.headers.get("user-agent")),
      p_visitor_session_id: sessionId,
    })
    .single();

  if (error) {
    const invalidLink = error.code === "P0002" || error.code === "22023";
    if (!invalidLink) {
      console.error("Portal view tracking failed", {
        code: error.code,
        documentType,
        message: error.message,
      });
    }
    return response(false, invalidLink ? 404 : 503);
  }

  return NextResponse.json(
    { ok: true, recorded: Boolean((data as { recorded?: boolean } | null)?.recorded) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function response(ok: boolean, status: number) {
  return NextResponse.json({ ok }, { status, headers: { "Cache-Control": "no-store" } });
}

function isSameOriginRequest(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (origin && origin !== requestOrigin) return false;
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site";
}

function getRequestBucket(request: Request) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  return createHash("sha256").update(address).digest("hex").slice(0, 24);
}

function isRateLimited(bucket: string) {
  const now = Date.now();
  const recent = (rateLimitBuckets.get(bucket) ?? []).filter(
    (timestamp) => now - timestamp < rateLimitWindowMs,
  );

  if (recent.length >= rateLimitMaxRequests) {
    rateLimitBuckets.set(bucket, recent);
    return true;
  }

  recent.push(now);
  rateLimitBuckets.set(bucket, recent);
  return false;
}

function getReferrerDomain(request: Request) {
  const referrer = request.headers.get("referer");
  if (!referrer) return null;

  try {
    return new URL(referrer).hostname.slice(0, 255) || null;
  } catch {
    return null;
  }
}

function getUserAgentFamily(userAgent: string | null) {
  if (!userAgent) return null;
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/CriOS\//i.test(userAgent)) return "Chrome iOS";
  if (/Chrome\//i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return "Other browser";
}
