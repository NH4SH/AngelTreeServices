import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync,writeFileSync,mkdtempSync } from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadSources, absentGuard, reviewTarget, buildInstallationTransaction, expectedGuard, activationDecision, verifyActivatedConfiguration, fingerprint, verifyActiveTarget } from '../scripts/release/staging-auth-activation.mjs';
const sources = loadSources(), c = sources.candidate;
const profile = JSON.parse(readFileSync(new URL('../../../supabase/staging/auth-email-guard/target-review.json', import.meta.url)));
export function fixture() {
    const now = Date.now();
    const snapshot = { apiAclSeal: c.expectedApiAclSeal, shapeSeal: c.shapeSeal, ledgerSeal: c.ledgerSeal, migrationCount: 93, ownedDefaultsSeal: c.allowedOwnedDefaultsSeals[0], managedDefaultsSeal: c.allowedManagedDefaultsSeals[0], ownedDefaultApiGrants: 0, currentUser: 'postgres', superuser: false, managedAdminMember: false, unsafeSchemaCreate: false, unexpectedDefaultScope: false,
        state: { authUsers: 0, storageObjects: 0, customers: 0, jobs: 0, quotes: 0, invoices: 0, payments: 0, communications: 0, calendarConnections: 0, stripeReceipts: 0, sending: false, recurring: false, documentScanning: false, attachmentScanning: false } };
    return { now, input: { projects: [{ id: c.projectRef, name: 'CRM Staging', organization_id: profile.organizationId, status: 'ACTIVE_HEALTHY' }], identity: structuredClone(profile.databaseIdentity), snapshot, ledger: sources.files.map(f => { const [version, ...name] = f.name.replace(/\.sql$/, '').split('_'); return { version, name: name.join('_') }; }), guardState: structuredClone(absentGuard), observedAt: now,
            config: { data: { id: c.projectRef, attributes: { api: { db_schema: 'public,graphql_public' }, auth: { disable_signup: true, external_email_enabled: true, external_phone_enabled: false, hook_send_email_enabled: false, hook_send_email_uri: null, hook_send_email_secrets: null, smtp_host: null, smtp_user: null, smtp_pass: null, smtp_admin_email: null, mailer_autoconfirm: false, site_url: profile.appOrigin, uri_allow_list: profile.appOrigin + '/update-password' } } } } } };
}
test('review binds ATS staging physical identity, exact93 candidate and current empty/OFF state', () => {
    const { input, now } = fixture();
    const r = reviewTarget(input, profile, now);
    assert.equal(r.installed, false);
    assert.equal(r.activated, false);
    assert.equal(r.readyForHosting, false);
    assert.equal(r.requiresSeparateActivationAuthorization, true);
    assert.deepEqual(Object.keys(r.desiredAuthPatch).sort(), ['hook_send_email_enabled', 'hook_send_email_uri']);
    assert.equal(JSON.stringify(r).includes('smtp_pass'), false);
});
test('wrong project, organization, recreated database and production-shaped targets are refused', () => {
    for (const mutate of [x => x.projects[0].id = 'ddvlnixdugcbnrewktes', x => x.projects[0].organization_id = 'other', x => x.identity.systemIdentifier = '9999999999999999999', x => x.identity.databaseOid = '6', x => x.identity.serverVersionNum='170012', x => x.config.data.id = 'ddvlnixdugcbnrewktes']) {
        const { input, now } = fixture();
        mutate(input);
        assert.throws(() => reviewTarget(input, profile, now));
    }
});
test('altered ledger/catalog/ACL/defaults, unexpected hook and active users are refused', () => {
    for (const mutate of [x => x.ledger.pop(), x => x.snapshot.shapeSeal = 'bad', x => x.snapshot.apiAclSeal = 'bad', x => x.snapshot.ownedDefaultApiGrants = 1, x => x.snapshot.managedDefaultsSeal = 'bad', x => x.snapshot.state.authUsers = 1, x => x.snapshot.state.sending = true, x => x.guardState = expectedGuard(sources.guard.functionBodyMd5)]) {
        const { input, now } = fixture();
        mutate(input);
        assert.throws(() => reviewTarget(input, profile, now));
    }
});
test('SMTP, incomplete evidence, changed provider/signup, exposed schema and stale config are refused', () => {
    for (const mutate of [x => x.config.data.attributes.auth.smtp_host = 'mail.invalid', x => delete x.config.data.attributes.auth.smtp_pass, x => x.config.data.attributes.auth.external_google_enabled = true, x => x.config.data.attributes.auth.disable_signup = false, x => x.config.data.attributes.auth.hook_send_email_enabled = true, x => x.config.data.attributes.api.db_schema = 'public,ats_staging_auth', x => x.observedAt -= 900001, x => x.observedAt += 1]) {
        const { input, now } = fixture();
        mutate(input);
        assert.throws(() => reviewTarget(input, profile, now));
    }
});
test('generated artifact has physical identity, deadline, pre/post conditions and one transaction', () => {
    const { input, now } = fixture(), review = reviewTarget(input, profile, now), sql = buildInstallationTransaction(review);
    for (const pattern of [/pg_control_system/, /Database identity mismatch/, /packet expired/, /preimage changed/, /pg_try_advisory_xact_lock/, /Unexpected hook permissions/, /begin isolation level serializable/, /commit;/])
        assert.match(sql, pattern);
    assert.equal(sql.includes(sources.commands), true);
    assert.equal(sql.includes('security invoker'), true);
    assert.doesNotMatch(sql, /security definer|alter default privileges|drop schema|create or replace|\bcascade\b/i);
});
test('activation decision requires fresh installed metadata and unchanged Auth/API configuration', () => {
    const { input, now } = fixture(), review = reviewTarget(input, profile, now), installed = { ...input, guardState: expectedGuard(sources.guard.functionBodyMd5) };
    const decision = activationDecision(review, installed, now);
    assert.equal(decision.sendPatch, false);
    assert.equal(decision.atomicWithDatabase, false);
    for (const mutate of [x => x.guardState.routines[0].definer = true, x => x.guardState.effectivePrivileges.anon.execute=true, x => x.guardState.routines[0].acl.push({ grantee: 'anon' }), x => x.config.data.attributes.auth.disable_signup = false, x => x.config.data.attributes.api.db_schema = 'public,ats_staging_auth', x => x.snapshot.state.authUsers = 1, x => x.observedAt -= 900001]) {
        const x = structuredClone(installed);
        mutate(x);
        assert.throws(() => activationDecision(review, x, now));
    }
    assert.throws(() => activationDecision(review, installed, now + 900001));
});
test('configuration reconciliation permits only enabled flag/URI and never claims delivery proof', () => {
    const { input } = fixture(), before = input.config, patch = { hook_send_email_enabled: true, hook_send_email_uri: sources.guard.hookUri };
    const after = structuredClone(before);
    Object.assign(after.data.attributes.auth, patch);
    assert.deepEqual(verifyActivatedConfiguration(before, after, patch), { configurationMatches: true, deliveryIsolationVerified: false, readyForHosting: false });
    after.data.attributes.auth.disable_signup = false;
    assert.throws(() => verifyActivatedConfiguration(before, after, patch));
    assert.throws(() => verifyActivatedConfiguration(before, before, { ...patch, smtp_pass: 'synthetic' }));
    assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
});
test('write flags, wrong targets and missing private config fail before any external tool', () => {
    for (const args of [['--project-ref', 'ddvlnixdugcbnrewktes'], ['--apply'], ['--project-ref', c.projectRef, '--activate']]) {
        const r = spawnSync(process.execPath, [new URL('../scripts/release/review-staging-auth-activation.mjs', import.meta.url).pathname, ...args], { env: { PATH: '/usr/bin:/bin', STAGING_SUPABASE_BIN: '/not/executed' }, encoding: 'utf8' });
        assert.equal(r.status, 1);
        assert.doesNotMatch(r.stderr, /ENOENT|private evidence/);
    }
});

test('failure output never includes malformed private config or drift canaries',()=>{
 const canary='synthetic_private_config_do_not_echo';
 const path=join(mkdtempSync(join(tmpdir(),'ats-auth-privacy-')),'bad-config.json');
 writeFileSync(path,'{'+canary,{mode:0o600});
 const result=spawnSync(process.execPath,[new URL('../scripts/release/review-staging-auth-activation.mjs',import.meta.url).pathname,'--project-ref',c.projectRef,'--auth-config-file',path],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',STAGING_SUPABASE_BIN:'/not/executed'}});
 assert.equal(result.status,1);assert.ok(!(result.stdout+result.stderr).includes(canary));
 const {input}=fixture(),after=structuredClone(input.config);after.data.attributes.auth.smtp_pass=canary;
 assert.throws(()=>verifyActivatedConfiguration(input.config,after,{hook_send_email_enabled:true,hook_send_email_uri:sources.guard.hookUri}),error=>!error.message.includes(canary));
});

function activeFixture(){const {input,now}=fixture();input.config.data.attributes.auth.hook_send_email_enabled=true;input.config.data.attributes.auth.hook_send_email_uri=sources.guard.hookUri;input.guardState=expectedGuard(sources.guard.functionBodyMd5);return{input,now,activeProfile:{projectRef:c.projectRef,functionBodyMd5:sources.guard.functionBodyMd5,authConfigurationFingerprint:fingerprint(input.config.data.attributes.auth),apiConfigurationFingerprint:fingerprint(input.config.data.attributes.api)}};}
test('active verifier accepts the exact installed empty93 target without replaying historical mail proof',()=>{const{input,now,activeProfile}=activeFixture();const r=verifyActiveTarget(input,profile,activeProfile,now);assert.equal(r.activated,true);assert.equal(r.remoteWrites,0);assert.equal(r.readyForHosting,false);assert.equal(r.historicalSyntheticEvidenceReplayed,false);});
test('active verification rejects disabled/changed hook, effective access, config, source and database drift',()=>{for(const mutate of[x=>x.config.data.attributes.auth.hook_send_email_enabled=false,x=>x.guardState.effectivePrivileges.anon.execute=true,x=>x.config.data.attributes.auth.disable_signup=false,x=>x.identity.systemIdentifier='9999999999999999999',x=>x.snapshot.state.authUsers=1,x=>x.observedAt-=900001]){const{input,now,activeProfile}=activeFixture();mutate(input);assert.throws(()=>verifyActiveTarget(input,profile,activeProfile,now));}const{input,now,activeProfile}=activeFixture();assert.throws(()=>verifyActiveTarget(input,profile,{...activeProfile,functionBodyMd5:'unreviewed'},now));});
test('a verify-active write combination and production target are rejected without external tools',()=>{for(const args of[['--project-ref','ddvlnixdugcbnrewktes','--auth-config-file','/not/read','--verify-active'],['--project-ref',c.projectRef,'--auth-config-file','/not/read','--verify-active','--apply']]){const r=spawnSync(process.execPath,[new URL('../scripts/release/review-staging-auth-activation.mjs',import.meta.url).pathname,...args],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',STAGING_SUPABASE_BIN:'/not/executed'}});assert.equal(r.status,1);assert.doesNotMatch(r.stderr,/ENOENT/);}});
