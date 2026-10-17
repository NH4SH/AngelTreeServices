import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { checkStaging } from '../../src/lib/security/staging-policy.mjs';
export { checkStaging, production } from '../../src/lib/security/staging-policy.mjs';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const flag = process.argv.indexOf('--manifest');
    if (flag < 0 || !process.argv[flag + 1]) throw Error('missing manifest');
    const report = checkStaging(JSON.parse(readFileSync(process.argv[flag + 1], 'utf8')), process.env);
    console.log(JSON.stringify(report, null, 2)); if (!report.ready) process.exitCode = 1;
  } catch { console.error('Staging preflight could not read the reviewed manifest. No operation was performed.'); process.exitCode = 1; }
}
