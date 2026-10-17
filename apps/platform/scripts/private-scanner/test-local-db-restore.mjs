// Opt-in catalog recovery drill. Never connects to a hosted database, resets the
// review stack, restores globals/role passwords, or restores over an existing DB.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

assert.equal(process.env.SCANNER_RESTORE_DISPOSABLE, '1');
assert.match(process.env.DOCKER_HOST ?? '', /^unix:.*pr02-disposable\/sock\/docker.sock$/);
const docker = process.env.ATTACHMENT_DOCKER_BIN; assert.ok(docker);
const container = 'supabase_db_ats_pr02_disposable';
const source = 'ats_upload_access_v1_20261017', target = 'ats_restore_local_' + randomUUID().replaceAll('-', '');
const run = (args, options = {}) => execFileSync(docker, ['exec', '-i', container, ...args], { env: process.env, maxBuffer: 64 * 1024 * 1024, timeout: 60000, ...options });
const sql = (database, command) => run(['psql', '-X', '-qAt', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-c', command], { encoding: 'utf8' }).trim();
assert.equal(sql('postgres', `select count(*) from pg_database where datname='${source}'`), '1');
assert.equal(sql(source, 'select (select count(*) from auth.users)+(select count(*) from storage.objects)+(select count(*) from public.invoices)+(select count(*) from public.payments)+(select count(*) from public.customers)'), '0');
assert.equal(sql('postgres', `select count(*) from pg_database where datname='${target}'`), '0');
const functions = "select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'config',p.proconfig,'definer',p.prosecdef) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')";
const policies = "select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','storage')";
const tables = "select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',coalesce(c.relacl,acldefault('r',c.relowner))) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','storage') and c.relkind='r'";
const before = { functions: sql(source, functions), policies: sql(source, policies), tables: sql(source, tables), buckets: sql(source, 'select jsonb_agg(to_jsonb(b) order by id) from storage.buckets b') };
const directory = mkdtempSync(join(tmpdir(), 'ats-catalog-restore-'));
const archive = run(['pg_dump', '-U', 'postgres', '-d', source, '-Fc']);
writeFileSync(join(directory, 'empty-catalog.private.dump'), archive, { mode: 0o600 });
sql('postgres', `create database ${target} template template0`);
// Keep template0's empty public schema: pg_dump treats it as pre-existing.
// --clean is unsuitable: DROP POLICY ... ON storage.objects still errors when
// storage does not exist, even with IF EXISTS. Never clean an existing DB.
assert.equal(sql(target, "select count(*) from pg_class where relnamespace='public'::regnamespace"), '0');
// The local cluster administrator can preserve Supabase-owned schemas. Do not
// weaken ownership with --no-owner, grant roles, or copy this to hosted Supabase.
run(['pg_restore', '-U', 'supabase_admin', '-d', target, '--exit-on-error', '--single-transaction'], { input: archive });
const canonical = text => JSON.parse(text, (key, value) => key === 'acl' && Array.isArray(value) ? value.sort() : value);
for (const [name, query] of Object.entries({ functions, policies, tables })) assert.deepEqual(canonical(sql(target, query)), canonical(before[name]), name + ' must survive restore (ACL ordering is immaterial)');
assert.equal(sql(target, 'select jsonb_agg(to_jsonb(b) order by id) from storage.buckets b'), before.buckets);
assert.equal(sql(target, 'select enabled from app_private.document_scan_settings where singleton'), 'f');
assert.equal(sql(target, 'select bool_or(enabled) from app_private.attachment_scan_settings'), 'f');
assert.equal(sql(target, 'select (select count(*) from auth.users)+(select count(*) from storage.objects)'), '0');
const counts = sql(target, "select jsonb_build_object('functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),'policies',(select count(*) from pg_policies where schemaname in ('public','storage')))");
// The independent source replay executed SQL files directly; do not fabricate a
// Supabase CLI migration ledger or confuse repository versions with ledger rows.
const repositoryMigrationFiles = readdirSync(new URL('../../../../supabase/migrations/', import.meta.url)).filter(x => x.endsWith('.sql')).length;
const result = { source, target, ...JSON.parse(counts), repositoryMigrationFiles, sourceMigrationLedgerPresent: sql(source, "select to_regclass('supabase_migrations.schema_migrations') is not null") === 't', restoredFunctionDefinitionsAndGrants: true, restoredPoliciesAndRLS: true, restoredPrivateBuckets: true, scanGatesDefaultOff: true, storagePayloadsIncluded: false, scope: 'empty 92-migration catalog in existing disposable cluster; not production PITR or global-role recovery' };
writeFileSync(join(directory, 'results.json'), JSON.stringify(result, null, 2));
if (process.env.SCANNER_RESTORE_RESULTS_FILE) writeFileSync(process.env.SCANNER_RESTORE_RESULTS_FILE, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
