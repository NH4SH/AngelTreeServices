"use server";

import { revalidatePath } from "next/cache";
import { parseBusinessDateTime } from "@/lib/business-time";
import { processCommunicationById, processDueCommunications } from "@/lib/communications/processor";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { isRecordedManualReminder, manualReminderKey, matchesManualReminder, parseManualReminderRequest, type ManualReminderRequest } from "@/lib/communications/manual-reminder-request";
import { isInvoiceReminderEligible } from "@/lib/payments/invoice-payment-state";
import type {
  CommunicationRecipientSource,
  CommunicationType,
  CustomerCommunication,
} from "@/lib/types/database";

export type CommunicationActionState = {
  status: "idle" | "success" | "error" | "warning";
  message: string;
  settingsVersion?: string;
  requestId?: string;
  requestRecorded?: boolean;
  reminderId?: string;
  reminderStatus?: CustomerCommunication["status"];
};

export async function sendCommunicationNow(
  _previousState: CommunicationActionState,
  formData: FormData,
): Promise<CommunicationActionState> {
  return queueCommunication(formData, true);
}

export async function scheduleCommunication(
  _previousState: CommunicationActionState,
  formData: FormData,
): Promise<CommunicationActionState> {
  return queueCommunication(formData, false);
}

export async function cancelScheduledCommunication(
  _previousState: CommunicationActionState,
  formData: FormData,
): Promise<CommunicationActionState> {
  const unconfirmed: CommunicationActionState = {
    status: "warning",
    message: "Cancellation could not be confirmed. Reload and review this reminder before trying again.",
  };
  try {
    const auth = await requireStaff();
    if (auth.error) return auth.error;

    const communicationId = text(formData, "communication_id");
    const expectedVersion = text(formData, "expected_updated_at");
    if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(communicationId)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(expectedVersion)
      || !Number.isFinite(Date.parse(expectedVersion))) {
      return { status: "error", message: "Reload the reminder list before cancelling a reminder." };
    }

    const { data, error } = await auth.supabase
      .from("customer_communications")
      .update({
        cancelled_at: new Date().toISOString(),
        skip_reason: "Cancelled by staff.",
        status: "cancelled",
      })
      .eq("id", communicationId)
      .eq("status", "pending")
      .eq("updated_at", expectedVersion)
      .select("id, status, cancelled_at, updated_at").maybeSingle();
    if (error) return unconfirmed;
    if (!data) return { status: "error", message: "This reminder changed or is no longer pending. Reload the list to review its current status." };
    if (data.id !== communicationId.toLowerCase() || data.status !== "cancelled"
      || typeof data.cancelled_at !== "string" || !Number.isFinite(Date.parse(data.cancelled_at))
      || typeof data.updated_at !== "string" || !Number.isFinite(Date.parse(data.updated_at))) return unconfirmed;

    revalidateCommunicationPaths();
    return { status: "success", message: "Reminder cancelled." };
  } catch {
    return unconfirmed;
  }
}

export async function updateRecordAutomation(
  _previousState: CommunicationActionState,
  formData: FormData,
): Promise<CommunicationActionState> {
  try {
    const auth = await requireStaff();
    if (auth.error) return auth.error;
    const recordType = text(formData, "record_type");
    const recordId = text(formData, "record_id");
    const requested = formData.get("enabled");
    const expected = text(formData, "expected_updated_at");
    if (!["quote", "invoice"].includes(recordType) || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(recordId) || !["0", "1"].includes(String(requested))) {
      return { status: "error", message: "Choose a valid quote or invoice automation setting." };
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(expected) || !Number.isFinite(Date.parse(expected))) {
      return { status: "error", message: "Reload this record before changing automatic reminders." };
    }
    const enabled = requested === "1";
    const { data, error } = await auth.supabase.rpc("set_record_reminder_automation", {
      p_record_type: recordType, p_record_id: recordId, p_enabled: enabled, p_expected_updated_at: expected,
    });
    if (error?.code === "40001") return { status: "error", message: "This record changed or is unavailable. Reload it before changing automatic reminders." };
    const acknowledgement = data && typeof data === "object" && !Array.isArray(data) ? data : null;
    const cancelledCount = acknowledgement?.cancelled_count;
    if (error || !acknowledgement || acknowledgement.record_type !== recordType || acknowledgement.record_id !== recordId.toLowerCase() || acknowledgement.enabled !== enabled
      || typeof acknowledgement.updated_at !== "string" || !Number.isFinite(Date.parse(acknowledgement.updated_at))
      || typeof cancelledCount !== "number" || !Number.isSafeInteger(cancelledCount) || cancelledCount < 0) {
      return { status: "warning", message: "The reminder change could not be confirmed. Reload this record and review its reminders before trying again." };
    }
    revalidateCommunicationPaths(recordType, recordId);
    return { status: "success", message: `Automatic ${recordType === "quote" ? "follow-ups" : "reminders"} ${enabled ? "enabled" : "disabled"}.` };
  } catch {
    return { status: "warning", message: "The reminder change could not be confirmed. Reload this record and review its reminders before trying again." };
  }
}

export async function updateCommunicationSettings(
  _previousState: CommunicationActionState,
  formData: FormData,
): Promise<CommunicationActionState> {
  try {
    const auth = await requireStaff(true);
    if (auth.error) return auth.error;

    const expectedVersion = text(formData, "expected_updated_at");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(expectedVersion) || !Number.isFinite(Date.parse(expectedVersion))) {
      return { status: "error", message: "Reload communication defaults before saving." };
    }
    const timezone = text(formData, "business_timezone");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    } catch {
      return { status: "error", message: "Enter a valid IANA business timezone, such as America/New_York." };
    }
    const numberFields = {
      minimum_send_interval_hours: integer(formData, "minimum_send_interval_hours", 1, 168),
      estimate_reminder_hours_before: integer(formData, "estimate_reminder_hours_before", 1, 336),
      work_reminder_hours_before: integer(formData, "work_reminder_hours_before", 1, 336),
      quote_first_follow_up_days: integer(formData, "quote_first_follow_up_days", 1, 90),
      quote_second_follow_up_days: integer(formData, "quote_second_follow_up_days", 1, 180),
      invoice_first_reminder_days: integer(formData, "invoice_first_reminder_days", 0, 90),
      invoice_second_reminder_days: integer(formData, "invoice_second_reminder_days", 1, 180),
    };
    if (Object.values(numberFields).some((value) => value === null)) {
      return { status: "error", message: "Reminder offsets must be whole numbers inside the allowed ranges." };
    }
    const { data, error } = await auth.supabase.from("communication_settings").update({
      automated_sending_enabled: checked(formData, "automated_sending_enabled"),
      business_timezone: timezone,
      estimate_confirmation_enabled: checked(formData, "estimate_confirmation_enabled"),
      estimate_reminder_enabled: checked(formData, "estimate_reminder_enabled"),
      work_confirmation_enabled: checked(formData, "work_confirmation_enabled"),
      work_reminder_enabled: checked(formData, "work_reminder_enabled"),
      quote_follow_up_enabled: checked(formData, "quote_follow_up_enabled"),
      invoice_reminder_enabled: checked(formData, "invoice_reminder_enabled"),
      appointment_change_notices_enabled: checked(formData, "appointment_change_notices_enabled"),
      payment_confirmation_enabled: checked(formData, "payment_confirmation_enabled"),
      ...numberFields,
    }).eq("singleton", true).eq("updated_at", expectedVersion).select("singleton, updated_at").maybeSingle();
    if (error) return { status: "warning", message: "The save could not be confirmed. Reload and review the current settings before saving again." };
    if (!data) return { status: "error", message: "Communication defaults changed or are unavailable. Reload this page to review the latest settings before saving." };
    if (data.singleton !== true || typeof data.updated_at !== "string" || !Number.isFinite(Date.parse(data.updated_at))) {
      return { status: "warning", message: "The save could not be confirmed. Reload and review the current settings before saving again." };
    }
    revalidateCommunicationPaths();
    return { status: "success", message: "Communication defaults saved.", settingsVersion: data.updated_at };
  } catch {
    return { status: "warning", message: "The save could not be confirmed. Reload and review the current settings before saving again." };
  }
}

export async function runCommunicationWorkerNow(
  _previousState: CommunicationActionState,
): Promise<CommunicationActionState> {
  const auth = await requireStaff(true);
  if (auth.error) return auth.error;

  const result = await processDueCommunications(20);
  revalidateCommunicationPaths();
  if (result.error) return { status: "error", message: result.error };
  return {
    status: result.uncertain || result.acceptedUnrecorded ? "warning" : "success",
    message: `Queue checked: ${result.sent} accepted, ${result.skipped} skipped, ${result.pending} waiting to retry, ${result.failed} failed, ${result.uncertain} need delivery review.`,
  };
}

export async function checkManualReminder(
  _previousState: CommunicationActionState, formData: FormData,
): Promise<CommunicationActionState> {
  if (!["send", "schedule"].includes(String(formData.get("manual_mode")))) return { status: "error", message: "Choose a valid saved reminder request." };
  return prepareManualReminder(formData, formData.get("manual_mode") === "send", true);
}

async function queueCommunication(formData: FormData, sendNow: boolean): Promise<CommunicationActionState> {
  return prepareManualReminder(formData, sendNow, false);
}

async function prepareManualReminder(formData: FormData, sendNow: boolean, checkOnly: boolean): Promise<CommunicationActionState> {
  const unconfirmed: CommunicationActionState = { status: "warning", message: "This reminder request could not be confirmed. Keep it and check its status before retrying." };
  try {
    const auth = await requireStaff(); if (auth.error) return auth.error;
    const request = parseManualReminderRequest(formData, sendNow ? "send" : "schedule");
    if (!request) return { status: "error", message: "Choose a valid reminder, recipient and saved request before continuing." };
    const scheduledFor = sendNow ? new Date() : parseScheduledDate(request.scheduled_for);
    if (!scheduledFor) return { status: "error", message: "Choose a valid reminder date and time. Editing keeps this same request." };
    const key = manualReminderKey(auth.userId, request.request_id);
    const lookup = () => auth.supabase.from("customer_communications").select("*").eq("idempotency_key", key).maybeSingle();
    const existing = await lookup(); if (existing.error || existing.data === undefined) return unconfirmed;
    let communication: CustomerCommunication;
    if (existing.data) {
      if (!isRecordedManualReminder(existing.data, request, auth.userId)) return unconfirmed;
      communication = existing.data;
    } else {
      if (checkOnly) return { status: "warning", message: "No saved reminder was found yet. Retry this same request or edit its details without starting another request." };
      if (!sendNow && scheduledFor.getTime() < Date.now() - 60_000) return { status: "error", message: "That reminder time has passed. Edit the time using this same request." };
      const context = await resolveCommunicationContext(auth.supabase, request.record_type, request.record_id, request.communication_type as CommunicationType);
      if (context.error || !context.data) return { status: "error", message: context.error ?? "The related record is unavailable. Reload before continuing." };
      const recipient = request.recipient_source === "organization" ? context.data.organizationEmail : context.data.customerEmail;
      if (!recipient || recipient.toLowerCase() !== request.recipient_email || !isValidEmail(recipient)) return { status: "error", message: "Choose the current customer or organization email shown on this record." };
      const result = await auth.supabase.from("customer_communications").insert({
        communication_type: request.communication_type, reminder_stage: sendNow ? "manual_now" : "manual_scheduled",
        customer_id: context.data.customerId, organization_id: context.data.organizationId, quote_id: context.data.quoteId,
        invoice_id: context.data.invoiceId, job_id: context.data.jobId, schedule_event_id: context.data.scheduleEventId,
        appointment_id: context.data.appointmentId, payment_id: null, recipient_source: request.recipient_source,
        recipient_email: recipient.toLowerCase(), scheduled_for: scheduledFor.toISOString(), source_version: context.data.sourceVersion,
        is_automatic: false, idempotency_key: key, created_by_user_id: auth.userId,
      }).select("*").single();
      if (result.error?.code === "23505") {
        const repeated = await lookup(); if (repeated.error || !isRecordedManualReminder(repeated.data, request, auth.userId)) return unconfirmed;
        communication = repeated.data;
      } else {
        if (result.error || !isRecordedManualReminder(result.data, request, auth.userId) || result.data.status !== "pending") return unconfirmed;
        communication = result.data;
      }
    }
    const receipt = { requestId: request.request_id, requestRecorded: true, reminderId: communication.id, reminderStatus: communication.status };
    if (!matchesManualReminder(communication, request, scheduledFor)) return { ...receipt, status: "warning", message: "Earlier details for this request were already saved. Review the reminder list; they were not replaced or sent again." };
    revalidateCommunicationPaths(request.record_type, request.record_id);
    if (checkOnly || communication.status !== "pending" || !sendNow) return { ...receipt, ...manualReminderOutcome(communication, request) };
    const processed = await processCommunicationById(communication.id);
    revalidateCommunicationPaths(request.record_type, request.record_id);
    return { ...receipt, reminderStatus: processed.status,
      status: processed.outcome === "accepted" && processed.recorded ? "success" : "warning",
      message: processed.outcome === "accepted" ? processed.recorded ? "Reminder accepted and recorded." : "Email was accepted, but its history needs delivery review. Do not send another reminder."
        : processed.outcome === "unknown" ? "The delivery outcome is uncertain. Review delivery history before another attempt."
          : "This reminder was not confirmed as sent. Review its status before retrying this saved request.",
    };
  } catch { return unconfirmed; }
}

function manualReminderOutcome(row: CustomerCommunication, request: ManualReminderRequest): Pick<CommunicationActionState, "status" | "message"> {
  if (row.status === "pending") return request.mode === "schedule" ? { status: "success", message: "Reminder scheduled." }
    : { status: "warning", message: "This reminder is saved and waiting. Retrying uses this same request." };
  if (row.status === "sent") return { status: "success", message: "This reminder was already accepted. No additional email was sent." };
  if (row.status === "processing") return { status: "warning", message: "This reminder is being processed. No new reminder was created; review its status." };
  if (row.status === "failed") return { status: "warning", message: "This reminder needs delivery review. It was not restarted." };
  return { status: "warning", message: `This reminder was ${row.status}. It was not scheduled or sent again.` };
}

async function resolveCommunicationContext(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  recordType: string,
  recordId: string,
  communicationType: CommunicationType,
) {
  if (recordType === "quote" && communicationType === "quote_follow_up") {
    const { data, error } = await supabase
      .from("quotes")
      .select("id, customer_id, organization_id, job_id, status, updated_at, customers:customers!quotes_customer_id_fkey(id, email), organizations(id, billing_email)")
      .eq("id", recordId)
      .maybeSingle();
    if (error || !data) return failedContext(error ? "Current proposal details could not be checked. Reload before continuing." : "Quote not found.");
    if (data.status !== "sent") return failedContext("Quote follow-ups are available only while a sent quote awaits a response.");
    return contextFromParty(data.customers, data.organizations, { quoteId: data.id, jobId: data.job_id, sourceVersion: data.updated_at });
  }

  if (recordType === "invoice" && ["invoice_payment_reminder", "overdue_invoice_reminder"].includes(communicationType)) {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, customer_id, organization_id, job_id, status, balance_due_cents, updated_at, customers:customers!invoices_customer_id_fkey(id, email), organizations(id, billing_email)")
      .eq("id", recordId)
      .maybeSingle();
    if (error || !data) return failedContext(error ? "Current invoice details could not be checked. Reload before continuing." : "Invoice not found.");
    if (!isInvoiceReminderEligible(data.status, Number(data.balance_due_cents))) {
      return failedContext("This invoice does not have an eligible balance for a reminder.");
    }
    return contextFromParty(data.customers, data.organizations, { invoiceId: data.id, jobId: data.job_id, sourceVersion: data.updated_at });
  }

  if (recordType === "job" && ["work_confirmation", "work_reminder"].includes(communicationType)) {
    const { data, error } = await supabase
      .from("jobs")
      .select("id, status, scheduled_start_at, updated_at, customers:customers!jobs_customer_id_fkey(id, email), organizations(id, billing_email)")
      .eq("id", recordId)
      .maybeSingle();
    if (error || !data) return failedContext(error ? "Current job details could not be checked. Reload before continuing." : "Job not found.");
    if (!data.scheduled_start_at || !["accepted", "scheduled"].includes(data.status)) {
      return failedContext("Add a future work schedule before sending this reminder.");
    }
    return contextFromParty(data.customers, data.organizations, { jobId: data.id, sourceVersion: data.scheduled_start_at });
  }

  if (recordType === "schedule_event" && communicationType !== "quote_follow_up") {
    const { data, error } = await supabase
      .from("schedule_events")
      .select("id, job_id, status, event_type, starts_at, updated_at, jobs:jobs!schedule_events_job_id_fkey(id, customers:customers!jobs_customer_id_fkey(id, email), organizations(id, billing_email))")
      .eq("id", recordId)
      .maybeSingle();
    const job = one<{ id: string; customers: unknown; organizations: unknown }>(data?.jobs);
    if (error || !data || !job) return failedContext(error ? "Current appointment details could not be checked. Reload before continuing." : "A linked customer job is required.");
    if (!["scheduled", "confirmed"].includes(data.status)) return failedContext("This schedule event is not open for reminders.");
    return contextFromParty(job.customers, job.organizations, { jobId: job.id, scheduleEventId: data.id, sourceVersion: data.starts_at });
  }

  if (recordType === "appointment" && communicationType !== "quote_follow_up") {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, job_id, status, appointment_type, starts_at, updated_at, jobs(id, customers:customers!jobs_customer_id_fkey(id, email), organizations(id, billing_email))")
      .eq("id", recordId)
      .maybeSingle();
    const job = one<{ id: string; customers: unknown; organizations: unknown }>(data?.jobs);
    if (error || !data || !job) return failedContext(error ? "Current appointment details could not be checked. Reload before continuing." : "A linked customer job is required.");
    if (!["scheduled", "confirmed"].includes(data.status)) return failedContext("This appointment is not open for reminders.");
    return contextFromParty(job.customers, job.organizations, { appointmentId: data.id, jobId: job.id, sourceVersion: data.starts_at });
  }

  return failedContext("That reminder does not match this record type.");
}

function contextFromParty(
  customerValue: unknown,
  organizationValue: unknown,
  relations: {
    appointmentId?: string | null;
    invoiceId?: string | null;
    jobId?: string | null;
    quoteId?: string | null;
    scheduleEventId?: string | null;
    sourceVersion: string;
  },
) {
  const customer = one<{
    id: string;
    email: string | null;
  }>(customerValue as never);
  const organization = one<{ id: string; billing_email: string | null }>(organizationValue as never);
  if (!customer && !organization) return failedContext("The contracting party is unavailable.");

  return {
    data: {
      appointmentId: relations.appointmentId ?? null,
      customerEmail: customer?.email?.trim().toLowerCase() ?? null,
      customerId: customer?.id ?? null,
      invoiceId: relations.invoiceId ?? null,
      jobId: relations.jobId ?? null,
      organizationEmail: organization?.billing_email?.trim().toLowerCase() ?? null,
      organizationId: organization?.id ?? null,
      quoteId: relations.quoteId ?? null,
      scheduleEventId: relations.scheduleEventId ?? null,
      sourceVersion: relations.sourceVersion,
    },
    error: null,
  };
}

function failedContext(error: string) {
  return { data: null, error };
}

async function requireStaff(adminOnly = false) {
  const supabase = await createClient();
  if (!supabase) return { error: { status: "error" as const, message: "Supabase is not configured." } };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: { status: "error" as const, message: "Sign in before managing customer reminders." } };
  const roles = await getUserRoles(supabase, user.id);
  const allowed = adminOnly ? platformRoleGroups.accessApproval : platformRoleGroups.internalStaff;
  if (!hasAllowedRole(roles, allowed)) {
    return { error: { status: "error" as const, message: adminOnly ? "Only owners and admins can change communication defaults." : "Only internal staff can manage customer reminders." } };
  }
  return { supabase, userId: user.id };
}

function parseScheduledDate(value: FormDataEntryValue | null) {
  return parseBusinessDateTime(String(value ?? ""));
}

function integer(formData: FormData, key: string, min: number, max: number) {
  const raw = text(formData, key);
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "1";
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function revalidateCommunicationPaths(recordType?: string, recordId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/communications");
  if (!recordType || !recordId) return;
  if (recordType === "schedule_event" || recordType === "appointment") {
    revalidatePath("/admin/schedule");
    return;
  }
  revalidatePath(`/admin/${recordType === "job" ? "jobs" : `${recordType}s`}/${recordId}`);
}
