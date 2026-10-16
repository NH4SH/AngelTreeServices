import { withDeadline } from "../../src/lib/runtime/deadline.ts";
export async function runScheduledWorker(path: string, secretName: string, label: string) {
  const base = Netlify.env.get("APP_BASE_URL")?.trim();
  const secret = Netlify.env.get(secretName)?.trim();
  let app: URL;
  try { app = new URL(base ?? ""); } catch { throw Error("The canonical admin URL is required."); }
  if (app.origin !== "https://admin.angeltreeservices.org" || app.username || app.password || app.pathname !== "/" || app.search || app.hash || !secret || secret.length < 32)
    throw Error("The canonical admin URL and configured worker credential are required.");
  if (!path.startsWith("/api/internal/")) throw Error("Invalid internal worker route.");
  try {
    await withDeadline(async signal => {
      const response = await fetch(new URL(path, app), { method: "POST", redirect: "error", signal,
        headers: { Authorization: `Bearer ${secret}` } });
      if (!response.ok) throw Error("Worker rejected");
      const result = await response.json();
      if (result?.ok !== true || result.error || Number(result.errors) > 0 || Number(result.uncertain) > 0 || Number(result.acceptedUnrecorded) > 0)
        throw Error("Worker outcome needs review");
    }, 25_000);
  } catch { throw Error(`${label} did not confirm a clean result. Review its queue or health history before retrying.`); }
}
