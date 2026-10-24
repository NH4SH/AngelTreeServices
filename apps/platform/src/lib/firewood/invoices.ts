import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { firewoodProducts } from "./catalog";
export const firewoodInvoicePageSize = 20;
export type FirewoodInvoiceRow = { id: string; invoice_number: string | null; status: string; total_cents: number; balance_due_cents: number; created_at: string; customers: { display_name: string } | null };
export type FirewoodInvoicePage = { data: FirewoodInvoiceRow[]; count: number | null; page: number; error: string | null };
export async function readFirewoodInvoices(client: SupabaseClient | null, requested: unknown = 1): Promise<FirewoodInvoicePage> {
  const n = typeof requested === "string" && /^[1-9]\d*$/.test(requested) || typeof requested === "number" ? Number(requested) : 1;
  const page = Number.isSafeInteger(n) && n > 0 && n <= Math.floor(Number.MAX_SAFE_INTEGER / firewoodInvoicePageSize) ? n : 1;
  const fail = (): FirewoodInvoicePage => ({ data: [], count: null, page, error: "Firewood invoices could not be loaded. Refresh to try again." });
  if (!client) return fail();
  const signal = AbortSignal.timeout(5_000);
  function query(head = false) {
    return client!.from("invoices").select(head ? "id,invoice_line_items!inner(name)" : "id,invoice_number,status,total_cents,balance_due_cents,created_at,customers:customers!invoices_customer_id_fkey(display_name),invoice_line_items!inner(name)", { count: "exact", ...(head ? { head: true } : {}) })
      .in("invoice_line_items.name", [firewoodProducts.full.name, firewoodProducts.half.name]).not("customer_id", "is", null).is("archived_at", null);
  }
  const read = (p: number) => query().order("created_at", { ascending: false }).order("id", { ascending: true }).range((p - 1) * firewoodInvoicePageSize, p * firewoodInvoicePageSize - 1).abortSignal(signal);
  const validCount = (c: unknown): c is number => typeof c === "number" && Number.isSafeInteger(c) && c >= 0;
  try {
    let current = page, result = await read(page);
    if (current > 1 && (result.error?.code === "PGRST103" || !result.error && validCount(result.count) && (current - 1) * firewoodInvoicePageSize >= result.count)) {
      const total = await query(true).abortSignal(signal);
      if (total.error || !validCount(total.count)) return fail();
      if (!total.count) return { data: [], count: 0, page: 1, error: null };
      current = Math.min(current, Math.ceil(total.count / firewoodInvoicePageSize)); result = await read(current);
    }
    const rows: unknown = result.data;
    if (result.error || !validCount(result.count) || !Array.isArray(rows) || rows.length !== Math.min(firewoodInvoicePageSize, Math.max(0, result.count - (current - 1) * firewoodInvoicePageSize))
      || rows.some(row => !row || typeof row.id !== "string" || !["draft", "sent", "partially_paid", "paid", "overdue", "void"].includes(row.status) || !Number.isSafeInteger(row.total_cents) || !Number.isSafeInteger(row.balance_due_cents) || row.total_cents < 0 || row.balance_due_cents < 0 || !Array.isArray(row.invoice_line_items) || !row.invoice_line_items.some((line: { name?: string } | null) => line && [firewoodProducts.full.name as string, firewoodProducts.half.name as string].includes(line.name ?? "")) || !Number.isFinite(Date.parse(row.created_at)))) return fail();
    return { data: rows as FirewoodInvoiceRow[], count: result.count, page: current, error: null };
  } catch { return fail(); }
}
