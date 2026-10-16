import { apiError, apiSuccess } from "@/lib/api/responses";
import { canRecordMobilePayments, validateMobileManualPayment, isManualPaymentRequestId } from "@/lib/api/mobile-invoices";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { getMobileInvoice } from "@/lib/data/mobile-invoices";
import { syncReconciledPaymentCommunications } from "@/lib/payments/reconciliation";

export async function POST(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);
  if (!canRecordMobilePayments(auth.context.roles)) return apiError("manual_payment_forbidden", "Only owners and admins can record manual payments.", 403);
  const body = await request.json().catch(() => null);
  const invoiceId = (await context.params).invoiceId;
  if (body?.intent === "resolve") {
    if (!isManualPaymentRequestId(body.requestId)) return apiError("invalid_manual_payment", "Choose a valid saved payment attempt.", 400);
    const { data, error } = await auth.context.supabase.rpc("resolve_manual_invoice_payment_request", { p_request_id: body.requestId, p_invoice_id: invoiceId });
    if (error || !data || !["recorded", "abandoned"].includes(data.state)
      || (data.state === "recorded" && !isManualPaymentRequestId(data.payment_id))) return apiError("manual_payment_unknown", "Keep the saved payment attempt and try checking again.", 503);
    return apiSuccess({ invoice: await getMobileInvoice(auth.context.supabase, invoiceId), canRecordPayments: true, manualPaymentRequestVersion: 1,
      manualPayment: { requestId: body.requestId, paymentId: data.payment_id, state: data.state } });
  }
  const input = validateMobileManualPayment(body);
  if (!input.value) return apiError("invalid_manual_payment", input.error, 400);
  const { data, error } = await auth.context.supabase.rpc("record_manual_invoice_payment_request", { p_request_id: input.value.requestId, p_invoice_id: invoiceId, p_amount_cents: input.value.amountCents, p_paid_at: input.value.receivedAt, p_method: input.value.method, p_reference: input.value.reference, p_notes: input.value.notes });
  if (error || !isManualPaymentRequestId(data?.payment_id)) { console.error("Mobile manual payment unconfirmed", { code: error?.code, invoiceId }); return apiError("manual_payment_unknown", "Payment could not be confirmed. Retry the saved attempt or check it before changing details.", 503); }
  await syncReconciledPaymentCommunications(invoiceId);
  return apiSuccess({ invoice: await getMobileInvoice(auth.context.supabase, invoiceId), canRecordPayments: true, manualPaymentRequestVersion: 1,
    manualPayment: { requestId: input.value.requestId, paymentId: data.payment_id, state: "recorded", replayed: data.replayed } });
}
