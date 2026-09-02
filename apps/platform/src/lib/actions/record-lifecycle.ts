"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeStaffMessage } from "@/lib/security/errors";
import { hasMeaningfulCloseoutChild, hasMeaningfulCloseoutRecord } from "@/lib/records/closeout-history";

export type LifecycleRecordType = "customer" | "invoice" | "job" | "organization" | "quote" | "service_location";

export type RecordLifecyclePreview = {
  archivedAt: string | null;
  blockers: string[];
  canPermanentDelete: boolean;
  counts: Record<string, number>;
  label: string;
  recordId: string;
  recordType: LifecycleRecordType;
};

export type LifecycleActionState = { status: "idle" | "error" | "success"; message: string };

const tableByType: Record<LifecycleRecordType, string> = {
  customer: "customers",
  invoice: "invoices",
  job: "jobs",
  organization: "organizations",
  quote: "quotes",
  service_location: "service_locations",
};

export async function updateRecordLifecycle(_state: LifecycleActionState, formData: FormData): Promise<LifecycleActionState> {
  const supabase = await createClient();
  if (!supabase) return failure("Supabase is not configured.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("Sign in before changing a record.");
  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) return failure("Only an owner or administrator can archive records.");

  const recordType = lifecycleType(formData.get("record_type"));
  const recordId = String(formData.get("record_id") ?? "").trim();
  const intent = String(formData.get("intent") ?? "");
  if (!recordType || !recordId) return failure("Choose a valid record.");

  if (intent === "archive" || intent === "restore") {
    const archived = intent === "archive";
    const { data: changedRecord, error } = await supabase
      .from(tableByType[recordType])
      .update({ archived_at: archived ? new Date().toISOString() : null, archived_by_user_id: archived ? user.id : null })
      .eq("id", recordId)
      .select("id")
      .maybeSingle();
    if (error) return failure(error.message);
    if (!changedRecord) return failure("That record was not found or you do not have permission to change it.");
    await recordActivity(supabase, {
      actorUserId: user.id,
      eventType: archived ? `${recordType}_archived` : `${recordType}_restored`,
      metadata: { reversible: true },
      subjectId: recordId,
      subjectType: recordType,
    });
    revalidateLifecyclePaths(recordType, recordId);
    return { status: "success", message: archived ? "Record archived. It can be restored from the Archived view." : "Record restored." };
  }

  if (intent !== "permanent_delete") return failure("Choose archive, restore, or permanent delete.");
  if (!roles.includes("owner")) return failure("Only an owner can permanently delete records.");
  if (String(formData.get("confirmation") ?? "").trim() !== "DELETE") return failure("Type DELETE to confirm permanent deletion.");

  const preview = await getRecordLifecyclePreview(recordType, recordId);
  await writeDeletionAudit(supabase, user.id, preview, "permanent_delete_attempt");
  if (!preview.canPermanentDelete || preview.blockers.length) {
    await writeDeletionAudit(supabase, user.id, preview, "permanent_delete_blocked", preview.blockers.join("; "));
    return failure(preview.blockers[0] ?? "This record has protected history and cannot be permanently deleted.");
  }

  const deleteError = await permanentlyDeleteRecord(supabase, preview);
  if (deleteError) {
    await writeDeletionAudit(supabase, user.id, preview, "permanent_delete_blocked", deleteError);
    return failure(`Permanent deletion was stopped safely: ${deleteError}`);
  }
  await writeDeletionAudit(supabase, user.id, preview, "permanent_delete_success");
  revalidateLifecyclePaths(recordType, recordId);
  return { status: "success", message: "Record permanently deleted." };
}

export async function getRecordLifecyclePreview(recordType: LifecycleRecordType, recordId: string): Promise<RecordLifecyclePreview> {
  const empty: RecordLifecyclePreview = { archivedAt: null, blockers: ["Record could not be inspected."], canPermanentDelete: false, counts: {}, label: "Record", recordId, recordType };
  const authClient = await createClient();
  if (!authClient) return empty;
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return empty;
  const roles = await getUserRoles(authClient, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) return empty;

  // Dependency tables such as Stripe checkout sessions are intentionally
  // server-only. Authorization is established above before using this client.
  const supabase = getServiceRoleClient() ?? authClient;

  try {
    return await inspectRecordLifecycle(supabase, recordType, recordId, empty);
  } catch (error) {
    console.error("Record dependency preview failed closed", { error, recordId, recordType });
    return {
      ...empty,
      blockers: ["Linked records could not be fully inspected. Permanent deletion is disabled."],
    };
  }
}

async function inspectRecordLifecycle(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  recordType: LifecycleRecordType,
  recordId: string,
  empty: RecordLifecyclePreview,
) {
  if (recordType === "invoice") {
    const [record, payments, checkouts, documents, lines, tokens] = await Promise.all([
      supabase.from("invoices").select("id, invoice_number, status, archived_at").eq("id", recordId).maybeSingle(),
      supabase.from("payments").select("id, status, refunded_principal_cents, dispute_status").eq("invoice_id", recordId),
      countRows(supabase, "invoice_checkout_sessions", "invoice_id", recordId),
      countRows(supabase, "documents", "invoice_id", recordId),
      countRows(supabase, "invoice_line_items", "invoice_id", recordId),
      countRows(supabase, "invoice_portal_tokens", "invoice_id", recordId),
    ]);
    if (!record.data) return empty;
    const protectedPayments = (payments.data ?? []).filter((payment) => ["pending", "succeeded", "refunded"].includes(payment.status) || payment.refunded_principal_cents > 0 || payment.dispute_status);
    const blockers = [
      record.data.status !== "draft" ? "Only an unsent draft invoice can be permanently deleted." : null,
      protectedPayments.length ? "Payment, refund, or dispute history must be retained." : null,
      checkouts ? "Stripe Checkout history must be retained." : null,
      documents ? "Attached documents must be retained." : null,
    ].filter(Boolean) as string[];
    return preview(recordType, recordId, record.data.invoice_number || "Draft invoice", record.data.archived_at, { invoice: 1, lineItems: lines, customerLinks: tokens, payments: payments.data?.length ?? 0, documents, checkoutSessions: checkouts }, blockers, true);
  }

  if (recordType === "quote") {
    const [record, sourceJobs, invoices, documents, lines, tokens] = await Promise.all([
      supabase.from("quotes").select("id, quote_number, status, job_id, archived_at").eq("id", recordId).maybeSingle(),
      countRows(supabase, "jobs", "source_quote_id", recordId),
      countRows(supabase, "invoices", "quote_id", recordId),
      countRows(supabase, "documents", "quote_id", recordId),
      countRows(supabase, "quote_line_items", "quote_id", recordId),
      countRows(supabase, "quote_portal_tokens", "quote_id", recordId),
    ]);
    if (!record.data) return empty;
    const linkedJobs = sourceJobs + (record.data.job_id ? 1 : 0);
    const blockers = [
      record.data.status !== "draft" ? "Only a draft quote can be permanently deleted." : null,
      linkedJobs ? "The quote is linked to a work order." : null,
      invoices ? "The quote is linked to an invoice." : null,
      documents ? "Attached documents must be retained." : null,
    ].filter(Boolean) as string[];
    return preview(recordType, recordId, record.data.quote_number || "Draft quote", record.data.archived_at, { quote: 1, lineItems: lines, customerLinks: tokens, jobs: linkedJobs, invoices, documents }, blockers, true);
  }

  if (recordType === "job") {
    const [record, invoices, quotes, appointments, events, closeouts, timeEntries, costs, transactions, disposal, documents, changeOrders, communications, emailEvents] = await Promise.all([
      supabase.from("jobs").select("id, service_type, status, archived_at").eq("id", recordId).maybeSingle(),
      countRows(supabase, "invoices", "job_id", recordId),
      supabase.from("quotes").select("id, status").eq("job_id", recordId),
      countRows(supabase, "appointments", "job_id", recordId),
      countRows(supabase, "schedule_events", "job_id", recordId),
      countProtectedCloseoutHistory(supabase, [recordId]),
      countRows(supabase, "time_entries", "job_id", recordId),
      countRows(supabase, "job_cost_entries", "job_id", recordId),
      countRows(supabase, "inventory_transactions", "job_id", recordId),
      countRows(supabase, "disposal_records", "job_id", recordId),
      countRows(supabase, "documents", "job_id", recordId),
      countRows(supabase, "change_orders", "job_id", recordId),
      countRows(supabase, "customer_communications", "job_id", recordId),
      supabase.from("email_events").select("id, email_type").eq("related_job_id", recordId),
    ]);
    if (!record.data) return empty;
    if (emailEvents.error) throw emailEvents.error;
    const unsafeQuotes = (quotes.data ?? []).filter((quote) => quote.status !== "draft");
    const protectedEmailEvents = (emailEvents.data ?? []).filter((event) => event.email_type !== "lead_internal_notice").length;
    const disposableStatuses = ["new_lead", "estimate_scheduled", "quoted", "accepted", "lost", "cancelled"];
    const blockers = [
      !disposableStatuses.includes(record.data.status) ? "Completed, active, or billed work orders must be retained." : null,
      invoices ? "The work order has an invoice." : null,
      unsafeQuotes.length ? "The work order has a non-draft quote." : null,
      appointments || events ? "Scheduled work must be cancelled and retained." : null,
      closeouts ? "Crew closeout or safety history must be retained." : null,
      timeEntries ? "Employee time history must be retained." : null,
      costs || transactions || disposal ? "Material, disposal, or cost history must be retained." : null,
      documents ? "Attached documents must be retained." : null,
      changeOrders ? "Change-order history must be retained." : null,
      communications || protectedEmailEvents ? "Customer communication or delivery history must be retained." : null,
    ].filter(Boolean) as string[];
    return preview(recordType, recordId, record.data.service_type?.replaceAll("_", " ") || "Work order", record.data.archived_at, { job: 1, draftQuotes: quotes.data?.length ?? 0, invoices, appointments, scheduleEvents: events, closeouts, timeEntries, costRecords: costs + transactions + disposal, documents, changeOrders, communications: communications + protectedEmailEvents }, blockers, true);
  }

  if (recordType === "customer") {
    const [record, locations, jobs, quotes, invoices, payments, checkouts, deliveries, changes, recommendations, plans, documents] = await Promise.all([
      supabase.from("customers").select("id, display_name, archived_at").eq("id", recordId).maybeSingle(),
      countRows(supabase, "service_locations", "customer_id", recordId),
      supabase.from("jobs").select("id, status").eq("customer_id", recordId),
      supabase.from("quotes").select("id, status").eq("customer_id", recordId),
      supabase.from("invoices").select("id, status").eq("customer_id", recordId),
      supabase.from("payments").select("id, status, refunded_principal_cents, dispute_status").eq("customer_id", recordId),
      countRows(supabase, "invoice_checkout_sessions", "customer_id", recordId),
      countRows(supabase, "customer_deliveries", "customer_id", recordId),
      countRows(supabase, "change_orders", "customer_id", recordId),
      countRows(supabase, "service_recommendations", "customer_id", recordId),
      countRows(supabase, "recurring_service_plans", "customer_id", recordId),
      countRows(supabase, "documents", "customer_id", recordId),
    ]);
    if (!record.data) return empty;
    const jobIds = (jobs.data ?? []).map((job) => job.id);
    const quoteIds = (quotes.data ?? []).map((quote) => quote.id);
    const invoiceIds = (invoices.data ?? []).map((invoice) => invoice.id);
    const [appointments, events, closeouts, timeEntries, costs, inventory, disposal, childChangeOrders, childDocuments] = await Promise.all([
      countIn(supabase, "appointments", "job_id", jobIds),
      countIn(supabase, "schedule_events", "job_id", jobIds),
      countProtectedCloseoutHistory(supabase, jobIds),
      countIn(supabase, "time_entries", "job_id", jobIds),
      countIn(supabase, "job_cost_entries", "job_id", jobIds),
      countIn(supabase, "inventory_transactions", "job_id", jobIds),
      countIn(supabase, "disposal_records", "job_id", jobIds),
      countIn(supabase, "change_orders", "job_id", jobIds),
      Promise.all([
        countIn(supabase, "documents", "job_id", jobIds),
        countIn(supabase, "documents", "quote_id", quoteIds),
        countIn(supabase, "documents", "invoice_id", invoiceIds),
      ]).then((counts) => counts.reduce((sum, count) => sum + count, 0)),
    ]);
    const protectedPayments = (payments.data ?? []).filter((payment) => ["pending", "succeeded", "refunded"].includes(payment.status) || payment.refunded_principal_cents > 0 || payment.dispute_status);
    const protectedJobs = (jobs.data ?? []).filter((job) => !["new_lead", "estimate_scheduled", "quoted", "accepted", "lost", "cancelled"].includes(job.status));
    const protectedQuotes = (quotes.data ?? []).filter((quote) => quote.status !== "draft");
    const protectedInvoices = (invoices.data ?? []).filter((invoice) => invoice.status !== "draft");
    const blockers = [
      protectedPayments.length ? "Payment, refund, or dispute history must be retained." : null,
      protectedJobs.length ? "Completed, active, or billed work-order history must be retained." : null,
      protectedQuotes.length ? "Accepted or delivered quote history must be retained." : null,
      protectedInvoices.length ? "Sent, paid, overdue, or void invoice history must be retained." : null,
      checkouts ? "Stripe Checkout history must be retained." : null,
      deliveries || changes || recommendations || plans ? "Operational service history must be retained." : null,
      appointments || events ? "Scheduled work must be cancelled and retained." : null,
      closeouts || timeEntries ? "Crew closeout or employee time history must be retained." : null,
      costs || inventory || disposal || childChangeOrders ? "Material, cost, disposal, or change-order history must be retained." : null,
      documents || childDocuments ? "Attached documents must be retained." : null,
    ].filter(Boolean) as string[];
    return preview(recordType, recordId, record.data.display_name, record.data.archived_at, { customer: 1, properties: locations, jobs: jobs.data?.length ?? 0, draftQuotes: quotes.data?.length ?? 0, draftInvoices: invoices.data?.length ?? 0, payments: payments.data?.length ?? 0, scheduleRecords: appointments + events, crewRecords: closeouts + timeEntries, operationalRecords: costs + inventory + disposal + childChangeOrders, documents: documents + childDocuments }, blockers, true);
  }

  if (recordType === "organization") {
    const { data } = await supabase.from("organizations").select("id, name, archived_at").eq("id", recordId).maybeSingle();
    if (!data) return empty;
    return preview(recordType, recordId, data.name ?? "Organization", data.archived_at, { organization: 1 }, ["Use archive for organizations so linked history remains intact."], false);
  }
  const { data } = await supabase.from("service_locations").select("id, street, archived_at").eq("id", recordId).maybeSingle();
  if (!data) return empty;
  return preview(recordType, recordId, data.street ?? "Service location", data.archived_at, { service_location: 1 }, ["Use archive for service locations so linked history remains intact."], false);
}

async function permanentlyDeleteRecord(supabase: any, record: RecordLifecyclePreview) {
  if (record.recordType === "customer") {
    const [jobs, quotes, invoices, locations] = await Promise.all([
      idsFor(supabase, "jobs", "customer_id", record.recordId),
      idsFor(supabase, "quotes", "customer_id", record.recordId),
      idsFor(supabase, "invoices", "customer_id", record.recordId),
      idsFor(supabase, "service_locations", "customer_id", record.recordId),
    ]);
    if (invoices.length) { const result = await supabase.from("invoices").delete().in("id", invoices); if (result.error) return result.error.message; }
    if (quotes.length) { const result = await supabase.from("quotes").delete().in("id", quotes); if (result.error) return result.error.message; }
    if (jobs.length) { const result = await supabase.from("jobs").delete().in("id", jobs); if (result.error) return result.error.message; }
    if (locations.length) { const result = await supabase.from("service_locations").delete().in("id", locations); if (result.error) return result.error.message; }
  }
  if (record.recordType === "job") {
    const quoteIds = await idsFor(supabase, "quotes", "job_id", record.recordId);
    if (quoteIds.length) { const result = await supabase.from("quotes").delete().in("id", quoteIds); if (result.error) return result.error.message; }
  }
  const { error } = await supabase.from(tableByType[record.recordType]).delete().eq("id", record.recordId);
  return error?.message ?? null;
}

async function countRows(supabase: any, table: string, column: string, value: string) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (error) throw error;
  return count ?? 0;
}

async function countIn(supabase: any, table: string, column: string, values: string[]) {
  if (!values.length) return 0;
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).in(column, values);
  if (error) throw error;
  return count ?? 0;
}

async function countProtectedCloseoutHistory(supabase: any, jobIds: string[]) {
  if (!jobIds.length) return 0;

  const [closeouts, checklistItems, scopeItems] = await Promise.all([
    supabase
      .from("job_closeouts")
      .select("id, job_id, status, crew_internal_notes, customer_summary, incident_occurred, additional_work_requested, acknowledgment_status, submitted_at, reviewed_at, review_notes, reopened_at, reopen_reason, created_at, updated_at")
      .in("job_id", jobIds),
    supabase
      .from("job_closeout_checklist_items")
      .select("job_id, updated_by_user_id, created_at, updated_at")
      .in("job_id", jobIds),
    supabase
      .from("job_closeout_scope_items")
      .select("job_id, updated_by_user_id, created_at, updated_at")
      .in("job_id", jobIds),
  ]);
  if (closeouts.error) throw closeouts.error;
  if (checklistItems.error) throw checklistItems.error;
  if (scopeItems.error) throw scopeItems.error;

  const protectedJobIds = new Set<string>();
  const jobIdByCloseoutId = new Map<string, string>();
  for (const closeout of closeouts.data ?? []) {
    jobIdByCloseoutId.set(closeout.id, closeout.job_id);
    if (hasMeaningfulCloseoutRecord(closeout)) protectedJobIds.add(closeout.job_id);
  }
  for (const item of [...(checklistItems.data ?? []), ...(scopeItems.data ?? [])]) {
    if (hasMeaningfulCloseoutChild(item)) protectedJobIds.add(item.job_id);
  }

  const closeoutIds = [...jobIdByCloseoutId.keys()];
  if (closeoutIds.length) {
    const { data: submissions, error } = await supabase
      .from("job_closeout_submissions")
      .select("closeout_id")
      .in("closeout_id", closeoutIds);
    if (error) throw error;
    for (const submission of submissions ?? []) {
      const jobId = jobIdByCloseoutId.get(submission.closeout_id);
      if (jobId) protectedJobIds.add(jobId);
    }
  }

  return protectedJobIds.size;
}

async function idsFor(supabase: any, table: string, column: string, value: string) {
  const { data } = await supabase.from(table).select("id").eq(column, value);
  return (data ?? []).map((record: { id: string }) => record.id);
}

function preview(recordType: LifecycleRecordType, recordId: string, label: string, archivedAt: string | null, counts: Record<string, number>, blockers: string[], supportsPermanent: boolean): RecordLifecyclePreview {
  return { archivedAt, blockers, canPermanentDelete: supportsPermanent && blockers.length === 0, counts, label, recordId, recordType };
}

async function writeDeletionAudit(supabase: any, actorUserId: string, record: RecordLifecyclePreview, action: string, reason?: string) {
  await supabase.from("record_deletion_audit").insert({ actor_user_id: actorUserId, record_type: record.recordType, record_id: record.recordId, action, reason: reason ?? null, dependency_counts: record.counts });
}

function lifecycleType(value: FormDataEntryValue | null): LifecycleRecordType | null {
  const type = String(value ?? "");
  return type in tableByType ? type as LifecycleRecordType : null;
}

function revalidateLifecyclePaths(recordType: LifecycleRecordType, recordId: string) {
  const plural = recordType === "service_location" ? "properties" : `${recordType}s`;
  revalidatePath(`/admin/${plural}`);
  revalidatePath(`/admin/${plural}/${recordId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/schedule");
}

function failure(message: string): LifecycleActionState {
  return { status: "error", message: safeStaffMessage(message) };
}
