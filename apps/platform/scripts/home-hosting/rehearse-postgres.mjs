// Run only inside the retained synthetic benchmark VM. No hosted targets,
// production credentials, public ports, scanner containers or existing volumes
// are accepted. This tests self-hosted recovery, not managed-platform import.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

assert.equal(process.env.HOME_RECOVERY_REHEARSAL, '1');
assert.equal(process.platform, 'linux');
assert.equal(process.arch, 'arm64');
assert.equal(process.getuid(), 501);
assert.equal(hostname(), 'lima-ats-crm-bench-20261026');
process.umask(0o077);
const base = process.env.HOME + '/benchmark';
const id = randomBytes(6).toString('hex');
const folder = join(base, 'recovery-' + id), capture = join(folder, 'capture');
mkdirSync(folder, { mode: 0o700 }); mkdirSync(capture, { mode: 0o700 });
const restic = join(base, 'recovery-tools/restic_0.19.1_linux_arm64');
const hash = data => createHash('sha256').update(data).digest('hex');
assert.equal(hash(readFileSync(restic)), '2fb45ac6f9071b6f20eb883953a188f9e7c7cb6bbe43c67a2e47ada4e85ee7f0');
const source = 'supabase_db_ats_bench_4e176c545c9c';
const target = 'ats_recovery_db_' + id, network = 'ats_recovery_net_' + id, volume = 'ats_recovery_data_' + id;
const environment = { HOME: process.env.HOME, PATH: '/usr/bin:/bin', DOCKER_HOST: 'unix:///run/user/501/docker.sock', GOMAXPROCS: '2', GOMEMLIMIT: '256MiB' };
let step = 0, targetStarted = false, owner, service, client;
const checks = [];
function run(command, args, input, success = true) {
  const r = spawnSync(command, args, { env: environment, cwd: folder, input, encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  writeFileSync(join(folder, `${++step}-command.private.log`), (r.stdout ?? '') + '\n' + (r.stderr ?? ''), { mode: 0o600 });
  if (success) assert.equal(r.status, 0, `Rehearsal step ${step} failed; inspect its private log.`);
  else assert.notEqual(r.status, 0);
  return r.stdout;
}
const docker = (...args) => run('/usr/bin/docker', args);
const sql = (container, query, database = 'postgres') => run('/usr/bin/docker', ['exec', '-i', container, 'psql', '-U', container === source ? 'postgres' : 'supabase_admin', '-d', database, '-X', '-v', 'ON_ERROR_STOP=1', '-Atq'], query);
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const ok = r => { assert.equal(r.error, null, 'A local synthetic fixture operation failed.'); return r.data; };
const manifestSql = `
set search_path=pg_catalog;
create temp table recovery_rows(name text, n bigint, digest text);
do $body$ declare t record; begin
 for t in select schemaname,tablename from pg_tables where schemaname in ('public','app_private','auth','storage','supabase_migrations') order by schemaname,tablename loop
  execute format('insert into recovery_rows select %L,count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'''' order by md5(to_jsonb(x)::text)),'''')) from %I.%I x',t.schemaname||'.'||t.tablename,t.schemaname,t.tablename);
 end loop;
end $body$;
select jsonb_build_object(
 'tables',(select jsonb_agg(to_jsonb(r) order by name) from recovery_rows r),
 'policies',(select md5(coalesce(string_agg(row(schemaname,tablename,policyname,permissive,array(select unnest(roles) order by 1),cmd,qual,with_check)::text,'' order by schemaname,tablename,policyname),'')) from pg_policies where schemaname in ('public','app_private','auth','storage')),
 'permissions',(select md5(string_agg(row(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),(select jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor),a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type,a.is_grantable) from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) a))::text,'' order by n.nspname,c.relname)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth','storage') and c.relkind in ('r','p','v','S')),
 'functions',(select md5(string_agg(n.nspname||'.'||p.proname||pg_get_function_identity_arguments(p.oid)||pg_get_userbyid(p.proowner)||coalesce(p.proacl::text,'')||pg_get_functiondef(p.oid),'' order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and p.prokind='f')
);`;

try {
  const info = JSON.parse(docker('inspect', source))[0];
  assert.equal(info.Name, '/' + source); assert.equal(info.State.Running, true);
  const version = sql(source, 'select version();').trim(); assert.match(version, /PostgreSQL 17\./);
  assert.equal(Number(sql(source, 'select count(*) from supabase_migrations.schema_migrations;').trim()), 126);
  const status = JSON.parse(readFileSync(join(base, 'status.private.json')));
  assert.equal(status.API_URL, 'http://127.0.0.1:62321');
  const { createClient } = await import(pathToFileURL(join(base, 'source/apps/platform/node_modules/@supabase/supabase-js/dist/index.cjs')).href);
  const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch(input, init) {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, status.API_URL, 'Non-local request refused.');
    return fetch(input, init);
  } } };
  service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, opts);
  const identity = { email: `home-recovery-${id}@example.invalid`, password: randomBytes(32).toString('base64url') };
  owner = ok(await service.auth.admin.createUser({ ...identity, email_confirm: true })).user;
  writeFileSync(join(folder, 'identity.private.json'), JSON.stringify({ ...identity, userId: owner.id }), { mode: 0o600 });
  ok(await service.from('profiles').update({ status: 'active' }).eq('id', owner.id));
  ok(await service.from('employee_records').insert({ auth_user_id: owner.id, legal_name: 'Synthetic recovery ' + id, employment_status: 'active', is_active: true }));
  const role = ok(await service.from('roles').select('id').eq('name', 'owner').single());
  ok(await service.from('user_roles').insert({ user_id: owner.id, role_id: role.id }));
  client = createClient(status.API_URL, status.ANON_KEY, opts);
  ok(await client.auth.signInWithPassword(identity));
  const customer = ok(await service.from('customers').insert({ display_name: 'Synthetic recovery ' + id }).select('id').single());
  const invoice = ok(await client.rpc('create_standalone_invoice', {
    p_request_id: randomUUID(), p_header: { customer_id: customer.id, organization_id: null, service_location_id: null, due_at: '2031-01-01T17:00:00Z' },
    p_lines: [{ name: 'Synthetic recovery fixture', description: null, quantity: 1, unit_price_cents: 24000, total_cents: 24000 }], p_notes: null, p_new_customer: null,
  }));
  const invoiceId = invoice.invoice_id;
  assert.match(invoiceId, /^[a-f0-9-]{36}$/);
  ok(await client.rpc('record_invoice_delivery', { p_invoice_id: invoiceId, p_manual: true }));
  const paymentArgs = { p_request_id: randomUUID(), p_invoice_id: invoiceId, p_amount_cents: 24000, p_paid_at: new Date().toISOString(), p_method: 'cash', p_reference: 'synthetic-recovery-' + id, p_notes: 'Synthetic only; no money moved.' };
  const payment = ok(await client.rpc('record_manual_invoice_payment_request', paymentArgs));
  const accepted = randomUUID(), uncertain = randomUUID();
  for (const [delivery, state] of [[accepted, 'accepted'], [uncertain, 'unknown']]) {
    sql(source, `insert into app_private.outbound_deliveries(id,business_key,provider_key,payload,payload_hash,context,source_snapshot,state,attempt_count,retry_authorized,accepted_at)
      values(${literal(delivery)},${literal('recovery/' + id + '/' + state)},${literal('recovery-' + id + '-' + state)},'{}',${literal(hash(Buffer.from('{}')))},'{}','{}',${literal(state)},1,false,${state === 'accepted' ? 'now()' : 'null'});`);
  }
  const object = randomBytes(256 * 1024), bucket = 'recovery-' + id;
  ok(await service.storage.createBucket(bucket, { public: false }));
  ok(await service.storage.from(bucket).upload('synthetic.bin', object, { contentType: 'application/octet-stream', upsert: false }));
  writeFileSync(join(capture, 'synthetic-object.bin'), object, { mode: 0o600 });
  checks.push('Synthetic owner, paid invoice, idempotent manual payment, accepted/unknown emails and private object created without providers.');

  const captureStartedAt = new Date().toISOString();
  // Retained earlier synthetic fixtures also have file metadata. Capture every
  // source object, not just the object created by this particular test run.
  const objectInventorySql = "select coalesce(jsonb_agg(jsonb_build_object('id',id,'bucket',bucket_id,'path',name,'updatedAt',updated_at,'metadata',metadata) order by bucket_id,name),'[]') from storage.objects;";
  const inventory = JSON.parse(sql(source, objectInventorySql));
  assert.ok(inventory.length < 2000, 'This rehearsal is limited to the synthetic corpus.');
  mkdirSync(join(capture, 'objects'), { mode: 0o700 });
  const objects = [];
  for (const item of inventory) {
    const blob = Buffer.from(await ok(await service.storage.from(item.bucket).download(item.path)).arrayBuffer());
    const sha256 = hash(blob), name = 'objects/' + sha256 + '.bin';
    if (!existsSync(join(capture, name))) writeFileSync(join(capture, name), blob, { mode: 0o600, flag: 'wx' });
    objects.push({ bucket: item.bucket, path: item.path, sha256, size: blob.length, file: name });
  }
  assert.ok(JSON.stringify(JSON.parse(sql(source, objectInventorySql))) === JSON.stringify(inventory), 'Storage changed during capture.');
  const roles = JSON.parse(sql(source, "select jsonb_agg(to_jsonb(r) order by rolname) from (select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles where rolname !~ '^pg_') r;"));
  const memberships = JSON.parse(sql(source, "select coalesce(jsonb_agg(to_jsonb(m) order by role_name,member_name),'[]') from (select r.rolname role_name,u.rolname member_name,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles u on u.oid=a.member) m;"));
  const sequenceOwnerPrivileges = JSON.parse(sql(source, "select coalesce(jsonb_agg(to_jsonb(s) order by schema_name,sequence_name),'[]') from (select n.nspname schema_name,c.relname sequence_name,pg_get_userbyid(c.relowner) owner_name,array(select privilege_type from aclexplode(coalesce(c.relacl,acldefault('S',c.relowner))) a where a.grantee=c.relowner and a.grantor=c.relowner order by privilege_type) privileges from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname in ('public','app_private','auth','storage')) s;"));
  const before = JSON.parse(sql(source, manifestSql));
  const dumpPath = join(capture, 'database.dump'), dumpFd = openSync(dumpPath, 'wx', 0o600), logFd = openSync(join(folder, 'dump.private.log'), 'wx', 0o600);
  let dumped;
  try { dumped = spawnSync('/usr/bin/docker', ['exec', source, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc'], { env: environment, stdio: ['ignore', dumpFd, logFd], timeout: 180_000 }); }
  finally { closeSync(dumpFd); closeSync(logFd); }
  assert.equal(dumped.status, 0, 'Local database export failed.');
  assert.deepEqual(JSON.parse(sql(source, manifestSql)), before, 'Source changed during capture; do not publish an incoherent snapshot.');
  writeFileSync(join(capture, 'manifest.private.json'), JSON.stringify({
    syntheticOnly: true, sourceMigrationCount: 126, sourceVersion: version,
    captureStartedAt, captureCompletedAt: new Date().toISOString(),
    databaseSha256: hash(readFileSync(dumpPath)), objectSha256: hash(object),
    bucket, objectPath: 'synthetic.bin', objects, database: before, roles, memberships, sequenceOwnerPrivileges,
  }), { mode: 0o600 });

  const passwordFile = join(folder, 'recovery-password.private');
  writeFileSync(passwordFile, randomBytes(48).toString('base64') + '\n', { mode: 0o600 });
  const repo = join(folder, 'encrypted-repository');
  const backup = (...args) => run(restic, ['--repo', repo, '--password-file', passwordFile, '--no-cache', ...args]);
  backup('init', '--repository-version', '2');
  const backupOutput = backup('backup', '--json', '--tag', 'synthetic-only', capture);
  const snapshot = backupOutput.trim().split('\n').map(line => JSON.parse(line)).find(line => line.message_type === 'summary').snapshot_id;
  assert.match(snapshot, /^[a-f0-9]{64}$/);
  backup('check', '--read-data');
  const restored = join(folder, 'restored-capture');
  backup('restore', snapshot + ':' + capture, '--target', restored, '--verify');
  assert.equal(hash(readFileSync(join(restored, 'database.dump'))), hash(readFileSync(dumpPath)));
  assert.equal(hash(readFileSync(join(restored, 'synthetic-object.bin'))), hash(object));
  const recovery = JSON.parse(readFileSync(join(restored, 'manifest.private.json')));
  for (const item of recovery.objects) {
    assert.match(item.file, /^objects\/[a-f0-9]{64}\.bin$/);
    const recoveredObject = readFileSync(join(restored, item.file));
    assert.equal(hash(recoveredObject), item.sha256); assert.equal(recoveredObject.length, item.size);
  }
  checks.push('Native PostgreSQL dump and matching private object recovered through an authenticated encrypted Restic snapshot.');

  const pgPassword = randomBytes(32).toString('hex'), envFile = join(folder, 'postgres.private.env');
  writeFileSync(envFile, `POSTGRES_PASSWORD=${pgPassword}\nPGPASSWORD=${pgPassword}\n`, { mode: 0o600 });
  docker('network', 'create', '--internal', '--label', 'ats-purpose=synthetic-crm-recovery', network);
  docker('volume', 'create', '--label', 'ats-purpose=synthetic-crm-recovery', volume);
  docker('run', '-d', '--name', target, '--label', 'ats-purpose=synthetic-crm-recovery', '--network', network,
    '--memory', '768m', '--memory-swap', '768m', '--cpus', '1', '--pids-limit', '128', '--ulimit', 'core=0:0',
    '--env-file', envFile, '--mount', `type=volume,src=${volume},dst=/var/lib/postgresql/data`, info.Image);
  targetStarted = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const r = spawnSync('/usr/bin/docker', ['exec', target, 'pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres'], { env: environment, stdio: 'ignore' });
    if (r.status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(ready, true, 'Isolated recovery PostgreSQL did not become ready.');
  // The image's bootstrap administrator is supabase_admin. Recreate the source
  // role identities/memberships in this NEW isolated cluster before owners/ACLs.
  const identifier = name => { assert.match(name, /^[A-Za-z_][A-Za-z0-9_]*$/); return '"' + name + '"'; };
  for (const r of recovery.roles) {
    const flags = [[r.rolsuper,'SUPERUSER'],[r.rolinherit,'INHERIT'],[r.rolcreaterole,'CREATEROLE'],[r.rolcreatedb,'CREATEDB'],[r.rolcanlogin,'LOGIN'],[r.rolreplication,'REPLICATION'],[r.rolbypassrls,'BYPASSRLS']].map(([enabled, flag]) => (enabled ? '' : 'NO') + flag).join(' ');
    sql(target, `do $role$ begin if not exists(select 1 from pg_roles where rolname=${literal(r.rolname)}) then create role ${identifier(r.rolname)} with ${flags}; end if;end $role$;`);
  }
  for (const m of recovery.memberships) sql(target, `grant ${identifier(m.role_name)} to ${identifier(m.member_name)} with admin ${m.admin_option},inherit ${m.inherit_option},set ${m.set_option};`);
  const database = 'ats_recovered_' + id;
  sql(target, `create database ${database} with template template0;`);
  const restoreInput = openSync(join(restored, 'database.dump'), 'r'), restoreLog = openSync(join(folder, 'restore.private.log'), 'wx', 0o600);
  let recovered;
  try { recovered = spawnSync('/usr/bin/docker', ['exec', '-i', target, 'pg_restore', '-U', 'supabase_admin', '-d', database, '--exit-on-error'], { env: environment, stdio: [restoreInput, restoreLog, restoreLog], timeout: 180_000 }); }
  finally { closeSync(restoreInput); closeSync(restoreLog); }
  assert.equal(recovered.status, 0, 'Native PostgreSQL recovery failed; inspect private restore log.');
  // pg_restore changed the ordinary owner ACL of two generated identity
  // sequences. Reapply ONLY the captured source owner privileges; the complete
  // grant comparison below still rejects any extra or missing permissions.
  for (const s of recovery.sequenceOwnerPrivileges) {
    assert.ok(s.privileges.every(p => ['SELECT','UPDATE','USAGE'].includes(p)));
    if (s.privileges.length) sql(target, `grant ${s.privileges.join(',')} on sequence ${identifier(s.schema_name)}.${identifier(s.sequence_name)} to ${identifier(s.owner_name)};`, database);
  }
  const after = JSON.parse(sql(target, manifestSql, database));
  writeFileSync(join(folder, 'restored-manifest.private.json'), JSON.stringify(after), { mode: 0o600 });
  assert.ok(JSON.stringify(after) === JSON.stringify(before), 'Restored records, ownership, RLS or functions differ; compare private manifests.');
  const passwordValid = sql(target, `select encrypted_password=extensions.crypt(${literal(identity.password)},encrypted_password) from auth.users where id=${literal(owner.id)};`, database).trim();
  assert.equal(passwordValid, 't');
  checks.push('Every business/Auth/Storage table fingerprint, RLS policy, grant/owner and public/private function matched; the original synthetic password still verifies.');

  const authClaims = JSON.stringify({ sub: owner.id, role: 'authenticated' });
  const retry = JSON.parse(sql(target, `begin;set local role authenticated;select set_config('request.jwt.claims',${literal(authClaims)},true);select public.record_manual_invoice_payment_request(${literal(paymentArgs.p_request_id)},${literal(invoiceId)},24000,${literal(paymentArgs.p_paid_at)}::timestamptz,'cash',${literal(paymentArgs.p_reference)},${literal(paymentArgs.p_notes)});commit;`, database).trim().split('\n').at(-1));
  assert.equal(retry.payment_id, payment.payment_id);
  const settled = JSON.parse(sql(target, `select jsonb_build_object('payments',(select count(*) from public.payments where invoice_id=${literal(invoiceId)}),'balance',(select balance_due_cents from public.invoices where id=${literal(invoiceId)}));`, database));
  assert.equal(settled.payments, 1); assert.equal(settled.balance, 0);
  for (const delivery of [accepted, uncertain]) {
    const claim = sql(target, `begin;set local role service_role;select coalesce(public.claim_outbound_delivery(${literal(delivery)})::text,'NULL');commit;`, database).trim();
    assert.equal(claim, 'NULL');
  }
  checks.push('Replaying the payment keeps one payment and a zero balance; accepted and uncertain email rows cannot be claimed for dispatch.');
  const targetInfo = JSON.parse(docker('inspect', target))[0];
  assert.deepEqual(targetInfo.HostConfig.PortBindings ?? {}, {});
  assert.equal(JSON.parse(docker('network', 'inspect', network))[0].Internal, true);
  assert.equal(targetInfo.HostConfig.Memory, 768 * 1024 * 1024);
  const report = {
    scope: 'Native self-hosted synthetic PostgreSQL recovery, not production migration or managed-cloud import',
    sourceMigrationCount: 126, sourceVersion: version, databaseImage: info.Image,
    tableFingerprintsMatched: before.tables.length, checks,
    privateObjectsRecovered: recovery.objects.length,
    actualEmailsSent: 0, realPaymentsMade: 0, publicPortsPublished: 0,
    postgresRecoveryPassed: true, managedSupabaseImportTested: false,
    offsiteRecoveryVerified: false, productionBaseline102Tested: false,
    fiveMinuteRecoveryTargetProven: false, productionChanged: false, scannerChanged: false,
  };
  writeFileSync(join(folder, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  writeFileSync(join(base, 'latest-recovery-report.json'), JSON.stringify({ folder, ...report }, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (client) await client.auth.signOut({ scope: 'global' }).catch(() => {});
  if (owner && service) {
    ok(await service.auth.admin.updateUserById(owner.id, { ban_duration: '87600h' }));
    ok(await service.from('profiles').update({ status: 'disabled' }).eq('id', owner.id));
    ok(await service.from('employee_records').update({ is_active: false, employment_status: 'separated' }).eq('auth_user_id', owner.id));
  }
  if (targetStarted) docker('stop', '--time', '20', target);
  // Retain the stopped clone, volume, synthetic source records and private evidence.
}
