import { randomUUID } from "node:crypto";

const sensitiveDatabasePattern = /(relation |column |constraint |schema |sqlstate|violates row-level security|duplicate key|foreign key|postgres|postgrest|pgrst\d|\bselect\b|\binsert into\b|\bupdate public\.|\bdelete from\b)/i;
const secretPattern = /(bearer\s+[a-z0-9._-]+|sk_(?:live|test)_[a-z0-9]+|whsec_[a-z0-9]+|service_role|[?&](?:token|key|secret)=[^&\s]+)/gi;

export function safeStaffMessage(message: string | null | undefined, fallback = "The request could not be completed. Please try again.") {
  const normalized = sanitizeLogText(message ?? "").trim();
  if (/\b(?:23505|duplicate key)\b/i.test(normalized)) {
    reportServerError("database-constraint", { code: "23505", message: normalized });
    return "A record with these details already exists.";
  }
  if (/\b(?:23503|foreign key)\b/i.test(normalized)) {
    reportServerError("database-constraint", { code: "23503", message: normalized });
    return "This record is still linked to other information and cannot be changed that way.";
  }
  if (/\b(?:23502|not-null|null value in column)\b/i.test(normalized)) {
    reportServerError("database-constraint", { code: "23502", message: normalized });
    return "Required information is missing. Review the form and try again.";
  }
  if (!normalized || sensitiveDatabasePattern.test(normalized)) {
    const correlationId = reportServerError("database-response", { message: normalized || "empty database error" });
    return `${fallback} Reference: ${correlationId}`;
  }
  return normalized.slice(0, 500);
}

export function reportServerError(
  context: string,
  error: unknown,
  metadata: Record<string, unknown> = {},
) {
  const correlationId = randomUUID();
  const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const diagnostic = {
    correlationId,
    context: sanitizeLogText(context).slice(0, 120),
    errorCode: sanitizeLogText(String(source.code ?? "unknown")).slice(0, 40),
    errorMessage: sanitizeLogText(error instanceof Error ? error.message : String(source.message ?? error ?? "unknown")).slice(0, 1000),
    metadata: sanitizeMetadata(metadata),
  };
  console.error("Application operation failed", diagnostic);
  return correlationId;
}

export function safeUnknownError(error: unknown, context: string, fallback: string, metadata?: Record<string, unknown>) {
  const correlationId = reportServerError(context, error, metadata);
  return `${fallback} Reference: ${correlationId}`;
}

export function sanitizeLogText(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(secretPattern, "[REDACTED]");
}

function sanitizeMetadata(metadata: Record<string, unknown>) {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/(authorization|cookie|token|secret|password|key|url)/i.test(key)) continue;
    if (typeof value === "string") safe[key] = sanitizeLogText(value).slice(0, 500);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) safe[key] = value;
  }
  return safe;
}
