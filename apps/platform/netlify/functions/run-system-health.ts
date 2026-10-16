import type { Config } from "@netlify/functions";
import { runScheduledWorker } from "../lib/worker-request";
export default async function run() {
  await runScheduledWorker("/api/internal/system-health/run", "SYSTEM_HEALTH_MONITOR_SECRET", "System health monitoring");
}

export const config: Config = {
  schedule: "*/10 * * * *",
};
