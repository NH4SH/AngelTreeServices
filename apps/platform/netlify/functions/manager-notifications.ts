import type { Config } from "@netlify/functions";
import { runScheduledWorker } from "../lib/worker-request";
export default async function run() {
  await runScheduledWorker("/api/internal/notifications/process", "COMMUNICATION_WORKER_SECRET", "Manager notifications");
}

export const config: Config = { schedule: "*/5 * * * *" };
