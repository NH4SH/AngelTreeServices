import type { Config } from "@netlify/functions";
import { runScheduledWorker } from "../lib/worker-request";
export default async function run() {
  await runScheduledWorker("/api/internal/integrations/google-calendar/process", "GOOGLE_CALENDAR_WORKER_SECRET", "Calendar processing");
}

export const config: Config = {
  schedule: "*/5 * * * *",
};
