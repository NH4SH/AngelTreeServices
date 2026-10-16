import type { Config } from "@netlify/functions";
import { runScheduledWorker } from "../lib/worker-request";
export default async function run() {
  await runScheduledWorker("/api/internal/jobs/advance-scheduled", "COMMUNICATION_WORKER_SECRET", "Scheduled job processing");
}

export const config: Config = {
  schedule: "*/5 * * * *",
};
