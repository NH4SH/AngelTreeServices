import { apiError, apiSuccess } from "@/lib/api/responses";
import { canViewMobileInvoices, normalizeMobileInvoiceScope } from "@/lib/api/mobile-invoices";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { listMobileInvoices } from "@/lib/data/mobile-invoices";

export async function GET(request: Request) {
  const auth = await getCrewApiContext(request);
  if (!auth.context) return apiError(auth.error.code, auth.error.message, auth.error.status);
  if (!canViewMobileInvoices(auth.context.roles)) return apiError("invoice_access_forbidden", "Your account cannot view invoices.", 403);
  const url = new URL(request.url); const scope = normalizeMobileInvoiceScope(url.searchParams.get("scope") ?? "outstanding");
  if (!scope) return apiError("invalid_invoice_scope", "Choose a valid invoice view.", 400);
  try { return apiSuccess(await listMobileInvoices(auth.context.supabase, { scope, cursor: url.searchParams.get("cursor"), query: url.searchParams.get("q"), limit: Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "25", 10) || 25)) })); }
  catch (error) { console.error("Mobile invoice directory failed", error); return apiError("invoice_directory_unavailable", error instanceof Error && error.message.includes("cursor") ? "Refresh invoices and try again." : "Invoices are temporarily unavailable.", 503); }
}
