import * as branding from '../src/lib/company-brand.ts';
import * as jsx from 'react/jsx-runtime';
import {randomUUID}from'node:crypto';
import {load}from'./customer-invoice-fixture.mjs';
import {initialChangeOrderActionState as idle}from'../src/lib/action-states/change-orders.ts';
import {changeOrderResponseOutcome}from'../src/lib/portal/change-order-response-outcome.ts';
export function outcomeAction({kind='change_requested',receipt,error=null,review,rate={available:true,allowed:true}}={}){
 const calls=[],handoffs=[];review??={id:randomUUID(),job_id:randomUUID(),updated_at:'2035-01-01T00:00:00Z',review_hash:'a'.repeat(64)};
 receipt??={change_order_id:review.id,job_id:review.job_id,source_event_id:randomUUID(),replayed:false,newly_approved:true};
 const db={rpc:async(name,args)=>{calls.push({name,args});return{data:error?null:receipt,error};}};
 const module=load('../src/lib/actions/change-orders.ts',{'../company-brand.ts':branding,
  '@/lib/email/delivery-commands':{callDeliveryCommand:async(client,name,args)=>db.rpc(name,args)},'next/cache':{revalidatePath(){}},'next/navigation':{},'@/lib/activity-log':{},'@/lib/auth/roles':{},
  '@/lib/data/change-orders':{getChangeOrderByPortalToken:async()=>({status:'ready',changeOrder:review})},'@/lib/notifications/source-events':{deliverCustomerSourceEvent:async v=>handoffs.push(v)},'@/lib/portal/tokens':{hashPortalToken:()=> 'a'.repeat(64)},'@/lib/email/send':{},'@/lib/email/config':{},'@/lib/email/delivery':{},'@/lib/email/delivery-followups':{},'@/lib/portal/change-order-links':{},'@/lib/portal/urls':{},'@/lib/supabase/server':{},'@/lib/supabase/admin':{getServiceRoleClient:()=>db},'@/lib/security/portal-rate-limit':{checkPortalActionRateLimit:async()=>rate},'@/lib/security/errors':{safeStaffMessage:(message,fallback)=>message??fallback},
 });
 const form=new FormData();Object.entries({token:'synthetic-local-token',request_id:randomUUID(),expected_updated_at:review.updated_at,review_hash:review.review_hash,approver_name:'Synthetic approver',response_intent:kind==='declined'?'decline':'request_changes',message:kind==='declined'?'':'Synthetic revised scope'}).forEach(([k,v])=>form.set(k,v));
 return{calls,handoffs,form,run:()=>kind==='approved'?module.approveChangeOrderByPortal(idle,form):module.respondToChangeOrderByPortal(idle,form)};
}
export function outcomeTree(approval=idle,response=idle){
 let i=0;const icon=()=>null;
 const Component=load('../src/components/portal-change-order-actions.tsx',{
  'react/jsx-runtime':jsx,react:{useEffect(){},useId:()=> 'synthetic-outcome',useRef:value=>({current:value}),useState:value=>[value,()=>{}]},'lucide-react':{CheckCircle2:icon,MessageSquareText:icon,XCircle:icon},
  '@/lib/portal/change-order-response-attempt':{},'@/lib/portal/change-order-response-outcome':{changeOrderResponseOutcome},'@/hooks/use-reliable-action-state':{useReliableActionState:()=>[[approval,response][i++],()=>{},false]},
  '@/lib/actions/change-orders':{},'@/lib/action-states/change-orders':{initialChangeOrderActionState:idle},'./portal-change-order-actions.css':{},
 }).PortalChangeOrderActions;
 return Component({token:'synthetic-local-token',expectedUpdatedAt:'2035-01-01T00:00:00Z',reviewHash:'a'.repeat(64)});
}
