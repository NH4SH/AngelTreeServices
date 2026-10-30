// Destructive deadline rehearsal is confined to the newly created quarantine clone.
// It never grants a production backup lease or starts an application/provider worker.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes,createCipheriv} from 'node:crypto';
import {digest} from './firewood-recovery-capture.mjs';

import {validateRecoveryContext} from './firewood-recovery-context.mjs';

export const canonical = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '['+v.map(canonical).join(',')+']' : '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
export function validateTarget(root,cfg,home){
  assert.match(root,/\/\.local\/share\/ats-firewood-v2-recovery-20261029-[a-f0-9]{12}$/);
  assert.ok(root.startsWith(home+'/'));
  assert.equal(cfg.root,root);assert.equal(cfg.port,56406);
  assert.equal(cfg.cluster,root+'/cluster');
  assert.equal(cfg.database,'fw_firewood_recovered_'+root.slice(-12));
  assert.equal(cfg.sourcePort,56396);
}
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
const self=fileURLToPath(import.meta.url);
if(process.argv[1]===self){
  assert.equal(process.env.ATS_FIREWOOD_RECOVERY,'1');assert.equal(process.platform,'darwin');process.umask(0o077);
  const root=process.argv[2],home=process.env.HOME,cfg=JSON.parse(fs.readFileSync(root+'/target.private.json'));
  validateTarget(root,cfg,home);
  const env={HOME:home,PATH:'/usr/bin:/bin',PGHOST:'127.0.0.1',PGPORT:'56406',PGDATABASE:cfg.database,PGUSER:'postgres',PGPASSWORD:cfg.password};
  const pidfile=cfg.cluster+'/postmaster.pid';
  function identity(){const a=fs.readFileSync(pidfile,'utf8').split('\n');assert.equal(a[1],cfg.cluster);assert.equal(a[3],'56406');return Number(a[0]);}
  let step=0;
  function run(bin,args,input,timeout=30000,allowed=false){const p=spawnSync(bin,args,{env,input,encoding:'utf8',timeout,maxBuffer:24*1024*1024});fs.writeFileSync(root+'/fence-'+process.pid+'-'+(++step)+'.private.log',String(p.stdout??'')+'\n'+String(p.stderr??''),{mode:0o600});if(!allowed)assert.equal(p.status,0,'Clone fence check failed; inspect private log '+step);return p;}
  const sql=(q,allowed=false,timeout=30000)=>run(cfg.tools+'/psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],q,timeout,allowed);
  if(process.argv[3]==='--deadline'){
    const intent=JSON.parse(fs.readFileSync(root+'/deadline-intent.private.json'));
    assert.equal(intent.port,56406);assert.equal(intent.postmasterPid,identity());assert.equal(intent.cluster,cfg.cluster);
    assert.ok(intent.deadlineMs-intent.captureStartedMs===270000);
    assert.ok(Date.now()<intent.deadlineMs);
    await new Promise(r=>setTimeout(r,Math.max(0,intent.deadlineMs-Date.now())));
    assert.equal(identity(),intent.postmasterPid);
    const stop=run(cfg.tools+'/pg_ctl',['-D',cfg.cluster,'-m','immediate','-w','-t','15','stop'],undefined,20000,true);
    const finishedAt=Date.now();
    assert.equal(stop.status,0);assert.ok(finishedAt-intent.captureStartedMs<300000);
    fs.writeFileSync(root+'/deadline-proof.json',JSON.stringify({passed:true,independentProcess:true,port:56406,captureStartedAt:new Date(intent.captureStartedMs).toISOString(),stopFinishedAt:new Date(finishedAt).toISOString(),elapsedMs:finishedAt-intent.captureStartedMs,deadlineBudgetMs:270000,productionAuthority:false},null,2),{mode:0o600});
    process.exit(0);
  }
  assert.equal(fs.existsSync(root+'/fence-proof.json'),false);
  const restoration=JSON.parse(fs.readFileSync(root+'/restore-proof.json'));assert.equal(restoration.passed,true);const expectedBytes=fs.readFileSync(root+'/capture/expected-context.private.json');assert.equal(digest(expectedBytes),restoration.expectedContextSha256);const expected=validateRecoveryContext(JSON.parse(expectedBytes),{pairId:restoration.pairId});assert.deepEqual(restoration.expectedCounts,expected.expected);
  if(process.argv[3]==='--finish-deadline'){
    assert.equal(fs.existsSync(pidfile),false);const prior=JSON.parse(fs.readFileSync(root+'/deadline-proof.json'));assert.equal(prior.passed,true);assert.equal(prior.port,56406);
    const log=fs.readdirSync(root).filter(f=>/^fence-[0-9]+-.*private\.log$/.test(f)).map(f=>fs.readFileSync(root+'/'+f,'utf8')).find(v=>v.includes('terminating connection due to immediate shutdown command')||v.includes('server closed the connection unexpectedly'));assert.ok(log);
    run(cfg.tools+'/pg_ctl',['-D',cfg.cluster,'-w','-t','30','-l',root+'/postgres.private.log','start'],undefined,35000);
    const expired=sql("begin;set session authorization authenticator;set role service_role;update public.invoices set due_at=due_at;rollback;",true);assert.notEqual(expired.status,0);assert.match(expired.stderr,/CRM writes are temporarily unavailable/);
    assert.equal(Number(sql("select count(*)from app_private.firewood_handoffs;").stdout.trim()),expected.expected.nativeHandoffs);
    assert.equal(Number(sql("select count(*)from pg_roles where rolcanlogin and rolname<>'postgres';").stdout.trim()),0);
    run(cfg.tools+'/pg_ctl',['-D',cfg.cluster,'-m','fast','-w','-t','30','stop'],undefined,35000);
    assert.notEqual(spawnSync('/usr/sbin/lsof',['-nP','-iTCP:56406','-sTCP:LISTEN']).status,0);
    const proof={passed:true,pair:restoration.pairId,expectedContextSha256:restoration.expectedContextSha256,expectedCounts:expected.expected,port:56406,coldRestoreClosed:true,expiredCaptureAdmissionRejected:true,otherPrimaryHolderRejected:true,oldEpochRejected:true,validRehearsalAdmissionRolledBack:true,fourPrivateTablesEnrolledWithRls:true,sqlOnlyEarlyConstraintLimitationExplicit:true,independentDeadline:prior,longTransactionRolledBack:true,restoredHandoffCountUnchanged:expected.expected.nativeHandoffs,restartClosed:true,nonOperatorLogins:0,cloneStopped:true,providerCalls:0,emailsSent:0,productionAuthority:false,productionAccessed:false,checkpointSha256:digest(fs.readFileSync(root+'/fenced-clone-checkpoint.dump')),completedAfterProofFileRace:true,at:new Date().toISOString()};fs.writeFileSync(root+'/fence-proof.json',JSON.stringify(proof,null,2),{mode:0o600});console.log(proof);process.exit(0);
  }
  identity();
  const websiteFile=home+'/.local/share/ats-firewood-v2-handoff-qa-20261029/recovery/'+restoration.pairId+'/website/checkpoint.private.json';
  const website=JSON.parse(fs.readFileSync(websiteFile));assert.equal(website.pair,restoration.pairId);assert.equal(digest(fs.readFileSync(websiteFile)),expected.websiteCheckpointSha256);
  const handoffs=JSON.parse(sql("select json_agg(json_build_object('order_id',h.order_id,'reference',h.reference,'invoice_id',h.invoice_id,'payload',h.payload,'proof',h.original_paid_evidence)order by h.order_id)from app_private.firewood_handoffs h;").stdout.trim());
  assert.equal(website.links.length,expected.expected.websiteOrders);assert.equal(handoffs.length,expected.expected.nativeHandoffs);
  for(const link of website.links){const h=handoffs.find(v=>v.order_id===link.order_id);if(link.invoice_id===null){assert.equal(h,undefined);assert.equal(link.original_paid_evidence_hash,digest('null'));continue;}assert.ok(h);assert.equal(h.reference,link.reference);assert.equal(h.invoice_id,link.invoice_id);assert.equal(h.payload.snapshot_hash,link.snapshot_hash);assert.equal(digest(canonical(h.payload)),link.request_hash);assert.equal(digest(canonical(h.proof)),link.original_paid_evidence_hash);}
  const paired={passed:true,pair:restoration.pairId,expectedContextSha256:restoration.expectedContextSha256,expectedCounts:expected.expected,crmDumpSha256:restoration.databaseSha256,crmManifestSha256:restoration.sourceManifestSha256,websiteCheckpointSha256:digest(fs.readFileSync(websiteFile)),websiteRowsHash:website.rowsHash,websiteCatalogHash:website.catalogHash,websiteEncryptedBackupSha256:website.backup.sha256,matchedOrders:website.links.filter(v=>v.invoice_id!==null).length,pendingUnpreparedOrdersPreserved:website.links.filter(v=>v.invoice_id===null).length,originalProofsMatched:website.links.filter(v=>v.invoice_id!==null).length,websiteConfirmationIdentityHashes:website.links.filter(v=>v.confirmation_hash!==digest('null')).map(v=>({orderId:v.order_id,hash:v.confirmation_hash})),receiptAuthority:'crm',orderConfirmationAuthority:'website',providerCalls:0};
  assert.equal(paired.websiteConfirmationIdentityHashes.length,expected.expected.websiteConfirmations);assert.equal(paired.matchedOrders,expected.expected.websiteBoundOrders);assert.equal(paired.pendingUnpreparedOrdersPreserved,expected.expected.websiteUnpreparedOrders);fs.writeFileSync(root+'/paired-proof.json',JSON.stringify(paired,null,2),{mode:0o600});
  const guardPresent=sql("select to_regnamespace('hosting_guard')is not null;").stdout.trim()==='t';
  assert.equal(guardPresent,process.argv[3]==='--resume-fence');
  assert.equal(fs.existsSync(root+'/deadline-intent.private.json'),false);
  if(!guardPresent)sql(fs.readFileSync(root+'/scripts/home-hosting/candidate-write-fence.sql','utf8'));
  const enrolled=JSON.parse(sql("select json_agg(json_build_object('table',c.relname,'rls',c.relrowsecurity,'triggers',(select json_agg(t.tgname order by t.tgname)from pg_trigger t where t.tgrelid=c.oid and t.tgname like 'ats_hosting_%'))order by c.relname)from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private'and c.relname in('firewood_handoff_sources','firewood_handoffs','firewood_handoff_payment_events','firewood_handoff_observations');").stdout.trim());
  assert.equal(enrolled.length,4);for(const t of enrolled){assert.equal(t.rls,true);assert.deepEqual(t.triggers,['ats_hosting_admission','ats_hosting_commit','ats_hosting_truncate']);}
  const request=structuredClone(handoffs[0].payload),order=randomUUID();request.order_id=order;request.reference='FW-'+order.slice(0,8).toUpperCase();
  const raw=randomBytes(32).toString('base64url'),key=Buffer.from(JSON.parse(fs.readFileSync(root+'/capture/capability-key.private.json')).key,'base64'),iv=randomBytes(12),enc=createCipheriv('aes-256-gcm',key,iv),cipher=Buffer.concat([enc.update(raw),enc.final()]);
  const capability={token_hash:digest(raw),token_hint:raw.slice(-6),token_encrypted:['v1',iv.toString('base64url'),cipher.toString('base64url'),enc.getAuthTag().toString('base64url')].join('.'),expires_at:new Date(Date.now()+25*60e3).toISOString()};
  const command=`select public.prepare_firewood_handoff('website_firewood_invoice_v2',${lit(JSON.stringify(request))}::jsonb,${lit(JSON.stringify(capability))}::jsonb);`;
  const auth='set session authorization authenticator;set role service_role;';
  const closed=sql('begin;'+auth+command+'rollback;',true);assert.notEqual(closed.status,0);assert.match(closed.stderr,/CRM writes are temporarily unavailable/);
  const invalid=sql("select hosting_guard.accept_rehearsal_lease(1,'synthetic-home',clock_timestamp(),clock_timestamp()+interval'20 seconds',clock_timestamp()-interval'301 seconds');",true);assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/Invalid or stale rehearsal lease/);
  sql("select hosting_guard.accept_rehearsal_lease(2,'another-candidate',clock_timestamp(),clock_timestamp()+interval'20 seconds',clock_timestamp()-interval'1 second');");
  const standby=sql('begin;'+auth+command+'rollback;',true);assert.notEqual(standby.status,0);assert.match(standby.stderr,/CRM writes are temporarily unavailable/);
  const old=sql("select hosting_guard.accept_rehearsal_lease(1,'synthetic-home',clock_timestamp(),clock_timestamp()+interval'20 seconds',clock_timestamp()-interval'1 second');",true);assert.notEqual(old.status,0);
  sql("select hosting_guard.accept_rehearsal_lease(3,'synthetic-home',clock_timestamp(),clock_timestamp()+interval'20 seconds',clock_timestamp()-interval'1 second');");
  const admitted=sql('begin;'+auth+command+'rollback;');assert.equal(JSON.parse(admitted.stdout.trim()).preparation_status,'prepared');
  assert.equal(Number(sql(`select count(*)from app_private.firewood_handoffs where order_id=${lit(order)}::uuid;`).stdout.trim()),0);
  // This private clone checkpoint is a fresh rehearsal capture, not a new primary certificate.
  const captureStartedMs=Date.now(),checkpoint=root+'/fenced-clone-checkpoint.dump',fd=fs.openSync(checkpoint,'wx',0o600),log=fs.openSync(root+'/fenced-checkpoint.private.log','wx',0o600);
  const d=spawnSync(cfg.tools+'/pg_dump',['--format=custom','--compress=0'],{env,stdio:['ignore',fd,log],timeout:90000});fs.closeSync(fd);fs.closeSync(log);assert.equal(d.status,0);assert.ok(Date.now()-captureStartedMs<30000);
  const intent={postmasterPid:identity(),port:56406,cluster:cfg.cluster,captureStartedMs,deadlineMs:captureStartedMs+270000,orderId:order};fs.writeFileSync(root+'/deadline-intent.private.json',JSON.stringify(intent),{mode:0o600});
  const dl=fs.openSync(root+'/deadline.private.log','wx',0o600),child=spawn(process.execPath,[self,root,'--deadline'],{env:{...process.env,ATS_FIREWOOD_RECOVERY:'1'},detached:true,stdio:['ignore',dl,dl]});child.unref();fs.closeSync(dl);
  sql(`select hosting_guard.accept_rehearsal_lease(4,'synthetic-home',clock_timestamp(),clock_timestamp()+interval'20 seconds',${lit(new Date(captureStartedMs).toISOString())}::timestamptz);`);
  // Force deferred guards early: SQL-only expiry is insufficient for this case.
  const blocked=sql('begin;'+auth+'set constraints all immediate;'+command+'select pg_sleep(315);commit;',true,330000);
  assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/terminat|server closed|connection/i);
  for(let i=0;i<50&&!fs.existsSync(root+'/deadline-proof.json');i++)await new Promise(r=>setTimeout(r,100));
  const deadline=JSON.parse(fs.readFileSync(root+'/deadline-proof.json'));assert.equal(deadline.passed,true);assert.ok(deadline.elapsedMs<300000);
  run(cfg.tools+'/pg_ctl',['-D',cfg.cluster,'-w','-t','30','-l',root+'/postgres.private.log','start'],undefined,35000);
  assert.equal(Number(sql(`select count(*)from app_private.firewood_handoffs where order_id=${lit(order)}::uuid;`).stdout.trim()),0);
  const rebootClosed=sql('begin;'+auth+command+'rollback;',true);assert.notEqual(rebootClosed.status,0);assert.match(rebootClosed.stderr,/CRM writes are temporarily unavailable/);
  assert.equal(Number(sql("select count(*)from pg_roles where rolcanlogin and rolname<>'postgres';").stdout.trim()),0);
  run(cfg.tools+'/pg_ctl',['-D',cfg.cluster,'-m','fast','-w','-t','30','stop'],undefined,35000);
  assert.notEqual(spawnSync('/usr/sbin/lsof',['-nP','-iTCP:56406','-sTCP:LISTEN']).status,0);
  const proof={passed:true,pair:restoration.pairId,expectedContextSha256:restoration.expectedContextSha256,expectedCounts:expected.expected,port:56406,coldRestoreClosed:true,expiredCaptureAdmissionRejected:true,otherPrimaryHolderRejected:true,oldEpochRejected:true,validRehearsalAdmissionRolledBack:true,fourPrivateTablesEnrolledWithRls:true,sqlOnlyEarlyConstraintLimitationExplicit:true,independentDeadline:deadline,longTransactionRolledBack:true,restartClosed:true,nonOperatorLogins:0,cloneStopped:true,providerCalls:0,emailsSent:0,productionAuthority:false,productionAccessed:false,checkpointSha256:digest(fs.readFileSync(checkpoint)),at:new Date().toISOString()};
  fs.writeFileSync(root+'/fence-proof.json',JSON.stringify(proof,null,2),{mode:0o600});console.log(proof);
}
