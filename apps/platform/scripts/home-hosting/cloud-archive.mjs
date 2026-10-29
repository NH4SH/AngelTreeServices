// Validate a bounded private-file tar as streams. Never writes archive paths.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {pipeline} from 'node:stream/promises';import tar from 'tar-stream';
import {cloudLimits} from './cloud-policy.mjs';
export async function verifyPrivateArchive(input,objects,{deadline=Date.now()+5000,maximumFiles=512}={}){
  assert.ok(Number.isSafeInteger(maximumFiles)&&maximumFiles>0&&maximumFiles<=4096);
  assert.ok(Array.isArray(objects)&&objects.length<=maximumFiles);const expected=new Map();let payload=0;
  const safe=name=>typeof name==='string'&&name.length>0&&name.length<1024&&!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').some(x=>['..',''].includes(x));
  for(const object of objects){assert.ok(safe(object.path)&&!expected.has(object.path));assert.match(object.sha256,/^[a-f0-9]{64}$/);
    if(object.eTag!==undefined)assert.match(object.eTag,/^"[a-f0-9]{32}"$/);
    assert.ok(Number.isSafeInteger(object.size)&&object.size>=0&&object.size<=cloudLimits.objectBytes);payload+=object.size;expected.set(object.path,object);}
  assert.ok(payload<=cloudLimits.restoredBytes);const seen=new Set(),extract=tar.extract({allowUnknownFormat:false});
  const timeout=setTimeout(()=>extract.destroy(Error('Archive deadline exceeded')),Math.max(1,deadline-Date.now()));
  const transport=pipeline(input,extract);transport.catch(()=>{});let entries=0;
  try{
    for await(const entry of extract){
      assert.ok(Date.now()<deadline&&++entries<=8192);const header=entry.header;
      assert.ok(['directory','file'].includes(header.type),'Links and special files are forbidden');
      const rootDirectory=header.type==='directory'&&['.','./'].includes(header.name);
      const name=rootDirectory?'.':header.name.replace(/^\.\//,'').replace(/\/$/,'');assert.ok(rootDirectory||safe(name),'Unsafe archive path');
      if(header.type==='directory'){assert.equal(header.size,0);entry.resume();continue;}
      const object=expected.get(name);assert.ok(object&&!seen.has(name),'Unexpected or duplicate archive file');assert.equal(header.size,object.size);seen.add(name);
      let size=0;const hash=createHash('sha256'),providerMd5=object.eTag===undefined?null:createHash('md5');for await(const chunk of entry){size+=chunk.length;assert.ok(size<=object.size);hash.update(chunk);providerMd5?.update(chunk);}
      assert.equal(size,object.size);assert.equal(hash.digest('hex'),object.sha256,'Private file digest mismatch');
      if(providerMd5)assert.equal('"'+providerMd5.digest('hex')+'"',object.eTag,'Committed file ETag differs from its bytes');
    }
    await transport;assert.equal(seen.size,expected.size,'Missing private archive file');return{files:seen.size,bytes:payload};
  }catch(error){input.destroy(error);extract.destroy(error);await transport.catch(()=>{});throw error;}
  finally{clearTimeout(timeout);}
}
