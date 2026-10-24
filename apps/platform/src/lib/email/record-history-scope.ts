export const recordEmailColumns = {
  quote: "related_quote_id",
  invoice: "related_invoice_id",
  change_order: "related_change_order_id",
} as const;
export type RecordEmailType = keyof typeof recordEmailColumns;
export type RecordEmailScope = { recordType: RecordEmailType; recordId: string };
export type RecordEmailView = "all" | "attention";

export function recordEmailScope(type: unknown, id: unknown): RecordEmailScope | null {
  return typeof type === "string" && Object.hasOwn(recordEmailColumns, type) && typeof id === "string"
    && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)
    ? { recordType: type as RecordEmailType, recordId: id.toLowerCase() } : null;
}
export function recordEmailRecordHref(scope: RecordEmailScope): string {
  const valid = recordEmailScope(scope?.recordType, scope?.recordId);
  if (!valid) throw new Error("Invalid email history record.");
  const section = { quote: "quotes", invoice: "invoices", change_order: "change-orders" }[valid.recordType];
  return `/admin/${section}/${valid.recordId}`;
}
export function recordEmailHistoryHref(scope: RecordEmailScope, view: RecordEmailView = "all", page = 1): string {
  const valid = recordEmailScope(scope?.recordType, scope?.recordId);
  if (!valid) throw new Error("Invalid email history record.");
  const query = new URLSearchParams({ view: view === "attention" ? "attention" : "all", page: String(page) });
  return `/admin/communications/email/${valid.recordType}/${valid.recordId}?${query}`;
}
