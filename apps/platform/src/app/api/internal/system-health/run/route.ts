import { runAllHealthChecks } from "@/lib/system-health/checks";
import { persistHealthRun } from "@/lib/system-health/store";
import { bearerToken, monitoringSecretMatches } from "@/lib/security/monitoring-secret";
import { enforceSharedRateLimit } from "@/lib/security/rate-limit";
import { getServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!monitoringSecretMatches(process.env.SYSTEM_HEALTH_MONITOR_SECRET, bearerToken(request.headers))) {
    return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }
  const rateLimit = await enforceSharedRateLimit({
    action: "system_health.scheduled_run",
    identifiers: ["external-monitor"],
    limit: 6,
    request,
    windowSeconds: 600,
  });
  if (!rateLimit.available) {
    return Response.json({ ok: false, message: "Health storage is unavailable." }, { status: 503 });
  }
  if (!rateLimit.allowed) {
    return Response.json(
      { ok: false, message: "Health checks are temporarily rate limited." },
      { headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }, status: 429 },
    );
  }

  const supabase = getServiceRoleClient();
  if (!supabase) return Response.json({ ok: false, message: "Health storage is not configured." }, { status: 503 });
  const checks = await runAllHealthChecks();
  const stored = await persistHealthRun(supabase, checks, "scheduled");
  if (stored.error) {
    return Response.json({ ok: false, message: "Health results could not be recorded." }, { status: 503 });
  }
  const criticalFailure = checks.some(({ component, result }) =>
    component.critical && (result.status === "outage" || result.status === "degraded"));
  return Response.json(
    {
      checked: checks.length,
      ok: !criticalFailure,
      status: criticalFailure ? "attention_required" : "operational",
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
      status: criticalFailure ? 503 : 200,
    },
  );
}
