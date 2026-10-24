import "server-only";

import { callDeliveryCommand } from "@/lib/email/delivery-commands";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import {
  formatInvoicePortalTokenError,
  isInvoicePortalTokenTableMissing,
} from "@/lib/portal/invoice-token-errors";
import { decryptPortalToken, hashPortalToken } from "@/lib/portal/tokens";
import { getPortalUrl } from "@/lib/portal/urls";
import type {
  DataResult,
  InvoiceDetail,
  InvoicePortalToken,
  InvoiceWithRelations,
  JobWithRelations,
} from "@/lib/types/database";

export type InvoicePortalTokenSummary = Pick<
  InvoicePortalToken,
  "id" | "invoice_id" | "token_hint" | "expires_at" | "revoked_at" | "created_at"
> & {
  portalUrl: string | null;
  usable: boolean;
};

export type PortalInvoiceLookupStatus =
  | "ready"
  | "configuration_required"
  | "invalid"
  | "expired"
  | "revoked";

export type PortalInvoiceLookup = {
  status: PortalInvoiceLookupStatus;
  invoice: InvoiceDetail | null;
  message: string;
};

export async function getInvoicePortalTokens(invoiceId: string): Promise<DataResult<InvoicePortalTokenSummary[]> & { linkVersion: string | null }> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured.", linkVersion: null };
  const { data, error } = await callDeliveryCommand(supabase, "get_invoice_link_state", { p_invoice_id: invoiceId });
  if (error || !data || typeof data.link_version !== "string" || !/^[a-f0-9]{64}$/.test(data.link_version) || !Array.isArray(data.tokens)
    || data.tokens.some((t: unknown) => !t || typeof t !== "object" || typeof (t as { id?: unknown }).id !== "string" || typeof (t as { usable?: unknown }).usable !== "boolean"
      || !((t as { token_encrypted?: unknown }).token_encrypted === null || typeof (t as { token_encrypted?: unknown }).token_encrypted === "string")))
    return { data: [], error: formatInvoicePortalTokenError(error?.message ?? "Invoice links could not be loaded. Reload before changing them."), linkVersion: null };
  const records = await Promise.all(data.tokens.map(async (token: InvoicePortalToken & { usable: boolean }) => {
    const raw = token.usable ? decryptPortalToken(token.token_encrypted) : null;
    return { id: token.id, invoice_id: token.invoice_id, token_hint: token.token_hint, expires_at: token.expires_at, revoked_at: token.revoked_at, created_at: token.created_at,
      usable: token.usable, portalUrl: raw && hashPortalToken(raw) === token.token_hash ? await getPortalUrl("invoice", raw) : null };
  }));
  return { data: records, error: null, linkVersion: data.link_version };
}

export async function getInvoiceByPortalToken(rawToken: string): Promise<PortalInvoiceLookup> {
  const supabase = getServiceRoleClient();
  const tokenHash = hashPortalToken(rawToken);

  if (!supabase) {
    return portalLookup("configuration_required", "Secure invoice links are not configured yet.");
  }

  if (!tokenHash) {
    return portalLookup("invalid", "This secure invoice link is not valid.");
  }

  const { data: token, error: tokenError } = await supabase
    .from("invoice_portal_tokens")
    .select("invoice_id, customer_id, organization_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenError) {
    console.error("Invoice portal token lookup failed", tokenError);
    return isInvoicePortalTokenTableMissing(tokenError.message)
      ? portalLookup(
          "configuration_required",
          "Secure invoice links are not configured yet. Please contact Angel Tree Services.",
        )
      : portalLookup("invalid", "This secure invoice link is not valid.");
  }

  if (!token) {
    return portalLookup("invalid", "This secure invoice link is not valid.");
  }

  if (token.revoked_at) {
    return portalLookup("revoked", "This secure invoice link has been revoked. Please contact Angel Tree Services.");
  }

  if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) {
    return portalLookup("expired", "This secure invoice link has expired. Please contact Angel Tree Services.");
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "*, service_locations:service_locations!invoices_service_location_id_fkey(id, label, street, city, state, postal_code), jobs(id, status, service_type, requested_scope, service_locations(id, label, street, city, state, postal_code)), customers:customers!invoices_customer_id_fkey(id, display_name, phone, email), organizations(id, name, billing_phone, billing_email), invoice_line_items(*), payments(*)",
    )
    .eq("id", token.invoice_id)
    .single();

  if (invoiceError || !invoice) {
    return portalLookup("invalid", "This invoice is not available.");
  }

  if (token.customer_id !== invoice.customer_id || token.organization_id !== invoice.organization_id) {
    return portalLookup("invalid", "This secure invoice link is no longer available. Please contact Angel Tree Services.");
  }

  return {
    status: "ready",
    invoice: {
      ...(invoice as InvoiceWithRelations),
      jobs: (invoice as { jobs?: JobWithRelations | null }).jobs ?? null,
      notes: [],
    },
    message: "",
  };
}

function portalLookup(
  status: Exclude<PortalInvoiceLookupStatus, "ready">,
  message: string,
): PortalInvoiceLookup {
  return { status, invoice: null, message };
}
