// Owns one temporary local project; never reads linked config or hosted keys.
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const root = fileURLToPath(new URL('../../../..', import.meta.url));
const bin = process.env.SUPABASE_BIN || 'supabase';
const dir = await mkdtemp(join(tmpdir(), 'ats-schema-'));
const project = `ats_contract_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
function cli(args) {
  const p = spawnSync(bin, [...args, '--workdir', dir], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (p.status !== 0) {
    writeFileSync(join(dir, `diagnostics-${args[0]}.private.log`), p.stderr || p.stdout || String(p.error), { mode: 0o600 });
    throw new Error(`Disposable schema command ${args[0]} failed. Inspect ${dir}/diagnostics-${args[0]}.private.log privately; it may contain local keys.`);
  }
  return p.stdout;
}
let started = false;
try {
  cli(['init']);
  const path = join(dir, 'supabase/config.toml');
  let config = await readFile(path, 'utf8');
  config = config.replace(/^project_id = .*/m, `project_id = "${project}"`)
    .replaceAll('54321', '56421').replaceAll('54322', '56422').replaceAll('54320', '56420')
    .replaceAll('54323', '56423').replaceAll('54324', '56424').replaceAll('54327', '56427').replaceAll('54329', '56429');
  await writeFile(path, config);
  await cp(join(root, 'supabase/migrations'), join(dir, 'supabase/migrations'), { recursive: true });
  started = true;
  console.log(`Disposable diagnostics directory: ${dir}`);
  console.log('Replaying committed migrations in a separate temporary Supabase project.');
  cli(['start', '--exclude', 'realtime,imgproxy,studio,edge-runtime,logflare,vector,supavisor,mailpit']);
  const status = JSON.parse(cli(['status', '--output', 'json']));
  const p = spawnSync(process.execPath, [fileURLToPath(new URL('./generate.mjs', import.meta.url)), ...(process.argv.includes('--write') ? [] : ['--check'])], {
    cwd: join(root, 'apps/platform'), stdio: 'inherit', env: { ...process.env, SUPABASE_BIN: bin,
      SCHEMA_DIAGNOSTICS_FILE: join(dir, 'generation.private.log'), SCHEMA_DISPOSABLE: '1', SCHEMA_DATABASE_URL: status.DB_URL },
  });
  if (p.status !== 0) throw new Error('Fresh schema contract check failed.');
} finally {
  if (started) { try { cli(['stop', '--project-id', project, '--no-backup']); } catch { console.error(`Temporary project ${project} needs local cleanup; no shared stack was stopped.`); } }
  // Leave the temporary migration/config directory for diagnosis; it contains no credentials.
}
