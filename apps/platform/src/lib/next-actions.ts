export type NextActionSubject = "customer_id" | "organization_id" | "quote_id" | "job_id" | "invoice_id";

export function nextActionHref(task: Partial<Record<NextActionSubject, string | null>>) {
  for (const [key, route] of [["quote_id", "quotes"], ["invoice_id", "invoices"], ["job_id", "jobs"], ["organization_id", "organizations"], ["customer_id", "customers"]] as const) {
    if (task[key]) return `/admin/${route}/${task[key]}`;
  }
  return "/admin/recurring";
}

export function nextActionDue(task: { due_at: string; snoozed_until?: string | null }) {
  return new Date(task.snoozed_until ?? task.due_at).getTime();
}

export function followUpRequestKey(userId: string, requestId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
    ? `handoff:${userId}:${requestId}` : null;
}
