// Recovery is a bounded convenience cache, never a source of authorization or
// a replacement for the server's revision checks. Keep its schema allowlisted.
export const DRAFT_PREFIX = "ats-document-draft-v1:";
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_DRAFT_BYTES = 250_000;
export type DocumentKind = "quote" | "invoice";
export type RecoveryLine = {
  persistedId: string; name: string; description: string; serviceCategoryId: string;
  materialId: string; quantity: string; unitPrice: string;
};
export type DocumentCopy = {
  version: 1; userId: string; kind: DocumentKind; recordKey: string;
  revision: string; savedAt: number; fields: Record<string, string>;
  lines: RecoveryLine[]; requestId: string; attempted: boolean;
};
const headerNames = {
  quote: ["contracting_party", "service_location_id", "recipient_contact_id", "approval_contact_id", "onsite_contact_id", "billing_contact_id", "purchase_order_reference", "payment_terms", "estimate_schedule_event_id", "job_id", "customer_message", "debris_handling", "debris_handling_notes", "expires_at"],
  invoice: ["contracting_party", "service_location_id", "job_id", "due_date", "notes"],
} as const;
const lineNames = {
  persistedId: "line_item_id", name: "line_item_name", description: "line_item_description",
  serviceCategoryId: "line_item_service_category_id", materialId: "line_item_material_id",
  quantity: "line_item_quantity", unitPrice: "line_item_unit_price",
} as const;
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 12_000) => typeof value === "string" && value.length <= max ? value : null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function documentDraftKey(userId: string, kind: DocumentKind, recordKey: string) {
  return `${DRAFT_PREFIX}${encodeURIComponent(userId)}:${kind}:${encodeURIComponent(recordKey)}`;
}

export function captureDocument(form: FormData, scope: Pick<DocumentCopy, "userId" | "kind" | "recordKey" | "revision">, requestId = "", attempted = false, now = Date.now()): DocumentCopy {
  const fields = Object.fromEntries(headerNames[scope.kind].map(name => [name, String(form.get(name) ?? "")]));
  // A walk-in's contact/address fields are deliberately excluded. Recovery must
  // ask for the customer again, rather than storing a second contact directory.
  if (fields.contracting_party === "new_customer") fields.contracting_party = "";
  const columns = Object.fromEntries(Object.entries(lineNames).map(([key, name]) => [key, form.getAll(scope.kind === "invoice" ? `invoice_${name}` : name)]));
  const lines = columns.name.map((_, index) => Object.fromEntries(Object.keys(lineNames).map(key => [key, String(columns[key][index] ?? "")]))) as RecoveryLine[];
  return { version: 1, userId: scope.userId, kind: scope.kind, recordKey: scope.recordKey, revision: scope.revision, savedAt: now, fields, lines, requestId, attempted };
}

export function readDocument(raw: string | null, scope: Pick<DocumentCopy, "userId" | "kind" | "recordKey">, now = Date.now()): DocumentCopy | null {
  if (!raw || raw.length > MAX_DRAFT_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isObject(value) || value.version !== 1 || value.userId !== scope.userId || value.kind !== scope.kind || value.recordKey !== scope.recordKey
      || typeof value.savedAt !== "number" || value.savedAt > now + 60_000 || now - value.savedAt > DRAFT_TTL_MS
      || text(value.revision, 100) === null || !isObject(value.fields) || !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 300) return null;
    const fields: Record<string, string> = {};
    for (const name of headerNames[scope.kind]) {
      const field = value.fields[name] ?? "";
      if (text(field) === null) return null;
      fields[name] = field as string;
    }
    const lines: RecoveryLine[] = [];
    const seen = new Set<string>();
    for (const row of value.lines) {
      if (!isObject(row)) return null;
      const line: Record<string, string> = {};
      for (const name of Object.keys(lineNames)) {
        if (text(row[name]) === null) return null;
        line[name] = row[name] as string;
      }
      if (line.persistedId && (!uuid.test(line.persistedId) || seen.has(line.persistedId))) return null;
      if (line.persistedId) seen.add(line.persistedId);
      lines.push(line as RecoveryLine);
    }
    return { version: 1, userId: scope.userId, kind: scope.kind, recordKey: scope.recordKey, revision: value.revision as string, savedAt: value.savedAt, fields, lines,
      requestId: typeof value.requestId === "string" && uuid.test(value.requestId) ? value.requestId : "", attempted: value.attempted === true };
  } catch { return null; }
}

export function canRestoreDocument(copy: DocumentCopy, revision: string, persistedIds: readonly string[]) {
  const allowed = new Set(persistedIds);
  return copy.revision === revision && copy.lines.every(line => !line.persistedId || allowed.has(line.persistedId));
}

export function restoreDocumentFields(form: HTMLFormElement, fields: Record<string, string>) {
  for (const [name, value] of Object.entries(fields)) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLSelectElement) {
      input.value = [...input.options].some(option => option.value === value) ? value : "";
    } else if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      if (input.type !== "hidden" && input.type !== "checkbox") input.value = value;
    }
  }
}
