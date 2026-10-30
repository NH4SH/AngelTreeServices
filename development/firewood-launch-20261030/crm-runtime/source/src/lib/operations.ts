export type RenewalCandidate={id:string;recurring_plan_id:string;plan_name:string;party_label:string;property_label:string;next_service_due_date:string;version:string;authorization_mode:string};
export type CalendarOperation={key:string;type:string;status:string;revision:number;updated_at:string;attempt_count:number;available_at:string;needs_reconnect:boolean;target_label:string;schedule_event_id:string|null};
export type CalendarOperations={counts:Record<string,number>;last_attempt_at:string|null;last_success_at:string|null;reconnect_count:number;tasks:CalendarOperation[]};
export type OperationState={status:'idle'|'success'|'error';message:string};
export function renewalAcknowledged(data:unknown,requestId:string,count:number){
 const v=data as Record<string,unknown>|null;
 return Boolean(v&&v.request_id===requestId&&v.reviewed_count===count&&Number.isInteger(v.created_count)&&Number.isInteger(v.existing_count)&&Number(v.created_count)>=0&&Number(v.existing_count)>=0&&Number(v.created_count)+Number(v.existing_count)===count);
}
// Boolean-only readiness; never serialize configuration or credential values.
export function calendarWorkerReadiness(env:Record<string,string|undefined>,oauthReady:boolean,canonicalReady:boolean){
 const secret=env.GOOGLE_CALENDAR_WORKER_SECRET?.trim()??'';
 const isolated=Boolean(secret)&&![env.COMMUNICATION_WORKER_SECRET,env.SYSTEM_HEALTH_MONITOR_SECRET].some(value=>value?.trim()===secret);
 return{oauth:oauthReady,canonical:canonicalReady,worker:secret.length>=32&&isolated,ready:oauthReady&&canonicalReady&&secret.length>=32&&isolated};
}
