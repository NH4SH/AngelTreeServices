import assert from 'node:assert/strict';import test from 'node:test';import{load}from'./pr10-test-helpers.mjs';import{calendarWorkerReadiness,renewalAcknowledged}from'../src/lib/operations.ts';import{timingSafeEqual}from'node:crypto';
test('renewal acknowledgement requires the exact request, reviewed selection and nonnegative integer totals',()=>{
 const valid={request_id:'request',reviewed_count:2,created_count:1,existing_count:1};assert.equal(renewalAcknowledged(valid,'request',2),true);
 for(const patch of [{request_id:'other'},{reviewed_count:3},{created_count:-1},{created_count:0},{existing_count:'1'},{existing_count:0.5}])assert.equal(renewalAcknowledged({...valid,...patch},'request',2),false);
 for(const value of [null,{},[],false])assert.equal(renewalAcknowledged(value,'request',2),false);
});
test('worker readiness exposes booleans and rejects missing, weak or reused worker scopes',()=>{
 const env={GOOGLE_CALENDAR_WORKER_SECRET:'calendar-local-only-'.repeat(3)};
 assert.deepEqual(calendarWorkerReadiness(env,true,true),{oauth:true,canonical:true,worker:true,ready:true});
 for(const [e,oauth,canonical] of [[{},true,true],[{GOOGLE_CALENDAR_WORKER_SECRET:'short'},true,true],[{...env,COMMUNICATION_WORKER_SECRET:env.GOOGLE_CALENDAR_WORKER_SECRET},true,true],[{...env,SYSTEM_HEALTH_MONITOR_SECRET:env.GOOGLE_CALENDAR_WORKER_SECRET},true,true],[env,false,true],[env,true,false]])assert.equal(calendarWorkerReadiness(e,oauth,canonical).ready,false);
 assert.equal(JSON.stringify(calendarWorkerReadiness(env,true,true)).includes(env.GOOGLE_CALENDAR_WORKER_SECRET),false);
});
test('actual Calendar worker route refuses bad auth and incomplete configuration before claiming',async t=>{
 const old=process.env.GOOGLE_CALENDAR_WORKER_SECRET;process.env.GOOGLE_CALENDAR_WORKER_SECRET='local-worker-only-'.repeat(3);t.after(()=>old===undefined?delete process.env.GOOGLE_CALENDAR_WORKER_SECRET:process.env.GOOGLE_CALENDAR_WORKER_SECRET=old);
 let calls=0;const route=load('../src/app/api/internal/integrations/google-calendar/process/route.ts',{'node:crypto':{timingSafeEqual},'@/lib/integrations/google-calendar/service':{processGoogleCalendarSyncQueue:async()=>{calls++;return{claimed:0,completed:0,failed:0};}},'@/lib/operations':{calendarWorkerReadiness},'@/lib/integrations/google-calendar/config':{getGoogleCalendarConfiguration:()=>({configured:false,appBaseUrl:null})}});
 assert.equal((await route.POST(new Request('http://127.0.0.1/local',{method:'POST'}))).status,401);
 assert.equal((await route.POST(new Request('http://127.0.0.1/local',{method:'POST',headers:{authorization:'Bearer '+process.env.GOOGLE_CALENDAR_WORKER_SECRET}}))).status,503);assert.equal(calls,0);
});
