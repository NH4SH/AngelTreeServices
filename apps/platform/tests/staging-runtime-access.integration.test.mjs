import assert from 'node:assert/strict';import test from 'node:test';
import {readFileSync,readdirSync,existsSync,writeFileSync,mkdtempSync,realpathSync,openSync,closeSync}from'node:fs';
import {join}from'node:path';import {tmpdir}from'node:os';import{spawn}from'node:child_process';import{once}from'node:events';import{createServer}from'node:net';
import{createHash}from'node:crypto';
import{stagingFixture}from'./staging-fixture.mjs';import{edgeFixture,privateHeaders}from'./staging-edge-adapter-helper.mjs';
const enabled=process.env.STAGING_RUNTIME_DISPOSABLE==='1';
test('compiled staging app and actual perimeter entry: synthetic loopback acceptance only',{skip:!enabled,timeout:180000},async t=>{
 assert.match(process.version,/^v22\./);const app=realpathSync(process.env.STAGING_RUNTIME_EXPORTED_APP??'');
 assert.ok(app.startsWith(join(realpathSync(tmpdir()),'ats-staging-export-'))&&app.endsWith('/apps/platform'),'Use only a new isolated source export');
 assert.ok(!readdirSync(app).some(n=>n==='.netlify'||/^\.env(?:\.|$)/.test(n)),'No linked site or env files allowed');
 const fixture=stagingFixture();assert.deepEqual(JSON.parse(readFileSync(app+'/staging/targets.json')),fixture.manifest);
 const source=JSON.parse(readFileSync(app+'/STAGING_EXPORT.json'));assert.equal(source.credentialsCopied,false);assert.equal(source.linked,false);assert.equal(source.deployed,false);assert.equal(source.scheduledFunctionsSelected,0);assert.equal(source.stagingAccessGateSelected,true);
 assert.equal(createHash('sha256').update(readFileSync(app+'/netlify.toml')).digest('hex'),source.stagingConfigSha256);assert.deepEqual(readdirSync(app+'/staging/no-schedules'),['README.md']);
 assert.equal(source.sourceCommit,process.env.STAGING_RUNTIME_SOURCE_COMMIT);assert.ok(existsSync(app+'/.next/BUILD_ID'));
 assert.deepEqual(readFileSync(app+'/staging/access/edge/staging-access.js'),readFileSync(new URL('../staging/access/edge/staging-access.js',import.meta.url)));
 const out=mkdtempSync(join(tmpdir(),'ats-runtime-acceptance-')),guard=out+'/deny-outbound.cjs',network=out+'/network.private.log';
 writeFileSync(guard,`const fs=require('node:fs');const deny=()=>{fs.appendFileSync(process.env.ATS_NETWORK_ATTEMPTS,'blocked\\n',{mode:0o600});throw Error('Outbound disabled by synthetic local acceptance');};globalThis.fetch=deny;for(const m of ['node:http','node:https']){require(m).request=deny;require(m).get=deny;}const net=require('node:net');net.connect=deny;net.createConnection=deny;net.Socket.prototype.connect=deny;require('node:tls').connect=deny;`,{mode:0o600});
 const lease=createServer();await new Promise((ok,no)=>{lease.once('error',no);lease.listen(0,'127.0.0.1',ok);});const port=lease.address().port;await new Promise(ok=>lease.close(ok));assert.ok(port>1024);
 const base={PATH:process.env.PATH,HOME:process.env.HOME,NEXT_TELEMETRY_DISABLED:'1',NODE_OPTIONS:'--require='+guard,ATS_NETWORK_ATTEMPTS:network,...fixture.env};
 const args=['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)];
 function start(label,changes={}){const env=Object.fromEntries(Object.entries({...base,...changes}).filter(([,v])=>v!==undefined));const fd=openSync(out+'/'+label+'.private.log','w',0o600),p=spawn(process.execPath,args,{cwd:app,env,stdio:['ignore',fd,fd]});closeSync(fd);p.finished=once(p,'exit');return p;}
 async function stop(p){if(p.exitCode===null&&p.signalCode===null){p.kill('SIGTERM');try{await Promise.race([p.finished,new Promise((_,no)=>{const h=setTimeout(()=>no(Error('Owned test server did not stop')),15000);h.unref();})]);}catch(error){p.kill('SIGKILL');await p.finished;throw error;}}}
 const proof=[],run=(name,fn)=>t.test(name,async()=>{await fn();proof.push({name,pass:true});});
 const staticFiles=readdirSync(app+'/.next/static',{recursive:true}).filter(x=>!x.endsWith('/')&&existsSync(app+'/.next/static/'+x)&&/\.(?:js|css|json|map)$/.test(x));
 await run('compiled browser artifacts contain no synthetic server or scanner credential canaries',async()=>{for(const file of staticFiles){const b=readFileSync(app+'/.next/static/'+file);for(const value of [fixture.env.SUPABASE_SERVICE_ROLE_KEY,fixture.env.DOCUMENT_SCANNER_TOKEN])assert.ok(!b.includes(Buffer.from(value)),file);}assert.ok(staticFiles.length>50);});
 await run('compiled startup rejects production site/database, inherited provider key and missing staging marker',async()=>{
  for(const[label,changes]of [['wrong-site',{SITE_ID:'6fe7a9ca-878e-4b7b-bb4a-966efdc4d1a0'}],['wrong-api',{NEXT_PUBLIC_SUPABASE_URL:'https://ddvlnixdugcbnrewktes.supabase.co'}],['provider',{RESEND_API_KEY:'synthetic-never-sent'}],['marker',{APP_ENV:undefined}]]){const p=start(label,changes);try{const[code]=await Promise.race([p.finished,new Promise((_,no)=>{const h=setTimeout(()=>no(Error('Unsafe profile remained running')),20000);h.unref();})]);assert.notEqual(code,0);assert.match(readFileSync(out+'/'+label+'.private.log','utf8'),/Staging isolation checks failed/);}finally{await stop(p);}}
 });
 const server=start('valid');let calls=0;
 try{
  let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)break;try{const r=await fetch('http://127.0.0.1:'+port+'/api/health/live',{redirect:'manual',signal:AbortSignal.timeout(1500)});await r.arrayBuffer();if(r.status===200){ready=true;break;}}catch{}await new Promise(ok=>setTimeout(ok,100));}assert.ok(ready,'Isolated app did not start');
  const f=await edgeFixture(),{cookie}=await f.login();
  const next=async request=>{calls++;const u=new URL(request.url);assert.equal(u.origin,fixture.env.APP_BASE_URL);assert.ok(['GET','HEAD'].includes(request.method)||u.pathname.startsWith('/api/internal/')||u.pathname==='/api/leads');assert.ok(!(request.headers.get('cookie')??'').includes('__Host-ats-stage-access'));
   return fetch('http://127.0.0.1:'+port+u.pathname+u.search,{method:request.method,headers:request.headers,body:request.body?await request.arrayBuffer():undefined,redirect:'manual',signal:AbortSignal.timeout(10000)});};
  const through=(path,options={},authorized=true)=>f.invoke(f.request(path,{...options,headers:{...(authorized?{cookie}:{}),...options.headers}}),next);
  await run('gate access admits compiled login/health while CRM routes still require their own login',async()=>{
   for(const path of ['/api/health/live','/login']){const r=await through(path);assert.equal(r.status,200);privateHeaders(r);if(path==='/login'){const csp=r.headers.get('content-security-policy');assert.ok(csp.includes(fixture.env.NEXT_PUBLIC_SUPABASE_URL));assert.doesNotMatch(csp,/\*\.supabase\.co|stripe\.com|googleapis\.com/);}await r.arrayBuffer();}
   for(const path of ['/admin','/admin/communications/delivery-review']){const r=await through(path);assert.equal(r.status,307);privateHeaders(r);const to=new URL(r.headers.get('location'),fixture.env.APP_BASE_URL);assert.equal(to.origin,fixture.env.APP_BASE_URL);assert.equal(to.pathname,'/login');await r.arrayBuffer();}
  });
  await run('anonymous canonical/framework/function/worker routes never reach the compiled app, even after an authorized request',async()=>{
   const before=calls;for(const path of ['/','/admin','/crew','/portal/invoice/synthetic','/api/health/live','/api/internal/communications/process','/.netlify/functions/___netlify-server-handler','/.netlify/edge-functions/next_middleware','/_next/data/synthetic/admin.json','/_next/image?url=%2Ficon.png','/favicon.ico'])for(const method of ['GET','HEAD','OPTIONS']){const r=await through(path,{method,headers:{'x-deployment-id':'synthetic-old'}},false);assert.equal(r.status,401);privateHeaders(r);await r.arrayBuffer();}assert.equal(calls,before);
  });
  await run('real compiled static asset is private behind the gate and its bytes survive forwarding',async()=>{const file=staticFiles.find(p=>p.endsWith('.js'));assert.ok(file);const r=await through('/_next/static/'+file);assert.equal(r.status,200);privateHeaders(r);assert.deepEqual(Buffer.from(await r.arrayBuffer()),readFileSync(app+'/.next/static/'+file));const before=calls,denied=await through('/_next/static/'+file,{},false);assert.equal(denied.status,401);assert.equal(calls,before);});
  await run('all five compiled workers remain unauthorized and production-origin lead intake stays denied',async()=>{
   for(const path of ['/api/internal/communications/process','/api/internal/notifications/process','/api/internal/jobs/advance-scheduled','/api/internal/integrations/google-calendar/process','/api/internal/system-health/run']){const r=await through(path,{method:'POST'});assert.equal(r.status,401,path);privateHeaders(r);await r.arrayBuffer();}
   // Direct isolated app probe preserves the existing CORS boundary; the outer
   // gate's OPTIONS behavior alone is not proof of the application's own check.
   const r=await fetch('http://127.0.0.1:'+port+'/api/leads',{method:'OPTIONS',headers:{origin:'https://angeltreeservices.org'},redirect:'manual'});assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);await r.arrayBuffer();
  });
  await run('wrong aliases and bypass headers cannot forward even an authorized perimeter session',async()=>{const before=calls;for(const url of ['https://alias.example.invalid/admin','https://old--stage.example.invalid/admin']){const r=await f.invoke(new Request(url,{headers:{cookie}}),next);assert.equal(r.status,421);privateHeaders(r);}const r=await through('/admin',{headers:{'x-middleware-subrequest':'middleware:middleware'}});assert.equal(r.status,421);assert.equal(calls,before);});
  await run('ending perimeter access clears its cookie and subsequent anonymous CRM navigation is denied',async()=>{const before=calls,r=await through('/__staging-gate/logout',{method:'POST',headers:{origin:fixture.env.APP_BASE_URL}});assert.equal(r.status,303);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);privateHeaders(r);assert.equal((await through('/admin',{},false)).status,401);assert.equal(calls,before);});
 }finally{await stop(server);}
 assert.ok(!existsSync(network)||readFileSync(network,'utf8')==='','Child app attempted outbound contact');assert.equal(proof.length,8);
 const result={sourceCommit:source.sourceCommit,syntheticOnly:true,scenarios:proof,publicBuildFilesScanned:staticFiles.length,outboundAttempts:0,testServerStopped:true,platformEnvAndContext:'synthetic Web API bindings; not Netlify Deno execution',hostedRuntimeVerified:false,cdnVerified:false,hostedKeyValuesVerified:false,hostedWrites:0,deployed:false,readyForHosting:false,privateDiagnostics:out};
 if(process.env.STAGING_RUNTIME_RESULTS_FILE)writeFileSync(process.env.STAGING_RUNTIME_RESULTS_FILE,JSON.stringify(result,null,2)+'\n',{mode:0o600});
});
