"use server";

import { revalidatePath } from "next/cache";
import { processCommunicationById, processDueCommunications } from "@/lib/communications/processor";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import type {
  CommunicationRecipientSource,
  CommunicationType,
  CustomerCommunication,
} from "@/lib/types/database";

export type CommunicationActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const communicationTypes: CommunicationType[] = [
  "estimate_confirmation",
  "estimate_reminder",
  "quote_follow_up",
  "work_confirmation",
  "work_reminder",
  "invoice_payment_reminder",
  "overdue_invoice_reminder",
  "payment_confirmation",
];

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

export async function cancelScheduledCommunication(formData: FormData) {
  const auth = await requireStaff();
  if (auth.error) return;

  const communicationId = text(formData, "communication_id");
  if (!communicationId) return;

  await auth.supabase
    .from("customer_communications")
    .update({
      cancelled_at: new Date().toISOString(),
      skip_reason: "Cancelled by staff.",
      status: "cancelled",
    })
    .eq("id", communicationId)
    .eq("status", "pending");

  revalidateCommunicationPaths();
}

export async function updateRecordAutomation(
  _previousState: CommunicationActionState,
  formData: FormData,
): Promise<CommunicationActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  const recordType = text(formData, "record_type");
  const recordId = text(formData, "record_id");
  const enabled = formData.get("enabled") === "1";
  if (!recordId || !["quote", "invoice"].includes(recordType)) {
    return { status: "error", message: "Choose a quote or invoice automation setting." };
  }

  const table = recordType === "quote" ? "quotes" : "invoices";
  const column = recordType === "quote" ? "automatic_follow_ups_enabled" : "automatic_reminders_enabled";
  const { error } = await auth.supabase.from(table).update({ [column]: enabled }).eq("id", recordId);
  if (error) return { status: "error", message: error.message };

  if (!enabled) {
    let query = auth.supabase
      .from("customer_communications")
      .update({
        cancelled_at: new Date().toISOString(),
        skip_reason: `Automatic ${recordType === "quote" ? "follow-ups" : "reminders"} disabled by staff.`,
        status: "cancelled",
      })
      .eq("status", "pending")
      .eq("is_automatic", true);
    query = recordType === "quote" ? query.eq("quote_id", recordId) : query.eq("invoice_id", recordId);
    await query;
  }

  revalidateCommunicationPaths(recordType, recordId);
  return {
    status: "success",
    message: `Automatic ${recordType === "quote" ? "follow-ups" : "reminders"} ${enabled ? "enabled" : "disabled"}.`,
  };
}

export async function updateCommunicationSettings(
  _previousState: CommunicationActionState,
  formData: FormData,
): Promise<CommunicationActionState> {
  const auth = await requireStaff(true);
  if (auth.error) return auth.error;

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

  const { error } = await auth.supabase
    .from("communication_settings")
    .update({
      automated_sending_enabled: checked(formData, "automated_sending_enabled"),
      business_timezone: timezone,
      estimate_confirmation_enabled: checked(formData, "estimate_confirmation_enabled"),
      estimate_reminder_enabled: checked(formData, "estimate_reminder_enabled"),
      work_confirmation_enabled: checked(formData, "work_confirmation_enabled"),
      work_reminder_enabled: checked(formData, "work_reminder_enabled"),
      quote_follow_up_enabled: checked(formData, "quote_follow_up_enabled"),
      invoice_reminder_enabled: checked(formData, "invoice_reminder_enabled"),
      payment_confirmation_enabled: checked(formData, "payment_confirmation_enabled"),
      ...numberFields,
    })
    .eq("singleton", true);

  if (error) return { status: "error", message: error.message };
  revalidateCommunicationPaths();
  return { status: "success", message: "Communication defaults saved." };
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
    status: "success",
    message: `Queue checked: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed.`,
  };
}

async function queueCommunication(formData: FormData, sendNow: boolean): Promise<CommunicationActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  const communicationType = text(formData, "communication_type") as CommunicationType;
  const recordType = text(formData, "record_type");
  const recordId = text(formData, "record_id");
  const recipientSource = (text(formData, "recipient_source") || "customer") as CommunicationRecipientSource;
  const submittedRecipient = text(formData, "recipient_email").toLowerCase();
  if (!communicationTypes.includes(communicationType) || !recordId) {
    return { status: "error", message: "Choose a valid customer reminder." };
  }

  const context = await resolveCommunicationContext(auth.supabase, recordType, recordId, communicationType);
  if (context.error || !context.data) return { status: "error", message: context.error ?? "The related record is unavailable." };

  const recipient = recipientSource === "organization" ? context.data.organizationEmail : context.data.customerEmail;
  if (!recipient || recipient.toLowerCase() !== submittedRecipient || !isValidEmail(recipient)) {
    return { status: "error", message: "Choose the current customer or organization email shown on this record." };
  }

  const scheduledFor = sendNow ? new Date() : parseScheduledDate(formData.get("scheduled_for"));
  if (!scheduledFor) return { status: "error", message: "Choose a valid reminder date and time." };
  if (!sendNow && scheduledFor.getTime() < Date.now() - 60_000) {
    return { status: "error", message: "Scheduled reminders must be in the future." };
  }

  const minuteKey = scheduledFor.toISOString().slice(0, 16);
  const idempotencyKey = `manual:${communicationType}:${recordType}:${recordId}:${sendNow ? `now:${minuteKey}` : minuteKey}`;
  const row = {
    communication_type: communicationType,
    reminder_stage: sendNow ? "manual_now" : "manual_scheduled",
    customer_id: context.data.customerId,
    organization_id: context.data.organizationId,
    quote_id: context.data.quoteId,
    invoice_id: context.data.invoiceId,
    job_id: context.data.jobId,
    schedule_event_id: context.data.scheduleEventId,
    appointment_id: context.data.appointmentId,
    payment_id: null,
    recipient_source: recipientSource,
    recipient_email: recipient.toLowerCase(),
    scheduled_for: scheduledFor.toISOString(),
    source_version: context.data.sourceVersion,
    is_automatic: false,
    idempotency_key: idempotencyKey,
    created_by_user_id: auth.userId,
  };

  let { data: communication, error } = await auth.supabase
    .from("customer_communications")
    .insert(row)
    .select("*")
    .single();

  if (error?.code === "23505") {
    const existing = await auth.supabase
      .from("customer_communications")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    communication = existing.data;
    error = existing.error;
  }
  if (error || !communication) return { status: "error", message: error?.message ?? "Could not schedule the reminder." };

  revalidateCommunicationPaths(recordType, recordId);
  if (!sendNow) return { status: "success", message: "Reminder scheduled." };
  if (communication.status === "sent") return { status: "success", message: "This reminder was already sent." };

  const processed = await processCommunicationById((communication as CustomerCommunication).id);
  revalidateCommunicationPaths(recordType, recordId);
  return processed.status === "sent"
    ? { status: "success", message: "Reminder sent." }
    : { status: "error", message: processed.message };
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
    if (error || !data) return failedContext(error?.message ?? "Quote not found.");
    if (data.status !== "sent") return failedContext("Quote follow-ups are available only while a sent quote awaits a response.");
    return contextFromParty(data.customers, data.organizations, { quoteId: data.id, jobId: data.job_id, sourceVersion: data.updated_at });
  }

  if (recordType === "invoice" && ["invoice_payment_reminder", "overdue_invoice_reminder"].includes(communicationType)) {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, customer_id, organization_id, job_id, status, balance_due_cents, updated_at, customers:customers!invoices_customer_id_fkey(id, email), organizations(id, billing_email)")
      .eq("id", recordId)
      .maybeSingle();
    if (error || !data) return failedContext(error?.message ?? "Invoice not found.");
    if (["paid", "void"].includes(data.status) || Number(data.balance_due_cents) <= 0) {
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
    if (error || !data) return failedContext(error?.message ?? "Job not found.");
    if (!data.scheduled_start_at || !["accepted", "scheduled"].includes(data.status)) {
      return failedContext("Add a future work schedule before sending this reminder.");
    }
    return contextFromParty(data.customers, data.organizations, { jobId: data.id, sourceVersion: data.scheduled_start_at });
  }

  if (recordType === "schedule_event" && communicationType !== "quote_follow_up") {
    const { data, error } = await supabase
      .from("schedule_events")
      .select("id, job_id, status, event_type, starts_at, updated_at, jobs(id, customers:customers!jobs_customer_id_fkey(id, email), organizations(id, billing_email))")
      .eq("id", recordId)
      .maybeSingle();
    const job = one<{ id: string; customers: unknown; organizations: unknown }>(data?.jobs);
    if (error || !data || !job) return failedContext(error?.message ?? "A linked customer job is required.");
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
    if (error || !data || !job) return failedContext(error?.message ?? "A linked customer job is required.");
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
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function integer(formData: FormData, key: string, min: number, max: number) {
  const value = Number(formData.get(key));
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
