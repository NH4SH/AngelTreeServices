import { NextResponse } from "next/server";
import { getInvoiceByPortalToken } from "@/lib/data/portal-invoice";
import { getSuccessfulPaymentTotal } from "@/lib/payments/reconciliation";
import { isInvoicePaymentPreference } from "@/lib/payments/payment-options";
import { notifyOfficeOfInvoicePaymentPreference } from "@/lib/payments/preference-notification";
import { hashPortalToken } from "@/lib/portal/tokens";
import { getServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isSameOrigin(request)) {
    return responseError("This payment preference could not be saved.", 403);
  }

  const body = await request.json().catch(() => null) as { preference?: unknown } | null;
  if (!body || Object.keys(body).some((key) => key !== "preference") || !isInvoicePaymentPreference(body.preference)) {
    return responseError("Choose one of the available payment methods.", 400);
  }

  const { token } = await params;
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

  if (changed && (body.preference === "cash_check_pickup" || body.preference === "check_mail")) {
    const payments = await getSuccessfulPaymentTotal(supabase, lookup.invoice.id);
    const notification = await notifyOfficeOfInvoicePaymentPreference({
      appBaseUrl: new URL(request.url).origin,
      balanceDueCents: Math.max(0, lookup.invoice.total_cents - payments.totalCents),
      customerName: lookup.invoice.organizations?.name ?? lookup.invoice.customers?.display_name ?? "Customer",
      invoiceId: lookup.invoice.id,
      invoiceNumber: lookup.invoice.invoice_number,
      preference: body.preference,
      supabase,
    });
    notificationFailed = !notification.ok;
    if (notificationFailed) {
      console.error("Invoice payment preference notification failed", {
        invoiceId: lookup.invoice.id,
        message: notification.message,
      });
    }
  }

  return NextResponse.json({ ok: true, changed, notificationFailed });
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function responseError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}
