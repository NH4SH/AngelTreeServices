import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID, randomBytes} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createClient} from '@supabase/supabase-js';

const enabled = process.env.INVOICE_LINK_DISPOSABLE === '1' && Boolean(process.env.INVOICE_LINK_STATUS_FILE);
const exec = promisify(execFile);

test('atomic invoice link management through the authenticated API', {skip: !enabled, timeout: 180000}, async t => {
  const status = JSON.parse(readFileSync(process.env.INVOICE_LINK_STATUS_FILE));
  const environment = JSON.parse(readFileSync(process.env.INVOICE_LINK_ENV_FILE));
  assert.equal(status.API_URL, 'http://127.0.0.1:62421');
  assert.match(environment.container, /^supabase_db_ats_invlink_[a-f0-9]+$/);
  const docker = process.env.INVOICE_LINK_DOCKER_BIN || 'docker';
  const base = ['--host', process.env.DOCKER_HOST || 'unix:///var/run/docker.sock', 'exec', '-i', environment.container,
    'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  const sql = async query => (await exec(docker, [...base, '-c', query], {encoding: 'utf8', timeout: 30000})).stdout.trim();
  const lit = value => value == null ? 'null' : "'" + String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''") + "'";
  const ok = result => { assert.equal(result.error?.code ?? null, null, result.error?.message); return result.data; };
  const clientOptions = {auth: {persistSession: false, autoRefreshToken: false}};
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, clientOptions);
  const office = createClient(status.API_URL, status.ANON_KEY, clientOptions);
  const anonymous = createClient(status.API_URL, status.ANON_KEY, clientOptions);
  const proof = [];
  const email = 'invlink-' + randomUUID() + '@example.invalid';
  const password = randomBytes(30).toString('base64url');
  const actor = ok(await service.auth.admin.createUser({email, password, email_confirm: true})).user.id;
  let browserFixtureRetained = false;

  // Capability strings and recipients are synthetic. No provider transport is
  // imported; no email, payment provider or real upload is used.
  t.after(async () => {
    await office.auth.signOut();
    if (!browserFixtureRetained) await sql(`update profiles set status='disabled' where id=${lit(actor)};
      update employee_records set is_active=false,employment_status='separated' where auth_user_id=${lit(actor)}`);
    if (process.env.INVOICE_LINK_RESULTS_FILE) writeFileSync(process.env.INVOICE_LINK_RESULTS_FILE,
      JSON.stringify({proof, realProviderCalls: 0, productionChanged: false, browserFixtureRetained}, null, 2) + '\n', {mode: 0o600});
  });
  await sql(`update profiles set status='active' where id=${lit(actor)};
    insert into employee_records(auth_user_id,legal_name,is_active,employment_status) values(${lit(actor)},'Synthetic link reviewer',true,'active');
    insert into roles(name) values('owner') on conflict(name) do nothing;
    insert into user_roles(user_id,role_id) select ${lit(actor)},id from roles where name='owner'`);
  ok(await office.auth.signInWithPassword({email, password}));

  const run = (name, fn) => t.test(name, async () => { await fn(); proof.push({name, passed: true}); });
  const candidate = () => ({token_hash:randomBytes(32).toString('hex'),token_hint:'ABC123',token_encrypted:'v1.'+'A'.repeat(16)+'.'+'B'.repeat(58)+'.'+'C'.repeat(22),expires_at:new Date(Date.now()+86400000).toISOString()});
  async function fixture(){const id=randomUUID(),customer=randomUUID();await sql(`insert into customers(id,display_name,email)values(${lit(customer)},'Synthetic invoice link customer',${lit('invlink-'+customer+'@example.invalid')});insert into invoices(id,customer_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents)values(${lit(id)},${lit(customer)},${lit('INVLINK-'+id)},'sent',10000,10000,10000);insert into invoice_line_items(invoice_id,name,quantity,unit_price_cents,total_cents)values(${lit(id)},'Synthetic invoice scope',1,10000,10000)`);return{id,customer};}
  const state=async f=>ok(await office.rpc('get_invoice_link_state',{p_invoice_id:f.id}));
  const args=async(f,intent,tokenId=null)=>({p_request_id:randomUUID(),p_invoice_id:f.id,p_expected_version:(await state(f)).link_version,p_intent:intent,p_token_id:tokenId,p_candidate:intent==='revoke'?null:candidate()});
  const manage=a=>office.rpc('manage_invoice_portal_link',a);
  const identity=a=>{const{p_candidate,...i}=a;return i;};
  const count=f=>sql(`select count(*)from invoice_portal_tokens where invoice_id=${lit(f.id)} and revoked_at is null`);
  const snapshot=f=>sql(`select jsonb_build_object('invoice',(select to_jsonb(i)from invoices i where id=${lit(f.id)}),'payments',(select jsonb_agg(to_jsonb(p))from payments p where invoice_id=${lit(f.id)}),'checkout',(select jsonb_agg(to_jsonb(c))from invoice_checkout_sessions c where invoice_id=${lit(f.id)}))`);
  async function hold(invoice) {
    const process = spawn(docker, base);
    let output = '';
    const done = new Promise((resolve, reject) => {
      process.on('exit', code => code ? reject(Error('Synthetic lock session failed')) : resolve());
      process.on('error', reject);
    });
    const ready = new Promise(resolve => process.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('LOCK_READY:')) resolve(Number(/LOCK_READY:(\d+)/.exec(output)[1]));
    }));
    process.stdin.write(`begin;select id from invoices where id=${lit(invoice)} for update;select 'LOCK_READY:'||pg_backend_pid();\n`);
    return {
      pid: await ready,
      change: async query => {
        const marker = 'CHANGE_READY_' + randomUUID();
        const changed = new Promise((resolve, reject) => {
          const listener = chunk => { if (String(chunk).includes(marker)) { process.stdout.off('data', listener); resolve(); } };
          process.stdout.on('data', listener);
          done.catch(reject);
        });
        process.stdin.write(query + `;select '${marker}';\n`);
        await changed;
      },
      release: async (commit = false) => { process.stdin.end(commit ? 'commit;\n' : 'rollback;\n'); await done; },
    };
  }

  async function blocked(pid) {
    for (let i = 0; i < 100; i++) {
      if (Number(await sql(`select count(*) from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))`))) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw Error('Expected an actual PostgreSQL parent-row lock wait');
  }


  await run('identical concurrent replacements rotate once and recover the first candidate',async()=>{const f=await fixture();ok(await manage(await args(f,'generate')));const before=await snapshot(f),a=await args(f,'regenerate');const r=(await Promise.all([manage(a),manage({...a,p_candidate:candidate()})])).map(ok);assert.equal(r[0].token_id,r[1].token_id);assert.equal(r.filter(x=>x.replayed).length,1);assert.equal(await count(f),'1');assert.equal(await sql(`select count(*)from invoice_portal_tokens where invoice_id=${lit(f.id)}`),'2');assert.equal(await snapshot(f),before);});
  await run('regeneration versus selected-link revocation has exactly one version winner',async()=>{const f=await fixture(),t=ok(await manage(await args(f,'generate')));const rotate=await args(f,'regenerate'),revoke=await args(f,'revoke',t.token_id);const r=await Promise.all([manage(rotate),manage(revoke)]);assert.equal(r.filter(x=>!x.error).length,1);assert.equal(r.find(x=>x.error).error.code,'PT409');assert.equal(await count(f),ok(r.find(x=>!x.error)).intent==='revoke'?'0':'1');});
  await run('competing initial requests produce one active invoice capability',async()=>{const f=await fixture(),a=await args(f,'generate');const r=await Promise.all([manage(a),manage({...a,p_request_id:randomUUID(),p_candidate:candidate()})]);assert.equal(r.filter(x=>!x.error).length,1);assert.equal(r.find(x=>x.error).error.code,'PT409');assert.equal(await count(f),'1');});
  await run('offboarding during invoice lock wait denies stale authenticated session',async()=>{const f=await fixture();ok(await manage(await args(f,'generate')));const a=await args(f,'regenerate'),lock=await hold(f.id),pending=Promise.resolve(manage(a));try{await blocked(lock.pid);await sql(`update profiles set status='disabled'where id=${lit(actor)}`);}finally{await lock.release();}try{assert.equal((await pending).error?.code,'42501');assert.equal(await count(f),'1');}finally{await sql(`update profiles set status='active'where id=${lit(actor)}`);}});
  await run('invoice edit committed during lock wait refuses stale replacement',async()=>{const f=await fixture();ok(await manage(await args(f,'generate')));const a=await args(f,'regenerate'),lock=await hold(f.id),pending=Promise.resolve(manage(a));try{await blocked(lock.pid);await lock.change(`update invoices set due_at=clock_timestamp()+interval '7 days'where id=${lit(f.id)}`);}finally{await lock.release(true);}assert.equal((await pending).error?.code,'PT409');assert.equal(await count(f),'1');});
  await run('superseded receipt recovery never exposes or resurrects the old capability',async()=>{const f=await fixture(),a=await args(f,'generate'),old=ok(await manage(a)),next=ok(await manage(await args(f,'regenerate')));for(const r of [ok(await office.rpc('get_invoice_link_request',identity(a))),ok(await manage(a))]){assert.equal(r.token_available,false);assert.equal(r.token_encrypted,null);assert.equal(r.token_hash,null);assert.equal(r.replayed,true);}assert.notEqual(old.token_id,next.token_id);assert.equal(await count(f),'1');});
  await run('legacy email generation racing explicit replacement never leaves competing links',async()=>{const f=await fixture();ok(await manage(await args(f,'generate')));const a=await args(f,'regenerate'),c=candidate();const r=await Promise.all([manage(a),office.rpc('create_or_get_invoice_portal_token',{p_invoice_id:f.id,p_token_hash:c.token_hash,p_token_hint:c.token_hint,p_token_encrypted:c.token_encrypted,p_expires_at:c.expires_at})]);ok(r[1]);if(r[0].error)assert.equal(r[0].error.code,'PT409');else ok(r[0]);assert.equal(await count(f),'1');});
  await run('view telemetry preserves loaded authority and payment state survives link changes',async()=>{const f=await fixture(),t=ok(await manage(await args(f,'generate'))),a=await args(f,'regenerate');const before=await snapshot(f);ok(await service.from('invoice_portal_tokens').update({viewed_at:new Date().toISOString()}).eq('id',t.token_id));assert.equal((await state(f)).link_version,a.p_expected_version);ok(await manage(a));assert.equal(await snapshot(f),before);});
  await run('preference request queued behind revocation rechecks capability after acquiring invoice lock',async()=>{const f=await fixture(),c=candidate(),t=ok(await manage({...await args(f,'generate'),p_candidate:c})),lock=await hold(f.id);const pending=Promise.resolve(service.rpc('record_invoice_payment_preference',{p_token_hash:c.token_hash,p_preference:'check_mail'}));try{await blocked(lock.pid);await lock.change(`update invoice_portal_tokens set revoked_at=clock_timestamp()where id=${lit(t.token_id)}`);}finally{await lock.release(true);}assert.equal((await pending).error?.code,'P0002');assert.equal(await sql(`select payment_preference is null from invoices where id=${lit(f.id)}`),'t');});
  await run('API role boundaries and authenticated direct DML cannot bypass reviewed authority',async()=>{const f=await fixture(),a=await args(f,'generate');for(const client of [anonymous,service]){assert.equal((await client.rpc('get_invoice_link_state',{p_invoice_id:f.id})).error?.code,'42501');assert.equal((await client.rpc('manage_invoice_portal_link',a)).error?.code,'42501');}const t=ok(await manage(a));assert.equal((await office.from('invoice_portal_tokens').update({revoked_at:new Date().toISOString()}).eq('id',t.token_id)).error?.code,'42501');assert.equal((await office.from('invoice_portal_tokens').delete().eq('id',t.token_id)).error?.code,'42501');assert.equal((await office.from('invoice_portal_tokens').insert({invoice_id:f.id,customer_id:f.customer,...candidate()})).error?.code,'42501');assert.equal(await count(f),'1');});
  if(process.env.INVOICE_LINK_FIXTURES_FILE){const f=await fixture();writeFileSync(process.env.INVOICE_LINK_FIXTURES_FILE,JSON.stringify({email,password,actor,invoice:f.id,customer:f.customer})+'\n',{mode:0o600});browserFixtureRetained=true;}
});
