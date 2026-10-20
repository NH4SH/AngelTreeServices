import { NextResponse } from "next/server";
import { getInvoiceByPortalToken } from "@/lib/data/portal-invoice";
import { isInvoicePaymentPreference } from "@/lib/payments/payment-options";
import { deliverCustomerSourceEvent } from "@/lib/notifications/source-events";
import { hashPortalToken } from "@/lib/portal/tokens";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { enforceSharedRateLimit } from "@/lib/security/rate-limit";
import { getCanonicalAppBaseUrl } from "@/lib/security/app-base-url";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isSameOrigin(request)) {
    return responseError("This payment preference could not be saved.", 403);
  }

  const { token } = await params;
  const appBaseUrl = getCanonicalAppBaseUrl();
  if (!appBaseUrl) return responseError("This payment preference could not be saved right now.", 503);
  const rateLimit = await enforceSharedRateLimit({ action: "portal.invoice.payment-preference", identifiers: [hashPortalToken(token)], limit: 12, request, windowSeconds: 600 });
  if (!rateLimit.available) return responseError("This payment preference could not be saved right now.", 503);
  if (!rateLimit.allowed) return responseError("Please wait before changing the payment preference again.", 429, rateLimit.retryAfterSeconds);

  const body = await request.json().catch(() => null) as { preference?: unknown } | null;
  if (!body || Object.keys(body).some((key) => key !== "preference") || !isInvoicePaymentPreference(body.preference)) {
    return responseError("Choose one of the available payment methods.", 400);
  }

  const lookup = await getInvoiceByPortalToken(token);
  if (lookup.status !== "ready" || !lookup.invoice) {
    return responseError("This invoice link is not available.", 404);
  }

  const supabase = getServiceRoleClient();
  const tokenHash = hashPortalToken(token);
  if (!supabase || !tokenHash) {
    return responseError("This payment preference could not be saved right now.", 503);
  }

  const { data, error } = await supabase.rpc("record_invoice_preference_with_event", {
    p_preference: body.preference,
    p_token_hash: tokenHash,
  });
  if (error) {
    console.error("Invoice payment preference save failed", {
      applicationErrorCode: "payment_preference_save_failed",
      route: "invoice_portal_payment_preference",
    });
    return responseError("This payment preference could not be saved right now.", 409);
  }

  const result=data;
  if(!result||result.invoice_id!==lookup.invoice.id||typeof result.preference_changed!=="boolean"
    ||(result.preference_changed&&result.source_event_id===null)
    ||(result.source_event_id!==null&&!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(result.source_event_id??"")))return responseError("This payment preference could not be confirmed. Refresh to review its saved status.",503);
  const changed=result.preference_changed;
  const notificationFailed=result.source_event_id?!(await deliverCustomerSourceEvent({id:result.source_event_id})).prepared:false;

  return NextResponse.json({ ok: true, changed, notificationFailed });
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const appBaseUrl = getCanonicalAppBaseUrl();
  return Boolean(appBaseUrl) && (!origin || origin === appBaseUrl);
}

function responseError(message: string, status: number, retryAfterSeconds?: number) {
  const headers = retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined;
  return NextResponse.json({ ok: false, message }, { status, headers });
}
