// Evaluation only. Executed in the existing private Node image on an owned,
// internal-only test network. Synthetic fixtures arrive on stdin; no DB keys.
import {getClamAVState,scanWithClamAV} from './bridge.mjs';
const connection={host:process.env.EVALUATION_ENGINE,port:3310};
const results=[];
try {
  if(process.argv.at(-1)==='state') {
    console.log(JSON.stringify({ready:true,state:await getClamAVState(connection)}));
  } else {
    const chunks=[];let size=0;
    for await(const chunk of process.stdin){size+=chunk.length;if(size>256*1024)throw Error('fixture');chunks.push(chunk);}
    const fixtures=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const run=async(name,bytes,expected)=>{const start=performance.now(),status=await scanWithClamAV(bytes,connection);
      results.push({name,expected,status,passed:status===expected,milliseconds:Math.round(performance.now()-start)});};
    await run('clean',Buffer.from('ATS synthetic Netlify evaluation; no customer data.'),'clean');
    await run('eicar',Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}','$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('')),'quarantined');
    await run('25-MiB',Buffer.alloc(25*1024*1024,65),'clean');
    await run('encrypted-archive',Buffer.from(fixtures.encrypted,'base64'),'quarantined');
    await run('110-MiB-expanded-archive',Buffer.from(fixtures.expanded,'base64'),'quarantined');
    const start=performance.now();
    const pair=await Promise.all([scanWithClamAV(Buffer.alloc(25*1024*1024,66),connection),scanWithClamAV(Buffer.alloc(25*1024*1024,67),connection)]);
    results.push({name:'two-25-MiB',status:pair,passed:pair.every(x=>x==='clean'),milliseconds:Math.round(performance.now()-start)});
    console.log(JSON.stringify({ready:true,results,clientMaxRssKiB:process.resourceUsage().maxRSS}));
  }
}catch(error){console.log(JSON.stringify({ready:false,verdict:'unavailable',completedResults:results,
  errorCode:['scanner_timeout','scanner_signatures_stale','scan_not_confirmed','incomplete_scanner_reply','fixture'].includes(error.message)?error.message:(error.code??'scan_unavailable')}));}
