import "server-only";
import { createClient } from "@/lib/supabase/server";

export type SenderControls = {
  jobId: string;
  contacts: { email: string | null; phone: string | null };
  blockedKinds: ("email" | "phone")[];
};
export type SenderBlock = {
  id: string; kind: "email" | "phone"; value: string; source_job_id: string;
  reason: string; created_at: string; unblocked_at: string | null;
  unblock_reason: string | null; blocked_requests: number;
};
export type SenderBlockData = { controls: SenderControls[]; rows: SenderBlock[]; count: number; activeCount: number; error: string | null };

export async function getSenderBlockData(jobs: string[], page: number, includeHistory = false): Promise<SenderBlockData> {
  const empty: SenderBlockData = { controls: [], rows: [], count: 0, activeCount: 0, error: "Sender blocks could not be loaded. Refresh before making a change." };
  const db = await createClient();
  if (!db) return empty;
  try {
    const [controls, register] = await Promise.all([
      db.rpc("get_website_sender_controls", { p_jobs: jobs }),
      db.rpc("list_website_sender_blocks", { p_page: page, p_all: includeHistory }),
    ]);
    if (controls.error || register.error || !Array.isArray(controls.data) || !register.data || !Array.isArray(register.data.rows)
      || !Number.isSafeInteger(register.data.count) || !Number.isSafeInteger(register.data.activeCount)
      || !controls.data.every((c: SenderControls) => c && typeof c.jobId === "string" && c.contacts
        && [c.contacts.email, c.contacts.phone].every(v => v === null || typeof v === "string")
        && Array.isArray(c.blockedKinds) && c.blockedKinds.every(v => v === "email" || v === "phone"))
      || !register.data.rows.every((r: SenderBlock) => r && typeof r.id === "string" && typeof r.value === "string"
        && (r.kind === "email" || r.kind === "phone") && typeof r.reason === "string" && typeof r.created_at === "string"
        && (r.unblocked_at === null || typeof r.unblocked_at === "string") && Number.isSafeInteger(r.blocked_requests))) return empty;
    return { controls: controls.data, rows: register.data.rows, count: register.data.count, activeCount: register.data.activeCount, error: null };
  } catch { return empty; }
}
