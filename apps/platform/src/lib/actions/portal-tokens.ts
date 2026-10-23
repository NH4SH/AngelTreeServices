"use server";

import { revalidatePath } from "next/cache";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getQuoteByPortalToken } from "@/lib/data/portal-quote";
import { approveQuoteWithPortalToken } from "@/lib/quotes/workflow";
import { requestQuoteChanges } from "@/lib/quotes/change-request";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { performQuoteLinkCommand } from "@/lib/portal/quote-link-command";
import { performQuoteLinkBatchCommand } from "@/lib/portal/quote-link-batch";
import { parseQuoteLinkSelection } from "@/lib/portal/quote-link-attempt";
import { hashPortalToken } from "@/lib/portal/tokens";
import type { QuoteStatus } from "@/lib/types/database";
import { checkPortalActionRateLimit } from "@/lib/security/portal-rate-limit";
import { safeStaffMessage } from "@/lib/security/errors";
import { deliverCustomerSourceEvent } from "@/lib/notifications/source-events";

export type PortalTokenActionState = { ok: boolean; status: string; message: string; requestRejected?: boolean;
  saveRejected?: boolean; reviewRequired?: boolean; savedLinkVersion?: string; saveDestination?: string };
export type MultiQuotePortalRecoveryState = { ok: boolean; status: "idle" | "success" | "error"; message: string; portalUrls: Record<string,string>;
  saveRejected?: boolean; reviewRequired?: boolean; savedVersions?: Record<string,string>; saveDestination?: string };
function getString(form: FormData,key: string) { return String(form.get(key) ?? "").trim(); }
const uuid = (v: string) => /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export async function createQuotePortalLink(_previous: PortalTokenActionState,form: FormData): Promise<PortalTokenActionState> { return manageQuoteLink(form,"generate"); }
export async function regenerateQuotePortalLink(_previous: PortalTokenActionState,form: FormData): Promise<PortalTokenActionState> { return manageQuoteLink(form,"regenerate"); }
export async function revokeQuotePortalLink(_previous: PortalTokenActionState,form: FormData): Promise<PortalTokenActionState> { return manageQuoteLink(form,"revoke"); }
async function manageQuoteLink(form: FormData,intent: "generate" | "regenerate" | "revoke"): Promise<PortalTokenActionState> {
  const auth = await requireQuoteLinkRegenerator(); if(auth.error) return {...auth.error,saveRejected:true};
  const id=getString(form,"quote_id"),requestId=getString(form,"request_id"),version=getString(form,"expected_version"),tokenId=getString(form,"token_id")||null;
  if(!uuid(id)||!uuid(requestId)||!/^[a-f0-9]{64}$/.test(version)||(intent==="revoke"?!tokenId||!uuid(tokenId):tokenId!==null))
    return {ok:false,status:"error",message:"Reload the proposal before changing its customer link.",saveRejected:true,reviewRequired:true};
  const {data,error}=await performQuoteLinkCommand({quoteId:id,requestId,version,intent,tokenId,supabase:auth.supabase});
  if(error||!data)return quoteLinkFailure(error);
  revalidatePath(`/admin/quotes/${id}`);
  const messages:Record<string,string>={created:"Secure proposal link generated.",reused:"Existing proposal link reused.",regenerated:"Proposal link regenerated. Previous links are disabled.",revoked:"Selected proposal link revoked."};
  return {ok:true,status:"success",message:data.replayed?"Your earlier link action is confirmed. Review the current proposal links.":messages[data.outcome],savedLinkVersion:data.current_link_version,saveDestination:`/admin/quotes/${id}?link_action=${requestId}`};
}
function quoteLinkFailure(error: {code?:string;message:string}|null): PortalTokenActionState {
  const rejected=["PT409","40001","22023","22P02","22003","23503","23514","42501"].includes(error?.code??"");
  return {ok:false,status:"error",message:rejected?safeStaffMessage(error?.message??"Review the current proposal links."):"The proposal-link action could not be confirmed. Check the earlier action here safely.",saveRejected:rejected,reviewRequired:rejected};
}
export async function regenerateLegacyQuotePortalLinksForEmail(_previous: MultiQuotePortalRecoveryState,form: FormData): Promise<MultiQuotePortalRecoveryState> {
  const auth=await requireQuoteLinkRegenerator();if(auth.error)return {...auth.error,status:"error",portalUrls:{},saveRejected:true};
  const requestId=getString(form,"request_id");let selection;
  try { selection=parseQuoteLinkSelection(JSON.parse(getString(form,"link_selection"))); } catch { /* Reload rather than guessing newer links. */ }
  if(!uuid(requestId)||!selection)return {ok:false,status:"error",message:"Reload the selected proposals before replacing their older links.",portalUrls:{},saveRejected:true,reviewRequired:true};
  const {data,error}=await performQuoteLinkBatchCommand({requestId,selection,supabase:auth.supabase});
  if(error||!data)return {...quoteLinkFailure(error),status:"error",portalUrls:{}};
  for(const entry of selection)revalidatePath(`/admin/quotes/${entry.id}`);revalidatePath("/admin/quotes/email");
  const query=new URLSearchParams();for(const id of form.getAll("selected_quote_id").map(String).filter(uuid))query.append("quote_id",id);
  if(!query.has("quote_id"))for(const entry of selection)query.append("quote_id",entry.id);
  query.set("link_action",requestId);
  return {ok:true,status:"success",portalUrls:{},message:data.replayed?"Your earlier link replacements are confirmed. Review the current proposals.":"Proposal links are ready. No email was sent.",savedVersions:data.versions,saveDestination:`/admin/quotes/email?${query}`};
}

async function requireQuoteLinkRegenerator() {
  const supabase = await createClient();
  if (!supabase) {
    return { error: { ok: false, status: "error", message: "Supabase is not configured." } satisfies PortalTokenActionState };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: { ok: false, status: "error", message: "Sign in before regenerating customer links." } satisfies PortalTokenActionState };
  }

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
    return { error: { ok: false, status: "error", message: "Only internal staff can regenerate customer links." } satisfies PortalTokenActionState };
  }

  return { error: null, supabase, userId: user.id };
}

export async function approveQuoteByPortalToken(
  _previousState: PortalTokenActionState,
  formData: FormData,
): Promise<PortalTokenActionState> {
  const rawToken = getString(formData, "token");
  const rateLimit = await checkPortalActionRateLimit("quote-approve", rawToken);
  if (!rateLimit.available) return { ok: false, status: "error", message: "Quote responses are temporarily unavailable. Please try again shortly." };
  if (!rateLimit.allowed) return { ok: false, status: "error", message: "Please wait before submitting another response." };
  const lookup = await getQuoteByPortalToken(rawToken);
  const supabase = getServiceRoleClient();

  if (!supabase || lookup.status !== "ready" || !lookup.quote || !lookup.tokenId) {
    return { ok: false, status: "error", message: safeStaffMessage(lookup.message, "This quote link is not available."), requestRejected: Boolean(supabase) && lookup.status !== "configuration_required" };
  }

  if (!canCustomerRespondToQuote(lookup.quote.status) && lookup.quote.status !== "approved") {
    return { ok: false, status: "error", message: "This quote is no longer open for approval.", requestRejected: true };
  }

  const tokenHash = hashPortalToken(rawToken);
  if (!tokenHash) return { ok: false, status: "error", message: "This quote link is unavailable.", requestRejected: true };
  const approvalResult = await approveQuoteWithPortalToken(supabase, tokenHash, Number(formData.get("expected_revision")));

  if (!approvalResult.ok) {
    return { ok: false, status: "error", message: safeStaffMessage(approvalResult.message, "The quote could not be approved."), requestRejected: approvalResult.rejected === true };
  }

  await deliverCustomerSourceEvent({key: `quote:${lookup.quote.id}:portal-approved`});

  revalidatePortalQuote(rawToken, lookup.quote.id);
  return { ok: true, status: "success", message: "Thank you. Your quote has been approved. Angel Tree Services will follow up with scheduling details." };
}

export async function requestQuoteChangesByPortalToken(
  _previousState: PortalTokenActionState,
  formData: FormData,
): Promise<PortalTokenActionState> {
  const rawToken = getString(formData, "token");
  const message = getString(formData, "message");
  const rateLimit = await checkPortalActionRateLimit("quote-change-request", rawToken);
  if (!rateLimit.available) return { ok: false, status: "error", message: "Quote responses are temporarily unavailable. Please try again shortly." };
  if (!rateLimit.allowed) return { ok: false, status: "error", message: "Please wait before submitting another response." };
  const supabase = getServiceRoleClient();
  if (!supabase) return { ok: false, status: "error", message: "Quote responses are temporarily unavailable. Please try again shortly." };
  const result = await requestQuoteChanges(supabase, {
    requestId: getString(formData, "request_id"), tokenHash: hashPortalToken(rawToken),
    expectedRevision: Number(getString(formData, "expected_revision")), message,
  });
  if (!result.ok) return { ok: false, status: "error", message: result.message, requestRejected: result.rejected };
  const receipt = result.receipt;
  await deliverCustomerSourceEvent({key: `quote:${receipt.quote_id}:change-request:${receipt.note_id}`});
  revalidatePortalQuote(rawToken, receipt.quote_id);
  return { ok: true, status: "success", message: "Your change request is saved for our office to review. This does not approve the work. View the current proposal for its latest scope and status." };
}

function canCustomerRespondToQuote(status: QuoteStatus) {
  return status === "draft" || status === "sent" || status === "change_requested";
}

function revalidatePortalQuote(rawToken: string, quoteId: string) {
  revalidatePath(`/portal/quote/${rawToken}`);
  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
}
