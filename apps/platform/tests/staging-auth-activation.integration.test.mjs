import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRehearsal } from '../scripts/testing/auth-email-guard.mjs';
import { loadSources, identitySQL, guardSQL, absentGuard, buildInstallationTransaction, expectedGuard, activationDecision, fingerprint, verifyActivatedConfiguration } from '../scripts/release/staging-auth-activation.mjs';
import { snapshotSQL } from '../scripts/release/staging-permissions.mjs';
const enabled = process.env.AUTH_EMAIL_GUARD_DISPOSABLE === '1';
test('targeted install and activation rehearsal on a new owned local database', { skip: !enabled, timeout: 240000 }, async (t) => {
    const f = await createRehearsal(), sources = loadSources(), results = [];
    const query = s => JSON.parse(f.sql(s));
    const identity = query(identitySQL), snapshot = query(snapshotSQL(sources.catalog)), expiresAt = Date.now() + 900000;
    const localReview = { projectRef: 'gbyhdsuiqeslgjdnbqng', identity, snapshot, expiresAt, observedAt: Date.now() };
    const originalSeal = fingerprint(snapshot);
    const sameApp = () => assert.equal(fingerprint(query(snapshotSQL(sources.catalog))), originalSeal);
    const absent = () => assert.deepEqual(query(guardSQL), absentGuard);
    async function scenario(name, run) { await t.test(name, async () => { await run(); results.push({ name, passed: true }); }); }
    let lock;
    try {
        await scenario('hosted database identity cannot be used on a same-schema local clone', async () => {
            const target = JSON.parse(readFileSync(new URL('../../../supabase/staging/auth-email-guard/target-review.json', import.meta.url)));
            assert.throws(() => f.sql(buildInstallationTransaction({ ...localReview, identity: target.databaseIdentity })));
            absent();
            sameApp();
        });
        await scenario('expired packet and elevated/API roles cannot install anything', async () => {
            assert.throws(() => f.sql(buildInstallationTransaction({ ...localReview, expiresAt: Date.now() - 1 })));
            assert.throws(() => f.sql('set role service_role;' + buildInstallationTransaction(localReview)));
            absent();
            sameApp();
        });
        await scenario('a changed business/automation preimage is refused before DDL', async () => {
            f.sql('update public.communication_settings set automated_sending_enabled=true;');
            try {
                assert.throws(() => f.sql(buildInstallationTransaction(localReview)));
                absent();
            }
            finally {
                f.sql('update public.communication_settings set automated_sending_enabled=false;');
            }
            sameApp();
        });
        await scenario('a simultaneous installer holds an advisory lock and the second attempt fails', async () => {
            lock = spawn(process.env.AUTH_EMAIL_GUARD_DOCKER_BIN, ['exec', '-i', 'supabase_db_ats_pr02_disposable', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', f.database, '-v', 'ON_ERROR_STOP=1'], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
            lock.stdin.write('begin;select pg_advisory_xact_lock(178214,3112);\n');
            try {
                let locked = false;
                for (let i = 0; i < 40; i++) {
                    if (f.sql("select count(*) from pg_locks where locktype='advisory' and database=(select oid from pg_database where datname=current_database()) and classid=178214 and objid=3112 and granted") === '1') {
                        locked = true;
                        break;
                    }
                    await new Promise(r => setTimeout(r, 50));
                }
                assert.ok(locked);
                assert.throws(() => f.sql(buildInstallationTransaction(localReview)));
                absent();
            }
            finally {
                const ended = new Promise((resolve, reject) => { lock.once('exit', code => code === 0 ? resolve() : reject(Error('Owned lock holder failed'))); lock.once('error', reject); });
                lock.stdin.end('rollback;\n');
                await ended;
                lock = null;
            }
            sameApp();
        });
        await scenario('injected post-install permission drift rolls the entire transaction back', async () => {
            const drift = { ...sources, commands: sources.commands + '\ngrant execute on function ats_staging_auth.reject_email(jsonb) to anon;' };
            assert.throws(() => f.sql(buildInstallationTransaction(localReview, drift)));
            absent();
            sameApp();
        });
        await scenario('targeted transaction installs exact least-privilege metadata without changing app/defaults', async () => {
            f.sql(buildInstallationTransaction(localReview));
            assert.deepEqual(query(guardSQL), expectedGuard(sources.guard.functionBodyMd5));
            sameApp();
            assert.throws(() => f.sql(buildInstallationTransaction(localReview)));
            sameApp();
        });
        await scenario('fresh activation decision permits only the hook flag/URI and rejects config/permission drift', async () => {
            const config = { data: { id: 'gbyhdsuiqeslgjdnbqng', attributes: { api: { db_schema: 'public,graphql_public' }, auth: { disable_signup: true, external_email_enabled: true, hook_send_email_enabled: false, hook_send_email_uri: null } } } };
            const review = { ...localReview, authConfigurationFingerprint: fingerprint(config.data.attributes.auth), apiConfigurationFingerprint: fingerprint(config.data.attributes.api), desiredAuthPatch: { hook_send_email_enabled: true, hook_send_email_uri: sources.guard.hookUri } };
            const fresh = { identity: query(identitySQL), snapshot: query(snapshotSQL(sources.catalog)), guardState: query(guardSQL), config, observedAt: Date.now() };
            const d = activationDecision(review, fresh);
            assert.equal(d.sendPatch, false);
            const after = structuredClone(config);
            Object.assign(after.data.attributes.auth, d.patch);
            assert.equal(verifyActivatedConfiguration(config, after, d.patch).deliveryIsolationVerified, false);
            f.sql('grant execute on function ats_staging_auth.reject_email(jsonb) to anon;');
            try {
                assert.throws(() => activationDecision(review, { ...fresh, guardState: query(guardSQL) }));
            }
            finally {
                f.sql('revoke execute on function ats_staging_auth.reject_email(jsonb) from anon;');
            }
            await f.startAuth(true);
            sameApp();
        });
        await scenario('real local Auth activation blocks delivery while password sign-in remains usable', async () => {
            const email = 'activation-' + randomUUID() + '@example.invalid';
            let r = await f.request('/admin/users', { method: 'POST', admin: true, body: { email, password: f.password, email_confirm: true } });
            assert.equal(r.status, 200);
            r = await f.request('/recover', { method: 'POST', body: { email } });
            assert.equal(r.status, 503);
            assert.equal(await f.mailCount(), 0);
            r = await f.request('/token?grant_type=password', { method: 'POST', body: { email, password: f.password } });
            assert.equal(r.status, 200);
            // Losing execution permission must keep blocking mail; do not disable hook.
            f.sql('revoke execute on function ats_staging_auth.reject_email(jsonb) from supabase_auth_admin;');
            r = await f.request('/recover', { method: 'POST', body: { email } });
            assert.equal(r.status, 500);
            assert.equal(await f.mailCount(), 0);
            f.sql('grant execute on function ats_staging_auth.reject_email(jsonb) to supabase_auth_admin;');
            r = await f.request('/recover', { method: 'POST', body: { email } });
            assert.equal(r.status, 503);
            assert.equal(await f.mailCount(), 0);
        });
    }
    finally {
        if (lock)
            lock.kill();
        try {
            const r = await f.request('/admin/users', { admin: true });
            assert.equal(r.status, 200);
            for (const user of r.data.users) {
                assert.ok(user.email.endsWith('@example.invalid'));
                assert.equal((await f.request('/admin/users/' + user.id, { method: 'DELETE', admin: true })).status, 200);
            }
            assert.equal(f.sql('select count(*) from auth.users'), '0');
            sameApp();
            await f.stopAuth();
            if (f.sql("select count(*) from pg_namespace where nspname='ats_staging_auth'") === '1')
                f.sql(f.packageSQL['rollback.local.sql']);
            absent();
            sameApp();
        }
        finally {
            await f.cleanup();
        }
        const report = { database: f.database, evidenceDirectory: f.directory, checks: results, originalServicesPreserved: true, ownedServicesStopped: true, hostedWrites: 0, deployed: false };
        writeFileSync(f.directory + '/activation-results.json', JSON.stringify(report, null, 2) + '\n');
        if (process.env.AUTH_EMAIL_GUARD_ACTIVATION_RESULTS_FILE)
            writeFileSync(process.env.AUTH_EMAIL_GUARD_ACTIVATION_RESULTS_FILE, JSON.stringify(report, null, 2) + '\n');
    }
});
