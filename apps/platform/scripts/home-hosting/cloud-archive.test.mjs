import {test} from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';import tar from 'tar-stream';
import {verifyPrivateArchive} from './cloud-archive.mjs';import {sha256} from './cloud-policy.mjs';
async function archive(entries){const pack=tar.pack();for(const [header,bytes]of entries)pack.entry(header,bytes);pack.finalize();const chunks=[];for await(const b of pack)chunks.push(b);return Buffer.concat(chunks);}
const input=b=>Readable.from([b]),file={path:'bucket/長い名前/'+'a'.repeat(180),size:5,sha256:sha256('hello')};
test('validates long and Unicode tar names without extracting files',async()=>{const bytes=await archive([[{name:'./',type:'directory'},null],[{name:'./'+file.path},'hello']]);assert.deepEqual(await verifyPrivateArchive(input(bytes),[file]),{files:1,bytes:5});});
test('rejects absolute paths, traversal, links, duplicate and unexpected files',async()=>{for(const entries of [
 [[{name:'/outside'},'hello']],[[{name:'../outside'},'hello']],[[{name:file.path,type:'symlink',linkname:'/tmp/outside'},null]],
 [[{name:file.path},'hello'],[{name:file.path},'hello']],[[{name:'unlisted'},'hello']]
 ])await assert.rejects(verifyPrivateArchive(input(await archive(entries)),[file]));});
test('rejects changed, missing and truncated private file payloads',async()=>{
 const bytes=await archive([[{name:file.path},'hello']]);await assert.rejects(verifyPrivateArchive(input(bytes),[{...file,sha256:sha256('other')}]));
 await assert.rejects(verifyPrivateArchive(input(await archive([])),[file]));await assert.rejects(verifyPrivateArchive(input(bytes.subarray(0,700)),[file]));
});
test('native base inventory has an explicit bounded opt-in without broadening private-file defaults',async()=>{
 const rows=Array.from({length:513},(_,i)=>({path:'base/'+i,size:0,sha256:sha256('')}));
 const bytes=await archive(rows.map(o=>[{name:o.path},'']));
 await assert.rejects(verifyPrivateArchive(input(bytes),rows));
 assert.deepEqual(await verifyPrivateArchive(input(bytes),rows,{maximumFiles:4096}),{files:513,bytes:0});
 await assert.rejects(verifyPrivateArchive(input(bytes),rows,{maximumFiles:4097}));
});
