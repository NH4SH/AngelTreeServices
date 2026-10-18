// Staging-only operational reconciliation. Never a production migration runner.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

export const stagingRef = 'gbyhdsuiqeslgjdnbqng';
const organization = 'crisckykyefqdpatbfgb';
const root = new URL('../../../../', import.meta.url);
const sha = text => createHash('sha256').update(text).digest('hex');
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";

export function assertTarget(ref, projects) {
  assert.equal(ref, stagingRef, 'Only the assigned staging project is supported.');
  const list = Array.isArray(projects) ? projects : projects.projects;
  assert.ok(Array.isArray(list), 'CLI project listing has an unsupported shape.');
  const target = list.find(p => p.id === ref);
  assert.ok(target && target.name === 'CRM Staging' && target.organization_id === organization && target.status === 'ACTIVE_HEALTHY', 'Staging project identity/organization/health did not match.');
}

// Metadata and aggregate counts only: no business rows, keys or function bodies.
export function snapshotSQL(catalog) {
  return `with catalog as (${catalog.trim().replace(/;$/, '')})
select jsonb_build_object(
 'apiAclSeal',(select md5(coalesce(jsonb_agg(jsonb_build_object('kind',kind,'key',key,'acl',value->'acl') order by kind,key),'[]'::jsonb)::text) from catalog where kind in ('relation','routine') and key like 'public.%'),
 'shapeSeal',(select md5(coalesce(jsonb_agg(case when (kind in ('relation','routine') and key like 'public.%') or (kind='schema' and key='public') then jsonb_build_object('kind',kind,'key',key,'value',value-'acl') else to_jsonb(c) end order by kind,key),'[]'::jsonb)::text) from catalog c where kind<>'default_acl'),
 'ledgerSeal',(select md5(coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name) order by version),'[]'::jsonb)::text) from supabase_migrations.schema_migrations),
 'migrationCount',(select count(*) from supabase_migrations.schema_migrations),
 'ownedDefaultsSeal',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by kind,key),'[]'::jsonb)::text) from catalog c where kind='default_acl' and value->>'owner'='postgres'),
 'managedDefaultsSeal',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by kind,key),'[]'::jsonb)::text) from catalog c where kind='default_acl' and value->>'owner'='supabase_admin'),
 'ownedDefaultApiGrants',(select count(*) from catalog c cross join lateral jsonb_array_elements(c.value->'acl') a where c.kind='default_acl' and c.value->>'owner'='postgres' and a->>'grantee' in ('anon','authenticated','service_role')),
 'unexpectedDefaultScope',exists(select 1 from catalog where kind='default_acl' and (value->>'schema' is distinct from 'public' or value->>'owner' not in ('postgres','supabase_admin'))),
 'unsafeSchemaCreate',has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE'),
 'currentUser',current_user,'superuser',(select rolsuper from pg_roles where rolname=current_user),
 'managedAdminMember',pg_has_role(current_user,'supabase_admin','MEMBER'),
 'state',jsonb_build_object(
  'authUsers',(select count(*) from auth.users),'storageObjects',(select count(*) from storage.objects),
  'customers',(select count(*) from public.customers),'jobs',(select count(*) from public.jobs),'quotes',(select count(*) from public.quotes),
  'invoices',(select count(*) from public.invoices),'payments',(select count(*) from public.payments),
  'communications',(select count(*) from public.customer_communications),'calendarConnections',(select count(*) from public.google_calendar_connections),
  'stripeReceipts',(select count(*) from public.stripe_webhook_events),
  'sending',(select automated_sending_enabled from public.communication_settings),
  'recurring',(select automated_generation_enabled from public.recurring_service_settings),
  'documentScanning',(select enabled from app_private.document_scan_settings),
  'attachmentScanning',(select bool_or(enabled) from app_private.attachment_scan_settings))
) as snapshot`;
}

export function assessSnapshot(profile, snapshot) {
  assert.equal(profile.projectRef, stagingRef);
  assert.equal(snapshot.currentUser, 'postgres', 'Use the normal migration owner.');
  assert.equal(snapshot.superuser, false, 'Do not escalate privileges.');
  assert.equal(snapshot.managedAdminMember, false, 'The migration role must not be a member of the protected managed role.');
  assert.equal(snapshot.shapeSeal, profile.shapeSeal, 'Schema, owners, RLS, private grants or column permissions changed.');
  assert.equal(snapshot.ledgerSeal, profile.ledgerSeal, 'Migration versions/names changed.');
  assert.equal(snapshot.migrationCount, profile.expectedMigrationCount);
  assert.ok([profile.initialApiAclSeal, profile.expectedApiAclSeal].includes(snapshot.apiAclSeal), 'Unknown object grants; review instead of normalizing them.');
  assert.ok(profile.allowedOwnedDefaultsSeals.includes(snapshot.ownedDefaultsSeal), 'Unknown migration-owner defaults.');
  assert.ok(profile.allowedManagedDefaultsSeals.includes(snapshot.managedDefaultsSeal), 'Protected managed defaults changed.');
  assert.equal(snapshot.unexpectedDefaultScope, false, 'Global or other-schema defaults require a separate review.');
  assert.equal(snapshot.unsafeSchemaCreate, false);
  const counters = ['authUsers','storageObjects','customers','jobs','quotes','invoices','payments','communications','calendarConnections','stripeReceipts'];
  const gates = ['sending','recurring','documentScanning','attachmentScanning'];
  assert.deepEqual(Object.keys(snapshot.state).sort(), [...counters,...gates].sort(), 'Incomplete state evidence.');
  for (const key of counters) assert.equal(snapshot.state[key], 0, 'This initialization tool requires an empty staging target.');
  for (const key of gates) assert.equal(snapshot.state[key], false, 'Automation and scanning must remain off.');
  return { currentObjectGrantsMatch: snapshot.apiAclSeal === profile.expectedApiAclSeal, migrationOwnerDefaultsRestricted: snapshot.ownedDefaultApiGrants === 0 };
}

export function buildApplySQL(profile, before, commands, catalog) {
  assessSnapshot(profile, before);
  assert.equal(sha(commands), profile.commandsSha256, 'Reviewed SQL changed.');
  assert.equal(sha(catalog), profile.catalogQuerySha256, 'Catalog query changed.');
  const query = snapshotSQL(catalog);
  // The complete preimage is rechecked inside the same transaction as REVOKE.
  // Any unexpected change or failed postcondition rolls back every statement.
  return `begin isolation level serializable;
set local lock_timeout='5s'; set local statement_timeout='60s';
do $ats_before$ declare observed jsonb; begin
 if not pg_try_advisory_xact_lock(178214,3102) then raise exception 'Staging permission review is already running'; end if;
 observed:=(${query});
 if observed is distinct from ${literal(JSON.stringify(before))}::jsonb then raise exception 'Staging preimage changed; nothing applied'; end if;
end $ats_before$;
${commands}
do $ats_after$ declare observed jsonb; begin
 observed:=(${query});
 if observed->>'apiAclSeal' is distinct from ${literal(profile.expectedApiAclSeal)}
 or observed->>'shapeSeal' is distinct from ${literal(before.shapeSeal)}
 or observed->>'ledgerSeal' is distinct from ${literal(before.ledgerSeal)}
 or observed->>'managedDefaultsSeal' is distinct from ${literal(before.managedDefaultsSeal)}
 or (observed->>'ownedDefaultApiGrants')::int<>0
 or observed->'state' is distinct from ${literal(JSON.stringify(before.state))}::jsonb
 or (observed->>'unsafeSchemaCreate')::boolean
 or (observed->>'unexpectedDefaultScope')::boolean
 then raise exception 'Staging permission postcondition failed; everything rolled back'; end if;
end $ats_after$;
${query};
commit;`;
}

function run() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log('staging-permissions.mjs --project-ref <assigned staging ref> [--apply]\nDefault: read-only check. No production targets, resets, migrations, credentials or deployments.'); return; }
  assert.ok(args.length === 2 || (args.length === 3 && args[2] === '--apply'));
  assert.equal(args[0], '--project-ref');
  assert.equal(args[1], stagingRef, 'Refuse non-staging target before running any tool.');
  const profile = JSON.parse(readFileSync(new URL('supabase/staging/permission-profile.json', root), 'utf8'));
  const catalog = readFileSync(new URL('supabase/verification/release_catalog.sql', root), 'utf8');
  const commands = readFileSync(new URL('supabase/staging/reconcile-permissions.sql', root), 'utf8');
  const manifest = readFileSync(new URL('supabase/reconciliation/release-2026-10-17.json', root));
  assert.equal(sha(manifest), profile.migrationManifestSha256, 'Pinned release manifest changed.');
  const files = JSON.parse(manifest).files;
  assert.deepEqual(readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort(), files.map(f=>f.file).sort(), 'Migration inventory changed; review the new release.');
  for (const f of files) assert.equal(sha(readFileSync(new URL('supabase/migrations/' + f.file, root))), f.sha256, 'Original migration file changed.');
  const directory = mkdtempSync(join(tmpdir(), 'ats-staging-permissions-'));
  mkdirSync(join(directory, 'supabase'));
  writeFileSync(join(directory, 'supabase/config.toml'), 'project_id="ats_staging_permissions"\n[db.seed]\nenabled=false\n');
  const cli = process.env.STAGING_SUPABASE_BIN || 'supabase';
  function call(argv, phase) {
    try { const text = execFileSync(cli, [...argv,'--workdir',directory,'--output-format','json'], { encoding:'utf8', maxBuffer:8*1024*1024, stdio:['ignore','pipe','pipe'] }); writeFileSync(join(directory, phase + '.json'), text, { mode:0o600 }); return JSON.parse(text); }
    catch (error) { writeFileSync(join(directory, phase + '.private.log'), String(error.stderr ?? ''), { mode:0o600 }); throw Error('Staging operation failed; inspect private evidence in ' + directory); }
  }
  assertTarget(args[1], call(['projects','list'], 'projects'));
  const sql = snapshotSQL(catalog);
  function query(source, phase) { const file = join(directory, phase + '.sql'); writeFileSync(file, source, { mode:0o600 }); return call(['db','query','--linked','--project-ref',stagingRef,'--file',file],phase).rows[0].snapshot; }
  const before = query('begin read only;\n' + sql + ';\ncommit;', 'before');
  const initial = assessSnapshot(profile, before);
  let after = before;
  const changed = args.includes('--apply') && (!initial.currentObjectGrantsMatch || !initial.migrationOwnerDefaultsRestricted);
  if (changed) after = query(buildApplySQL(profile,before,commands,catalog),'apply');
  const verified = assessSnapshot(profile, after);
  const result = { projectRef:stagingRef, evidenceDirectory:directory, changed, ...verified,
    managedAdminDefaultsChanged:false, globalDefaultsChanged:false, migrationHistoryChanged:false,
    productionWrites:false, deployed:false, readyForHosting:false };
  writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { run(); } catch (error) { console.error(error.message); process.exitCode=1; }
}
