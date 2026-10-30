import {test} from 'node:test';import assert from 'node:assert/strict';import {validateObjectAttributes} from './object-file-metadata.mjs';
test('file recovery binds only bounded canonical Storage attributes and keeps missing attributes distinct',()=>{
 assert.equal(validateObjectAttributes([{path:'file',xattrs:{'user.supabase.content-type':Buffer.from('text/plain').toString('base64')}},{path:'without-attributes',xattrs:{}}]),true);
 for(const rows of [[{}],[{xattrs:[]}],[{xattrs:{'security.evil':'YQ=='}}],[{xattrs:{'user.supabase.etag':'not-base64'}}],[{xattrs:{'user.supabase.etag':Buffer.alloc(16385).toString('base64')}}],Array.from({length:9},()=>({xattrs:{'user.supabase.etag':Buffer.alloc(16384).toString('base64')}}))])assert.throws(()=>validateObjectAttributes(rows));
});
