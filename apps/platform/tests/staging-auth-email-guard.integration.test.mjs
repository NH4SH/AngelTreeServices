import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { createRehearsal } from '../scripts/testing/auth-email-guard.mjs';
const enabled = process.env.AUTH_EMAIL_GUARD_DISPOSABLE === '1';
test('isolated Auth no-send guard', { skip: !enabled, timeout: 240000 }, async (t) => {
    const f = await createRehearsal();
    const marker = randomUUID(), email = 'guard-' + marker + '@example.invalid', pendingEmail = 'guard-pending-' + marker + '@example.invalid';
    const canary = 'private_hook_payload_' + marker;
    let accessToken, actorId;
    const results = [];
    async function scenario(name, run) { await t.test(name, async () => { await run(); results.push({ name, passed: true }); }); }
    async function expectBlocked(path, options) { const r = await f.request(path, options); assert.equal(r.status, 503, 'Auth must return the explicit staging-unavailable status.'); assert.ok(String(r.data?.msg ?? r.data?.message ?? r.data?.error_description ?? '').includes('Email delivery is disabled in staging.')); }
    async function waitForMail(count) { for (let i = 0; i < 30; i++) {
        if (await f.mailCount() === count)
            return;
        await new Promise(r => setTimeout(r, 100));
    } assert.equal(await f.mailCount(), count); }
    const catalog = readFileSync(new URL('../../../supabase/verification/release_catalog.sql', import.meta.url), 'utf8');
    const catalogSeal = () => f.sql('select md5(jsonb_agg(to_jsonb(c) order by kind,key)::text) from (' + catalog + ') c');
    const before = catalogSeal();
    try {
        await scenario('dedicated internal network and live SMTP positive control', async () => {
            assert.equal(f.internalNetwork(), true);
            let r = await f.request('/admin/users', { method: 'POST', admin: true, body: { email, password: f.password, email_confirm: true, user_metadata: { guard_canary: canary } } });
            assert.equal(r.status, 200);
            actorId = r.data.id;
            r = await f.request('/admin/users', { method: 'POST', admin: true, body: { email: pendingEmail, password: f.password, email_confirm: false } });
            assert.equal(r.status, 200);
            r = await f.request('/token?grant_type=password', { method: 'POST', body: { email, password: f.password } });
            assert.equal(r.status, 200);
            accessToken = r.data.access_token;
            r = await f.request('/recover', { method: 'POST', body: { email } });
            assert.equal(r.status, 200);
            await waitForMail(1);
        });
        await scenario('wrong database rejection and injected install failure leave no guard or app changes', async () => {
            assert.throws(() => f.sql(f.packageSQL['install.local.sql'], 'postgres'));
            assert.throws(() => f.sql(f.packageSQL['install.local.sql'].replace(/commit;\s*$/, "do $$ begin raise exception 'Intentional local rollback probe'; end $$;commit;")));
            assert.equal(f.sql("select count(*) from pg_namespace where nspname='ats_staging_auth'"), '0');
            assert.equal(catalogSeal(), before);
            f.sql(f.packageSQL['install.local.sql']);
            assert.equal(catalogSeal(), before);
        });
        await scenario('only Auth role can execute the invoker constant-error function', async () => {
            const row = JSON.parse(f.sql("select jsonb_build_object('definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'emptyPath',p.proconfig=array['search_path=\"\"'],'tables',(select count(*) from pg_class c where c.relnamespace=p.pronamespace)) from pg_proc p where p.oid='ats_staging_auth.reject_email(jsonb)'::regprocedure"));
            assert.deepEqual(row, { definer: false, owner: 'postgres', emptyPath: true, tables: 0 });
            for (const role of ['anon', 'authenticated', 'service_role'])
                assert.equal(f.sql(`select has_schema_privilege('${role}','ats_staging_auth','USAGE') or has_function_privilege('${role}','ats_staging_auth.reject_email(jsonb)','EXECUTE')`), 'f');
            const reply = JSON.parse(f.sql("select ats_staging_auth.reject_email('{\"email_data\":{\"token\":\"synthetic-never-retained\"}}'::jsonb)", f.database, 'supabase_auth_admin'));
            assert.equal(reply.error.http_code, 503);
            await f.startAuth(true);
        });
        await scenario('recovery rejects explicitly without SMTP fallback', async () => {
            await expectBlocked('/recover', { method: 'POST', body: { email } });
            assert.equal(await f.mailCount(), 1);
        });
        await scenario('invite, magic-link and signup-confirmation resend cannot deliver', async () => {
            await expectBlocked('/invite', { method: 'POST', admin: true, body: { email: 'guard-invite-' + marker + '@example.invalid' } });
            await expectBlocked('/otp', { method: 'POST', body: { email, create_user: false } });
            await expectBlocked('/resend', { method: 'POST', body: { type: 'signup', email: pendingEmail } });
            assert.equal(await f.mailCount(), 1);
        });
        await scenario('email change cannot send or replace the signed-in identity', async () => {
            await expectBlocked('/user', { method: 'PUT', accessToken, body: { email: 'guard-changed-' + marker + '@example.invalid' } });
            const r = await f.request('/user', { accessToken });
            assert.equal(r.status, 200);
            assert.equal(r.data.id, actorId);
            assert.equal(r.data.email, email);
            assert.equal(await f.mailCount(), 1);
        });
        await scenario('password sign-in, wrong-password rejection and refresh remain independent of email', async () => {
            let r = await f.request('/token?grant_type=password', { method: 'POST', body: { email, password: f.password } });
            assert.equal(r.status, 200);
            assert.equal(r.data.user.id, actorId);
            const refresh = r.data.refresh_token;
            r = await f.request('/token?grant_type=password', { method: 'POST', body: { email, password: 'incorrect-synthetic-password' } });
            assert.equal(r.status, 400);
            r = await f.request('/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refresh } });
            assert.equal(r.status, 200);
            assert.equal(r.data.user.id, actorId);
            assert.equal(await f.mailCount(), 1);
        });
        await scenario('missing hook and revoked execute permission fail closed without SMTP', async () => {
            await f.startAuth(true, 'pg-functions://postgres/ats_staging_auth/missing_email_hook');
            let r = await f.request('/recover', { method: 'POST', body: { email } });
            assert.equal(r.status, 500);
            assert.equal(await f.mailCount(), 1);
            f.sql('revoke execute on function ats_staging_auth.reject_email(jsonb) from supabase_auth_admin;');
            await f.startAuth(true);
            r = await f.request('/recover', { method: 'POST', body: { email } });
            assert.equal(r.status, 500);
            assert.equal(await f.mailCount(), 1);
            f.sql('grant execute on function ats_staging_auth.reject_email(jsonb) to supabase_auth_admin;');
            await expectBlocked('/recover', { method: 'POST', body: { email } });
            assert.equal(await f.mailCount(), 1);
        });
        await scenario('hook ignores attacker-controlled payload, has no store, and does not log its canary', async () => {
            assert.ok(!f.logs().includes(canary));
            assert.equal(f.sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ats_staging_auth'"), '0');
            const a = f.sql("select ats_staging_auth.reject_email(null)", f.database, 'supabase_auth_admin'), b = f.sql("select ats_staging_auth.reject_email('{\"user\":{\"app_metadata\":{\"allow_email\":true}},\"email_data\":{\"email_action_type\":\"recovery\"}}')", f.database, 'supabase_auth_admin');
            assert.equal(a, b);
            assert.equal(catalogSeal(), before);
        });
        await scenario('reviewed local rollback restores SMTP only in this owned rehearsal', async () => {
            await f.stopAuth();
            f.sql('create table ats_staging_auth.rollback_probe(id integer);');
            assert.throws(() => f.sql(f.packageSQL['rollback.local.sql']));
            assert.equal(f.sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ats_staging_auth'"), '1');
            f.sql('drop table ats_staging_auth.rollback_probe;');
            f.sql(f.packageSQL['rollback.local.sql']);
            assert.equal(f.sql("select count(*) from pg_namespace where nspname='ats_staging_auth'"), '0');
            assert.equal(catalogSeal(), before);
            await f.startAuth(false);
            const r = await f.request('/recover', { method: 'POST', body: { email } });
            assert.equal(r.status, 200);
            await waitForMail(2);
            assert.equal(f.sql('select count(*) from supabase_migrations.schema_migrations'), '93');
        });
    }
    finally {
        try {
            const r = await f.request('/admin/users', { admin: true });
            assert.equal(r.status, 200);
            for (const user of r.data.users) {
                assert.ok(user.email.endsWith('@example.invalid'));
                const removed = await f.request('/admin/users/' + user.id, { method: 'DELETE', admin: true });
                assert.equal(removed.status, 200);
            }
            assert.equal(f.sql('select count(*) from auth.users'), '0');
        }
        finally {
            await f.cleanup();
        }
        const report = { database: f.database, evidenceDirectory: f.directory, authImage: f.authImage, authImageId: f.authImageId, mailImage: f.mailImage, checks: results, ownedServicesStopped: true, originalServicesPreserved: true, hostedWrites: false, deployed: false };
        writeFileSync(f.directory + '/result.json', JSON.stringify(report, null, 2) + '\n');
        if (process.env.AUTH_EMAIL_GUARD_RESULTS_FILE)
            writeFileSync(process.env.AUTH_EMAIL_GUARD_RESULTS_FILE, JSON.stringify(report, null, 2) + '\n');
    }
});
