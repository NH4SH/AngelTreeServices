import { NextResponse } from "next/server";
import { PUBLIC_LEAD_SUCCESS_MESSAGE, getAllowedLeadIntakeOrigins } from "@/lib/leads/config";
import {
  createWebsiteLead,
  parsePublicLeadSubmission,
  recordWebsiteLeadNotificationStatus,
} from "@/lib/leads/intake";
import { notifyOfficeOfWebsiteLead } from "@/lib/leads/notifications";
import { enforceSharedRateLimit, hashRateLimitKey, trustedClientIp } from "@/lib/security/rate-limit";

const maxBodyBytes = 32_000;
const rateLimitMaxRequests = 5;

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");

  if (!isAllowedOrigin(origin)) {
    return json({ ok: false, message: "Origin not allowed." }, 403, origin);
  }

  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const requestAddressHash = hashRateLimitKey([trustedClientIp(request.headers) ?? "unknown"]);

  if (!isAllowedOrigin(origin)) {
    console.warn("Website lead intake rejected: origin not allowed.", { origin, requestAddressHash });
    return json({ ok: false, message: "This request could not be submitted." }, 403, origin);
  }

  if (Number(request.headers.get("content-length") ?? 0) > maxBodyBytes) {
    console.warn("Website lead intake rejected: payload too large.", { origin, requestAddressHash });
    return json({ ok: false, message: "Please shorten your request and try again." }, 413, origin);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
    console.warn("Website lead intake rejected: unsupported content type.", { origin, requestAddressHash, contentType });
    return json({ ok: false, message: "This request format is not supported." }, 415, origin);
  }

  const rateLimit = await enforceSharedRateLimit({ action: "public.lead.create", limit: rateLimitMaxRequests, request, windowSeconds: 600 });
  if (!rateLimit.available) return json({ ok: false, message: "We could not send your request right now. Please call our office." }, 503, origin);
  if (!rateLimit.allowed) {
    console.warn("Website lead intake rejected: rate limited.", { origin, requestAddressHash });
    return json({ ok: false, message: "Please wait a few minutes before sending another request." }, 429, origin, rateLimit.retryAfterSeconds);
  }

  try {
    const parsed = await parsePublicLeadSubmission(request);

    if (parsed.spam) {
      console.info("Website lead intake skipped as spam.", { origin, requestAddressHash });
      return json({ ok: true, message: PUBLIC_LEAD_SUCCESS_MESSAGE }, 202, origin);
    }

    if (!parsed.data) {
      console.warn("Website lead intake rejected: validation failed.", {
        origin,
        requestAddressHash,
        error: parsed.error,
      });
      return json({ ok: false, message: parsed.error }, 400, origin);
    }

    const result = await createWebsiteLead(parsed.data);
    const logContext = {
      duplicateMode: result.duplicateMode,
      jobId: result.jobId,
      origin,
      requestAddressHash,
      submissionId: result.submissionId,
    };

    if (!result.jobId) {
      console.error("Website lead intake failed before CRM save.", { ...logContext, error: result.error });
      return json({ ok: false, message: "We could not send your request right now. Please call our office." }, 503, origin);
    }

    if (result.error) {
      console.warn("Website lead intake completed with a follow-up warning.", { ...logContext, error: result.error });
    }

    if (result.created) {
      try {
        await notifyOfficeOfWebsiteLead(result.jobId, parsed.data);
        await recordWebsiteLeadNotificationStatus(result.jobId, "sent", null);
      } catch (notificationError) {
        const notificationMessage = notificationError instanceof Error ? notificationError.message : "Unknown notification failure";
        await recordWebsiteLeadNotificationStatus(result.jobId, "failed", notificationMessage);
        console.error("Website lead notification failed after CRM save.", { ...logContext, error: notificationMessage });
      }
    }

    console.info("Website lead intake saved successfully.", logContext);
    return json({ ok: true, message: PUBLIC_LEAD_SUCCESS_MESSAGE }, result.created ? 201 : 200, origin);
  } catch (error) {
    console.error("Website lead intake request failed unexpectedly.", { origin, requestAddressHash, error });
    return json({ ok: false, message: "We could not send your request right now. Please call our office." }, 500, origin);
  }
}

function json(body: { ok: boolean; message: string }, status: number, origin: string | null, retryAfterSeconds?: number) {
  const headers = corsHeaders(origin);
  if (retryAfterSeconds) headers.set("Retry-After", String(retryAfterSeconds));
  return NextResponse.json(body, {
    status,
    headers,
  });
}

function corsHeaders(origin: string | null) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
  });

  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
  }

  return headers;
}

function isAllowedOrigin(origin: string | null) {
  if (!origin) {
    return process.env.NODE_ENV !== "production";
  }

  return getAllowedOrigins().has(origin);
}

function getAllowedOrigins() {
  return new Set(getAllowedLeadIntakeOrigins());
}
