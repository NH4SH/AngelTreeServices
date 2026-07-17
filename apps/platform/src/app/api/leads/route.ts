import { NextResponse } from "next/server";
import { PUBLIC_LEAD_SUCCESS_MESSAGE, getAllowedLeadIntakeOrigins } from "@/lib/leads/config";
import {
  createWebsiteLead,
  parsePublicLeadSubmission,
  recordWebsiteLeadNotificationStatus,
} from "@/lib/leads/intake";
import { notifyOfficeOfWebsiteLead } from "@/lib/leads/notifications";

const maxBodyBytes = 32_000;
const rateLimitWindowMs = 10 * 60 * 1000;
const rateLimitMaxRequests = 5;
const rateLimitBuckets = new Map<string, number[]>();

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
  const requestAddress = getClientAddress(request);

  if (!isAllowedOrigin(origin)) {
    console.warn("Website lead intake rejected: origin not allowed.", { origin, requestAddress });
    return json({ ok: false, message: "This request could not be submitted." }, 403, origin);
  }

  if (Number(request.headers.get("content-length") ?? 0) > maxBodyBytes) {
    console.warn("Website lead intake rejected: payload too large.", { origin, requestAddress });
    return json({ ok: false, message: "Please shorten your request and try again." }, 413, origin);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
    console.warn("Website lead intake rejected: unsupported content type.", { origin, requestAddress, contentType });
    return json({ ok: false, message: "This request format is not supported." }, 415, origin);
  }

  if (isRateLimited(requestAddress)) {
    console.warn("Website lead intake rejected: rate limited.", { origin, requestAddress });
    return json({ ok: false, message: "Please wait a few minutes before sending another request." }, 429, origin);
  }

  try {
    const parsed = await parsePublicLeadSubmission(request);

    if (parsed.spam) {
      console.info("Website lead intake skipped as spam.", { origin, requestAddress });
      return json({ ok: true, message: PUBLIC_LEAD_SUCCESS_MESSAGE }, 202, origin);
    }

    if (!parsed.data) {
      console.warn("Website lead intake rejected: validation failed.", {
        origin,
        requestAddress,
        error: parsed.error,
      });
      return json({ ok: false, message: parsed.error }, 400, origin);
    }

    const result = await createWebsiteLead(parsed.data);
    const logContext = {
      duplicateMode: result.duplicateMode,
      jobId: result.jobId,
      origin,
      requestAddress,
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
    console.error("Website lead intake request failed unexpectedly.", { origin, requestAddress, error });
    return json({ ok: false, message: "We could not send your request right now. Please call our office." }, 500, origin);
  }
}

function json(body: { ok: boolean; message: string }, status: number, origin: string | null) {
  return NextResponse.json(body, {
    status,
    headers: corsHeaders(origin),
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

function getClientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(address: string) {
  const now = Date.now();
  const recentRequests = (rateLimitBuckets.get(address) ?? []).filter((timestamp) => now - timestamp < rateLimitWindowMs);

  if (recentRequests.length >= rateLimitMaxRequests) {
    rateLimitBuckets.set(address, recentRequests);
    return true;
  }

  recentRequests.push(now);
  rateLimitBuckets.set(address, recentRequests);
  return false;
}
