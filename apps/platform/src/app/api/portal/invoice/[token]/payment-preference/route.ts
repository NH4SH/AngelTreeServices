import { NextResponse } from "next/server";
import { getInvoiceByPortalToken } from "@/lib/data/portal-invoice";
import { getSuccessfulPaymentTotal } from "@/lib/payments/reconciliation";
import { isInvoicePaymentPreference } from "@/lib/payments/payment-options";
import { emitCustomerActivity } from "@/lib/notifications/customer-activity";
import { paymentPreferenceLabel } from "@/lib/payments/payment-options";
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

  const { data, error } = await supabase.rpc("record_invoice_payment_preference", {
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

  const result = Array.isArray(data) ? data[0] : data;
  const changed = Boolean(result?.preference_changed);
  let notificationFailed = false;

  if (changed) {
    const payments = await getSuccessfulPaymentTotal(supabase, lookup.invoice.id);
    const customerName = lookup.invoice.organizations?.name ?? lookup.invoice.customers?.display_name ?? "Customer";
    await emitCustomerActivity({
      category: "payments",
      customerId: lookup.invoice.customer_id,
      destinationPath: `/admin/invoices/${lookup.invoice.id}`,
      eventType: "customer_selected_payment_preference",
      idempotencyKey: `invoice:${lookup.invoice.id}:payment-preference:${body.preference}:${Date.now()}`,
      invoiceId: lookup.invoice.id,
      metadata: {
        balance_due_cents: Math.max(0, lookup.invoice.total_cents - payments.totalCents),
        payment_preference: body.preference,
      },
      organizationId: lookup.invoice.organization_id,
      recordLabel: lookup.invoice.invoice_number || "Invoice",
      subjectId: lookup.invoice.id,
      subjectType: "invoice",
      summary: `${customerName} selected ${paymentPreferenceLabel(body.preference)} for ${lookup.invoice.invoice_number || "an invoice"}. No payment was recorded.`,
      title: "Customer selected a payment option",
    });
  }

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
