import * as jsx from 'react/jsx-runtime';
import {randomUUID}from'node:crypto';
import{load}from'./customer-invoice-fixture.mjs';
export const {proposalResponseOutcome}=load('../src/lib/portal/proposal-response-outcome.ts',{'./customer-states':load('../src/lib/portal/customer-states.ts')});
const idle={ok:false,status:'idle',message:''};
export function proposalAction({kind='changes',receipt,error=null,record,rate={available:true,allowed:true},lookupStatus='ready'}={}){
 record??={id:randomUUID(),status:'sent',edit_revision:3};
 receipt??=kind==='approval'?{job_id:randomUUID(),created_job:true,replayed:false,edit_revision:record.edit_revision+1,approved_at:new Date().toISOString()}:{request_id:randomUUID(),quote_id:record.id,note_id:randomUUID(),edit_revision:record.edit_revision+1,requested_at:new Date().toISOString(),replayed:false,customer_id:null,organization_id:null,quote_number:null,party_name:'Synthetic customer'};
 const calls=[],handoffs=[],db={rpc:async(name,args)=>{calls.push({name,args});return{data:error?null:receipt,error};}};
 const safeStaffMessage=(message,fallback)=>message??fallback;
 const actions=load('../src/lib/actions/portal-tokens.ts',{
  'next/cache':{revalidatePath(){}},'@/lib/auth/roles':{},'@/lib/data/portal-quote':{getQuoteByPortalToken:async()=>({status:lookupStatus,quote:record,tokenId:randomUUID(),message:'Link unavailable'})},
  '@/lib/quotes/workflow':load('../src/lib/quotes/workflow.ts',{'server-only':{},'@/lib/security/errors':{safeStaffMessage}}),
  '@/lib/quotes/change-request':load('../src/lib/quotes/change-request.ts',{'server-only':{}}),'@/lib/supabase/admin':{getServiceRoleClient:()=>db},'@/lib/supabase/server':{},'@/lib/portal/quote-link-command':{},'@/lib/portal/quote-link-batch':{},'@/lib/portal/quote-link-attempt':{},'@/lib/portal/tokens':{hashPortalToken:()=> 'a'.repeat(64)},'@/lib/security/portal-rate-limit':{checkPortalActionRateLimit:async()=>rate},'@/lib/security/errors':{safeStaffMessage},'@/lib/notifications/source-events':{deliverCustomerSourceEvent:async value=>handoffs.push(value)},
 });
 const form=new FormData();Object.entries({token:'synthetic-private-capability',request_id:receipt?.request_id??randomUUID(),expected_revision:String(record.edit_revision),message:'Synthetic scope adjustment'}).forEach(([k,v])=>form.set(k,v));
 return{calls,handoffs,form,run:()=>kind==='approval'?actions.approveQuoteByPortalToken(idle,form):actions.requestQuoteChangesByPortalToken(idle,form)};
}
export function proposalHarness({states=[idle,idle],pending=[false,false],results=[],status='sent',props={}}={}){
 const values=[],refs=[],effects=[],calls=[],actions=[];let vi=0,ri=0,ai=0;
 const attempts=load('../src/lib/portal/quote-change-attempt.ts');
 const Component=load('../src/components/portal-quote-actions.tsx',{
  'react/jsx-runtime':jsx,react:{useId:()=> 'synthetic-proposal',useRef:value=>refs[ri++]??(refs[ri-1]={current:value}),useState:value=>{const i=vi++;values[i]??=value;return[values[i],v=>values[i]=v];},useEffect:fn=>effects.push(fn)},
  'lucide-react':{CheckCircle2:()=>null,MessageSquareText:()=>null,ShieldCheck:()=>null},'@/lib/portal/customer-states':load('../src/lib/portal/customer-states.ts'),'@/lib/portal/proposal-response-outcome':{proposalResponseOutcome},'@/components/portal-contact':{PortalContact:()=>null},'@/lib/portal/quote-change-attempt':attempts,
  '@/hooks/use-reliable-action-state':{useReliableActionState:fn=>{const i=ai++;actions[i]=fn;return[states[i],fn,pending[i]];}},
  '@/lib/actions/portal-tokens':{approveQuoteByPortalToken:async(previous,form)=>{calls.push({kind:'approval',form});return await(typeof results[0]==='function'?results[0]():results[0]);},requestQuoteChangesByPortalToken:async(previous,form)=>{calls.push({kind:'changes',form});return await(typeof results[1]==='function'?results[1]():results[1]);}},'./portal-quote-actions.css':{},
 }).PortalQuoteActions;
 const render=(extra={})=>{vi=ri=ai=0;return Component({quoteStatus:status,expirationLabel:'Synthetic validity',expectedRevision:3,rawToken:'synthetic-private-capability',statusLabel:'Awaiting response',totalLabel:'$425.00',workSummary:{mode:'short',items:['Synthetic scope']},...props,...extra});};
 return{render,values,refs,effects,calls,actions,states,pending};
}
export{idle};
