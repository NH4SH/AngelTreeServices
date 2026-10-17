import { targets } from "./deployment.ts";
import { checkStaging, httpsOrigin, isStagingDeployment, production, type DeploymentEnvironment, type StagingManifest } from "./staging-policy.mjs";

export function normalizeAppBaseUrl(
  value: string | null | undefined,
  environment = process.env.NODE_ENV,
  deployment: { manifest: StagingManifest; env: DeploymentEnvironment } = { manifest: targets, env: process.env },
) {
  if (!value) return null;

  if (isStagingDeployment(deployment.manifest, deployment.env)) {
    if (!checkStaging(deployment.manifest, deployment.env).ready) return null;
    const origin = httpsOrigin(value);
    return origin && origin === httpsOrigin(deployment.manifest.staging?.appOrigin as string) ? origin : null;
  }
  if (deployment.env.APP_ENV && deployment.env.APP_ENV !== "production") return null;

  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || /[\\\s]/.test(value)) return null;

    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (environment === "production") {
      return url.origin === production.appOrigin ? url.origin : null;
    }

    if (isLocal && url.protocol === "http:") return url.origin;
    if (url.origin === production.appOrigin) return url.origin;
    return null;
  } catch {
    return null;
  }
}

export function getCanonicalAppBaseUrl() {
  return normalizeAppBaseUrl(process.env.APP_BASE_URL);
}

export function buildCanonicalAppUrl(path: string) {
  const baseUrl = getCanonicalAppBaseUrl();
  if (!baseUrl || !path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path)) return null;
  try {
    const url = new URL(path, baseUrl);
    return url.origin === baseUrl ? url.toString() : null;
  } catch { return null; }
}
