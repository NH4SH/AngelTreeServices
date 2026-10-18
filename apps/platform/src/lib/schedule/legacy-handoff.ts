import type {SupabaseClient} from '@supabase/supabase-js';
import {withDeadline} from '../runtime/deadline.ts';
// Explicit repair for older/maintenance-created gaps. Ordinary web appointment
// saves now reconcile inside save_legacy_appointment; they do not rely on this
// separate call. Reading the gap view still performs no historical writes.
export async function checkLegacySchedulingHandoff(db:SupabaseClient,jobId:string) {
 try{const result=await withDeadline(signal=>db.rpc('ensure_scheduling_handoff',{p_job_id:jobId}).abortSignal(signal),5000);
  return !result.error&&(result.data===null||typeof result.data==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(result.data));
 }catch{return false;}
}
