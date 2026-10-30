import "server-only";
import {callDeliveryCommand} from "@/lib/email/delivery-commands";
import type {SupabaseClient} from "@supabase/supabase-js";
import {syncAutomatedCommunications} from "@/lib/communications/queue";
import {withDeadline} from "@/lib/runtime/deadline";
import {deliveryResult} from "@/lib/email/delivery";
import type {SendEmailResult} from "@/lib/email/send";
// Queue preparation only. This helper never dispatches a customer message.
export async function completeDeliveryFollowups(db:SupabaseClient,id:string,fallback?:SendEmailResult):Promise<SendEmailResult> {
  try {
    let saved=await callDeliveryCommand(db,'get_outbound_delivery',{p_delivery_id:id});
    if(saved.error||!saved.data)return fallback??deliveryResult(null,{deliveryId:id});
    if(saved.data.followup_sync_pending) {
      const sync=await withDeadline(()=>syncAutomatedCommunications(db),10000);
      if(sync.error)throw Error('Reminder preparation unavailable');
      const ack=await callDeliveryCommand(db,'acknowledge_outbound_followup',{p_delivery_id:id});
      if(ack.error||ack.data!==true)throw Error('Reminder preparation acknowledgement unavailable');
      saved=await callDeliveryCommand(db,'get_outbound_delivery',{p_delivery_id:id});
      if(saved.error||!saved.data)throw Error('Delivery unavailable');
    }
    return deliveryResult(saved.data);
  }catch{return {...(fallback??deliveryResult({id,state:'accepted',repair_state:'pending',provider_message_id:null})),sourceReconciled:false,deliveryId:id,retryable:false,message:'Email accepted and retained. Reminder preparation needs review; do not send the email again.'};}
}
