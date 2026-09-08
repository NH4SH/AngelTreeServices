import type { Config } from "@netlify/functions";

export default async function managerNotifications() {
  const base = Netlify.env.get("APP_BASE_URL")?.trim();
  const secret = Netlify.env.get("COMMUNICATION_WORKER_SECRET")?.trim();
  // Do not send worker credentials to the public site or an arbitrary host.
  if (base !== "https://admin.angeltreeservices.org" || !secret || secret.length < 32) throw new Error("Admin URL and communication worker secret are required.");
  const response = await fetch(new URL("/api/internal/notifications/process", base), { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`Manager notifications returned HTTP ${response.status}.`);
}

export const config: Config = { schedule: "*/5 * * * *" };
