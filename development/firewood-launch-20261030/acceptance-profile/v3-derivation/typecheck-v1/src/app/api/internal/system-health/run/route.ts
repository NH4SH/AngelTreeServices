import { after } from "next/server";
import { runAllHealthChecks } from "@/lib/system-health/checks";
import { safeHealthErrorMetadata } from "@/lib/system-health/core";
import { handleSystemHealthRun } from "@/lib/system-health/run-handler";
import { healthComponents } from "@/lib/system-health/registry";
import { persistHealthRun, pruneHealthHistory } from "@/lib/system-health/store";
import { bearerToken, monitoringSecretMatches } from "@/lib/security/monitoring-secret";
import { enforceSharedRateLimit } from "@/lib/security/rate-limit";
import { getServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleSystemHealthRun(request, {
    authorize: (incomingRequest) => monitoringSecretMatches(
      process.env.SYSTEM_HEALTH_MONITOR_SECRET,
      bearerToken(incomingRequest.headers),
    ),
    createRunId: () => crypto.randomUUID(),
    expectedComponentKeys: healthComponents.map((component) => component.key),
    getStorage: getServiceRoleClient,
    logFailure: (event) => console.error("System health runner failed.", event),
    persist: (supabase, checks) => persistHealthRun(supabase, checks, "scheduled"),
    rateLimit: (incomingRequest) => enforceSharedRateLimit({
      action: "system_health.scheduled_run",
      identifiers: ["external-monitor"],
      limit: 6,
      request: incomingRequest,
      windowSeconds: 600,
    }),
    runChecks: runAllHealthChecks,
    scheduleCleanup: (supabase, runId) => {
      after(async () => {
        try {
          const cleanupError = await pruneHealthHistory(supabase);
          if (cleanupError) {
            console.warn("System health retention cleanup failed.", { runId, stage: cleanupError.stage });
          }
        } catch (error) {
          console.warn("System health retention cleanup threw unexpectedly.", {
            ...safeHealthErrorMetadata(error),
            runId,
          });
        }
      });
    },
  });
}
