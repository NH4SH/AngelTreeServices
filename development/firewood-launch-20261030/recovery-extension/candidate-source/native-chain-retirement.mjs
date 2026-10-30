// Deletes only a ledger-retired immutable component. Cloud authority recomputes
// dependencies under the source lock; this client cannot reset or refund usage.
import assert from 'node:assert/strict';
import {planNativeChainRetention} from './native-chain-retention.mjs';
import {validateInventory} from './cloud-policy.mjs';
export async function retireNativeComponent({namespace,jobId,ledger,storage,now=Date.now()}){
 const snapshot=await ledger({action:'snapshot',namespace});
 const plan=planNativeChainRetention({...snapshot,now});assert.ok(plan.eligibleJobIds.includes(jobId),'Protected recovery component');
 const grant=await ledger({action:'prepare',namespace,jobId,snapshot});
 assert.equal(grant.namespace,namespace);assert.equal(grant.jobId,jobId);assert.equal(grant.bucket,'crm-native-lab-'+namespace.slice(-12));
 assert.equal(grant.prefix,jobId+'/');assert.equal(grant.retired,true);assert.equal(grant.writeAdmission,false);
 const expected=validateInventory(grant.inventory).rows,remaining=grant.remaining;
 assert.ok(Array.isArray(remaining)&&remaining.length<=expected.length);
 const seen=new Set();for(const row of remaining){assert.ok(!seen.has(row.name));seen.add(row.name);
  assert.deepEqual(row,expected.find(e=>e.name===row.name),'Provider versions changed');}
 if(!grant.completed){
  // A failed/ambiguous request leaves the retirement marker and original
  // inventory. Retrying asks the authority which exact objects still remain.
  for(let offset=0;offset<remaining.length;offset+=16){
   await storage.remove({bucket:grant.bucket,prefix:grant.prefix,objects:remaining.slice(offset,offset+16)});
  }
 }
 const current=await ledger({action:'snapshot',namespace});
 const finished=await ledger({action:'finish',namespace,jobId,snapshot:current});
 assert.equal(finished.completed,true);assert.equal(finished.historyPreserved,true);assert.equal(finished.writeAdmission,false);
 return {jobId,retired:true,deletedObjects:remaining.length,historyPreserved:true,writeAdmission:false};
}

// A batch shares its complete observed catalog. Fetching it again for every
// small WAL component would consume far more traffic than the payload itself.
export async function retireNativeBatch({namespace,ledger,storage,expectedBinding,limit=200,now=Date.now()}){
 assert.ok(Number.isSafeInteger(limit)&&limit>0&&limit<=200);
 const snapshot=await ledger({action:'snapshot',namespace}),plan=planNativeChainRetention({...snapshot,expectedBinding,now});
 const production=expectedBinding?.environment==='home-primary-v1',retired=[];let deletedObjects=0;
 assert.ok(Array.isArray(snapshot.retiredJobIds),'A batch requires durable completed-retirement identities');
 const completed=new Set(snapshot.retiredJobIds);assert.equal(completed.size,snapshot.retiredJobIds.length);
 for(const jobId of plan.eligibleJobIds.filter(id=>!completed.has(id)).slice(0,limit)){
  const grant=await ledger({action:'prepare',namespace,jobId,snapshot});
  assert.equal(grant.namespace,namespace);assert.equal(grant.jobId,jobId);assert.equal(grant.bucket,(production?'crm-native-home-':'crm-native-lab-')+namespace.slice(-12));assert.equal(grant.prefix,jobId+'/');assert.equal(grant.retired,true);assert.equal(grant.writeAdmission,false);
  const expected=validateInventory(grant.inventory).rows,remaining=grant.remaining;assert.ok(Array.isArray(remaining)&&remaining.length<=expected.length);
  const seen=new Set();for(const row of remaining){assert.ok(!seen.has(row.name));seen.add(row.name);assert.deepEqual(row,expected.find(e=>e.name===row.name));}
  if(!grant.completed)for(let offset=0;offset<remaining.length;offset+=16)await storage.remove({bucket:grant.bucket,prefix:grant.prefix,objects:remaining.slice(offset,offset+16)});
  // Head/pin changes interrupt the batch. Its durable marker lets the next
  // pass resume without repeating or broadening a delete.
  const result=await ledger({action:'finish',namespace,jobId,snapshot});assert.equal(result.completed,true);assert.equal(result.historyPreserved,true);assert.equal(result.writeAdmission,false);
  retired.push(jobId);deletedObjects+=remaining.length;
 }
 return {retiredJobs:retired,deletedObjects,eligibleAtStart:plan.eligibleJobIds.length,catalogReads:1,writeAdmission:false};
}
