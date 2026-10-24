import type { CustomerCommunication } from "@/lib/types/database";

export type ManualReminderMode = "send" | "schedule";
export type ManualReminderFields = {
  communication_type: string; record_type: string; record_id: string;
  recipient_source: string; recipient_email: string; scheduled_for: string;
};
export type ManualReminderRequest = ManualReminderFields & { request_id: string; mode: ManualReminderMode };
export const isReminderUuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export const manualReminderStatuses = ["pending", "processing", "sent", "failed", "skipped", "cancelled"] as const;
const fields = ["communication_type", "record_type", "record_id", "recipient_source", "recipient_email", "scheduled_for"] as const;
export function captureManualReminder(form: FormData): ManualReminderFields {
  const value = Object.fromEntries(fields.map(key => [key, String(form.get(key) ?? "").trim()])) as ManualReminderFields;
  value.record_id = value.record_id.toLowerCase(); value.recipient_email = value.recipient_email.toLowerCase();
  return value;
}
export function parseManualReminderRequest(form: FormData, mode: ManualReminderMode): ManualReminderRequest | null {
  const value = captureManualReminder(form), request_id = String(form.get("request_id") ?? "").trim().toLowerCase();
  const allowed: Record<string, string[]> = {
    quote: ["quote_follow_up"], invoice: ["invoice_payment_reminder", "overdue_invoice_reminder"],
    job: ["work_confirmation", "work_reminder"],
    schedule_event: ["estimate_confirmation", "estimate_reminder", "work_confirmation", "work_reminder"],
    appointment: ["estimate_confirmation", "estimate_reminder", "work_confirmation", "work_reminder"],
  };
  if (!isReminderUuid(request_id) || !isReminderUuid(value.record_id) || !allowed[value.record_type]?.includes(value.communication_type)
    || !["customer", "organization"].includes(value.recipient_source) || value.recipient_email.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.recipient_email) || value.scheduled_for.length > 64) return null;
  return { ...value, request_id, mode };
}
export function manualReminderKey(actorId: string, requestId: string) { return `manual-request:v1:${actorId}:${requestId}`; }
export function isRecordedManualReminder(value: unknown, request: ManualReminderRequest, actorId: string): value is CustomerCommunication {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as CustomerCommunication;
  return isReminderUuid(row.id) && row.idempotency_key === manualReminderKey(actorId, request.request_id)
    && row.created_by_user_id === actorId && row.is_automatic === false && manualReminderStatuses.includes(row.status)
    && typeof row.scheduled_for === "string" && Number.isFinite(Date.parse(row.scheduled_for));
}
export function matchesManualReminder(row: CustomerCommunication, request: ManualReminderRequest, scheduledFor: Date | null) {
  const column = { quote: "quote_id", invoice: "invoice_id", job: "job_id", schedule_event: "schedule_event_id", appointment: "appointment_id" }[request.record_type] as "quote_id" | "invoice_id" | "job_id" | "schedule_event_id" | "appointment_id";
  return row[column] === request.record_id && row.communication_type === request.communication_type
    && row.reminder_stage === (request.mode === "send" ? "manual_now" : "manual_scheduled")
    && row.recipient_source === request.recipient_source && row.recipient_email === request.recipient_email
    && row.payment_id === null && (request.mode === "send" || !!scheduledFor && Date.parse(row.scheduled_for) === scheduledFor.getTime());
}
export type ManualReminderAttempt = { version: 1; requestId: string; fields: ManualReminderFields; reminderId?: string; reminderStatus?: CustomerCommunication["status"] };
export function manualReminderStorageKey(actorId: string, recordType: string, recordId: string, type: string, mode: ManualReminderMode) {
  return `ats.manual-reminder.v1.${actorId}.${recordType}.${recordId}.${type}.${mode}`;
}
export function loadManualReminderAttempt(raw: string | null, context: Pick<ManualReminderFields, "record_type" | "record_id" | "communication_type">, mode: ManualReminderMode): ManualReminderAttempt | null {
  if (raw === null) return null;
  if (raw.length > 4096) throw Error("Saved reminder is unavailable");
  const value = JSON.parse(raw) as ManualReminderAttempt;
  if (value?.version !== 1 || !isReminderUuid(value.requestId) || !value.fields || fields.some(key => typeof value.fields[key] !== "string")
    || Object.entries(context).some(([key, entry]) => value.fields[key as keyof ManualReminderFields] !== entry)
    || value.reminderId !== undefined && !isReminderUuid(value.reminderId)
    || value.reminderStatus !== undefined && !manualReminderStatuses.includes(value.reminderStatus)) throw Error("Saved reminder is unavailable");
  const f = manualReminderForm(value); if (!parseManualReminderRequest(f, mode)) throw Error("Saved reminder is unavailable");
  return value;
}
export function manualReminderForm(attempt: ManualReminderAttempt) {
  const form = new FormData(); for (const [key, value] of Object.entries(attempt.fields)) form.set(key, value);
  form.set("request_id", attempt.requestId); return form;
}
export function canPrepareAnotherReminder(attempt: ManualReminderAttempt, mode: ManualReminderMode) {
  return !!attempt.reminderId && (mode === "schedule" || ["sent", "cancelled", "skipped"].includes(attempt.reminderStatus ?? ""));
}
