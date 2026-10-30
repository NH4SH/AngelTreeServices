import { getJobCompletionContext } from "@/lib/data/job-completion";
import { createClient } from "@/lib/supabase/server";
import { ExplicitJobCompletionActions } from "@/components/explicit-job-completion-actions";

export async function JobCompletionControls({ jobId }: { jobId: string }) {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const result = await getJobCompletionContext(jobId);
  if (!user || !result.data) return <p className="form-message error" role="status">{result.error ?? "Sign in to review work completion."}</p>;
  return <ExplicitJobCompletionActions actorId={user.id} initialContext={result.data} />;
}
