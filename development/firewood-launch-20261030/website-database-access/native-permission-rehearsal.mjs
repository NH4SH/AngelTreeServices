// Explicitly owned local fixture only. No remote DB, providers, real credentials or business data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const bin='/Users/noelsierra/Documents/Codex/2026-10-30/firewood-native-rehearsal/postgres/bin';
const driver='/Users/noelsierra/Documents/Codex/2026-10-30/firewood-native-rehearsal/driver/node_modules/pg/lib/index.js';
const website='/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/work/home-tree-service-links-release/repo/scripts/firewood-checkout/release';
const matrix=JSON.parse(fs.readFileSync(path.join(here,'ACCESS_MATRIX.json')));
const integration=process.argv.includes('--callback-integration');
const proofFile=integration?'NATIVE_CALLBACK_INTEGRATION_PROOF.json':'NATIVE_PERMISSION_PROOF.json';
const roles=Object.keys(matrix.roles), marker='ats-website-permissions:'+crypto.randomUUID()+':synthetic-only';
const work=path.join(here,'native-test',crypto.randomUUID()); fs.mkdirSync(work,{recursive:true,mode:0o700});
const data=path.join(work,'data'), socket=fs.mkdtempSync(path.join(os.tmpdir(),'ats-fw-acl-')); fs.chmodSync(socket,0o700);
const proof={scope:'Independent owned Unix-only PG17 permission fixture; not the full live CRM or cloud/provider verification',marker,work,socket,cases:[],startedAt:new Date().toISOString(),providerCalls:0,productionMutations:0};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function run(name,args){const r=spawnSync(path.join(bin,name),args,{encoding:'utf8'});fs.appendFileSync(path.join(work,'cluster.log'),r.stdout+r.stderr);assert.equal(r.status,0,`${name} failed; see local cluster.log`);return r.stdout;}
for(const pin of matrix.sourcePins)assert.equal(sha(fs.readFileSync(pin.path)),pin.sha256,'Review source changed: '+pin.name);
proof.artifactHashes=Object.fromEntries(['ACCESS_MATRIX.json','roles-acl-rls.sql.review-only.txt','native-context-body.sql.review-only.txt','public-boundary-rehome.sql.review-only.txt'].map(name=>[name,sha(fs.readFileSync(path.join(here,name)))]));
proof.sourcePins=matrix.sourcePins;
const {Client}=(await import(pathToFileURL(driver))).default;let admin,clients=[],started=false;
const config={host:socket,port:5432,database:'postgres'};
async function connect(user){const c=new Client({...config,user});await c.connect();clients.push(c);return c;}
async function record(name,fn){await fn();proof.cases.push({name,passed:true});}
async function denied(c,sql,args=[],expected=/^(42501|PT503|P0001)$/){try{await c.query(sql,args);assert.fail('Expected SQL denial: '+sql);}catch(e){if(e.code==='ERR_ASSERTION')throw e;assert.match(e.code??'',expected);return e.code;}}
async function tx(c,fn){await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');await c.query('SET LOCAL search_path=app_private,pg_catalog');try{const r=await fn(c);await c.query('SELECT app_private.fwofficev2_native_context()');await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}}
function reviewedBody(name){const s=fs.readFileSync(path.join(here,name),'utf8');assert.match(s,/BEGIN;\nDO \$review_only\$ BEGIN RAISE EXCEPTION/);assert.match(s,/ROLLBACK;\s*$/);return s.replace("DO $review_only$ BEGIN RAISE EXCEPTION 'Review artifact only; target-bound installer required.'; END $review_only$;",'').replace(/ROLLBACK;\s*$/,'COMMIT;');}
const roleSnapshot=`SELECT r.oid,r.rolname,r.rolsuper,has_schema_privilege(r.oid,'net','USAGE') AS net_usage,has_database_privilege(r.oid,'postgres','TEMPORARY') AS temporary,coalesce((SELECT jsonb_agg(jsonb_build_object('roleid',m.roleid,'member',m.member,'grantor',m.grantor,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)ORDER BY m.roleid,m.member,m.grantor)FROM pg_auth_members m WHERE m.member=r.oid),'[]'::jsonb) AS memberships FROM pg_roles r ORDER BY r.oid`;
async function lease(overrides=''){await admin.query(`UPDATE hosting_guard.state SET local_node='synthetic-permission-node',holder='synthetic-permission-node',epoch=4,database_started_at=pg_postmaster_start_time(),issued_at=clock_timestamp(),expires_at=clock_timestamp()+interval '14 seconds',capture_started_at=clock_timestamp()-interval '1 second',capture_in_progress=false,topology_verified=true,topology_fingerprint=hosting_guard.catalog_fingerprint() ${overrides} WHERE singleton`);}
try{
  run('initdb',['-D',data,'-U','supabase_admin','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
  fs.appendFileSync(path.join(data,'postgresql.conf'),`\nlisten_addresses=''\nunix_socket_directories='${socket}'\nunix_socket_permissions=0700\nport=5432\nmax_connections=20\n`);
  run('pg_ctl',['-D',data,'-l',path.join(work,'server.log'),'-w','start']);started=true;admin=await connect('supabase_admin');
  await admin.query(`COMMENT ON DATABASE postgres IS '${marker}'; CREATE ROLE postgres NOLOGIN NOSUPERUSER BYPASSRLS; CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE ROLE authenticator NOLOGIN NOINHERIT;CREATE ROLE supabase_auth_admin NOLOGIN;CREATE ROLE supabase_storage_admin NOLOGIN;CREATE ROLE synthetic_existing_group NOLOGIN;CREATE ROLE synthetic_existing_member NOLOGIN;GRANT synthetic_existing_group TO synthetic_existing_member;
    CREATE SCHEMA app_private AUTHORIZATION postgres;CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE SCHEMA net;
    GRANT USAGE ON SCHEMA app_private TO authenticated,service_role;GRANT USAGE ON SCHEMA public,net TO PUBLIC;
    CREATE TABLE public.synthetic_crm_secret(id integer PRIMARY KEY,payload text);CREATE TABLE auth.synthetic_user(id integer PRIMARY KEY,payload text);CREATE TABLE storage.synthetic_object(id integer PRIMARY KEY,payload text);
    CREATE TABLE net.http_request_queue(id bigint,payload text);CREATE TABLE net._http_response(id bigint,payload text);CREATE SEQUENCE net.http_request_queue_id_seq;
    CREATE FUNCTION net.http_get(url text)RETURNS bigint LANGUAGE SQL AS 'SELECT 1::bigint';
    GRANT ALL ON ALL TABLES IN SCHEMA net TO PUBLIC;GRANT ALL ON ALL SEQUENCES IN SCHEMA net TO PUBLIC;GRANT EXECUTE ON FUNCTION net.http_get(text)TO PUBLIC;
    CREATE SCHEMA hosting_guard;REVOKE ALL ON SCHEMA hosting_guard FROM PUBLIC;
    CREATE TABLE hosting_guard.state(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),local_node text NOT NULL DEFAULT 'synthetic-home',epoch bigint NOT NULL DEFAULT 0 CHECK(epoch>=0),holder text,database_started_at timestamptz,issued_at timestamptz,expires_at timestamptz,capture_started_at timestamptz,topology_verified boolean NOT NULL DEFAULT false,topology_fingerprint text,capture_in_progress boolean NOT NULL DEFAULT true);
    ALTER TABLE hosting_guard.state ENABLE ROW LEVEL SECURITY;REVOKE ALL ON hosting_guard.state FROM PUBLIC;INSERT INTO hosting_guard.state(singleton)VALUES(true);`);
  const metadata=JSON.parse(fs.readFileSync(path.join(here,'..','GUARD_METADATA_READBACK.json'))).databaseQueries[0];
  proof.originalGuardDefinitions=metadata.guardFunctions.map(f=>({name:f.name,owner:f.owner,sha256:sha(f.definition)}));
  for(const f of metadata.guardFunctions){await admin.query(f.definition);const sig=(await admin.query(`SELECT p.oid::regprocedure::text sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hosting_guard'AND p.proname=$1`,[f.name])).rows[0].sig;await admin.query(`ALTER FUNCTION ${sig} OWNER TO supabase_admin;REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC;`);}
  await admin.query('SET ROLE postgres;SET search_path=app_private,pg_catalog');await admin.query(fs.readFileSync(path.join(website,'schema.sql'),'utf8'));await admin.query('RESET ROLE;RESET search_path');
  proof.fixture={websiteTables:15,syntheticDeniedCrmAuthStorageTables:3,net:'Fake inert table/sequence/http_get returning 1; no HTTP extension or network execution',actualGuardFunctionBodies:true,guardStateFixture:'source-derived state plus actual capture_in_progress column',runtimeReceipt:'No signed runtime receipt minted; this is the native permission boundary only'};
  const before=(await admin.query(roleSnapshot)).rows;await admin.query(reviewedBody('public-boundary-rehome.sql.review-only.txt'));const after=(await admin.query(roleSnapshot)).rows;assert.deepEqual(after,before);proof.existingRoleMatrix={before,after,preserved:true};
  await record('All preexisting effective net/TEMP privileges and memberships preserved',async()=>assert.deepEqual(after,before));
  await admin.query(reviewedBody('roles-acl-rls.sql.review-only.txt'));
  await admin.query('SELECT hosting_guard.enroll_tables()');
  await admin.query(`CREATE EVENT TRIGGER ats_hosting_topology_changed ON ddl_command_end WHEN TAG IN('CREATE TABLE','CREATE TABLE AS','ALTER TABLE','DROP TABLE','CREATE TRIGGER','ALTER TRIGGER','DROP TRIGGER')EXECUTE FUNCTION hosting_guard.invalidate_topology()`);
  proof.identity=(await admin.query(`SELECT (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,pg_postmaster_start_time()::text AS database_boot,current_database() AS database,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`)).rows[0];assert.equal(proof.identity.marker,marker);
  proof.nativeInitialRoles=(await admin.query(`SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,has_schema_privilege(oid,'net','USAGE')net_usage,has_database_privilege(oid,'postgres','TEMPORARY')temporary FROM pg_roles WHERE rolname=ANY($1)ORDER BY rolname`,[roles])).rows;
  for(const r of proof.nativeInitialRoles){for(const k of ['rolcanlogin','rolsuper','rolinherit','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls','net_usage','temporary'])assert.equal(r[k],false);}
  for(const r of roles)await admin.query('ALTER ROLE '+r+' LOGIN');
  const request=await connect(roles[0]),worker=await connect(roles[1]),health=await connect(roles[2]);
  proof.nativeSessionUsers=[];for(const c of [request,worker,health])proof.nativeSessionUsers.push((await c.query('SELECT session_user,current_user')).rows[0]);assert.deepEqual(proof.nativeSessionUsers.map(x=>x.session_user),roles);
  await lease();await admin.query(`INSERT INTO app_private.fwofficev2_identity VALUES(true,'synthetic-bound-identity');UPDATE app_private.fwofficev2_control SET paused=false WHERE id=true`);
  await record('Actual native sessions cannot reach net queues/functions/sequences, TEMP DDL, CRM/Auth/Storage, guard state or privileged roles',async()=>{
    for(const c of [request,worker,health])for(const sql of [
      'SELECT * FROM net.http_request_queue','SELECT * FROM net._http_response',"SELECT net.http_get('https://checkout.invalid')", "SELECT nextval('net.http_request_queue_id_seq')",
      'CREATE TEMP TABLE fwofficev2_orders(id uuid)','SELECT * FROM public.synthetic_crm_secret','SELECT * FROM auth.synthetic_user','SELECT * FROM storage.synthetic_object','SELECT * FROM hosting_guard.state','SET ROLE postgres','SET ROLE service_role',
      'CREATE TABLE app_private.unapproved(id integer)','CREATE FUNCTION app_private.unapproved()RETURNS int LANGUAGE SQL AS $$SELECT 1$$','ALTER TABLE app_private.fwofficev2_orders DISABLE TRIGGER ALL','TRUNCATE app_private.fwofficev2_orders'])await denied(c,sql,[],/^(42501|3F000)$/);
  });
  const sid='synthetic-session',draft=crypto.randomUUID(),order=crypto.randomUUID();
  const receipt={order_state:'active',workflow_revision:0,original_paid_evidence:null,accounting:{issued_at:'2026-10-30T00:00:00.000Z',original_principal_cents:60000,raw_balance_due_cents:60000,credited_principal_cents:0,collectible_balance_cents:60000,credit_id:null},invoice_id:crypto.randomUUID()};
  await record('Request exact accepted-order, pricing, observation, rate and lock queries succeed',async()=>tx(request,async c=>{
    assert.equal((await c.query('SELECT hash FROM fwofficev2_identity WHERE id=true')).rows[0].hash,'synthetic-bound-identity');
    await c.query('INSERT INTO fwofficev2_sessions(id,csrf,expires)VALUES($1,$2,$3)RETURNING *',[sid,'synthetic-csrf',Date.now()+60000]);
    await c.query('SELECT * FROM fwofficev2_sessions WHERE id=$1 AND expires>$2 FOR UPDATE',[sid,Date.now()]);
    await c.query('INSERT INTO fwofficev2_rate VALUES($1,$2,1)ON CONFLICT(id)DO UPDATE SET at=EXCLUDED.at,used=fwofficev2_rate.used+1 RETURNING id',['synthetic-rate',Date.now()]);
    await c.query('INSERT INTO fwofficev2_drafts VALUES($1,$2,$3,$4)',[draft,sid,{},Date.now()]);await c.query('SELECT id FROM fwofficev2_drafts WHERE id=$1 FOR UPDATE',[draft]);
    await c.query("INSERT INTO fwofficev2_price_queue(id,status)VALUES($1,'pending')ON CONFLICT DO NOTHING",[draft]);
    await c.query("UPDATE fwofficev2_price_queue SET status='requested',tries=tries+1,retry_at=0,lease=NULL,lease_until=0 WHERE id=$1",[draft]);
    await c.query('INSERT INTO fwofficev2_price_history VALUES($1,1,$2)ON CONFLICT DO NOTHING',[draft,{}]);
    await c.query('INSERT INTO fwofficev2_prices VALUES($1,1,$2)ON CONFLICT(id)DO UPDATE SET revision=EXCLUDED.revision,receipt=EXCLUDED.receipt',[draft,{}]);
    await c.query('UPDATE fwofficev2_sessions SET draft_id=$2 WHERE id=$1',[sid,draft]);await c.query('SELECT paused FROM fwofficev2_control WHERE id=true FOR UPDATE');
    await c.query('INSERT INTO fwofficev2_orders VALUES($1,$2,$3,$4,$5,$6)',[order,sid,{synthetic:true},{synthetic:true},null,Date.now()]);
    await c.query("INSERT INTO fwofficev2_prepare(id,status)VALUES($1,'pending')",[order]);await c.query('UPDATE fwofficev2_sessions SET order_id=$2 WHERE id=$1',[sid,order]);
    await c.query('SELECT id FROM fwofficev2_orders WHERE id=$1 FOR UPDATE',[order]);
    await c.query('INSERT INTO fwofficev2_history VALUES($1,1,$2)ON CONFLICT DO NOTHING',[order,receipt]);
    await c.query('INSERT INTO fwofficev2_observations VALUES($1,1,$2)ON CONFLICT(id)DO UPDATE SET revision=EXCLUDED.revision,receipt=EXCLUDED.receipt',[order,receipt]);
    await c.query("UPDATE fwofficev2_prepare SET status='prepared',receipt=$2,invoice_id=$3,tries=tries+1,retry_at=0,lease=NULL,lease_until=0 WHERE id=$1",[order,{},receipt.invoice_id]);
  }));
  await record('Immutable history and command separation are preserved',async()=>{
    await denied(request,'UPDATE app_private.fwofficev2_control SET paused=true');await denied(request,'UPDATE app_private.fwofficev2_orders SET chosen=$1',[{}]);
    await denied(request,'UPDATE app_private.fwofficev2_orders SET id=id',[],/^P0001$/);await denied(request,'UPDATE app_private.fwofficev2_drafts SET id=id',[],/^P0001$/);
    for(const table of ['history','price_history','orders','drafts','identity'])await denied(request,'DELETE FROM app_private.fwofficev2_'+table);
    for(const table of ['confirmations','outbox','heartbeat'])await denied(request,'SELECT * FROM app_private.fwofficev2_'+table);
    for(const table of ['sessions','rate','control'])await denied(worker,'SELECT * FROM app_private.fwofficev2_'+table);
    await denied(worker,'INSERT INTO app_private.fwofficev2_orders VALUES($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),'x',{}, {},null,Date.now()]);
  });
  await record('Worker exact queue/heartbeat/confirmation operations and immutable outbox controls succeed',async()=>tx(worker,async c=>{
    await c.query('SELECT id FROM fwofficev2_drafts WHERE id=$1 FOR UPDATE',[draft]);await c.query('SELECT id FROM fwofficev2_orders WHERE id=$1 FOR UPDATE',[order]);
    await c.query('SELECT lease_until FROM fwofficev2_heartbeat WHERE id=true FOR UPDATE');const l=crypto.randomUUID();await c.query('UPDATE fwofficev2_heartbeat SET lease=$1,lease_until=$2,started_at=$3,last_code=NULL WHERE id=true',[l,Date.now()+240000,Date.now()]);
    await c.query('UPDATE fwofficev2_heartbeat SET lease=NULL,lease_until=0,finished_at=$2,last_code=$3 WHERE id=true AND lease=$1',[l,Date.now(),null]);
    await c.query('UPDATE fwofficev2_prepare SET next_status_at=$2 WHERE id=$1',[order,Date.now()+15000]);
    await c.query('INSERT INTO fwofficev2_confirmations VALUES($1,1,$2,$3,$4)ON CONFLICT DO NOTHING',[order,{synthetic:true},[],Date.now()]);
    await c.query("INSERT INTO fwofficev2_outbox(order_id,kind,recipient,message,idempotency_key,status,created_at)VALUES($1,'customer_order','synthetic@checkout.invalid',$2,$3,'pending',$4)ON CONFLICT DO NOTHING",[order,{synthetic:true},'synthetic-fixed-idempotency',Date.now()]);
    await c.query("UPDATE fwofficev2_outbox SET status='processing',tries=tries+1,lease=$2,lease_until=$3,first_send_at=coalesce(first_send_at,$4)WHERE order_id=$1",[order,crypto.randomUUID(),Date.now()+90000,Date.now()]);
    await c.query("UPDATE fwofficev2_outbox SET status='accepted',provider_id=$2,lease=NULL,lease_until=0,last_code=NULL WHERE order_id=$1",[order,crypto.randomUUID()]);
  }));
  await denied(worker,"UPDATE app_private.fwofficev2_outbox SET status='pending'",[],/^P0001$/);
  await denied(worker,"UPDATE app_private.fwofficev2_outbox SET recipient='changed@checkout.invalid'",[],/^42501$/);await denied(worker,'DELETE FROM app_private.fwofficev2_confirmations');
  await record('Health has only limited helper aggregates and current native lease facts, no raw data',async()=>tx(health,async c=>{
    const context=(await c.query('SELECT app_private.fwofficev2_native_context() context')).rows[0].context;assert.equal(context.admitted,true);assert.equal(context.systemIdentifier,proof.identity.system_identifier);assert.ok(context.expiresAtMs<=context.observedAtMs+14000);
    assert.deepEqual(Object.keys(context).sort(),['admitted','database','systemIdentifier','databaseStartedAtMs','leaseEpoch','nodeIdentity','topologyFingerprint','captureStartedAtMs','leaseIssuedAtMs','expiresAtMs','observedAtMs'].sort());
    const h=(await c.query('SELECT app_private.fwofficev2_health() health')).rows[0].health;assert.equal(h.accepted_orders,1);assert.equal(h.confirmation_accepted,1);assert.deepEqual(Object.keys(h).sort(),matrix.healthHelper.fields.slice().sort());proof.healthShape=Object.keys(h);
  }));
  for(const table of Object.keys(matrix.columns))await denied(health,'SELECT * FROM app_private.fwofficev2_'+table);
  await record('Operator SET ROLE is not accepted as actual native SESSION_USER; caller JWT GUC does not grant CRM access',async()=>{
    await admin.query('SET ROLE ats_firewood_request');await denied(admin,'SELECT app_private.fwofficev2_native_context()',[],/^42501$/);await admin.query('RESET ROLE');
    await request.query("SET request.jwt.claim.role='service_role';SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'");await denied(request,'SELECT * FROM public.synthetic_crm_secret');await denied(request,'SELECT * FROM hosting_guard.state');
  });
  await record('Repeatable-read and serializable transactions cannot use native helper',async()=>{
    for(const level of ['REPEATABLE READ','SERIALIZABLE']){await request.query('BEGIN ISOLATION LEVEL '+level);await denied(request,'SELECT app_private.fwofficev2_native_context()',[],/^42501$/);await request.query('ROLLBACK');}
  });
  await record('Capture hold, stale backup, future timestamps, topology mismatch and restarted database deny admission',async()=>{
    const mutations=["capture_in_progress=true","capture_started_at=clock_timestamp()-interval '281 seconds'","issued_at=clock_timestamp()+interval '1 second'","capture_started_at=clock_timestamp()+interval '1 second'","topology_verified=false","holder='synthetic-other-node'","database_started_at=pg_postmaster_start_time()-interval '1 second'"];
    for(const update of mutations){await lease();await admin.query('UPDATE hosting_guard.state SET '+update+' WHERE singleton');await denied(request,'SELECT app_private.fwofficev2_native_context()',[],/^PT503$/);}
  });
  await record('Actual 14-second native lease expires and rejects reads and writes',async()=>{
    await lease();const context=(await request.query('SELECT app_private.fwofficev2_native_context() context')).rows[0].context;await new Promise(resolve=>setTimeout(resolve,Math.max(1,context.expiresAtMs-Date.now()+100)));
    await denied(request,'SELECT app_private.fwofficev2_native_context()',[],/^PT503$/);await denied(request,"INSERT INTO app_private.fwofficev2_rate VALUES('expired',0,1)",[],/^PT503$/);
  });
  await record('Actual deferred commit fence rolls back a write after lease expiry',async()=>{
    await lease();await request.query('BEGIN ISOLATION LEVEL READ COMMITTED');await request.query('SET LOCAL search_path=app_private,pg_catalog');await request.query("INSERT INTO fwofficev2_rate VALUES('deferred-rollback',0,1)");
    await admin.query("UPDATE hosting_guard.state SET expires_at=clock_timestamp()-interval '1 second'WHERE singleton");await denied(request,'COMMIT',[],/^PT503$/);assert.equal((await admin.query("SELECT count(*)::int n FROM app_private.fwofficev2_rate WHERE id='deferred-rollback'")).rows[0].n,0);
  });
  await record('Mandatory precommit helper rolls back a transaction when capture hold changes',async()=>{
    await lease();await request.query('BEGIN ISOLATION LEVEL READ COMMITTED');await request.query('SET LOCAL search_path=app_private,pg_catalog');await request.query("INSERT INTO fwofficev2_rate VALUES('hold-rollback',0,1)");
    await admin.query('UPDATE hosting_guard.state SET capture_in_progress=true WHERE singleton');await denied(request,'SELECT app_private.fwofficev2_native_context()',[],/^PT503$/);await request.query('ROLLBACK');assert.equal((await admin.query("SELECT count(*)::int n FROM app_private.fwofficev2_rate WHERE id='hold-rollback'")).rows[0].n,0);
  });
  proof.guardLimitation='Actual original enforce_write checks lease expiry, not capture_in_progress alone; capture holds require the controller to expire the lease/close sessions and the runtime mandatory precommit helper. Original guard was not changed.';
  proof.finalTriggers=(await admin.query(`SELECT c.relname,count(*)::int n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app_private'AND c.relname LIKE 'fwofficev2_%'AND t.tgname IN('ats_hosting_admission','ats_hosting_commit','ats_hosting_truncate') GROUP BY c.relname ORDER BY c.relname`)).rows;assert.equal(proof.finalTriggers.length,15);assert.ok(proof.finalTriggers.every(x=>x.n===3));
  if(integration){const {runNativeCallbackIntegration}=await import('./native-callback-integration.mjs');proof.callbackIntegration=await runNativeCallbackIntegration({admin,config,driver,website,marker});}
  proof.passed=true;
}catch(error){proof.passed=false;proof.error={name:error.name,code:error.code,message:error.message,stack:error.stack};throw error;}
finally{
  if(admin){try{for(const role of roles)if((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rows.length)await admin.query('ALTER ROLE '+role+' NOLOGIN');}catch{}
    try{await admin.query("UPDATE hosting_guard.state SET capture_in_progress=true,expires_at=clock_timestamp()-interval '1 second'WHERE singleton");proof.finalNativeRoles=(await admin.query('SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname=ANY($1)ORDER BY rolname',[roles])).rows;}catch{}
  }
  await Promise.allSettled(clients.map(c=>c.end()));if(started){run('pg_ctl',['-D',data,'-m','fast','-w','stop']);proof.clusterStopped=true;}
  proof.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(work,proofFile),JSON.stringify(proof,null,2)+'\n');fs.writeFileSync(path.join(here,proofFile),JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify({passed:proof.passed,cases:proof.cases.length,clusterStopped:proof.clusterStopped,work}));
}
