// One-shot signed authorization for SYNTHETIC recovery checks. It is not a live
// lease service or permission to make a cloud copy writable in production.
import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{spawnSync}from'node:child_process';import{CandidateIO,literal,identifier}from'./candidate-io.mjs';import{verifyProof,promotionProblems,admissionProblems}from'./failover-proof.mjs';
const io=new CandidateIO(),target=JSON.parse(readFileSync(io.folder+'/target-verification.json')),capture=JSON.parse(readFileSync(io.folder+'/capture-proof.json')),fence=JSON.parse(readFileSync(io.folder+'/hard-fence-receipt.json')),offsite=JSON.parse(readFileSync(io.folder+'/offsite-verification.json'));
const envelope=JSON.parse(readFileSync(io.folder+'/authorization.json')),publicKey=readFileSync(io.folder+'/authority-public.pem');const permit=verifyProof(envelope,publicKey,{kind:'rehearsal-verify',namespace:io.namespace,minimumGeneration:fence.generation+1});
const baseline=JSON.parse(readFileSync(io.folder+'/admission-baseline-proof.json')),baselineOffsite=JSON.parse(readFileSync(io.folder+'/baseline-offsite-verification.json'));
assert.deepEqual(promotionProblems({fence,capture,offsite,target,permit}),[]);assert.equal(target.project,'ats_crm_recovery_'+io.id);
assert.deepEqual(admissionProblems({baseline,offsite:baselineOffsite,target,permit}),[]);
for(const c of fence.containers){const current=io.inspect(io.project+'-'+c.service+'-1');assert.equal(current.Id,c.id);assert.equal(current.State.Running,false);assert.equal(current.HostConfig.RestartPolicy.Name,'no');}
assert.equal(io.inspect(target.container).Id,target.id);writeFileSync(io.folder+'/authorization-consumed-'+permit.generation+'.json',JSON.stringify({at:new Date().toISOString(),generation:permit.generation,targetId:target.id}),{mode:0o600,flag:'wx'});
const from=io.folder+'/offsite-restored-capture',manifest=JSON.parse(readFileSync(from+'/manifest.private.json')),compose=['compose','--env-file',io.folder+'/recovered-stack/core.private.env','-f',io.folder+'/recovered-stack/compose.json'];
const sql=q=>io.sql(q,{container:target.container});let report={passed:false,namespace:io.namespace,productionChanged:false,managedDatabase:false,productionScheduleEnabled:false};
try{
  sql("select hosting_guard.enroll_tables();update hosting_guard.state set local_node='synthetic-recovery';");
  const lease=()=>{assert.deepEqual(admissionProblems({baseline,offsite:baselineOffsite,target,permit}),[]);return sql(`with lease_clock as materialized(select clock_timestamp() as lease_at) select hosting_guard.accept_rehearsal_lease(${permit.generation},'synthetic-recovery',lease_at,lease_at+interval '29 seconds',${literal(baseline.captureStartedAt)}::timestamptz) from lease_clock;`);};
  // Use the actual independently recovered fresh capture's start. This bounded
  // test still does not install an unattended two-minute production backup loop.
  lease();for(const r of manifest.roles.filter(r=>r.rolcanlogin&&!['postgres','supabase_admin'].includes(r.rolname)))sql('alter role '+identifier(r.rolname)+' login;');
  io.docker([...compose,'up','-d','--wait','--wait-timeout','120','app']);lease();
  const app=target.project+'-app-1';
  const tar=spawnSync('/usr/bin/tar',['-cf','-','-C',io.root+'/http-test-context','.'],{env:io.env,maxBuffer:24*1024*1024});assert.equal(tar.status,0);assert.ok(tar.stdout.length<24*1024*1024);
  io.docker(['exec','-i',app,'sh','-c','mkdir -p /tmp/candidate-test && tar --no-same-owner -xf - -C /tmp/candidate-test'],{input:tar.stdout});
  const result=spawnSync('/usr/bin/docker',['exec','-i','-e','HOME_FAILOVER_REHEARSAL=1','-e','ATS_RECOVERY_FIXTURE',app,'node','--input-type=module','-'],{env:{...io.env,ATS_RECOVERY_FIXTURE:readFileSync(from+'/fixture.private.json','utf8')},input:readFileSync(new URL('./recovered-http-checks.mjs',import.meta.url)),encoding:'utf8',timeout:23000,maxBuffer:4*1024*1024});
  writeFileSync(io.folder+'/recovered-http.private.log',(result.stdout??'')+'\n'+(result.stderr??''),{mode:0o600});assert.equal(result.status,0,'Recovered HTTP checks failed; inspect the private log.');
  report={...report,...JSON.parse(io.docker(['exec',app,'cat','/tmp/recovered-http-report.json'])),sourceStillStopped:!io.inspect(io.db).State.Running,permitConsumed:true};assert.equal(report.sourceStillStopped,true);
}finally{
  const fixture=JSON.parse(readFileSync(from+'/fixture.private.json'));
  sql(`update hosting_guard.state set expires_at=clock_timestamp()-interval '1 second';update public.profiles set status='disabled' where id=${literal(fixture.userId)};update public.employee_records set is_active=false,employment_status='separated' where auth_user_id=${literal(fixture.userId)};update auth.users set banned_until=clock_timestamp()+interval '100 years' where id=${literal(fixture.userId)};`);
  const roles=JSON.parse(sql("select coalesce(jsonb_agg(rolname),'[]') from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');"));for(const role of roles)sql('alter role '+identifier(role)+' nologin;');
  sql("select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and usename not in('postgres','supabase_admin') and pid<>pg_backend_pid();");
  const ids=io.docker(['ps','-a','--filter','label=com.docker.compose.project='+target.project,'--format','{{.ID}}']).trim().split('\n').filter(Boolean);if(ids.length)io.docker(['stop','--time','2',...ids]);
  report.targetStopped=!io.inspect(target.container).State.Running;report.leftFenced=true;io.json('recovered-runtime-report.json',report);
}
console.log(JSON.stringify({passed:report.passed,checks:report.checks?.length,sourceStopped:true,targetStopped:report.targetStopped,managedDatabase:false,productionChanged:false}));
