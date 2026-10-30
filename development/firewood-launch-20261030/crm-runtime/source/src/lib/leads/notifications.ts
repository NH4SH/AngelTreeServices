import "server-only";
import {callDeliveryCommand} from "@/lib/email/delivery-commands";
import { getInternalLeadNotificationEmails, getEmailSetupState } from "@/lib/email/config";
import { sendEmailTransport } from "@/lib/email/send";
import { dispatchSavedEmail } from "@/lib/email/delivery";
import { leadInternalNoticeTemplate } from "@/lib/email/templates";
import { isUuid, type PublicLeadSubmission } from "@/lib/leads/intake";
import { getServiceRoleClient } from "@/lib/supabase/admin";

// Every office recipient is frozen in one transaction before the first send.
// Re-entering the batch uses its original recipients and bodies, even if config changed.
export async function notifyOfficeOfWebsiteLead(jobId:string,submission:PublicLeadSubmission) {
  const db=getServiceRoleClient();if(!db)return;
  const saved=await callDeliveryCommand(db,'get_website_notice_repair',{p_job_id:jobId});
  if(saved.error||!saved.data)throw Error('Office notice context unavailable.');
  let attempt=saved.data.attempt_id;
  if(!attempt){const claim=await callDeliveryCommand(db,'claim_website_lead_notification',{p_job_id:jobId});if(claim.error||!isUuid(claim.data))return;attempt=claim.data;}
  const config=getEmailSetupState(),template=leadInternalNoticeTemplate({jobId,submission});
  const messages=getInternalLeadNotificationEmails().map(to=>({from:config.from,reply_to:config.replyTo,to:[to],cc:[],subject:template.subject,text:template.text,html:template.html}));
  const batch=await callDeliveryCommand(db,'prepare_website_notice_batch',{p_job_id:jobId,p_attempt_id:attempt,p_messages:messages});
  if(batch.error||!Array.isArray(batch.data)||!batch.data.every(isUuid))throw Error('Office notice batch could not be confirmed.');
  if(!config.configured)return;
  return Promise.allSettled(batch.data.map(id=>dispatchSavedEmail(id,db,sendEmailTransport)));
}
export async function attemptWebsiteLeadNotification(jobId:string,submission:PublicLeadSubmission) {
  try {await notifyOfficeOfWebsiteLead(jobId,submission);}
  catch {console.error('Office lead notices need delivery review.',{jobId});}
}
