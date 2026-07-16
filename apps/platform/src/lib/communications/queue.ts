import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CommunicationSettings,
  CommunicationType,
  CustomerCommunication,
} from "@/lib/types/database";

type CustomerReference = {
  id: string;
  email: string | null;
  organization_id: string | null;
  status: string;
};

type QueueInput = Pick<
  CustomerCommunication,
  | "communication_type"
  | "reminder_stage"
  | "customer_id"
  | "organization_id"
  | "quote_id"
  | "invoice_id"
  | "job_id"
  | "schedule_event_id"
  | "appointment_id"
  | "payment_id"
  | "recipient_source"
  | "recipient_email"
  | "scheduled_for"
  | "source_version"
  | "is_automatic"
  | "idempotency_key"
  | "created_by_user_id"
>;

export async function getCommunicationSettingsFromClient(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("communication_settings")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();

  return {
    data: (data as CommunicationSettings | null) ?? null,
    error: error?.message ?? null,
  };
}

export async function syncAutomatedCommunications(supabase: SupabaseClient) {
  const settingsResult = await getCommunicationSettingsFromClient(supabase);
  if (settingsResult.error || !settingsResult.data) {
    return { created: 0, error: settingsResult.error ?? "Communication settings are unavailable." };
  }

  const settings = settingsResult.data;
  if (!settings.automated_sending_enabled) {
    return { created: 0, error: null };
  }

  const results = await Promise.all([
    syncScheduleEvents(supabase, settings),
    syncAppointments(supabase, settings),
    syncQuotes(supabase, settings),
    syncInvoices(supabase, settings),
    syncPayments(supabase, settings),
  ]);
  const error = results.find((result) => result.error)?.error ?? null;

  return {
    created: results.reduce((sum, result) => sum + result.created, 0),
    error,
  };
}

export async function cancelPendingCommunications(
  supabase: SupabaseClient,
  filters: {
    appointmentId?: string;
    invoiceId?: string;
    jobId?: string;
    quoteId?: string;
    scheduleEventId?: string;
  },
  reason: string,
) {
  let query = supabase
    .from("customer_communications")
    .update({
      cancelled_at: new Date().toISOString(),
      last_error: null,
      processing_started_at: null,
      skip_reason: reason,
      status: "cancelled",
    })
    .eq("status", "pending");

  if (filters.quoteId) query = query.eq("quote_id", filters.quoteId);
  if (filters.invoiceId) query = query.eq("invoice_id", filters.invoiceId);
  if (filters.jobId) query = query.eq("job_id", filters.jobId);
  if (filters.scheduleEventId) query = query.eq("schedule_event_id", filters.scheduleEventId);
  if (filters.appointmentId) query = query.eq("appointment_id", filters.appointmentId);

  const { error } = await query;
  return error?.message ?? null;
}

async function syncQuotes(supabase: SupabaseClient, settings: CommunicationSettings) {
  if (!settings.quote_follow_up_enabled) return emptySyncResult();

  const lookback = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("quotes")
    .select("id, customer_id, sent_at, status, updated_at, automatic_follow_ups_enabled, customers(id, email, organization_id, status)")
    .eq("status", "sent")
    .eq("automatic_follow_ups_enabled", true)
    .not("sent_at", "is", null)
    .gte("sent_at", lookback);

  if (error) return { created: 0, error: error.message };

  const queue: QueueInput[] = [];
  for (const quote of data ?? []) {
    const customer = one<CustomerReference>(quote.customers);
    if (!isQueueableCustomer(customer) || !quote.sent_at) continue;

    for (const [stage, days] of [
      ["first", settings.quote_first_follow_up_days],
      ["second", settings.quote_second_follow_up_days],
    ] as const) {
      queue.push(buildQueueInput({
        communicationType: "quote_follow_up",
        customer,
        idempotencyKey: `auto:quote:${quote.id}:follow-up:${stage}`,
        quoteId: quote.id,
        reminderStage: stage,
        scheduledFor: addHours(quote.sent_at, days * 24),
        sourceVersion: quote.updated_at,
      }));
    }
  }

  return insertQueueRows(supabase, queue);
}

async function syncInvoices(supabase: SupabaseClient, settings: CommunicationSettings) {
  if (!settings.invoice_reminder_enabled) return emptySyncResult();

  const dueLookback = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("invoices")
    .select("id, customer_id, due_at, status, balance_due_cents, updated_at, automatic_reminders_enabled, customers(id, email, organization_id, status)")
    .in("status", ["sent", "partially_paid", "overdue"])
    .eq("automatic_reminders_enabled", true)
    .gt("balance_due_cents", 0)
    .not("due_at", "is", null)
    .gte("due_at", dueLookback);

  if (error) return { created: 0, error: error.message };

  const queue: QueueInput[] = [];
  for (const invoice of data ?? []) {
    const customer = one<CustomerReference>(invoice.customers);
    if (!isQueueableCustomer(customer) || !invoice.due_at) continue;

    queue.push(buildQueueInput({
      communicationType: "invoice_payment_reminder",
      customer,
      idempotencyKey: `auto:invoice:${invoice.id}:reminder:first`,
      invoiceId: invoice.id,
      reminderStage: "first",
      scheduledFor: addHours(invoice.due_at, settings.invoice_first_reminder_days * 24),
      sourceVersion: invoice.updated_at,
    }));
    queue.push(buildQueueInput({
      communicationType: "overdue_invoice_reminder",
      customer,
      idempotencyKey: `auto:invoice:${invoice.id}:reminder:second`,
      invoiceId: invoice.id,
      reminderStage: "second",
      scheduledFor: addHours(invoice.due_at, settings.invoice_second_reminder_days * 24),
      sourceVersion: invoice.updated_at,
    }));
  }

  return insertQueueRows(supabase, queue);
}

async function syncScheduleEvents(supabase: SupabaseClient, settings: CommunicationSettings) {
  const now = new Date().toISOString();
  const through = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("schedule_events")
    .select("id, event_type, status, starts_at, created_at, updated_at, job_id, jobs(id, customer_id, customers(id, email, organization_id, status))")
    .in("event_type", ["estimate", "job", "maintenance", "emergency"])
    .in("status", ["scheduled", "confirmed"])
    .not("job_id", "is", null)
    .gt("starts_at", now)
    .lte("starts_at", through);

  if (error) return { created: 0, error: error.message };

  const queue: QueueInput[] = [];
  for (const event of data ?? []) {
    const job = one<{ id: string; customer_id: string; customers: CustomerReference | CustomerReference[] | null }>(event.jobs);
    const customer = one<CustomerReference>(job?.customers ?? null);
    if (!job || !isQueueableCustomer(customer)) continue;

    await cancelObsoleteAppointmentVersion(supabase, "schedule_event_id", event.id, event.starts_at);
    const isEstimate = event.event_type === "estimate";
    const confirmationEnabled = isEstimate ? settings.estimate_confirmation_enabled : settings.work_confirmation_enabled;
    const reminderEnabled = isEstimate ? settings.estimate_reminder_enabled : settings.work_reminder_enabled;
    const hoursBefore = isEstimate ? settings.estimate_reminder_hours_before : settings.work_reminder_hours_before;
    const prefix = isEstimate ? "estimate" : "work";

    if (confirmationEnabled && event.created_at >= settings.updated_at) {
      queue.push(buildQueueInput({
        communicationType: `${prefix}_confirmation` as CommunicationType,
        customer,
        idempotencyKey: `auto:schedule-event:${event.id}:confirmation:${event.starts_at}`,
        jobId: job.id,
        reminderStage: "confirmation",
        scheduleEventId: event.id,
        scheduledFor: new Date().toISOString(),
        sourceVersion: event.starts_at,
      }));
    }

    if (reminderEnabled) {
      queue.push(buildQueueInput({
        communicationType: `${prefix}_reminder` as CommunicationType,
        customer,
        idempotencyKey: `auto:schedule-event:${event.id}:reminder:${event.starts_at}`,
        jobId: job.id,
        reminderStage: "reminder",
        scheduleEventId: event.id,
        scheduledFor: notBeforeNow(addHours(event.starts_at, -hoursBefore)),
        sourceVersion: event.starts_at,
      }));
    }
  }

  return insertQueueRows(supabase, queue);
}

async function syncAppointments(supabase: SupabaseClient, settings: CommunicationSettings) {
  const now = new Date().toISOString();
  const through = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("appointments")
    .select("id, appointment_type, status, starts_at, created_at, updated_at, job_id, jobs(id, customer_id, customers(id, email, organization_id, status))")
    .in("appointment_type", ["estimate", "job", "maintenance"])
    .in("status", ["scheduled", "confirmed"])
    .gt("starts_at", now)
    .lte("starts_at", through);

  if (error) return { created: 0, error: error.message };

  const queue: QueueInput[] = [];
  for (const appointment of data ?? []) {
    const job = one<{ id: string; customer_id: string; customers: CustomerReference | CustomerReference[] | null }>(appointment.jobs);
    const customer = one<CustomerReference>(job?.customers ?? null);
    if (!job || !isQueueableCustomer(customer)) continue;

    await cancelObsoleteAppointmentVersion(supabase, "appointment_id", appointment.id, appointment.starts_at);
    const isEstimate = appointment.appointment_type === "estimate";
    const confirmationEnabled = isEstimate ? settings.estimate_confirmation_enabled : settings.work_confirmation_enabled;
    const reminderEnabled = isEstimate ? settings.estimate_reminder_enabled : settings.work_reminder_enabled;
    const hoursBefore = isEstimate ? settings.estimate_reminder_hours_before : settings.work_reminder_hours_before;
    const prefix = isEstimate ? "estimate" : "work";

    if (confirmationEnabled && appointment.created_at >= settings.updated_at) {
      queue.push(buildQueueInput({
        appointmentId: appointment.id,
        communicationType: `${prefix}_confirmation` as CommunicationType,
        customer,
        idempotencyKey: `auto:appointment:${appointment.id}:confirmation:${appointment.starts_at}`,
        jobId: job.id,
        reminderStage: "confirmation",
        scheduledFor: new Date().toISOString(),
        sourceVersion: appointment.starts_at,
      }));
    }

    if (reminderEnabled) {
      queue.push(buildQueueInput({
        appointmentId: appointment.id,
        communicationType: `${prefix}_reminder` as CommunicationType,
        customer,
        idempotencyKey: `auto:appointment:${appointment.id}:reminder:${appointment.starts_at}`,
        jobId: job.id,
        reminderStage: "reminder",
        scheduledFor: notBeforeNow(addHours(appointment.starts_at, -hoursBefore)),
        sourceVersion: appointment.starts_at,
      }));
    }
  }

  return insertQueueRows(supabase, queue);
}

async function syncPayments(supabase: SupabaseClient, settings: CommunicationSettings) {
  if (!settings.payment_confirmation_enabled) return emptySyncResult();

  const { data, error } = await supabase
    .from("payments")
    .select("id, invoice_id, customer_id, status, created_at, updated_at, customers(id, email, organization_id, status)")
    .eq("status", "succeeded")
    .gte("created_at", settings.updated_at);

  if (error) return { created: 0, error: error.message };

  const queue = (data ?? []).flatMap((payment) => {
    const customer = one<CustomerReference>(payment.customers);
    if (!isQueueableCustomer(customer)) return [];

    return [buildQueueInput({
      communicationType: "payment_confirmation",
      customer,
      idempotencyKey: `auto:payment:${payment.id}:confirmation`,
      invoiceId: payment.invoice_id,
      paymentId: payment.id,
      reminderStage: "payment",
      scheduledFor: new Date().toISOString(),
      sourceVersion: payment.updated_at,
    })];
  });

  return insertQueueRows(supabase, queue);
}

async function cancelObsoleteAppointmentVersion(
  supabase: SupabaseClient,
  column: "appointment_id" | "schedule_event_id",
  id: string,
  sourceVersion: string,
) {
  await supabase
    .from("customer_communications")
    .update({
      cancelled_at: new Date().toISOString(),
      skip_reason: "The appointment was rescheduled. A current reminder replaces this one.",
      status: "cancelled",
    })
    .eq(column, id)
    .eq("status", "pending")
    .or(`source_version.is.null,source_version.neq.${sourceVersion}`);
}

function buildQueueInput(input: {
  appointmentId?: string;
  communicationType: CommunicationType;
  customer: CustomerReference;
  idempotencyKey: string;
  invoiceId?: string;
  jobId?: string;
  paymentId?: string;
  quoteId?: string;
  reminderStage: string;
  scheduleEventId?: string;
  scheduledFor: string;
  sourceVersion: string;
}): QueueInput {
  return {
    communication_type: input.communicationType,
    reminder_stage: input.reminderStage,
    customer_id: input.customer.id,
    organization_id: input.customer.organization_id,
    quote_id: input.quoteId ?? null,
    invoice_id: input.invoiceId ?? null,
    job_id: input.jobId ?? null,
    schedule_event_id: input.scheduleEventId ?? null,
    appointment_id: input.appointmentId ?? null,
    payment_id: input.paymentId ?? null,
    recipient_source: "customer",
    recipient_email: input.customer.email?.trim().toLowerCase() ?? "",
    scheduled_for: input.scheduledFor,
    source_version: input.sourceVersion,
    is_automatic: true,
    idempotency_key: input.idempotencyKey,
    created_by_user_id: null,
  };
}

async function insertQueueRows(supabase: SupabaseClient, rows: QueueInput[]) {
  if (rows.length === 0) return emptySyncResult();

  const { error } = await supabase
    .from("customer_communications")
    .upsert(rows, { ignoreDuplicates: true, onConflict: "idempotency_key" });

  return { created: error ? 0 : rows.length, error: error?.message ?? null };
}

function isQueueableCustomer(customer: CustomerReference | null): customer is CustomerReference {
  return Boolean(customer && customer.status !== "archived" && isValidEmail(customer.email ?? ""));
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function addHours(value: string, hours: number) {
  return new Date(new Date(value).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function notBeforeNow(value: string) {
  return new Date(value).getTime() > Date.now() ? value : new Date().toISOString();
}

function emptySyncResult() {
  return { created: 0, error: null as string | null };
}
