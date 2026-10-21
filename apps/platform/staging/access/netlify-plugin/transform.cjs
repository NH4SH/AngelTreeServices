const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

// Next's generated middleware precedes user Edge declarations. Insert our
// existing gate first in the generated framework chain, after the Next adapter
// has finished and before Netlify bundles Edge functions. No generated handler
// or authorization implementation is replaced.
function installFirstGate(directory, env) {
  const target = JSON.parse(readFileSync(join(directory, 'staging/targets.json'), 'utf8')).staging;
  if (env.APP_ENV !== 'staging' || env.STAGING_MODE !== 'core-no-providers' ||
      env.SITE_ID !== target.netlifySiteId || env.APP_BASE_URL !== target.appOrigin ||
      target.netlifySiteId !== 'd81d923d-6ccf-4c1e-87cc-263f3d51555d') {
    throw Error('Staging access ordering requires the assigned staging target.');
  }
  const file = join(directory, '.netlify/edge-functions/manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.functions) || !manifest.functions.length ||
      manifest.functions.some(f => f.function !== '___netlify-edge-handler-node-middleware' ||
        !f.generator?.startsWith('@netlify/plugin-nextjs@'))) {
    throw Error('Review the changed Next adapter Edge manifest before staging deployment.');
  }
  const entry = join(directory, '.netlify/edge-functions/ats-staging-access-first.js');
  if (existsSync(entry)) throw Error('Unexpected existing staging access entry.');
  writeFileSync(entry, "export {default} from '../../staging/access/edge/staging-access.js';\nexport const config={onError:'fail'};\n");
  manifest.functions.unshift({ function: 'ats-staging-access-first', name: 'Staging access before CRM middleware',
    pattern: '^/.*$', generator: 'ats-staging-access-order@1.0.0' });
  writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

module.exports = { installFirstGate };
