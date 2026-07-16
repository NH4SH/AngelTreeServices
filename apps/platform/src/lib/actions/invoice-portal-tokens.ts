"use server";

import { revalidatePath } from "next/cache";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createNewInvoicePortalTokenRecord, createOrGetInvoicePortalTokenRecord, getActiveInvoicePortalTokens } from "@/lib/portal/invoice-links";
import { getPortalUrl } from "@/lib/portal/urls";
import { createClient } from "@/lib/supabase/server";

export type InvoicePortalTokenActionState = {
  ok: boolean;
  status: "idle" | "success" | "error";
  message: string;
  portalUrl?: string;
  expiresAt?: string;
  reusedExisting?: boolean;
};

const getString = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export async function createInvoicePortalLink(
  _previousState: InvoicePortalTokenActionState,
  formData: FormData,
): Promise<InvoicePortalTokenActionState> {
  const auth = await requireInvoiceLinkAdmin();

  if (auth.error) {
    return auth.error;
  }

  const invoiceId = getString(formData, "invoice_id");
  const { data: invoice, error: invoiceError } = await auth.supabase
    .from("invoices")
    .select("id, customer_id")
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    console.error("Invoice portal link invoice lookup failed", invoiceError);
    return { ok: false, status: "error", message: invoiceError?.message ?? "Invoice not found or no access." };
  }

  const token = await createOrGetInvoicePortalTokenRecord({
    invoiceId: invoice.id,
    supabase: auth.supabase,
  });

  if (token.error) {
    return { ok: false, status: "error", message: token.error };
  }

  revalidatePath(`/admin/invoices/${invoice.id}`);

  return {
    ok: true,
    status: "success",
    message: "Customer link ready.",
    portalUrl: await getPortalUrl("invoice", token.rawToken),
    expiresAt: token.expiresAt,
    reusedExisting: !token.created,
  };
}

export async function regenerateInvoicePortalLink(
  _previousState: InvoicePortalTokenActionState,
  formData: FormData,
): Promise<InvoicePortalTokenActionState> {
  const auth = await requireInvoiceLinkAdmin();

  if (auth.error) {
    return auth.error;
  }

  const invoiceId = getString(formData, "invoice_id");
  const { data: invoice, error: invoiceError } = await auth.supabase
    .from("invoices")
    .select("id, customer_id")
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    console.error("Invoice portal link invoice lookup failed", invoiceError);
    return { ok: false, status: "error", message: invoiceError?.message ?? "Invoice not found or no access." };
  }

  const activeTokenLookup = await getActiveInvoicePortalTokens(auth.supabase, invoice.id);
  if (activeTokenLookup.error) {
    return { ok: false, status: "error", message: activeTokenLookup.error };
  }

  const token = await createNewInvoicePortalTokenRecord({
    customerId: invoice.customer_id,
    invoiceId: invoice.id,
    supabase: auth.supabase,
    userId: auth.userId,
  });

  if (token.error) {
    return { ok: false, status: "error", message: token.error };
  }

  const activeTokenIds = activeTokenLookup.tokens.map((activeToken) => activeToken.id);
  if (activeTokenIds.length > 0) {
    const { error: revokeError } = await auth.supabase
      .from("invoice_portal_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("invoice_id", invoice.id)
      .in("id", activeTokenIds);

    if (revokeError) {
      await auth.supabase
        .from("invoice_portal_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", token.tokenId);
      return {
        ok: false,
        status: "error",
        message: "Could not regenerate the customer link. The previous link remains protected.",
      };
    }
  }

  revalidatePath(`/admin/invoices/${invoice.id}`);

  return {
    ok: true,
    status: "success",
    message: activeTokenIds.length
      ? "Secure customer invoice link regenerated. The previous active link is now revoked."
      : "Customer link ready.",
    portalUrl: await getPortalUrl("invoice", token.rawToken),
    expiresAt: token.expiresAt,
    reusedExisting: false,
  };
}

export async function revokeInvoicePortalLink(
  _previousState: InvoicePortalTokenActionState,
  formData: FormData,
): Promise<InvoicePortalTokenActionState> {
  const auth = await requireInvoiceLinkAdmin();

  if (auth.error) {
    return auth.error;
  }

  const invoiceId = getString(formData, "invoice_id");
  const tokenId = getString(formData, "token_id");
  const { data, error } = await auth.supabase
    .from("invoice_portal_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("invoice_id", invoiceId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Invoice portal link revoke failed", error);
    return { ok: false, status: "error", message: "Could not revoke the customer link. Please try again." };
  }

  if (!data) {
    return { ok: false, status: "error", message: "Invoice link not found or no access." };
  }

  revalidatePath(`/admin/invoices/${invoiceId}`);
  return { ok: true, status: "success", message: "Secure customer invoice link revoked." };
}

async function requireInvoiceLinkAdmin() {
  const supabase = await createClient();

  if (!supabase) {
    return { error: { ok: false, status: "error" as const, message: "Supabase is not configured." } };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: { ok: false, status: "error" as const, message: "Sign in before managing invoice links." } };
  }

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) {
    return {
      error: {
        ok: false,
        status: "error" as const,
        message: "Only owners and admins can manage customer invoice links.",
      },
    };
  }

  return { error: null, supabase, userId: user.id };
}
