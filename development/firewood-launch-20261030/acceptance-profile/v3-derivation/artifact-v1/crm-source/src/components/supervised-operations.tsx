'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useReliableActionState} from '@/hooks/use-reliable-action-state';
import {approveRenewals,retryCalendar} from '@/app/admin/recurring/operations/actions';
import type {RenewalCandidate,CalendarOperation,OperationState} from '@/lib/operations';
import {formatBusinessDate,formatBusinessDateTime} from '@/lib/business-time';
const initial:OperationState={status:'idle',message:''};
function Message({state}:{state:OperationState}){return state.message?<p className={`form-message ${state.status}`} role={state.status==='error'?'alert':'status'}>{state.message}</p>:null;}
export function RenewalReview({candidates}:{candidates:RenewalCandidate[]}){
 const [requestId,setRequestId]=useState('');
 useEffect(()=>setRequestId(crypto.randomUUID()),[]);
 const [state,action,pending]=useReliableActionState(async(previous:OperationState,form:FormData)=>{const result=await approveRenewals(previous,form);if(result.status==='success')setRequestId(crypto.randomUUID());return result;},initial);
 return <form onSubmit={event=>{event.preventDefault();void action(new FormData(event.currentTarget));}} className="operations-review"><input type="hidden" name="request_id" value={requestId}/><fieldset disabled={pending||!requestId}>
  <legend>Choose opportunities to create</legend>
  {candidates.map(item=><label className="operations-preview-row" key={item.id+item.version}><input type="checkbox" name="selection" value={JSON.stringify({id:item.id,version:item.version})}/><span><strong>{item.plan_name}</strong><span>{item.party_label} · {item.property_label}</span><span>Service due {formatBusinessDate(item.next_service_due_date)} · Review current scope, contacts and pricing</span><Link href={`/admin/recurring/${item.recurring_plan_id}`}>Review plan</Link></span></label>)}
  {!candidates.length?<p>No new opportunities in this preview. Existing cycles remain in Recurring services.</p>:<><label className="operations-confirm"><input type="checkbox" name="confirm" value="yes" required/><span>Create review opportunities only. I will review the current scope and pricing before any quote or work order.</span></label><button disabled={pending} className="primary-action">{pending?'Creating review opportunities…':'Create selected review opportunities'}</button></>}
 </fieldset><Message state={state}/></form>;
}
export function CalendarRetry({task,onComplete}:{task:CalendarOperation;onComplete?:(message:string)=>void}){
 const [state,action,pending]=useReliableActionState(async(previous:OperationState,form:FormData)=>{const result=await retryCalendar(previous,form);if(result.status==='success')onComplete?.(result.message);return result;},initial);
 return <details className="handoff-edit"><summary>Review one retry</summary><form onSubmit={event=>{event.preventDefault();void action(new FormData(event.currentTarget));}} className="crm-form"><fieldset disabled={pending} className="operations-fields">
  <input type="hidden" name="key" value={task.key}/><input type="hidden" name="revision" value={task.revision}/><input type="hidden" name="updated_at" value={task.updated_at}/>
  <p>This queues current CRM work for the existing Calendar worker. It does not contact Google now, change the CRM schedule or send customer email. Previous attempts remain recorded.</p>
  <label>Reason<textarea name="reason" minLength={5} maxLength={500} required/></label>
  <label className="operations-confirm"><input name="confirm" type="checkbox" value="yes" required/><span>Queue one retry after reviewing the account and current schedule.</span></label>
  <button className="secondary-action" disabled={pending||task.needs_reconnect}>{pending?'Queuing…':'Queue one retry'}</button>
 </fieldset><Message state={state}/></form></details>;
}
export function CalendarRecoveryList({tasks}:{tasks:CalendarOperation[]}){
 const [notice,setNotice]=useState('');
 return <>{notice?<p role="status" className="form-message success">{notice}</p>:null}{tasks.map(task=><article className="office-handoff-row" key={task.key+':'+task.revision+':'+task.updated_at}><div><h3>{task.type==='connection'?'Account calendar sync':'Scheduled work sync'}</h3><p>{task.schedule_event_id?<Link href={'/admin/schedule?event='+task.schedule_event_id}>{task.target_label}</Link>:task.target_label}</p><p>{task.status==='exhausted'?'Automatic retries stopped; review before another attempt.':'Waiting for its next automatic attempt.'}</p><p>{task.attempt_count} failed attempts · Eligible after {formatBusinessDateTime(task.available_at)}</p>{task.needs_reconnect?<p>The account owner must review their connection before a retry can be queued.</p>:null}</div><CalendarRetry task={task} onComplete={setNotice}/></article>)}{!tasks.length?<p>No failed or delayed Calendar work in this preview.</p>:<p>Showing up to 25, oldest eligible work first. Remaining work appears after earlier items leave this queue.</p>}</>;
}
