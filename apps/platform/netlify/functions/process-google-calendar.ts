import type { Config } from "@netlify/functions";

export default async function processGoogleCalendar() {
  const appBaseUrl = Netlify.env.get("APP_BASE_URL")?.trim();
  const workerSecret = Netlify.env.get("GOOGLE_CALENDAR_WORKER_SECRET")?.trim();
  if (!appBaseUrl || !workerSecret) {
    throw new Error("APP_BASE_URL and GOOGLE_CALENDAR_WORKER_SECRET are required for Google Calendar processing.");
  }

  const appUrl = new URL(appBaseUrl);
  if (appUrl.origin !== "https://admin.angeltreeservices.org" || appUrl.username || appUrl.password || appUrl.pathname !== "/" || appUrl.search || appUrl.hash) {
    throw new Error("APP_BASE_URL must be the canonical Angel Tree admin origin.");
  }

  const response = await fetch(new URL("/api/internal/integrations/google-calendar/process", appUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${workerSecret}` },
  });
  if (!response.ok) throw new Error(`Google Calendar processor returned HTTP ${response.status}.`);
}

export const config: Config = {
  schedule: "*/5 * * * *",
};
