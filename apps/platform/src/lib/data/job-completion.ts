import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseCompletionContext } from "@/lib/jobs/completion-request";
export async function getJobCompletionContext(jobId: string) {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: "Work completion is unavailable." };
  const { data, error } = await supabase.rpc("get_job_completion_context", { p_job_id: jobId });
  const context = parseCompletionContext(data);
  return { data: context, error: error || !context ? "Work completion could not be loaded. Reload this page before completing work." : null };
}
