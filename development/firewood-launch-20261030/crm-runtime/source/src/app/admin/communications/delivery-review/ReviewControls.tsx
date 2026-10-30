"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { reviewEmailDelivery, reviewLegacyEmail, prepareOfficeNotice, prepareMissingSourceActivity, type DeliveryReviewState } from "./actions";
const initial:DeliveryReviewState={status:'idle',message:''};
export function ReviewControls({id,recipient,providerReference,canManage,canRetry,canCopy,canRepair}:{id:string;recipient:string;providerReference:string|null;canManage:boolean;canRetry:boolean;canCopy:boolean;canRepair:boolean}) {
  const router=useRouter(),field=useId(),requestId=useRef('');
  const defaultOperation=canRepair&&canManage?'reconcile':canManage?'check_provider':'new_copy';
  const [operation,setOperation]=useState(defaultOperation);
  const [state,action,pending]=useReliableActionState(async(previous:DeliveryReviewState,form:FormData)=>{requestId.current||=crypto.randomUUID();form.set('request_id',requestId.current);const result=await reviewEmailDelivery(previous,form);router.refresh();return result;},initial);
  const sends=operation==='retry'||operation==='new_copy';
  if(!canManage&&!canCopy)return null;
  return <details className="delivery-review-options"><summary>Review options</summary>
    <form className="form-stack" onSubmit={event=>{event.preventDefault();if(pending)return;if(sends&&!window.confirm(operation==='new_copy'?`Send one additional email to ${recipient}? This intentionally sends another copy.`:`Retry the same saved email to ${recipient}? The recipient and message stay fixed. The provider will reuse the original request within its safe retry window.`))return;void action(new FormData(event.currentTarget));}}>
      <input name="delivery_id" type="hidden" value={id}/>
      <label htmlFor={field+'operation'}>Action</label>
      <select id={field+'operation'} name="operation" value={operation} onChange={e=>setOperation(e.target.value)} disabled={pending}>
        {canManage&&canRepair?<option value="reconcile">Repair CRM history — no email</option>:null}
        {canManage?<option value="check_provider">Check provider — no email</option>:null}
        {canManage&&canRetry?<option value="retry">Retry the same saved request — sends email</option>:null}
        {canCopy?<option value="new_copy">Send one additional copy — sends email</option>:null}
        {canManage?<option value="acknowledge">Record review — no email</option>:null}
      </select>
      {operation==='check_provider'?<><label htmlFor={field+'provider'}>Provider message reference</label><input id={field+'provider'} name="provider_reference" defaultValue={providerReference??''} required maxLength={200}/><p className="form-helper">Use the message ID from Resend. The saved recipient, sender and delivery tag must match. This only reads provider evidence.</p></>:null}
      <label htmlFor={field+'reason'}>Review reason</label><textarea id={field+'reason'} name="reason" required minLength={5} maxLength={1000} rows={2}/>
      <p className="form-helper">{sends?'This action can send email. It does not change the saved message or recipient.':'This action does not send email.'}</p>
      <button className={sends?'primary-action':'secondary-action'} disabled={pending} type="submit">{pending?'Working…':sends?'Confirm and send':'Confirm review'}</button>
      {state.message?<p className={`form-message ${state.status}`} role={state.status==='error'||state.status==='warning'?'alert':'status'}>{state.message}</p>:null}
    </form>
  </details>;
}
export function OfficeNoticeControl({jobId}:{jobId:string}) {
  const router=useRouter();const [state,action,pending]=useReliableActionState(async(previous:DeliveryReviewState,form:FormData)=>{const result=await prepareOfficeNotice(previous,form);router.refresh();return result;},initial);
  return <form onSubmit={event=>{event.preventDefault();if(!window.confirm('Prepare and send the missing office notices for this website request? This only contacts the configured office recipients.'))return;void action(new FormData(event.currentTarget));}}><input type="hidden" name="job_id" value={jobId}/><button className="secondary-action" disabled={pending}>{pending?'Preparing…':'Prepare office notices'}</button>{state.message?<p className={`form-message ${state.status}`} role="status">{state.message}</p>:null}</form>;
}

export function LegacyReviewControl({eventId,reference}:{eventId:string;reference:string|null}) {
  const router=useRouter(),field=useId();const [state,action,pending]=useReliableActionState(async(previous:DeliveryReviewState,form:FormData)=>{const result=await reviewLegacyEmail(previous,form);router.refresh();return result;},initial);
  return <details className="delivery-review-options"><summary>Verify earlier receipt — no email</summary><form className="form-stack" onSubmit={event=>{event.preventDefault();void action(new FormData(event.currentTarget));}}><input name="event_id" type="hidden" value={eventId}/><label htmlFor={field+'ref'}>Provider message ID</label><input id={field+'ref'} name="provider_reference" defaultValue={reference??''} required/><label htmlFor={field+'reason'}>Review reason</label><textarea id={field+'reason'} name="reason" required minLength={5} maxLength={1000} rows={2}/><button className="secondary-action" disabled={pending}>{pending?'Checking…':'Check receipt — no email'}</button>{state.message?<p className={`form-message ${state.status}`} role={state.status==='error'?'alert':'status'}>{state.message}</p>:null}</form></details>;
}

export function SourceActivityControl({sourceId}:{sourceId:string}){
  const router=useRouter(),field=useId(),attempt=useRef<{id:string;reason:string}|undefined>(undefined);
  const [state,action,pending]=useReliableActionState(async(previous:DeliveryReviewState,form:FormData)=>{
    const reason=String(form.get("reason")??"").trim();if(attempt.current?.reason!==reason)attempt.current={id:crypto.randomUUID(),reason};
    form.set("request_id",attempt.current.id);const result=await prepareMissingSourceActivity(previous,form);router.refresh();return result;
  },initial);
  return <details className="delivery-review-options"><summary>Review missing alerts</summary><form method="post" className="form-stack" onSubmit={event=>{event.preventDefault();void action(new FormData(event.currentTarget));}}>
    <input type="hidden" name="source_event_id" value={sourceId}/><label htmlFor={field+"reason"}>Review reason</label><textarea id={field+"reason"} name="reason" required minLength={5} maxLength={1000} rows={2}/>
    <button className="secondary-action" disabled={pending}>{pending?"Preparing…":"Prepare alerts — no email"}</button>
    {state.message?<p className={`form-message ${state.status}`} role={state.status==="error"||state.status==="warning"?"alert":"status"}>{state.message}</p>:null}
  </form></details>;
}
