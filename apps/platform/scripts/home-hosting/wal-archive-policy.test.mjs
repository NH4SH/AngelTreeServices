import {test} from 'node:test';import assert from 'node:assert/strict';import {gzipSync} from 'node:zlib';
import {walLsn,validateWalCoverage,validateWalSegment,validateWalDelta} from './wal-archive-policy.mjs';
const name=n=>'0000000100000000'+n.toString(16).toUpperCase().padStart(8,'0');
const checkpoint={timeline:1,systemIdentifier:'7701364729366052896',targetLsn:'0/E01BC10',targetWalFile:name(14)};
const range={Timeline:1,'Start-LSN':'0/C000028','End-LSN':'0/C000120'};
test('WAL coverage binds the exact timeline and every required segment including boundary cutoffs',()=>{
 assert.deepEqual(validateWalCoverage([name(12),name(13),name(14)],range,checkpoint),{segmentsRequired:3,targetLsn:'0/E01BC10'});
 assert.throws(()=>validateWalCoverage([name(12),name(14)],range,checkpoint),/Missing WAL/);
 assert.throws(()=>validateWalCoverage([name(12),name(13),name(14),name(14)],range,checkpoint),/Duplicate/);
 assert.throws(()=>validateWalCoverage([name(12),name(13),'00000002000000000000000E'],range,checkpoint));
 assert.throws(()=>validateWalCoverage([name(12),name(13),name(14)],range,{...checkpoint,targetWalFile:name(15)}));
 assert.equal(validateWalCoverage([name(12),name(13)],range,{...checkpoint,targetLsn:'0/E000000',targetWalFile:name(13)}).segmentsRequired,2);
 assert.throws(()=>walLsn('0/INVALID'));assert.equal(walLsn('1/0'),4294967296n);
});
test('independent WAL archives cannot omit a segment, skip their parent or claim writer admission',()=>{
 const m={...checkpoint,version:1,format:'native-wal-independent-archive-v1',syntheticOnly:true,writeAdmission:false,
  previousManifestSha256:'a'.repeat(64),baseManifestSha256:'b'.repeat(64),previousTargetLsn:'0/C000120',files:[13,14].map(n=>({name:name(n),size:4096,sha256:'c'.repeat(64)}))};
 assert.equal(validateWalDelta(m).segmentsRequired,2);
 for(const edit of [b=>b.files.pop(),b=>b.files[1]=b.files[0],b=>b.writeAdmission=true,b=>b.previousTargetLsn=b.targetLsn,
  b=>b.files[0].name='../../escape',b=>b.baseManifestSha256='bad',b=>b.files[0].size=0]){const bad=structuredClone(m);edit(bad);assert.throws(()=>validateWalDelta(bad));}
});
test('WAL compressed bytes must retain the native system, address, version and segment dimensions',()=>{
 const bytes=Buffer.alloc(16*1024*1024);bytes.writeUInt16LE(0xD116,0);bytes.writeUInt16LE(2,2);bytes.writeUInt32LE(1,4);
 bytes.writeBigUInt64LE(14n*16777216n,8);bytes.writeBigUInt64LE(BigInt(checkpoint.systemIdentifier),24);bytes.writeUInt32LE(16777216,32);bytes.writeUInt32LE(8192,36);
 assert.equal(validateWalSegment(gzipSync(bytes),name(14),checkpoint),14n);
 for(const offset of [0,2,4,8,24,32,36]){const bad=Buffer.from(bytes);bad[offset]^=offset===2?2:1;assert.throws(()=>validateWalSegment(gzipSync(bad),name(14),checkpoint));}
 const compressed=gzipSync(bytes);assert.throws(()=>validateWalSegment(compressed.subarray(0,-4),name(14),checkpoint));
 assert.throws(()=>validateWalSegment(gzipSync(Buffer.concat([bytes,Buffer.from('overflow')])),name(14),checkpoint));
});
