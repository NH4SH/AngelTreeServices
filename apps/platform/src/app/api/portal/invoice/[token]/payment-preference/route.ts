import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-log";
import { getInvoiceByPortalToken } from "@/lib/data/portal-invoice";
import {
  formatPortalPaymentPreference,
  isPortalPaymentPreference,
  isOnlinePortalPaymentMethod,
} from "@/lib/payments/portal-methods";
import { getStripeServerConfig } from "@/lib/stripe/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const maxBodyBytes = 2_048;

type RouteProps = {
  params: Promise<{ token: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  const stripeConfig = getStripeServerConfig();
  const origin = request.headers.get("origin");
  if (origin && stripeConfig.configured && origin !== stripeConfig.appBaseUrl) {
    return response(false, "This payment preference could not be saved.", 403);
  }

  if (Number(request.headers.get("content-length") ?? 0) > maxBodyBytes) {
    return response(false, "This payment preference could not be saved.", 413);
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return response(false, "This payment preference could not be saved.", 415);
  }

  let body: { paymentMethod?: unknown };
  try {
    body = await request.json() as { paymentMethod?: unknown };
  } catch {
    return response(false, "This payment preference could not be saved.", 400);
  }

  if (!isPortalPaymentPreference(body.paymentMethod) || isOnlinePortalPaymentMethod(body.paymentMethod)) {
    return response(false, "Choose cash/check pickup or check by mail.", 400);
  }

  const { token } = await params;
  const lookup = await getInvoiceByPortalToken(token);
  if (lookup.status !== "ready" || !lookup.invoice) {
    return response(false, "This invoice link is not available.", 404);
  }

  if (!["sent", "partially_paid", "overdue"].includes(lookup.invoice.status) || lookup.invoice.balance_due_cents <= 0) {
    return response(false, "This invoice no longer has a balance due.", 409);
  }

  const supabase = getServiceRoleClient();
  if (!supabase) {
    return response(false, "We could not notify our office. Please call us instead.", 503);
  }

  await recordActivity(supabase, {
    actorUserId: null,
    eventType: "customer_payment_preference_selected",
    metadata: {
      payment_method: body.paymentMethod,
      payment_method_label: formatPortalPaymentPreference(body.paymentMethod),
    },
    subjectId: lookup.invoice.id,
    subjectType: "invoice",
  });

  const message = body.paymentMethod === "cash_check_pickup"
    ? "Thanks. Our office has been notified that you would like to arrange cash or check pickup."
    : "Thanks. Our office has been notified that you plan to mail a check.";

  return response(true, message, 200);
}

function response(ok: boolean, message: string, status: number) {
  return NextResponse.json({ ok, message }, { status, headers: { "Cache-Control": "no-store" } });
}
