// Local operator metadata is not a certificate or write permit. Independent
// authority registration and its ordinary signed native receipt remain required.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {assertVerifiedRecoveryPolicy,bindRecoveryOperationalPolicy,extensionOperationPlan,legacyOperationPlan,NEW_TABLES,PROFILE_ROLES,BASE_SERVICES,NEW_SERVICES,FIXED_HELPERS,bytesSha256,policySha256,assertLegacySourceCompatibility} from './recovery-operational-policy.mjs';
const pins=JSON.parse(fs.readFileSync(new URL('./recovery-source-pins.json',import.meta.url)));
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const verifiedBindings=new Map();
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export class ExplicitObserverUnavailable extends Error{constructor(){super('Reviewed continuous semantic/guard/owner-ACL/document-family observer is not installed');this.name='ExplicitObserverUnavailable';}}
export function collectReviewedRecoveryEvidence(){throw new ExplicitObserverUnavailable();}
export function rememberVerifiedRecoveryProfile(profile){assertVerifiedRecoveryPolicy(profile);verifiedBindings.set(canonical(profile.binding),profile);return profile;}
export function recoveryProfileFor(binding,profile){
 const extended=Object.hasOwn(binding??{},'installationOverlaySha256');
 if(!extended){assert.equal(profile,undefined,'An extended profile cannot relabel a legacy binding');return null;}
 profile??=verifiedBindings.get(canonical(binding));assertVerifiedRecoveryPolicy(profile);
 assert.deepEqual(binding,profile.binding,'Registered expected binding mismatch');return profile;
}
export function recoveryArtifactNames(binding,profile,{objects=false}={}){
 const p=recoveryProfileFor(binding,profile);return [...(objects?['objects.tar']:[]),'db-config.tar','core.private.env','app.private.env','release-source.tar.gz','runtime.private.json',...(p?p.policy.privateConfigurations.map(f=>f.name):[])];
}
export function recoveryPlan(binding,profile,readiness=null){const p=recoveryProfileFor(binding,profile);return p?extensionOperationPlan(p,readiness):legacyOperationPlan();}
export function fenceServicesForBinding(binding){
 const extended=Object.hasOwn(binding??{},'installationOverlaySha256')||NEW_SERVICES.some(s=>Object.hasOwn(binding?.containers??{},s));
 const names=extended?[...BASE_SERVICES,...NEW_SERVICES]:[...BASE_SERVICES];
 assert.deepEqual(Object.keys(binding.containers).sort(),[...names].sort());for(const n of names)assert.match(binding.containers[n],/^[a-f0-9]{64}$/);return names;
}
function boundedMetadata(file,maximum=32768){
 assert.equal(fs.realpathSync('/home/noelsierra.guest/primary'),'/home/noelsierra.guest/primary');
 assert.ok(file.startsWith('/home/noelsierra.guest/primary/'));
 let at='/';for(const part of file.split('/').filter(Boolean)){at=at==='/'?at+part:at+'/'+part;assert.equal(fs.lstatSync(at).isSymbolicLink(),false);}
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const st=fs.fstatSync(fd);assert.ok(st.isFile()&&st.uid===501&&(st.mode&0o777)===0o600&&st.size>0&&st.size<=maximum);return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
const pinFields=['installationOverlaySha256','registeredExpectedBindingSha256','operationalPolicySha256','sourceApprovalSha256','authorityPublicKeyFingerprint','authorityRegistryDefinitionSha256','semanticSchemaSha256','guardEnrollmentSha256','ownerAclSha256','releaseComponentDigest','documentFamilySha256','baselineInventorySha256','baselineCaptureInventorySha256','operativeHelpersSha256'];
export function validateOperatorRecoverySelection(metadata,expectedPins){
 assert.equal(expectedPins?.kind,'ats-installed-recovery-source-pins-v1');assert.equal(expectedPins.state,'registered-source-reviewed');
 assert.deepEqual(Object.keys(metadata??{}).sort(),['kind','version','state',...pinFields,'registeredExpectedBindingBase64','baseContainers'].sort());
 assert.equal(metadata?.kind,'ats-firewood-release-recovery-approval-v1');assert.equal(metadata.version,1);assert.equal(metadata.state,'independently-registered-source-readback');
 for(const name of pinFields){assert.ok(hash(expectedPins[name]),'UNBOUND source pin: '+name);assert.equal(metadata[name],expectedPins[name],'Unapproved source pin: '+name);}
 const raw=Buffer.from(metadata.registeredExpectedBindingBase64??'','base64');assert.equal(raw.toString('base64'),metadata.registeredExpectedBindingBase64);assert.ok(raw.length>0&&raw.length<=8192);assert.equal(bytesSha256(raw),expectedPins.registeredExpectedBindingSha256);
 const binding=JSON.parse(raw);assert.equal(binding.installationOverlaySha256,expectedPins.installationOverlaySha256);assert.equal(binding.sourceScope,'crm-v1');assert.equal(binding.sourceMigrationCount,102);
 return {binding,bindingBytes:raw,expectedApproval:{kind:'ats-approved-firewood-live25-overlay-v1',...Object.fromEntries(pinFields.map(k=>[k,expectedPins[k]])),bindingSha256:expectedPins.registeredExpectedBindingSha256,baseContainers:metadata.baseContainers}};
}
export function readInstalledRecoverySelection(){
 assert.equal(pins.operatorApprovalPath,'/home/noelsierra.guest/primary/firewood-release-approval.json');
 if(!fs.existsSync(pins.operatorApprovalPath))return null;
 const selection=validateOperatorRecoverySelection(JSON.parse(boundedMetadata(pins.operatorApprovalPath)),pins);
 const root='/home/noelsierra.guest/primary/recovery-approved/';
 const overlayBytes=boundedMetadata(root+pins.installationOverlaySha256+'.json');
 const policyBytes=boundedMetadata(root+pins.operationalPolicySha256+'.json');
 assert.equal(bytesSha256(boundedMetadata('/home/noelsierra.guest/primary/source-approval.private.json')),pins.sourceApprovalSha256);
 return {...selection,overlayBytes,policyBytes};
}
export function operativeHelperDigests(){
 // These are actual local bytes. Expected hashes come only from independently
 // approved source pins, never from this observation or an archive claim.
 return Object.fromEntries(Object.keys(FIXED_HELPERS).map(n=>[n,createHash('sha256').update(fs.readFileSync(new URL('./'+n,import.meta.url))).digest('hex')]));
}
export function basicRecoverySourceObservation(io){
 const result=JSON.parse(io.sql(`select jsonb_build_object('sourceMigrationCount',(select count(*)from supabase_migrations.schema_migrations),'fullLedgerMd5',(select md5(string_agg(to_jsonb(m)::text,'|'order by version))from supabase_migrations.schema_migrations m),'protectedTableNames',(select jsonb_agg(schemaname||'.'||tablename order by schemaname,tablename)from pg_tables where schemaname in('public','app_private','auth','storage')),'captureTableNames',(select jsonb_agg(schemaname||'.'||tablename order by schemaname,tablename)from pg_tables where schemaname in('public','app_private','auth','storage','supabase_migrations')),'roleNames',(select coalesce(jsonb_agg(rolname order by rolname),'[]')from pg_roles where rolname in('ats_firewood_request','ats_firewood_worker','ats_firewood_health')),'roles',(select coalesce(jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'super',r.rolsuper,'inherit',r.rolinherit,'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,'replication',r.rolreplication,'bypassRls',r.rolbypassrls,'memberships',(select coalesce(jsonb_agg(pg_get_userbyid(m.roleid)order by pg_get_userbyid(m.roleid)),'[]')from pg_auth_members m where m.member=r.oid))order by r.rolname),'[]')from pg_roles r where rolname in('ats_firewood_request','ats_firewood_worker','ats_firewood_health')));`));
 const rows=io.docker(['ps','-a','--filter','label=com.docker.compose.project='+io.project,'--format','{{json .}}']).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
 result.serviceNames=rows.map(r=>{const labels=r.Labels.split(',').map(x=>x.split('='));return labels.find(x=>x[0]==='com.docker.compose.service')?.[1];});
 assert.ok(result.serviceNames.every(Boolean));assert.equal(new Set(result.serviceNames).size,result.serviceNames.length);
 result.operativeHelpers=operativeHelperDigests();return result;
}
export function assertIORecoverySource(io,binding=io.productionBinding){
 const observed=basicRecoverySourceObservation(io);assert.equal(observed.sourceMigrationCount,102);assert.equal(observed.fullLedgerMd5,'630f8894ce3a5c50a947b8872ed8edf3');
 const selection=readInstalledRecoverySelection();
 const presence=Object.hasOwn(binding??{},'installationOverlaySha256')||observed.protectedTableNames.some(n=>NEW_TABLES.includes(n))||observed.roleNames.length>0||observed.serviceNames.some(s=>NEW_SERVICES.includes(s));
 if(selection||presence){
  assert.ok(selection,'No approved registered source selector; legacy fallback is forbidden');
  for(const name of ['environment','sourceId','namespace','sourceScope','sourceMigrationCount','captureMode','privateFileFormat','admissionProtocol'])assert.equal(binding?.[name],selection.binding[name],'Registered source identity mismatch: '+name);
  if(Object.hasOwn(binding??{},'generation'))assert.deepEqual(binding,selection.binding);
  const complete=collectReviewedRecoveryEvidence(io,observed,selection); // Explicitly unavailable until its reviewed source is supplied.
  assert.equal(complete.ownerAclSha256,selection.expectedApproval.ownerAclSha256,'Fresh owner/ACL postimage mismatch');
  const profile=rememberVerifiedRecoveryProfile(bindRecoveryOperationalPolicy({...selection,observed:complete}));io.recoveryProfile=profile;io.productionBinding=profile.binding;return profile;
 }
 assert.equal(observed.protectedTableNames.length,175);assert.deepEqual([...observed.serviceNames].sort(),[...BASE_SERVICES].sort());
 assert.ok(pins.legacy,'Exact original inventory/semantic legacy pins are UNBOUND');
 assertLegacySourceCompatibility({binding,observed:{...observed,...collectReviewedRecoveryEvidence(io,observed,{legacy:true})},expectedLegacy:pins.legacy});return null;
}
// A separate reviewed readiness adapter will bind actual root modes, receipt,
// boot, clock and service identities. No plain local flag can reopen role LOGIN.
export function readProfileServiceReadiness(){return null;}
export function verifyCapturedPrivateArtifacts(directory,binding,profile){
 const p=recoveryProfileFor(binding,profile);if(!p)return;
 for(const item of p.policy.privateConfigurations){const file=directory+'/'+item.name,st=fs.lstatSync(file);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.size===item.bytes&&(st.mode&0o777)===0o600);assert.equal(bytesSha256(fs.readFileSync(file)),item.sha256);}
}
export function copyApprovedPrivateArtifacts(io,directory){
 const p=recoveryProfileFor(io.productionBinding,io.recoveryProfile);if(!p)return;
 for(const item of p.policy.privateConfigurations){
  assert.ok(item.hostPath.startsWith(io.root+'/'));let at='/';for(const part of item.hostPath.split('/').filter(Boolean)){at=at==='/'?at+part:at+'/'+part;assert.equal(fs.lstatSync(at).isSymbolicLink(),false);}
  const before=fs.lstatSync(item.hostPath);assert.ok(before.isFile()&&before.uid===item.ownerUid&&(before.mode&0o777)===item.mode&&before.size===item.bytes);
  const data=fs.readFileSync(item.hostPath);assert.equal(bytesSha256(data),item.sha256);fs.writeFileSync(directory+'/'+item.name,data,{flag:'wx',mode:0o600});
  const after=fs.lstatSync(item.hostPath);assert.equal(after.ino,before.ino);assert.equal(after.dev,before.dev);assert.equal(after.mtimeMs,before.mtimeMs);assert.equal(after.size,before.size);assert.equal(after.uid,before.uid);assert.equal(after.mode,before.mode);assert.equal(bytesSha256(fs.readFileSync(item.hostPath)),item.sha256);
 }
 verifyCapturedPrivateArtifacts(directory,io.productionBinding,p);
}
// New sidecar public admission mounts need Root's actual reviewed mount recipe.
// Refusing them is safer than archiving and replaying old active permits.
export function reviewedNewAdmissionMount(){throw new ExplicitObserverUnavailable();}
export function assertManifestSourceInventory(database,binding,{verifiedProfile,legacyPins=pins.legacy}={}){
 if(binding?.environment!=='home-primary-v1')return;
 assert.ok(Array.isArray(database?.tables));const names=database.tables.map(r=>r.name);assert.equal(new Set(names).size,names.length);
 const protectedNames=names.filter(n=>/^(?:public|app_private|auth|storage)\./u.test(n));
 assert.ok(names.every(n=>/^(?:public|app_private|auth|storage|supabase_migrations)\.[A-Za-z_][A-Za-z0-9_$]*$/u.test(n)));
 assert.ok(names.includes('supabase_migrations.schema_migrations'),'The complete captured ledger inventory is mandatory');
 const profile=recoveryProfileFor(binding,verifiedProfile);
 if(profile){assert.deepEqual([...protectedNames].sort(),[...profile.policy.baselineTables,...profile.policy.newTables].sort());assert.deepEqual([...names].sort(),[...profile.policy.baselineCaptureTables,...profile.policy.newTables].sort());return;}
 assert.equal(protectedNames.length,175,'No protected-table count relaxation for legacy source');assert.ok(!names.some(n=>NEW_TABLES.includes(n)));
 assert.ok(hash(legacyPins?.baselineInventorySha256)&&hash(legacyPins?.baselineCaptureInventorySha256),'Exact registered legacy protected and capture inventories are UNBOUND');
 assert.equal(policySha256([...protectedNames].sort()),legacyPins.baselineInventorySha256);
 assert.equal(policySha256([...names].sort()),legacyPins.baselineCaptureInventorySha256);
}

// Separate supervised DEV entry points. Existing installed HOME selection and
// readiness remain closed; DEV evidence cannot enter the HOME profile cache.
export {openSupervisedDevRecoveryApproval,createSupervisedDevRecoveryIO,collectSupervisedDevRecoveryEvidence,observeExactRecoveryDisk,reviewedSupervisedDevAdmissionMount,validateSupervisedRecoveryReceipt,assertSupervisedDevEvidence} from './supervised-dev-recovery-adapters.mjs';
