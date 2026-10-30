import { isGenerationRequestId } from "../invoices/generation-request.ts";

export type JobCompletionContext = {
  job_id: string; revision: number; status: string; completed_at: string | null;
  future_count: number; has_invoice: boolean | null; closeout_status: string | null;
  visits: { id: string; kind: "event" | "appointment"; title: string; starts_at: string; ends_at: string | null }[];
  snapshot: { checklist: { id: string; version: string }[]; scope_items: { id: string; version: string }[]; visits: { id: string; kind: string; version: string }[]; closeout: { id: string; status: string; version: string } | null };
};
export function parseCompletionContext(value: unknown): JobCompletionContext | null {
  if (!value || typeof value !== "object") return null;
  const c = value as JobCompletionContext;
  const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
  return isGenerationRequestId(c.job_id) && Number.isSafeInteger(c.revision) && c.revision > 0
    && typeof c.status === "string" && (c.completed_at === null || date(c.completed_at))
    && Number.isSafeInteger(c.future_count) && c.future_count >= 0
    && (c.has_invoice === null || typeof c.has_invoice === "boolean")
    && (c.closeout_status === null || typeof c.closeout_status === "string")
    && Array.isArray(c.visits) && c.visits.every(v => isGenerationRequestId(v.id) && ["event", "appointment"].includes(v.kind)
      && typeof v.title === "string" && date(v.starts_at) && (v.ends_at === null || date(v.ends_at)))
    && !!c.snapshot && Array.isArray(c.snapshot.visits) && c.snapshot.visits.every(v => isGenerationRequestId(v.id)
      && ["event", "appointment"].includes(v.kind) && typeof v.version === "string")
    && [c.snapshot.checklist, c.snapshot.scope_items].every(rows => Array.isArray(rows) && rows.every(v => isGenerationRequestId(v.id) && typeof v.version === "string"))
    && (c.snapshot.closeout === null || (!!c.snapshot.closeout && isGenerationRequestId(c.snapshot.closeout.id)
      && typeof c.snapshot.closeout.status === "string" && typeof c.snapshot.closeout.version === "string")) ? c : null;
}

/** A changed, explicitly reviewed command gets a new identity; an exact retry keeps it. */
export function getCompletionRequest(storage: Pick<Storage, "getItem" | "setItem">, actor: string, job: string,
  mode: string, fingerprint: string, newId: () => string) {
  const key = `ats.job-completion.${actor}.${job}.${mode}`;
  const saved = storage.getItem(key);
  if (saved !== null) {
    const row = JSON.parse(saved) as { id?: unknown; fingerprint?: unknown };
    if (!isGenerationRequestId(row.id) || typeof row.fingerprint !== "string") throw new Error("Saved completion request is unreadable.");
    if (row.fingerprint === fingerprint) return row.id;
  }
  const id = newId();
  if (!isGenerationRequestId(id)) throw new Error("Completion request is unavailable.");
  storage.setItem(key, JSON.stringify({ id, fingerprint }));
  return id;
}

export function completionInputs(form: FormData) {
  const revision = Number(form.get("expected_revision"));
  let snapshot: JobCompletionContext["snapshot"];
  try { snapshot = JSON.parse(String(form.get("expected_snapshot"))); } catch { return null; }
  if (!Number.isSafeInteger(revision) || revision < 1 || !snapshot || !Array.isArray(snapshot.visits)) return null;
  return { p_expected_revision: revision, p_expected_snapshot: snapshot, p_confirm_future: form.get("confirm_future") === "on" };
}

/** Store a digest for retry matching, never an additional persistent copy of crew/office notes. */
export async function completionFingerprint(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
