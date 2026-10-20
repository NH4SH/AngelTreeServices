import assert from 'node:assert/strict';
import test from 'node:test';
import * as crypto from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {load} from './pr10-test-helpers.mjs';

const enabled=process.env.DASHBOARD_READS_DISPOSABLE==='1'&&Boolean(process.env.DASHBOARD_READS_LOCAL_STATUS_FILE);
test('dashboard employee lookups stay bounded with the retained local directory and live RLS',{skip:!enabled,timeout:180000},async t=>{
  const c=JSON.parse(readFileSync(process.env.DASHBOARD_READS_LOCAL_STATUS_FILE,'utf8'));
  assert.equal(c.API_URL,'http://127.0.0.1:54321');
  const originalFetch=globalThis.fetch,requests=[],actors=[],proof=[];let blocked=0;
  const localFetch=async(input,init)=>{
    const url=new URL(input instanceof Request?input.url:input);
    if(url.origin!==c.API_URL){blocked++;throw Error('Non-local dashboard test request blocked');}
    const r=await originalFetch(input,init);
    requests.push({path:url.pathname,length:url.href.length,status:r.status});return r;
  };
  const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:localFetch}};
  const service=createClient(c.API_URL,c.SERVICE_ROLE_KEY,opts),marker='DASHBOARD_READS_LOCAL_'+crypto.randomUUID();
  const ok=r=>{assert.ifError(r.error&&new Error(r.error.code+': '+r.error.message));return r.data;};
  t.after(async()=>{
    try{for(const a of actors)if(a.auth)ok(await a.auth.auth.signOut({scope:'global'}));}
    finally{
      if(actors.length){
        ok(await service.from('profiles').update({status:'disabled'}).in('id',actors.map(a=>a.id)));
        ok(await service.from('employee_records').update({is_active:false,employment_status:'separated'}).in('auth_user_id',actors.map(a=>a.id)));
        const retired=ok(await service.from('profiles').select('status').in('id',actors.map(a=>a.id)));
        assert.equal(retired.length,actors.length);assert.ok(retired.every(p=>p.status==='disabled'));
      }
      assert.equal(blocked,0);
      if(process.env.DASHBOARD_READS_RESULTS_FILE)writeFileSync(process.env.DASHBOARD_READS_RESULTS_FILE,JSON.stringify({marker,proof,actorsRetired:actors.length,blockedOutbound:blocked},null,2)+'\n',{mode:0o600});
    }
  });
  async function actor(role){
    const password=crypto.randomUUID()+crypto.randomUUID();
    const u=ok(await service.auth.admin.createUser({email:marker.toLowerCase()+'-'+role+'@example.invalid',password,email_confirm:true})).user;
    const a={id:u.id,role};actors.push(a);
    ok(await service.from('profiles').update({status:'active'}).eq('id',u.id));
    a.employeeId=ok(await service.from('employee_records').insert({auth_user_id:u.id,legal_name:marker+' '+role,is_active:true,employment_status:'active'}).select('id').single()).id;
    const r=ok(await service.from('roles').select('id').eq('name',role).single());ok(await service.from('user_roles').insert({user_id:u.id,role_id:r.id}));
    ok(await service.from('time_clock_permissions').upsert({user_id:u.id,is_enabled:true}));
    a.auth=createClient(c.API_URL,c.ANON_KEY,opts);
    a.jwt=ok(await a.auth.auth.signInWithPassword({email:u.email,password})).session.access_token;
    a.client=createClient(c.API_URL,c.ANON_KEY,{...opts,global:{fetch:localFetch,headers:{authorization:'Bearer '+a.jwt}}});
    return a;
  }
  const deps=client=>({
    'server-only':{},'@/lib/files/private-file-links':load('../src/lib/files/private-file-links.ts',{'server-only':{}}),
    '@/lib/employee-presentation':load('../src/lib/employee-presentation.ts'),
    '@/lib/auth/roles':load('../src/lib/auth/roles.ts',{'@/lib/supabase/server':{createClient:async()=>client}}),
    '@/lib/supabase/server':{createClient:async()=>client},'@/lib/security/errors':load('../src/lib/security/errors.ts',{'node:crypto':crypto}),
    '@/lib/business-time':load('../src/lib/business-time.ts'),
  });
  const module=client=>load('../src/lib/data/employees.ts',deps(client));
  const run=(name,fn)=>t.test(name,async()=>{proof.push({name,...await fn(),pass:true});});
  const office=[];for(const role of ['owner','admin','payroll_admin','estimator'])office.push(await actor(role));
  for(const a of office)await run(a.role+': complete directory and dashboard retain rows beyond the original URI limit',async()=>{
    const expected=ok(await a.client.rpc('get_employee_operational_directory')).employees;
    assert.ok(expected.length>1000,'Use the retained scale-test stack; do not reset it to hide the original failure');
    requests.length=0;const employees=await module(a.client).getEmployees();assert.equal(employees.error,null);
    assert.deepEqual(employees.data.map(e=>e.id),expected.map(e=>e.id));
    const own=employees.data.find(e=>e.id===a.employeeId);assert.ok(own);assert.ok(own.roleNames.includes(a.role));assert.equal(own.timeClockState,'enabled');
    const accountRequests=requests.filter(r=>['profiles','user_roles','time_clock_permissions'].some(name=>r.path==='/rest/v1/'+name));
    assert.ok(accountRequests.length>3);assert.ok(accountRequests.every(r=>r.status===200&&r.length<5000));
    const dashboard=await module(a.client).getEmployeeDashboardSummary();assert.equal(dashboard.error,null);assert.ok(dashboard.data.missingTraining.length<=20);
    return {visibleEmployees:employees.data.length,accountRequests:accountRequests.length,maxRequestLength:Math.max(...accountRequests.map(r=>r.length))};
  });
  await run('crew, customer and anonymous readers gain no staff directory through the batching change',async()=>{
    for(const role of ['crew','customer']){
      const a=await actor(role);requests.length=0;const result=await module(a.client).getEmployees();assert.equal(result.data.length,0);
      assert.equal(requests.filter(r=>['/rest/v1/profiles','/rest/v1/user_roles','/rest/v1/time_clock_permissions'].includes(r.path)).length,0);
    }
    const result=await module(createClient(c.API_URL,c.ANON_KEY,opts)).getEmployees();assert.equal(result.data.length,0);assert.ok(result.error);
    return {restrictedRoles:3};
  });
  await run('a real middle-query failure stays visible without dropping the directory or granting clock access',async()=>{
    const owner=office[0],expected=ok(await owner.client.rpc('get_employee_operational_directory')).employees;
    let profiles=0,failed=false;
    const fetcher=async(input,init)=>{
      const url=new URL(input instanceof Request?input.url:input);
      assert.equal(url.origin,c.API_URL);
      if(url.pathname==='/rest/v1/profiles'&&++profiles===2){failed=true;return Response.json({message:'Synthetic lookup unavailable',code:'XX001'},{status:400});}
      return localFetch(input,init);
    };
    const client=createClient(c.API_URL,c.ANON_KEY,{...opts,global:{fetch:fetcher,headers:{authorization:'Bearer '+owner.jwt}}});
    const result=await module(client).getEmployees();assert.equal(failed,true);assert.match(result.error,/Synthetic lookup unavailable/);
    assert.equal(result.data.length,expected.length);assert.ok(result.data.filter(e=>e.is_active&&e.auth_user_id).every(e=>e.timeClockState!=='enabled'));
    assert.ok(profiles>2);return {injectedReadFailures:1};
  });
  await run('same issued estimator token loses directory access on deactivation and returns without clock permission',async()=>{
    const owner=office[0],estimator=office.at(-1),args={p_employee_id:estimator.employeeId,p_status:'inactive',p_reason:marker};
    ok(await owner.client.rpc('set_employee_access_status',args));
    assert.equal((await module(estimator.client).getEmployees()).data.length,0);
    assert.equal(ok(await estimator.client.rpc('has_effective_platform_access')),false);
    ok(await owner.client.rpc('set_employee_access_status',{...args,p_status:'active'}));
    const result=await module(estimator.client).getEmployees();assert.equal(result.error,null);
    const own=result.data.find(e=>e.id===estimator.employeeId);assert.equal(own.timeClockState,'disabled');assert.ok(own.roleNames.includes('estimator'));
    return {originalJwtRechecked:true};
  });
});
