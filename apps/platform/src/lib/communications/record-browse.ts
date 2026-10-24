// Shared URL helpers contain no credentials and never accept an arbitrary return URL.
export const reminderRecordColumns = { quote: "quote_id", invoice: "invoice_id", job: "job_id", schedule_event: "schedule_event_id", appointment: "appointment_id" } as const;
export type ReminderBrowseType = keyof typeof reminderRecordColumns;
export type ReminderBrowseScope = { recordType: ReminderBrowseType; recordId: string };
export function reminderRecordScope(type: unknown, id: unknown): ReminderBrowseScope | null {
  return typeof type === "string" && Object.hasOwn(reminderRecordColumns, type) && typeof id === "string"
    && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)
    ? { recordType: type as ReminderBrowseType, recordId: id.toLowerCase() } : null;
}
export function reminderRecordHref(scope: ReminderBrowseScope): string {
  const { recordType: type, recordId: id } = scope;
  return type === "appointment" || type === "schedule_event"
    ? `/admin/schedule?${type === "appointment" ? "appointment" : "event"}=${id}`
    : `/admin/${type === "quote" ? "quotes" : type === "invoice" ? "invoices" : "jobs"}/${id}`;
}
export function reminderBrowseReturn(scope: ReminderBrowseScope, value: unknown): string {
  const fallback = reminderRecordHref(scope);
  if (typeof value !== "string" || value.length > 1800 || !value.startsWith("/admin/") || /[\\#\u0000-\u0020]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://crm.invalid");
    if (url.origin !== "https://crm.invalid") return fallback;
    // A job's controls may browse its current legacy appointment, then return to the job.
    if (url.pathname === fallback.split("?")[0] && url.pathname !== "/admin/schedule"
      || scope.recordType === "appointment" && /^\/admin\/jobs\/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(url.pathname)) return url.pathname;
    if (url.pathname !== "/admin/schedule" || !["appointment", "schedule_event"].includes(scope.recordType)) return fallback;
    const key = scope.recordType === "appointment" ? "appointment" : "event";
    if (url.searchParams.get(key)?.toLowerCase() !== scope.recordId) return fallback;
    const safe = new URLSearchParams({ [key]: scope.recordId });
    for (const name of ["date", "view", "status", "event_type", "assigned_user_id"]) {
      const v = url.searchParams.get(name);
      if (v && (name === "date" ? /^\d{4}-\d{2}-\d{2}$/.test(v) : /^[a-zA-Z0-9_-]{1,40}$/.test(v))) safe.set(name, v);
    }
    return `/admin/schedule?${safe}`;
  } catch { return fallback; }
}
export function reminderBrowseHref(scope: ReminderBrowseScope, view = "scheduled", page = 1, returnTo?: string): string {
  const query = new URLSearchParams({ view: ["scheduled", "failed", "history"].includes(view) ? view : "scheduled", page: String(page), returnTo: reminderBrowseReturn(scope, returnTo) });
  return `/admin/communications/record/${scope.recordType}/${scope.recordId}?${query}`;
}
