import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{fileURLToPath}from'node:url';import{primaryOperationFiles}from'./primary-operation-files.mjs';
test('primary recovery and cloud verification include their real dependency closure without private artifacts',()=>{
 const root=fileURLToPath(new URL('.',import.meta.url)),all=primaryOperationFiles(root),cloud=primaryOperationFiles(root,{cloudOnly:true});
 for(const name of ['primary-controller.mjs','publish-primary-checkpoint.mjs','native-online-candidate.mjs','native-file-patch.mjs','native-chain-retention.sql','package-lock.json'])assert.ok(all.includes(name));
 for(const name of ['primary-backup-netlify.mjs','backup-source-scope.mjs','native-component-verifier.mjs','wal-recovery-inspection.mjs','runtime-blueprint.mjs'])assert.ok(cloud.includes(name));
 assert.ok(!cloud.includes('primary-io.mjs'));assert.ok(!all.some(name=>name.includes('.test.')||name.includes('private')));
 assert.ok(all.reduce((n,name)=>n+fs.statSync(root+name).size,0)<400000);
});
