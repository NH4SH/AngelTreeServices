"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createInvoicePortalTokenRecord } from "@/lib/portal/invoice-links";
import { createClient } from "@/lib/supabase/server";

export type InvoicePortalTokenActionState = {
  status: "idle" | "success" | "error";
  message: string;
  portalUrl?: string;
  expiresAt?: string;
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
    return { status: "error", message: invoiceError?.message ?? "Invoice not found or no access." };
  }

  const token = await createInvoicePortalTokenRecord({
    customerId: invoice.customer_id,
    invoiceId: invoice.id,
    supabase: auth.supabase,
    userId: auth.userId,
  });

  if (token.error) {
    return { status: "error", message: token.error };
  }

  revalidatePath(`/admin/invoices/${invoice.id}`);

  return {
    status: "success",
    message: "Secure customer invoice link generated. Copy it now; the raw token is not stored.",
    portalUrl: `${await getRequestOrigin()}/portal/invoice/${token.rawToken}`,
    expiresAt: token.expiresAt,
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
    return { status: "error", message: error.message };
  }

  if (!data) {
    return { status: "error", message: "Invoice link not found or no access." };
  }

  revalidatePath(`/admin/invoices/${invoiceId}`);
  return { status: "success", message: "Secure customer invoice link revoked." };
}

async function requireInvoiceLinkAdmin() {
  const supabase = await createClient();

  if (!supabase) {
    return { error: { status: "error" as const, message: "Supabase is not configured." } };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: { status: "error" as const, message: "Sign in before managing invoice links." } };
  }

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) {
    return {
      error: {
        status: "error" as const,
        message: "Only owners and admins can manage customer invoice links.",
      },
    };
  }

  return { error: null, supabase, userId: user.id };
}

async function getRequestOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
