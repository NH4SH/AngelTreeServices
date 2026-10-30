import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {withDeadline} from '@/lib/runtime/deadline';
import {getUserRoles,hasAllowedRole,platformRoleGroups} from '@/lib/auth/roles';
import type {RenewalCandidate,CalendarOperations} from '@/lib/operations';
export async function getSupervisedOperations(page:number){
 const empty={candidates:[] as RenewalCandidate[],count:0,page,runs:[] as {created_at:string;created_count:number;existing_count:number}[],automatic:false as boolean|null,calendar:null as CalendarOperations|null,calendarError:null as string|null,error:null as string|null};
 try{const db=await createClient();if(!db)throw Error('Unavailable');const user=(await db.auth.getUser()).data.user;
  const roles=user?await getUserRoles(db,user.id):[];if(!hasAllowedRole(roles,platformRoleGroups.internalStaff))throw Error('Unavailable');
  return await withDeadline(async signal=>{
   const previewQuery=(requested:number)=>db.from('recurring_generation_preview').select('*',{count:'exact'}).eq('already_generated',false).order('next_service_due_date').order('id').range((requested-1)*25,requested*25-1).abortSignal(signal);
   let [preview,runs,settings,calendar]=await Promise.all([
    previewQuery(page),
    db.rpc('get_recurring_review_runs').abortSignal(signal),
    db.from('recurring_service_settings').select('automated_generation_enabled').abortSignal(signal).single(),
    hasAllowedRole(roles,platformRoleGroups.accessApproval)?db.rpc('get_calendar_operations').abortSignal(signal):Promise.resolve({data:null,error:null})
   ]);
   if(preview.error?.code==='PGRST103'){
    const count=await db.from('recurring_generation_preview').select('id',{count:'exact',head:true}).eq('already_generated',false).abortSignal(signal);
    if(count.error)throw Error('Unavailable');page=Math.max(1,Math.ceil((count.count??0)/25));preview=await previewQuery(page);
   }
   if(preview.error||runs.error||settings.error)throw Error('Unavailable');
   const last=Math.max(1,Math.ceil((preview.count??0)/25));if(page>last){page=last;preview=await previewQuery(page);if(preview.error)throw Error('Unavailable');}
   return{...empty,page,candidates:(preview.data??[]) as RenewalCandidate[],count:preview.count??0,runs:(runs.data??[]) as typeof empty.runs,automatic:settings.data?.automated_generation_enabled??null,calendar:calendar.data as CalendarOperations|null,calendarError:calendar.error?'Calendar work could not load. Refresh before retrying.':null};
  },6000);
 }catch{return{...empty,automatic:null,error:'Operations could not load. Refresh before assuming no reviews are due.'};}
}
