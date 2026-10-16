import "server-only";
import { withDeadline } from "@/lib/runtime/deadline";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import type { NextActionSubject } from "@/lib/next-actions";
import type { FollowUpTaskWithRelations } from "@/lib/types/database";

const staffContext = cache(async () => {
  const db = await createClient();
  if (!db) return null;
  const { data: { user } } = await db.auth.getUser();
  if (!user || !hasAllowedRole(await getUserRoles(db, user.id), platformRoleGroups.internalStaff)) return null;
  return db;
});

export async function getNextActions(subject?: NextActionSubject, id?: string, assignee?: string, dueOnly = false) {
  try {
    const db = await staffContext();
    if (!db) return { data: [] as FollowUpTaskWithRelations[], error: "Office access is required to view next actions." };
    let query = db.from("follow_up_tasks").select("*, customers(id, display_name), organizations(id, name), service_locations(id, label, street, city), assigned_profile:profiles!follow_up_tasks_assigned_to_user_id_fkey(id, full_name, email)").in("status", ["open", "in_progress", "waiting"]);
    if (subject && id) query = query.eq(subject, id);
    if (assignee) query = query.eq("assigned_to_user_id", assignee);
    if (dueOnly) {
      const now = new Date().toISOString();
      query = query.lte("next_action_at",now);
    }
    const { data, error } = await query.order("next_action_at").order("id").limit(subject ? 20 : 100);
    return { data: (data ?? []) as FollowUpTaskWithRelations[], error: error ? "Next actions could not load. Try refreshing; do not assume the queue is empty." : null };
  } catch {
    return { data: [] as FollowUpTaskWithRelations[], error: "Next actions are temporarily unavailable. Please retry." };
  }
}

export const getNextActionStaff = cache(async () => {
  try {
    const db = await staffContext();
    if (!db) return [];
    const { data, error } = await db.from("office_handoff_staff").select("id, full_name, email").order("full_name").order("id").limit(100);
    if (error) return [];
    return (data ?? []).map(({ id, full_name, email }) => ({ id: String(id), full_name: full_name as string | null, email: email as string | null }));
  } catch { return []; }
});

export async function getCompletedEstimatesWithoutProposal() {
  try {
    const db = await staffContext();
    if (!db) return { data: [], error: "Office access is required." };
    const { data, error } = await db.from("schedule_events")
      .select("id, title, starts_at, job_id, proposals:quotes!quotes_estimate_schedule_event_id_fkey(id), jobs:jobs!schedule_events_job_id_fkey(id, archived_at, source_quote_id, quotes:quotes!quotes_job_id_fkey(id))")
      .eq("event_type", "estimate").eq("status", "completed")
      .order("starts_at", { ascending: false }).limit(100);
    if (error) return { data: [], error: "Completed estimates could not load. Review the schedule before assuming none need proposals." };
    const rows = (data ?? []) as unknown as { id: string; title: string; starts_at: string; job_id: string | null; proposals: { id: string }[]; jobs: { archived_at: string | null; source_quote_id: string | null; quotes: { id: string }[] } | null }[];
    return { data: rows.filter(row => !row.proposals.length && !row.jobs?.archived_at && !row.jobs?.source_quote_id && !row.jobs?.quotes.length), error: null };
  } catch { return { data: [], error: "Completed estimates are temporarily unavailable." }; }
}

export type OfficeHandoff = import('@/lib/types/database').FollowUpTask & {next_action_at:string;assigned_label:string;needs_owner:boolean;party_label:string};
export async function getOfficeHandoffPage(filters:import('@/lib/handoff-views').HandoffFilters,userId:string) {
  const empty={data:[] as OfficeHandoff[],count:0,page:filters.page,error:'Handoffs could not load. Refresh before assuming this queue is empty.'};
  try {
    const db=await staffContext();if(!db)return empty;
    const request=()=>{
      let q=db.from('office_follow_up_queue').select('*',{count:'exact'}).in('status',['open','in_progress','waiting']);
      if(filters.assigned==='me')q=q.eq('assigned_to_user_id',userId);
      else if(filters.assigned==='unassigned')q=q.eq('needs_owner',true);
      else if(filters.assigned!=='all')q=q.eq('assigned_to_user_id',filters.assigned);
      if(filters.kind==='scheduling')q=q.eq('task_type','schedule_approved_work');
      const now=new Date().toISOString();
      if(filters.due==='due')q=q.lte('next_action_at',now);
      if(filters.due==='snoozed')q=q.gt('snoozed_until',now);
      return q.order('next_action_at').order('id');
    };
    return await withDeadline(async signal=>{
      let page=filters.page,result=await request().range((page-1)*25,page*25-1).abortSignal(signal);
      if(result.error)throw Error('Unavailable');
      const last=Math.max(1,Math.ceil((result.count??0)/25));
      if(page>last){page=last;result=await request().range((page-1)*25,page*25-1).abortSignal(signal);if(result.error)throw Error('Unavailable');}
      return{data:(result.data??[]) as OfficeHandoff[],count:result.count??0,page,error:null};
    },5000);
  }catch{return empty;}
}
export async function getSchedulingHandoffGaps() {
  try{const db=await staffContext();if(!db)return{data:[],error:'Scheduling handoffs could not load.'};
    const result=await withDeadline(signal=>db.from('approved_work_handoff_gaps').select('id,party_label,approved_at').order('approved_at').order('id').limit(10).abortSignal(signal),5000);
    if(result.error)throw Error('Unavailable');return{data:result.data??[],error:null};
  }catch{return{data:[],error:'Earlier approved work could not load. Review Jobs before assuming all work has an owner.'};}
}
