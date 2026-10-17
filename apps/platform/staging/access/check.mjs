// Invoked only by the isolated staging export's build command. No secrets output.
import {readFileSync} from 'node:fs';
import {hostedConfig} from './gate.mjs';
try {
  const manifest=JSON.parse(readFileSync(new URL('../targets.json',import.meta.url),'utf8'));
  hostedConfig(manifest,process.env,process.env.SITE_ID);
  console.log('Staging access-gate configuration is present; hosted protection is not verified by this check.');
} catch {console.error('Staging access-gate configuration is missing or invalid. No credentials are included in this error.');process.exitCode=1;}
