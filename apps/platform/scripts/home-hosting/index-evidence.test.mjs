import {test} from 'node:test';import assert from 'node:assert/strict';
import {inspectIndexEvidence,validateIndexEvidence} from './index-evidence.mjs';
const pack='a'.repeat(64),next='b'.repeat(64),third='c'.repeat(64),index='index/'+'d'.repeat(64),index2='index/'+'e'.repeat(64),index3='index/'+'f'.repeat(64);
const old={name:index,decoded:{packs:[{id:pack,blobs:[{id:'1'.repeat(64),type:'data',offset:0,length:100}]}]}},added={name:index2,decoded:{packs:[{id:next,blobs:[{id:'2'.repeat(64),type:'tree',offset:0,length:100}]}]}};
const base=[{name:index},{name:'data/aa/'+pack,size:120}],current=[...base,{name:index2},{name:'data/bb/'+next,size:120}];
test('native-decoded evidence bootstraps and survives a cold append without decoding old indexes',()=>{
 const first=inspectIndexEvidence([old,added],base,current);assert.equal(first.novel.length,1);validateIndexEvidence(first.evidence,current);
 const more={name:index3,decoded:{packs:[{id:third,blobs:[{id:'3'.repeat(64),type:'data',offset:0,length:100}]}]}},all=[...current,{name:index3},{name:'data/cc/'+third,size:120}];
 const a=inspectIndexEvidence([more],current,all,first.evidence),b=inspectIndexEvidence([old,added,more],current,all);assert.deepEqual(a,b);
});
test('cached evidence cannot hide foreign indexes, changed old locations, repacks or missing packs',()=>{
 const evidence=inspectIndexEvidence([old],[],base).evidence;
 for(const mutate of [i=>i.decoded.packs[0].id=pack,i=>Object.assign(i.decoded.packs[0].blobs[0],{id:'1'.repeat(64),type:'data'}),i=>i.decoded.supersedes=[index]]){const bad=structuredClone(added);mutate(bad);assert.throws(()=>inspectIndexEvidence([bad],base,current,evidence));}
 assert.throws(()=>inspectIndexEvidence([],base,current,evidence));assert.throws(()=>inspectIndexEvidence([added],base,[...current,{name:'data/cc/'+third,size:120}],evidence));
 for(const change of [{indexNamesSha256:'0'.repeat(64)},{packs:[]},{locations:'bad'}])assert.throws(()=>validateIndexEvidence({...evidence,...change},base));
});
