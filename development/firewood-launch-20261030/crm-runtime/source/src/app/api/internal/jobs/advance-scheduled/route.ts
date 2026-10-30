import { timingSafeEqual } from "node:crypto";
import { getServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configuredSecret = process.env.COMMUNICATION_WORKER_SECRET?.trim();
  const submittedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!configuredSecret || configuredSecret.length < 32 || !submittedSecret || !secretsMatch(configuredSecret, submittedSecret)) {
    return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const supabase = getServiceRoleClient();
  if (!supabase) {
    return Response.json({ ok: false, message: "Server configuration is unavailable." }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("advance_scheduled_jobs_to_in_progress").single();
  if (error) {
    console.error("Scheduled job advancement failed", error);
    return Response.json({ ok: false, message: "Scheduled jobs could not be advanced." }, { status: 500 });
  }

  const result = data as { advanced_count?: number } | null;
  return Response.json({ ok: true, advancedCount: Number(result?.advanced_count ?? 0) });
}

function secretsMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
