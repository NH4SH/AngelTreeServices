import {resolve} from 'node:path';
import {guardRoot,OPS,jsonFile,atomicJson} from './files.mjs';
import {backupName} from './backup.mjs';
await guardRoot();const [name,sha256]=process.argv.slice(2);
if(!backupName.test(name??'')||!/^[a-f0-9]{64}$/u.test(sha256??''))throw new Error('invalid_backup_ack');
const item=await jsonFile(resolve(OPS,'backups',name+'.json'));
if(item?.name!==name||item.sha256!==sha256)throw new Error('backup_ack_mismatch');
await atomicJson(resolve(OPS,'backups/ack.json'),{name,sha256,acknowledgedAt:Date.now()});
console.log('{"acknowledged":true}');
