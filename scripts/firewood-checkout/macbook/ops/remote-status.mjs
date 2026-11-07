import {resolve} from 'node:path';
import {ROOT,OPS,guardRoot,jsonFile} from './files.mjs';
import {backupName} from './backup.mjs';
await guardRoot();
const settings=await jsonFile(resolve(OPS,'settings.json')),monitor=await jsonFile(resolve(OPS,'state/monitor.json')),latest=await jsonFile(resolve(OPS,'backups/latest.json'));
if(!settings?.testOnly||settings.root!==ROOT)throw new Error('private_ops_settings_required');
if(latest&&(!backupName.test(latest.name)||!/^[a-f0-9]{64}$/u.test(latest.sha256??'')))throw new Error('invalid_backup_manifest');
console.log(JSON.stringify({testOnly:true,active:!!settings.active,monitor,latest}));
