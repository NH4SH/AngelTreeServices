export type QuoteEditConflict = { currentRevision: number; currentTotalCents: number; currentStatus: string; changedAt: string | null; changedBy: string };
export type QuoteSaveResult = { id: string; edit_revision: number; line_ids: string[] };
export function quoteEditConflict(value: unknown): QuoteEditConflict | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return row.conflict === true && Number.isSafeInteger(row.current_revision) && Number(row.current_revision) > 0
    && Number.isSafeInteger(row.current_total_cents) && typeof row.current_status === "string" && typeof row.changed_by === "string"
    ? { currentRevision: Number(row.current_revision), currentTotalCents: Number(row.current_total_cents), currentStatus: row.current_status,
      changedAt: typeof row.changed_at === "string" ? row.changed_at : null, changedBy: row.changed_by } : null;
}
export function quoteSaveResult(value: unknown, lineCount: number): QuoteSaveResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || "conflict" in value) return null;
  const row = value as QuoteSaveResult;
  return quoteUuid(row.id) && Number.isSafeInteger(row.edit_revision) && row.edit_revision > 0 && Array.isArray(row.line_ids)
    && row.line_ids.length === lineCount && row.line_ids.every(quoteUuid)
    && new Set(row.line_ids.map(id => id.toLowerCase())).size === row.line_ids.length ? row : null;
}
export function quoteUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export class QuoteEditError extends Error {
  readonly status: number;
  readonly conflict: QuoteEditConflict | null;
  constructor(message: string, status = 400, conflict: QuoteEditConflict | null = null) { super(message); this.status = status; this.conflict = conflict; }
}
