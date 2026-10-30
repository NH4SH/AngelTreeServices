// Read-only native rehearsal verifier. No connection strings, credentials,
// provider clients, writes, grants, admission certificates or cleanup commands.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const stable = value => Array.isArray(value) ? '[' + value.map(stable).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}' : JSON.stringify(value);
const equal = (a, b) => stable(a) === stable(b);
const requiredTables = Object.freeze([
  'firewood_live_handoff_sources', 'firewood_live_handoffs', 'firewood_live_handoff_payment_events',
  'firewood_live_handoff_observations', 'firewood_live_price_approvals', 'firewood_live_office_requests',
  'firewood_live_order_workflows', 'firewood_live_office_events', 'firewood_live_office_receipts',
]);
const authCommands = new Set(['approve_firewood_live_price', 'revoke_firewood_live_price',
  'list_firewood_live_office', 'inspect_firewood_live_office', 'approve_firewood_live_office_request',
  'revoke_firewood_live_office_request', 'record_firewood_live_delivery', 'request_firewood_live_cancellation', 'confirm_firewood_live_cancellation']);
const serviceCommands = new Set(['get_firewood_live_handoff_context', 'prepare_firewood_live_handoff', 'renew_firewood_live_handoff',
  'read_firewood_live_handoff', 'record_firewood_live_handoff_observation', 'get_firewood_live_collector_context',
  'request_firewood_live_office_price', 'read_firewood_live_office_price', 'get_firewood_live_order_workflow']);
const apiRoles = ['anon', 'authenticated', 'service_role'];
function expectedPrivateTables(expected) {
  const additional = expected.additionalPrivateLiveTables ?? [];
  assert.ok(Array.isArray(additional) && additional.every(name => /^firewood_live_[a-z_]+$/.test(name)), 'Explicit live private table names required');
  const names = [...requiredTables, ...additional];
  assert.equal(new Set(names).size, names.length, 'Duplicate expected private table');
  return names;
}
async function rows(query, sql) { const result = await query(sql); return Array.isArray(result) ? result : result.rows; }
async function one(query, sql) { const result = await rows(query, sql); assert.equal(result?.length, 1, 'Native query must return exactly one row'); return result[0]; }

export const identitySql = () => `select current_database() as database,
  (pg_control_system()).system_identifier::text as system_identifier,
  current_setting('data_directory') as data_directory,
  current_setting('server_version_num')::integer as version_num,
  current_setting('listen_addresses') as listen_addresses,
  inet_server_addr()::text as connected_address,
  inet_server_port() as connected_port,
  pg_postmaster_start_time()::text as postmaster_started,
  (select pg_catalog.shobj_description(oid,'pg_database') from pg_catalog.pg_database where datname=current_database()) as marker,
  current_user as operator;`;

export async function assertNativeRehearsalIdentity(query, expected) {
  assert.ok(expected && typeof expected.database === 'string' && /^(?:ats_|fw_)[a-z0-9_]*native[a-z0-9_]*$/.test(expected.database), 'Explicit uniquely named native rehearsal database required');
  assert.match(expected.systemIdentifier ?? '', /^\d{16,22}$/, 'Fresh native system identifier required');
  assert.ok(typeof expected.dataDirectory === 'string' && expected.dataDirectory.startsWith('/') && /rehearsal|native/.test(expected.dataDirectory), 'Explicit owned native data directory required');
  assert.match(expected.marker ?? '', /^ats-firewood-native-rehearsal:[a-f0-9-]{36}:synthetic-only$/, 'Explicit synthetic database marker required');
  const actual = await one(query, identitySql());
  assert.equal(actual.database, expected.database, 'Wrong database: stop without reading business metadata');
  assert.equal(actual.system_identifier, expected.systemIdentifier, 'Wrong cluster system identifier');
  assert.equal(actual.data_directory, expected.dataDirectory, 'Wrong cluster data directory');
  assert.equal(actual.marker, expected.marker, 'Wrong synthetic database marker');
  assert.ok(actual.version_num >= 170000 && actual.version_num < 180000, 'Reviewed native PostgreSQL 17 required');
  assert.ok(['', '127.0.0.1', 'localhost', '::1'].includes(actual.listen_addresses), 'Rehearsal must not listen on a public address');
  assert.ok(actual.connected_address === null || ['127.0.0.1', '::1'].includes(actual.connected_address), 'Native connection must use the private Unix socket or loopback');
  return actual;
}

export function catalogSql() { return `
with funcs as (
 select n.nspname as schema,p.proname as name,
   format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) as signature,
   pg_get_functiondef(p.oid) as definition,p.prosrc as body,pg_get_userbyid(p.proowner) as owner,
   p.prosecdef as definer,p.proconfig as settings,p.provolatile as volatility,
   coalesce((select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee)end,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)order by a.grantee,a.grantor,a.privilege_type,a.is_grantable)from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a),'[]'::jsonb)as acl,
   jsonb_build_object('anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE'))as execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in('public','app_private','private','hosting_guard')and p.prokind='f'
),tables as (
 select n.nspname as schema,c.relname as name,pg_get_userbyid(c.relowner)as owner,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,
   coalesce((select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee)end,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)order by a.grantee,a.grantor,a.privilege_type,a.is_grantable)from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a),'[]'::jsonb)as acl,
   jsonb_build_object('anon',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'authenticated',has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'service_role',has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))as any_api_privilege,
   coalesce((select jsonb_agg(jsonb_build_object('name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text)order by a.attnum)from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'[]'::jsonb)as columns,
   coalesce((select jsonb_agg(jsonb_build_object('name',x.conname,'definition',pg_get_constraintdef(x.oid,true),'validated',x.convalidated,'deferrable',x.condeferrable,'initially_deferred',x.condeferred)order by x.conname)from pg_constraint x where x.conrelid=c.oid),'[]'::jsonb)as constraints,
   coalesce((select jsonb_agg(jsonb_build_object('name',ic.relname,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready)order by ic.relname)from pg_index i join pg_class ic on ic.oid=i.indexrelid where i.indrelid=c.oid),'[]'::jsonb)as indexes,
   coalesce((select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled,'deferrable',t.tgdeferrable,'initially_deferred',t.tginitdeferred)order by t.tgname)from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),'[]'::jsonb)as triggers,
   coalesce((select jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(select jsonb_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r)end order by r)from unnest(p.polroles)r),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))order by p.polname)from pg_policy p where p.polrelid=c.oid),'[]'::jsonb)as policies
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','app_private','private','hosting_guard')and c.relkind in('r','p')
),views as (
 select n.nspname as schema,c.relname as name,pg_get_userbyid(c.relowner)as owner,c.relacl::text as acl,c.reloptions as options,pg_get_viewdef(c.oid,true)as definition
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','app_private','private','hosting_guard')and c.relkind in('v','m')
),sequences as (
 select n.nspname as schema,c.relname as name,pg_get_userbyid(c.relowner)as owner,c.relacl::text as acl,
   s.seqstart::text as start,s.seqincrement::text as increment,s.seqmax::text as maximum,s.seqmin::text as minimum,s.seqcache::text as cache,s.seqcycle as cycle
 from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','app_private','private','hosting_guard')
),schemas as (
 select nspname as name,pg_get_userbyid(nspowner)as owner,nspacl::text as acl from pg_namespace where nspname in('public','app_private','private','hosting_guard')
),roles as (
 select rolname as name,rolsuper as superuser,rolcanlogin as login,rolbypassrls as bypass_rls,rolinherit as inherit,
   rolcreaterole as create_role,rolcreatedb as create_db,rolreplication as replication,rolconnlimit as connection_limit,rolvaliduntil::text as valid_until
 from pg_roles where rolname!~'^pg_'
),memberships as (
 select pg_get_userbyid(roleid)as role,pg_get_userbyid(member)as member,pg_get_userbyid(grantor)as grantor,
   admin_option as admin,inherit_option as inherit,set_option as set_role from pg_auth_members
),default_acl as (
 select pg_get_userbyid(d.defaclrole)as owner,coalesce(n.nspname,'')as schema,d.defaclobjtype::text as type,d.defaclacl::text as acl
 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
),role_settings as (
 select coalesce(d.datname,'*')as database,coalesce(r.rolname,'*')as role,s.setconfig as settings
 from pg_db_role_setting s left join pg_database d on d.oid=s.setdatabase left join pg_roles r on r.oid=s.setrole
 where s.setdatabase=0 or s.setdatabase=(select oid from pg_database where datname=current_database())
),event_triggers as (
 select e.evtname as name,pg_get_userbyid(e.evtowner)as owner,e.evtevent as event,e.evtenabled as enabled,e.evttags as tags,e.evtfoid::regprocedure::text as function
 from pg_event_trigger e
)
select jsonb_build_object('functions',coalesce((select jsonb_agg(to_jsonb(f)order by signature)from funcs f),'[]'::jsonb),
 'tables',coalesce((select jsonb_agg(to_jsonb(t)order by schema,name)from tables t),'[]'::jsonb),
 'views',coalesce((select jsonb_agg(to_jsonb(v)order by schema,name)from views v),'[]'::jsonb),
 'sequences',coalesce((select jsonb_agg(to_jsonb(s)order by schema,name)from sequences s),'[]'::jsonb),
 'schemas',coalesce((select jsonb_agg(to_jsonb(s)order by name)from schemas s),'[]'::jsonb),
 'roles',coalesce((select jsonb_agg(to_jsonb(r)order by name)from roles r),'[]'::jsonb),
 'memberships',coalesce((select jsonb_agg(to_jsonb(m)order by role,member,grantor)from memberships m),'[]'::jsonb),
 'defaultAcl',coalesce((select jsonb_agg(to_jsonb(a)order by owner,schema,type)from default_acl a),'[]'::jsonb),
 'roleSettings',coalesce((select jsonb_agg(to_jsonb(s)order by database,role)from role_settings s),'[]'::jsonb),
 'eventTriggers',coalesce((select jsonb_agg(to_jsonb(e)order by name)from event_triggers e),'[]'::jsonb)) as catalog;`; }

export async function captureNativeCatalog(query) {
  const value = (await one(query, catalogSql())).catalog;
  assert.ok(value && Array.isArray(value.functions) && Array.isArray(value.tables), 'Actual native catalog required');
  return value;
}

export function reviewedReceiptBackportPermit(baseline, receiptPatchPath) {
  const sql = readFileSync(receiptPatchPath, 'utf8');
  assert.equal(sha256(sql), 'f0009ec4c0c51b7e14cf8ec51554d8bec2dc42bb22c896f1cc18e39afba73327', 'Retained 102 receipt backport source changed');
  const anchor = /anchor text:=\$anchor\$([\s\S]*?)\$anchor\$;/.exec(sql)?.[1];
  const replacement = /replacement text:=\$replacement\$([\s\S]*?)\$replacement\$;/.exec(sql)?.[1];
  assert.ok(anchor && replacement, 'Pinned receipt clause not found');
  const before = baseline.functions.find(f => f.schema === 'public' && f.name === 'claim_outbound_delivery');
  assert.ok(before, 'Actual native 102 receipt command absent');
  if (before.definition.includes(replacement)) return {};
  assert.equal(before.definition.split(anchor).length, 2, 'Receipt preimage does not contain the exact reviewed single clause');
  if (before.body) assert.equal(createHash('md5').update(before.body).digest('hex'), '1900fbc1f487cd9847db7fdb32729e5a', 'Actual receipt body preimage changed');
  return { [before.signature]: { beforeSha256: sha256(before.definition), afterSha256: sha256(before.definition.replace(anchor, replacement)) } };
}

function compareOriginalCatalog(baseline, postimage, expected) {
  const changes = [], added = [], index = (items, key) => new Map(items.map(item => [key(item), item]));
  const functions = index(postimage.functions, f => f.signature);
  const allowed = expected.allowedOriginalFunctionChanges ?? {};
  for (const before of baseline.functions) {
    const after = functions.get(before.signature); assert.ok(after, 'Original function missing: ' + before.signature);
    const originalComparable = { ...before, body: null }, currentComparable = { ...after, body: null };
    if (!equal(originalComparable, currentComparable)) {
      assert.equal(before.owner, after.owner, 'Original function owner changed: ' + before.signature);
      assert.ok(equal(before.acl, after.acl) && equal(before.execute, after.execute), 'Original function privileges changed: ' + before.signature);
      const permit = allowed[before.signature];
      assert.ok(permit && permit.beforeSha256 === sha256(before.definition) && permit.afterSha256 === sha256(after.definition), 'Unreviewed original function changed: ' + before.signature);
      assert.ok(equal({ ...originalComparable, definition: null }, { ...currentComparable, definition: null }), 'Original function settings changed: ' + before.signature);
      changes.push(before.signature);
    }
  }
  const tableIndex = index(postimage.tables, t => t.schema + '.' + t.name);
  const permittedAdditions = new Set([
    'public.quotes:columns:document_terms_version', 'public.invoices:columns:document_terms_version',
    'public.quotes:constraints:quotes_document_terms_version_known', 'public.invoices:constraints:invoices_document_terms_version_known',
    'public.quotes:triggers:preserve_quote_document_terms', 'public.invoices:triggers:preserve_invoice_document_terms',
    'public.invoices:triggers:firewood_live_handoff_invoice_frozen', 'public.invoice_line_items:triggers:firewood_live_handoff_lines_frozen',
    'public.payments:triggers:firewood_live_handoff_payment_capture', 'public.invoice_checkout_sessions:triggers:firewood_live_cancellation_collection',
    ...(expected.additionalPermittedProperties ?? []),
  ]);
  for (const before of baseline.tables) {
    const name = before.schema + '.' + before.name, after = tableIndex.get(name); assert.ok(after, 'Original table missing: ' + name);
    for (const field of ['owner', 'rls', 'force_rls', 'acl', 'any_api_privilege', 'policies']) assert.ok(equal(before[field], after[field]), 'Original table boundary changed: ' + name + ':' + field);
    for (const field of ['columns', 'constraints', 'indexes', 'triggers']) {
      const afterItems = index(after[field], item => item.name);
      for (const original of before[field]) {
        const current = afterItems.get(original.name); assert.ok(current, 'Original ' + field + ' removed: ' + name + ':' + original.name);
        if (!equal(original, current)) {
          const key = name + ':' + field + ':' + original.name, permit = expected.allowedOriginalTableChanges?.[key];
          assert.ok(permit && permit.beforeSha256 === sha256(stable(original)) && permit.afterSha256 === sha256(stable(current)), 'Unreviewed original table change: ' + key);
          changes.push(key);
        }
      }
      const beforeNames = new Set(before[field].map(item => item.name));
      for (const current of after[field]) if (!beforeNames.has(current.name)) {
        const key = name + ':' + field + ':' + current.name;
        assert.ok(permittedAdditions.has(key), 'Unreviewed addition on original table: ' + key);
        if (field === 'columns' && current.name === 'document_terms_version') {
          assert.equal(current.type, 'text'); assert.equal(current.not_null, true);
          assert.equal(current.default, "'legacy-2026-10-22'::text"); assert.equal(current.acl, null);
        }
        added.push(key);
      }
    }
  }
  for (const collection of ['views', 'sequences', 'schemas', 'roles']) {
    const key = item => collection === 'roles' || collection === 'schemas' ? item.name : item.schema + '.' + item.name;
    const after = index(postimage[collection], key);
    for (const before of baseline[collection]) {
      const current = after.get(key(before));
      if (collection === 'views' && current && !equal(before, current)) {
        const permit = expected.allowedOriginalViewChanges?.[key(before)];
        assert.ok(permit && permit.beforeSha256 === sha256(before.definition) && permit.afterSha256 === sha256(current.definition), 'Unreviewed original view changed: ' + key(before));
        assert.ok(equal({ ...before, definition: null }, { ...current, definition: null }), 'Original view boundary changed: ' + key(before));
        changes.push(key(before));
      } else assert.ok(equal(before, current), 'Original ' + collection + ' changed: ' + key(before));
    }
  }
  for (const collection of ['memberships', 'defaultAcl', 'roleSettings']) {
    assert.ok(Array.isArray(baseline[collection]) && equal(baseline[collection], postimage[collection]), 'Original access metadata changed: ' + collection);
  }
  const currentEvents = index(postimage.eventTriggers, event => event.name);
  assert.ok(Array.isArray(baseline.eventTriggers), 'Actual preimage event-trigger catalog required');
  for (const event of baseline.eventTriggers) assert.ok(equal(event, currentEvents.get(event.name)), 'Original event trigger changed: ' + event.name);
  const knownAdditions = {
    functions: new Set(['app_private.preserve_document_terms_version', ...(expected.additionalNewObjects?.functions ?? [])]),
    tables: new Set(expectedPrivateTables(expected).map(name => 'app_private.' + name).concat(expected.additionalNewObjects?.tables ?? [])),
    views: new Set(expected.additionalNewObjects?.views ?? []), sequences: new Set(expected.additionalNewObjects?.sequences ?? []),
    schemas: new Set(expected.additionalNewObjects?.schemas ?? []), roles: new Set(expected.additionalNewObjects?.roles ?? []),
    eventTriggers: new Set(expected.additionalNewObjects?.eventTriggers ?? []),
  };
  for (const collection of Object.keys(knownAdditions)) {
    const key = item => ['roles', 'schemas', 'eventTriggers'].includes(collection) ? item.name : item.schema + '.' + item.name;
    const originals = new Set(baseline[collection].map(key));
    for (const item of postimage[collection]) if (!originals.has(key(item))) {
      assert.ok(knownAdditions[collection].has(key(item)) || (collection === 'functions' && item.name.includes('firewood_live')), 'Unreviewed new ' + collection + ': ' + key(item));
    }
  }
  return { changedOriginalObjects: changes, addedPropertiesOnOriginalTables: added };
}

export async function verifyNativeReadback({ query, expected, baseline, outputPath }) {
  const identity = await assertNativeRehearsalIdentity(query, expected), postimage = await captureNativeCatalog(query);
  assert.ok(baseline && Array.isArray(baseline.functions) && Array.isArray(baseline.tables), 'Actual preimage catalog required');
  const comparison = compareOriginalCatalog(baseline, postimage, expected);
  const expectedAuthCommands = new Set(authCommands);
  for (const name of expected.additionalAuthenticatedCommands ?? []) {
    assert.match(name, /^[a-z_]+firewood_live[a-z_]*$/); assert.ok(!expectedAuthCommands.has(name), 'Duplicate additional authenticated command');
    expectedAuthCommands.add(name);
  }
  const privateReadFunctions = new Set(expected.additionalPrivateAuthenticatedReadFunctions ?? []);
  for (const name of privateReadFunctions) assert.match(name, /^firewood_live_[a-z_]+$/);
  const termsHelper = postimage.functions.find(fn => fn.schema === 'app_private' && fn.name === 'preserve_document_terms_version');
  assert.ok(termsHelper, 'Reviewed document terms helper required');
  assert.equal(sha256(termsHelper.body), '212fda44c8e277bff0157b31ac06036f501abc7f99bdb1397f4f005c0622618c', 'Document terms helper differs from reviewed prerequisite');
  assert.equal(termsHelper.owner, expected.newObjectOwner ?? 'postgres');
  assert.equal(termsHelper.definer, false);
  assert.deepEqual(termsHelper.settings, ['search_path=""']);
  assert.ok(termsHelper.acl.every(acl => acl.grantee === termsHelper.owner && acl.privilege === 'EXECUTE' && !acl.grantable));
  assert.ok(apiRoles.every(role => termsHelper.execute[role] === false));
  for (const tableName of ['quotes', 'invoices']) {
    const table = postimage.tables.find(table => table.schema === 'public' && table.name === tableName);
    const constraint = table?.constraints.find(item => item.name === tableName + '_document_terms_version_known');
    const expression = "CHECKdocument_terms_version='legacy-2026-10-22'::text" + (tableName === 'invoices' ? "ORdocument_terms_version='firewood-household-live-2026-10-29-v1'::text" : '');
    assert.ok(constraint?.validated === true && constraint.deferrable === false && constraint.initially_deferred === false);
    assert.equal(constraint.definition.replace(/[\s()]/g, ''), expression, 'Terms constraint differs from reviewed exact families: ' + tableName);
  }
  const newTables = postimage.tables.filter(t => t.schema === 'app_private' && t.name.startsWith('firewood_live_'));
  assert.deepEqual(newTables.map(t => t.name).sort(), expectedPrivateTables(expected).sort(), 'Exact reviewed live private tables required');
  for (const table of newTables) {
    assert.equal(table.owner, expected.newObjectOwner ?? 'postgres', 'Unexpected new table owner: ' + table.name);
    assert.equal(table.rls, true, 'New table RLS missing: ' + table.name);
    assert.ok(apiRoles.every(role => table.any_api_privilege[role] === false), 'Direct new table API privilege: ' + table.name);
    assert.equal(table.policies.length, 0, 'Unexpected new private table policy: ' + table.name);
    assert.ok(table.acl.every(acl => acl.grantee === table.owner), 'Non-owner private table privilege: ' + table.name);
  }
  const sourceTable = newTables.find(table => table.name === 'firewood_live_handoff_sources');
  for (const flag of ['enabled', 'collector_enabled', 'surcharge_reporting_enabled', 'sender_enabled']) {
    const column = sourceTable.columns.find(column => column.name === flag);
    assert.ok(column && column.type === 'boolean' && column.not_null === true && column.default === 'false', 'Source flags must install default-off: ' + flag);
  }
  const liveFunctions = postimage.functions.filter(f => f.name.includes('firewood_live'));
  const expectedFunctions = new Map(), sourceHashes = {};
  for (const path of expected.liveSqlPaths ?? []) {
    const sql = readFileSync(path, 'utf8');
    sourceHashes[path] = sha256(sql);
    const pattern = /^create\s+(?:or\s+replace\s+)?function\s+((?:public|app_private)\.[a-z_]+)\s*\([\s\S]*?\)\s*returns\b([\s\S]*?)\bas\s+(\$[a-z_0-9]*\$)([\s\S]*?)\3\s*;/gmi;
    for (const match of sql.matchAll(pattern)) {
      if (!match[1].includes('firewood_live')) continue;
      const header = match[2], settings = [];
      for (const set of header.matchAll(/\bset\s+([a-z_]+)\s*=\s*'([^']*)'/gi)) settings.push(set[1].toLowerCase() + '=' + (set[2] === '' ? '""' : set[2]));
      expectedFunctions.set(match[1], { body: match[4], definer: /\bsecurity\s+definer\b/i.test(header),
        volatility: /\bimmutable\b/i.test(header) ? 'i' : /\bstable\b/i.test(header) ? 's' : 'v', settings: settings.sort() });
    }
  }
  assert.equal(expectedFunctions.size, liveFunctions.length, 'Both pinned review SQL sources and exact native function count required');
  for (const fn of liveFunctions) {
    const reviewed = expectedFunctions.get(fn.schema + '.' + fn.name);
    assert.ok(reviewed, 'Unreviewed native live function: ' + fn.signature);
    assert.equal(fn.body, reviewed.body, 'Native live body differs from review SQL: ' + fn.signature);
    assert.equal(fn.definer, reviewed.definer, 'Native live security mode differs from review SQL: ' + fn.signature);
    assert.equal(fn.volatility, reviewed.volatility, 'Native live volatility differs from review SQL: ' + fn.signature);
    const normalizedSettings = (fn.settings ?? []).map(setting => setting.replace(/^[^=]+/, key => key.toLowerCase())).sort();
    assert.deepEqual(normalizedSettings, reviewed.settings, 'Native live settings differ from review SQL: ' + fn.signature);
    assert.equal(fn.owner, expected.newObjectOwner ?? 'postgres', 'Unexpected live function owner: ' + fn.signature);
    assert.ok(fn.settings?.includes('search_path=""'), 'Unpinned live function search path: ' + fn.signature);
    assert.ok(!fn.acl.some(acl => acl.grantee === 'PUBLIC'), 'PUBLIC live function execute: ' + fn.signature);
    const privateAuthenticatedRead = fn.schema === 'app_private' && privateReadFunctions.has(fn.name);
    if (privateAuthenticatedRead) {
      assert.equal(fn.definer, true, 'Declared private report helper must be a definer');
      assert.equal(fn.volatility, 's', 'Declared private report helper must be stable/read-only');
    }
    const shouldAuth = fn.schema === 'public' && expectedAuthCommands.has(fn.name) || privateAuthenticatedRead;
    const shouldService = fn.schema === 'public' && serviceCommands.has(fn.name);
    const allowedGrantees = new Set([fn.owner, ...(shouldAuth ? ['authenticated'] : []), ...(shouldService ? ['service_role'] : [])]);
    assert.ok(fn.acl.every(acl => allowedGrantees.has(acl.grantee) && acl.privilege === 'EXECUTE' && !acl.grantable), 'Unlisted or delegable live function privilege: ' + fn.signature);
    assert.equal(fn.execute.anon, false, 'Anonymous live RPC: ' + fn.signature);
    assert.equal(fn.execute.authenticated, shouldAuth, 'Unexpected authenticated RPC boundary: ' + fn.signature);
    assert.equal(fn.execute.service_role, shouldService, 'Unexpected service RPC boundary: ' + fn.signature);
    if (fn.schema === 'public') assert.ok(shouldAuth || shouldService, 'Unlisted public live entrypoint: ' + fn.signature);
  }
  assert.equal(liveFunctions.filter(f => f.schema === 'public').length, expectedAuthCommands.size + serviceCommands.size, 'Live public entrypoint count changed');
  const sources = await rows(query, 'select id,enabled,collector_enabled,surcharge_reporting_enabled,sender_enabled from app_private.firewood_live_handoff_sources order by id');
  for (const source of sources) for (const flag of ['enabled', 'collector_enabled', 'surcharge_reporting_enabled', 'sender_enabled']) assert.equal(source[flag], false, 'Final source flag must be off: ' + flag);
  if (expected.sourceMustBeAbsent) assert.equal(sources.length, 0, 'Installation must not seed a live source');
  const loginRoles = postimage.roles.filter(r => r.login).map(r => r.name).sort();
  assert.deepEqual(loginRoles, [...(expected.allowedLoginRoles ?? [identity.operator])].sort(), 'Unexpected native login roles');
  const guardEnrollment = newTables.map(t => ({ table: 'app_private.' + t.name,
    triggers: t.triggers.filter(trigger => ['ats_hosting_admission', 'ats_hosting_commit', 'ats_hosting_truncate'].includes(trigger.name)).map(trigger => trigger.name).sort() }));
  const proof = { kind: 'isolated-native-firewood-security-readback', at: new Date().toISOString(),
    identity, nativePostgres: true, baselineFunctions: baseline.functions.length, postimageFunctions: postimage.functions.length,
    baselineTables: baseline.tables.length, postimageTables: postimage.tables.length, ...comparison,
    privateLiveTables: newTables.map(t => 'app_private.' + t.name), publicLiveFunctions: liveFunctions.filter(f => f.schema === 'public').length,
    directApiTablePrivilegesDenied: true, exactRoleLimitedEntrypoints: true, finalSourceRows: sources,
    guardEnrollment, guardEnrollmentComplete: guardEnrollment.every(t => t.triggers.length === 3),
    actualProductionReadback: false, productionChanged: false, admissionGranted: false, recoveryCertificateIssued: false,
    noProviderOrCustomerRowsRead: true, sourceHashes, metadataSha256: sha256(stable(postimage)), baselineSha256: sha256(stable(baseline)) };
  if (outputPath) writeFileSync(outputPath, JSON.stringify(proof, null, 2) + '\n', { mode: 0o600 });
  return { proof, catalog: postimage };
}

// Only an explicitly supplied owned adapter can connect. Never inspect ambient
// DATABASE_URL or a credential file as a fallback.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 6 && args[0] === '--adapter' && args[2] === '--baseline' && args[4] === '--output', 'Usage: --adapter <owned module> --baseline <private metadata JSON> --output <proof JSON>');
  const adapter = await import(pathToFileURL(args[1]));
  const result = await verifyNativeReadback({ query: adapter.query, expected: adapter.expected,
    baseline: JSON.parse(readFileSync(args[3], 'utf8')), outputPath: args[5] });
  console.log(JSON.stringify({ nativeSecurityReadbackPassed: true, privateTables: result.proof.privateLiveTables.length,
    publicLiveFunctions: result.proof.publicLiveFunctions, sourceEnabled: false, productionChanged: false,
    guardEnrollmentComplete: result.proof.guardEnrollmentComplete, recoveryCertificateIssued: false }));
  await adapter.close?.();
}
