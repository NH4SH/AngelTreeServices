import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { QuoteEditError, quoteEditConflict, quoteSaveResult } from "@/lib/quotes/edit-result";
import { formatProposalNumber } from "@/lib/quotes/proposal-number";
import { quoteStatusesForScope, type MobileQuoteScope, type MobileQuoteWriteInput } from "@/lib/api/mobile-quotes";

const quoteSelect = "id, edit_revision, quote_number, status, customer_id, organization_id, service_location_id, recipient_contact_id, approval_contact_id, customer_message, subtotal_cents, tax_cents, total_cents, expires_at, sent_at, approved_at, created_at, updated_at, sent_method, customers:customers!quotes_customer_id_fkey(id, display_name), organizations(id, name), service_locations(id, label, street, city, state, postal_code), quote_line_items(id, name, description, quantity, unit_price_cents, total_cents, sort_order), jobs:jobs!quotes_job_id_fkey(id, status), invoices(id, invoice_number, status)";

export async function listMobileQuotes(supabase: SupabaseClient, input: { scope: MobileQuoteScope; cursor: string | null; limit: number; query: string | null }) {
  const offset = decodeCursor(input.cursor, input.scope, input.query);
  let index = supabase.from("admin_record_search").select("record_id").eq("record_type", "quote").is("archived_at", null)
    .in("status", quoteStatusesForScope(input.scope)).order("created_at", { ascending: false });
  const query = input.query?.trim().slice(0, 160).toLowerCase() || "";
  if (query) index = index.ilike("search_text", `%${escapeLike(query)}%`);
  const { data: ids, error: indexError } = await index.range(offset, offset + input.limit);
  if (indexError) throw indexError;
  const pageIds = (ids ?? []).slice(0, input.limit).map((row) => row.record_id);
  if (!pageIds.length) return { results: [], nextCursor: null };
  const { data, error } = await supabase.from("quotes").select(quoteSelect).in("id", pageIds);
  if (error) throw error;
  const byId = new Map((data ?? []).map((quote) => [quote.id, quote]));
  return {
    results: pageIds.map((id) => byId.get(id)).filter(Boolean).map(toDirectoryItem),
    nextCursor: (ids ?? []).length > input.limit ? encodeCursor(offset + input.limit, input.scope, query) : null,
  };
}

export async function getMobileQuote(supabase: SupabaseClient, quoteId: string) {
  const { data, error } = await supabase.from("quotes").select(quoteSelect).eq("id", quoteId).single();
  if (error || !data) throw error ?? new Error("Proposal not found or no access.");
  const { data: token } = await supabase.from("quote_portal_tokens").select("id, expires_at, revoked_at").eq("quote_id", quoteId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return { ...toDirectoryItem(data), recipientContactId: data.recipient_contact_id, approvalContactId: data.approval_contact_id, customerMessage: data.customer_message, lines: sortedLines(data.quote_line_items), editRevision: data.edit_revision, quoteEditVersion: 1, portalStatus: portalStatus(token) };
}

export async function createMobileQuote(supabase: SupabaseClient, userId: string, input: MobileQuoteWriteInput) {
  await validateOwnership(supabase, input);
  const lines = lineValues(input.lines);
  const { data: quote, error } = await supabase.rpc("create_quote_draft", {
    p_header: { customer_id: input.customerId, organization_id: input.organizationId, service_location_id: input.serviceLocationId,
      recipient_contact_id: input.recipientContactId, approval_contact_id: input.approvalContactId,
      customer_message: input.customerMessage, expires_at: normalizeDate(input.expiresAt) }, p_lines: lines,
  });
  if (error) throw error;
  if (!quoteSaveResult(quote, lines.length)) throw new QuoteEditError("The created proposal could not be confirmed. Check proposals before starting another draft.");
  return getMobileQuote(supabase, quote.id);
}

export async function updateMobileQuote(supabase: SupabaseClient, userId: string, quoteId: string, input: MobileQuoteWriteInput) {
  const { data: existing, error: lookupError } = await supabase.from("quotes").select("id, status, customer_id, organization_id").eq("id", quoteId).single();
  if (lookupError || !existing) throw lookupError ?? new Error("Proposal not found or no access.");
  if (!["draft", "sent", "change_requested"].includes(existing.status)) throw new Error("Approved, declined, expired, or cancelled proposals are locked.");
  if (existing.customer_id !== input.customerId || existing.organization_id !== input.organizationId) throw new Error("Change the contracting party in the full CRM.");
  await validateOwnership(supabase, input);
  const lines = lineValues(input.lines);
  if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) throw new QuoteEditError("Refresh proposals and update the app before saving edits.", 409);
  const response = await supabase.rpc("save_quote_details", {
    p_quote_id: quoteId, p_expected_revision: input.expectedRevision,
    p_header: { customer_id: input.customerId, organization_id: input.organizationId, service_location_id: input.serviceLocationId,
      recipient_contact_id: input.recipientContactId, approval_contact_id: input.approvalContactId,
      customer_message: input.customerMessage, expires_at: normalizeDate(input.expiresAt) }, p_lines: lines,
  });
  if (response.error) throw response.error;
  const conflict = quoteEditConflict(response.data);
  if (conflict) throw new QuoteEditError("This proposal changed while you were editing. Keep your changes and review the latest saved proposal before retrying.", 409, conflict);
  if (!quoteSaveResult(response.data, lines.length)) throw new QuoteEditError("The save could not be confirmed. Keep your changes and review the saved proposal.", 503);
  return getMobileQuote(supabase, quoteId);
}

export async function duplicateMobileQuote(supabase: SupabaseClient, userId: string, quoteId: string) {
  const source = await getMobileQuote(supabase, quoteId);
  return createMobileQuote(supabase, userId, {
    customerId: source.party?.kind === "customer" ? source.party.id : null,
    organizationId: source.party?.kind === "organization" ? source.party.id : null,
    serviceLocationId: source.serviceLocation.id,
    customerMessage: source.customerMessage,
    expiresAt: source.expiresAt && new Date(source.expiresAt) > new Date() ? source.expiresAt : null,
    recipientContactId: source.recipientContactId,
    approvalContactId: source.approvalContactId,
    lines: source.lines.map((line) => ({ name: line.name, description: line.description, quantity: line.quantity, unitPriceCents: line.unitPriceCents })),
  });
}

async function validateOwnership(supabase: SupabaseClient, input: MobileQuoteWriteInput) {
  const { data: location, error } = await supabase.from("service_locations").select("id, customer_id, organization_id").eq("id", input.serviceLocationId).single();
  if (error || !location || location.customer_id !== (input.customerId ?? null) || location.organization_id !== (input.organizationId ?? null)) throw new Error("The service location does not belong to that contracting party.");
  if (input.organizationId) {
    if (!input.recipientContactId || !input.approvalContactId) throw new Error("Choose a recipient and approval contact.");
    const ids = [...new Set([input.recipientContactId, input.approvalContactId])];
    const { data } = await supabase.from("organization_contacts").select("id").eq("organization_id", input.organizationId).eq("is_active", true).in("id", ids);
    if ((data ?? []).length !== ids.length) throw new Error("Choose active contacts from this organization.");
  }
}

function lineValues(lines: MobileQuoteWriteInput["lines"]) { return lines.map((line, sort_order) => ({ id: line.id ?? null, name: line.name, description: line.description, quantity: line.quantity, unit_price_cents: line.unitPriceCents, total_cents: Math.max(0, Math.round(line.quantity * line.unitPriceCents)), sort_order })); }
function sortedLines(lines: any[] | null) { return [...(lines ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((line) => ({ id: line.id, name: line.name, description: line.description, quantity: Number(line.quantity), unitPriceCents: line.unit_price_cents, totalCents: line.total_cents })); }
function toDirectoryItem(quote: any) { const customer = one(quote.customers); const organization = one(quote.organizations); const location = one(quote.service_locations); const lines = sortedLines(quote.quote_line_items); return { id: quote.id, proposalNumber: formatProposalNumber(quote.quote_number), status: quote.status, title: lines[0]?.name ?? "Tree service proposal", totalCents: quote.total_cents, createdAt: quote.created_at, sentAt: quote.sent_at, approvedAt: quote.approved_at, expiresAt: quote.expires_at, updatedAt: quote.updated_at, party: organization ? { id: organization.id, kind: "organization", name: organization.name } : customer ? { id: customer.id, kind: "customer", name: customer.display_name } : null, serviceLocation: { id: location?.id ?? quote.service_location_id, label: location?.label ?? null, fullAddress: [location?.street, location?.city, location?.state, location?.postal_code].filter(Boolean).join(", ") }, linkedJobId: one(quote.jobs)?.id ?? null, linkedInvoiceId: one(quote.invoices)?.id ?? null } as const; }
function portalStatus(token: any) { if (!token) return "none"; if (token.revoked_at) return "revoked"; if (token.expires_at && new Date(token.expires_at) <= new Date()) return "expired"; return "active"; }
function one<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function normalizeDate(value?: string | null) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function escapeLike(value: string) { return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_"); }
function encodeCursor(offset: number, scope: string, query: string) { return Buffer.from(JSON.stringify({ offset, scope, query })).toString("base64url"); }
function decodeCursor(cursor: string | null, scope: string, query: string | null) { if (!cursor) return 0; try { const value = JSON.parse(Buffer.from(cursor, "base64url").toString()) as { offset: number; scope: string; query: string }; if (!Number.isSafeInteger(value.offset) || value.offset < 0 || value.scope !== scope || value.query !== (query?.trim().toLowerCase() || "")) throw new Error(); return value.offset; } catch { throw new Error("Invalid proposal cursor."); } }
