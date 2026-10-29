import {test} from 'node:test';import assert from 'node:assert/strict';import {referencedObjectPaths} from './referenced-object-files.mjs';
const tenant='ats_candidate_'+'a'.repeat(12),row={bucketId:'platform-documents',name:'customer/árbol quote.pdf',version:'12345678-1234-1234-1234-123456789012',size:10,eTag:'"'+'a'.repeat(32)+'"'};
test('only committed version paths enter online file capture; staging names cannot traverse or inject tar options',()=>{
 assert.equal(referencedObjectPaths([row],tenant)[0].path,tenant+'/'+tenant+'/'+row.bucketId+'/'+row.name+'/'+row.version);
 for(const edit of [r=>r.name='../escape',r=>r.name='/absolute',r=>r.name='a//b',r=>r.name='a\nb',r=>r.name='a\\b',r=>r.bucketId='..',r=>r.version='bad',r=>r.eTag=null,r=>r.size=25*1024*1024+1]){
  const bad=structuredClone(row);edit(bad);assert.throws(()=>referencedObjectPaths([bad],tenant));
 }
 assert.throws(()=>referencedObjectPaths([row,row],tenant));assert.deepEqual(referencedObjectPaths([],tenant),[]);
});
