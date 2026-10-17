import { withDeadline } from "../../src/lib/runtime/deadline.ts";
import targets from "../../staging/targets.json";
import { isStagingDeployment, production } from "../../src/lib/security/staging-policy.mjs";
export async function runScheduledWorker(path: string, secretName: string, label: string) {
  const appEnv = Netlify.env.get("APP_ENV");
  if (isStagingDeployment(targets, { APP_ENV: appEnv, STAGING_MODE: Netlify.env.get("STAGING_MODE") }) ||
    (appEnv && appEnv !== "production") || Netlify.env.get("SITE_ID") !== production.netlifySiteId) {
    throw Error("Scheduled workers are disabled outside the production CRM site.");
  }
  const base = Netlify.env.get("APP_BASE_URL")?.trim();
  const secret = Netlify.env.get(secretName)?.trim();
  let app: URL;
  try { app = new URL(base ?? ""); } catch { throw Error("The canonical admin URL is required."); }
  if (app.origin !== production.appOrigin || app.username || app.password || app.pathname !== "/" || app.search || app.hash || !secret || secret.length < 32)
    throw Error("The canonical admin URL and configured worker credential are required.");
  if (!/^\/api\/internal\/[a-z0-9/-]+$/.test(path) || !new URL(path, app).pathname.startsWith("/api/internal/")) throw Error("Invalid internal worker route.");
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
