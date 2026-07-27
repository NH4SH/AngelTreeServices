const sensitiveKeyPattern =
  /(password|secret|token|credential|authorization|cookie|session|stripe.*(?:id|key|secret)|card|account_number|routing_number|file_content|raw_body)/i;

export function redactActivityData(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.length > 800 ? `${value.slice(0, 800)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => redactActivityData(item, depth + 1));
  if (!value || typeof value !== "object") return String(value ?? "");

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 80)
      .map(([key, entry]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[redacted]" : redactActivityData(entry, depth + 1),
      ]),
  );
}
