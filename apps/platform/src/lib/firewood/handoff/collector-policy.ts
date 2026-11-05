import "server-only";
import type {SupabaseClient}from"@supabase/supabase-js";
import type Stripe from "stripe";
import {readReleasedContext} from "../runtime-admission/released-context.mjs";
import {getStripeClientKeyFingerprint} from "@/lib/stripe/server";
import {isLiveFirewoodInvoice,liveSurchargeFields} from "./live-collector.mjs";
import {createLiveCollectorAdmission,looksLiveCollectorPolicy,type LiveCollectorPolicy} from "./collector-admission.mjs";
const liveAdmission=createLiveCollectorAdmission({readContext:readReleasedContext,readKey:()=>process.env.STRIPE_SECRET_KEY,
 readCollectorContext:async(db:SupabaseClient,invoiceId:string)=>{const result=await db.rpc("get_firewood_live_collector_context",{p_invoice:invoiceId}).abortSignal(AbortSignal.timeout(5000));if(result.error)throw Error("live_collection_unconfirmed");return result.data;}});
export const FIREWOOD_HANDOFF_TERMS="firewood-handoff-test-2026-10-29";
export function getFirewoodOrderReturnUrl(invoice:{invoice_number?:string|null;document_terms_version?:string|null}){
 if(invoice.document_terms_version!==FIREWOOD_HANDOFF_TERMS||process.env.FIREWOOD_HANDOFF_V2_COLLECTOR_TEST_ENABLED!=="1"||process.env.FIREWOOD_HANDOFF_V2_WEBSITE_ORIGIN!=="http://127.0.0.1:55849")return null;
 return "http://127.0.0.1:55849/firewood/checkout/result/";
}
export type FirewoodCollectorPolicy={sourceId:string;orderId:string;accountId:string;receiptAuthority:"crm";surchargeReporting:true}|LiveCollectorPolicy;
export async function getFirewoodCollectorPolicy(db:SupabaseClient,invoice:{id:string;invoice_number?:string|null;document_terms_version?:string|null},livemode:boolean):Promise<{ok:true;policy:FirewoodCollectorPolicy|null}|{ok:false;message:string;status:number;reason?:"setup"|"review"|"settled"}>{
 // A malformed live marker stays closed. A policy is minted only after the
 // fixed release/key gate and exact current native source/invoice binding.
 if(isLiveFirewoodInvoice(invoice)){
  const policy=await liveAdmission.mint(db,invoice,livemode).catch(()=>null);
  return policy?{ok:true,policy}:{ok:false,message:"Payment for this Firewood order is not available. Please contact our office before paying again.",status:503,reason:"setup"};
 }
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
export function isLiveCollectorPolicy(policy:FirewoodCollectorPolicy|null|undefined):policy is LiveCollectorPolicy{return looksLiveCollectorPolicy(policy);}
export async function revalidateFirewoodCollection(input:{policy?:FirewoodCollectorPolicy|null;db:SupabaseClient;invoiceId:string;invoiceNumber?:string|null;livemode:boolean;stripe:Stripe}){
 if(isLiveCollectorPolicy(input.policy))return liveAdmission.revalidate(input.policy,input.db,input.invoiceId,input.livemode,getStripeClientKeyFingerprint(input.stripe));
 // An omitted/forged policy cannot turn a marked live invoice into ordinary payment.
 if(input.invoiceNumber?.startsWith("INV-FW-"))return false;
 return !input.policy||!input.livemode&&input.policy.accountId==="acct_1UU9U8RAZXGe6tX0"&&input.policy.sourceId==="website_firewood_invoice_v2";
}
export function firewoodCardConfigurationMatches(policy:FirewoodCollectorPolicy|null|undefined,enabled:boolean,bps:number){return !isLiveCollectorPolicy(policy)||liveAdmission.isMinted(policy)&&enabled===true&&bps===300;}
export function firewoodSurchargeFields(policy:FirewoodCollectorPolicy|null|undefined,amount:number,card?:{principalCents:number;funding:string;country:string|null}){
 if(isLiveCollectorPolicy(policy)){
  if(!liveAdmission.isMinted(policy)||!card)throw Error("firewood_surcharge_policy_unconfirmed");
  return liveSurchargeFields(policy,{principalCents:card.principalCents,surchargeCents:amount,funding:card.funding,country:card.country??""});
 }
 if(!policy)return null;
 if(policy.accountId!=="acct_1UU9U8RAZXGe6tX0"||policy.surchargeReporting!==true||policy.receiptAuthority!=="crm"||!Number.isSafeInteger(amount)||amount<0)throw Error("firewood_surcharge_policy_unconfirmed");
 if(amount===0)return null;
 return{amount,enforce_validation:"enabled" as const};
}
