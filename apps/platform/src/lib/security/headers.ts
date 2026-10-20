import { targets } from "./deployment.ts";
import { isStagingDeployment } from "./staging-policy.mjs";

const staging = isStagingDeployment(targets, process.env);
const stagingApi = `https://${targets.staging.supabaseProjectRef}.supabase.co`;
const stagingRealtime = `wss://${targets.staging.supabaseProjectRef}.supabase.co`;

const scriptDevelopmentSources = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
const localStorageSource = (() => {
  if (process.env.NODE_ENV !== "development") return "";
  try { const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ? ` ${url.origin}` : "";
  } catch { return ""; }
})();

export const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  staging ? "form-action 'self'" : "form-action 'self' https://checkout.stripe.com",
  `script-src 'self' 'unsafe-inline'${scriptDevelopmentSources}${staging ? "" : " https://js.stripe.com https://maps.googleapis.com https://maps.gstatic.com"}`,
  "style-src 'self' 'unsafe-inline'",
  staging ? "img-src 'self' data: blob:" : "img-src 'self' data: blob: https://maps.gstatic.com",
  "font-src 'self' data:",
  staging ? `connect-src 'self' ${stagingApi} ${stagingRealtime}` : `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://maps.googleapis.com https://places.googleapis.com${localStorageSource}`,
  staging ? "frame-src 'none'" : "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  "worker-src 'self' blob:",
].join("; ");

export const platformSecurityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
];

export const privateNoStoreHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

// Next's route configuration can override the response handler's headers.
// File viewers and downloads must not disclose private record URLs as referrers.
export const privateFileHeaders = privateNoStoreHeaders.map((header) =>
  header.key === "Referrer-Policy" ? { ...header, value: "no-referrer" } : header,
);
