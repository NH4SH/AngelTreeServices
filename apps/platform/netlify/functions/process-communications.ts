import type { Config } from "@netlify/functions";

export default async function processCommunications() {
  const appBaseUrl = Netlify.env.get("APP_BASE_URL")?.trim();
  const workerSecret = Netlify.env.get("COMMUNICATION_WORKER_SECRET")?.trim();

  if (!appBaseUrl || !workerSecret) {
    throw new Error("APP_BASE_URL and COMMUNICATION_WORKER_SECRET are required for communication processing.");
  }

  const response = await fetch(new URL("/api/internal/communications/process", appBaseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${workerSecret}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Communication processor returned HTTP ${response.status}.`);
  }
}

export const config: Config = {
  schedule: "@hourly",
};
