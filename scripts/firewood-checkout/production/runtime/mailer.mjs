// Constructed only after a separately approved live release. Sandbox confirmations
// remain captured locally; this module cannot send test copies to real people.
export function customerMailer(config,key,fetcher=fetch){if(config.sandbox||config.emailEnabled!==true||!/^re_[A-Za-z0-9_]+$/u.test(key??''))throw Error('customer_sending_not_approved');
 return {async send(message,id){if(!/^fw-confirmation-[a-f0-9-]{36}$/u.test(id)||!message||typeof message.to!=='string'||!/^\S+@\S+\.\S+$/u.test(message.to)||message.replyTo!=='info@angeltreeservice.org')throw Error('frozen_confirmation_required');
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':id},
    body:JSON.stringify({from:'Angel Tree Services Firewood <orders@firewood.angeltreeservice.org>',to:[message.to],reply_to:message.replyTo,subject:message.subject,text:message.text})});
  if(!response.ok)throw Error('confirmation_provider_pending');const value=await response.json();if(!/^[a-f0-9-]{36}$/iu.test(value.id??''))throw Error('confirmation_provider_unverified');return value.id;}};
}
