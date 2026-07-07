import "server-only";

export type EmailProviderConfig = {
  apiKey: string;
  from: string;
  replyTo: string;
};

const defaultFrom = "Angel Tree Services <no-reply@angeltreeservices.org>";
const defaultReplyTo = "office@angeltreeservices.org";

export function getEmailProviderConfig(): EmailProviderConfig | null {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    from: process.env.EMAIL_FROM || defaultFrom,
    replyTo: process.env.EMAIL_REPLY_TO || defaultReplyTo,
  };
}

export function getEmailSetupState() {
  return {
    configured: Boolean(process.env.RESEND_API_KEY),
    from: process.env.EMAIL_FROM || defaultFrom,
    replyTo: process.env.EMAIL_REPLY_TO || defaultReplyTo,
    internalLeadNotificationEmail: process.env.INTERNAL_LEAD_NOTIFICATION_EMAIL || defaultReplyTo,
  };
}

export function getInternalLeadNotificationEmail() {
  return process.env.INTERNAL_LEAD_NOTIFICATION_EMAIL || defaultReplyTo;
}
