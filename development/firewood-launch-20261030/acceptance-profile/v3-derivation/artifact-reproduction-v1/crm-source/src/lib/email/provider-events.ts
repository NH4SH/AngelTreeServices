import "server-only";
import {callDeliveryCommand} from "@/lib/email/delivery-commands";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withDeadline } from "@/lib/runtime/deadline";
import { completeDeliveryFollowups } from "@/lib/email/delivery-followups";
import { getEmailProviderConfig } from "@/lib/email/config";

const eventTypes=new Set(['email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed']);
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function verifyResendSignature(raw:string,headers:Headers,secrets:string[],now=Date.now()) {
  const id=headers.get('svix-id')??'',timestamp=headers.get('svix-timestamp')??'',signatures=headers.get('svix-signature')??'';
  if(!/^[A-Za-z0-9_-]{1,200}$/.test(id)||!/^\d{10,12}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300||signatures.length>2048)throw Error('Invalid signature');
  const candidates=signatures.split(' ').filter(x=>x.startsWith('v1,')).map(x=>x.slice(3));
  let valid=false;
  for(const secret of secrets.filter(Boolean)) {
    if(!/^whsec_[A-Za-z0-9+/=_-]{16,200}$/.test(secret))continue;
    const key=Buffer.from(secret.slice(6),'base64');if(key.length<16)continue;
    const expected=createHmac('sha256',key).update(`${id}.${timestamp}.${raw}`).digest();
    for(const signature of candidates){if(!/^[A-Za-z0-9+/]{43}=$/.test(signature))continue;const supplied=Buffer.from(signature,'base64');if(supplied.length===expected.length&&timingSafeEqual(expected,supplied))valid=true;}
  }
  if(!valid)throw Error('Invalid signature');
  return id;
}
export function parseResendEvent(raw:string) {
  const event=JSON.parse(raw),data=event?.data;
  if(event&&typeof event.type==='string'&&!eventTypes.has(event.type))return{supported:false,type:event.type,messageId:'',occurredAt:'',recipients:[],deliveryId:null};
  if(!event||typeof event.type!=='string'||!data||typeof data.email_id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(data.email_id)
    ||typeof event.created_at!=='string'||!Number.isFinite(Date.parse(event.created_at))||!Array.isArray(data.to)||data.to.length<1||data.to.length>100
    ||data.to.some((v:unknown)=>typeof v!=='string'||v.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))throw Error('Invalid event');
  const tag=data.tags?.crm_delivery_id;
  return {type:event.type,supported:eventTypes.has(event.type),messageId:data.email_id as string,occurredAt:event.created_at as string,
    recipients:data.to.map((v:string)=>v.trim().toLowerCase()),deliveryId:typeof tag==='string'&&uuid.test(tag)?tag:null};
}
export async function ingestResendEvent(db:SupabaseClient,raw:string,eventId:string) {
  const event=parseResendEvent(raw);
  if(!event.supported)return {ignored:true};
  const result=await callDeliveryCommand(db,'record_outbound_provider_event',{p_event_id:eventId,p_hash:createHash('sha256').update(raw).digest('hex'),p_message_id:event.messageId,
    p_delivery_id:event.deliveryId,p_type:event.type,p_occurred_at:event.occurredAt,p_recipients:event.recipients});
  const receipt=result.data;
  // An empty HTTP-success response is not proof that the receipt committed.
  // Return a retryable failure rather than acknowledging and losing recovery.
  if(result.error||typeof receipt?.replayed!=='boolean'||!['matched','unmatched','quarantined','ignored'].includes(receipt?.disposition)
    ||(receipt.disposition==='matched'&&(!uuid.test(receipt.delivery_id??'')||(event.deliveryId&&event.deliveryId!==receipt.delivery_id))))throw Error('Provider receipt storage unavailable');
  if(result.data?.delivery_id)await completeDeliveryFollowups(db,result.data.delivery_id);
  return result.data;
}
// This is a GET-only reconciliation path. The server checks evidence against the
// stored request; a typed provider ID alone can never mark a delivery accepted.
export async function reconcileProviderReference(db:SupabaseClient,deliveryId:string,reference:string,request:typeof fetch=fetch) {
  if(!uuid.test(deliveryId)||!/^[A-Za-z0-9_-]{1,200}$/.test(reference))throw Error('Enter a valid provider reference.');
  const config=getEmailProviderConfig();if(!config)throw Error('Provider lookup is not configured.');
  const stored=await callDeliveryCommand(db,'get_outbound_delivery',{p_delivery_id:deliveryId});
  if(stored.error||!stored.data?.payload||!stored.data.first_dispatched_at)throw Error('The saved delivery could not be checked.');
  const result=await withDeadline(async signal=>{const response=await request(`https://api.resend.com/emails/${encodeURIComponent(reference)}`,{method:'GET',headers:{Authorization:`Bearer ${config.apiKey}`},signal,redirect:'error'});if(!response.ok)throw Error('Provider lookup unavailable. Check API read access.');return response.json();},8000);
  const tags=Array.isArray(result.tags)?Object.fromEntries(result.tags.map((t:{name:string;value:string})=>[t.name,t.value])):result.tags;
  const p=stored.data.payload;
  const normalize=(v:unknown)=>Array.isArray(v)?v.map(x=>String(x).trim().toLowerCase()).sort():[];
  const created=Date.parse(result.created_at),started=Date.parse(stored.data.first_dispatched_at);
  if(result.id!==reference||tags?.crm_delivery_id!==deliveryId||JSON.stringify(normalize(result.to))!==JSON.stringify(normalize(p.to))
    ||JSON.stringify(normalize(result.cc??[]))!==JSON.stringify(normalize(p.cc??[]))||result.subject!==p.subject||result.from!==p.from
    ||!Number.isFinite(created)||created<started-300_000||created>Date.now()+300_000)throw Error('That provider message does not match this saved delivery.');
  const status=String(result.last_event),type=({sent:'email.sent',delivered:'email.delivered',delivery_delayed:'email.delivery_delayed',bounced:'email.bounced',complained:'email.complained',failed:'email.failed',suppressed:'email.suppressed',opened:'email.sent',clicked:'email.sent'} as Record<string,string>)[status];
  if(!type)throw Error('The provider has not confirmed a supported delivery outcome.');
  const raw=JSON.stringify({type,created_at:new Date(created).toISOString(),data:{email_id:reference,to:p.to,tags:{crm_delivery_id:deliveryId}}});
  return ingestResendEvent(db,raw,`lookup_${deliveryId}_${createHash('sha256').update(reference+status).digest('hex').slice(0,40)}`);
}
export async function readWebhookBody(request:Request,maxBytes=262144) {
  if(Number(request.headers.get('content-length')??0)>maxBytes)throw Error('Body too large');
  const reader=request.body?.getReader();if(!reader)throw Error('Missing body');
  try {return await withDeadline(async signal=>{
    const parts:Uint8Array[]=[];let size=0;
    const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
    try{while(true){if(signal.aborted)throw Error('Body timeout');const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>maxBytes)throw Error('Body too large');parts.push(chunk.value);}
      const bytes=Buffer.concat(parts);return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    }finally{signal.removeEventListener('abort',cancel);}
  },5000);}finally{await reader.cancel().catch(()=>{});}
}

export async function reconcileLegacyProviderReference(db:SupabaseClient,event:{id:string;subject:string;recipient_email:string;created_at:string},actorId:string,reference:string,reason:string,request:typeof fetch=fetch) {
  if(!uuid.test(reference))throw Error('Enter the provider message ID.');
  const config=getEmailProviderConfig();if(!config)throw Error('Provider lookup is not configured.');
  const result=await withDeadline(async signal=>{const response=await request(`https://api.resend.com/emails/${encodeURIComponent(reference)}`,{method:'GET',headers:{Authorization:`Bearer ${config.apiKey}`},signal,redirect:'error'});if(!response.ok)throw Error('Provider lookup unavailable');return response.json();},8000);
  if(result.id!==reference||result.subject!==event.subject||!Array.isArray(result.to)||result.to.length!==1||result.to[0].trim().toLowerCase()!==event.recipient_email.trim().toLowerCase()
    ||!Number.isFinite(Date.parse(result.created_at))||Math.abs(Date.parse(result.created_at)-Date.parse(event.created_at))>300000)throw Error('Provider evidence does not match the earlier attempt.');
  const status=({sent:'accepted',delivered:'delivered',delivery_delayed:'delayed',bounced:'bounced',complained:'complained',failed:'failed',suppressed:'suppressed',opened:'accepted',clicked:'accepted'} as Record<string,string>)[String(result.last_event)];
  if(!status)throw Error('Provider outcome is not supported.');
  const saved=await callDeliveryCommand(db,'record_legacy_email_provider_check',{p_event_id:event.id,p_actor_id:actorId,p_provider_id:reference,p_subject:event.subject,p_recipient:event.recipient_email,p_provider_created_at:result.created_at,p_delivery_status:status,p_reason:reason});
  if(saved.error||saved.data!==true)throw Error('Legacy receipt repair was not confirmed.');
}
