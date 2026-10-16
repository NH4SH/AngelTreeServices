import type {SupabaseClient} from "@supabase/supabase-js";
import {withDeadline} from "../runtime/deadline.ts";
// Aborting a response cannot prove a transaction rolled back. Callers require a
// positive acknowledgement before sending and retain uncertain outcomes.
export async function callDeliveryCommand(db:SupabaseClient,name:string,args:Record<string,unknown>,timeoutMs=5000) {
  try{return await withDeadline(async signal=>{
    let query=db.rpc(name,args);if(typeof query.abortSignal==='function')query=query.abortSignal(signal);
    return await query;
  },timeoutMs);}catch{return{data:null,error:{code:'DELIVERY_UNCONFIRMED',message:'Delivery storage acknowledgement unavailable.'}};}
}
