'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserRoles,hasAllowedRole,platformRoleGroups } from '@/lib/auth/roles';
import { parseBusinessDateTime, formatBusinessDateTime } from '@/lib/business-time';
import { withDeadline } from '@/lib/runtime/deadline';
export type HandoffActionState={status:'idle'|'success'|'error';message:string;updatedAt?:string;preview?:{id:string;title:string;change:string}[]};
const uuid=(v:string)=>/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
async function staff() {
 const db=await createClient();if(!db)return null;const user=(await db.auth.getUser()).data.user;
 if(!user||!hasAllowedRole(await getUserRoles(db,user.id),platformRoleGroups.internalStaff))return null;return{db,user};
}
function changes(form:FormData) {
 const assignee=String(form.get('assigned_to_user_id')??''),date=String(form.get('snoozed_until')??'');
 if(assignee&&!uuid(assignee))throw Error('Invalid assignee');
 const snooze=date?parseBusinessDateTime(date):null;
 if(date&&(!snooze||snooze.getTime()<=Date.now()))throw Error('Choose a future return time');
 return{assignee:assignee||null,snooze:snooze?.toISOString()??null};
}
function refresh() {for(const path of ['/admin','/admin/follow-ups','/admin/jobs','/admin/quotes'])revalidatePath(path);}
export async function updateHandoff(_state:HandoffActionState,form:FormData):Promise<HandoffActionState> {
 try{const auth=await staff();if(!auth)return{status:'error',message:'Office access is required.'};
  const id=String(form.get('task_id')??''),version=String(form.get('updated_at')??'');if(!uuid(id)||!Number.isFinite(Date.parse(version)))throw Error('Invalid handoff');const c=changes(form);
  const saved=await withDeadline(signal=>auth.db.rpc('update_office_handoff',{p_task_id:id,p_expected_updated_at:version,p_assignee_id:c.assignee,p_snoozed_until:c.snooze}).abortSignal(signal),5000);
  if(saved.error||saved.data?.id!==id||!saved.data.updated_at)return{status:'error',message:saved.error?.code==='40001'?'This handoff changed. Refresh before saving your changes.':'Changes could not be confirmed. Refresh and check the owner and return time before trying again.'};
  refresh();return{status:'success',message:'Owner and return time saved. No customer message was sent.',updatedAt:saved.data.updated_at};
 }catch{return{status:'error',message:'Choose an active office owner and a future return time, or clear the return time. Refresh if a save was interrupted.'};}
}
export async function trackSchedulingHandoff(_state:HandoffActionState,form:FormData):Promise<HandoffActionState> {
 try{const auth=await staff();if(!auth)return{status:'error',message:'Office access is required.'};const id=String(form.get('job_id')??'');if(!uuid(id))throw Error('Invalid work');
  const saved=await withDeadline(signal=>auth.db.rpc('ensure_scheduling_handoff',{p_job_id:id}).abortSignal(signal),5000);
  if(saved.error||!uuid(saved.data??''))throw Error('Unconfirmed');refresh();return{status:'success',message:'Scheduling handoff checked. Refresh the queue to see its current owner.'};
 }catch{return{status:'error',message:'The handoff could not be confirmed. Check the work order before trying again.'};}
}
export async function previewHandoffChanges(_state:HandoffActionState,form:FormData):Promise<HandoffActionState> {
 try{const auth=await staff();if(!auth)return{status:'error',message:'Office access is required.'};const ids=[...new Set(form.getAll('task_id').map(String))];if(!ids.length||ids.length>25||ids.some(id=>!uuid(id)))return{status:'error',message:'Choose between one and 25 handoffs on this page.'};
  const c=changes(form);let label='Shared office queue';
  if(c.assignee){const person=await withDeadline(signal=>auth.db.from('office_handoff_staff').select('id,full_name,email').eq('id',c.assignee).abortSignal(signal).maybeSingle(),5000);
   if(person.error||!person.data)throw Error('Invalid owner');label=person.data.full_name||person.data.email||'Office owner';}
  const result=await withDeadline(signal=>auth.db.from('follow_up_tasks').select('id,title,status').in('id',ids).limit(25).abortSignal(signal),5000);if(result.error)throw Error('Unavailable');
  return{status:'success',message:'Preview only. No tasks were changed and no email was sent. Apply any changes individually after review.',preview:ids.map(id=>{const row=result.data?.find(r=>r.id===id);return{id,title:row?.title??'Handoff unavailable',change:row&&['open','in_progress','waiting'].includes(row.status)?`${label}${c.snooze?' · Return '+formatBusinessDateTime(c.snooze)+' Eastern':' · No snooze'}`:'This handoff is closed or unavailable. Refresh before changing it.'};})};
 }catch{return{status:'error',message:'The preview could not load. Check the owner and return time, then try again. Nothing was changed.'};}
}
