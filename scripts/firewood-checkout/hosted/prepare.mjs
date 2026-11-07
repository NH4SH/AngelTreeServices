import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Assemble a standalone service; never copy the public site, CRM, .env, orders,
// provider credentials, or the parent repository's Netlify configuration.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const target = resolve(process.argv[2] ?? '');
if (!process.argv[2] || target === root || target.startsWith(root + '/')) throw new Error('Choose a new isolated directory outside the repository.');
await mkdir(target); // Fail if it exists: cannot overwrite someone else's checkout.
const dest = resolve(target, 'scripts/firewood-checkout');
await mkdir(dest, { recursive: true });
for (const file of ['store-core.mjs','confirmations.mjs','email-worker.mjs','model.mjs','crm.mjs']) await cp(resolve(here,'..',file),resolve(dest,file));
await cp(here, resolve(dest,'hosted'), { recursive: true, filter: path => !path.endsWith('/prepare.mjs') });
await cp(resolve(root,'public-firewood.json'),resolve(target,'public-firewood.json'));
await cp(resolve(here,'netlify.toml'),resolve(target,'netlify.toml'));
await cp(resolve(here,'../migrations'),resolve(target,'database/migrations'), { recursive: true });
const source = JSON.parse(await readFile(resolve(here,'../package.json'),'utf8'));
const dependencies = Object.fromEntries(['pg','stripe'].map(name => [name, source.dependencies[name]]));
const lock = JSON.parse(await readFile(resolve(here,'runtime-package-lock.json'),'utf8'));
if (JSON.stringify(lock.packages[''].dependencies) !== JSON.stringify(dependencies)) throw new Error('Update the pinned hosted-service lockfile before preparing this candidate.');
await writeFile(resolve(target,'package.json'),JSON.stringify({ name: 'angel-firewood-hosted-test', private: true, type: 'module', dependencies },null,2)+'\n');
await cp(resolve(here,'runtime-package-lock.json'),resolve(target,'package-lock.json'));
await writeFile(resolve(target,'.gitignore'),'.netlify\nnode_modules\n.env*\n');
console.log('Prepared isolated Firewood test service. The public website and CRM are excluded.');
