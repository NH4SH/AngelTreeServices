import "server-only";
import type { createClient } from "@/lib/supabase/server";
/** Compatibility export for older callers. Invoice preparation never changes field work. */
export async function completeJobAfterInvoice({ job }: {
  actorUserId: string; invoiceId: string; supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
  job: { id: string; status: string; completed_at: string | null; completed_by_user_id: string | null };
}): Promise<{ completed: true; warning: null } | { completed: false; warning: string }> {
  return job.completed_at ? { completed: true, warning: null }
    : { completed: false, warning: "Invoice preparation does not complete work. Use Complete work on the work order." };
}
