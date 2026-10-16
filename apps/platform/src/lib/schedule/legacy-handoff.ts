import type {SupabaseClient} from '@supabase/supabase-js';
import {withDeadline} from '../runtime/deadline.ts';
// Legacy appointment writes predate PR08's atomic visit commands. Check their
// handoff afterward; a crash/uncertain acknowledgement stays visible in the
// derived approved-work gap view instead of silently losing the next action.
export async function checkLegacySchedulingHandoff(db:SupabaseClient,jobId:string) {
 try{const result=await withDeadline(signal=>db.rpc('ensure_scheduling_handoff',{p_job_id:jobId}).abortSignal(signal),5000);
  return !result.error&&(result.data===null||typeof result.data==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(result.data));
 }catch{return false;}
}
