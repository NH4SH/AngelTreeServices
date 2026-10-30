import "server-only";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { callDeliveryCommand } from "@/lib/email/delivery-commands";
import { getEmailSetupState } from "@/lib/email/config";
import { dispatchSavedEmail } from "@/lib/email/delivery";
import { completeDeliveryFollowups } from "@/lib/email/delivery-followups";
import { sendEmailTransport } from "@/lib/email/send";
import { isConfirmedCustomerActivity } from "@/lib/notifications/customer-activity";
import { buildCanonicalAppUrl } from "@/lib/security/app-base-url";
import { mapBounded } from "@/lib/runtime/deadline";
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
type Source={id:string}|{key:string};

/** Called only after the validated source operation. No source facts are rebuilt
 * from its response: a crash leaves the original intent in Delivery review. */
export async function deliverCustomerSourceEvent(source:Source){
  return processSource(source,null,true);
}
/** Recovery is preparation only. The separate existing delivery controls own
 * any provider attempt; this function never calls transport. */
export async function prepareReviewedCustomerSourceEvent(id:string,reviewId:string){
  if(!uuid(id)||!uuid(reviewId))return {prepared:false};
  return processSource({id},reviewId,false);
}
async function processSource(source:Source,reviewId:string|null,dispatch:boolean):Promise<{prepared:boolean}> {
  try{
    const db=getServiceRoleClient();if(!db)throw Error('Unavailable');
    if('id' in source&&!uuid(source.id))throw Error('Invalid source receipt');
    const lookup=await callDeliveryCommand(db,'id' in source?'get_customer_source_event':'find_customer_source_event',
      'id' in source?{p_source_id:source.id}:{p_source_key:source.key});
    if(lookup.error)throw Error('Source unavailable');
    // Pre-existing business events are not backfilled by replaying an old page.
    if(lookup.data===null)return {prepared:false};
    const row=lookup.data;
    if(!uuid(row?.id)||('id' in source&&row.id!==source.id)||typeof row.destination_path!=='string'
      ||!(row.destination_path==='/admin'||row.destination_path.startsWith('/admin/')))throw Error('Source acknowledgement unavailable');
    const setup=getEmailSetupState();
    const receipt=await callDeliveryCommand(db,'prepare_customer_source_event',{
      p_source_id:row.id,p_envelope:{from:setup.from,reply_to:setup.replyTo},
      p_destination:buildCanonicalAppUrl(row.destination_path),p_review_id:reviewId,
    });
    if(receipt.error||receipt.data?.source_event_id!==row.id||!isConfirmedCustomerActivity(receipt.data))throw Error('Preparation unavailable');
    if(!dispatch||!setup.configured)return {prepared:true};
    const outcomes=await mapBounded(receipt.data.delivery_ids,3,async id=>{
      try{const sent=await dispatchSavedEmail(id,db,sendEmailTransport);const result=sent.ok?await completeDeliveryFollowups(db,id,sent):sent;return result.ok&&result.historyRecorded&&result.sourceReconciled;}catch{return false;}
    });
    if(outcomes.some(ok=>!ok))throw Error('Delivery review required');
    return {prepared:true};
  }catch{
    console.error('Customer source activity needs review.');
    return {prepared:false};
  }
}
