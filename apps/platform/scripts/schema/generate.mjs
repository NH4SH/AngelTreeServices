import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = fileURLToPath(new URL('../../../..', import.meta.url));
const out = fileURLToPath(new URL('../../src/lib/types/database.generated.ts', import.meta.url));
const manifestPath = fileURLToPath(new URL('./manifest.json', import.meta.url));
const hash = s => createHash('sha256').update(s).digest('hex');
const migrations = await Promise.all((await readdir(`${root}/supabase/migrations`)).filter(n => n.endsWith('.sql')).sort()
  .map(async name => ({ name, sha256: hash(await readFile(`${root}/supabase/migrations/${name}`)) })));
const check = process.argv.includes('--check');
const offline = process.argv.includes('--offline');
const cliVersion = '2.121.0';
if (offline) {
  const saved = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (saved.cliVersion !== cliVersion || JSON.stringify(saved.migrations) !== JSON.stringify(migrations)
      || saved.typesSha256 !== hash(await readFile(out))) throw new Error('Schema contract changed: regenerate from a fresh disposable local migration replay.');
  console.log('Committed schema contract and migration fingerprints match.');
} else {
  const url = new URL(process.env.SCHEMA_DATABASE_URL ?? 'invalid:');
  if (process.env.SCHEMA_DISPOSABLE !== '1' || !['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Schema generation requires SCHEMA_DISPOSABLE=1 and a loopback SCHEMA_DATABASE_URL. Never use hosted/linked projects.');
  // This explicitly guarded loopback connection uses the local CLI stack's TLS setting.
  url.searchParams.set('sslmode', 'disable');
  const bin = process.env.SUPABASE_BIN || 'supabase';
  function run(args) {
    const p = spawnSync(bin, args, { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    // Do not echo args, stdout or stderr on failure: CLI diagnostics may include credentials.
    if (p.status !== 0) {
      if (process.env.SCHEMA_DIAGNOSTICS_FILE) writeFileSync(process.env.SCHEMA_DIAGNOSTICS_FILE, JSON.stringify({status:p.status,signal:p.signal,error:p.error?.message,stderr:p.stderr,stdout:p.stdout}), { mode: 0o600 });
      throw new Error('Local Supabase schema command failed. Inspect the disposable stack privately.');
    }
    return p.stdout;
  }
  if (run(['--version']).trim() !== cliVersion) throw new Error(`Use Supabase CLI ${cliVersion}.`);
  const raw = run(['gen', 'types', 'typescript', '--db-url', url.href, '--schema', 'public']);
  // Extensions can live in public or extensions depending on bootstrap version.
  // Their vendor APIs are not part of the application's public schema contract.
  const meta = JSON.parse(run(['db', 'query', "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_depend d on d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e' where n.nspname='public' order by p.proname", '--db-url', url.href, '--output', 'json']));
  const metadataRows = Array.isArray(meta) ? meta : meta.rows;
  if (!Array.isArray(metadataRows)) throw new Error('Invalid extension metadata response.');
  const excluded = new Set(metadataRows.map(row => row.proname));
  const source = ts.createSourceFile('database.ts', raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length) throw new Error('Invalid generated TypeScript.');
  const database = source.statements.find(s => ts.isTypeAliasDeclaration(s) && s.name.text === 'Database');
  const publicSchema = database?.type.members?.find(m => m.name?.getText(source).replaceAll('"', '') === 'public');
  const functions = publicSchema?.type.members?.find(m => m.name?.getText(source) === 'Functions');
  if (!functions?.type.members) throw new Error('Unexpected generated schema shape.');
  const removed = functions.type.members.filter(m => excluded.has(m.name?.getText(source).replaceAll('"', '')));
  const transformer = context => node => {
    const visit = n => removed.includes(n) ? undefined : ts.visitEachChild(n, visit, context);
    return ts.visitNode(node, visit);
  };
  const transformed = ts.transform(source, [transformer]);
  const text = '// Generated from committed migrations. Do not edit; see PR18_SCHEMA_CONTRACTS.md.\n'
    + ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(transformed.transformed[0]);
  transformed.dispose();
  const manifest = { cliVersion, typesSha256: hash(text), migrations };
  if (check) {
    if (text !== await readFile(out, 'utf8') || JSON.stringify(manifest) !== JSON.stringify(JSON.parse(await readFile(manifestPath, 'utf8')))) throw new Error('Generated schema drift. Regenerate and review the contract.');
    console.log('Fresh disposable schema matches the committed contract.');
  } else {
    await writeFile(out, text); await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log('Generated application schema contract (no rows or credentials).');
  }
}
