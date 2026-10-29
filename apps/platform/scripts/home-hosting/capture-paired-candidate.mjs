// Explicit, synthetic-only capture for the paired protocol. No production
// installer, provider credentials, automatic schedule or admission action.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, renameSync, unlinkSync } from 'node:fs';
import { CandidateIO, digest, literal, identifier } from './candidate-io.mjs';
import { captureManifestSql } from './capture-manifest.mjs';
import { functionMetadataSql } from './function-metadata.mjs';
import { schemaContentFingerprint } from './schema-fingerprint.mjs';
import { staticIdentity, validateStaticBase } from './paired-backup-policy.mjs';
import { runtimeBlueprint } from './runtime-blueprint.mjs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

assert.equal(process.env.ATS_PAIRED_REHEARSAL, '1');
const [mode, id, sequenceText] = process.argv.slice(2);
assert.ok(['base', 'data'].includes(mode)); assert.match(id, /^[a-f0-9]{12}$/);
const sequence = Number(sequenceText); assert.ok(Number.isSafeInteger(sequence) && sequence > 0 && sequence <= 1000);
process.env.HOME_FAILOVER_REHEARSAL = '1'; process.env.ATS_FAILOVER_RUN_ID = id;
const io = new CandidateIO(); io.folder = io.root + '/continuous-' + id;
io.namespace = 'ats-rehearsal-continuous-' + id;
const binding = JSON.parse(readFileSync(io.folder + '/binding.json'));
assert.equal(binding.namespace, io.namespace);
assert.equal(binding.sourceBoot, readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim());
assert.equal(binding.databaseBoot, io.sql('select pg_postmaster_start_time()::text;'));
assert.equal(binding.topology, io.sql('select hosting_guard.catalog_fingerprint();'));
io.assertSource();
const services = ['db', 'app', 'api-gw', 'auth', 'rest', 'storage', 'imgproxy'];
for (const service of services) {
  const info = io.inspect(io.project + '-' + service + '-1');
  assert.equal(info.Id, binding.containers[service]); assert.equal(info.HostConfig.RestartPolicy.Name, 'no');
}
const lastFile = io.folder + '/paired-sequence.json';
if (existsSync(lastFile)) assert.ok(sequence > JSON.parse(readFileSync(lastFile)).sequence);
writeFileSync(lastFile + '.new', JSON.stringify({ sequence }), { mode: 0o600 }); renameSync(lastFile + '.new', lastFile);
const out = io.folder + '/capture-' + sequence, evidence = io.folder + '/evidence-' + sequence;
mkdirSync(out, { mode: 0o700 }); mkdirSync(evidence, { mode: 0o700 });
writeFileSync(io.folder + '/capture.lock', String(sequence), { mode: 0o600, flag: 'wx' });
const allowedRoles = ['authenticator', 'supabase_auth_admin', 'supabase_storage_admin', 'candidate_fence_api'];
const startedAt = new Date().toISOString(), startedBootMs = Number(readFileSync('/proc/uptime', 'utf8').split(' ')[0]) * 1000;
const paused = []; let captured = false, manifest;
try {
  io.sql(`begin;select pg_advisory_xact_lock(178214,4110);update hosting_guard.state set capture_in_progress=true;${allowedRoles.map(r => 'alter role ' + identifier(r) + ' nologin;').join('')}commit;`);
  for (const service of services.filter(s => s !== 'db')) {
    const info = io.inspect(io.project + '-' + service + '-1');
    if (info.State.Running) { io.docker(['pause', info.Id], { timeout: 5000 }); paused.push(info.Id); }
  }
  io.sql("select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and usename not in('postgres','supabase_admin') and pid<>pg_backend_pid();");
  assert.equal(Number(io.sql("select count(*) from pg_stat_activity where datname=current_database() and usename not in('postgres','supabase_admin');")), 0);
  const database = JSON.parse(io.sql(captureManifestSql));
  const dump = (option, path) => io.binary(['exec', io.db, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '-Fc', '-Z', '9', option], path);
  dump('--schema-only', evidence + '/schema-check.dump');
  const schemaFingerprint = schemaContentFingerprint(readFileSync(evidence + '/schema-check.dump'));
  if (mode === 'data') {
    dump('--data-only', out + '/database.dump');
    renameSync(out + '/database.dump.private.log', evidence + '/data-dump.private.log');
  }
  const image = 'node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d';
  const mount = 'type=volume,src=' + io.project + '_object-data,dst=/objects,readonly';
  const volumeRun = ['run', '--rm', '--network', 'none', '--read-only', '--user', '1000:1000', '--cap-drop', 'ALL', '--memory', '128m', '--memory-swap', '128m', '--mount', mount];
  io.binary([...volumeRun, '--entrypoint', 'tar', image, '-C', '/objects', '-cf', '-', '.'], evidence + '/objects.tar');
  const inventory = `const fs=require('fs'),p=require('path'),c=require('crypto'),out=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isSymbolicLink())throw Error('Unexpected symlink');if(e.isDirectory())walk(f);else{const b=fs.readFileSync(f);out.push({path:p.relative('/objects',f),size:b.length,sha256:c.createHash('sha256').update(b).digest('hex')});}}}walk('/objects');console.log(JSON.stringify(out.sort((a,b)=>a.path.localeCompare(b.path))));`;
  const objects = JSON.parse(io.docker([...volumeRun, image, 'node', '-e', inventory]));
  const roles = JSON.parse(io.sql("select jsonb_agg(to_jsonb(r) order by rolname) from(select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles where rolname !~ '^pg_')r;"));
  const memberships = JSON.parse(io.sql("select coalesce(jsonb_agg(to_jsonb(m) order by role_name,member_name),'[]') from(select r.rolname role_name,u.rolname member_name,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles u on u.oid=a.member)m;"));
  const sequenceOwnerPrivileges = JSON.parse(io.sql("select coalesce(jsonb_agg(to_jsonb(s) order by schema_name,sequence_name),'[]') from(select n.nspname schema_name,c.relname sequence_name,pg_get_userbyid(c.relowner) owner_name,array(select privilege_type from aclexplode(coalesce(c.relacl,acldefault('S',c.relowner)))a where a.grantee=c.relowner and a.grantor=c.relowner order by privilege_type) privileges from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname in('public','app_private','auth','storage'))s;"));
  copyFileSync(io.root + '/selfhost/core.private.env', evidence + '/core.private.env');
  copyFileSync(io.root + '/selfhost/app.private.env', evidence + '/app.private.env');
  copyFileSync(io.folder + '/release-source-scoped.tar.gz', evidence + '/release-source.tar.gz');
  const fields = { schemaContentFingerprint: schemaFingerprint,
    rolesSha256: digest(JSON.stringify([roles, memberships, sequenceOwnerPrivileges])),
    coreConfigSha256: digest(readFileSync(evidence + '/core.private.env')),
    appConfigSha256: digest(readFileSync(evidence + '/app.private.env')),
    releaseSourceSha256: digest(readFileSync(evidence + '/release-source.tar.gz')),
    objectInventorySha256: digest(JSON.stringify(objects)),
    runtimeManifestSha256: runtimeBlueprint(io.root+'/selfhost',dirname(fileURLToPath(import.meta.url))).sha256 };
  const identity = staticIdentity(fields);
  let base, certificate;
  if (existsSync(io.folder + '/base-certificate.json')) {
    certificate = JSON.parse(readFileSync(io.folder + '/base-certificate.json'));
    base = validateStaticBase(certificate, readFileSync(io.folder + '/authority-public.pem'), binding);
  }
  if (mode === 'base') {
    const previous = existsSync(io.folder + '/base-ticket.json') ? JSON.parse(readFileSync(io.folder + '/base-ticket.json')) : null;
    const oldSchema = previous && io.folder + '/capture-' + previous.sequence + '/database.dump';
    // Preserve an already verified native schema archive when only its creation
    // date differs. Compare every other byte first; never rewrite archive bytes.
    const schema = base?.staticBinding.schemaContentFingerprint === schemaFingerprint && oldSchema && existsSync(oldSchema)
      ? oldSchema : evidence + '/schema-check.dump';
    assert.equal(schemaContentFingerprint(readFileSync(schema)), schemaFingerprint);
    copyFileSync(schema, out + '/database.dump');
    for (const name of ['objects.tar', 'core.private.env', 'app.private.env', 'release-source.tar.gz']) copyFileSync(evidence + '/' + name, out + '/' + name);
  }
  assert.deepEqual(JSON.parse(io.sql(captureManifestSql)), database);
  manifest = { version: 1, syntheticOnly: true, backupLayout: mode === 'base' ? 'schema-base-v1' : 'data-only-v1',
    namespace: io.namespace, binding, sequence, sourceMigrationCount: 102,
    captureStartedAt: startedAt, captureStartedBootMs: startedBootMs, captureCompletedAt: new Date().toISOString(),
    database, functions: JSON.parse(io.sql(functionMetadataSql)), roles, memberships, sequenceOwnerPrivileges,
    objects, schemaContentFingerprint: schemaFingerprint, staticBinding: fields, staticIdentitySha256: identity,
    ...(mode==='base'?{runtime:runtimeBlueprint(io.root+'/selfhost',dirname(fileURLToPath(import.meta.url))).blueprint}:{}),
    sourceDbImage: io.inspect(io.db).Image, databaseSha256: digest(readFileSync(out + '/database.dump')),
    objectArchiveSha256: digest(readFileSync(evidence + '/objects.tar')), releaseSourceSha256: fields.releaseSourceSha256,
    ...(mode === 'data' && base ? { staticSnapshotId: base.snapshotId, staticCertificateSha256: digest(JSON.stringify(certificate)) } : {}) };
  writeFileSync(out + '/manifest.private.json', JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 }); captured = true;
} finally {
  if (captured) {
    io.sql(`begin;select pg_advisory_xact_lock(178214,4110);update hosting_guard.state set capture_in_progress=false where singleton;
      do $resume$ begin if exists(select 1 from hosting_guard.state where singleton and epoch=${binding.generation}
       and holder=local_node and database_started_at=pg_postmaster_start_time() and expires_at>clock_timestamp()+interval '1 second'
       and capture_started_at+interval '5 minutes'>clock_timestamp()) then ${allowedRoles.map(r => 'alter role ' + identifier(r) + ' login;').join('')} end if;end $resume$;commit;`);
    for (const container of paused) io.docker(['unpause', container], { timeout: 5000 });
    unlinkSync(io.folder + '/capture.lock');
  }
}
if (mode === 'data') {
  const certificate = existsSync(io.folder + '/base-certificate.json') && JSON.parse(readFileSync(io.folder + '/base-certificate.json'));
  const base = certificate && validateStaticBase(certificate, readFileSync(io.folder + '/authority-public.pem'), binding);
  if (!base || base.staticIdentitySha256 !== manifest.staticIdentitySha256) {
    console.log(JSON.stringify({ requiresStaticBase: true, sequence, sourceWritesAdmitted: false })); process.exit(2);
  }
}
const binary = io.root + '/recovery-tools/restic_0.19.1_linux_arm64';
assert.equal(digest(readFileSync(binary)), '2fb45ac6f9071b6f20eb883953a188f9e7c7cb6bbe43c67a2e47ada4e85ee7f0');
if (!existsSync(io.folder + '/dynamic-repositories')) mkdirSync(io.folder + '/dynamic-repositories', { mode: 0o700 });
const repo = mode === 'base' ? io.folder + '/static-repository' : io.folder + '/dynamic-repositories/' + sequence;
const restic = args => io.run(binary, ['--repo', repo, '--password-file', io.folder + '/recovery-password.private', '--no-cache', ...args], { timeout: 45000 }).stdout;
if (!existsSync(repo + '/config')) restic(['init', '--repository-version', '2']);
const backup = restic(['backup', '--json', '--compression', 'max', '--pack-size', '8', '--tag', 'paired-synthetic', out]);
const summary = backup.trim().split('\n').map(s => JSON.parse(s)).find(s => s.message_type === 'summary');
restic(['check', '--read-data']);
const ticket = { ...binding, sequence, snapshotId: summary.snapshot_id, capturePath: out,
  manifestSha256: digest(readFileSync(out + '/manifest.private.json')), backupExitCode: 0,
  captureStartedAt: manifest.captureStartedAt, captureStartedBootMs: startedBootMs,
  captureCompletedAt: manifest.captureCompletedAt, pausedMs: Date.parse(manifest.captureCompletedAt) - Date.parse(startedAt) };
io.json('ticket-' + sequence + '.json', ticket);
if (mode === 'base') io.json('base-ticket.json', ticket);
console.log(JSON.stringify({ mode, ticket, repo, sourceWritesAdmitted: false }));
