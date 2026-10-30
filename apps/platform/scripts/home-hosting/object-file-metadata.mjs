// File-backend metadata is kept in Linux extended attributes, outside SQL and
// ordinary tar file bytes. Bind it to the file inventory, then restore it before
// any Storage service can serve the recovered volume.
import assert from 'node:assert/strict';
export const storageAttributeNames=Object.freeze(['user.supabase.cache-control','user.supabase.content-encoding','user.supabase.content-type','user.supabase.etag']);
export function validateObjectAttributes(rows){
 assert.ok(Array.isArray(rows)&&rows.length<=512);let total=0;
 for(const row of rows){assert.ok(row.xattrs&&typeof row.xattrs==='object'&&!Array.isArray(row.xattrs));
  assert.ok(Object.keys(row.xattrs).length<=storageAttributeNames.length);
  for(const [name,value] of Object.entries(row.xattrs)){assert.ok(storageAttributeNames.includes(name));assert.equal(typeof value,'string');
   const bytes=Buffer.from(value,'base64');assert.equal(bytes.toString('base64'),value);assert.ok(bytes.length<=16384);total+=bytes.length;}
 }
 assert.ok(total<=131072);return true;
}
export const storageMetadataImage='ats-crm-storage:node24.22.1-v1';
