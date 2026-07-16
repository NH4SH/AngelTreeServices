import { timingSafeEqual } from "node:crypto";
import { processDueCommunications } from "@/lib/communications/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configuredSecret = process.env.COMMUNICATION_WORKER_SECRET?.trim();
  const submittedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!configuredSecret || configuredSecret.length < 32 || !submittedSecret || !secretsMatch(configuredSecret, submittedSecret)) {
    return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const result = await processDueCommunications(20);
  if (result.error) {
    console.error("Scheduled communication processing failed", result.error);
    return Response.json({ ok: false, message: "Communication processing failed." }, { status: 500 });
  }

  return Response.json({ ok: true, ...result });
}

function secretsMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
