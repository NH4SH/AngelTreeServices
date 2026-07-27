import "server-only";

import { getInternalLeadNotificationEmails } from "@/lib/email/config";
import { sendTransactionalEmail } from "@/lib/email/send";
import { leadInternalNoticeTemplate } from "@/lib/email/templates";
import type { PublicLeadSubmission } from "@/lib/leads/intake";

export async function notifyOfficeOfWebsiteLead(jobId: string, submission: PublicLeadSubmission) {
  const template = leadInternalNoticeTemplate({ jobId, submission });
  const recipients = getInternalLeadNotificationEmails();

  const results = await Promise.all(
    recipients.map((recipient, index) =>
      sendTransactionalEmail({
        to: recipient,
        subject: template.subject,
        text: template.text,
        html: template.html,
        emailType: "lead_internal_notice",
        relatedJobId: jobId,
        idempotencyKey: `website-lead:${jobId}:recipient:${index}`,
      }),
    ),
  );

  const failedResult = results.find((result) => !result.ok);
  if (failedResult) {
    throw new Error("One or more office lead notifications could not be delivered.");
  }

  return results;
}
