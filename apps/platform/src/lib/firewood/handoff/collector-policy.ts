import "server-only";
import type {SupabaseClient}from"@supabase/supabase-js";
export const FIREWOOD_HANDOFF_TERMS="firewood-handoff-test-2026-10-29";
export function getFirewoodOrderReturnUrl(invoice:{invoice_number?:string|null;document_terms_version?:string|null}){
 if(invoice.document_terms_version!==FIREWOOD_HANDOFF_TERMS||process.env.FIREWOOD_HANDOFF_V2_COLLECTOR_TEST_ENABLED!=="1"||process.env.FIREWOOD_HANDOFF_V2_WEBSITE_ORIGIN!=="http://127.0.0.1:55849")return null;
 return "http://127.0.0.1:55849/firewood/checkout/result/";
}
export type FirewoodCollectorPolicy={sourceId:string;orderId:string;accountId:string;receiptAuthority:"crm";surchargeReporting:true};
export async function getFirewoodCollectorPolicy(db:SupabaseClient,invoice:{id:string;invoice_number?:string|null;document_terms_version?:string|null},livemode:boolean):Promise<{ok:true;policy:FirewoodCollectorPolicy|null}|{ok:false;message:string;status:number;reason?:"setup"|"review"|"settled"}>{
 // A future live handoff invoice must never fall through as an unmanaged
 // ordinary invoice. Actual live admission is intentionally not installed yet.
 if(invoice.document_terms_version?.startsWith("firewood-household-live-")||invoice.invoice_number?.startsWith("INV-FW-"))return{ok:false,message:"Payment for this Firewood order is not available yet. Please contact our office.",status:503,reason:"setup"};
 if(invoice.document_terms_version!==FIREWOOD_HANDOFF_TERMS&&!invoice.invoice_number?.startsWith("TEST-FW2-"))return{ok:true,policy:null};
 const staging=process.env.APP_ENV==="staging"||process.env.FIREWOOD_HANDOFF_V2_STAGING_ENABLED==="1";
 const enabled=staging?(await import("./staging-profile.mjs")).isFirewoodStagingIdentity(process.env)&&process.env.FIREWOOD_HANDOFF_V2_STAGING_ENABLED==="1"&&process.env.FIREWOOD_HANDOFF_V2_TEST_ENABLED!=="1"&&process.env.FIREWOOD_HANDOFF_V2_COLLECTOR_STAGING_ENABLED==="1"&&process.env.FIREWOOD_HANDOFF_V2_COLLECTOR_TEST_ENABLED!=="1":process.env.FIREWOOD_HANDOFF_V2_COLLECTOR_TEST_ENABLED==="1";
 if(livemode||!enabled||!(staging?/^rk_test_[A-Za-z0-9]+$/:/^(?:(?:sk|rk)_test_|rkcs_test_)[A-Za-z0-9]+$/).test(process.env.STRIPE_SECRET_KEY??""))return{ok:false,message:"Payment for this Firewood order is not available yet. Please contact our office.",status:503};
 try{const{data,error}=await db.rpc("get_firewood_collector_context",{p_invoice:invoice.id}).abortSignal(AbortSignal.timeout(5000));
  if(error||data?.managed!==true||data.account_id!=="acct_1UU9U8RAZXGe6tX0"||data.source_id!=="website_firewood_invoice_v2"||data.receipt_authority!=="crm"||data.surcharge_reporting!==true)return{ok:false,message:"Payment for this Firewood order could not be confirmed. Please contact our office.",status:503};
  if(data.allowed!==true){if(data.already_paid===true)return{ok:false,message:"Payment has already been received. No further payment is requested.",status:409,reason:"settled"};return{ok:false,message:"This Firewood payment needs office review before another payment. Please contact our office.",status:409,reason:"review"};}
  return{ok:true,policy:{sourceId:data.source_id,orderId:data.order_id,accountId:data.account_id,receiptAuthority:"crm",surchargeReporting:true}};
 }catch{return{ok:false,message:"Payment status could not be confirmed. Please contact our office before paying again.",status:503};}
}
export function firewoodSurchargeFields(policy:FirewoodCollectorPolicy|null|undefined,amount:number){
 if(!policy)return null;
 if(policy.accountId!=="acct_1UU9U8RAZXGe6tX0"||policy.surchargeReporting!==true||policy.receiptAuthority!=="crm"||!Number.isSafeInteger(amount)||amount<0)throw Error("firewood_surcharge_policy_unconfirmed");
 if(amount===0)return null;
 return{amount,enforce_validation:"enabled" as const};
}
