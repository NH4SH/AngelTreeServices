import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canRecordManualInvoicePayment, isInvoiceCustomerPayable, isInvoiceReminderEligible } from "@/lib/payments/invoice-payment-state";
import type { InvoiceStatus } from "@/lib/types/database";
import { invoiceStatusesForScope, type MobileInvoiceScope } from "@/lib/api/mobile-invoices";

const invoiceSelect = "id, invoice_number, status, customer_id, organization_id, service_location_id, job_id, quote_id, subtotal_cents, tax_cents, total_cents, balance_due_cents, due_at, sent_at, paid_at, created_at, updated_at, customers:customers!invoices_customer_id_fkey(id, display_name), organizations(id, name), service_locations(id, label, street, city, state, postal_code), jobs(id, service_type), quotes(id, quote_number), invoice_line_items(id, name, description, quantity, unit_price_cents, total_cents, sort_order), payments(id, amount_cents, payment_method, provider, status, paid_at, reference, notes)";

export async function listMobileInvoices(supabase: SupabaseClient, input: { scope: MobileInvoiceScope; cursor: string | null; limit: number; query: string | null }) {
  const query = input.query?.trim().toLowerCase().slice(0, 160) || "";
  const offset = decodeCursor(input.cursor, input.scope, query);
  let index = supabase.from("admin_record_search").select("record_id").eq("record_type", "invoice").is("archived_at", null)
    .in("status", invoiceStatusesForScope(input.scope)).order("created_at", { ascending: false });
  if (query) index = index.ilike("search_text", `%${escapeLike(query)}%`);
  const { data: ids, error: indexError } = await index.range(offset, offset + input.limit);
  if (indexError) throw indexError;
  const pageIds = (ids ?? []).slice(0, input.limit).map((row) => row.record_id);
  if (!pageIds.length) return { results: [], nextCursor: null };
  const { data, error } = await supabase.from("invoices").select(invoiceSelect).in("id", pageIds);
  if (error) throw error;
  const byId = new Map((data ?? []).map((invoice) => [invoice.id, invoice]));
  return { results: pageIds.map((id) => byId.get(id)).filter(Boolean).map(toInvoiceSummary), nextCursor: (ids ?? []).length > input.limit ? encodeCursor(offset + input.limit, input.scope, query) : null };
}

export async function getMobileInvoice(supabase: SupabaseClient, invoiceId: string) {
  const { data, error } = await supabase.from("invoices").select(invoiceSelect).eq("id", invoiceId).single();
  if (error || !data) throw error ?? new Error("Invoice not found or no access.");
  const [token, activity] = await Promise.all([
    supabase.from("invoice_portal_tokens").select("id, expires_at, revoked_at").eq("invoice_id", invoiceId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("activity_log").select("id, event_type, created_at").eq("subject_type", "invoice").eq("subject_id", invoiceId).order("created_at", { ascending: false }).limit(20),
  ]);
  const summary = toInvoiceSummary(data);
  const status = data.status as InvoiceStatus;
  return { ...summary, lines: sortedLines(data.invoice_line_items), payments: successfulPayments(data.payments), activity: activity.data ?? [], portalStatus: portalStatus(token.data), canRecordManualPayment: canRecordManualInvoicePayment(status, data.balance_due_cents), customerPayable: isInvoiceCustomerPayable(status, data.balance_due_cents), reminderEligible: isInvoiceReminderEligible(status, data.balance_due_cents) };
}

function toInvoiceSummary(invoice: any) {
  const customer = one(invoice.customers); const organization = one(invoice.organizations); const location = one(invoice.service_locations);
  return { id: invoice.id, invoiceNumber: invoice.invoice_number, status: invoice.status, totalCents: invoice.total_cents, balanceDueCents: invoice.balance_due_cents, createdAt: invoice.created_at, sentAt: invoice.sent_at, paidAt: invoice.paid_at, dueAt: invoice.due_at, updatedAt: invoice.updated_at,
    party: organization ? { id: organization.id, kind: "organization", name: organization.name } : customer ? { id: customer.id, kind: "customer", name: customer.display_name } : null,
    serviceLocation: { id: location?.id ?? invoice.service_location_id, label: location?.label ?? null, fullAddress: [location?.street, location?.city, location?.state, location?.postal_code].filter(Boolean).join(", ") },
    linkedJobId: invoice.job_id, linkedQuoteId: invoice.quote_id };
}
function sortedLines(lines: any[] | null) { return [...(lines ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((line) => ({ id: line.id, name: line.name, description: line.description, quantity: Number(line.quantity), unitPriceCents: line.unit_price_cents, totalCents: line.total_cents })); }
function successfulPayments(payments: any[] | null) { return [...(payments ?? [])].sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at))).map((payment) => ({ id: payment.id, amountCents: payment.amount_cents, method: payment.payment_method, source: payment.provider === "manual" ? "manual" : "online", status: payment.status, paidAt: payment.paid_at, reference: payment.reference, notes: payment.provider === "manual" ? payment.notes : null })); }
function portalStatus(token: any) { if (!token) return "none"; if (token.revoked_at) return "revoked"; if (token.expires_at && new Date(token.expires_at) <= new Date()) return "expired"; return "active"; }
function one<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function escapeLike(value: string) { return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_"); }
function encodeCursor(offset: number, scope: string, query: string) { return Buffer.from(JSON.stringify({ offset, scope, query })).toString("base64url"); }
function decodeCursor(cursor: string | null, scope: string, query: string) { if (!cursor) return 0; try { const value = JSON.parse(Buffer.from(cursor, "base64url").toString()) as { offset: number; scope: string; query: string }; if (!Number.isSafeInteger(value.offset) || value.offset < 0 || value.scope !== scope || value.query !== query) throw new Error(); return value.offset; } catch { throw new Error("Invalid invoice cursor."); } }
