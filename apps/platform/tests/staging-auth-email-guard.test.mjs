import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { localConfiguration } from '../scripts/testing/auth-email-guard.mjs';
const root = new URL('../../../', import.meta.url), read = p => readFileSync(new URL(p, root), 'utf8');
const manifest = JSON.parse(read('supabase/staging/auth-email-guard/package.json'));
function fixture(url = 'postgresql://synthetic:fixture@127.0.0.1:54322/postgres', api = 'http://127.0.0.1:54321') {
    const directory = mkdtempSync(join(tmpdir(), 'ats-guard-unit-')), file = join(directory, 'local-status.private.json');
    writeFileSync(file, JSON.stringify({ API_URL: api, DB_URL: url }), { mode: 0o600 });
    return { AUTH_EMAIL_GUARD_DISPOSABLE: '1', DOCKER_HOST: 'unix:///fixture/pr02-disposable/sock/docker.sock', AUTH_EMAIL_GUARD_LOCAL_STATUS_FILE: file, AUTH_EMAIL_GUARD_DOCKER_BIN: '/not/invoked/docker', AUTH_EMAIL_GUARD_SUPABASE_BIN: '/not/invoked/supabase', AUTH_EMAIL_GUARD_BOOTSTRAP: '/not/read/bootstrap.sql' };
}
test('rehearsal requires explicit opt-in and the existing disposable socket before any tool', () => {
    const f = fixture();
    for (const change of [{ AUTH_EMAIL_GUARD_DISPOSABLE: undefined }, { AUTH_EMAIL_GUARD_DISPOSABLE: '0' }, { DOCKER_HOST: 'unix:///var/run/docker.sock' }])
        assert.throws(() => localConfiguration({ ...f, ...change }));
    assert.equal(localConfiguration(f).url.hostname, '127.0.0.1');
});
test('hosted API/database, alternate ports/databases and decorated URLs are rejected without network', () => {
    for (const [url, api] of [['postgresql://fixture@db.gbyhdsuiqeslgjdnbqng.supabase.co/postgres', 'http://127.0.0.1:54321'], ['postgresql://fixture@127.0.0.1:54322/postgres', 'https://gbyhdsuiqeslgjdnbqng.supabase.co'], ['postgresql://fixture@127.0.0.1:54323/postgres', 'http://127.0.0.1:54321'], ['postgresql://fixture@127.0.0.1:54322/other', 'http://127.0.0.1:54321'], ['postgresql://fixture@127.0.0.1:54322/postgres?host=remote.invalid', 'http://127.0.0.1:54321']])
        assert.throws(() => localConfiguration(fixture(url, api)));
});
test('guard is a separate local operations package with pinned bytes, never an application migration or hosted activation', () => {
    assert.equal(manifest.ordinaryMigration, false);
    assert.equal(manifest.hostedInstallationImplemented, false);
    assert.equal(manifest.hostedActivationAuthorized, false);
    assert.equal(manifest.hookUri, 'pg-functions://postgres/ats_staging_auth/reject_email');
    for (const [name, hash] of Object.entries(manifest.files))
        assert.equal(createHash('sha256').update(read('supabase/staging/auth-email-guard/' + name)).digest('hex'), hash);
    assert.ok(readdirSync(new URL('supabase/migrations/', root)).filter(x => x.endsWith('.sql')).every(name => !name.includes('auth_email_guard')));
});
test('rollback is bound to the exact function body and rejects schema drift without cascade', () => {
    const install = read('supabase/staging/auth-email-guard/install.local.sql'), rollback = read('supabase/staging/auth-email-guard/rollback.local.sql');
    assert.equal(createHash('md5').update(install.split('$guard$')[1]).digest('hex'), manifest.functionBodyMd5);
    assert.ok(rollback.includes(manifest.functionBodyMd5));
    assert.doesNotMatch(rollback, /\bcascade\b/i);
    assert.match(rollback, /Guard contents changed/);
});
