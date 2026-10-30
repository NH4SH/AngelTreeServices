// PostgreSQL 17, little-endian, 16 MiB segment rehearsal only. These checks
// validate identity, coverage and gzip integrity; they do not replace WAL replay.
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {backupSourceScope} from './backup-source-scope.mjs';
const segmentBytes=16*1024*1024;
export function walLsn(value){assert.match(value,/^[0-9A-F]{1,8}\/[0-9A-F]{1,8}$/);const [a,b]=value.split('/');return(BigInt('0x'+a)<<32n)+BigInt('0x'+b);}
export function walSegmentNumber(name,timeline){
 assert.match(name,/^[0-9A-F]{24}$/);assert.equal(Number.parseInt(name.slice(0,8),16),timeline);
 const low=BigInt('0x'+name.slice(16));assert.ok(low<256n);return BigInt('0x'+name.slice(8,16))*256n+low;
}
export function validateWalSegment(bytes,name,{timeline,systemIdentifier}){
 const number=walSegmentNumber(name,timeline),wal=gunzipSync(bytes,{maxOutputLength:segmentBytes});assert.equal(wal.length,segmentBytes);
 assert.equal(wal.readUInt16LE(0),0xD116);assert.equal(wal.readUInt16LE(2)&2,2);assert.equal(wal.readUInt16LE(2)&~15,0);assert.equal(wal.readUInt32LE(4),timeline);
 assert.equal(wal.readBigUInt64LE(8),number*BigInt(segmentBytes));assert.equal(wal.readBigUInt64LE(24).toString(),systemIdentifier);
 assert.equal(wal.readUInt32LE(32),segmentBytes);assert.equal(wal.readUInt32LE(36),8192);
 return number;
}
export function validateWalCoverage(names,baseRange,checkpoint){
 assert.ok(Number.isSafeInteger(checkpoint.timeline)&&checkpoint.timeline>0);assert.equal(baseRange.Timeline,checkpoint.timeline);
 assert.match(checkpoint.systemIdentifier,/^[0-9]{1,20}$/);
 const start=walLsn(baseRange['Start-LSN']),end=walLsn(baseRange['End-LSN']),target=walLsn(checkpoint.targetLsn);
 assert.ok(start<end&&end<=target);const first=(end-1n)/BigInt(segmentBytes),last=(target-1n)/BigInt(segmentBytes);
 assert.ok(last-first<=127n,'WAL chain exceeds reviewed rehearsal bound');
 assert.ok(Array.isArray(names)&&names.length>0&&names.length<=128);const numbers=new Set();
 for(const name of names){const n=walSegmentNumber(name,checkpoint.timeline).toString();assert.ok(!numbers.has(n),'Duplicate WAL segment');numbers.add(n);}
 for(let n=first;n<=last;n++)assert.ok(numbers.has(n.toString()),'Missing WAL dependency');
 assert.equal(walSegmentNumber(checkpoint.targetWalFile,checkpoint.timeline),last);
 return {segmentsRequired:Number(last-first+1n),targetLsn:checkpoint.targetLsn};
}
export function validateWalDelta(manifest,{expectedBinding}={}){
 assert.equal(manifest.version,1);assert.equal(manifest.format,manifest.binding?.privateFileFormat==='patch-v1'?'native-wal-file-delta-v1':'native-wal-independent-archive-v1');
 assert.equal(manifest.syntheticOnly,backupSourceScope(expectedBinding).syntheticOnly);assert.equal(manifest.writeAdmission,false);
 for(const name of ['previousManifestSha256','baseManifestSha256'])assert.match(manifest[name],/^[a-f0-9]{64}$/);
 assert.match(manifest.systemIdentifier,/^[0-9]{1,20}$/);assert.ok(Number.isSafeInteger(manifest.timeline)&&manifest.timeline>0);
 const previous=walLsn(manifest.previousTargetLsn),target=walLsn(manifest.targetLsn);assert.ok(previous>0n&&previous<target);
 const first=(previous-1n)/BigInt(segmentBytes)+1n,last=(target-1n)/BigInt(segmentBytes);
 assert.ok(last>=first&&last-first<=127n);assert.equal(walSegmentNumber(manifest.targetWalFile,manifest.timeline),last);
 assert.ok(Array.isArray(manifest.files)&&manifest.files.length===Number(last-first+1n));const seen=new Set();
 for(const file of manifest.files){const n=walSegmentNumber(file.name,manifest.timeline);assert.ok(n>=first&&n<=last&&!seen.has(file.name));seen.add(file.name);
  assert.ok(Number.isSafeInteger(file.size)&&file.size>0&&file.size<=segmentBytes+65536);assert.match(file.sha256,/^[a-f0-9]{64}$/);}
 return {segmentsRequired:Number(last-first+1n),targetLsn:manifest.targetLsn};
}
