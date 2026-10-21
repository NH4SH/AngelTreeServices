// Exports a committed source snapshot into a new private temporary directory.
// No linking, Git initialization, credential reads, builds or deployments.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 128 * 1024 * 1024 });
const commit = git('rev-parse', 'HEAD').toString().trim();
const files = git('ls-tree', '-r', '--name-only', commit, 'apps/platform').toString().trim().split('\n');
assert.ok(files.length > 100);
assert.ok(files.every(p => !/(?:^|\/)\.netlify\//.test(p) && !/(?:^|\/)\.env(?:\.|$)/.test(p) && !/\.(?:pem|key|p12)$/.test(p)), 'Source export contains a forbidden credential/config file.');
const directory = mkdtempSync(join(tmpdir(), 'ats-staging-export-'));
const archive = git('archive', '--format=tar', commit, 'apps/platform');
execFileSync('tar', ['-xf', '-', '-C', directory], { input: archive });
const app = join(directory, 'apps/platform');
const config = `[build]\n  command = "node scripts/release/staging-preflight.mjs --manifest staging/targets.json && node staging/access/check.mjs && npm run build"\n  publish = ".next"\n[build.environment]\n  NODE_VERSION = "22.23.3"\n  NETLIFY_NEXT_SKEW_PROTECTION = "true"\n[functions]\n  directory = "staging/no-schedules"\n  node_bundler = "esbuild"\n[[plugins]]\n  package = "@netlify/plugin-nextjs"\n[[plugins]]\n  package = "./staging/access/netlify-plugin"\n`;
// Only the NEW export's configuration is replaced. Production source stays intact.
writeFileSync(join(app, 'netlify.toml'), config);
mkdirSync(join(app, 'staging/no-schedules'), { recursive: true });
writeFileSync(join(app, 'staging/no-schedules/README.md'), 'No scheduled functions in the initial staging export. Original worker sources remain in netlify/functions for review; they are not selected for bundling.\n');
writeFileSync(join(app, '.gitignore'), '.netlify/\n.env*\n.next/\nnode_modules/\n');
assert.ok(readFileSync(join(app, 'scripts/release/staging-preflight.mjs')).length > 0, 'Commit the reviewed preparation tools before exporting.');
assert.ok(readFileSync(join(app,'staging/access/edge/staging-access.js')).length>0,'Commit the staging gate before exporting.');
const result = { directory: app, sourceCommit: commit, sourceTree: git('rev-parse', commit + ':apps/platform').toString().trim(), sourceArchiveSha256: createHash('sha256').update(archive).digest('hex'), stagingConfigSha256: createHash('sha256').update(config).digest('hex'), scheduledFunctionsSelected: 0, stagingAccessGateSelected:true, hostedAccessProtectionVerified:false, credentialsCopied: false, linked: false, built: false, deployed: false };
writeFileSync(join(app, 'STAGING_EXPORT.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
