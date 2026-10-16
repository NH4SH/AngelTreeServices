import type { Config } from "@netlify/functions";
import { runScheduledWorker } from "../lib/worker-request";
export default async function run() {
  await runScheduledWorker("/api/internal/communications/process", "COMMUNICATION_WORKER_SECRET", "Communication processing");
}

export const config: Config = {
  schedule: "@hourly",
};
