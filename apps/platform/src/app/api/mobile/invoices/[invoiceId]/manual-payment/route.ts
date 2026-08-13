import { apiError, apiSuccess } from "@/lib/api/responses";
import { canRecordMobilePayments, validateMobileManualPayment } from "@/lib/api/mobile-invoices";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { getMobileInvoice } from "@/lib/data/mobile-invoices";
import { reconcileInvoiceBalance } from "@/lib/payments/reconciliation";

export async function POST(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);
  if (!canRecordMobilePayments(auth.context.roles)) return apiError("manual_payment_forbidden", "Only owners and admins can record manual payments.", 403);
  const input = validateMobileManualPayment(await request.json().catch(() => null));
  if (!input.value) return apiError("invalid_manual_payment", input.error, 400);
  const invoiceId = (await context.params).invoiceId;
  const { error } = await auth.context.supabase.rpc("record_manual_invoice_payment", { p_invoice_id: invoiceId, p_amount_cents: input.value.amountCents, p_paid_at: input.value.receivedAt, p_method: input.value.method, p_reference: input.value.reference, p_notes: input.value.notes });
  if (error) { console.error("Mobile manual payment failed", { code: error.code, invoiceId }); return apiError("manual_payment_failed", "The payment was not recorded. Check the balance and try again.", 400); }
  const reconciliation = await reconcileInvoiceBalance(auth.context.supabase, invoiceId);
  if (!reconciliation.ok) return apiError("manual_payment_reconciliation_failed", "Payment was recorded, but the invoice needs review in the full CRM.", 503);
  return apiSuccess({ invoice: await getMobileInvoice(auth.context.supabase, invoiceId), canRecordPayments: true });
}
