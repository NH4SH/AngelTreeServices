import assert from 'node:assert/strict';
import {load,memoryDB} from './pr10-test-helpers.mjs';

export const settingValues={singleton:true,automated_sending_enabled:false,business_timezone:'America/New_York',
  minimum_send_interval_hours:24,estimate_confirmation_enabled:true,estimate_reminder_enabled:true,estimate_reminder_hours_before:24,
  work_confirmation_enabled:true,work_reminder_enabled:true,work_reminder_hours_before:24,quote_follow_up_enabled:true,
  quote_first_follow_up_days:3,quote_second_follow_up_days:7,invoice_reminder_enabled:true,invoice_first_reminder_days:3,
  invoice_second_reminder_days:10,payment_confirmation_enabled:true,appointment_change_notices_enabled:false,
  created_at:'2026-10-20T12:00:00.000000+00:00',updated_at:'2026-10-23T12:00:00.000000+00:00'};
export function settingsForm(settings=settingValues){
  const form=new FormData();
  for(const [key,value]of Object.entries(settings)) {
    if(['singleton','created_at','updated_at'].includes(key))continue;
    if(typeof value==='boolean'){if(value)form.set(key,'1');}else form.set(key,String(value));
  }
  form.set('expected_updated_at',settings.updated_at);return form;
}
export function settingsSaveActions(db,options={}) {
  const revalidated=[],roles=load('../src/lib/auth/roles.ts',{'@/lib/supabase/server':{createClient:async()=>db}});
  const actions=load(options.actionsFile??'../src/lib/actions/communications.ts',{
    'next/cache':{revalidatePath:path=>revalidated.push(path)},'@/lib/business-time':{},
    '@/lib/communications/processor':{processCommunicationById:()=>assert.fail('Settings cannot send'),processDueCommunications:()=>assert.fail('Settings cannot run workers')},
    '@/lib/auth/roles':roles,'@/lib/supabase/server':{createClient:async()=>{if(options.clientThrows)throw Error('PRIVATE_SYNTHETIC_CLIENT');return options.noClient?null:db;}},
    '@/lib/security/errors':{safeStaffMessage:x=>x},'@/lib/payments/invoice-payment-state':{},
  });
  return {actions,revalidated,save:form=>actions.updateCommunicationSettings({status:'idle',message:''},form)};
}
export function settingsSaveFixture(options={}) {
  const row={...settingValues,...options.row},tables={communication_settings:options.missing?[]:[row],
    user_roles:(options.roles??['owner']).map(name=>({user_id:'synthetic-settings-owner',roles:{name}}))};
  const db=memoryDB(tables,{zero:()=>Boolean(options.zero),fail:()=>options.writeError?'error':options.writeThrows?'throw':null});
  db.auth={getUser:async()=>({data:{user:options.anonymous?null:{id:'synthetic-settings-owner'}},error:null})};
  db.rpc=async name=>{assert.equal(name,'has_effective_platform_access');return{data:options.disabled?false:true,error:null};};
  const from=db.from.bind(db);let writes=0,issued=0;
  db.from=name=>{
    const q=from(name);if(name!=='communication_settings')return q;
    const update=q.update.bind(q),single=q.maybeSingle.bind(q),then=q.then.bind(q);let writing=false;
    q.update=values=>{writing=true;return update({...values,updated_at:new Date(Date.parse(settingValues.updated_at)+(++issued)).toISOString()});};
    async function finish(result){
      if(writing&&result.data&&(Array.isArray(result.data)?result.data.length:result.data.singleton)) {
        writes++;
      }
      if(options.lostAcknowledgement&&writes)return{data:null,error:{message:'PRIVATE_SYNTHETIC_ACK'}};
      if(options.badAcknowledgement&&writes)return{data:options.badAcknowledgement,error:null};
      if(options.dataAndError&&writes)return{data:result.data,error:{message:'PRIVATE_SYNTHETIC_ACK'}};
      return result;
    }
    q.maybeSingle=async()=>finish(await single());q.then=(resolve,reject)=>then(finish).then(resolve,reject);return q;
  };
  return {db,row,tables,get writes(){return writes;},...settingsSaveActions(db,options)};
}
