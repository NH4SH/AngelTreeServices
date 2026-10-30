// Explicit synthetic-only proof of native schema/data recovery. Original source,
// fixture archives, credentials and cloud services are never changed.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { CandidateIO, digest, literal, identifier } from './candidate-io.mjs';
import { captureManifestSql } from './capture-manifest.mjs';
import { functionMetadataSql, compareRecoveredManifest } from './function-metadata.mjs';
import { schemaContentFingerprint } from './schema-fingerprint.mjs';

assert.equal(process.env.ATS_SPLIT_REHEARSAL, '1');
const id = process.argv[2]; assert.match(id, /^[a-f0-9]{12}$/);
process.env.HOME_FAILOVER_REHEARSAL = '1'; process.env.ATS_FAILOVER_RUN_ID = id;
const io = new CandidateIO(); io.folder = io.root + '/split-' + id;
assert.equal(existsSync(io.folder), false); mkdirSync(io.folder, { mode: 0o700 });
await io.ready(); io.assertSource();
for (const service of ['app', 'auth', 'rest', 'storage', 'imgproxy', 'api-gw']) {
  assert.equal(io.inspect(io.project + '-' + service + '-1').State.Running, false);
}
assert.equal(Number(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');")), 0);
const startedAt = new Date().toISOString(), before = JSON.parse(io.sql(captureManifestSql));
const functions = JSON.parse(io.sql(functionMetadataSql));
const roles = JSON.parse(io.sql("select jsonb_agg(to_jsonb(r) order by rolname) from(select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles where rolname !~ '^pg_')r;"));
const memberships = JSON.parse(io.sql("select coalesce(jsonb_agg(to_jsonb(m) order by role_name,member_name),'[]') from(select r.rolname role_name,u.rolname member_name,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles u on u.oid=a.member)m;"));
const sequenceOwnerPrivileges = JSON.parse(io.sql("select coalesce(jsonb_agg(to_jsonb(s) order by schema_name,sequence_name),'[]') from(select n.nspname schema_name,c.relname sequence_name,pg_get_userbyid(c.relowner) owner_name,array(select privilege_type from aclexplode(coalesce(c.relacl,acldefault('S',c.relowner)))a where a.grantee=c.relowner and a.grantor=c.relowner order by privilege_type) privileges from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname in('public','app_private','auth','storage'))s;"));
const dump = (mode, file) => io.binary(['exec', io.db, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '-Fc', '-Z', '9', mode], io.folder + '/' + file);
dump('--schema-only', 'schema.dump'); dump('--data-only', 'data.dump');
await new Promise(resolve => setTimeout(resolve, 1100));
dump('--schema-only', 'schema-later.dump');
assert.equal(schemaContentFingerprint(readFileSync(io.folder + '/schema.dump')),
  schemaContentFingerprint(readFileSync(io.folder + '/schema-later.dump')));
assert.notEqual(digest(readFileSync(io.folder + '/schema.dump')), digest(readFileSync(io.folder + '/schema-later.dump')));
assert.deepEqual(JSON.parse(io.sql(captureManifestSql)), before);
const manifest = { version: 1, syntheticOnly: true, captureStartedAt: startedAt,
  captureCompletedAt: new Date().toISOString(), database: before, functions, roles, memberships, sequenceOwnerPrivileges,
  schemaSha256: digest(readFileSync(io.folder + '/schema.dump')),
  schemaContentFingerprint: schemaContentFingerprint(readFileSync(io.folder + '/schema.dump')),
  dataSha256: digest(readFileSync(io.folder + '/data.dump')), sourceDbImage: io.inspect(io.db).Image };
io.json('manifest.private.json', manifest);

const project = 'ats_crm_recovery_' + id, target = project + '-db-1', dir = io.folder + '/restore';
mkdirSync(dir, { mode: 0o700 });
const config = JSON.parse(readFileSync(io.root + '/selfhost/compose.json'));
config.name = project; config.services = { db: config.services.db };
config.volumes = { 'pg-data': {}, 'db-config': {} };
config.services.db.volumes = config.services.db.volumes.map(v => v.startsWith('./volumes/') ? io.root + '/selfhost/' + v.slice(2) : v);
copyFileSync(io.root + '/selfhost/core.private.env', dir + '/core.private.env');
writeFileSync(dir + '/compose.json', JSON.stringify(config), { mode: 0o600 });
const compose = ['compose', '--env-file', dir + '/core.private.env', '-f', dir + '/compose.json'];
let report = { passed: false, syntheticOnly: true, productionChanged: false };
try {
  io.docker([...compose, 'up', '-d', '--wait', '--wait-timeout', '120', 'db']); await io.ready(target);
  const info = io.inspect(target);
  assert.equal(info.Config.Labels['com.docker.compose.project'], project);
  assert.equal(info.Image, manifest.sourceDbImage); assert.deepEqual(info.HostConfig.PortBindings ?? {}, {});
  assert.equal(Number(io.sql('select count(*) from auth.users;', { container: target })), 0);
  for (const role of roles) {
    if (['postgres', 'supabase_admin'].includes(role.rolname)) continue;
    const flags = [[role.rolsuper, 'SUPERUSER'], [role.rolinherit, 'INHERIT'], [role.rolcreaterole, 'CREATEROLE'],
      [role.rolcreatedb, 'CREATEDB'], [false, 'LOGIN'], [role.rolreplication, 'REPLICATION'], [role.rolbypassrls, 'BYPASSRLS']]
      .map(([v, k]) => (v ? '' : 'NO') + k).join(' ');
    io.sql(`do $$begin if not exists(select 1 from pg_roles where rolname=${literal(role.rolname)}) then create role ${identifier(role.rolname)} ${flags};else alter role ${identifier(role.rolname)} nologin;end if;end$$;`, { container: target });
  }
  for (const m of memberships) io.sql(`grant ${identifier(m.role_name)} to ${identifier(m.member_name)} with admin ${m.admin_option},inherit ${m.inherit_option},set ${m.set_option};`, { container: target });
  io.sql('drop database postgres with(force);', { container: target, database: 'template1' });
  io.sql('create database postgres with template template0;', { container: target, database: 'template1' });
  const restore = (file, args, label) => io.binary(['exec', '-i', target, 'pg_restore', '-U', 'supabase_admin',
    '-d', 'postgres', '--exit-on-error', ...args], dir + '/' + label + '.private.log', { inputFile: io.folder + '/' + file });
  restore('schema.dump', ['--section=pre-data'], 'pre-data');
  restore('data.dump', ['--data-only', '--disable-triggers'], 'data');
  restore('schema.dump', ['--section=post-data'], 'post-data');
  for (const s of sequenceOwnerPrivileges) if (s.privileges.length) {
    assert.ok(s.privileges.every(p => ['SELECT', 'UPDATE', 'USAGE'].includes(p)));
    io.sql(`grant ${s.privileges.join(',')} on sequence ${identifier(s.schema_name)}.${identifier(s.sequence_name)} to ${identifier(s.owner_name)};`, { container: target });
  }
  const actual = JSON.parse(io.sql(captureManifestSql, { container: target }));
  const comparison = compareRecoveredManifest(before, actual, functions, JSON.parse(io.sql(functionMetadataSql, { container: target })));
  assert.equal(Number(io.sql("select count(*) from auth.users where email not like '%@example.invalid';", { container: target })), 0);
  assert.equal(Number(io.sql("select count(*) from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin');", { container: target })), 0);
  assert.equal(io.sql('select database_started_at<>pg_postmaster_start_time() from hosting_guard.state;', { container: target }), 't');
  report = { ...report, passed: true, sourceTables: before.tables.length, comparison,
    schemaBytes: readFileSync(io.folder + '/schema.dump').length, dataBytes: readFileSync(io.folder + '/data.dump').length,
    schemaFingerprintStableAcrossCreationDates: true, originalArchivesUnmodified: true,
    coldClosed: true, sourceUnchanged: true };
  assert.deepEqual(JSON.parse(io.sql(captureManifestSql)), before);
} finally {
  io.docker(['stop', '--time', '3', target]);
  report.targetStopped = !io.inspect(target).State.Running; io.json('result.json', report);
}
console.log(JSON.stringify(report));
