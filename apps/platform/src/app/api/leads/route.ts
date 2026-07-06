import { NextResponse } from "next/server";
import { createWebsiteLead, parsePublicLeadSubmission } from "@/lib/leads/intake";
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

  if (!isAllowedOrigin(origin)) {
    return json({ ok: false, message: "This request could not be submitted." }, 403, origin);
  }

  if (Number(request.headers.get("content-length") ?? 0) > maxBodyBytes) {
    return json({ ok: false, message: "Please shorten your request and try again." }, 413, origin);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
    return json({ ok: false, message: "This request format is not supported." }, 415, origin);
  }

  if (isRateLimited(getClientAddress(request))) {
    return json({ ok: false, message: "Please wait a few minutes before sending another request." }, 429, origin);
  }

  try {
    const parsed = await parsePublicLeadSubmission(request);

    if (parsed.spam) {
      return json({ ok: true, message: "Thanks. We received your request." }, 202, origin);
    }

    if (!parsed.data) {
      return json({ ok: false, message: parsed.error }, 400, origin);
    }

    const result = await createWebsiteLead(parsed.data);

    if (!result.jobId) {
      console.error("Website lead intake failed:", result.error);
      return json({ ok: false, message: "We could not send your request right now. Please call our office." }, 503, origin);
    }

    if (result.error) {
      console.error("Website lead intake completed with a note warning:", result.error);
    }

    await notifyOfficeOfWebsiteLead(result.jobId);
    return json({ ok: true, message: "Thanks. We received your request and will follow up soon." }, 201, origin);
  } catch (error) {
    console.error("Website lead intake request failed:", error);
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
    return true;
  }

  return getAllowedOrigins().has(origin);
}

function getAllowedOrigins() {
  const configured = process.env.LEAD_INTAKE_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];

  return new Set([
    "https://angeltreeservices.org",
    "https://www.angeltreeservices.org",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    ...configured,
  ]);
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
