import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {readRecoveryFile} from './recovery-files.mjs';
test('restored recovery files cannot follow links, traverse paths or exceed their bound',t=>{
 const parent=mkdtempSync(join(tmpdir(),'ats-recovery-files-'));t.after(()=>rmSync(parent,{recursive:true,force:true}));const root=join(parent,'restored');mkdirSync(root);mkdirSync(join(root,'base'));
 writeFileSync(join(root,'base/archive'),'synthetic');writeFileSync(join(parent,'outside'),'private synthetic fixture');
 assert.equal(readRecoveryFile(root,'base/archive').toString(),'synthetic');assert.throws(()=>readRecoveryFile(root,'base/archive',2));
 for(const name of ['../outside','/outside','base/../archive','base\\archive'])assert.throws(()=>readRecoveryFile(root,name));
 symlinkSync(join(parent,'outside'),join(root,'link'));assert.throws(()=>readRecoveryFile(root,'link'),/links/);
 symlinkSync(parent,join(root,'linked-directory'));assert.throws(()=>readRecoveryFile(root,'linked-directory/outside'),/links/);
});
