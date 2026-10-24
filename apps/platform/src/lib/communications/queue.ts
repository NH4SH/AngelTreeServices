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

type OrganizationReference = {
  billing_email: string | null;
  id: string;
  status: string;
};

type ContractingPartyReference = {
  customerId: string | null;
  email: string;
  organizationId: string | null;
  recipientSource: "customer" | "organization";
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
  try {
    const { data, error } = await supabase
      .from("communication_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (error || !data || typeof data !== "object" || Array.isArray(data)) {
      return { data: null, error: "Communication settings are unavailable." };
    }
    return { data: data as CommunicationSettings, error: null };
  } catch {
    return { data: null, error: "Communication settings are unavailable." };
  }
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

  let coverage: NoticeCoverage[] = [];
  if (settings.appointment_change_notices_enabled) {
    try {
      coverage = await readNoticeCoverage(supabase);
    } catch {
      return { created: 0, error: "Visit update coverage could not be checked." };
    }
  }
  const results = await Promise.all([
    syncScheduleEvents(supabase, settings, coverage),
    syncAppointments(supabase, settings, coverage),
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

// Webhook recovery plans only this invoice's existing reminder/confirmation
// families. It must not revisit unrelated schedules or run any sender.
export async function syncInvoicePaymentCommunications(supabase: SupabaseClient, invoiceId: string) {
  const settings = await getCommunicationSettingsFromClient(supabase);
  if (settings.error || !settings.data) return { created: 0, error: settings.error ?? "Communication settings are unavailable." };
  if (!settings.data.automated_sending_enabled) return { created: 0, error: null };
  const results = await Promise.all([
    syncInvoices(supabase, settings.data, invoiceId),
    syncPayments(supabase, settings.data, invoiceId),
  ]);
  return { created: results.reduce((sum, item) => sum + item.created, 0), error: results.find(item => item.error)?.error ?? null };
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

// Complete source reads precede writes. Keep the existing source filters and
// use UUID cursors so earlier deletions cannot shift later records out of view.
async function readReminderSources<T extends { id: string }>(
  queryPage: (after: string | null, signal: AbortSignal) => PromiseLike<{ data: T[] | null; error: unknown }>,
  deadline: number,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  while (true) {
    if (Date.now() >= deadline) throw Error("Reminder preparation timed out");
    const result = await queryPage(after, AbortSignal.timeout(Math.max(1, deadline - Date.now())));
    if (result.error || !Array.isArray(result.data) || result.data.length > 200) throw Error("Reminder sources unavailable");
    if (!result.data.length) return rows;
    for (const row of result.data) {
      const id = row?.id;
      if (typeof id !== "string" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) || (after !== null && id <= after)) {
        throw Error("Reminder sources did not advance");
      }
      after = id;
      rows.push(row);
    }
  }
}

async function insertReminderRows(supabase: SupabaseClient, rows: QueueInput[], deadline: number, unavailable: string) {
  let prepared = 0;
  try {
    for (let offset = 0; offset < rows.length; offset += 200) {
      if (Date.now() >= deadline) throw Error("Reminder preparation timed out");
      const batch = rows.slice(offset, offset + 200);
      const result = await supabase.from("customer_communications")
        .upsert(batch, { ignoreDuplicates: true, onConflict: "idempotency_key" })
        .abortSignal(AbortSignal.timeout(Math.max(1, deadline - Date.now())));
      if (result.error) throw Error("Reminder preparation unavailable");
      prepared += batch.length;
    }
    return { created: prepared, error: null };
  } catch {
    return { created: prepared, error: unavailable };
  }
}

async function syncQuotes(supabase: SupabaseClient, settings: CommunicationSettings) {
  if (!settings.quote_follow_up_enabled) return emptySyncResult();

  const lookback = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const deadline = Date.now() + 5_000;
  const unavailable = "Proposal follow-ups could not be prepared. Review the queue before retrying.";
  try {
    const data = await readReminderSources((after, signal) => {
      let query = supabase
        .from("quotes")
        .select("id, customer_id, organization_id, sent_at, status, updated_at, automatic_follow_ups_enabled, customers:customers!quotes_customer_id_fkey(id, email, organization_id, status), organizations(id, billing_email, status), approval_contact:organization_contacts!quotes_approval_contact_id_fkey(email, is_active), recipient_contact:organization_contacts!quotes_recipient_contact_id_fkey(email, is_active)")
        .eq("status", "sent")
        .eq("automatic_follow_ups_enabled", true)
        .not("sent_at", "is", null)
        .gte("sent_at", lookback)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order("id")
        .limit(200);
      if (after) query = query.gt("id", after);
      return query.abortSignal(signal);
    }, deadline);

    const queue: QueueInput[] = [];
    for (const quote of data ?? []) {
      const party = getQueueableParty(quote.customers, quote.organizations, contactEmail(quote.approval_contact, quote.recipient_contact));
      if (!party || !quote.sent_at) continue;

      for (const [stage, days] of [
        ["first", settings.quote_first_follow_up_days],
        ["second", settings.quote_second_follow_up_days],
      ] as const) {
        queue.push(buildQueueInput({
          communicationType: "quote_follow_up",
          party,
          idempotencyKey: `auto:quote:${quote.id}:follow-up:${stage}`,
          quoteId: quote.id,
          reminderStage: stage,
          scheduledFor: addHours(quote.sent_at, days * 24),
          sourceVersion: quote.updated_at,
        }));
      }
    }

    return insertReminderRows(supabase, queue, deadline, unavailable);
  } catch {
    return { created: 0, error: unavailable };
  }
}

async function syncInvoices(supabase: SupabaseClient, settings: CommunicationSettings, invoiceId?: string) {
  if (!settings.invoice_reminder_enabled) return emptySyncResult();

  const dueLookback = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const deadline = Date.now() + 5_000;
  const unavailable = "Invoice reminders could not be prepared. Review the queue before retrying.";
  try {
    const data = await readReminderSources((after, signal) => {
      let query = supabase
        .from("invoices")
        .select("id, customer_id, organization_id, due_at, status, balance_due_cents, updated_at, automatic_reminders_enabled, customers:customers!invoices_customer_id_fkey(id, email, organization_id, status), organizations(id, billing_email, status), accounts_payable_contact:organization_contacts!invoices_accounts_payable_contact_id_fkey(email, is_active), billing_contact:organization_contacts!invoices_billing_contact_id_fkey(email, is_active)")
        .in("status", ["sent", "partially_paid", "overdue"])
        .eq("automatic_reminders_enabled", true)
        .gt("balance_due_cents", 0)
        .not("due_at", "is", null)
        .gte("due_at", dueLookback)
        .order("id")
        .limit(200);
      if (invoiceId) query = query.eq("id", invoiceId);
      if (after) query = query.gt("id", after);
      return query.abortSignal(signal);
    }, deadline);

    const queue: QueueInput[] = [];
    for (const invoice of data ?? []) {
      const party = getQueueableParty(invoice.customers, invoice.organizations, contactEmail(invoice.accounts_payable_contact, invoice.billing_contact));
      if (!party || !invoice.due_at) continue;

      queue.push(buildQueueInput({
        communicationType: "invoice_payment_reminder",
        party,
        idempotencyKey: `auto:invoice:${invoice.id}:reminder:first`,
        invoiceId: invoice.id,
        reminderStage: "first",
        scheduledFor: addHours(invoice.due_at, settings.invoice_first_reminder_days * 24),
        sourceVersion: invoice.updated_at,
      }));
      queue.push(buildQueueInput({
        communicationType: "overdue_invoice_reminder",
        party,
        idempotencyKey: `auto:invoice:${invoice.id}:reminder:second`,
        invoiceId: invoice.id,
        reminderStage: "second",
        scheduledFor: addHours(invoice.due_at, settings.invoice_second_reminder_days * 24),
        sourceVersion: invoice.updated_at,
      }));
    }

    return insertReminderRows(supabase, queue, deadline, unavailable);
  } catch {
    return { created: 0, error: unavailable };
  }
}

type NoticeCoverage = { source_kind: "schedule_event" | "appointment"; source_id: string; suppress_reminder: boolean };

// Coverage is a set, not a unique row per source: canonical schedule links can
// repeat an appointment. Read presence and positive suppression separately so a
// page ending inside duplicate IDs cannot hide a later true suppression value.
async function readNoticeCoverage(supabase: SupabaseClient): Promise<NoticeCoverage[]> {
  const deadline = Date.now() + 5_000;
  const covered = new Map<string, NoticeCoverage>();
  for (const kind of ["schedule_event", "appointment"] as const) {
    for (const suppressOnly of [false, true]) {
      let after: string | null = null;
      while (true) {
        if (Date.now() >= deadline) throw Error("Visit coverage timed out");
        let query = supabase.rpc("get_appointment_notice_coverage")
          .eq("source_kind", kind).order("source_id").limit(200);
        if (suppressOnly) query = query.eq("suppress_reminder", true);
        if (after) query = query.gt("source_id", after);
        const result = await query.abortSignal(AbortSignal.timeout(Math.max(1, deadline - Date.now())));
        if (result.error || !Array.isArray(result.data) || result.data.length > 200) throw Error("Visit coverage unavailable");
        if (!result.data.length) break;
        let previous: string | null = after;
        for (const row of result.data as NoticeCoverage[]) {
          const id = row?.source_id;
          if (row?.source_kind !== kind || typeof id !== "string" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)
            || (after !== null && id <= after) || (previous !== null && id < previous)
            || (suppressOnly && row.suppress_reminder !== true)) throw Error("Visit coverage did not advance");
          previous = id;
          const key = `${kind}:${id}`;
          if (!covered.has(key) || suppressOnly) covered.set(key, { source_kind: kind, source_id: id, suppress_reminder: suppressOnly });
        }
        after = previous;
      }
    }
  }
  return [...covered.values()];
}

async function syncScheduleEvents(supabase: SupabaseClient, settings: CommunicationSettings, coverage: NoticeCoverage[]) {
  const now = new Date().toISOString();
  const through = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
  const unavailable = "Visit reminders could not be prepared. Review the queue before retrying.";
  try {
    const data = await readReminderSources((after, signal) => {
      let query = supabase
        .from("schedule_events")
        .select("id, event_type, status, starts_at, ends_at, created_at, updated_at, job_id, jobs:jobs!schedule_events_job_id_fkey(id, customer_id, organization_id, lead_disposition, customers:customers!jobs_customer_id_fkey(id, email, organization_id, status), organizations(id, billing_email, status), onsite_contact:organization_contacts!jobs_onsite_contact_id_fkey(email, is_active), property_contact:organization_contacts!jobs_property_manager_contact_id_fkey(email, is_active))")
        .in("event_type", ["estimate", "job", "maintenance", "emergency"])
        .in("status", ["scheduled", "confirmed"])
        .not("job_id", "is", null)
        .gt("starts_at", now)
        .lte("starts_at", through)
        .order("id").limit(200);
      if (after) query = query.gt("id", after);
      return query.abortSignal(signal);
    }, Date.now() + 5_000);

    const queue: QueueInput[] = [];
    const cleanup: { id: string; source_version: string }[] = [];
    const firstWorkEventByJob = new Map<string, string>();
    for (const event of [...(data ?? [])].filter((item) => item.event_type === "job" && item.job_id).sort((left, right) => left.starts_at.localeCompare(right.starts_at))) {
      if (!firstWorkEventByJob.has(event.job_id!)) firstWorkEventByJob.set(event.job_id!, event.id);
    }
    for (const event of data ?? []) {
      if (event.event_type === "job" && event.job_id && firstWorkEventByJob.get(event.job_id) !== event.id) continue;
      const job = one<any>(event.jobs);
      if (job?.lead_disposition && job.lead_disposition !== "active") continue;
      const party = getQueueableParty(job?.customers ?? null, job?.organizations ?? null, contactEmail(job?.onsite_contact, job?.property_contact));
      if (!job || !party) continue;

      cleanup.push({ id: event.id, source_version: event.starts_at });
      const isEstimate = event.event_type === "estimate";
      const confirmationEnabled = isEstimate ? settings.estimate_confirmation_enabled : settings.work_confirmation_enabled;
      const reminderEnabled = isEstimate ? settings.estimate_reminder_enabled : settings.work_reminder_enabled;
      const hoursBefore = isEstimate ? settings.estimate_reminder_hours_before : settings.work_reminder_hours_before;
      const prefix = isEstimate ? "estimate" : "work";

      const covered = coverage.find(item => item.source_kind === "schedule_event" && item.source_id === event.id);
      if (!covered && confirmationEnabled && event.created_at >= settings.updated_at) {
        queue.push(buildQueueInput({
          communicationType: `${prefix}_confirmation` as CommunicationType,
          party,
          idempotencyKey: `auto:schedule-event:${event.id}:confirmation:${event.starts_at}`,
          jobId: job.id,
          reminderStage: "confirmation",
          scheduleEventId: event.id,
          scheduledFor: new Date().toISOString(),
          sourceVersion: event.starts_at,
        }));
      }

      if (reminderEnabled && !covered?.suppress_reminder) {
        queue.push(buildQueueInput({
          communicationType: `${prefix}_reminder` as CommunicationType,
          party,
          idempotencyKey: `auto:schedule-event:${event.id}:reminder:${event.starts_at}`,
          jobId: job.id,
          reminderStage: "reminder",
          scheduleEventId: event.id,
          scheduledFor: notBeforeNow(addHours(event.starts_at, -hoursBefore)),
          sourceVersion: event.starts_at,
        }));
      }
    }

    if (!await cancelObsoleteVisitReminders(supabase, "schedule_event", cleanup)) {
      return { created: 0, error: "Appointment reminders could not be reconciled. Review the queue before retrying." };
    }
    return insertReminderRows(supabase, queue, Date.now() + 5_000, unavailable);
  } catch {
    return { created: 0, error: unavailable };
  }
}

async function syncAppointments(supabase: SupabaseClient, settings: CommunicationSettings, coverage: NoticeCoverage[]) {
  const now = new Date().toISOString();
  const through = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
  const unavailable = "Visit reminders could not be prepared. Review the queue before retrying.";
  try {
    const data = await readReminderSources((after, signal) => {
      let query = supabase
        .from("appointments")
        .select("id, appointment_type, status, starts_at, created_at, updated_at, job_id, jobs(id, customer_id, organization_id, customers:customers!jobs_customer_id_fkey(id, email, organization_id, status), organizations(id, billing_email, status), onsite_contact:organization_contacts!jobs_onsite_contact_id_fkey(email, is_active), property_contact:organization_contacts!jobs_property_manager_contact_id_fkey(email, is_active))")
        .in("appointment_type", ["estimate", "job", "maintenance"])
        .in("status", ["scheduled", "confirmed"])
        .gt("starts_at", now)
        .lte("starts_at", through)
        .order("id").limit(200);
      if (after) query = query.gt("id", after);
      return query.abortSignal(signal);
    }, Date.now() + 5_000);

    const queue: QueueInput[] = [];
    const cleanup: { id: string; source_version: string }[] = [];
    for (const appointment of data ?? []) {
      const job = one<any>(appointment.jobs);
      const party = getQueueableParty(job?.customers ?? null, job?.organizations ?? null, contactEmail(job?.onsite_contact, job?.property_contact));
      if (!job || !party) continue;

      cleanup.push({ id: appointment.id, source_version: appointment.starts_at });
      const isEstimate = appointment.appointment_type === "estimate";
      const confirmationEnabled = isEstimate ? settings.estimate_confirmation_enabled : settings.work_confirmation_enabled;
      const reminderEnabled = isEstimate ? settings.estimate_reminder_enabled : settings.work_reminder_enabled;
      const hoursBefore = isEstimate ? settings.estimate_reminder_hours_before : settings.work_reminder_hours_before;
      const prefix = isEstimate ? "estimate" : "work";

      const covered = coverage.find(item => item.source_kind === "appointment" && item.source_id === appointment.id);
      if (!covered && confirmationEnabled && appointment.created_at >= settings.updated_at) {
        queue.push(buildQueueInput({
          appointmentId: appointment.id,
          communicationType: `${prefix}_confirmation` as CommunicationType,
          party,
          idempotencyKey: `auto:appointment:${appointment.id}:confirmation:${appointment.starts_at}`,
          jobId: job.id,
          reminderStage: "confirmation",
          scheduledFor: new Date().toISOString(),
          sourceVersion: appointment.starts_at,
        }));
      }

      if (reminderEnabled && !covered?.suppress_reminder) {
        queue.push(buildQueueInput({
          appointmentId: appointment.id,
          communicationType: `${prefix}_reminder` as CommunicationType,
          party,
          idempotencyKey: `auto:appointment:${appointment.id}:reminder:${appointment.starts_at}`,
          jobId: job.id,
          reminderStage: "reminder",
          scheduledFor: notBeforeNow(addHours(appointment.starts_at, -hoursBefore)),
          sourceVersion: appointment.starts_at,
        }));
      }
    }

    if (!await cancelObsoleteVisitReminders(supabase, "appointment", cleanup)) {
      return { created: 0, error: "Appointment reminders could not be reconciled. Review the queue before retrying." };
    }
    return insertReminderRows(supabase, queue, Date.now() + 5_000, unavailable);
  } catch {
    return { created: 0, error: unavailable };
  }
}

async function syncPayments(supabase: SupabaseClient, settings: CommunicationSettings, invoiceId?: string) {
  if (!settings.payment_confirmation_enabled) return emptySyncResult();

  const pageSize = 200;
  const deadline = Date.now() + 5_000;
  const queue: QueueInput[] = [];
  const unavailable = "Payment confirmations could not be prepared. Review the queue before retrying.";
  let after: string | null = null;
  let prepared = 0;
  try {
    // Read to an empty page, including when the server caps pages below our
    // requested size. UUID cursors avoid offset shifts after earlier deletions.
    while (true) {
      if (Date.now() >= deadline) throw Error("Payment preparation timed out");
      let query = supabase
        .from("payments")
        .select("id, invoice_id, customer_id, organization_id, status, created_at, updated_at, customers(id, email, organization_id, status), organizations(id, billing_email, status), invoices(accounts_payable_contact:organization_contacts!invoices_accounts_payable_contact_id_fkey(email, is_active), billing_contact:organization_contacts!invoices_billing_contact_id_fkey(email, is_active))")
        .eq("status", "succeeded")
        .gte("created_at", settings.updated_at)
        .order("id")
        .limit(pageSize);
      if (invoiceId) query = query.eq("invoice_id", invoiceId);
      if (after) query = query.gt("id", after);
      const { data, error } = await query.abortSignal(AbortSignal.timeout(Math.max(1, deadline - Date.now())));
      if (error || !Array.isArray(data) || data.length > pageSize) throw Error("Payment sources unavailable");
      if (!data.length) break;
      for (const payment of data) {
        const id = payment?.id;
        if (typeof id !== "string" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) || (after !== null && id <= after)) {
          throw Error("Payment sources did not advance");
        }
        after = id;
        const invoice = one<any>(payment.invoices);
        const party = getQueueableParty(payment.customers, payment.organizations, contactEmail(invoice?.accounts_payable_contact, invoice?.billing_contact));
        if (!party) continue;
        queue.push(buildQueueInput({
          communicationType: "payment_confirmation",
          party,
          idempotencyKey: `auto:payment:${id}:confirmation`,
          invoiceId: payment.invoice_id,
          paymentId: id,
          reminderStage: "payment",
          scheduledFor: new Date().toISOString(),
          sourceVersion: payment.updated_at,
        }));
      }
    }
    // Withhold this family's writes until every source page is checked. Bounded
    // same-key writes can safely resume after a partial or lost acknowledgement.
    for (let offset = 0; offset < queue.length; offset += pageSize) {
      if (Date.now() >= deadline) throw Error("Payment preparation timed out");
      const batch = queue.slice(offset, offset + pageSize);
      const { error } = await supabase.from("customer_communications")
        .upsert(batch, { ignoreDuplicates: true, onConflict: "idempotency_key" })
        .abortSignal(AbortSignal.timeout(Math.max(1, deadline - Date.now())));
      if (error) throw Error("Payment preparation unavailable");
      prepared += batch.length;
    }
    return { created: prepared, error: null };
  } catch {
    return { created: prepared, error: unavailable };
  }
}

async function cancelObsoleteVisitReminders(
  supabase: SupabaseClient,
  sourceKind: "appointment" | "schedule_event",
  sources: { id: string; source_version: string }[],
) {
  const deadline = Date.now() + 5_000;
  try {
    for (let offset = 0; offset < sources.length; offset += 200) {
      if (Date.now() >= deadline) return false;
      const batch = sources.slice(offset, offset + 200);
      const { data, error } = await supabase.rpc("cancel_obsolete_visit_reminders", {
        p_source_kind: sourceKind,
        p_sources: batch,
      }).abortSignal(AbortSignal.timeout(Math.max(1, deadline - Date.now())));
      if (Date.now() >= deadline || error || !data || typeof data !== "object" || Array.isArray(data)
        || data.processed !== batch.length || !Number.isSafeInteger(data.cancelled) || data.cancelled < 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function buildQueueInput(input: {
  appointmentId?: string;
  communicationType: CommunicationType;
  party: ContractingPartyReference;
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
    customer_id: input.party.customerId,
    organization_id: input.party.organizationId,
    quote_id: input.quoteId ?? null,
    invoice_id: input.invoiceId ?? null,
    job_id: input.jobId ?? null,
    schedule_event_id: input.scheduleEventId ?? null,
    appointment_id: input.appointmentId ?? null,
    payment_id: input.paymentId ?? null,
    recipient_source: input.party.recipientSource,
    recipient_email: input.party.email,
    scheduled_for: input.scheduledFor,
    source_version: input.sourceVersion,
    is_automatic: true,
    idempotency_key: input.idempotencyKey,
    created_by_user_id: null,
  };
}


function isQueueableCustomer(customer: CustomerReference | null): customer is CustomerReference {
  return Boolean(customer && customer.status !== "archived" && isValidEmail(customer.email ?? ""));
}

function getQueueableParty(
  customerValue: CustomerReference | CustomerReference[] | null | undefined,
  organizationValue: OrganizationReference | OrganizationReference[] | null | undefined,
  preferredOrganizationEmail?: string | null,
): ContractingPartyReference | null {
  const customer = one(customerValue);
  const organization = one(organizationValue);
  if (Boolean(customer) === Boolean(organization)) return null;
  if (isQueueableCustomer(customer)) {
    return {
      customerId: customer.id,
      email: customer.email!.trim().toLowerCase(),
      organizationId: null,
      recipientSource: "customer",
    };
  }

  const organizationEmail = isValidEmail(preferredOrganizationEmail ?? "") ? preferredOrganizationEmail : organization?.billing_email;
  if (!organization || organization.status === "archived" || !isValidEmail(organizationEmail ?? "")) return null;
  return {
    customerId: null,
    email: organizationEmail!.trim().toLowerCase(),
    organizationId: organization.id,
    recipientSource: "organization",
  };
}

function contactEmail(...values: unknown[]) {
  for (const value of values) {
    const contact = one(value as { email?: string | null; is_active?: boolean } | { email?: string | null; is_active?: boolean }[] | null);
    if (contact?.is_active !== false && isValidEmail(contact?.email ?? "")) return contact!.email!.trim().toLowerCase();
  }
  return null;
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
