import type { Config } from "@netlify/functions";

export default async function runSystemHealth() {
  const appBaseUrl = Netlify.env.get("APP_BASE_URL")?.trim();
  const monitorSecret = Netlify.env.get("SYSTEM_HEALTH_MONITOR_SECRET")?.trim();

  if (!appBaseUrl || !monitorSecret) {
    throw new Error("APP_BASE_URL and SYSTEM_HEALTH_MONITOR_SECRET are required for system health monitoring.");
  }

  const response = await fetch(new URL("/api/internal/system-health/run", appBaseUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${monitorSecret}` },
  });

  if (!response.ok) {
    throw new Error(`System health monitor returned HTTP ${response.status}.`);
  }
}

export const config: Config = {
  schedule: "*/10 * * * *",
};
