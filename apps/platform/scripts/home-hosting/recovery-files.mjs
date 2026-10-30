import assert from 'node:assert/strict';import {lstatSync,readFileSync} from 'node:fs';import {join} from 'node:path';
// Never follow a restored link into the verifier's own files or credentials.
export function readRecoveryFile(root,name,maximumBytes=192*1024*1024){
 assert.equal(typeof name,'string');const parts=name.split('/');assert.ok(parts.length>0&&parts.every(p=>p&&p!=='.'&&p!=='..'&&!p.includes('\\')));
 let path=root;assert.ok(lstatSync(path).isDirectory()&&!lstatSync(path).isSymbolicLink());
 for(let i=0;i<parts.length;i++){path=join(path,parts[i]);const stat=lstatSync(path);assert.ok(!stat.isSymbolicLink(),'Restored links are forbidden');
  if(i<parts.length-1)assert.ok(stat.isDirectory());else assert.ok(stat.isFile()&&stat.size<=maximumBytes,'Restored file exceeds its bound');}
 return readFileSync(path);
}
