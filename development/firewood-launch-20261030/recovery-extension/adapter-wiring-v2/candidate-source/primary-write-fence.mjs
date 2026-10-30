import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
// New local installation only. Never run on the managed source or a live table
// set with an existing guard. Core trigger/commit checks are kept byte-for-byte.
export function primaryWriteFenceSql(){
 const original=fs.readFileSync(new URL('./candidate-write-fence.sql',import.meta.url),'utf8');
 assert.equal(original.split("default 'synthetic-home'").length,2);
 const sql=original.replace("default 'synthetic-home'","default 'ats-home-primary'").replaceAll('accept_rehearsal_lease','accept_backup_lease');
 return {sql,sourceSha256:createHash('sha256').update(original).digest('hex'),sha256:createHash('sha256').update(sql).digest('hex'),installationPerformed:false};
}
