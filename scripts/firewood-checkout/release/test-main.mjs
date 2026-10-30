import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProductionDescriptor,runtime} from './main.mjs';
import {LIVE_HANDOFF_SOURCE,LIVE_HANDOFF_ENVIRONMENT,LIVE_ACCOUNT} from '../live/live-contract.mjs';
const descriptor=()=>({version:1,profile:'production-live',sourceId:LIVE_HANDOFF_SOURCE,environmentId:LIVE_HANDOFF_ENVIRONMENT,accountId:LIVE_ACCOUNT,mode:'live',
  origin:'https://checkout.angeltreeservices.org',listenPort:3000,database:{host:'db',port:5432},roles:{web:'ats_firewood_request',worker:'ats_firewood_worker'},
  binding:{profile:'production-live',database:'postgres',schema:'app_private'},gates:{orders:false,preparation:false,collection:false,customerSending:false,ownerSending:false,workers:false}});
test('production entrypoint requires exact fixed profile, merchant, roles, private transport and independent gates',()=>{
 const good=descriptor();assert.equal(validateProductionDescriptor(good,'web').roleName,good.roles.web);
 for(const change of [{accountId:'acct_other'},{mode:'test'},{profile:'acceptance-qa'},{origin:'https://foreign.invalid'},{database:{host:'db',port:5433}},{roles:{web:'service_role',worker:'service_role'}},{gates:{...good.gates,collection:true}},{gates:{...good.gates,customerSending:true}},{binding:{...good.binding,schema:'public'}}])assert.throws(()=>validateProductionDescriptor({...good,...change},'web'));
 assert.throws(()=>validateProductionDescriptor(good,'migrate'));
});
test('no mounted root admission means no runtime binding despite activation-looking environment flags',async()=>{
 const previous=process.env.FIREWOOD_ENABLED;process.env.FIREWOOD_ENABLED='1';
 try{await assert.rejects(runtime('web'));}finally{if(previous===undefined)delete process.env.FIREWOOD_ENABLED;else process.env.FIREWOOD_ENABLED=previous;}
});
