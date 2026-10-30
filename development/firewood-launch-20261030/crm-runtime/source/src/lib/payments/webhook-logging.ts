export type SafeWebhookLog = {
  applicationErrorCode: string;
  eventType: string | null;
  internalEventCategory: "signature" | "processing";
  retryable: boolean;
  route: "/api/stripe/webhook";
};

export class WebhookProcessingError extends Error {
  readonly applicationErrorCode: string;
  readonly retryable: boolean;

  constructor(
    applicationErrorCode: string,
    retryable: boolean,
  ) {
    super(applicationErrorCode);
    this.name = "WebhookProcessingError";
    this.applicationErrorCode = applicationErrorCode;
    this.retryable = retryable;
  }
}

export function safeWebhookLog({
  error,
  eventType,
  internalEventCategory,
}: {
  error?: unknown;
  eventType: string | null;
  internalEventCategory: SafeWebhookLog["internalEventCategory"];
}): SafeWebhookLog {
  const known = error instanceof WebhookProcessingError ? error : null;
  return {
    applicationErrorCode: known?.applicationErrorCode
      ?? (internalEventCategory === "signature" ? "invalid_signature" : "webhook_processing_failed"),
    eventType,
    internalEventCategory,
    retryable: known?.retryable ?? internalEventCategory === "processing",
    route: "/api/stripe/webhook",
  };
}
