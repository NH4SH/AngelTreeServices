// Isolated experiment only. This does not implement a production lease authority.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
assert.equal(process.env.HOME_CANDIDATE_TEST,'1');
assert.equal(hostname(),'lima-ats-crm-candidate-20261027');
assert.equal(process.getuid(),501); process.umask(0o077);
const root=process.env.HOME+'/candidate';
const config=JSON.parse(readFileSync(root+'/environment.private.json'));
assert.match(config.id,/^ats_candidate_[a-f0-9]{12}$/);
const env={HOME:process.env.HOME,PATH:'/usr/bin:/bin',DOCKER_HOST:'unix:///run/user/501/docker.sock'};
const database='ats_crm_candidate_20261027-db-1', app='ats_crm_candidate_20261027-app-1';
const loginPassword=randomBytes(32).toString('hex');
const report={syntheticOnly:true,checks:[],productionChanged:false,productionReady:false,externalLeaseAuthorityInstalled:false};
const save=()=>writeFileSync(root+'/native-fence-report.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
function docker(args,input) {return spawnSync('/usr/bin/docker',args,{env,input,encoding:'utf8',timeout:45000,maxBuffer:1024*1024});}
function sql(source,user='supabase_admin',expected=true){const api=user==='candidate_fence_api';const r=spawnSync('/usr/bin/docker',['exec','-i',...(api?['-e','PGPASSWORD']:[]),database,'psql',...(api?['-h','127.0.0.1']:[]),'-X','-Atq','-U',user,'-d','postgres','-v','ON_ERROR_STOP=1'],{env:{...env,...(api?{PGPASSWORD:loginPassword}:{})},input:source,encoding:'utf8',timeout:45000,maxBuffer:1024*1024});if(expected)assert.equal(r.status,0,r.stderr);else{assert.notEqual(r.status,0);assert.match(r.stderr,/CRM writes are temporarily unavailable|Operator required/);}return r.stdout.trim();}
function check(name,fn){fn();report.checks.push({name,passed:true});save();console.log(name+': passed');}
const lease=()=>sql("select hosting_guard.accept_rehearsal_lease(1,'synthetic-home',clock_timestamp(),clock_timestamp()+interval '20 seconds',clock_timestamp()-interval '1 minute');");
const resuming=process.env.HOME_CANDIDATE_FENCE_RESUME==='1';
if(!resuming){
assert.equal(sql("select to_regnamespace('hosting_guard') is null;"),'t','Refuse reinstalling over an existing fence experiment.');
sql(`create role candidate_fence_api login nosuperuser noinherit nocreatedb nocreaterole noreplication nobypassrls;
  create table public.candidate_fence_fixture(id integer primary key);
  alter table public.candidate_fence_fixture owner to postgres;
  alter table public.candidate_fence_fixture enable row level security;
  create policy candidate_fence_fixture_access on public.candidate_fence_fixture to candidate_fence_api using(true) with check(true);
  grant usage on schema public to candidate_fence_api;
  grant select,insert,update,delete,truncate on public.candidate_fence_fixture to candidate_fence_api;
  create function public.candidate_fence_definer(p_id integer) returns void language sql security definer set search_path='' as 'insert into public.candidate_fence_fixture values(p_id)';
  alter function public.candidate_fence_definer(integer) owner to postgres;
  revoke all on function public.candidate_fence_definer(integer) from public,anon,authenticated,service_role;
  grant execute on function public.candidate_fence_definer(integer) to candidate_fence_api;`);
sql(readFileSync(new URL('./candidate-write-fence.sql',import.meta.url),'utf8'));
}else{
  assert.equal(sql('select count(*) from public.candidate_fence_fixture;'),'0','Resume is permitted only before the first successful fixture write.');
}
sql(`alter role candidate_fence_api login password '${loginPassword}';`);
try {
  check('Independent database login remains subject to cold-start fencing',()=>{
    assert.equal(sql('select session_user;','candidate_fence_api'),'candidate_fence_api');
    sql('insert into public.candidate_fence_fixture values(1);','candidate_fence_api',false);
  });
  check('Current lease permits the same narrowly authorized login',()=>{lease();sql('insert into public.candidate_fence_fixture values(1);','candidate_fence_api');});
  check('Expired lease blocks SECURITY DEFINER business writes',()=>{
    sql("update hosting_guard.state set expires_at=clock_timestamp()-interval '1 second';");
    sql('select public.candidate_fence_definer(2);','candidate_fence_api',false);
  });
  check('Lease expiry before deferred transaction completion rolls back its rows',()=>{
    lease();sql("update hosting_guard.state set expires_at=clock_timestamp()+interval '1 second';");
    sql('begin;insert into public.candidate_fence_fixture values(3);select pg_sleep(1.4);commit;','candidate_fence_api',false);
    assert.equal(sql('select count(*) from public.candidate_fence_fixture where id=3;'),'0');
  });
  check('Database restart identity and stale backup proof both close writes',()=>{
    lease();sql("update hosting_guard.state set database_started_at=database_started_at-interval '1 second';");
    sql('insert into public.candidate_fence_fixture values(4);','candidate_fence_api',false);
    lease();sql("update hosting_guard.state set capture_started_at=clock_timestamp()-interval '6 minutes';");
    sql('insert into public.candidate_fence_fixture values(4);','candidate_fence_api',false);
  });
  check('TRUNCATE is refused even when the application login has table privilege',()=>{lease();sql('truncate public.candidate_fence_fixture;','candidate_fence_api',false);});
  check('Actual GoTrue and PostgREST service writes fail closed with no live lease',()=>{
    sql("update hosting_guard.state set expires_at=clock_timestamp()-interval '1 second';");
    const program=`const base=process.env.NEXT_PUBLIC_SUPABASE_URL,headers={apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'content-type':'application/json'};const results=[];for(const [path,body] of [['/rest/v1/customers',{display_name:'Synthetic fence rejected'}],['/auth/v1/admin/users',{email:'fence-rejected@example.invalid',password:'synthetic-fixture-only-very-long-password',email_confirm:true}]]){const r=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});results.push({path,status:r.status});if(r.ok)throw Error('A fenced service write succeeded');await r.body?.cancel();}console.log(JSON.stringify(results));`;
    const r=docker(['exec',app,'node','--input-type=module','-e',program]);assert.equal(r.status,0,r.stderr);
    report.httpServiceDenials=JSON.parse(r.stdout.trim());
    assert.equal(sql("select count(*) from auth.users where email='fence-rejected@example.invalid';"),'0');
    assert.equal(sql("select count(*) from public.customers where display_name='Synthetic fence rejected';"),'0');
  });
  // Deferred constraint triggers can be forced to run early by a SQL client.
  // Record this limitation as a release blocker, not a proof of safe failover.
  check('Known immediate-constraint limitation is reproduced and held as a release blocker',()=>{
    lease();sql("update hosting_guard.state set expires_at=clock_timestamp()+interval '1 second';");
    sql('begin;set constraints all immediate;insert into public.candidate_fence_fixture values(90);select pg_sleep(1.4);commit;','candidate_fence_api');
    assert.equal(sql('select count(*) from public.candidate_fence_fixture where id=90;'),'1');
    report.knownLimitations=['A SQL client may force deferred triggers to run early; transaction draining/termination and external fencing are still required.','This local rehearsal accepts operator-supplied lease facts; no independently verified offsite backup or external single-writer authority is active.','Provider calls and Storage file bytes need separate admission and drain barriers.'];
  });
  report.passed=true;
} catch(error){report.passed=false;report.error=String(error.message).slice(0,1500);throw error;}
finally{sql("update hosting_guard.state set expires_at=clock_timestamp()-interval '1 second';alter role candidate_fence_api nologin;");report.leftFenced=true;save();}
console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,leftFenced:true,productionReady:false}));
