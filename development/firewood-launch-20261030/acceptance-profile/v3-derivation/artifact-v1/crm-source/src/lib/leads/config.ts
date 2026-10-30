import "server-only";
import { targets } from "../security/deployment.ts";
import { isStagingDeployment } from "../security/staging-policy.mjs";
import { getCanonicalAppBaseUrl } from "../security/app-base-url";

export const PUBLIC_LEAD_SOURCE = "website" as const;
export const PUBLIC_LEAD_SOURCE_DETAIL = "public_contact_form" as const;
const stagingOrigin = isStagingDeployment(targets, process.env) ? getCanonicalAppBaseUrl() : null;
export const DEFAULT_PUBLIC_LEAD_INTAKE_URL = isStagingDeployment(targets, process.env)
  ? stagingOrigin ? `${stagingOrigin}/api/leads` : "Staging URL not configured"
  : "https://admin.angeltreeservices.org/api/leads";
export const PUBLIC_LEAD_SUCCESS_MESSAGE = "Thank you — your request was received. We’ll contact you shortly.";

const defaultAllowedOrigins = [
  "https://angeltreeservices.org",
  "https://www.angeltreeservices.org",
  "https://angeltreeservice.org",
  "https://www.angeltreeservice.org",
];

const localDevelopmentOrigins = [
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

export function getAllowedLeadIntakeOrigins() {
  if (isStagingDeployment(targets, process.env)) {
    const origin = getCanonicalAppBaseUrl();
    return origin ? [origin] : [];
  }
  const configured = (process.env.LEAD_INTAKE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const origins = [
    ...defaultAllowedOrigins,
    ...configured,
    ...(process.env.NODE_ENV === "production" ? [] : localDevelopmentOrigins),
  ];

  return Array.from(new Set(origins));
}
