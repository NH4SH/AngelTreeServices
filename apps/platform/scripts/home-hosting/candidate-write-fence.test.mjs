import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.HOME_HOSTING_PGLITE_MODULE ?? '@electric-sql/pglite');
const install = readFileSync(new URL('./candidate-write-fence.sql', import.meta.url), 'utf8');

async function fixture() {
  const db = new PGlite(); await db.waitReady;
  await db.exec(`create role fixture_api; create role fixture_auth; create role fixture_storage;
    create schema app_private; create schema auth; create schema storage;
    create table public.invoice_fixture(id integer primary key,amount integer not null);
    create table auth.session_fixture(id integer primary key);
    create table storage.object_fixture(id integer primary key);
    grant usage on schema public,auth,storage to fixture_api,fixture_auth,fixture_storage;
    grant all on public.invoice_fixture to fixture_api;
    grant all on auth.session_fixture to fixture_auth;
    grant all on storage.object_fixture to fixture_storage;
    create function public.definer_write(p_id integer) returns void language sql security definer set search_path='' as 'insert into public.invoice_fixture values(p_id,100)';
    grant execute on function public.definer_write(integer) to fixture_api;`);
  await db.exec(install);
  return db;
}
async function actor(db, name, sql) {
  await db.exec(`set session authorization ${name};`);
  try { return await db.exec(sql); }
  // PGlite's RESET SESSION AUTHORIZATION retains the most recent session role.
  // Explicitly return this originally-superuser fixture connection to postgres.
  finally { await db.exec('rollback; set session authorization postgres;'); }
}
async function lease(db, epoch = 1, holder = 'synthetic-home') {
  await db.query(`select hosting_guard.accept_rehearsal_lease($1,$2,clock_timestamp(),clock_timestamp()+interval '20 seconds',clock_timestamp()-interval '1 minute')`, [epoch, holder]);
}
const maintenance = error => error.code === 'PT503';
const forbidden = error => error.code === '42501';

test('cold candidate refuses API, Auth and Storage writes while permitting reads', async t => {
  const db = await fixture(); t.after(() => db.close());
  await assert.rejects(actor(db, 'fixture_api', 'insert into public.invoice_fixture values(1,100)'), maintenance);
  await assert.rejects(actor(db, 'fixture_auth', 'insert into auth.session_fixture values(1)'), maintenance);
  await assert.rejects(actor(db, 'fixture_storage', 'insert into storage.object_fixture values(1)'), maintenance);
  await actor(db, 'fixture_api', 'select * from public.invoice_fixture');
  assert.equal((await db.query('select count(*)::int n from public.invoice_fixture')).rows[0].n, 0);
});

test('a current local lease permits ordinary writes without bypassing role permissions', async t => {
  const db = await fixture(); t.after(() => db.close()); await lease(db);
  await actor(db, 'fixture_api', 'insert into public.invoice_fixture values(1,100)');
  await assert.rejects(actor(db, 'fixture_auth', 'insert into public.invoice_fixture values(2,100)'), forbidden);
  await assert.rejects(actor(db, 'fixture_api', 'select * from hosting_guard.state'), forbidden);
  assert.equal((await db.query('select count(*)::int n from public.invoice_fixture')).rows[0].n, 1);
});

test('business SECURITY DEFINER functions cannot bypass an expired lease', async t => {
  const db = await fixture(); t.after(() => db.close()); await lease(db);
  await actor(db, 'fixture_api', 'select public.definer_write(1)');
  await db.exec("update hosting_guard.state set expires_at=clock_timestamp()-interval '1 second'");
  await assert.rejects(actor(db, 'fixture_api', 'select public.definer_write(2)'), maintenance);
});

test('expiry is checked again at transaction commit, rolling back work admitted earlier', async t => {
  const db = await fixture(); t.after(() => db.close()); await lease(db);
  await db.exec('set session authorization fixture_api;begin;insert into public.invoice_fixture values(1,100);set session authorization postgres;');
  await db.exec("update hosting_guard.state set expires_at=clock_timestamp()-interval '1 second';set session authorization fixture_api;");
  await assert.rejects(db.exec('commit;'), maintenance);
  await db.exec('rollback;set session authorization postgres;');
  assert.equal((await db.query('select count(*)::int n from public.invoice_fixture')).rows[0].n, 0);
});

test('database restart binding and stale offsite capture both fail closed', async t => {
  const db = await fixture(); t.after(() => db.close()); await lease(db);
  await db.exec("update hosting_guard.state set database_started_at=database_started_at-interval '1 second'");
  await assert.rejects(actor(db, 'fixture_api', 'insert into public.invoice_fixture values(1,100)'), maintenance);
  await lease(db);
  await db.exec("update hosting_guard.state set capture_started_at=clock_timestamp()-interval '6 minutes'");
  await assert.rejects(actor(db, 'fixture_api', 'insert into public.invoice_fixture values(1,100)'), maintenance);
});

test('old generations and a different holder cannot reopen the previous primary', async t => {
  const db = await fixture(); t.after(() => db.close()); await lease(db);
  await lease(db, 2, 'synthetic-cloud');
  await assert.rejects(actor(db, 'fixture_api', 'insert into public.invoice_fixture values(1,100)'), maintenance);
  await assert.rejects(lease(db, 1), error => error.code === '22023');
  await assert.rejects(lease(db, 2), error => error.code === '22023');
});

test('a schema change closes writes until its tables are explicitly enrolled', async t => {
  const db = await fixture(); t.after(() => db.close()); await lease(db);
  await db.exec('create table public.new_fixture(id integer);');
  await assert.rejects(actor(db, 'fixture_api', 'insert into public.invoice_fixture values(1,100)'), maintenance);
  await assert.rejects(lease(db), error => error.code === '22023');
  await db.exec('select hosting_guard.enroll_tables();'); await lease(db);
  await actor(db, 'fixture_api', 'insert into public.invoice_fixture values(1,100)');
  assert.equal((await db.query("select count(*)::int n from pg_trigger where tgrelid='public.new_fixture'::regclass and tgname in ('ats_hosting_admission','ats_hosting_commit')")).rows[0].n, 2);
});

test('a service cannot create an unfenced business table inside its own transaction', async t => {
  const db = await fixture(); t.after(() => db.close()); await lease(db);
  await db.exec('grant create on schema auth to fixture_auth;');
  await assert.rejects(actor(db, 'fixture_auth', 'create table auth.unfenced_fixture(id integer);'), forbidden);
  assert.equal((await db.query("select to_regclass('auth.unfenced_fixture') is null absent")).rows[0].absent, true);
});

test('a no-op startup table check does not invalidate an already enrolled schema', async t => {
  const db = await fixture(); t.after(() => db.close()); await lease(db);
  await db.exec('grant create on schema auth to fixture_auth;alter table auth.session_fixture owner to fixture_auth;select hosting_guard.enroll_tables();'); await lease(db);
  await actor(db, 'fixture_auth', 'create table if not exists auth.session_fixture(id integer primary key);');
  await actor(db, 'fixture_api', 'insert into public.invoice_fixture values(1,100)');
});

test('service table ownership cannot be used to remove its fence trigger', async t => {
  const db = await fixture(); t.after(() => db.close());
  await db.exec('alter table auth.session_fixture owner to fixture_auth;select hosting_guard.enroll_tables();'); await lease(db);
  await assert.rejects(actor(db, 'fixture_auth', 'drop trigger ats_hosting_admission on auth.session_fixture'), forbidden);
  assert.equal((await db.query("select count(*)::int n from pg_trigger where tgrelid='auth.session_fixture'::regclass and tgname='ats_hosting_admission'")).rows[0].n, 1);
});

test('TRUNCATE cannot bypass row checks through an application login', async t => {
  const db = await fixture(); t.after(() => db.close()); await lease(db);
  await actor(db, 'fixture_api', 'insert into public.invoice_fixture values(1,100)');
  await assert.rejects(actor(db, 'fixture_api', 'truncate public.invoice_fixture'), forbidden);
  assert.equal((await db.query('select count(*)::int n from public.invoice_fixture')).rows[0].n, 1);
});
