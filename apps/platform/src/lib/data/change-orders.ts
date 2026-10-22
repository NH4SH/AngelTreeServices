import "server-only";
import { callDeliveryCommand } from "@/lib/email/delivery-commands";

import { decryptPortalToken, hashPortalToken } from "@/lib/portal/tokens";
import { getPortalUrl } from "@/lib/portal/urls";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { safeStaffMessage } from "@/lib/security/errors";
import type {
  ChangeOrderPortalToken,
  ChangeOrderWithRelations,
  DataResult,
  Job,
  OrganizationContact,
  Quote,
} from "@/lib/types/database";

const changeOrderSelect = `
  *,
  customers(id, display_name, email, phone),
  organizations(id, name, billing_email, billing_address, payment_terms),
  service_locations(id, label, street, city, state, postal_code),
  approval_contact:organization_contacts!change_orders_approval_contact_id_fkey(id, full_name, email, phone, is_active),
  requested_by_contact:organization_contacts!change_orders_requested_by_contact_id_fkey(id, full_name, email, phone, is_active),
  jobs(id, status, service_type, requested_scope, source_quote_id),
  source_quote:quotes!change_orders_source_quote_id_fkey(id, quote_number, total_cents, approved_at),
  invoices(id, invoice_number, status),
  change_order_line_items(*)
`;

export type ChangeOrderTokenSummary = Pick<
  ChangeOrderPortalToken,
  "id" | "token_hint" | "expires_at" | "viewed_at" | "used_at" | "revoked_at" | "created_at"
> & { portalUrl: string | null; usable: boolean };

export type ChangeOrderActivity = {
  id: string;
  event_type: string;
  actor_user_id: string | null;
  metadata_json: Record<string, boolean | number | string | null>;
  created_at: string;
};

export type ChangeOrderJobOption = {
  id: string;
  customer_id: string | null;
  organization_id: string | null;
  service_location_id: string;
  source_quote_id: string | null;
  status: string;
  service_type: string | null;
  customers: { display_name: string } | null;
  organizations: { name: string } | null;
  service_locations: { label: string | null; street: string; city: string } | null;
};

export async function getChangeOrders(): Promise<DataResult<ChangeOrderWithRelations[]>> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };
  const { data, error } = await supabase.from("change_orders").select(changeOrderSelect).order("created_at", { ascending: false });
  return { data: (data ?? []) as ChangeOrderWithRelations[], error: error?.message ?? null };
}

export async function getChangeOrderDetail(id: string): Promise<DataResult<ChangeOrderWithRelations | null>> {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: "Supabase is not configured." };
  const { data, error } = await supabase.from("change_orders").select(changeOrderSelect).eq("id", id).maybeSingle();
  return { data: data as ChangeOrderWithRelations | null, error: error?.message ?? null };
}

export async function getChangeOrderFormOptions() {
  const supabase = await createClient();
  if (!supabase) return { jobs: [], quotes: [], contacts: [], error: "Supabase is not configured." };
  const [jobs, quotes, contacts] = await Promise.all([
    supabase.from("jobs").select("id, customer_id, organization_id, service_location_id, source_quote_id, status, service_type, customers:customers!jobs_customer_id_fkey(display_name), organizations(name), service_locations(label, street, city)").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("quotes").select("id, quote_number, customer_id, organization_id, service_location_id, job_id, status, total_cents").is("archived_at", null).eq("status", "approved").order("created_at", { ascending: false }),
    supabase.from("organization_contacts").select("*").eq("is_active", true).order("full_name"),
  ]);
  return {
    jobs: (jobs.data ?? []) as unknown as ChangeOrderJobOption[],
    quotes: (quotes.data ?? []) as Pick<Quote, "id" | "quote_number" | "customer_id" | "organization_id" | "service_location_id" | "job_id" | "status" | "total_cents">[],
    contacts: (contacts.data ?? []) as OrganizationContact[],
    error: jobs.error?.message ?? quotes.error?.message ?? contacts.error?.message ?? null,
  };
}

export async function getChangeOrderTokens(changeOrderId: string): Promise<DataResult<ChangeOrderTokenSummary[]> & { linkVersion: string | null }> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured.", linkVersion: null };
  const { data, error } = await callDeliveryCommand(supabase, "get_change_order_link_state", { p_change_order_id: changeOrderId });
  if (error || !data || !/^[a-f0-9]{64}$/.test(data.link_version) || !Array.isArray(data.tokens) || data.tokens.some((token: unknown) => !token || typeof token !== "object"
      || typeof (token as ChangeOrderPortalToken).id !== "string" || typeof (token as { usable?: unknown }).usable !== "boolean"
      || !((token as ChangeOrderPortalToken).token_encrypted === null || typeof (token as ChangeOrderPortalToken).token_encrypted === "string")))
    return { data: [], error: safeStaffMessage(error?.message ?? "Customer links could not be loaded. Reload before changing them."), linkVersion: null };
  const summaries = await Promise.all(data.tokens.map(async (token: ChangeOrderPortalToken & { usable: boolean }) => {
    const raw = token.usable ? decryptPortalToken(token.token_encrypted) : null;
    return { id: token.id, token_hint: token.token_hint, expires_at: token.expires_at, viewed_at: token.viewed_at, used_at: token.used_at,
      revoked_at: token.revoked_at, created_at: token.created_at, usable: token.usable,
      portalUrl: raw && hashPortalToken(raw) === token.token_hash ? await getPortalUrl("change-order", raw) : null } as ChangeOrderTokenSummary;
  }));
  return { data: summaries, error: null, linkVersion: data.link_version };
}

export async function getChangeOrderActivity(changeOrderId: string): Promise<DataResult<ChangeOrderActivity[]>> {
  const supabase = await createClient();
  if (!supabase) return { data: [], error: "Supabase is not configured." };
  const { data, error } = await supabase.from("activity_log").select("id, event_type, actor_user_id, metadata_json, created_at").eq("subject_type", "change_order").eq("subject_id", changeOrderId).order("created_at", { ascending: false }).limit(50);
  return { data: (data ?? []) as ChangeOrderActivity[], error: error?.message ?? null };
}

export async function getChangeOrderByPortalToken(rawToken: string) {
  const supabase = getServiceRoleClient();
  const tokenHash = hashPortalToken(rawToken);
  if (!supabase) return portalFailure("configuration_required", "Secure change order links are not configured yet.");
  if (!tokenHash) return portalFailure("invalid", "This secure change order link is not valid.");

  const result = await callDeliveryCommand(supabase, "get_change_order_portal_review", { p_token_hash: tokenHash });
  const document = result.data;
  if (result.error) return portalFailure("configuration_required", "This secure change order is temporarily unavailable. Please try again shortly.");
  if (!document || typeof document !== "object" || typeof document.review_hash !== "string" || !/^[a-f0-9]{64}$/.test(document.review_hash))
    return portalFailure("invalid", "This secure change order link is unavailable. It may have expired or been replaced. Contact our office for a current link.");
  // Preserve first-view telemetry without broadening the capability-scoped read.
  await supabase.from("change_order_portal_tokens").update({ viewed_at: new Date().toISOString() })
    .eq("token_hash", tokenHash).is("viewed_at", null).is("revoked_at", null);
  return { status: "ready" as const, changeOrder: document as ChangeOrderWithRelations & { review_hash: string }, message: "" };

}

function portalFailure(status: "configuration_required" | "invalid" | "expired" | "revoked", message: string) {
  return { status, changeOrder: null, message };
}
