'use client';
import {useEffect,useState,useId,useRef} from 'react';
import {toBusinessDateTimeLocal} from '@/lib/business-time';
import {useReliableActionState} from '@/hooks/use-reliable-action-state';
import {updateHandoff,trackSchedulingHandoff,previewHandoffChanges,type HandoffActionState} from '@/app/admin/follow-ups/actions';
import {handoffFilters,handoffViewHref,savedHandoffView,type HandoffFilters} from '@/lib/handoff-views';
const initial:HandoffActionState={status:'idle',message:''};
type Staff={id:string;full_name:string|null;email:string|null}[];
function Message({state}:{state:HandoffActionState}) {return state.message?<p className={`form-message ${state.status}`} role={state.status==='error'?'alert':'status'}>{state.message}</p>:null;}
function OwnerField({staff,value=''}:{staff:Staff;value?:string}) {return <label>Owner<select name="assigned_to_user_id" defaultValue={value}><option value="">Shared office queue</option>{value&&!staff.some(person=>person.id===value)?<option value={value}>Current owner — keep unchanged</option>:null}{staff.map(person=><option value={person.id} key={person.id}>{person.full_name||person.email||'Office owner'}</option>)}</select></label>;}
export function HandoffControls({taskId,version,assignee,needsOwner,staff,snoozedUntil}:{taskId:string;version:string;assignee:string|null;needsOwner:boolean;staff:Staff;snoozedUntil:string|null}) {
 const displayedVersion=useRef(version);
 const [state,action,pending]=useReliableActionState(async(previous:HandoffActionState,form:FormData)=>{form.set('updated_at',displayedVersion.current);const result=await updateHandoff(previous,form);if(result.updatedAt)displayedVersion.current=result.updatedAt;return result;},initial);
 return <details className="handoff-edit"><summary>Owner &amp; return time</summary><form action={action} className="crm-form">
  <input type="hidden" name="task_id" value={taskId}/><input type="hidden" name="updated_at" value={version}/>
  {needsOwner&&assignee?<p>The previous owner is no longer active. Choose an office owner or the shared queue.</p>:null}
  <OwnerField staff={staff} value={needsOwner?'':assignee??''}/>
  <label>Return to the queue (Eastern time)<input name="snoozed_until" type="datetime-local" defaultValue={snoozedUntil?toBusinessDateTimeLocal(snoozedUntil):''}/></label>
  <p className="field-note">Leave blank to clear the snooze. This does not book work or contact the customer.</p>
  <button className="secondary-action" disabled={pending}>{pending?'Saving…':'Save handoff'}</button><Message state={state}/>
 </form></details>;
}
export function TrackSchedulingControl({jobId}:{jobId:string}) {
 const [state,action,pending]=useReliableActionState(trackSchedulingHandoff,initial);
 return <form action={action}><input type="hidden" name="job_id" value={jobId}/><button className="secondary-action" disabled={pending}>{pending?'Checking…':'Track scheduling'}</button><Message state={state}/></form>;
}
export function HandoffPreview({staff}:{staff:Staff}) {
 const [state,action,pending]=useReliableActionState(previewHandoffChanges,initial);
 return <details className="handoff-preview"><summary>Preview changes to selected handoffs</summary><form id="office-handoff-preview" action={action} className="crm-form">
  <p>Select handoffs above, then compare a proposed owner and return time. This is a preview only; save each handoff individually to apply a change.</p>
  <div className="form-grid-two"><OwnerField staff={staff}/><label>Proposed return time (Eastern)<input type="datetime-local" name="snoozed_until"/></label></div>
  <button className="secondary-action" disabled={pending}>{pending?'Loading preview…':'Preview only'}</button><Message state={state}/>
  {state.preview?<ul className="handoff-preview-list">{state.preview.map(row=><li key={row.id}><strong>{row.title}</strong><p>{row.change}</p></li>)}</ul>:null}
 </form></details>;
}
export function HandoffFilters({filters,userId,staff}:{filters:HandoffFilters;userId:string;staff:Staff}) {
 const [saved,setSaved]=useState<string|null>(null),[message,setMessage]=useState('');const id=useId(),key=`angel-tree-follow-up-view-v1:${userId}`;
 useEffect(()=>{try{setSaved(savedHandoffView(localStorage.getItem(key)));}catch{setMessage('Saved views are unavailable in this browser. Filters still work.');}},[key]);
 return <section className="handoff-filters" aria-label="Handoff filters"><form method="get" className="handoff-filter-form">
  <label htmlFor={id+'owner'}>Show<select id={id+'owner'} name="assigned" defaultValue={filters.assigned}><option value="all">All office handoffs</option><option value="me">Assigned to me</option><option value="unassigned">Needs an owner</option>{!["all","me","unassigned"].includes(filters.assigned)&&!staff.some(person=>person.id===filters.assigned)?<option value={filters.assigned}>Selected owner — review availability</option>:null}{staff.map(person=><option value={person.id} key={person.id}>{person.full_name||person.email}</option>)}</select></label>
  <label htmlFor={id+'kind'}>Work<select id={id+'kind'} name="kind" defaultValue={filters.kind}><option value="all">All next actions</option><option value="scheduling">Approved work to schedule</option></select></label>
  <label htmlFor={id+'due'}>When<select id={id+'due'} name="due" defaultValue={filters.due}><option value="all">All return times</option><option value="due">Due now</option><option value="snoozed">Snoozed</option></select></label>
  <button className="secondary-action">Apply filters</button>
 </form><div className="handoff-saved-view"><button className="secondary-action" type="button" onClick={()=>{try{localStorage.setItem(key,JSON.stringify({version:1,filters:handoffFilters({...filters,page:1})}));setSaved(handoffViewHref(filters));setMessage('This view is saved in this browser for your account.');}catch{setMessage('This browser could not save the view. You can still bookmark the filtered page.');}}}>Save this view</button>{saved?<a href={saved}>Open saved view</a>:null}<span role="status">{message}</span></div></section>;
}
