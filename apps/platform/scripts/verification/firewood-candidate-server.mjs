// Test harness for the actual CRM candidate handler. No other routes or workers.
import {createServer} from 'node:http';import {Readable} from 'node:stream';import{readFileSync,statSync}from'node:fs';import assert from'node:assert/strict';
import {getFirewoodCandidateDependencies}from'../../src/lib/firewood/candidate-config.ts';
import {handleFirewoodCandidateImport,FIREWOOD_IMPORT_PATH}from'../../src/lib/firewood/candidate-handler.ts';
const file=process.argv[2];assert.ok(file&&file.startsWith('/Users/noelsierra/Documents/Codex/2026-10-29/firewood-candidate/'));assert.equal(statSync(file).mode&0o077,0);
const {port,environment}=JSON.parse(readFileSync(file));assert.equal(port,3218);assert.equal(environment.FIREWOOD_CANDIDATE_SUPABASE_URL,'http://127.0.0.1:61421');assert.equal(environment.FIREWOOD_CANDIDATE_STRIPE_API_ORIGIN,undefined);
const deps=getFirewoodCandidateDependencies(environment);assert.ok(deps,'Dedicated sandbox-only dependencies required.');
const server=createServer(async(req,res)=>{try{if(req.method!=='POST'||req.url!==FIREWOOD_IMPORT_PATH){res.writeHead(404,{'Cache-Control':'no-store'});res.end();return;}
 const request=new Request('http://127.0.0.1:'+port+req.url,{method:'POST',headers:req.headers,body:Readable.toWeb(req),duplex:'half'});
 const response=await handleFirewoodCandidateImport(request,deps);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(503,{'Cache-Control':'no-store'});res.end('{"code":"response_unconfirmed","retryable":true,"payment_retry_required":false}');}});
server.requestTimeout=15000;server.headersTimeout=5000;server.maxHeadersCount=30;server.listen(port,'127.0.0.1',()=>console.log('Candidate handler ready on loopback port '+port+'; sandbox reads only. No workers or customer sends.'));
for(const signal of['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
