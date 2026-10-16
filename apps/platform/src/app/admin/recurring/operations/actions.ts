'use server';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {getUserRoles,hasAllowedRole,platformRoleGroups} from '@/lib/auth/roles';
import {withDeadline} from '@/lib/runtime/deadline';
import {renewalAcknowledged,type OperationState} from '@/lib/operations';
const uuid=(v:string)=>/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
async function staff(admin=false){const db=await createClient();if(!db)throw Error('Unavailable');const user=(await db.auth.getUser()).data.user;if(!user||!hasAllowedRole(await getUserRoles(db,user.id),admin?platformRoleGroups.accessApproval:platformRoleGroups.internalStaff))throw Error('Denied');return db;}
export async function approveRenewals(_state:OperationState,form:FormData):Promise<OperationState>{
 try{const db=await staff(),requestId=String(form.get('request_id')??'');
  if(!uuid(requestId)||form.get('confirm')!=='yes')return{status:'error',message:'Confirm that these are review opportunities only.'};
  const values=form.getAll('selection');if(!values.length||values.length>25)throw Error('Selection');
  const selection=values.map(value=>{if(typeof value!=='string'||value.length>200)throw Error('Selection');const v=JSON.parse(value);if(!uuid(v.id)||!/^[a-f0-9]{32}$/.test(v.version))throw Error('Selection');return{id:v.id,version:v.version};});
  if(new Set(selection.map(v=>v.id)).size!==selection.length)throw Error('Duplicate');
  const result=await withDeadline(signal=>db.rpc('approve_recurring_generation',{p_request_id:requestId,p_selection:selection}).abortSignal(signal),6000);
  if(result.error||!renewalAcknowledged(result.data,requestId,selection.length))return{status:'error',message:result.error?.code==='40001'?'A plan or review changed. Refresh the preview before approving.':'Creation could not be confirmed. Check recurring opportunities before trying again; keep this review open for a safe retry.'};
  for(const path of ['/admin/recurring','/admin/recurring/operations','/admin/follow-ups','/admin'])revalidatePath(path);
  return{status:'success',message:`${result.data.created_count} review opportunities created; ${result.data.existing_count} already existed. No quote, work order or email was created.`};
 }catch(error){return{status:'error',message:error instanceof Error&&['Denied','Unavailable'].includes(error.message)?'Office access could not be verified. Sign in again before creating review opportunities.':'Choose one to 25 current opportunities, confirm the review, then try again. Check existing opportunities if a save was interrupted.'};}
}
export async function retryCalendar(_state:OperationState,form:FormData):Promise<OperationState>{
 try{const db=await staff(true),key=String(form.get('key')??''),revision=Number(form.get('revision')),version=String(form.get('updated_at')??''),reason=String(form.get('reason')??'').trim();
  if(form.get('confirm')!=='yes'||!key||key.length>150||!Number.isSafeInteger(revision)||revision<1||!Number.isFinite(Date.parse(version))||reason.length<5||reason.length>500)throw Error('Invalid');
  const result=await withDeadline(signal=>db.rpc('retry_calendar_operation',{p_key:key,p_revision:revision,p_updated_at:version,p_reason:reason}).abortSignal(signal),5000);
  if(result.error||result.data?.revision!==revision+1||result.data?.status!=='pending')return{status:'error',message:result.error?.code==='23514'?'The account owner must review or reconnect Google Calendar first.':'Retry could not be confirmed. Refresh the queue before trying again.'};
  revalidatePath('/admin/recurring/operations');return{status:'success',message:'One retry queued. Google was not contacted by this action. The configured worker will mirror current CRM work; no customer email is sent.'};
 }catch{return{status:'error',message:'Owner or admin access, a brief reason, and confirmation are required. Refresh before retrying.'};}
}
