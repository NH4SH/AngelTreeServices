// Pure review/SQL preparation. This module never connects to a service or applies SQL.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { snapshotSQL, assertTarget, stagingRef } from './staging-permissions.mjs';
import { verifySources, verifyCandidate } from './verify-staging-appointment-candidate.mjs';
const root = new URL('../../../../', import.meta.url);
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
export const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const effectivePrivileges = installed => Object.fromEntries(['anon','authenticated','service_role','supabase_auth_admin'].map(role => [role,{usage:installed&&role==='supabase_auth_admin',create:false,execute:installed&&role==='supabase_auth_admin'}]));
export const absentGuard = { schema: null, routines: [], relations: 0, types: 0, defaults: 0, effectivePrivileges:effectivePrivileges(false) };
export const identitySQL = `select jsonb_build_object('systemIdentifier',(select system_identifier::text from pg_control_system()),
 'serverVersionNum',current_setting('server_version_num'),'database',current_database(),'databaseOid',(select oid::text from pg_database where datname=current_database()))`;
export const guardSQL = `select jsonb_build_object(
 'schema',(select jsonb_build_object('owner',pg_get_userbyid(n.nspowner),'acl',
  (select jsonb_agg(a order by a::text) from (select jsonb_build_object('grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,'grantor',pg_get_userbyid(x.grantor),'privilege',x.privilege_type,'grantable',x.is_grantable) a from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x) q)) from pg_namespace n where n.nspname='ats_staging_auth'),
 'routines',coalesce((select jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_arguments(p.oid),'returns',pg_get_function_result(p.oid),
 'owner',pg_get_userbyid(p.proowner),'language',l.lanname,'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'leakproof',p.proleakproof,
 'config',to_jsonb(p.proconfig),'bodyHash',md5(p.prosrc),'acl',(select jsonb_agg(a order by a::text) from (select jsonb_build_object('grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,'grantor',pg_get_userbyid(x.grantor),'privilege',x.privilege_type,'grantable',x.is_grantable) a from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x) q)) order by p.oid)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='ats_staging_auth'),'[]'::jsonb),
 'relations',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ats_staging_auth'),
 'types',(select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='ats_staging_auth'),
 'defaults',(select count(*) from pg_default_acl a join pg_namespace n on n.oid=a.defaclnamespace where n.nspname='ats_staging_auth'),
 'effectivePrivileges',(select jsonb_object_agg(role,jsonb_build_object(
 'usage',coalesce(has_schema_privilege(role,(select oid from pg_namespace where nspname='ats_staging_auth'),'USAGE'),false),
 'create',coalesce(has_schema_privilege(role,(select oid from pg_namespace where nspname='ats_staging_auth'),'CREATE'),false),
 'execute',coalesce(has_function_privilege(role,(select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ats_staging_auth' and p.proname='reject_email' and p.pronargs=1 and p.proargtypes[0]='jsonb'::regtype),'EXECUTE'),false)))
 from unnest(array['anon','authenticated','service_role','supabase_auth_admin']) role))`;
function acl(grantee, privilege) { return { grantee, grantor: 'postgres', privilege, grantable: false }; }
export function expectedGuard(bodyHash) {
    // ACL aggregate order follows jsonb text, independently checked against live Postgres.
    const sorted = values => values.sort((a, b) => JSON.stringify({ grantee: a.grantee, grantor: a.grantor, grantable: a.grantable, privilege: a.privilege }).localeCompare(JSON.stringify({ grantee: b.grantee, grantor: b.grantor, grantable: b.grantable, privilege: b.privilege })));
    return { schema: { owner: 'postgres', acl: sorted([acl('postgres', 'CREATE'), acl('postgres', 'USAGE'), acl('supabase_auth_admin', 'USAGE')]) },
        routines: [{ name: 'reject_email', arguments: 'event jsonb', returns: 'jsonb', owner: 'postgres', language: 'sql', definer: false, strict: false, volatility: 'i', parallel: 'u', leakproof: false, config: ['search_path=""'], bodyHash,
                acl: sorted([acl('postgres', 'EXECUTE'), acl('supabase_auth_admin', 'EXECUTE')]) }], relations: 0, types: 0, defaults: 0, effectivePrivileges:effectivePrivileges(true) };
}
export function loadSources() {
    const read = p => readFileSync(new URL(p, root));
    const candidate = JSON.parse(read('supabase/staging/appointment-candidate-93.json'));
    const files = verifySources(candidate, read, readdirSync(new URL('supabase/migrations/', root)).filter(f => f.endsWith('.sql')).sort());
    const guard = JSON.parse(read('supabase/staging/auth-email-guard/package.json'));
    for (const [name, hash] of Object.entries(guard.files))
        assert.equal(createHash('sha256').update(read('supabase/staging/auth-email-guard/' + name)).digest('hex'), hash, 'Reviewed guard bytes changed.');
    const local = read('supabase/staging/auth-email-guard/install.local.sql').toString();
    const marker = '-- A separate schema avoids widening access to existing private app helpers.';
    assert.equal(local.split(marker).length, 2);
    const commands = marker + local.split(marker)[1].replace(/commit;\s*$/, '');
    return { candidate, files, guard, catalog: read('supabase/verification/release_catalog.sql').toString(), commands };
}
export function validateIdentity(identity) {
    assert.deepEqual(Object.keys(identity).sort(), ['database', 'databaseOid', 'serverVersionNum', 'systemIdentifier']);
    assert.match(identity.systemIdentifier, /^[0-9]{15,20}$/);
    assert.match(identity.databaseOid, /^[0-9]+$/);
    assert.match(identity.serverVersionNum, /^[0-9]{6}$/);
    assert.match(identity.database, /^[a-z][a-z0-9_]{0,62}$/);
}
export function reviewTarget({ projects, identity, snapshot, ledger, guardState, config, observedAt }, profile, now = Date.now()) {
    const sources = loadSources();
    assert.equal(profile.projectRef, stagingRef);
    assertTarget(stagingRef, projects);
    validateIdentity(identity);
    assert.deepEqual(identity, profile.databaseIdentity, 'Database identity changed; review physical restore/recreation before proceeding.');
    assert.equal(identity.database, 'postgres');
    assert.ok(Number.isFinite(observedAt) && observedAt <= now && now - observedAt <= 15 * 60 * 1000, 'Fresh configuration and database evidence required.');
    verifyCandidate(sources.candidate, snapshot, ledger, sources.files);
    assert.equal(snapshot.apiAclSeal, sources.candidate.expectedApiAclSeal);
    assert.equal(snapshot.ownedDefaultApiGrants, 0);
    assert.deepEqual(guardState, absentGuard, 'Unknown or previously installed guard; do not replace it.');
    assert.equal(config?.data?.id, stagingRef, 'Effective config belongs to a different project.');
    const attrs = config.data.attributes, a = attrs.auth;
    assert.equal(a.disable_signup, true);
    assert.equal(a.external_email_enabled, true);
    assert.equal(a.site_url, profile.appOrigin);
    assert.equal(a.uri_allow_list, profile.appOrigin + '/update-password');
    assert.equal(a.hook_send_email_enabled, false);
    assert.equal(a.hook_send_email_uri, null);
    assert.ok(a.hook_send_email_secrets === null, 'Unexpected hook credentials; stop for review.');
    for (const key of ['smtp_host', 'smtp_user', 'smtp_pass', 'smtp_admin_email']) {
        assert.ok(Object.hasOwn(a, key), 'Incomplete SMTP evidence.');
        assert.ok(a[key] == null || a[key] === '', 'Unexpected SMTP configuration; stop for review.');
    }
    assert.equal(a.mailer_autoconfirm, false);
    for (const [key, value] of Object.entries(a))
        if ((/^external_.+_enabled$/.test(key) && key !== 'external_email_enabled') || (/^hook_.+_enabled$/.test(key) && key !== 'hook_send_email_enabled'))
            assert.equal(value, false, 'Additional Auth provider/hook needs review: ' + key);
    assert.equal(attrs.api.db_schema, 'public,graphql_public', 'Exposed schema list changed; private guard must stay unexposed.');
    return { projectRef: stagingRef, identity, snapshot, observedAt, expiresAt: observedAt + 15 * 60 * 1000, authConfigurationFingerprint: fingerprint(a), apiConfigurationFingerprint: fingerprint(attrs.api),
        desiredAuthPatch: { hook_send_email_enabled: true, hook_send_email_uri: sources.guard.hookUri },
        installed: false, activated: false, readyForHosting: false, requiresSeparateActivationAuthorization: true };
}
// Low-level transaction builder is also exercised with an explicitly owned local
// fixture identity/preimage. The hosted review entry point uses reviewTarget first.
export function buildInstallationTransaction({ identity, snapshot, expiresAt }, sources = loadSources()) {
    validateIdentity(identity);
    assert.ok(Number.isSafeInteger(expiresAt));
    const baseline = snapshotSQL(sources.catalog), expected = expectedGuard(sources.guard.functionBodyMd5);
    return `-- REVIEW ARTIFACT ONLY: no runner applies this file. Refresh evidence before authorized use.
begin isolation level serializable;
set local lock_timeout='5s'; set local statement_timeout='30s';
do $ats_guard_before$ declare observed jsonb; begin
 if not pg_try_advisory_xact_lock(178214,3112) then raise exception 'Auth guard review operation already running'; end if;
 if clock_timestamp() >= to_timestamp(${expiresAt}/1000.0) then raise exception 'Auth guard review packet expired'; end if;
 if (${identitySQL}) is distinct from ${literal(JSON.stringify(identity))}::jsonb then raise exception 'Database identity mismatch'; end if;
 if current_user<>'postgres' or (select rolsuper from pg_roles where rolname=current_user) or pg_has_role(current_user,'supabase_admin','MEMBER') then raise exception 'Normal migration owner required'; end if;
 observed:=(${baseline});
 if observed is distinct from ${literal(JSON.stringify(snapshot))}::jsonb then raise exception 'Staging application preimage changed'; end if;
 if (${guardSQL}) is distinct from ${literal(JSON.stringify(absentGuard))}::jsonb then raise exception 'Guard already exists or unknown schema contents'; end if;
end $ats_guard_before$;
${sources.commands}
do $ats_guard_after$ begin
 if (${baseline}) is distinct from ${literal(JSON.stringify(snapshot))}::jsonb then raise exception 'Application catalog or defaults changed; rolling back'; end if;
 if (${guardSQL}) is distinct from ${literal(JSON.stringify(expected))}::jsonb then raise exception 'Unexpected hook permissions or definition; rolling back'; end if;
end $ats_guard_after$;
commit;
`;
}
export function activationDecision(review, { identity, snapshot, guardState, config, observedAt }, now = Date.now()) {
    const sources = loadSources();
    assert.equal(review.projectRef, stagingRef);
    assert.deepEqual(review.desiredAuthPatch, { hook_send_email_enabled: true, hook_send_email_uri: sources.guard.hookUri });
    validateIdentity(identity);
    assert.deepEqual(identity, review.identity);
    assert.deepEqual(snapshot, review.snapshot);
    assert.deepEqual(guardState, expectedGuard(sources.guard.functionBodyMd5), 'Installed definition or permissions differ.');
    assert.ok(observedAt >= review.observedAt && observedAt <= now && now - observedAt <= 15 * 60 * 1000 && now < review.expiresAt, 'Activation evidence expired.');
    assert.equal(config?.data?.id, stagingRef);
    const a = config.data.attributes.auth;
    assert.equal(fingerprint(a), review.authConfigurationFingerprint, 'Concurrent Auth config change; regenerate review.');
    assert.equal(fingerprint(config.data.attributes.api), review.apiConfigurationFingerprint, 'Exposed API configuration changed.');
    return { patch: { ...review.desiredAuthPatch }, sendPatch: false, atomicWithDatabase: false, hostedVerificationRequired: true };
}
export function verifyActivatedConfiguration(before, after, patch) {
    assert.deepEqual(Object.keys(patch).sort(), ['hook_send_email_enabled', 'hook_send_email_uri']);
    const sources = loadSources();
    assert.deepEqual(patch, { hook_send_email_enabled: true, hook_send_email_uri: sources.guard.hookUri });
    assert.equal(before?.data?.id, stagingRef);
    assert.equal(after?.data?.id, stagingRef);
    const expected = structuredClone(before);
    Object.assign(expected.data.attributes.auth, patch);
    assert.equal(fingerprint(after), fingerprint(expected), 'Unexpected configuration drift; keep guard enabled and stop.');
    return { configurationMatches: true, deliveryIsolationVerified: false, readyForHosting: false };
}
