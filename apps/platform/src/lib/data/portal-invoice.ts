import "server-only";

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
  "id" | "invoice_id" | "token_hint" | "expires_at" | "viewed_at" | "revoked_at" | "created_at"
> & {
  portalUrl: string | null;
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

export async function getInvoicePortalTokens(
  invoiceId: string,
): Promise<DataResult<InvoicePortalTokenSummary[]>> {
  const supabase = await createClient();

  if (!supabase) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("invoice_portal_tokens")
    .select("id, invoice_id, token_hint, token_encrypted, expires_at, viewed_at, revoked_at, created_at")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: formatInvoicePortalTokenError(error.message) };
  }

  const tokenRows = data ?? [];
  const records = await Promise.all(tokenRows.map(async (token) => {
    const isActive = !token.revoked_at && (!token.expires_at || new Date(token.expires_at).getTime() > Date.now());
    const rawToken = isActive ? decryptPortalToken(token.token_encrypted) : null;
    const { token_encrypted: _tokenEncrypted, ...summary } = token;

    return {
      ...summary,
      portalUrl: rawToken ? await getPortalUrl("invoice", rawToken) : null,
    } as InvoicePortalTokenSummary;
  }));

  return { data: records, error: null };
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
    .select("id, invoice_id, expires_at, viewed_at, revoked_at")
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
      "*, jobs(id, status, service_type, requested_scope, service_locations(id, label, street, city, state, postal_code)), customers(id, display_name, phone, email), organizations(id, name, billing_phone, billing_email), invoice_line_items(*), payments(*)",
    )
    .eq("id", token.invoice_id)
    .single();

  if (invoiceError || !invoice) {
    return portalLookup("invalid", "This invoice is not available.");
  }

  if (!token.viewed_at) {
    await supabase
      .from("invoice_portal_tokens")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", token.id)
      .is("viewed_at", null);
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
