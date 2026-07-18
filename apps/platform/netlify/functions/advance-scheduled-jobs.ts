import type { Config } from "@netlify/functions";

export default async function advanceScheduledJobs() {
  const appBaseUrl = Netlify.env.get("APP_BASE_URL")?.trim();
  const workerSecret = Netlify.env.get("COMMUNICATION_WORKER_SECRET")?.trim();

  if (!appBaseUrl || !workerSecret) {
    throw new Error("APP_BASE_URL and COMMUNICATION_WORKER_SECRET are required for scheduled job advancement.");
  }

  const response = await fetch(new URL("/api/internal/jobs/advance-scheduled", appBaseUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${workerSecret}` },
  });

  if (!response.ok) {
    throw new Error(`Scheduled job processor returned HTTP ${response.status}.`);
  }
}

export const config: Config = {
  schedule: "*/5 * * * *",
};
