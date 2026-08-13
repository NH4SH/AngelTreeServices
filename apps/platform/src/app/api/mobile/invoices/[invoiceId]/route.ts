import { apiError, apiSuccess } from "@/lib/api/responses";
import { canViewMobileInvoices } from "@/lib/api/mobile-invoices";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { getMobileInvoice } from "@/lib/data/mobile-invoices";

export async function GET(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);
  if (!canViewMobileInvoices(auth.context.roles)) return apiError("invoice_access_forbidden", "Your account cannot view invoices.", 403);
  try { return apiSuccess({ invoice: await getMobileInvoice(auth.context.supabase, (await context.params).invoiceId), canRecordPayments: auth.context.roles.some((role) => role === "owner" || role === "admin") }); }
  catch (error) { console.error("Mobile invoice detail failed", error); return apiError("invoice_not_found", "Invoice not found or no access.", 404); }
}
