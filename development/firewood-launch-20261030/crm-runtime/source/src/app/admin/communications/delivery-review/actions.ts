"use server";
import {callDeliveryCommand} from "@/lib/email/delivery-commands";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { completeDeliveryFollowups } from "@/lib/email/delivery-followups";
import { dispatchSavedEmail } from "@/lib/email/delivery";
import { sendEmailTransport } from "@/lib/email/send";
import { getEmailSetupState } from "@/lib/email/config";
import { reconcileProviderReference, reconcileLegacyProviderReference } from "@/lib/email/provider-events";
import { prepareReviewedCustomerSourceEvent } from "@/lib/notifications/source-events";
import { notifyOfficeOfWebsiteLead } from "@/lib/leads/notifications";
export type DeliveryReviewState={status:"idle"|"success"|"error"|"warning";message:string};
const uuid=(v:string)=>/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export async function reviewEmailDelivery(_state:DeliveryReviewState,form:FormData):Promise<DeliveryReviewState> {
  const id=String(form.get('delivery_id')??''),action=String(form.get('operation')??''),reason=String(form.get('reason')??'').trim(),requestId=String(form.get('request_id')??'');
  if(!uuid(id)||!uuid(requestId)||reason.length<5||reason.length>1000)return{status:'error',message:'Add a short review reason before continuing.'};
  const db=await createClient();if(!db)return{status:'error',message:'Sign in to review delivery.'};
  const auth=await db.auth.getUser();if(!auth.data.user)return{status:'error',message:'Sign in to review delivery.'};
  const roles=await getUserRoles(db,auth.data.user.id);
  if(!hasAllowedRole(roles,action==='new_copy'?platformRoleGroups.internalStaff:platformRoleGroups.accessApproval))return{status:'error',message:'An owner or administrator must review this delivery.'};
  try {
    const service=getServiceRoleClient();if(!service)throw Error('Unavailable');
    if(action==='check_provider') {
      const review=await callDeliveryCommand(db,'review_outbound_delivery',{p_delivery_id:id,p_action:'check_provider',p_reason:reason,p_request_id:requestId});
      if(review.error||review.data?.id!==id||review.data?.action!=='check_provider')throw Error('Provider check authorization unavailable');
      const reference=String(form.get('provider_reference')??'').trim();
      await reconcileProviderReference(service,id,reference);
      // Evidence ingestion already attempts repair atomically. A failed repair
      // stays visible; re-running this action never sends an email.
      revalidatePath('/admin/communications');revalidatePath('/admin/communications/delivery-review');
      return{status:'success',message:'Provider evidence checked. No email was sent. Review the updated delivery status.'};
    }
    if(['retry','new_copy'].includes(action)&&!getEmailSetupState().configured)return{status:'error',message:'Email sending is not configured. No email was sent.'};
    const reviewed=await callDeliveryCommand(db,'review_outbound_delivery',{p_delivery_id:id,p_action:action,p_reason:reason,p_request_id:requestId});
    if(reviewed.error||!uuid(reviewed.data?.id??''))return{status:'error',message:'This action could not be completed safely. The source may have changed, the request may still be running, or its safe retry window may have closed. Refresh and check provider evidence.'};
    let message='Review recorded. No email was sent.',status:DeliveryReviewState['status']='success';
    if(action==='reconcile') {if(reviewed.data.repaired){const followup=await completeDeliveryFollowups(service,id);if(!followup.sourceReconciled){revalidatePath('/admin/communications/delivery-review');return{status:'warning',message:'CRM history is recorded. Reminder preparation still needs review. No email was sent.'};}}message=reviewed.data.repaired?'CRM history repaired. No email was sent.':'Provider acceptance is recorded, but the source changed. Its current state was preserved; no email was sent.';}
    if(['retry','new_copy'].includes(action)) {const sent=await dispatchSavedEmail(reviewed.data.id,service,sendEmailTransport);const result=sent.ok?await completeDeliveryFollowups(service,reviewed.data.id,sent):sent;message=result.message;status=result.ok?(result.sourceReconciled?'success':'warning'):result.outcome==='unknown'?'warning':'error';}
    revalidatePath('/admin/communications');revalidatePath('/admin/communications/delivery-review');revalidatePath('/admin/quotes');revalidatePath('/admin/invoices');
    return{status,message};
  }catch{return{status:'error',message:'Delivery review could not be confirmed. No additional send was authorized by this error. Refresh and review the saved status before trying again.'};}
}
export async function prepareOfficeNotice(_state:DeliveryReviewState,form:FormData):Promise<DeliveryReviewState> {
  const id=String(form.get('job_id')??'');if(!uuid(id))return{status:'error',message:'Choose a website request.'};
  const db=await createClient();if(!db)return{status:'error',message:'Sign in to review office notices.'};
  const user=(await db.auth.getUser()).data.user;
  if(!user||!hasAllowedRole(await getUserRoles(db,user.id),platformRoleGroups.accessApproval))return{status:'error',message:'An owner or administrator must review office notices.'};
  if(!getEmailSetupState().configured)return{status:'error',message:'Email sending is not configured. No office notice was sent.'};
  try{const service=getServiceRoleClient();if(!service)throw Error('Unavailable');const source=await callDeliveryCommand(service,'get_website_notice_repair',{p_job_id:id});
    if(source.error||!source.data?.submission)return{status:'error',message:'This older request has no frozen submission. Review it manually; no email was sent.'};
    const result=await notifyOfficeOfWebsiteLead(id,source.data.submission);
    revalidatePath('/admin/communications');revalidatePath('/admin/communications/delivery-review');
    const accepted=result?.every(r=>r.status==='fulfilled'&&r.value.ok);
    return{status:accepted?'success':'warning',message:accepted?'Office notices accepted. Their delivery records are available below.':'Office notices were checked. Review any pending or uncertain recipient before retrying.'};
  }catch{return{status:'warning',message:'Office notice preparation needs review. Refresh before another attempt.'};}
}

export async function reviewLegacyEmail(_state:DeliveryReviewState,form:FormData):Promise<DeliveryReviewState> {
  const id=String(form.get('event_id')??''),reference=String(form.get('provider_reference')??'').trim(),reason=String(form.get('reason')??'').trim();
  if(!uuid(id)||!uuid(reference)||reason.length<5||reason.length>1000)return{status:'error',message:'Enter the provider message ID and a short review reason.'};
  const db=await createClient();if(!db)return{status:'error',message:'Sign in to review earlier deliveries.'};
  const user=(await db.auth.getUser()).data.user;if(!user||!hasAllowedRole(await getUserRoles(db,user.id),platformRoleGroups.accessApproval))return{status:'error',message:'An owner or administrator must verify earlier deliveries.'};
  try{const saved=await db.from('email_events').select('id,subject,recipient_email,created_at,outbound_delivery_id').eq('id',id).single();
    if(saved.error||!saved.data||saved.data.outbound_delivery_id)throw Error('Unavailable');
    const service=getServiceRoleClient();if(!service)throw Error('Unavailable');
    await reconcileLegacyProviderReference(service,saved.data,user.id,reference,reason);
    revalidatePath('/admin/communications');revalidatePath('/admin/communications/delivery-review');
    return{status:'success',message:'Earlier provider receipt verified. No document status was changed and no email was sent.'};
  }catch{return{status:'error',message:'That provider message could not be matched safely. Check read access and the recipient, subject and original send time. No email was sent.'};}
}

export async function prepareMissingSourceActivity(_state:DeliveryReviewState,form:FormData):Promise<DeliveryReviewState>{
  const id=String(form.get("source_event_id")??""),requestId=String(form.get("request_id")??""),reason=String(form.get("reason")??"").trim();
  if(!uuid(id)||!uuid(requestId)||reason.length<5||reason.length>1000)return{status:"error",message:"Add a short reason for preparing these alerts."};
  try{
    const db=await createClient();if(!db)return{status:"error",message:"Sign in to review missing alerts."};
    const user=(await db.auth.getUser()).data.user;
    if(!user||!hasAllowedRole(await getUserRoles(db,user.id),platformRoleGroups.accessApproval))return{status:"error",message:"An owner or administrator must review missing alerts."};
    const review=await callDeliveryCommand(db,"review_customer_source_event",{p_source_id:id,p_request_id:requestId,p_reason:reason});
    if(review.error||review.data?.source_event_id!==id||review.data?.review_id!==requestId)throw Error("Review unconfirmed");
    const result=await prepareReviewedCustomerSourceEvent(id,requestId);
    revalidatePath("/admin/communications/delivery-review");revalidatePath("/admin");
    return result.prepared?{status:"success",message:"Office alerts and saved emails prepared. No email was sent. Review saved deliveries separately."}
      :{status:"warning",message:"Preparation could not be confirmed. The saved customer event remains available for review. No email was sent."};
  }catch{return{status:"error",message:"Preparation could not be confirmed. Refresh and check the saved status before retrying. No email was sent."};}
}
