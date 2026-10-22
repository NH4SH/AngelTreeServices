import assert from 'node:assert/strict';
import * as jsx from 'react/jsx-runtime';
import * as crypto from 'node:crypto';
import {load} from './customer-invoice-fixture.mjs';

const icon=()=>null;
export const PortalContact=load('../src/components/portal-contact.tsx',{'react/jsx-runtime':jsx,'./portal-recovery.css':{}}).PortalContact;
export const CustomerDocumentEntry=load('../src/components/customer-document-entry.tsx',{'react/jsx-runtime':jsx,'lucide-react':{Leaf:icon,ShieldCheck:icon},'@/components/portal-contact':{PortalContact}}).CustomerDocumentEntry;
export const SetupRequired=()=>null;
const redirect=path=>{throw Object.assign(new Error('Redirect'),{path});};
export function entryPage({configured=true,user=null}={}) {
  const client={auth:{getUser:async()=>({data:{user}})}};
  return load('../src/app/portal/page.tsx',{'react/jsx-runtime':jsx,'next/navigation':{redirect},'@/components/customer-document-entry':{CustomerDocumentEntry},'@/components/SetupRequired':{SetupRequired},'@/lib/supabase/server':{createClient:async()=>configured?client:null}}).default;
}
export const organizationPage=load('../src/app/portal/organization/[token]/page.tsx',{'react/jsx-runtime':jsx,'@/components/customer-document-entry':{CustomerDocumentEntry}}).default;
const roles=load('../src/lib/auth/roles.ts',{'@/lib/supabase/server':{createClient:()=>null}});
export const LoginForm=()=>null,AccessStatusShell=()=>null;
export function loginPage({user=null,userRoles=[],configured=true}={}){
 return load('../src/app/login/page.tsx',{'react/jsx-runtime':jsx,'lucide-react':{Leaf:icon},'next/navigation':{redirect},'@/components/access-status-shell':{AccessStatusShell},'@/components/portal-contact':{PortalContact},'@/lib/auth/roles':{...roles,getCurrentUserRolesFromClient:async()=>userRoles},'@/lib/data/access-requests':{getCurrentEmployeeAccessRequestFromClient:async()=>({data:null,error:null})},'@/lib/supabase/server':{createClient:async()=>configured?{auth:{getUser:async()=>({data:{user}})}}:null},'./LoginForm':{LoginForm},'@/lib/security/local-redirect':load('../src/lib/security/local-redirect.ts')}).default;
}

// Exercise the actual capability loaders against rows exported by a rollback-only
// installed local/staging SQL transaction. No network/provider transport here.
const tokens=load('../src/lib/portal/tokens.ts',{'server-only':{},'node:crypto':crypto});
export async function loadInstalledRecoveryCase(c){
 const queries=[];let telemetry=0;
 const db={from(table){
  const query={select(){return query;},eq(column,value){queries.push({table,column,value});return query;},is(){return query;},update(){assert.equal(table,'change_order_portal_tokens');telemetry++;return query;},maybeSingle:async()=>({data:c.token??null,error:null}),single:async()=>({data:c.record??null,error:null}),then(resolve){resolve({data:null,error:null});}};
  assert.ok([c.kind+'_portal_tokens',c.kind==='quote'?'quotes':c.kind==='invoice'?'invoices':'change_orders'].includes(table));return query;
 }};
 const deps={'server-only':{},'@/lib/email/delivery-commands':{callDeliveryCommand:async(client,name,args)=>{assert.equal(client,db);assert.equal(name,'get_change_order_portal_review');assert.equal(args.p_token_hash,tokens.hashPortalToken(c.rawToken));return{data:c.review??null,error:null};}},'@/lib/supabase/server':{createClient:()=>null},'@/lib/supabase/admin':{getServiceRoleClient:()=>db},'@/lib/portal/tokens':tokens,'@/lib/portal/urls':{getPortalUrl:()=>{throw Error('Recovery must not generate links');}},'@/lib/security/errors':{safeStaffMessage:x=>x}};
 let result;
 if(c.kind==='quote')result=await load('../src/lib/data/portal-quote.ts',deps).getQuoteByPortalToken(c.rawToken);
 else if(c.kind==='invoice')result=await load('../src/lib/data/portal-invoice.ts',{...deps,'@/lib/portal/invoice-token-errors':load('../src/lib/portal/invoice-token-errors.ts')}).getInvoiceByPortalToken(c.rawToken);
 else result=await load('../src/lib/data/change-orders.ts',deps).getChangeOrderByPortalToken(c.rawToken);
 return{result,queries,telemetry};
}
