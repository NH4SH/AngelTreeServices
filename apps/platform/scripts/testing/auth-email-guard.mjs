// Isolated, local-only Auth/Mailpit rehearsal. Never configures hosted Supabase.
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifySources } from '../release/verify-staging-appointment-candidate.mjs';
const root = new URL('../../../../', import.meta.url);
export function localConfiguration(env) {
    assert.equal(env.AUTH_EMAIL_GUARD_DISPOSABLE, '1', 'Explicit disposable opt-in required.');
    assert.match(env.DOCKER_HOST ?? '', /^unix:.*pr02-disposable\/sock\/docker.sock$/);
    const status = JSON.parse(readFileSync(env.AUTH_EMAIL_GUARD_LOCAL_STATUS_FILE, 'utf8'));
    assert.equal(status.API_URL, 'http://127.0.0.1:54321');
    const url = new URL(status.DB_URL);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, '54322');
    assert.equal(url.pathname, '/postgres');
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
    for (const key of ['AUTH_EMAIL_GUARD_DOCKER_BIN', 'AUTH_EMAIL_GUARD_SUPABASE_BIN', 'AUTH_EMAIL_GUARD_BOOTSTRAP'])
        assert.ok(env[key], key + ' required.');
    return { url, docker: env.AUTH_EMAIL_GUARD_DOCKER_BIN, cli: env.AUTH_EMAIL_GUARD_SUPABASE_BIN, bootstrap: env.AUTH_EMAIL_GUARD_BOOTSTRAP };
}
export async function createRehearsal(env = process.env) {
    const config = localConfiguration(env), read = p => readFileSync(new URL(p, root));
    const candidate = JSON.parse(read('supabase/staging/appointment-candidate-93.json'));
    const files = verifySources(candidate, read, readdirSync(new URL('supabase/migrations/', root)).filter(f => f.endsWith('.sql')).sort());
    const packageInfo = JSON.parse(read('supabase/staging/auth-email-guard/package.json'));
    const packageSQL = {};
    for (const [name, hash] of Object.entries(packageInfo.files)) {
        const raw = read('supabase/staging/auth-email-guard/' + name);
        assert.equal(createHash('sha256').update(raw).digest('hex'), hash);
        packageSQL[name] = raw.toString();
    }
    const id = randomUUID().replaceAll('-', ''), database = 'ats_auth_email_guard_' + id, directory = mkdtempSync(join(tmpdir(), 'ats-auth-email-guard-'));
    const names = { auth: 'ats_guard_auth_' + id, mail: 'ats_guard_mail_' + id, network: 'ats_guard_network_' + id };
    const taskEnv = { ...process.env, DOCKER_HOST: env.DOCKER_HOST };
    function docker(args, input) {
      try {
        return execFileSync(config.docker, args, { env: taskEnv, input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    }
    catch (error) {
        writeFileSync(join(directory, 'docker-failure.private.log'), String(error.stderr ?? error.message), { mode: 0o600 });
        throw Error('Owned local rehearsal operation failed; inspect private evidence in ' + directory);
      }
    }
    const sourceAuth = JSON.parse(docker(['inspect', 'supabase_auth_ats_pr02_disposable']))[0], sourceMail = JSON.parse(docker(['inspect', 'supabase_inbucket_ats_pr02_disposable']))[0];
    assert.match(sourceAuth.Config.Image, /^public\.ecr\.aws\/supabase\/gotrue:/);
    assert.match(sourceMail.Config.Image, /^public\.ecr\.aws\/supabase\/mailpit:/);
    const sourceDB = JSON.parse(docker(['inspect', 'supabase_db_ats_pr02_disposable']))[0];
    const originalNetworks = Object.keys(sourceDB.NetworkSettings.Networks).sort();
    const sourceServices = [sourceDB, sourceAuth, sourceMail].map(c => ({ id: c.Id, startedAt: c.State.StartedAt, running: c.State.Running }));
    const sourceVars = Object.fromEntries(sourceAuth.Config.Env.map(v => [v.slice(0, v.indexOf('=')), v.slice(v.indexOf('=') + 1)]));
    const authDB = new URL(sourceVars.GOTRUE_DB_DATABASE_URL);
    assert.equal(authDB.hostname, 'supabase_db_ats_pr02_disposable');
    assert.equal(authDB.username, 'supabase_auth_admin');
    authDB.pathname = '/' + database;
    const authDbEnvFile = join(directory, 'auth-db.private.env');
    const authDbPassword = decodeURIComponent(authDB.password);
    assert.ok(authDbPassword && !/[\r\n]/.test(authDbPassword));
    writeFileSync(authDbEnvFile, 'PGPASSWORD=' + authDbPassword + '\n', { mode: 0o600 });
    function sql(input, db = database, user = 'postgres') {
        const ownerConnection = user === 'supabase_auth_admin';
        return docker(['exec', ...(ownerConnection ? ['--env-file', authDbEnvFile] : []), '-i', 'supabase_db_ats_pr02_disposable', 'psql', '-X', '-qAt', ...(ownerConnection ? ['-h', '127.0.0.1'] : []), '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1'], input);
    }
    // No published ports: requests travel from the existing local DB container
    // over the owned internal network. This also avoids rootless port forwarding.
    const authOrigin = 'http://' + names.auth + ':9999', mailOrigin = 'http://' + names.mail + ':8025';
    const jwtSecret = randomBytes(32).toString('hex'), password = randomBytes(24).toString('base64url');
    const jwt = role => { const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), payload = Buffer.from(JSON.stringify({ role, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return head + '.' + payload + '.' + createHmac('sha256', jwtSecret).update(head + '.' + payload).digest('base64url'); };
    const adminKey = jwt('service_role');
    let networkCreated = false, dbConnected = false, mailCreated = false, authCreated = false;
    const authVariables = {
        GOTRUE_API_HOST: '0.0.0.0',
        GOTRUE_API_PORT: '9999',
        API_EXTERNAL_URL: authOrigin,
        GOTRUE_SITE_URL: 'http://127.0.0.1:39999',
        GOTRUE_URI_ALLOW_LIST: 'http://127.0.0.1:39999/update-password',
        GOTRUE_DB_DRIVER: 'postgres',
        GOTRUE_DB_DATABASE_URL: authDB.href,
        GOTRUE_DB_MAX_POOL_SIZE: '2',
        GOTRUE_JWT_SECRET: jwtSecret,
        GOTRUE_JWT_ADMIN_ROLES: 'service_role',
        GOTRUE_JWT_AUD: 'authenticated',
        GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
        GOTRUE_JWT_EXP: '3600',
        GOTRUE_DISABLE_SIGNUP: 'true',
        GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
        GOTRUE_EXTERNAL_PHONE_ENABLED: 'false',
        GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: 'false',
        GOTRUE_MAILER_AUTOCONFIRM: 'false',
        GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED: 'true',
        GOTRUE_SMTP_HOST: names.mail,
        GOTRUE_SMTP_PORT: '1025',
        GOTRUE_SMTP_ADMIN_EMAIL: 'local-test@example.invalid',
        GOTRUE_SMTP_SENDER_NAME: 'Local guard rehearsal',
        // Auth interprets zero as the default 1 minute. This tiny interval is
        // test-only; hosted/shared Auth limits are never modified.
        GOTRUE_SMTP_MAX_FREQUENCY: '1ms',
        GOTRUE_RATE_LIMIT_EMAIL_SENT: '1000',
        GOTRUE_RATE_LIMIT_OTP: '1000',
        GOTRUE_MAILER_URLPATHS_RECOVERY: '/verify',
        GOTRUE_MAILER_URLPATHS_INVITE: '/verify',
        GOTRUE_MAILER_URLPATHS_CONFIRMATION: '/verify',
        GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: '/verify',
        GOTRUE_LOG_LEVEL: 'error',
    };
    function http(origin, path, { method = 'GET', body, token } = {}) {
        assert.ok([authOrigin, mailOrigin].includes(origin));
        assert.ok(path.startsWith('/') && !/[\r\n]/.test(path));
        const config = ['url = ' + JSON.stringify(origin + path), 'request = ' + JSON.stringify(method), 'header = "Content-Type: application/json"', ...(token ? ['header = ' + JSON.stringify('Authorization: Bearer ' + token)] : []), ...(body ? ['data = ' + JSON.stringify(JSON.stringify(body))] : [])].join('\n') + '\n';
        const output = docker(['exec', '-i', 'supabase_db_ats_pr02_disposable', '/usr/bin/curl', '--silent', '--show-error', '--max-time', '5', '--write-out', '\n%{http_code}', '--config', '-'], config), last = output.lastIndexOf('\n');
        let data;
        try {
            data = JSON.parse(output.slice(0, last));
        }
        catch {
            data = null;
        }
        return { status: Number(output.slice(last + 1)), data };
    }
    async function request(path, { method = 'GET', body, admin = false, accessToken } = {}) { return http(authOrigin, path, { method, body, token: accessToken ?? (admin ? adminKey : undefined) }); }
    async function mailCount() { const r = http(mailOrigin, '/api/v1/messages'); assert.equal(r.status, 200); return r.data.total; }
    async function healthy(origin, path) { for (let i = 0; i < 60; i++) {
        try {
            const r = http(origin, path);
            if (r.status === 200)
                return;
        }
        catch { }
        await new Promise(r => setTimeout(r, 100));
    } throw Error('Owned local service did not become healthy.'); }
    async function stopAuth() { if (authCreated) {
        docker(['rm', '-f', names.auth]);
        authCreated = false;
    } }
    async function startAuth(enabled = true, uri = packageInfo.hookUri) { await stopAuth(); const file = join(directory, 'auth.private.env'); writeFileSync(file, Object.entries({ ...authVariables, GOTRUE_HOOK_SEND_EMAIL_ENABLED: String(enabled), GOTRUE_HOOK_SEND_EMAIL_URI: enabled ? uri : '' }).map(([k, v]) => k + '=' + v).join('\n') + '\n', { mode: 0o600 }); docker(['run', '--detach', '--pull', 'never', '--name', names.auth, '--network', names.network, '--env-file', file, '--memory', '192m', sourceAuth.Image]); authCreated = true; await healthy(authOrigin, '/health'); }
    async function cleanup() { const failures = []; for (const operation of [() => authCreated && docker(['rm', '-f', names.auth]), () => mailCreated && docker(['rm', '-f', names.mail]), () => dbConnected && docker(['network', 'disconnect', names.network, 'supabase_db_ats_pr02_disposable']), () => networkCreated && docker(['network', 'rm', names.network])]) {
        try {
            operation();
        }
        catch {
            failures.push('Owned resource cleanup failed.');
        }
    } const after = Object.keys(JSON.parse(docker(['inspect', 'supabase_db_ats_pr02_disposable']))[0].NetworkSettings.Networks).sort(); assert.deepEqual(after, originalNetworks); for (const before of sourceServices) {
        const c = JSON.parse(docker(['inspect', before.id]))[0];
        assert.equal(c.State.StartedAt, before.startedAt);
        assert.equal(c.State.Running, before.running);
    } assert.deepEqual(failures, []); }
    try {
        assert.equal(sql(`select count(*) from pg_database where datname='${database}'`, 'postgres'), '0');
        sql('create database ' + database, 'postgres');
        sql(readFileSync(config.bootstrap, 'utf8'), database, 'supabase_admin');
        // Managed schema-only bootstrap needs the genuine version ledger of that
        // same already-installed Auth image. No users/sessions/business rows copied.
        const versions = JSON.parse(sql('select jsonb_agg(version order by version) from auth.schema_migrations', 'postgres'));
        assert.ok(versions.length > 0 && versions.every(v => /^\d+$/.test(v)));
        sql('insert into auth.schema_migrations(version) values ' + versions.map(v => "('" + v + "')").join(','), database, 'supabase_auth_admin');
        mkdirSync(join(directory, 'supabase/migrations'), { recursive: true });
        writeFileSync(join(directory, 'supabase/config.toml'), `project_id="${database}"\n[db]\nmajor_version=17\n[db.seed]\nenabled=false\n`);
        for (const f of files)
            copyFileSync(new URL('supabase/migrations/' + f.name, root), join(directory, 'supabase/migrations', f.name));
        const dbURL = new URL(config.url);
        dbURL.pathname = '/' + database;
        const r = spawnSync(config.cli, ['migration', 'up', '--db-url', dbURL.href, '--workdir', directory], { env: taskEnv, encoding: 'utf8', timeout: 120000 });
        writeFileSync(join(directory, 'migrations.private.log'), (r.stdout ?? '') + (r.stderr ?? ''), { mode: 0o600 });
        assert.equal(r.status, 0, 'Local migration replay failed.');
        assert.equal(sql('select count(*) from supabase_migrations.schema_migrations'), '93');
        assert.equal(sql('select count(*) from auth.users'), '0');
        docker(['network', 'create', '--internal', names.network]);
        networkCreated = true;
        docker(['network', 'connect', names.network, 'supabase_db_ats_pr02_disposable']);
        dbConnected = true;
        docker(['run', '--detach', '--pull', 'never', '--name', names.mail, '--network', names.network, '--memory', '64m', sourceMail.Image]);
        mailCreated = true;
        await healthy(mailOrigin, '/livez');
        await startAuth(false);
        return { directory, database, sql, request, mailCount, startAuth, stopAuth, cleanup, password, packageSQL, packageInfo,
            authImage: sourceAuth.Config.Image, authImageId: sourceAuth.Image, mailImage: sourceMail.Config.Image, authOrigin, mailOrigin,
            logs: () => docker(['logs', names.auth]), internalNetwork: () => docker(['network', 'inspect', names.network, '--format', '{{.Internal}}']) === 'true' };
    }
    catch (error) {
        for (const name of [names.auth, names.mail]) {
            try {
                writeFileSync(join(directory, name + '.private.log'), docker(['logs', name]), { mode: 0o600 });
            }
            catch { }
        }
        let cleanupError;
        try {
            await cleanup();
        }
        catch (e) {
            cleanupError = e;
        }
        writeFileSync(join(directory, 'setup-failure.private.log'), String(error.stack) + (cleanupError ? '\nCleanup failed: ' + cleanupError.message : ''), { mode: 0o600 });
        throw Error('Local Auth guard setup failed; inspect private evidence in ' + directory);
    }
}
