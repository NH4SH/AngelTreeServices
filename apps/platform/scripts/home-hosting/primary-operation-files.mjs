// Small explicit recovery toolchain, excluding unrelated rehearsal producers.
// Resolve local imports and literal resource references; add reviewed dynamic
// SQL inputs explicitly. No credentials, data volumes or local logs are read.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
export function primaryOperationFiles(root,{cloudOnly=false}={}){
 const names=new Set(),queue=cloudOnly?['primary-backup-netlify.mjs','native-chain-retirement.mjs']:['primary-operation-files.mjs','primary-controller.mjs','primary-backup-loop.mjs','publish-primary-checkpoint.mjs','primary-write-fence.mjs','primary-backup-schema.mjs','primary-backup-netlify.mjs','primary-supervisor.mjs','native-file-recovery.mjs','replay-native-snapshot.mjs','managed-restore-data.mjs','native-chain-retirement.mjs'];
 if(!cloudOnly)queue.push('primary-install-schema.mjs','candidate-write-fence.sql','native-wal-ledger.sql','native-wal-verification-lease.sql','native-wal-inventory-prefix.sql','native-wal-file-patch.sql','native-chain-retention.sql','candidate-privilege-reconciliation.sql','candidate-managed-defaults.sql');
 queue.push('package.json','package-lock.json');
 while(queue.length){const name=queue.shift();if(names.has(name))continue;assert.match(name,/^[A-Za-z0-9_.-]+\.(mjs|sql|json)$/);assert.ok(!name.includes('.test.')&&!name.includes('private'));
  const full=path.join(root,name);assert.equal(fs.lstatSync(full).isSymbolicLink(),false);assert.ok(fs.statSync(full).isFile());names.add(name);
  if(name.endsWith('.mjs')){const source=fs.readFileSync(full,'utf8');for(const match of source.matchAll(/(?:from\s*|import\s*\(|new URL\s*\()\s*['"]\.\/([A-Za-z0-9_.-]+\.(?:mjs|json|sql))['"]/g))queue.push(match[1]);}
 }
 assert.ok(names.size<=90);return [...names].sort();
}
