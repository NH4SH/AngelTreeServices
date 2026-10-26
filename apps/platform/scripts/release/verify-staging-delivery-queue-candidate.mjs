// Read-only maintenance for the installed 126 target. No installation path.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,mkdtempSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifySources as priorSources,canonical,sha,parseArgs,stagingRef,root} from './verify-staging-record-delivery-candidate.mjs';
export {canonical,sha,parseArgs,stagingRef,root};
const read=path=>readFileSync(new URL(path,root));
const changedKeys=['routine|public.list_outbound_deliveries(p_all boolean, p_id uuid, p_page integer)','routine|public.list_pending_customer_source_events(p_page integer)'];
export const orderedIndexes=[
 {kind:'index',key:'app_private.customer_source_events_pending_order',value:{ready:true,valid:true,definition:'CREATE INDEX customer_source_events_pending_order ON app_private.customer_source_events USING btree (event_order, id) WHERE (prepared_activity_id IS NULL)'}},
 {kind:'index',key:'app_private.outbound_deliveries_attention_order',value:{ready:true,valid:true,definition:"CREATE INDEX outbound_deliveries_attention_order ON app_private.outbound_deliveries USING btree (created_at DESC, id DESC) WHERE ((repair_state <> 'complete'::text) OR followup_sync_pending OR (delivery_status = ANY (ARRAY['bounced'::text, 'complained'::text, 'failed'::text, 'suppressed'::text])))"}},
 {kind:'index',key:'app_private.outbound_deliveries_queue_order',value:{ready:true,valid:true,definition:'CREATE INDEX outbound_deliveries_queue_order ON app_private.outbound_deliveries USING btree (created_at DESC, id DESC)'}},
];
const key=x=>x.kind+'|'+x.key;
function changes(c){
 assert.deepEqual(c.readerChanges.map(x=>key(x.after)).sort(),changedKeys);
 for(const x of c.readerChanges){
  assert.equal(key(x.before),key(x.after));
  const {bodyHash:oldHash,bodyWhitespaceHash:oldWhite,...before}=x.before.value;
  const {bodyHash:newHash,bodyWhitespaceHash:newWhite,...after}=x.after.value;
  for(const h of [oldHash,oldWhite,newHash,newWhite])assert.match(h,/^[a-f0-9]{32}$/);
  assert.notEqual(oldHash,newHash);assert.deepEqual(after,before,'Only reader body hashes may change.');
  assert.equal(after.owner,'postgres');assert.equal(after.definer,true);assert.equal(after.volatility,'s');assert.equal(after.language,'plpgsql');assert.equal(after.returns,'jsonb');assert.deepEqual(after.config,['search_path=""']);
  assert.deepEqual(after.acl.map(a=>[a.grantee,a.grantor,a.privilege,a.grantable]),[['authenticated','postgres','EXECUTE',false],['postgres','postgres','EXECUTE',false]],'Reader execution rights changed.');
 }
}
export function verifySources(c,reader=read,inventory=readdirSync(new URL('supabase/migrations/',root)).filter(x=>x.endsWith('.sql')).sort()){
 const prior=priorSources(JSON.parse(reader('supabase/staging/record-delivery-candidate-125.json')),reader,inventory);
 assert.equal(c.version,1);assert.equal(c.projectRef,stagingRef);assert.equal(c.previousMigrationCount,125);assert.equal(c.expectedMigrationCount,126);assert.equal(c.productionReady,false);assert.equal(c.deployed,false);
 assert.deepEqual(c.migrations.slice(0,125),prior.migrations);
 assert.equal(c.previousLedgerPrefixSha256,prior.previousLedgerSha256);assert.deepEqual(c.previousLastMigration,prior.expectedLastMigration);
 for(const [next,previous]of [['identity','identity'],['previousCatalog','expectedCatalog'],['expectedApprovalSha256','expectedApprovalSha256'],['expectedDocumentTerms','expectedDocumentTerms'],['protectedStateSha256','protectedStateSha256']])assert.deepEqual(c[next],prior[previous],'Prior checkpoint protection changed: '+next);
 const pinned=c.migrations.map(x=>x.name);assert.equal(pinned.length,126);assert.equal(pinned.at(-1),'20261026003309_deterministic_delivery_review_paging.sql');
 const later=inventory.filter(name=>!pinned.includes(name)),deferred=JSON.parse(reader('supabase/staging/deferred-migrations.json'));assert.equal(deferred.readyForHosting,false);
 for(const name of later){const entry=deferred.migrations.find(x=>x.name===name);assert.ok(name>pinned.at(-1)&&entry,'Unreviewed later migration.');assert.equal(sha(reader('supabase/migrations/'+name)),entry.sha256);}
 assert.deepEqual(inventory,[...pinned,...later].sort(),'Migration inventory changed.');
 for(const f of c.migrations)assert.equal(sha(reader('supabase/migrations/'+f.name)),f.sha256,'Migration bytes changed: '+f.name);
 assert.equal(sha(reader('supabase/staging/delivery-queue-snapshot-126.sql')),c.snapshotSqlSha256,'Snapshot changed.');
 assert.equal(sha(reader('supabase/staging/record-delivery-candidate-125.json')),c.previousCandidateSha256,'Previous checkpoint changed.');changes(c);
 const bodies=new Map([...reader('supabase/migrations/'+pinned.at(-1)).toString().matchAll(/create or replace function public\.(\w+)\([^]*?as \$\$([^]*?)\$\$;/g)].map(x=>[x[1],x[2]]));assert.equal(bodies.size,2);
 for(const x of c.readerChanges){const name=x.after.key.slice('public.'.length).split('(')[0],body=bodies.get(name);assert.equal(typeof body,'string');assert.equal(x.after.value.bodyHash,createHash('md5').update(body).digest('hex'),'Reader body is not the reviewed source.');assert.equal(x.after.value.bodyWhitespaceHash,createHash('md5').update(body.replace(/\s+/g,' ')).digest('hex'));}
 return c;
}
export function verifyEvidence(e,c,now=Date.now()){
 changes(c);assert.equal(e.projectRef,stagingRef);assert.ok(Number.isFinite(e.observedAt)&&e.observedAt<=now&&now-e.observedAt<=900000,'Fresh evidence required.');assert.deepEqual(e.identity,c.identity,'Physical staging identity changed.');assert.equal(e.ledger.length,126);
 assert.deepEqual(e.ledger.map(x=>({version:x.version,name:x.name})),c.migrations.map(f=>{const i=f.name.indexOf('_');return{version:f.name.slice(0,i),name:f.name.slice(i+1,-4)};}),'Exact migration identities required.');
 assert.equal(sha(canonical(e.ledger.slice(0,125))),c.previousLedgerSha256,'Original native history changed.');assert.deepEqual(e.ledger.at(-1),c.expectedLastMigration,'Native migration 126 statements changed.');
 assert.equal(sha(canonical(e.ledger.slice(0,124))),c.previousLedgerPrefixSha256);assert.deepEqual(e.ledger[124],c.previousLastMigration,'Original migration 125 changed.');
 assert.equal(new Set(e.catalog.map(key)).size,e.catalog.length,'Duplicate catalog object.');
 assert.deepEqual({count:e.catalog.length,sha256:sha(canonical(e.catalog))},c.expectedCatalog,'Full catalog or permissions changed.');
 for(const x of orderedIndexes)assert.deepEqual(e.catalog.find(y=>key(x)===key(y)),x,'Ordered index definition, readiness or validity changed.');
 const by=new Map(c.readerChanges.map(x=>[key(x.after),x]));for(const x of c.readerChanges)assert.deepEqual(e.catalog.find(y=>key(y)===key(x.after)),x.after,'Reader body or security metadata changed.');
 const added=new Set(orderedIndexes.map(key));const old=e.catalog.filter(x=>!added.has(key(x))).map(x=>by.get(key(x))?.before??x);
 assert.deepEqual({count:old.length,sha256:sha(canonical(old))},c.previousCatalog,'Prior schema, RLS, readers or permissions changed.');
 assert.equal(e.approvalSha256,c.expectedApprovalSha256);assert.deepEqual(e.documentTerms,c.expectedDocumentTerms);
 assert.equal(sha(canonical({records:e.records,settings:e.settings,recurringSettings:e.recurringSettings,guard:e.guard})),c.protectedStateSha256,'Protected business/Auth/history/settings changed.');
 assert.equal(e.settings.automated_sending_enabled,false);assert.equal(e.settings.appointment_change_notices_enabled,false);assert.equal(e.recurringSettings.automated_generation_enabled,false);
 return{projectRef:stagingRef,migrationCount:126,latestMigration:'20261026003309',catalogObjects:e.catalog.length,originalLedgerAndProtectedStatePreserved:true,onlyTwoReaderBodiesAndThreeOrderedIndexes:true,readOnly:true,productionReady:false};
}
function run(){
 const args=process.argv.slice(2);if(args.length===1&&args[0]==='--help'){console.log('verify-staging-delivery-queue-candidate.mjs --project-ref gbyhdsuiqeslgjdnbqng [--print-sql]\nRead-only; exact migration 126, original native history, full catalog/ACLs, two reader bodies and ordered indexes, protected state/terms/guard and OFF automation. No installation, repair, deployment or keys.');return;}
 const mode=parseArgs(args),c=verifySources(JSON.parse(read('supabase/staging/delivery-queue-candidate-126.json'))),sql=read('supabase/staging/delivery-queue-snapshot-126.sql').toString();if(mode.printSql){console.log(sql);return;}
 const directory=mkdtempSync(join(tmpdir(),'ats-staging126-verify-')),file=join(directory,'snapshot.sql');writeFileSync(file,sql,{mode:0o600});
 const r=spawnSync(process.env.STAGING_SUPABASE_BIN||'supabase',['db','query','--linked','--project-ref',stagingRef,'--file',file,'--workdir',directory,'--output-format','json'],{encoding:'utf8',timeout:60000,maxBuffer:40*1024*1024,stdio:['ignore','pipe','pipe']});
 writeFileSync(join(directory,'response.private.log'),(r.stdout??'')+'\n'+(r.stderr??''),{mode:0o600});assert.equal(r.status,0,'Read-only staging query failed; inspect '+directory);
 const data=JSON.parse(r.stdout),row=Array.isArray(data)?data[0]:data.rows[0],e={projectRef:stagingRef,observedAt:Date.now(),...row.evidence},result=verifyEvidence(e,c);writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,evidenceDirectory:directory},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{run();}catch(e){console.error(e.message);process.exitCode=1;}}
