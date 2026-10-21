import { bearerToken, monitoringSecretMatches } from "@/lib/security/monitoring-secret";
import { scanDocumentBytes } from "@/lib/security/document-scanner";
import { checkPrivateScanner } from "@/lib/system-health/scanner-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };

/** Operator-only synthetic acceptance. No caller files, URLs or customer access. */
export async function POST(request: Request) {
  let authorized = false;
  try { authorized = monitoringSecretMatches(process.env.CUSTOMER_EMAIL_WORKER_SECRET, bearerToken(request.headers)); } catch { /* Fail closed. */ }
  if (!authorized) return Response.json({ ok: false }, { status: 401, headers });
  if (request.body) return Response.json({ ok: false }, { status: 400, headers });
  try {
    const readiness = await checkPrivateScanner();
    if (readiness.status !== "operational") return Response.json({ ok: false, readiness }, { status: 503, headers });
    const eicar = Buffer.from(["X5O!P%@AP[4\\PZX54(P^)7CC)7}", "$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join(""));
    const quarantine = await scanDocumentBytes(eicar);
    const pair = await Promise.all([65, 66].map(async value => {
      const started = performance.now();
      const scan = await scanDocumentBytes(Buffer.alloc(25 * 1024 * 1024, value));
      return { status: scan.status, milliseconds: Math.round(performance.now() - started) };
    }));
    const ok = quarantine.status === "quarantined" && pair.every(item => item.status === "clean" && item.milliseconds < 12_000);
    return Response.json({ ok, syntheticOnly: true, readiness, quarantine: quarantine.status, pair }, { status: ok ? 200 : 503, headers });
  } catch { return Response.json({ ok: false, message: "Synthetic scanner acceptance did not complete." }, { status: 503, headers }); }
}
