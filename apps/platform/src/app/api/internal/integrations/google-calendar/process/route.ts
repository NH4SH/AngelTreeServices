import { timingSafeEqual } from "node:crypto";
import { processGoogleCalendarSyncQueue } from "@/lib/integrations/google-calendar/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.GOOGLE_CALENDAR_WORKER_SECRET?.trim();
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || expected.length < 32 || !actual || !secretsMatch(expected, actual)) {
    return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await processGoogleCalendarSyncQueue(20);
    return Response.json({ ok: true, ...result });
  } catch {
    console.error("Google Calendar sync processor failed", { code: "processor_failed" });
    return Response.json({ ok: false, message: "Calendar synchronization could not be processed." }, { status: 500 });
  }
}

function secretsMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

