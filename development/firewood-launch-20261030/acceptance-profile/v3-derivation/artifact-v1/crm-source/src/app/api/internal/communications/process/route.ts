import { timingSafeEqual } from "node:crypto";
import { processDueCommunications } from "@/lib/communications/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configuredSecret = (process.env.CUSTOMER_EMAIL_WORKER_SECRET ?? process.env.COMMUNICATION_WORKER_SECRET)?.trim();
  const submittedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!configuredSecret || configuredSecret.length < 32 || !submittedSecret || !secretsMatch(configuredSecret, submittedSecret)) {
    return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const result = await processDueCommunications(20);
  if (result.error || result.acceptedUnrecorded || result.uncertain) {
    console.error("Scheduled communication processing failed", result.error);
    return Response.json({ ok: false, ...result, message: "Communication processing needs review. Do not resend uncertain deliveries." }, { status: 500 });
  }

  return Response.json({ ok: true, ...result });
}

function secretsMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
