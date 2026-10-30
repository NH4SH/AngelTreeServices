import { bearerToken, monitoringSecretMatches } from "@/lib/security/monitoring-secret";
import { processManagerEmails } from "@/lib/notifications/manager-email-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let authorized = false;
  try { authorized = monitoringSecretMatches(process.env.COMMUNICATION_WORKER_SECRET, bearerToken(request.headers)); } catch { /* Malformed credentials are unauthorized. */ }
  if (!authorized) return Response.json({ ok: false }, { status: 401 });
  try {
    const result = await processManagerEmails();
    return Response.json({ ok: result.errors === 0, ...result }, { status: result.errors ? 500 : 200 });
  } catch {
    console.error("Manager notification processing failed; inspect configuration and delivery queue.");
    return Response.json({ ok: false, message: "Manager notifications could not be processed." }, { status: 500 });
  }
}
