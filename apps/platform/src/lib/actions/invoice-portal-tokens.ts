"use server";
import { revalidatePath } from "next/cache";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { performInvoiceLinkCommand, type InvoiceLinkIntent } from "@/lib/portal/invoice-link-command";
import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";

export type InvoicePortalTokenActionState = { ok: boolean; status: "idle" | "success" | "error"; message: string;
  saveRejected?: boolean; reviewRequired?: boolean; savedLinkVersion?: string; saveDestination?: string };
const uuid = (v: string) => /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export async function createInvoicePortalLink(_state: InvoicePortalTokenActionState, form: FormData): Promise<InvoicePortalTokenActionState> { return manage(form, "generate"); }
export async function regenerateInvoicePortalLink(_state: InvoicePortalTokenActionState, form: FormData): Promise<InvoicePortalTokenActionState> { return manage(form, "regenerate"); }
export async function revokeInvoicePortalLink(_state: InvoicePortalTokenActionState, form: FormData): Promise<InvoicePortalTokenActionState> { return manage(form, "revoke"); }
async function manage(form: FormData, intent: InvoiceLinkIntent): Promise<InvoicePortalTokenActionState> {
  const auth = await requireInvoiceLinkAdmin();
  if (auth.error) return { ...auth.error, saveRejected: true };
  const id = String(form.get("invoice_id") ?? ""), requestId = String(form.get("request_id") ?? ""), version = String(form.get("expected_version") ?? "");
  const tokenId = String(form.get("token_id") ?? "") || null;
  if (!uuid(id) || !uuid(requestId) || !/^[a-f0-9]{64}$/.test(version) || (intent === "revoke" ? !tokenId || !uuid(tokenId) : tokenId !== null))
    return { ok: false, status: "error", message: "Reload the invoice before changing its customer link.", saveRejected: true, reviewRequired: true };
  const { data, error } = await performInvoiceLinkCommand({ invoiceId: id, requestId, version, intent, tokenId, supabase: auth.supabase });
  if (error || !data) {
    const rejected = ["PT409", "40001", "22023", "22P02", "22003", "23503", "23514", "42501"].includes(error?.code ?? "");
    return { ok: false, status: "error", message: rejected ? safeStaffMessage(error?.message ?? "Reload the invoice before continuing.") : "The invoice-link action could not be confirmed. Check the earlier action here safely.", saveRejected: rejected, reviewRequired: rejected };
  }
  revalidatePath(`/admin/invoices/${id}`);
  const message = { created: "Secure customer invoice link generated.", reused: "Existing customer invoice link reused.", regenerated: "Customer invoice link regenerated. Previous links are disabled.", revoked: "Selected customer invoice link revoked." }[data.outcome];
  return { ok: true, status: "success", message: data.replayed ? "Your earlier link action is confirmed. Review the current invoice links." : message ?? "Invoice link action confirmed.", savedLinkVersion: data.current_link_version, saveDestination: `/admin/invoices/${id}?link_action=${requestId}` };
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
