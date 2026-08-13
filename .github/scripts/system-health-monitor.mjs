import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const issueTitles = {
  authentication_configuration: "[System Health] Monitor authentication/configuration problem",
  connection_failure: "[System Health] Detailed system-health connection failure",
  monitored_dependency: "[System Health] Critical monitored dependency degraded",
  monitor_rate_limited: "[System Health] System-health runner rate limited",
  monitor_request_error: "[System Health] System-health monitor request error",
  runner_internal_failure: "[System Health] System-health runner internal failure",
  timeout: "[System Health] Detailed system-health request timed out",
  unexpected_http: "[System Health] Unexpected system-health response",
};

const categoryLabels = {
  authentication_configuration: "Monitor authentication or configuration failure",
  connection_failure: "Detailed system-health connection failure",
  customer_facing_endpoint: "Customer-facing endpoint outage",
  customer_portal: "Customer portal outage",
  crm_liveness: "CRM liveness outage",
  monitored_dependency: "Critical monitored dependency degraded",
  monitor_rate_limited: "System-health runner rate limited",
  monitor_request_error: "System-health monitor request error",
  runner_internal_failure: "System-health runner internal failure",
  timeout: "Detailed system-health request timeout",
  unexpected_http: "Unexpected system-health response",
};

export function classifyDetailedHealthResult({ bodyText = "", curlExit = 0, httpStatus = 0 }) {
  const exitCode = finiteInteger(curlExit);
  const statusCode = finiteInteger(httpStatus);

  if (exitCode === 28) {
    return failure("timeout", "none", "Detailed system-health request timed out.");
  }
  if (exitCode !== 0) {
    return failure("connection_failure", "none", "Detailed system-health request failed before an HTTP response was received.");
  }

  const safeBody = parseSafeResponse(bodyText);
  if (statusCode === 200) {
    const checked = safeBody?.kind === "health_run" && safeBody.status === "operational"
      ? safeBody.checked
      : null;
    return {
      category: "healthy",
      healthy: true,
      httpStatus: "200",
      issueTitle: "",
      summary: checked == null
        ? "Detailed health checks completed successfully."
        : `Detailed health checks completed successfully (${checked} components checked).`,
    };
  }
  if (statusCode === 503) {
    if (safeBody?.kind === "health_run" && safeBody.status === "attention_required") {
      return failure(
        "monitored_dependency",
        "503",
        "Detailed health checks completed; one or more critical monitored dependencies require attention.",
      );
    }
    return failure(
      "runner_internal_failure",
      "503",
      "System-health endpoint returned HTTP 503 without the expected completed health-run response.",
    );
  }
  if (statusCode === 401 || statusCode === 403) {
    return failure(
      "authentication_configuration",
      String(statusCode),
      "System-health runner authentication failed. Verify the GitHub and admin-site monitor secret configuration.",
    );
  }
  if (statusCode === 429) {
    return failure("monitor_rate_limited", "429", "System-health runner rejected the request because its rate limit was reached.");
  }
  if (statusCode >= 500) {
    const contract = safeBody?.kind === "monitor_failure" && safeBody.status === "runner_failed"
      ? " The sanitized runner response identified an internal monitor failure."
      : "";
    return failure(
      "runner_internal_failure",
      String(statusCode),
      `System-health runner returned HTTP ${statusCode}.${contract}`,
    );
  }
  if (statusCode >= 400) {
    return failure("monitor_request_error", String(statusCode), `System-health runner rejected the request with HTTP ${statusCode}.`);
  }
  return failure("unexpected_http", statusCode ? String(statusCode) : "none", "System-health runner returned an unexpected HTTP response.");
}

export function classifyRetrySequence(attempts) {
  if (!Array.isArray(attempts) || !attempts.length) {
    return classifyDetailedHealthResult({ curlExit: 7, httpStatus: 0 });
  }
  return classifyDetailedHealthResult(attempts.at(-1));
}

export function buildIncidentBody({ category, detectedAt, httpStatus, observations, summary }) {
  return [
    "Independent production monitoring detected a confirmed failure after a limited retry.",
    "",
    `Detection time: ${safeLine(detectedAt, "Unknown")}`,
    `Category: ${safeLine(categoryLabels[category] ?? category, "Unknown monitoring failure")}`,
    `HTTP status: ${safeLine(httpStatus, "none")}`,
    `Summary: ${safeLine(summary, "Monitoring failed without a safe summary.")}`,
    "",
    "Independent checks:",
    safeLine(observations, "No independent check observations were recorded."),
    "",
    "Open Settings → System Health after the CRM is reachable. This issue contains no credentials or customer data.",
    "The workflow is scheduled every five minutes, but GitHub Actions may run late. The interval until the next successful run is not verified outage duration.",
  ].join("\n");
}

export function decideIssueAction({ activeIssue, healthy, title }) {
  if (!healthy && !activeIssue) return "create";
  if (!healthy && activeIssue && activeIssue.title !== title) return "update_category";
  if (healthy && activeIssue) return "recover";
  return "none";
}

export function buildRecoveryComment(timestamp) {
  return [
    `The next successful monitor run passed at ${safeLine(timestamp, "an unknown time")}.`,
    "All monitored production paths passed on that run.",
    "Because GitHub Actions scheduling may be delayed, the interval since detection is not asserted as outage duration.",
  ].join(" ");
}

function failure(category, httpStatus, summary) {
  return {
    category,
    healthy: false,
    httpStatus,
    issueTitle: issueTitles[category] ?? issueTitles.unexpected_http,
    summary,
  };
}

function parseSafeResponse(bodyText) {
  try {
    const body = JSON.parse(String(bodyText));
    const kind = body?.kind === "health_run" || body?.kind === "monitor_failure" || body?.kind === "request_rejected"
      ? body.kind
      : null;
    const status = body?.status === "operational" || body?.status === "attention_required" || body?.status === "runner_failed"
      ? body.status
      : null;
    const checked = Number.isInteger(body?.checked) && body.checked >= 0 && body.checked <= 100
      ? body.checked
      : null;
    return { checked, kind, status };
  } catch {
    return null;
  }
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function safeLine(value, fallback) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/https?:\/\/\S+/gi, "[endpoint]")
    .replace(/(?:bearer\s+|sk_(?:live|test)_|whsec_|re_|sbp_)[a-z0-9._-]+/gi, "[redacted]")
    .replace(/\b(?:password|secret|token|authorization|cookie|service[_-]?role)\s*[:=]\s*\S+/gi, "[redacted]")
    .trim();
  return (text || fallback).slice(0, 600);
}

function printClassification() {
  const [, , curlExit, httpStatus, responsePath] = process.argv;
  let bodyText = "";
  try {
    bodyText = responsePath ? readFileSync(responsePath, "utf8") : "";
  } catch {
    bodyText = "";
  }
  const result = classifyDetailedHealthResult({ bodyText, curlExit, httpStatus });
  process.stdout.write([
    result.healthy ? "true" : "false",
    safeLine(result.category, "unexpected_http"),
    safeLine(result.httpStatus, "none"),
    safeLine(result.summary, "Detailed system-health request failed."),
    safeLine(result.issueTitle, "[System Health] Production monitoring incident"),
  ].join("\t"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  printClassification();
}
