import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {privateFile,jsonFile,atomicJson,lease} from '../../macbook/ops/files.mjs';

const recipient='info@angeltreeservice.org';
const from='Angel Tree Services Firewood <orders@firewood.angeltreeservice.org>';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const windowMs=23*3600000;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Opt-in operations notices are separate from customer email and payments.
// Both installations use only the fixed owner inbox; no order data enters mail.
export async function deliverOperationsNotification({root,sandbox,location,recovered,notice,local,fetcher=fetch,now=Date.now}){
  if(!['server','receiver'].includes(location)||typeof sandbox!=='boolean'||typeof local!=='function')throw Error('operations_notification_context_required');
  const folder=resolve(root,'ops'),settings=await jsonFile(resolve(folder,'notification-settings.json'));
  if(!settings)return local(recovered);
  if(Object.keys(settings).sort().join()!=='enabled,location,sandbox,version'||settings.version!==1||typeof settings.enabled!=='boolean'||settings.sandbox!==sandbox||settings.location!==location)throw Error('fixed_operations_recipient_required');
  if(!settings.enabled)return local(recovered);
  if(!uuid.test(notice?.id??'')||notice.recovered!==recovered||!Number.isSafeInteger(notice.createdAt)||notice.createdAt>now()+300000||
    !Array.isArray(notice.issues)||notice.issues.length>30||notice.issues.some(x=>typeof x!=='string'||!/^[a-z0-9_:.-]{1,80}$/u.test(x))||recovered!==(notice.issues.length===0))throw Error('durable_operations_notice_required');
  const file=resolve(folder,'notification-delivery.json');
  const result=await lease(file+'.lock',async()=>{
    const payload={from,to:[recipient],reply_to:recipient,subject:`${sandbox?'[TEST MONITOR] ':''}Angel Firewood ${recovered?'recovered':'needs attention'} (${location})`,
      text:[sandbox?'TEST OPERATIONS NOTICE — live payments remain off.':'Angel Firewood operations notice.',
        recovered?'Monitoring has recovered.':'Firewood needs attention. Open the private operations report.',
        `Source: ${location}.`,...(notice.issues.length?[`Checks: ${notice.issues.join(', ')}.`]:[]),
        `Reference: ${notice.id}.`,`Observed: ${new Date(notice.createdAt).toISOString()}.`,
        'This notice contains no customer or order details.'].join('\n')};
    let saved=await jsonFile(file);
    if(saved?.id!==notice.id){if(saved&&!saved.completed)throw Error('previous_operations_notice_requires_review');saved={id:notice.id,payload,payloadHash:hash(payload),firstAttemptAt:now(),emailAccepted:false,localAccepted:false,completed:false};await atomicJson(file,saved);}
    if(saved.id!==notice.id||!Number.isSafeInteger(saved.firstAttemptAt)||saved.firstAttemptAt>now()+300000||
      !['emailAccepted','localAccepted','completed'].every(k=>typeof saved[k]==='boolean')||saved.emailAccepted&&!uuid.test(saved.providerId??''))throw Error('operations_delivery_state_invalid');
    if(saved.payloadHash!==hash(payload)||hash(saved.payload)!==saved.payloadHash)throw Error('operations_notice_identity_conflict');
    if(!saved.emailAccepted){
      if(now()-saved.firstAttemptAt>=windowMs)throw Error('operations_email_deduplication_window_expired');
      const key=(await privateFile(resolve(folder,'notification-key.private'))).toString().trim();if(!/^re_[A-Za-z0-9_-]+$/u.test(key))throw Error('operations_sending_key_required');
      const response=await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',
        'Idempotency-Key':`fw-ops-${sandbox?'sandbox':'production'}-${location}-${notice.id}`},body:JSON.stringify(saved.payload)});
      if(!response.ok)throw Error('operations_email_not_accepted');const value=await response.json();if(!uuid.test(value.id??''))throw Error('operations_email_acceptance_unverified');
      saved={...saved,emailAccepted:true,providerId:value.id};await atomicJson(file,saved);
    }
    if(!saved.localAccepted){await local(recovered);saved={...saved,localAccepted:true};await atomicJson(file,saved);}
    saved={...saved,completed:true};await atomicJson(file,saved);return {emailAccepted:true,localAccepted:true};
  });
  if(result?.busy)throw Error('operations_notification_busy');return result;
}
