import "server-only";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { firewoodInvoiceDocumentAccounting, isLiveFirewoodInvoice, unconfirmedFirewoodDocument } from "./firewood-invoice-accounting.mjs";
import type { InvoiceDetail } from "@/lib/types/database";

// Call only after the existing authorized invoice lookup. No credential or raw
// collector context leaves this server helper; ordinary invoices make no RPC.
export async function getFirewoodInvoiceDocumentAccounting(invoice: InvoiceDetail) {
  if (!isLiveFirewoodInvoice(invoice)) return null;
  const db = getServiceRoleClient();
  if (!db) return unconfirmedFirewoodDocument();
  try {
    const result = await db.rpc("get_firewood_live_collector_context", { p_invoice: invoice.id }).abortSignal(AbortSignal.timeout(5000));
    return result.error ? unconfirmedFirewoodDocument() : firewoodInvoiceDocumentAccounting(invoice, result.data);
  } catch {
    return unconfirmedFirewoodDocument();
  }
}
