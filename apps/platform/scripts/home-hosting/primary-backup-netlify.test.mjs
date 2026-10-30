import {test} from 'node:test';import assert from 'node:assert/strict';import {primaryBackupHandler} from './primary-backup-netlify.mjs';
const settings={projectRef:'nbsvdzscgfpabbbdwlob',namespace:'ats-home-continuous-abcdef123456'};
test('the primary cloud adapter cannot be redirected to production, staging or a rehearsal scope',()=>{
 for(const projectRef of ['ddvlnixdugcbnrewktes','gbyhdsuiqeslgjdnbqng','axopsuifavowlrywfelh'])assert.throws(()=>primaryBackupHandler({...settings,projectRef}));
 assert.throws(()=>primaryBackupHandler({...settings,namespace:'ats-rehearsal-continuous-abcdef123456'}));
});
test('unsupported runtimes and missing authorization cannot reach any cloud credentials or data',async()=>{
 let calls=0;const handler=primaryBackupHandler({...settings,getEnv:()=>undefined,fetchImpl:async()=>{calls++;throw Error('unexpected');}});
 assert.equal((await handler(new Request('https://example.invalid',{method:'GET'}))).status,405);
 const r=await handler(new Request('https://example.invalid',{method:'POST',body:'{}'}));assert.ok([401,503].includes(r.status));assert.equal(calls,0);
});
