import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {classifyScannerReadiness,checkPrivateScanner} from './scanner-readiness.ts';
const now=Date.parse('2026-10-21T00:00:00Z');
const valid={status:200,certificateExpiresAt:new Date(now+60*86400000).toUTCString(),payload:{status:'clean',engine:'clamav',sha256:createHash('sha256').update('Angel Tree synthetic production scanner readiness check.').digest('hex'),signatureAgeSeconds:3600}};
test('scanner monitoring warns before definitions fail closed and before TLS expiry',()=>{
 for(const[age,days,status]of[[1,60,'operational'],[24,60,'degraded'],[36,60,'outage'],[49,60,'outage'],[1,20,'degraded'],[1,6,'outage'],[1,0,'outage']]){
  const reply=structuredClone(valid);reply.payload.signatureAgeSeconds=age*3600;reply.certificateExpiresAt=new Date(now+days*86400000).toUTCString();assert.equal(classifyScannerReadiness(reply,now).status,status);
 }
});
test('a successful HTTP response alone cannot mark a scanner healthy',()=>{
 for(const change of[{sha256:'wrong'},{engine:'fake'},{status:'quarantined'},{signatureAgeSeconds:undefined},{signatureAgeSeconds:-1},{signatureAgeSeconds:'3600'}])assert.equal(classifyScannerReadiness({...valid,payload:{...valid.payload,...change}},now).status,'outage');
 for(const status of[302,401,413,503])assert.equal(classifyScannerReadiness({...valid,status},now).status,'outage');
});
test('invalid scanner configuration sends no credential and errors expose no endpoint or private value',async()=>{
 for(const url of['http://example.invalid/scan','https://user@example.invalid/scan','https://example.invalid/scan?key=x','https://example.invalid/other'])assert.equal((await checkPrivateScanner({DOCUMENT_SCANNER_URL:url,DOCUMENT_SCANNER_TOKEN:'a'.repeat(48)},()=>assert.fail('No network permitted'))).status,'outage');
 const r=await checkPrivateScanner({DOCUMENT_SCANNER_URL:'https://scanner.example.invalid/scan',DOCUMENT_SCANNER_TOKEN:'a'.repeat(48)},async()=>{throw Error('private endpoint and '+ 'a'.repeat(48));});assert.equal(r.status,'outage');assert.ok(!JSON.stringify(r).includes('a'.repeat(48)));assert.ok(!JSON.stringify(r).includes('example.invalid'));
});

test('certificate monitoring stays healthy after connections close between runs',async()=>{
 const{mkdtempSync,readFileSync,rmSync}=await import('node:fs');const{tmpdir}=await import('node:os');const{join}=await import('node:path');const{createServer}=await import('node:https');const{execFileSync,spawn}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'ats-scanner-tls-test-'));let server;
 try{
  execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-nodes','-days','365','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem')],{stdio:'ignore'});
  server=createServer({key:readFileSync(join(dir,'key.pem')),cert:readFileSync(join(dir,'cert.pem'))},(req,res)=>{const parts=[];req.on('data',c=>parts.push(c));req.on('end',()=>{res.writeHead(200,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify({status:'clean',engine:'clamav',sha256:createHash('sha256').update(Buffer.concat(parts)).digest('hex'),signatureAgeSeconds:3600}));});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const source=`import assert from'node:assert/strict';import{globalAgent}from'node:https';import{checkPrivateScanner}from${JSON.stringify(new URL('./scanner-readiness.ts',import.meta.url).href)};const env={DOCUMENT_SCANNER_URL:'https://127.0.0.1:${server.address().port}/scan',DOCUMENT_SCANNER_TOKEN:'synthetic-readiness-test-00000000000000000'};for(let i=0;i<3;i++){assert.equal((await checkPrivateScanner(env)).status,'operational');globalAgent.destroy();}`;
  const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',source],{env:{...process.env,NODE_EXTRA_CA_CERTS:join(dir,'cert.pem')},stdio:'ignore'});child.on('error',reject);child.on('exit',resolve);});assert.equal(code,0,'Repeated trusted TLS checks must survive closed connections.');
 }finally{if(server)await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
