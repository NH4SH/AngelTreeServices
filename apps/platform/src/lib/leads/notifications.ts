import "server-only";

import { getInternalLeadNotificationEmail } from "@/lib/email/config";
import { sendTransactionalEmail } from "@/lib/email/send";
import { leadInternalNoticeTemplate } from "@/lib/email/templates";
import type { PublicLeadSubmission } from "@/lib/leads/intake";

export async function notifyOfficeOfWebsiteLead(jobId: string, submission: PublicLeadSubmission) {
  const template = leadInternalNoticeTemplate({ jobId, submission });

  return sendTransactionalEmail({
    to: getInternalLeadNotificationEmail(),
    subject: template.subject,
    text: template.text,
    html: template.html,
    emailType: "lead_internal_notice",
    relatedJobId: jobId,
  });
}
