// Capture serialization is separate from write admission. Never break a legacy,
// stale or foreign lock automatically; a fenced operator must review it.
import assert from 'node:assert/strict';import fs from 'node:fs';import {randomBytes} from 'node:crypto';
export function acquireCaptureLock(folder,{sequence,sourceBoot}){
 assert.ok(Number.isSafeInteger(sequence)&&sequence>0);assert.equal(fs.statSync(folder).mode&0o077,0);
 const file=folder+'/capture.lock',body=JSON.stringify({version:1,sequence,sourceBoot,pid:process.pid,attempt:randomBytes(12).toString('hex'),at:new Date().toISOString()});
 fs.writeFileSync(file,body,{mode:0o600,flag:'wx'});
 return {file,release(){assert.equal(fs.readFileSync(file,'utf8'),body,'Capture lock ownership changed; operator review required');fs.unlinkSync(file);}};
}
export async function cleanupCapture({barrier,restoreHba,release,utilityCleanupConfirmed=true}){
 const errors=[];
 try{if(barrier)await barrier.abort();}catch(e){errors.push(e);}
 try{if(restoreHba)restoreHba();}catch(e){errors.push(e);}
 if(!utilityCleanupConfirmed)errors.push(new Error('Archive utility cleanup remains unconfirmed'));
 // A failed rollback/HBA cleanup retains the lock and the independent deadline.
 if(errors.length)throw new AggregateError(errors,'Capture cleanup incomplete; retain lock and withhold admission');
 release();
}
