import "server-only";

import { getInternalLeadNotificationEmails } from "@/lib/email/config";
import { sendTransactionalEmail } from "@/lib/email/send";
import type { SendEmailResult } from "@/lib/email/send";
import { leadInternalNoticeTemplate } from "@/lib/email/templates";
import { isUuid, type PublicLeadSubmission } from "@/lib/leads/intake";
import { getServiceRoleClient } from "@/lib/supabase/admin";

export type WebsiteNoticeOutcome = SendEmailResult["outcome"];

export async function notifyOfficeOfWebsiteLead(jobId: string, submission: PublicLeadSubmission): Promise<WebsiteNoticeOutcome> {
  const template = leadInternalNoticeTemplate({ jobId, submission });
  const recipients = getInternalLeadNotificationEmails();
  // Wait for every recipient before classifying a partial or ambiguous attempt.
  const results = await Promise.allSettled(recipients.map((recipient, index) =>
    sendTransactionalEmail({
      to: recipient, subject: template.subject, text: template.text, html: template.html,
      emailType: "lead_internal_notice", relatedJobId: jobId,
      idempotencyKey: `website-lead:${jobId}:recipient:${index}`,
    }),
  ));
  if (!results.length) return "not_attempted";
  if (results.some(result => result.status === "rejected")) return "unknown";
  const outcomes = results.map(result => (result as PromiseFulfilledResult<SendEmailResult>).value);
  if (outcomes.every(result => result.outcome === "accepted" && result.historyRecorded)) return "accepted";
  // Accepted mail with a missing receipt, or only some accepted recipients,
  // requires reconciliation. Neither is safe to label as a retryable failure.
  if (outcomes.some(result => result.outcome === "accepted" || result.outcome === "unknown")) return "unknown";
  if (outcomes.every(result => result.outcome === "not_attempted")) return "not_attempted";
  return "rejected";
}

export async function attemptWebsiteLeadNotification(jobId: string, submission: PublicLeadSubmission) {
  // Never send unless the durable, one-shot claim is positively acknowledged.
  // Lost claim/finish responses remain visible for review; no automatic reclaim.
  try {
    const supabase = getServiceRoleClient();
    if (!supabase) return;
    const claim = await supabase.rpc("claim_website_lead_notification", { p_job_id: jobId });
    if (claim.error || !isUuid(claim.data)) {
      if (claim.error) console.error("Office lead notice claim could not be confirmed.", { jobId });
      return;
    }
    let outcome: WebsiteNoticeOutcome;
    try { outcome = await notifyOfficeOfWebsiteLead(jobId, submission); }
    catch { outcome = "unknown"; }
    const finish = await supabase.rpc("finish_website_lead_notification", {
      p_job_id: jobId, p_attempt_id: claim.data, p_outcome: outcome,
    });
    if (finish.error || finish.data !== true) console.error("Office lead notice outcome needs review.", { jobId });
  } catch {
    // The lead itself is already committed. Keep its successful public response.
    console.error("Office lead notice handoff needs review.", { jobId });
  }
}
