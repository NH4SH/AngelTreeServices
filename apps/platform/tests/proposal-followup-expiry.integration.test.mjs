import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';

test('proposal follow-up deadlines at native concurrent admission',{
  skip:process.env.FOLLOWUP_EXPIRY_DISPOSABLE !== '1', timeout:45000,
},async t => {
  const e = JSON.parse(readFileSync(process.env.FOLLOWUP_EXPIRY_ENV_FILE));
  assert.match(e.projectId,/^ats_followup_[a-f0-9]{12}$/);
  assert.equal(e.container,'supabase_db_'+e.projectId);
  assert.equal(e.createdThisTask,true);
  assert.equal(e.api,'http://127.0.0.1:61021');
  assert.equal(e.databasePort,61022);
  assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
  const docker = process.env.FOLLOWUP_EXPIRY_DOCKER_BIN;
  assert.ok(docker);
  const args = ['exec','-i',e.container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'];
  function sql(source) {
    const r = spawnSync(docker,args,{env:process.env,input:source,encoding:'utf8',timeout:15000});
    assert.equal(r.status,0,r.stderr);
    return r.stdout.trim();
  }
  function pending(source) {
    const p = spawn(docker,args,{env:process.env});
    let out = '',err = '';
    p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);
    const done = new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',code=>resolve({code,out:out.trim(),err}));});
    p.stdin.end(source);
    return done;
  }
  async function hold(id,recipient) {
    const p = spawn(docker,args,{env:process.env});
    let out = '';
    const done = new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('Owned lock session failed')));});
    const ready = new Promise(resolve=>p.stdout.on('data',b=>{out+=b;const m=out.match(/FOLLOWUP_LOCK:(\d+)/);if(m)resolve(Number(m[1]));}));
    p.stdin.write(recipient
      ? `begin;select pg_advisory_xact_lock(143,hashtext('${recipient}/quote_follow_up'));select 'FOLLOWUP_LOCK:'||pg_backend_pid();\n`
      : `begin;select id from public.quotes where id='${id}' for update;select 'FOLLOWUP_LOCK:'||pg_backend_pid();\n`);
    return {pid:await ready,release:async()=>{p.stdin.end('commit;\n');await done;}};
  }
  const setup = readFileSync(new URL('../../../supabase/verification/proposal_followup_expiry.sql',import.meta.url),'utf8').split('-- APPLY_FOLLOWUP_EXPIRY_CANDIDATE_HERE')[0];
  const seed = duration => JSON.parse(sql(setup+`select pg_temp.followup_expiry_seed(clock_timestamp()+interval '${duration}');commit;`));
  const claim = id => `begin;set local role service_role;select set_config('request.jwt.claim.sub','',true);select set_config('request.jwt.claims','{"role":"service_role"}',true);select coalesce(public.claim_outbound_delivery('${id}')::text,'NO_CLAIM');commit;`;
  const proof = [];
  for (const lockKind of ['quote','family']) await t.test(lockKind+' lock wait crossing the deadline rejects without starting a provider attempt',async()=>{
    const f = seed('3 seconds'),lock = await hold(f.quote,lockKind==='family'?f.payload.to[0]:null);
    const attempt = pending(claim(f.delivery));
    let observed = false;
    try {
      for (let i=0;i<60;i++) {
        if (Number(sql(`select count(*)from pg_stat_activity where ${lock.pid}=any(pg_blocking_pids(pid))`))>0) { observed=true;break; }
        await new Promise(r=>setTimeout(r,30));
      }
      assert.equal(observed,true,'Admission must actually wait on the source lock');
      while (sql(`select expires_at<=clock_timestamp()from public.quotes where id='${f.quote}'`)!=='t') await new Promise(r=>setTimeout(r,60));
    } finally { await lock.release(); }
    const result = await attempt;
    assert.equal(result.code,0,result.err);
    assert.match(result.out,/NO_CLAIM/);
    assert.equal(sql(`select state||':'||attempt_count from app_private.outbound_deliveries where id='${f.delivery}'`),'cancelled:0');
    assert.equal(sql(`select count(*)from public.email_events where related_quote_id='${f.quote}'`),'0');
    proof.push({scenario:'observed-'+lockKind+'-lock-wait-crosses-expiry',passed:true,providerAttempts:0});
  });
  await t.test('two competing claims before expiry retain exactly one native attempt',async()=>{
    const f = seed('1 day'),results = await Promise.all([pending(claim(f.delivery)),pending(claim(f.delivery))]);
    results.forEach(r=>assert.equal(r.code,0,r.err));
    assert.equal(results.filter(r=>!r.out.includes('NO_CLAIM')).length,1);
    assert.equal(sql(`select count(*)from app_private.outbound_delivery_attempts where delivery_id='${f.delivery}'`),'1');
    assert.equal(sql(`select count(*)from public.email_events where related_quote_id='${f.quote}'`),'0');
    proof.push({scenario:'two-competing-claims',passed:true,nativeAttempts:1,realProviderCalls:0});
  });
  if (process.env.FOLLOWUP_EXPIRY_RESULTS_FILE) writeFileSync(process.env.FOLLOWUP_EXPIRY_RESULTS_FILE,JSON.stringify({proof,realProviderCalls:0,productionChanged:false},null,2)+'\n',{mode:0o600});
});
