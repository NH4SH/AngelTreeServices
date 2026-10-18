// Read-only hosted review and local artifact writer. No --apply/activate capability.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadSources, identitySQL, guardSQL, reviewTarget, buildInstallationTransaction, fingerprint } from './staging-auth-activation.mjs';
import { snapshotSQL, assertTarget, stagingRef } from './staging-permissions.mjs';
const root = new URL('../../../../', import.meta.url);
function run() {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') {
        console.log('review-staging-auth-activation.mjs --project-ref gbyhdsuiqeslgjdnbqng --auth-config-file /private/fresh-managed-config.json\nRead-only. Requires a fresh mode0600 effective config GET for this staging project. Writes review artifacts privately; never applies SQL or sends an Auth config patch.');
        return;
    }
    assert.equal(args.length, 4, 'Only read-only review arguments are supported.');
    assert.deepEqual(args.slice(0, 3), ['--project-ref', stagingRef, '--auth-config-file'], 'Only the assigned staging review is supported.');
    const stats = statSync(args[3]);
    assert.ok(stats.isFile() && (stats.mode & 0o077) === 0, 'Use a private regular config file.');
    assert.ok(stats.mtimeMs <= Date.now() && Date.now() - stats.mtimeMs <= 15 * 60 * 1000, 'Refresh the effective managed config GET first.');
    const config = JSON.parse(readFileSync(args[3], 'utf8')), sources = loadSources();
    const profile = JSON.parse(readFileSync(new URL('supabase/staging/auth-email-guard/target-review.json', root)));
    assert.equal(config?.data?.id, stagingRef, 'Config project identity mismatch.');
    const directory = mkdtempSync(join(tmpdir(), 'ats-auth-activation-review-'));
    mkdirSync(join(directory, 'supabase'));
    writeFileSync(join(directory, 'supabase/config.toml'), 'project_id="ats_auth_activation_review"\n[db.seed]\nenabled=false\n');
    const cli = process.env.STAGING_SUPABASE_BIN || 'supabase';
    function call(args, phase) { try {
        const text = execFileSync(cli, [...args, '--workdir', directory, '--output-format', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
        writeFileSync(join(directory, phase + '.private.json'), text, { mode: 0o600 });
        return JSON.parse(text);
    }
    catch (e) {
        writeFileSync(join(directory, phase + '.private.log'), String(e.stderr ?? e.message), { mode: 0o600 });
        throw Error('Read-only staging review failed; inspect ' + directory);
    } }
    const projects = call(['projects', 'list'], 'projects');
    assertTarget(stagingRef, projects);
    const sql = `begin read only;set local statement_timeout='20s';select jsonb_build_object('identity',(${identitySQL}),'snapshot',(${snapshotSQL(sources.catalog)}),'guardState',(${guardSQL}),'ledger',(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations)) as evidence;commit;`;
    const file = join(directory, 'read-only-snapshot.sql');
    writeFileSync(file, sql, { mode: 0o600 });
    const observed = call(['db', 'query', '--linked', '--project-ref', stagingRef, '--file', file], 'database').rows[0].evidence;
    const review = reviewTarget({ ...observed, projects, config, observedAt: Math.floor(stats.mtimeMs) }, profile);
    const installSQL = buildInstallationTransaction(review, sources);
    writeFileSync(join(directory, 'review-only-install.sql'), installSQL, { mode: 0o600 });
    writeFileSync(join(directory, 'review-only-auth-patch.json'), JSON.stringify(review.desiredAuthPatch, null, 2) + '\n', { mode: 0o600 });
    const result = { ...review, artifactOnly: true, remoteWrites: 0, productionWrites: 0, deployed: false, evidenceDirectory: directory, installationSqlSha256: createHash('sha256').update(installSQL).digest('hex'), targetProfileSha256: fingerprint(profile) };
    writeFileSync(join(directory, 'review.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        run();
    }
    catch (e) {
        const directory = mkdtempSync(join(tmpdir(), 'ats-auth-activation-failure-'));
        writeFileSync(join(directory,'failure.private.log'),String(e.stack),{mode:0o600});
        console.error('Staging Auth review stopped without remote changes. Details: '+directory);
        process.exitCode = 1;
    }
}
