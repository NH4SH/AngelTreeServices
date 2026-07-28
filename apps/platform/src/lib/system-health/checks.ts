import "server-only";

import { getEmailProviderConfig } from "@/lib/email/config";
import { getCanonicalAppBaseUrl } from "@/lib/security/app-base-url";
import { getStripeServerConfig, getStripeWebhookSecret } from "@/lib/stripe/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { boundedLatency, sanitizeHealthSummary, type HealthCheckResult } from "./core";
import { healthComponentByKey, healthComponents } from "./registry";

const checkTimeoutMs = 8_000;
const publicSiteUrl = "https://angeltreeservices.org";

export async function runAllHealthChecks() {
  return Promise.all(healthComponents.map(async (component) => ({
    component,
    result: await runHealthCheck(component.key),
  })));
}

export async function runHealthCheck(componentKey: string): Promise<HealthCheckResult> {
  if (!healthComponentByKey.has(componentKey)) {
    return result("unknown", "This component is not registered.");
  }

  try {
    switch (componentKey) {
      case "public_homepage":
        return checkHttp(`${publicSiteUrl}/`, "Angel Tree Services");
      case "public_assets":
        return checkHttp(`${publicSiteUrl}/assets/favicon-32.png`);
      case "contact_form_canary":
        return checkContactFormCanary();
      case "crm_application":
        return checkPlatformLiveness();
      case "scheduled_workflow_worker":
        return checkScheduledWorkflowWorker();
      case "customer_portals":
        return checkCustomerPortalRoutes();
      case "supabase_database":
        return checkDatabase();
      case "supabase_auth":
        return checkAuth();
      case "supabase_storage":
        return checkStorage();
      case "resend_email":
        return checkResend();
      case "communication_queue":
        return checkCommunicationQueue();
      case "stripe_api":
        return checkStripe();
      case "stripe_webhooks":
        return checkStripeWebhooks();
      default:
        return result("unknown", "No safe check is available for this component.");
    }
  } catch (error) {
    return result("outage", sanitizeHealthSummary(error));
  }
}

async function checkHttp(url: string, expectedText?: string): Promise<HealthCheckResult> {
  const started = performance.now();
  const response = await timedFetch(url);
  const body = expectedText ? await response.text() : "";
  const latencyMs = boundedLatency(performance.now() - started);

  if (!response.ok) return result("outage", `Endpoint returned HTTP ${response.status}.`, latencyMs);
  if (expectedText && !body.includes(expectedText)) {
    return result("degraded", "The endpoint responded but expected page content was missing.", latencyMs);
  }
  return result("operational", "Responding normally.", latencyMs);
}

async function checkPlatformLiveness() {
  const baseUrl = getCanonicalAppBaseUrl();
  if (!baseUrl) return result("not_configured", "APP_BASE_URL is not configured.");
  return checkHttp(`${baseUrl}/api/health/live`, '"ok":true');
}

async function checkScheduledWorkflowWorker() {
  const configuredSecret = process.env.COMMUNICATION_WORKER_SECRET?.trim();
  if (!configuredSecret || configuredSecret.length < 32) {
    return result("not_configured", "The scheduled workflow worker is not configured.");
  }
  const supabase = getServiceRoleClient();
  if (!supabase) return result("not_configured", "Scheduled workflow history is not configured.");
  const overdueBefore = new Date(Date.now() - 15 * 60_000).toISOString();
  const [events, latestRun] = await Promise.all([
    supabase
      .from("schedule_events")
      .select("job_id")
      .eq("event_type", "job")
      .in("status", ["scheduled", "confirmed", "in_progress"])
      .not("job_id", "is", null)
      .lt("starts_at", overdueBefore)
      .limit(100),
    supabase
      .from("activity_log")
      .select("created_at")
      .eq("event_type", "job_automatically_started")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (events.error || latestRun.error) return result("outage", "Scheduled workflow readiness could not be checked.");

  const candidateIds = [...new Set((events.data ?? []).map((event) => event.job_id).filter(Boolean))] as string[];
  if (!candidateIds.length) {
    return {
      ...result("operational", "No overdue scheduled jobs were found."),
      details: { overdueEligibleJobs: 0 },
      lastObservedUsageAt: latestRun.data?.created_at ?? null,
    };
  }

  const jobs = await supabase
    .from("jobs")
    .select("id")
    .in("id", candidateIds)
    .in("status", ["accepted", "scheduled"]);
  if (jobs.error) return result("outage", "Scheduled workflow readiness could not be checked.");
  const activeIds = (jobs.data ?? []).map((job) => job.id);
  let invoicedIds = new Set<string>();
  if (activeIds.length) {
    const invoices = await supabase
      .from("invoices")
      .select("job_id")
      .in("job_id", activeIds)
      .in("status", ["sent", "partially_paid", "paid", "overdue"]);
    if (invoices.error) return result("outage", "Scheduled workflow readiness could not be checked.");
    invoicedIds = new Set((invoices.data ?? []).map((invoice) => invoice.job_id).filter(Boolean) as string[]);
  }
  const overdueCount = activeIds.filter((id) => !invoicedIds.has(id)).length;
  return {
    ...result(
      overdueCount ? "degraded" : "operational",
      overdueCount
        ? `${overdueCount} scheduled ${overdueCount === 1 ? "job is" : "jobs are"} overdue for automatic status advancement.`
        : "No overdue eligible scheduled jobs were found.",
    ),
    details: { overdueEligibleJobs: overdueCount },
    lastObservedUsageAt: latestRun.data?.created_at ?? null,
  };
}

async function checkCustomerPortalRoutes() {
  const baseUrl = process.env.CUSTOMER_PORTAL_BASE_URL?.trim() || getCanonicalAppBaseUrl();
  if (!baseUrl) return result("not_configured", "A customer portal base URL is not configured.");
  const started = performance.now();
  const [quote, invoice] = await Promise.all([
    timedFetch(`${baseUrl}/portal/quote/system-health-invalid-token`),
    timedFetch(`${baseUrl}/portal/invoice/system-health-invalid-token`),
  ]);
  const latencyMs = boundedLatency(performance.now() - started);
  if (!quote.ok || !invoice.ok) return result("outage", "One or more customer portal routes did not load.", latencyMs);
  const [quoteBody, invoiceBody] = await Promise.all([quote.text(), invoice.text()]);
  if (!quoteBody.includes("Quote link unavailable") || !invoiceBody.includes("Invoice link unavailable")) {
    return result("degraded", "A customer portal route responded without its expected portal page.", latencyMs);
  }
  return result("operational", "Quote and invoice portal routes are responding.", latencyMs);
}

async function checkContactFormCanary() {
  const secret = process.env.SYSTEM_HEALTH_MONITOR_SECRET?.trim();
  const baseUrl = getCanonicalAppBaseUrl();
  if (!secret || secret.length < 32 || !baseUrl) {
    return result("not_configured", "The authenticated contact-form canary is not configured.");
  }

  const formData = new FormData();
  formData.set("monitoring_canary", "contact-form-v1");
  formData.set("form_started_at", String(Date.now() - 2_000));
  formData.set("submission_id", `system-health-${Date.now()}`);
  formData.set("name", "System Health Canary");
  formData.set("phone", "5405550100");
  formData.set("service", "Tree Care");
  formData.set("customer_type", "Homeowner");
  formData.set("property_scope", "");
  formData.set("address", "5802 Ford Rd, Fredericksburg, VA 22407");
  formData.set("message", "Authenticated system health validation only.");

  const started = performance.now();
  const response = await timedFetch(`${baseUrl}/api/leads`, {
    body: formData,
    headers: {
      Authorization: `Bearer ${secret}`,
      "X-Angel-Tree-Canary": "contact-form-v1",
    },
    method: "POST",
  });
  const latencyMs = boundedLatency(performance.now() - started);

  if (!response.ok || response.headers.get("x-angel-tree-canary") !== "accepted") {
    return result("outage", `The contact-form canary returned HTTP ${response.status}.`, latencyMs);
  }

  const supabase = getServiceRoleClient();
  let lastObservedUsageAt: string | null = null;
  if (supabase) {
    const genuine = await supabase
      .from("jobs")
      .select("submitted_at")
      .not("website_submission_id", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastObservedUsageAt = genuine.data?.submitted_at ?? null;
  }
  return {
    ...result("operational", "The real intake route validated the canary without creating a lead.", latencyMs),
    lastObservedUsageAt,
    details: { createsLead: false, sendsEmail: false },
  };
}

async function checkDatabase() {
  const supabase = getServiceRoleClient();
  if (!supabase) return result("not_configured", "Supabase service access is not configured.");
  const started = performance.now();
  const response = await supabase.from("profiles").select("id", { count: "exact", head: true }).limit(1);
  const latencyMs = boundedLatency(performance.now() - started);
  if (response.error) return result("outage", "The database read check failed.", latencyMs);
  return result("operational", "Read-only database check completed.", latencyMs);
}

async function checkAuth() {
  const config = getSupabasePublicConfig();
  if (!config) return result("not_configured", "Supabase Auth is not configured.");
  const started = performance.now();
  const response = await timedFetch(`${config.url}/auth/v1/health`, {
    headers: { apikey: config.anonKey },
  });
  const latencyMs = boundedLatency(performance.now() - started);
  if (!response.ok) return result("outage", `Authentication health returned HTTP ${response.status}.`, latencyMs);
  return result("operational", "Authentication service is responding.", latencyMs);
}

async function checkStorage() {
  const supabase = getServiceRoleClient();
  if (!supabase) return result("not_configured", "Supabase Storage is not configured.");
  const started = performance.now();
  const response = await supabase.storage.listBuckets();
  const latencyMs = boundedLatency(performance.now() - started);
  if (response.error) return result("outage", "Private storage metadata could not be read.", latencyMs);
  if (!response.data.length) return result("degraded", "Storage responded, but no managed buckets were found.", latencyMs);
  return {
    ...result("operational", "Private storage is responding.", latencyMs),
    details: { bucketCount: response.data.length },
  };
}

async function checkResend() {
  const config = getEmailProviderConfig();
  if (!config) return result("not_configured", "Transactional email is not configured.");
  const started = performance.now();
  const response = await timedFetch("https://api.resend.com/domains?limit=1", {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  const latencyMs = boundedLatency(performance.now() - started);
  if (response.status === 401 || response.status === 403) {
    return result(
      response.status === 401 ? "outage" : "unknown",
      response.status === 401
        ? "Resend rejected the configured credential."
        : "Resend is configured, but this key cannot perform the non-sending verification.",
      latencyMs,
    );
  }
  if (!response.ok) return result("outage", `Resend returned HTTP ${response.status}.`, latencyMs);
  return result("operational", "Resend API is reachable without sending an email.", latencyMs);
}

async function checkCommunicationQueue() {
  const supabase = getServiceRoleClient();
  if (!supabase) return result("not_configured", "The communication queue is not configured.");
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  const recentSince = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const [stalled, failed, delivered] = await Promise.all([
    supabase.from("customer_communications").select("id", { count: "exact", head: true }).eq("status", "processing").lt("processing_started_at", staleBefore),
    supabase.from("customer_communications").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", recentSince),
    supabase.from("email_events").select("sent_at").eq("status", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (stalled.error || failed.error || delivered.error) return result("outage", "Communication delivery history could not be checked.");
  const stalledCount = stalled.count ?? 0;
  const failedCount = failed.count ?? 0;
  const status = stalledCount > 0 || failedCount >= 5 ? "degraded" : "operational";
  return {
    ...result(status, status === "operational" ? "Queue and delivery history look normal." : "Recent failed or stalled communications need review."),
    details: { failedLast24Hours: failedCount, stalledCount },
    lastObservedUsageAt: delivered.data?.sent_at ?? null,
  };
}

async function checkStripe() {
  const config = getStripeServerConfig();
  if (!config.configured) return result("not_configured", "Stripe is not configured.");
  const started = performance.now();
  await config.stripe.balance.retrieve();
  return result("operational", "Stripe responded to a non-destructive account check.", boundedLatency(performance.now() - started));
}

async function checkStripeWebhooks() {
  const config = getStripeServerConfig();
  const webhookSecret = getStripeWebhookSecret();
  if (!config.configured || !webhookSecret) return result("not_configured", "Stripe webhook processing is not configured.");
  const supabase = getServiceRoleClient();
  if (!supabase) return result("not_configured", "Stripe webhook history storage is not configured.");
  const latest = await supabase
    .from("stripe_webhook_events")
    .select("processed_at")
    .not("processed_at", "is", null)
    .order("processed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) return result("outage", "Stripe webhook receipt history could not be read.");
  if (!latest.data?.processed_at) {
    return result("unknown", "Webhook handling is configured, but no successful receipt has been recorded yet.");
  }
  return {
    ...result("operational", "Webhook configuration and receipt history are available."),
    lastObservedUsageAt: latest.data.processed_at,
  };
}

async function timedFetch(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(checkTimeoutMs),
  });
}

function result(status: HealthCheckResult["status"], summary: string, latencyMs: number | null = null): HealthCheckResult {
  return { status, summary: sanitizeHealthSummary(summary), latencyMs };
}
