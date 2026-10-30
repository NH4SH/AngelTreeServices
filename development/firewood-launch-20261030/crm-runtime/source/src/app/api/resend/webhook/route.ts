import { verifyResendSignature, readWebhookBody, ingestResendEvent, parseResendEvent } from "@/lib/email/provider-events";
import { getServiceRoleClient } from "@/lib/supabase/admin";
export const runtime="nodejs";
export async function POST(request:Request) {
  const secrets=[process.env.RESEND_WEBHOOK_SECRET,process.env.RESEND_WEBHOOK_SECRET_PREVIOUS].filter((s):s is string=>Boolean(s));
  if(!secrets.length)return new Response('Webhook configuration unavailable.',{status:503});
  let raw:string,id:string;
  try{raw=await readWebhookBody(request);id=verifyResendSignature(raw,request.headers,secrets);}
  catch{return new Response('Invalid webhook.',{status:400});}
  try{const event=parseResendEvent(raw);if(!event.supported)return Response.json({received:true});}catch{return new Response('Invalid event.',{status:400});}
  try{const db=getServiceRoleClient();if(!db)throw Error('Unavailable');await ingestResendEvent(db,raw,id);return Response.json({received:true});}
  catch{return new Response('Receipt could not be recorded.',{status:503,headers:{'Retry-After':'10'}});}
}
