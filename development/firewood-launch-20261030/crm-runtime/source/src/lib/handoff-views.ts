export type HandoffFilters={assigned:string;kind:'all'|'scheduling';due:'all'|'due'|'snoozed';page:number};
export function handoffFilters(input:Record<string,unknown>):HandoffFilters {
 const assigned=String(input.assigned??'all');
 return{assigned:['all','me','unassigned'].includes(assigned)||/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(assigned)?assigned:'all',kind:input.kind==='scheduling'?'scheduling':'all',due:input.due==='due'?'due':input.due==='snoozed'?'snoozed':'all',page:Math.max(1,Math.min(10000,Math.trunc(Number(input.page))||1))};
}
export function handoffViewHref(input:Record<string,unknown>) {
 const f=handoffFilters(input),p=new URLSearchParams();
 if(f.assigned!=='all')p.set('assigned',f.assigned);if(f.kind!=='all')p.set('kind',f.kind);if(f.due!=='all')p.set('due',f.due);
 return '/admin/follow-ups'+(p.size?'?'+p.toString():'');
}
export function savedHandoffView(value:string|null) {
 try{const data=JSON.parse(value??'null');if(!data||data.version!==1)return null;return handoffViewHref(data.filters);}catch{return null;}
}
export function isManagedSchedulingTask(task:{dedupe_key?:string|null}) {return Boolean(task.dedupe_key?.startsWith('approved-work-schedule:'));}
